/* global L */

const DB_NAME = "torpnotes-local";
const DB_VERSION = 1;
const STORE_NAME = "workspace";
const STATE_KEY = "current";
const EXPORT_VERSION = 2;
const DEFAULT_SCALE = 0.05;

const DEFAULT_LEVELS = [
  { id: "site", name: "Mark", nominalZ: null },
  { id: "basement", name: "Källare", nominalZ: null },
  { id: "ground", name: "Bottenvåning", nominalZ: null },
  { id: "upper", name: "Övervåning", nominalZ: null }
];

const CATEGORIES = [
  { id: "electricity", name: "El" },
  { id: "water", name: "Vatten" },
  { id: "construction", name: "Konstruktion" },
  { id: "animals", name: "Djur" },
  { id: "forest", name: "Skog" },
  { id: "other", name: "Övrigt" }
];

const STATUSES = [
  { id: "info", name: "Info" },
  { id: "todo", name: "Att göra" },
  { id: "done", name: "Klart" }
];

let workspace = createEmptyWorkspace();
let map;
let activeLevelId = "site";
let activeTool = "select";
let activeSessionId = null;
let mapImageLayers = new Map();
let mapObjectLayers = new Map();
let draftGeometry = [];
let draftLayer = null;
let pendingObject = null;
let editingAttachments = [];
let attachmentUrls = [];
let vertexHandles = [];
let geometryEdit = null;
let calibration = null;
let calibrationMarkers = [];
let moveLayerState = null;
let movePointerHandlers = null;
let readingPlacement = null;
let filterState = { statuses: new Set(), categories: new Set() };
let toastTimer = null;
const elements = {};

const RotatedImageLayer = L.Layer.extend({
  initialize(layerData) {
    this.data = layerData;
    this.url = URL.createObjectURL(layerData.blob);
  },
  onAdd(targetMap) {
    this.map = targetMap;
    this.image = L.DomUtil.create("img", "torp-image-layer");
    this.image.alt = "";
    this.image.src = this.url;
    this.image.style.position = "absolute";
    this.image.style.transformOrigin = "0 0";
    this.image.style.width = `${this.data.width}px`;
    this.image.style.height = `${this.data.height}px`;
    this.image.style.opacity = String(this.data.opacity);
    this.image.style.pointerEvents = "none";
    this.image.style.zIndex = String(this.data.order || 0);
    targetMap.getPanes().overlayPane.appendChild(this.image);
    targetMap.on("zoom viewreset move", this.update, this);
    this.update();
  },
  onRemove(targetMap) {
    targetMap.off("zoom viewreset move", this.update, this);
    this.image?.remove();
    URL.revokeObjectURL(this.url);
  },
  update() {
    if (!this.map || !this.image) return;
    const [topLeft, topRight, bottomLeft] = layerControlPoints(this.data);
    const tl = this.map.latLngToLayerPoint([topLeft.y, topLeft.x]);
    const tr = this.map.latLngToLayerPoint([topRight.y, topRight.x]);
    const bl = this.map.latLngToLayerPoint([bottomLeft.y, bottomLeft.x]);
    const a = (tr.x - tl.x) / this.data.width;
    const b = (tr.y - tl.y) / this.data.width;
    const c = (bl.x - tl.x) / this.data.height;
    const d = (bl.y - tl.y) / this.data.height;
    this.image.style.transform = `matrix(${a},${b},${c},${d},${tl.x},${tl.y})`;
  }
});

document.addEventListener("DOMContentLoaded", () => {
  bindElements();
  initializeMap();
  bindEvents();
  initialize().catch((error) => {
    console.error(error);
    showToast("Kunde inte öppna den lokala databasen.");
  });
});

async function initialize() {
  const saved = await dbGet(STATE_KEY);
  if (saved) workspace = normalizeWorkspace(saved);
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => false);
  populateStaticChoices();
  await renderAll(true);
  registerServiceWorker();
}

function bindElements() {
  const ids = [
    "property-name-button", "storage-state", "empty-map", "empty-import-button", "level-bar",
    "layer-button", "filter-button", "fit-map-button", "draw-actions", "cancel-draw-button",
    "finish-draw-button", "map-hint", "layer-panel", "close-layer-panel", "layer-list",
    "add-layer-button", "object-panel-level", "item-count", "active-filters", "object-list",
    "new-session-button", "session-list", "session-count", "measure-detail", "property-name-input",
    "save-property-button", "export-button", "import-button", "clear-button", "object-dialog",
    "object-form", "object-kind-label", "object-dialog-title", "object-id", "object-title",
    "object-note", "category-choices", "object-level", "object-z", "object-z-source", "object-color",
    "object-image-input", "attachment-grid", "delete-object-button", "edit-geometry-button",
    "layer-dialog", "layer-form", "layer-dialog-title", "layer-id", "layer-file-field",
    "layer-file-input", "layer-name", "layer-level", "layer-scale", "layer-rotation", "layer-opacity",
    "layer-x", "layer-y", "layer-locked", "layer-scale-note", "delete-layer-button",
    "move-layer-button", "calibrate-layer-button", "calibration-dialog", "calibration-form",
    "calibration-summary", "calibration-distance", "filter-dialog", "filter-form", "filter-statuses",
    "filter-categories", "clear-filters-button", "session-dialog", "session-form", "session-name",
    "fix-name", "fix-height", "fix-reading", "instrument-preview", "photo-dialog", "photo-close",
    "photo-full", "import-file-input", "toast"
  ];
  ids.forEach((id) => { elements[toCamel(id)] = document.getElementById(id); });
}

function bindEvents() {
  document.querySelectorAll(".tab").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
  document.querySelectorAll("[data-tool]").forEach((button) => button.addEventListener("click", () => setTool(button.dataset.tool)));
  elements.propertyNameButton.addEventListener("click", () => switchView("data"));
  elements.emptyImportButton.addEventListener("click", () => openLayerDialog());
  elements.layerButton.addEventListener("click", () => elements.layerPanel.classList.toggle("hidden"));
  elements.closeLayerPanel.addEventListener("click", () => elements.layerPanel.classList.add("hidden"));
  elements.addLayerButton.addEventListener("click", () => openLayerDialog());
  elements.fitMapButton.addEventListener("click", fitVisible);
  elements.cancelDrawButton.addEventListener("click", cancelMapAction);
  elements.finishDrawButton.addEventListener("click", finishMapAction);
  elements.objectForm.addEventListener("submit", handleObjectSubmit);
  elements.objectImageInput.addEventListener("change", addObjectImages);
  elements.deleteObjectButton.addEventListener("click", deleteCurrentObject);
  elements.editGeometryButton.addEventListener("click", beginGeometryEdit);
  elements.layerForm.addEventListener("submit", handleLayerSubmit);
  elements.deleteLayerButton.addEventListener("click", deleteCurrentLayer);
  elements.calibrateLayerButton.addEventListener("click", beginCalibration);
  elements.moveLayerButton.addEventListener("click", beginLayerMove);
  elements.calibrationForm.addEventListener("submit", applyCalibration);
  elements.filterButton.addEventListener("click", openFilterDialog);
  elements.filterForm.addEventListener("submit", applyFilters);
  elements.clearFiltersButton.addEventListener("click", clearFilters);
  elements.newSessionButton.addEventListener("click", openSessionDialog);
  elements.sessionForm.addEventListener("submit", handleSessionSubmit);
  elements.fixHeight.addEventListener("input", updateInstrumentPreview);
  elements.fixReading.addEventListener("input", updateInstrumentPreview);
  elements.savePropertyButton.addEventListener("click", savePropertyName);
  elements.exportButton.addEventListener("click", exportWorkspace);
  elements.importButton.addEventListener("click", () => elements.importFileInput.click());
  elements.importFileInput.addEventListener("change", importWorkspace);
  elements.clearButton.addEventListener("click", clearWorkspace);
  elements.photoClose.addEventListener("click", () => elements.photoDialog.close());
}

function initializeMap() {
  map = L.map("map", {
    crs: L.CRS.Simple,
    minZoom: -6,
    maxZoom: 12,
    zoomSnap: 0.25,
    zoomControl: true,
    attributionControl: false,
    doubleClickZoom: false
  });
  map.setView([0, 0], 0);
  map.on("click", handleMapClick);
  map.on("dblclick", () => {
    if (activeTool === "line" || activeTool === "polygon") finishMapAction();
  });
}

function populateStaticChoices() {
  elements.categoryChoices.innerHTML = CATEGORIES.map((category) => `<label><input data-object-category="${category.id}" type="checkbox"><span>${category.name}</span></label>`).join("");
  elements.filterStatuses.innerHTML = STATUSES.map((status) => `<label><input data-filter-status="${status.id}" type="checkbox"><span>${status.name}</span></label>`).join("");
  elements.filterCategories.innerHTML = CATEGORIES.map((category) => `<label><input data-filter-category="${category.id}" type="checkbox"><span>${category.name}</span></label>`).join("");
}

async function renderAll(fit = false) {
  renderProperty();
  renderLevels();
  renderMapLayers();
  renderMapObjects();
  renderLayerList();
  renderObjectList();
  renderSessions();
  renderMeasureDetail();
  elements.emptyMap.classList.toggle("hidden", workspace.layers.length > 0);
  if (fit) window.setTimeout(fitVisible, 0);
}

function renderProperty() {
  const name = workspace.property.name || "Namnlös gård";
  elements.propertyNameButton.textContent = name;
  elements.propertyNameInput.value = workspace.property.name || "";
}

function renderLevels() {
  if (!workspace.levels.some((level) => level.id === activeLevelId)) activeLevelId = workspace.levels[0]?.id || "site";
  elements.levelBar.innerHTML = workspace.levels.map((level) => `<button class="${level.id === activeLevelId ? "active" : ""}" data-level-id="${escapeHtml(level.id)}" type="button">${escapeHtml(level.name)}</button>`).join("");
  elements.levelBar.querySelectorAll("[data-level-id]").forEach((button) => button.addEventListener("click", () => {
    activeLevelId = button.dataset.levelId;
    cancelMapAction();
    renderLevels();
    renderMapLayers();
    renderMapObjects();
    renderObjectList();
  }));
  const options = workspace.levels.map((level) => `<option value="${escapeHtml(level.id)}">${escapeHtml(level.name)}</option>`).join("");
  elements.objectLevel.innerHTML = options;
  elements.layerLevel.innerHTML = options;
  elements.objectPanelLevel.textContent = levelName(activeLevelId);
}

function renderMapLayers() {
  mapImageLayers.forEach((layer) => layer.remove());
  mapImageLayers = new Map();
  visibleLayers().sort((a, b) => (a.order || 0) - (b.order || 0)).forEach((layerData) => {
    if (!(layerData.blob instanceof Blob)) return;
    const layer = new RotatedImageLayer(layerData).addTo(map);
    mapImageLayers.set(layerData.id, layer);
  });
}

function renderLayerList() {
  const layers = [...workspace.layers].sort((a, b) => (b.order || 0) - (a.order || 0));
  if (!layers.length) {
    elements.layerList.innerHTML = '<p class="listEmpty">Inga bildlager ännu.</p>';
    return;
  }
  elements.layerList.innerHTML = layers.map((layer) => `
    <div class="layerRow ${layer.visible ? "" : "hiddenLayer"}">
      <label class="layerVisibility" title="Visa eller dölj"><input data-layer-visible="${escapeHtml(layer.id)}" ${layer.visible ? "checked" : ""} type="checkbox"></label>
      <div class="layerMeta"><strong>${escapeHtml(layer.name)}</strong><small>${escapeHtml(levelName(layer.levelId))} · ${formatScale(layer.metersPerPixel)}${layer.scaleEstimated ? " · ungefärlig" : ""}${layer.locked ? " · låst" : ""}</small></div>
      <button class="layerEdit" data-layer-edit="${escapeHtml(layer.id)}" type="button">Ändra</button>
    </div>`).join("");
  elements.layerList.querySelectorAll("[data-layer-visible]").forEach((input) => input.addEventListener("change", async () => {
    const layer = workspace.layers.find((candidate) => candidate.id === input.dataset.layerVisible);
    if (!layer) return;
    layer.visible = input.checked;
    await saveWorkspace();
    renderMapLayers();
    renderLayerList();
  }));
  elements.layerList.querySelectorAll("[data-layer-edit]").forEach((button) => button.addEventListener("click", () => openLayerDialog(workspace.layers.find((layer) => layer.id === button.dataset.layerEdit))));
}

function renderMapObjects() {
  mapObjectLayers.forEach((layer) => layer.remove());
  mapObjectLayers = new Map();
  objectsForMap().forEach((item) => {
    const interactive = activeTool === "select";
    let layer;
    if (item.geometryType === "point") {
      const point = item.geometry[0];
      if (!point) return;
      layer = L.marker([point.y, point.x], { icon: markerIcon(item.status), keyboard: interactive, interactive, title: item.title });
    } else {
      const coordinates = item.geometry.map((point) => [point.y, point.x]);
      const style = objectStyle(item, interactive);
      layer = item.geometryType === "polygon" ? L.polygon(coordinates, style) : L.polyline(coordinates, style);
    }
    layer.addTo(map);
    if (interactive) layer.on("click", (event) => { L.DomEvent.stopPropagation(event); openObjectDialog(item); });
    layer.bindTooltip(item.title, { direction: "top", offset: [0, -8] });
    mapObjectLayers.set(item.id, layer);
  });
}

function filteredObjects() {
  return workspace.items.filter((item) => {
    if (item.levelId !== activeLevelId) return false;
    if (filterState.statuses.size && !filterState.statuses.has(item.status)) return false;
    if (filterState.categories.size && !item.categories.some((category) => filterState.categories.has(category))) return false;
    return true;
  });
}

function objectsForMap() {
  const objects = filteredObjects();
  if (!["moveLayer", "calibrate"].includes(activeTool) || activeLevelId === "site") return objects;
  const references = workspace.items.filter((item) => item.levelId === "site" && !objects.some((candidate) => candidate.id === item.id));
  return objects.concat(references);
}

function renderObjectList() {
  const items = filteredObjects().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  elements.itemCount.textContent = String(items.length);
  const filterLabels = [...filterState.statuses].map(statusLabel).concat([...filterState.categories].map(categoryName));
  elements.activeFilters.classList.toggle("hidden", !filterLabels.length);
  elements.activeFilters.textContent = filterLabels.length ? `Filter: ${filterLabels.join(", ")}` : "";
  if (!items.length) {
    elements.objectList.innerHTML = '<p class="listEmpty">Inga objekt på detta plan med nuvarande filter.</p>';
    return;
  }
  elements.objectList.innerHTML = items.map((item) => `
    <button class="objectRow" data-item-id="${escapeHtml(item.id)}" type="button">
      <span class="geometryBadge">${geometrySymbol(item.geometryType)}</span><span class="statusMarker ${escapeHtml(item.status)}"></span>
      <span class="rowText"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(statusLabel(item.status))}${item.categories.length ? ` · ${item.categories.map(categoryName).join(", ")}` : ""}${Number.isFinite(item.z) ? ` · z ${formatNumber(item.z)}` : ""}</small></span>
    </button>`).join("");
  elements.objectList.querySelectorAll("[data-item-id]").forEach((button) => button.addEventListener("click", () => {
    const item = workspace.items.find((candidate) => candidate.id === button.dataset.itemId);
    if (!item) return;
    zoomToObject(item);
    openObjectDialog(item);
  }));
}

function renderSessions() {
  elements.sessionCount.textContent = String(workspace.measurements.length);
  if (!workspace.measurements.length) {
    elements.sessionList.innerHTML = '<p class="listEmpty">Inga mätningar ännu.</p>';
    return;
  }
  if (!activeSessionId || !workspace.measurements.some((session) => session.id === activeSessionId)) activeSessionId = workspace.measurements[0].id;
  elements.sessionList.innerHTML = workspace.measurements.map((session) => `<button class="sessionRow ${session.id === activeSessionId ? "active" : ""}" data-session-id="${escapeHtml(session.id)}" type="button"><span class="rowText"><strong>${escapeHtml(session.name)}</strong><small>${escapeHtml(session.fixName)} · ${session.readings.length} punkter</small></span></button>`).join("");
  elements.sessionList.querySelectorAll("[data-session-id]").forEach((button) => button.addEventListener("click", () => {
    activeSessionId = button.dataset.sessionId;
    renderSessions();
    renderMeasureDetail();
  }));
}

function renderMeasureDetail() {
  const session = workspace.measurements.find((candidate) => candidate.id === activeSessionId);
  if (!session) {
    elements.measureDetail.innerHTML = '<div class="emptyState"><h2>Ingen mätning vald</h2><p>Skapa en mätning och etablera instrumentet mot en känd eller antagen fixhöjd.</p></div>';
    return;
  }
  elements.measureDetail.innerHTML = `
    <div class="sessionSummary"><div><span class="eyebrow">${formatDate(session.createdAt)}</span><h2>${escapeHtml(session.name)}</h2><p>${escapeHtml(session.fixName)} ${formatMeters(session.fixHeight)} + avläsning ${formatMeters(session.fixReading)}</p></div><div class="instrumentCard"><small>Instrumenthöjd</small><strong>${formatMeters(session.instrumentHeight)}</strong></div></div>
    <form class="readingForm" id="reading-form"><label>Punkt<input id="reading-name" maxlength="60" placeholder="H345" required type="text"></label><label>Stångavläsning (m)<input id="staff-reading" inputmode="decimal" placeholder="4,740" required type="text"></label><button class="primaryButton" type="submit">Lägg till</button></form>
    ${session.readings.length ? `<table class="readingTable"><thead><tr><th>Punkt</th><th>Avläsning</th><th>Höjd</th><th>Tid</th><th>Karta</th><th></th></tr></thead><tbody>${session.readings.map((reading) => `<tr><td><strong>${escapeHtml(reading.name)}</strong></td><td class="number">${formatMeters(reading.staffReading)}</td><td class="number">${formatMeters(reading.height)}</td><td>${formatTime(reading.createdAt)}</td><td><button class="tableAction" data-reading-map="${escapeHtml(reading.id)}" type="button">${reading.itemId ? "Visa" : "Placera"}</button></td><td><button class="iconButton" data-delete-reading="${escapeHtml(reading.id)}" aria-label="Radera avläsning" type="button">×</button></td></tr>`).join("")}</tbody></table>` : '<p class="listEmpty">Mata in den första punktens stångavläsning ovan.</p>'}
  `;
  document.getElementById("reading-form").addEventListener("submit", addReading);
  elements.measureDetail.querySelectorAll("[data-delete-reading]").forEach((button) => button.addEventListener("click", () => deleteReading(button.dataset.deleteReading)));
  elements.measureDetail.querySelectorAll("[data-reading-map]").forEach((button) => button.addEventListener("click", () => handleReadingMap(session.id, button.dataset.readingMap)));
}

function handleMapClick(event) {
  const point = { x: event.latlng.lng, y: event.latlng.lat };
  if (activeTool === "point") {
    pendingObject = { geometryType: "point", geometry: [point] };
    openObjectDialog();
    return;
  }
  if (activeTool === "line" || activeTool === "polygon") {
    draftGeometry.push(point);
    renderDraft();
    return;
  }
  if (activeTool === "calibrate") {
    addCalibrationPoint(point);
    return;
  }
  if (activeTool === "placeReading") {
    placeReadingPoint(point);
  }
}

function setTool(tool) {
  if (["point", "line", "polygon"].includes(tool) && !workspace.layers.length) {
    showToast("Lägg till ett bildlager först.");
    return;
  }
  clearTransientMapState();
  activeTool = tool;
  document.querySelectorAll("[data-tool]").forEach((button) => button.classList.toggle("active", button.dataset.tool === tool));
  const drawing = tool === "line" || tool === "polygon";
  elements.drawActions.classList.toggle("hidden", !drawing);
  elements.finishDrawButton.disabled = true;
  elements.mapHint.classList.toggle("hidden", tool === "select");
  elements.mapHint.textContent = tool === "point" ? "Tryck där punkten ska ligga." : tool === "line" ? "Tryck ut linjens brytpunkter och välj Klar." : tool === "polygon" ? "Tryck ut områdets hörn och välj Klar." : "";
  map.getContainer().style.cursor = tool === "select" ? "grab" : "crosshair";
  renderMapObjects();
}

function renderDraft() {
  if (draftLayer) draftLayer.remove();
  const coordinates = draftGeometry.map((point) => [point.y, point.x]);
  if (activeTool === "polygon" && coordinates.length > 1) draftLayer = L.polygon(coordinates, { color: "#b34c3d", fillOpacity: 0.15, dashArray: "6 4", interactive: false }).addTo(map);
  else draftLayer = L.polyline(coordinates, { color: "#b34c3d", weight: 3, dashArray: "6 4", interactive: false }).addTo(map);
  elements.finishDrawButton.disabled = activeTool === "polygon" ? draftGeometry.length < 3 : draftGeometry.length < 2;
}

function finishMapAction() {
  if (geometryEdit) {
    finishGeometryEdit(true);
    return;
  }
  if (moveLayerState) {
    finishLayerMove(true);
    return;
  }
  if ((activeTool === "line" && draftGeometry.length >= 2) || (activeTool === "polygon" && draftGeometry.length >= 3)) {
    pendingObject = { geometryType: activeTool, geometry: draftGeometry.map(copyPoint) };
    openObjectDialog();
  }
}

function cancelMapAction() {
  if (geometryEdit) finishGeometryEdit(false);
  else if (moveLayerState) finishLayerMove(false);
  else {
    clearTransientMapState();
    activeTool = "select";
    syncToolUi();
    renderMapObjects();
  }
}

function clearTransientMapState() {
  if (draftLayer) draftLayer.remove();
  draftLayer = null;
  draftGeometry = [];
  clearCalibrationMarkers();
  calibration = null;
  readingPlacement = null;
}

function syncToolUi() {
  document.querySelectorAll("[data-tool]").forEach((button) => button.classList.toggle("active", button.dataset.tool === activeTool));
  elements.drawActions.classList.toggle("hidden", !["line", "polygon", "edit", "moveLayer"].includes(activeTool));
  elements.mapHint.classList.toggle("hidden", activeTool === "select");
  map.getContainer().style.cursor = activeTool === "select" ? "grab" : "crosshair";
}

function openObjectDialog(item = null) {
  const source = item || pendingObject;
  if (!source) return;
  releaseAttachmentUrls();
  elements.objectForm.reset();
  elements.objectId.value = item?.id || "";
  elements.objectTitle.value = item?.title || "";
  elements.objectNote.value = item?.note || "";
  elements.objectLevel.value = item?.levelId || activeLevelId;
  elements.objectZ.value = Number.isFinite(item?.z) ? formatInputNumber(item.z) : "";
  elements.objectZSource.value = item?.zSource || "unknown";
  elements.objectColor.value = item?.color || "#356b8c";
  document.querySelector(`input[name="object-status"][value="${item?.status || "info"}"]`).checked = true;
  const categories = new Set(item?.categories || []);
  elements.categoryChoices.querySelectorAll("[data-object-category]").forEach((input) => { input.checked = categories.has(input.dataset.objectCategory); });
  editingAttachments = (item?.attachments || []).map((attachment) => ({ ...attachment }));
  elements.objectKindLabel.textContent = geometryLabel(source.geometryType);
  elements.objectDialogTitle.textContent = item ? item.title : `Nytt ${geometryLabel(source.geometryType).toLowerCase()}`;
  elements.deleteObjectButton.classList.toggle("hidden", !item);
  elements.editGeometryButton.classList.toggle("hidden", !item);
  renderAttachments();
  elements.objectDialog.showModal();
  window.setTimeout(() => elements.objectTitle.focus(), 0);
}

async function handleObjectSubmit(event) {
  event.preventDefault();
  if (event.submitter?.value === "cancel") {
    elements.objectDialog.close();
    pendingObject = null;
    setTool("select");
    return;
  }
  if (!elements.objectForm.reportValidity()) return;
  const existing = workspace.items.find((item) => item.id === elements.objectId.value);
  const source = existing || pendingObject;
  if (!source) return;
  const z = parseDecimal(elements.objectZ.value);
  const item = {
    ...source,
    id: existing?.id || newId(),
    title: elements.objectTitle.value.trim(),
    note: elements.objectNote.value.trim(),
    status: document.querySelector('input[name="object-status"]:checked').value,
    categories: [...elements.categoryChoices.querySelectorAll("[data-object-category]:checked")].map((input) => input.dataset.objectCategory),
    levelId: elements.objectLevel.value,
    z: Number.isFinite(z) ? z : null,
    zSource: Number.isFinite(z) ? elements.objectZSource.value : "unknown",
    color: elements.objectColor.value,
    attachments: editingAttachments,
    relations: existing?.relations || [],
    createdAt: existing?.createdAt || nowIso(),
    updatedAt: nowIso()
  };
  if (existing) workspace.items = workspace.items.map((candidate) => candidate.id === item.id ? item : candidate);
  else workspace.items.push(item);
  elements.objectDialog.close();
  releaseAttachmentUrls();
  pendingObject = null;
  activeLevelId = item.levelId;
  setTool("select");
  await saveWorkspace("Objektet är sparat.");
  renderLevels();
  renderMapObjects();
  renderObjectList();
}

async function deleteCurrentObject() {
  const id = elements.objectId.value;
  const item = workspace.items.find((candidate) => candidate.id === id);
  if (!item || !window.confirm(`Radera ${item.title}?`)) return;
  workspace.items = workspace.items.filter((candidate) => candidate.id !== id);
  workspace.measurements.forEach((session) => session.readings.forEach((reading) => { if (reading.itemId === id) reading.itemId = null; }));
  elements.objectDialog.close();
  await saveWorkspace("Objektet är raderat.");
  renderMapObjects();
  renderObjectList();
  renderMeasureDetail();
}

async function addObjectImages() {
  const files = [...elements.objectImageInput.files];
  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    editingAttachments.push({ id: newId(), name: file.name, type: file.type, blob: file, createdAt: nowIso() });
  }
  elements.objectImageInput.value = "";
  renderAttachments();
}

function renderAttachments() {
  releaseAttachmentUrls();
  if (!editingAttachments.length) {
    elements.attachmentGrid.innerHTML = '<p class="formNote">Inga bilder.</p>';
    return;
  }
  elements.attachmentGrid.innerHTML = editingAttachments.map((attachment) => {
    const url = URL.createObjectURL(attachment.blob);
    attachmentUrls.push(url);
    return `<div class="attachmentTile"><button data-view-attachment="${escapeHtml(attachment.id)}" type="button"><img alt="${escapeHtml(attachment.name)}" src="${url}"></button><button class="attachmentRemove" data-remove-attachment="${escapeHtml(attachment.id)}" aria-label="Ta bort bild" type="button">×</button></div>`;
  }).join("");
  elements.attachmentGrid.querySelectorAll("[data-view-attachment]").forEach((button) => button.addEventListener("click", () => showPhoto(editingAttachments.find((attachment) => attachment.id === button.dataset.viewAttachment))));
  elements.attachmentGrid.querySelectorAll("[data-remove-attachment]").forEach((button) => button.addEventListener("click", () => {
    editingAttachments = editingAttachments.filter((attachment) => attachment.id !== button.dataset.removeAttachment);
    renderAttachments();
  }));
}

function showPhoto(attachment) {
  if (!attachment?.blob) return;
  const url = URL.createObjectURL(attachment.blob);
  elements.photoFull.src = url;
  elements.photoFull.alt = attachment.name || "Objektbild";
  elements.photoDialog.showModal();
  elements.photoDialog.addEventListener("close", () => { URL.revokeObjectURL(url); elements.photoFull.removeAttribute("src"); }, { once: true });
}

function releaseAttachmentUrls() {
  attachmentUrls.forEach((url) => URL.revokeObjectURL(url));
  attachmentUrls = [];
}

function beginGeometryEdit() {
  const item = workspace.items.find((candidate) => candidate.id === elements.objectId.value);
  if (!item) return;
  elements.objectDialog.close();
  geometryEdit = { itemId: item.id, original: item.geometry.map(copyPoint) };
  activeTool = "edit";
  elements.drawActions.classList.remove("hidden");
  elements.finishDrawButton.disabled = false;
  elements.mapHint.textContent = "Dra de röda handtagen. Välj Klar när formen stämmer.";
  elements.mapHint.classList.remove("hidden");
  map.getContainer().style.cursor = "default";
  renderMapObjects();
  createVertexHandles(item);
}

function createVertexHandles(item) {
  clearVertexHandles();
  item.geometry.forEach((point, index) => {
    const handle = L.marker([point.y, point.x], { draggable: true, icon: L.divIcon({ className: "vertexHandle", iconSize: [16, 16], iconAnchor: [8, 8] }), zIndexOffset: 1000 }).addTo(map);
    handle.on("drag", (event) => {
      const latLng = event.target.getLatLng();
      item.geometry[index] = { x: latLng.lng, y: latLng.lat };
      const objectLayer = mapObjectLayers.get(item.id);
      if (item.geometryType === "point") objectLayer?.setLatLng(latLng);
      else objectLayer?.setLatLngs(item.geometry.map((candidate) => [candidate.y, candidate.x]));
    });
    vertexHandles.push(handle);
  });
}

async function finishGeometryEdit(save) {
  const item = workspace.items.find((candidate) => candidate.id === geometryEdit?.itemId);
  if (item && !save) item.geometry = geometryEdit.original.map(copyPoint);
  if (item && save) { item.updatedAt = nowIso(); await saveWorkspace("Formen är sparad."); }
  geometryEdit = null;
  clearVertexHandles();
  activeTool = "select";
  syncToolUi();
  renderMapObjects();
  renderObjectList();
}

function clearVertexHandles() {
  vertexHandles.forEach((handle) => handle.remove());
  vertexHandles = [];
}

function openLayerDialog(layer = null) {
  elements.layerPanel.classList.add("hidden");
  elements.layerForm.reset();
  elements.layerId.value = layer?.id || "";
  elements.layerDialogTitle.textContent = layer ? layer.name : "Nytt lager";
  elements.layerFileField.classList.toggle("hidden", Boolean(layer));
  elements.layerFileInput.required = !layer;
  elements.layerName.value = layer?.name || "";
  elements.layerLevel.value = layer?.levelId || activeLevelId;
  elements.layerScale.value = formatInputNumber(layer?.metersPerPixel ?? DEFAULT_SCALE);
  elements.layerRotation.value = formatInputNumber(layer?.rotation ?? 0);
  elements.layerOpacity.value = String(layer?.opacity ?? 0.85);
  elements.layerX.value = formatInputNumber(layer?.x ?? 0);
  elements.layerY.value = formatInputNumber(layer?.y ?? 0);
  elements.layerLocked.checked = layer?.locked ?? true;
  elements.layerScaleNote.textContent = layer?.scaleEstimated ? "Skalan är ungefärlig. Kalibrera mot ett känt avstånd." : "Skalan är kalibrerad eller manuellt angiven.";
  elements.deleteLayerButton.classList.toggle("hidden", !layer);
  elements.calibrateLayerButton.classList.toggle("hidden", !layer);
  elements.moveLayerButton.classList.toggle("hidden", !layer);
  elements.layerDialog.showModal();
}

async function handleLayerSubmit(event) {
  event.preventDefault();
  if (event.submitter?.value === "cancel") { elements.layerDialog.close(); return; }
  if (!elements.layerForm.reportValidity()) return;
  const existing = workspace.layers.find((layer) => layer.id === elements.layerId.value);
  let blob = existing?.blob;
  let dimensions = existing ? { width: existing.width, height: existing.height } : null;
  if (!existing) {
    const file = elements.layerFileInput.files[0];
    if (!file) return;
    blob = file;
    dimensions = await imageDimensions(file);
  }
  const scale = parseDecimal(elements.layerScale.value);
  const x = parseDecimal(elements.layerX.value);
  let y = parseDecimal(elements.layerY.value);
  if (!existing && y === 0) y = dimensions.height * scale;
  if (![scale, x, y].every(Number.isFinite) || scale <= 0) { showToast("Kontrollera lagrets mått och position."); return; }
  const layer = {
    id: existing?.id || newId(),
    name: elements.layerName.value.trim(),
    levelId: elements.layerLevel.value,
    blob,
    mimeType: blob.type,
    width: dimensions.width,
    height: dimensions.height,
    metersPerPixel: scale,
    scaleEstimated: existing ? existing.scaleEstimated && scale === existing.metersPerPixel : true,
    x,
    y,
    rotation: parseDecimal(elements.layerRotation.value) || 0,
    opacity: Number(elements.layerOpacity.value),
    visible: existing?.visible ?? true,
    locked: elements.layerLocked.checked,
    order: existing?.order ?? workspace.layers.length,
    createdAt: existing?.createdAt || nowIso(),
    updatedAt: nowIso()
  };
  if (existing) workspace.layers = workspace.layers.map((candidate) => candidate.id === layer.id ? layer : candidate);
  else workspace.layers.push(layer);
  activeLevelId = layer.levelId;
  elements.layerDialog.close();
  await saveWorkspace("Lagret är sparat.");
  renderLevels();
  renderMapLayers();
  renderLayerList();
  elements.emptyMap.classList.add("hidden");
  fitVisible();
}

async function deleteCurrentLayer() {
  const id = elements.layerId.value;
  const layer = workspace.layers.find((candidate) => candidate.id === id);
  if (!layer || !window.confirm(`Radera lagret ${layer.name}? Kartobjekten ligger kvar.`)) return;
  workspace.layers = workspace.layers.filter((candidate) => candidate.id !== id);
  elements.layerDialog.close();
  await saveWorkspace("Lagret är raderat.");
  renderMapLayers();
  renderLayerList();
  elements.emptyMap.classList.toggle("hidden", workspace.layers.length > 0);
}

function beginCalibration() {
  const layer = workspace.layers.find((candidate) => candidate.id === elements.layerId.value);
  if (!layer) return;
  elements.layerDialog.close();
  activeLevelId = layer.levelId;
  calibration = { layerId: layer.id, points: [] };
  activeTool = "calibrate";
  renderLevels();
  renderMapLayers();
  renderMapObjects();
  elements.drawActions.classList.remove("hidden");
  elements.finishDrawButton.disabled = true;
  elements.mapHint.textContent = "Tryck på två punkter i lagret med ett känt avstånd.";
  elements.mapHint.classList.remove("hidden");
  map.getContainer().style.cursor = "crosshair";
}

function addCalibrationPoint(point) {
  const layer = workspace.layers.find((candidate) => candidate.id === calibration?.layerId);
  if (!layer || !pointInsideLayer(layer, point)) { showToast("Välj en punkt inne i lagret."); return; }
  calibration.points.push(point);
  calibrationMarkers.push(L.marker([point.y, point.x], { icon: L.divIcon({ className: "calibrationPoint", iconSize: [18,18], iconAnchor: [9,9] }), interactive: false }).addTo(map));
  if (calibration.points.length === 2) {
    const pixelA = worldToImagePixel(layer, calibration.points[0]);
    const pixelB = worldToImagePixel(layer, calibration.points[1]);
    calibration.pixelDistance = Math.hypot(pixelB.x - pixelA.x, pixelB.y - pixelA.y);
    calibration.anchorPixel = pixelA;
    calibration.anchorWorld = calibration.points[0];
    elements.calibrationSummary.textContent = `Det markerade avståndet motsvarar ${Math.round(calibration.pixelDistance)} bildpunkter. Ange det verkliga avståndet.`;
    elements.calibrationDistance.value = "";
    elements.calibrationDialog.showModal();
  }
}

async function applyCalibration(event) {
  event.preventDefault();
  if (event.submitter?.value === "cancel") { elements.calibrationDialog.close(); cancelMapAction(); return; }
  const distance = parseDecimal(elements.calibrationDistance.value);
  const layer = workspace.layers.find((candidate) => candidate.id === calibration?.layerId);
  if (!layer || !Number.isFinite(distance) || distance <= 0 || !calibration.pixelDistance) return;
  const scale = distance / calibration.pixelDistance;
  const radians = degreesToRadians(layer.rotation);
  const px = calibration.anchorPixel.x;
  const py = calibration.anchorPixel.y;
  layer.x = calibration.anchorWorld.x - (Math.cos(radians) * px + Math.sin(radians) * py) * scale;
  layer.y = calibration.anchorWorld.y - (Math.sin(radians) * px - Math.cos(radians) * py) * scale;
  layer.metersPerPixel = scale;
  layer.scaleEstimated = false;
  layer.updatedAt = nowIso();
  elements.calibrationDialog.close();
  clearCalibrationMarkers();
  calibration = null;
  activeTool = "select";
  syncToolUi();
  await saveWorkspace("Skalan är kalibrerad.");
  renderMapLayers();
  renderLayerList();
}

function clearCalibrationMarkers() {
  calibrationMarkers.forEach((marker) => marker.remove());
  calibrationMarkers = [];
}

function beginLayerMove() {
  const layer = workspace.layers.find((candidate) => candidate.id === elements.layerId.value);
  if (!layer) return;
  elements.layerDialog.close();
  activeLevelId = layer.levelId;
  moveLayerState = { layerId: layer.id, original: { x: layer.x, y: layer.y, opacity: layer.opacity } };
  layer.opacity = Math.min(layer.opacity, 0.62);
  activeTool = "moveLayer";
  renderLevels();
  renderMapLayers();
  renderMapObjects();
  enableDirectLayerDrag(layer);
  elements.drawActions.classList.remove("hidden");
  elements.finishDrawButton.disabled = false;
  elements.mapHint.textContent = "Dra direkt i ritningen. Underliggande lager och markpunkter visas som referens.";
  elements.mapHint.classList.remove("hidden");
}

async function finishLayerMove(save) {
  const layer = workspace.layers.find((candidate) => candidate.id === moveLayerState?.layerId);
  disableDirectLayerDrag();
  if (layer && !save) Object.assign(layer, moveLayerState.original);
  if (layer && save) {
    layer.opacity = moveLayerState.original.opacity;
    layer.updatedAt = nowIso();
    await saveWorkspace("Lagrets position är sparad.");
  }
  moveLayerState = null;
  activeTool = "select";
  syncToolUi();
  renderMapLayers();
  renderLayerList();
  renderMapObjects();
}

function enableDirectLayerDrag(layer) {
  disableDirectLayerDrag();
  const container = map.getContainer();
  let drag = null;
  const worldPoint = (event) => {
    const latLng = map.containerPointToLatLng(map.mouseEventToContainerPoint(event));
    return { x: latLng.lng, y: latLng.lat };
  };
  const pointerDown = (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    const start = worldPoint(event);
    if (!pointInsideLayer(layer, start)) return;
    event.preventDefault();
    container.setPointerCapture?.(event.pointerId);
    drag = { start, x: layer.x, y: layer.y };
  };
  const pointerMove = (event) => {
    if (!drag) return;
    event.preventDefault();
    const current = worldPoint(event);
    layer.x = drag.x + current.x - drag.start.x;
    layer.y = drag.y + current.y - drag.start.y;
    mapImageLayers.get(layer.id)?.update();
  };
  const pointerUp = (event) => {
    if (!drag) return;
    container.releasePointerCapture?.(event.pointerId);
    drag = null;
  };
  movePointerHandlers = { container, pointerDown, pointerMove, pointerUp };
  map.dragging.disable();
  container.addEventListener("pointerdown", pointerDown);
  container.addEventListener("pointermove", pointerMove);
  container.addEventListener("pointerup", pointerUp);
  container.addEventListener("pointercancel", pointerUp);
}

function disableDirectLayerDrag() {
  if (!movePointerHandlers) return;
  const { container, pointerDown, pointerMove, pointerUp } = movePointerHandlers;
  container.removeEventListener("pointerdown", pointerDown);
  container.removeEventListener("pointermove", pointerMove);
  container.removeEventListener("pointerup", pointerUp);
  container.removeEventListener("pointercancel", pointerUp);
  map.dragging.enable();
  movePointerHandlers = null;
}

function openFilterDialog() {
  elements.filterStatuses.querySelectorAll("[data-filter-status]").forEach((input) => { input.checked = filterState.statuses.has(input.dataset.filterStatus); });
  elements.filterCategories.querySelectorAll("[data-filter-category]").forEach((input) => { input.checked = filterState.categories.has(input.dataset.filterCategory); });
  elements.filterDialog.showModal();
}

function applyFilters(event) {
  event.preventDefault();
  if (event.submitter?.value === "cancel") { elements.filterDialog.close(); return; }
  filterState.statuses = new Set([...elements.filterStatuses.querySelectorAll("[data-filter-status]:checked")].map((input) => input.dataset.filterStatus));
  filterState.categories = new Set([...elements.filterCategories.querySelectorAll("[data-filter-category]:checked")].map((input) => input.dataset.filterCategory));
  elements.filterDialog.close();
  renderMapObjects();
  renderObjectList();
}

function clearFilters() {
  elements.filterForm.querySelectorAll('input[type="checkbox"]').forEach((input) => { input.checked = false; });
}

function openSessionDialog() {
  elements.sessionForm.reset();
  elements.sessionName.value = `Mätning ${new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" }).format(new Date())}`;
  elements.fixHeight.value = "100,000";
  updateInstrumentPreview();
  elements.sessionDialog.showModal();
}

function updateInstrumentPreview() {
  const fixHeight = parseDecimal(elements.fixHeight.value);
  const fixReading = parseDecimal(elements.fixReading.value);
  elements.instrumentPreview.textContent = Number.isFinite(fixHeight) && Number.isFinite(fixReading) ? `Instrumenthöjd: ${formatMeters(fixHeight + fixReading)}` : "Instrumenthöjd visas här";
}

async function handleSessionSubmit(event) {
  event.preventDefault();
  if (event.submitter?.value === "cancel") { elements.sessionDialog.close(); return; }
  if (!elements.sessionForm.reportValidity()) return;
  const fixHeight = parseDecimal(elements.fixHeight.value);
  const fixReading = parseDecimal(elements.fixReading.value);
  if (![fixHeight, fixReading].every(Number.isFinite)) { showToast("Kontrollera höjderna."); return; }
  const session = { id: newId(), name: elements.sessionName.value.trim(), fixName: elements.fixName.value.trim(), fixHeight, fixReading, instrumentHeight: fixHeight + fixReading, readings: [], createdAt: nowIso(), updatedAt: nowIso() };
  workspace.measurements.unshift(session);
  activeSessionId = session.id;
  elements.sessionDialog.close();
  await saveWorkspace("Mätningen är startad.");
  renderSessions();
  renderMeasureDetail();
}

async function addReading(event) {
  event.preventDefault();
  const session = workspace.measurements.find((candidate) => candidate.id === activeSessionId);
  const nameInput = document.getElementById("reading-name");
  const readingInput = document.getElementById("staff-reading");
  const staffReading = parseDecimal(readingInput.value);
  if (!session || !nameInput.value.trim() || !Number.isFinite(staffReading)) return;
  session.readings.unshift({ id: newId(), name: nameInput.value.trim(), staffReading, height: session.instrumentHeight - staffReading, itemId: null, createdAt: nowIso() });
  session.updatedAt = nowIso();
  await saveWorkspace("Avläsningen är sparad.");
  renderSessions();
  renderMeasureDetail();
}

async function deleteReading(readingId) {
  const session = workspace.measurements.find((candidate) => candidate.id === activeSessionId);
  const reading = session?.readings.find((candidate) => candidate.id === readingId);
  if (!reading || !window.confirm("Radera den här avläsningen?")) return;
  if (reading.itemId) workspace.items = workspace.items.filter((item) => item.id !== reading.itemId);
  session.readings = session.readings.filter((candidate) => candidate.id !== readingId);
  session.updatedAt = nowIso();
  await saveWorkspace("Avläsningen är raderad.");
  renderSessions();
  renderMeasureDetail();
  renderMapObjects();
  renderObjectList();
}

function handleReadingMap(sessionId, readingId) {
  const session = workspace.measurements.find((candidate) => candidate.id === sessionId);
  const reading = session?.readings.find((candidate) => candidate.id === readingId);
  if (!reading) return;
  if (reading.itemId) {
    const item = workspace.items.find((candidate) => candidate.id === reading.itemId);
    if (item) { activeLevelId = item.levelId; switchView("map"); renderLevels(); renderMapLayers(); renderMapObjects(); renderObjectList(); zoomToObject(item); openObjectDialog(item); return; }
    reading.itemId = null;
  }
  readingPlacement = { sessionId, readingId };
  activeTool = "placeReading";
  switchView("map");
  elements.drawActions.classList.remove("hidden");
  elements.finishDrawButton.disabled = true;
  elements.mapHint.textContent = `Tryck där ${reading.name} ska placeras.`;
  elements.mapHint.classList.remove("hidden");
  map.getContainer().style.cursor = "crosshair";
  renderMapObjects();
}

async function placeReadingPoint(point) {
  const session = workspace.measurements.find((candidate) => candidate.id === readingPlacement?.sessionId);
  const reading = session?.readings.find((candidate) => candidate.id === readingPlacement?.readingId);
  if (!reading) return;
  const item = { id: newId(), title: reading.name, note: `Höjdpunkt från ${session.name}`, status: "info", categories: [], levelId: activeLevelId, z: reading.height, zSource: "measured", color: "#356b8c", geometryType: "point", geometry: [point], attachments: [], relations: [], createdAt: nowIso(), updatedAt: nowIso() };
  workspace.items.push(item);
  reading.itemId = item.id;
  session.updatedAt = nowIso();
  readingPlacement = null;
  activeTool = "select";
  syncToolUi();
  await saveWorkspace("Höjdpunkten är placerad.");
  renderMapObjects();
  renderObjectList();
  renderMeasureDetail();
  openObjectDialog(item);
}

async function savePropertyName() {
  workspace.property.name = elements.propertyNameInput.value.trim() || "Namnlös gård";
  workspace.property.updatedAt = nowIso();
  await saveWorkspace("Namnet är sparat.");
  renderProperty();
}

async function exportWorkspace() {
  try {
    const serialized = {
      ...workspace,
      layers: await Promise.all(workspace.layers.map(async (layer) => ({ ...layer, blob: undefined, dataUrl: await blobToDataUrl(layer.blob) }))),
      items: await Promise.all(workspace.items.map(async (item) => ({ ...item, attachments: await Promise.all(item.attachments.map(async (attachment) => ({ ...attachment, blob: undefined, dataUrl: await blobToDataUrl(attachment.blob) }))) })))
    };
    const payload = { format: "torpnotes", exportVersion: EXPORT_VERSION, exportedAt: nowIso(), workspace: serialized };
    const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeFilename(workspace.property.name || "torpnotes")}-${dateStamp()}.torpnotes`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("Exporten är skapad.");
  } catch (error) {
    console.error(error);
    showToast("Exporten kunde inte skapas.");
  }
}

async function importWorkspace() {
  const file = elements.importFileInput.files[0];
  elements.importFileInput.value = "";
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    if (payload?.format !== "torpnotes" || ![1, 2].includes(payload.exportVersion) || !payload.workspace) throw new Error("Unsupported export format");
    if (!window.confirm("Importen ersätter all lokal TorpNotes-data i den här webbläsaren. Fortsätta?")) return;
    const imported = payload.workspace;
    if (payload.exportVersion === 1 && imported.mapImage?.dataUrl) {
      imported.mapImage.blob = dataUrlToBlob(imported.mapImage.dataUrl);
      delete imported.mapImage.dataUrl;
    }
    if (payload.exportVersion === 2) {
      imported.layers = (imported.layers || []).map((layer) => ({ ...layer, blob: dataUrlToBlob(layer.dataUrl) }));
      imported.items = (imported.items || []).map((item) => ({ ...item, attachments: (item.attachments || []).map((attachment) => ({ ...attachment, blob: dataUrlToBlob(attachment.dataUrl) })) }));
    }
    workspace = normalizeWorkspace(imported);
    activeSessionId = workspace.measurements[0]?.id || null;
    activeLevelId = "site";
    await saveWorkspace("Importen är klar.");
    await renderAll(true);
    switchView("map");
  } catch (error) {
    console.error(error);
    showToast("Filen kunde inte importeras.");
  }
}

async function clearWorkspace() {
  if (!window.confirm("Radera all lokal TorpNotes-data på den här enheten? Detta går inte att ångra utan en export.")) return;
  workspace = createEmptyWorkspace();
  activeSessionId = null;
  activeLevelId = "site";
  await saveWorkspace("Den lokala datan är raderad.");
  await renderAll(true);
}

async function saveWorkspace(message) {
  setSaving(true);
  workspace.updatedAt = nowIso();
  await dbPut(STATE_KEY, workspace);
  setSaving(false);
  if (message) showToast(message);
}

function setSaving(saving) {
  elements.storageState.classList.toggle("saving", saving);
  elements.storageState.querySelector("span:last-child").textContent = saving ? "Sparar lokalt" : "Sparat lokalt";
}

function switchView(viewName) {
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === viewName));
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === `view-${viewName}`));
  if (viewName === "map") window.setTimeout(() => { map.invalidateSize(); renderMapLayers(); }, 0);
}

function visibleLayers() {
  return workspace.layers.filter((layer) => layer.visible && (layer.levelId === "site" || layer.levelId === activeLevelId));
}

function fitVisible() {
  const points = [];
  visibleLayers().forEach((layer) => layerCorners(layer).forEach((point) => points.push([point.y, point.x])));
  filteredObjects().forEach((item) => item.geometry.forEach((point) => points.push([point.y, point.x])));
  if (points.length) map.fitBounds(L.latLngBounds(points), { padding: [28, 28], animate: false, maxZoom: 5 });
  else map.setView([0, 0], 0);
}

function zoomToObject(item) {
  const latLngs = item.geometry.map((point) => [point.y, point.x]);
  if (item.geometryType === "point") map.flyTo(latLngs[0], Math.max(map.getZoom(), 4));
  else map.fitBounds(L.latLngBounds(latLngs), { padding: [40, 40], maxZoom: 7 });
}

function markerIcon(status) {
  return L.divIcon({ className: "", html: `<span class="torp-marker ${escapeHtml(status)}"></span>`, iconAnchor: [11,11], iconSize: [22,22], tooltipAnchor: [0,-12] });
}

function objectStyle(item, interactive) {
  return { color: item.color || "#356b8c", weight: 4, opacity: item.status === "done" ? 0.42 : 0.9, fillColor: item.color || "#356b8c", fillOpacity: item.status === "done" ? 0.08 : 0.18, interactive, className: `object-${item.status}` };
}

function layerControlPoints(layer) {
  const radians = degreesToRadians(layer.rotation || 0);
  const width = layer.width * layer.metersPerPixel;
  const height = layer.height * layer.metersPerPixel;
  return [
    { x: layer.x, y: layer.y },
    { x: layer.x + Math.cos(radians) * width, y: layer.y + Math.sin(radians) * width },
    { x: layer.x + Math.sin(radians) * height, y: layer.y - Math.cos(radians) * height }
  ];
}

function layerCorners(layer) {
  const [tl, tr, bl] = layerControlPoints(layer);
  return [tl, tr, { x: tr.x + bl.x - tl.x, y: tr.y + bl.y - tl.y }, bl];
}

function worldToImagePixel(layer, point) {
  const radians = degreesToRadians(layer.rotation || 0);
  const dx = point.x - layer.x;
  const dy = point.y - layer.y;
  return { x: (dx * Math.cos(radians) + dy * Math.sin(radians)) / layer.metersPerPixel, y: (dx * Math.sin(radians) - dy * Math.cos(radians)) / layer.metersPerPixel };
}

function pointInsideLayer(layer, point) {
  const pixel = worldToImagePixel(layer, point);
  return pixel.x >= 0 && pixel.y >= 0 && pixel.x <= layer.width && pixel.y <= layer.height;
}

function createEmptyWorkspace() {
  const timestamp = nowIso();
  return { schemaVersion: 2, property: { id: newId(), name: "", localCrs: { unit: "meter", anchor: null, northRotation: null }, createdAt: timestamp, updatedAt: timestamp }, levels: DEFAULT_LEVELS.map((level) => ({ ...level })), layers: [], items: [], measurements: [], createdAt: timestamp, updatedAt: timestamp };
}

function normalizeWorkspace(value) {
  const fallback = createEmptyWorkspace();
  if (!value || value.schemaVersion !== 2) return migrateLegacyWorkspace(value || {});
  return {
    ...fallback,
    ...value,
    schemaVersion: 2,
    property: { ...fallback.property, ...(value.property || {}), localCrs: { ...fallback.property.localCrs, ...(value.property?.localCrs || {}) } },
    levels: Array.isArray(value.levels) && value.levels.length ? value.levels : fallback.levels,
    layers: Array.isArray(value.layers) ? value.layers.map(normalizeLayer) : [],
    items: Array.isArray(value.items) ? value.items.map(normalizeItem) : [],
    measurements: normalizeMeasurements(value.measurements)
  };
}

function migrateLegacyWorkspace(value) {
  const result = createEmptyWorkspace();
  result.property = { ...result.property, ...(value.property || {}) };
  result.createdAt = value.createdAt || result.createdAt;
  result.updatedAt = value.updatedAt || result.updatedAt;
  let scale = DEFAULT_SCALE;
  if (value.mapImage?.blob) {
    result.layers.push(normalizeLayer({ id: newId(), name: value.mapImage.name || "Tidigare kartbild", levelId: "site", blob: value.mapImage.blob, width: value.mapImage.width, height: value.mapImage.height, metersPerPixel: scale, scaleEstimated: true, x: 0, y: value.mapImage.height * scale, rotation: 0, opacity: 1, visible: true, locked: true, order: 0, createdAt: value.mapImage.createdAt || nowIso(), updatedAt: nowIso() }));
  }
  result.items = (value.items || []).map((item) => normalizeItem({ ...item, geometryType: "point", geometry: [{ x: Number(item.x || 0) * scale, y: Number(item.y || 0) * scale }], levelId: "site" }));
  result.measurements = normalizeMeasurements(value.measurements);
  return result;
}

function normalizeLayer(layer) {
  return { id: layer.id || newId(), name: layer.name || "Bildlager", levelId: layer.levelId || "site", blob: layer.blob, mimeType: layer.mimeType || layer.blob?.type || "image/*", width: Number(layer.width || 1), height: Number(layer.height || 1), metersPerPixel: Number(layer.metersPerPixel || DEFAULT_SCALE), scaleEstimated: layer.scaleEstimated !== false, x: Number(layer.x || 0), y: Number(layer.y || 0), rotation: Number(layer.rotation || 0), opacity: Number.isFinite(Number(layer.opacity)) ? Number(layer.opacity) : 1, visible: layer.visible !== false, locked: layer.locked !== false, order: Number(layer.order || 0), createdAt: layer.createdAt || nowIso(), updatedAt: layer.updatedAt || nowIso() };
}

function normalizeItem(item) {
  return { id: item.id || newId(), title: item.title || "Namnlöst objekt", note: item.note || "", status: STATUSES.some((status) => status.id === item.status) ? item.status : "info", categories: Array.isArray(item.categories) ? item.categories : [], levelId: item.levelId || "site", z: Number.isFinite(Number(item.z)) && item.z !== null ? Number(item.z) : null, zSource: item.zSource || "unknown", color: item.color || "#356b8c", geometryType: ["point", "line", "polygon"].includes(item.geometryType) ? item.geometryType : "point", geometry: Array.isArray(item.geometry) ? item.geometry.map((point) => ({ x: Number(point.x || 0), y: Number(point.y || 0) })) : [{ x: Number(item.x || 0), y: Number(item.y || 0) }], attachments: Array.isArray(item.attachments) ? item.attachments : [], relations: Array.isArray(item.relations) ? item.relations : [], createdAt: item.createdAt || nowIso(), updatedAt: item.updatedAt || nowIso() };
}

function normalizeMeasurements(measurements) {
  return Array.isArray(measurements) ? measurements.map((session) => ({ ...session, readings: Array.isArray(session.readings) ? session.readings.map((reading) => ({ ...reading, itemId: reading.itemId || null })) : [] })) : [];
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbGet(key) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

async function dbPut(key, value) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(value, key);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => reject(transaction.error);
  });
}

function imageDimensions(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => { resolve({ width: image.naturalWidth, height: image.naturalHeight }); URL.revokeObjectURL(url); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image could not be decoded")); };
    image.src = url;
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl) {
  const [header, body] = dataUrl.split(",");
  const mimeType = header.match(/data:([^;]+)/)?.[1] || "application/octet-stream";
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mimeType });
}

function parseDecimal(value) {
  const normalized = String(value).trim().replace(/[−–—]/g, "-").replace(/\s/g, "").replace(",", ".");
  return normalized === "" ? Number.NaN : Number(normalized);
}
function formatInputNumber(value) { return Number(value).toLocaleString("sv-SE", { maximumFractionDigits: 6, useGrouping: false }); }
function formatNumber(value) { return new Intl.NumberFormat("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(value); }
function formatMeters(value) { return `${new Intl.NumberFormat("sv-SE", { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(value)} m`; }
function formatScale(value) { return `${new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 5 }).format(value)} m/px`; }
function formatDate(value) { return new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" }).format(new Date(value)); }
function formatTime(value) { return new Intl.DateTimeFormat("sv-SE", { hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function statusLabel(id) { return STATUSES.find((status) => status.id === id)?.name || "Info"; }
function categoryName(id) { return CATEGORIES.find((category) => category.id === id)?.name || id; }
function levelName(id) { return workspace.levels.find((level) => level.id === id)?.name || "Okänt plan"; }
function geometryLabel(type) { return type === "line" ? "Linje" : type === "polygon" ? "Område" : "Punkt"; }
function geometrySymbol(type) { return type === "line" ? "╱" : type === "polygon" ? "▱" : "•"; }
function degreesToRadians(value) { return Number(value || 0) * Math.PI / 180; }
function copyPoint(point) { return { x: Number(point.x), y: Number(point.y) }; }
function newId() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function nowIso() { return new Date().toISOString(); }
function dateStamp() { return new Date().toISOString().slice(0, 10); }
function safeFilename(value) { return value.toLowerCase().replace(/[^a-z0-9åäö]+/gi, "-").replace(/^-|-$/g, "") || "torpnotes"; }
function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
function toCamel(value) { return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()); }
function showToast(message) { window.clearTimeout(toastTimer); elements.toast.textContent = message; elements.toast.classList.add("visible"); toastTimer = window.setTimeout(() => elements.toast.classList.remove("visible"), 2600); }
function registerServiceWorker() { if ("serviceWorker" in navigator && window.isSecureContext) navigator.serviceWorker.register("./sw.js").catch((error) => console.warn("Service worker registration failed", error)); }
