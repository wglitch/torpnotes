/* global L */

const DB_NAME = "torpnotes-local";
const DB_VERSION = 1;
const STORE_NAME = "workspace";
const STATE_KEY = "current";
const EXPORT_VERSION = 1;

let workspace = createEmptyWorkspace();
let map;
let imageLayer = null;
let imageUrl = null;
let imageBounds = null;
let addPointMode = false;
let pendingPoint = null;
let activeSessionId = null;
let markerById = new Map();
let toastTimer = null;

const elements = {};

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

  if (navigator.storage?.persist) {
    navigator.storage.persist().catch(() => false);
  }

  await renderAll();
  registerServiceWorker();
}

function bindElements() {
  const ids = [
    "property-name-button", "storage-state", "empty-map", "empty-import-button",
    "add-point-button", "fit-map-button", "change-map-button", "map-hint",
    "object-list", "item-count", "new-session-button", "session-list", "session-count",
    "measure-detail", "property-name-input", "save-property-button", "export-button",
    "import-button", "clear-button", "point-dialog", "point-form", "point-dialog-title",
    "point-id", "point-title", "point-note", "point-status", "delete-point-button",
    "session-dialog", "session-form", "session-name", "fix-name", "fix-height",
    "fix-reading", "instrument-preview", "map-file-input", "import-file-input", "toast"
  ];

  ids.forEach((id) => {
    elements[toCamel(id)] = document.getElementById(id);
  });
}

function bindEvents() {
  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });

  elements.propertyNameButton.addEventListener("click", () => switchView("data"));
  elements.emptyImportButton.addEventListener("click", openMapPicker);
  elements.changeMapButton.addEventListener("click", openMapPicker);
  elements.mapFileInput.addEventListener("change", importMapImage);
  elements.addPointButton.addEventListener("click", toggleAddPointMode);
  elements.fitMapButton.addEventListener("click", fitImage);

  elements.pointForm.addEventListener("submit", handlePointSubmit);
  elements.deletePointButton.addEventListener("click", deleteCurrentPoint);

  elements.newSessionButton.addEventListener("click", openSessionDialog);
  elements.sessionForm.addEventListener("submit", handleSessionSubmit);
  elements.fixHeight.addEventListener("input", updateInstrumentPreview);
  elements.fixReading.addEventListener("input", updateInstrumentPreview);

  elements.savePropertyButton.addEventListener("click", savePropertyName);
  elements.exportButton.addEventListener("click", exportWorkspace);
  elements.importButton.addEventListener("click", () => elements.importFileInput.click());
  elements.importFileInput.addEventListener("change", importWorkspace);
  elements.clearButton.addEventListener("click", clearWorkspace);
}

function initializeMap() {
  map = L.map("map", {
    crs: L.CRS.Simple,
    minZoom: -5,
    maxZoom: 8,
    zoomSnap: 0.25,
    zoomControl: true,
    attributionControl: false
  });

  map.setView([500, 500], -1);
  map.on("click", (event) => {
    if (!addPointMode || !workspace.mapImage) return;
    pendingPoint = { x: event.latlng.lng, y: event.latlng.lat };
    openPointDialog();
  });
}

async function renderAll() {
  renderProperty();
  await renderMapImage();
  renderMapItems();
  renderObjectList();
  renderSessions();
  renderMeasureDetail();
}

function renderProperty() {
  const name = workspace.property.name || "Namnlös gård";
  elements.propertyNameButton.textContent = name;
  elements.propertyNameInput.value = workspace.property.name || "";
}

async function renderMapImage() {
  if (imageLayer) {
    imageLayer.remove();
    imageLayer = null;
  }
  if (imageUrl) {
    URL.revokeObjectURL(imageUrl);
    imageUrl = null;
  }

  if (!workspace.mapImage?.blob) {
    imageBounds = null;
    elements.emptyMap.classList.remove("hidden");
    setMapButtons(false);
    return;
  }

  imageUrl = URL.createObjectURL(workspace.mapImage.blob);
  imageBounds = [[0, 0], [workspace.mapImage.height, workspace.mapImage.width]];
  imageLayer = L.imageOverlay(imageUrl, imageBounds, { interactive: false }).addTo(map);
  imageLayer.bringToBack();
  map.setMaxBounds(L.latLngBounds(imageBounds).pad(0.65));
  elements.emptyMap.classList.add("hidden");
  setMapButtons(true);
  window.setTimeout(fitImage, 0);
}

function renderMapItems() {
  markerById.forEach((marker) => marker.remove());
  markerById = new Map();

  workspace.items.forEach((item) => {
    const marker = L.marker([item.y, item.x], {
      icon: markerIcon(item.status),
      keyboard: true,
      title: item.title
    }).addTo(map);

    marker.on("click", () => openPointDialog(item));
    marker.bindTooltip(item.title, { direction: "top", offset: [0, -10] });
    markerById.set(item.id, marker);
  });
}

function renderObjectList() {
  elements.itemCount.textContent = String(workspace.items.length);
  if (!workspace.items.length) {
    elements.objectList.innerHTML = '<p class="listEmpty">Inga punkter ännu. Lägg in en kartbild och välj sedan <strong>+ Punkt</strong>.</p>';
    return;
  }

  const sorted = [...workspace.items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  elements.objectList.innerHTML = sorted.map((item) => `
    <button class="objectRow" data-item-id="${escapeHtml(item.id)}" type="button">
      <span class="statusMarker ${escapeHtml(item.status)}"></span>
      <span class="rowText">
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml(statusLabel(item.status))}${item.note ? ` · ${escapeHtml(item.note)}` : ""}</small>
      </span>
    </button>
  `).join("");

  elements.objectList.querySelectorAll("[data-item-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = workspace.items.find((candidate) => candidate.id === button.dataset.itemId);
      const marker = item && markerById.get(item.id);
      if (!item || !marker) return;
      map.flyTo(marker.getLatLng(), Math.max(map.getZoom(), 1));
      openPointDialog(item);
    });
  });
}

function renderSessions() {
  elements.sessionCount.textContent = String(workspace.measurements.length);
  if (!workspace.measurements.length) {
    elements.sessionList.innerHTML = '<p class="listEmpty">Inga mätningar ännu.</p>';
    return;
  }

  if (!activeSessionId || !workspace.measurements.some((session) => session.id === activeSessionId)) {
    activeSessionId = workspace.measurements[0].id;
  }

  elements.sessionList.innerHTML = workspace.measurements.map((session) => `
    <button class="sessionRow ${session.id === activeSessionId ? "active" : ""}" data-session-id="${escapeHtml(session.id)}" type="button">
      <span class="rowText">
        <strong>${escapeHtml(session.name)}</strong>
        <small>${escapeHtml(session.fixName)} · ${session.readings.length} punkter</small>
      </span>
    </button>
  `).join("");

  elements.sessionList.querySelectorAll("[data-session-id]").forEach((button) => {
    button.addEventListener("click", () => {
      activeSessionId = button.dataset.sessionId;
      renderSessions();
      renderMeasureDetail();
    });
  });
}

function renderMeasureDetail() {
  const session = workspace.measurements.find((candidate) => candidate.id === activeSessionId);
  if (!session) {
    elements.measureDetail.innerHTML = `
      <div class="emptyState">
        <h2>Ingen mätning vald</h2>
        <p>Skapa en mätning och etablera instrumentet mot en känd eller antagen fixhöjd.</p>
      </div>
    `;
    return;
  }

  elements.measureDetail.innerHTML = `
    <div class="sessionSummary">
      <div>
        <span class="eyebrow">${formatDate(session.createdAt)}</span>
        <h2>${escapeHtml(session.name)}</h2>
        <p>${escapeHtml(session.fixName)} ${formatMeters(session.fixHeight)} + avläsning ${formatMeters(session.fixReading)}</p>
      </div>
      <div class="instrumentCard">
        <small>Instrumenthöjd</small>
        <strong>${formatMeters(session.instrumentHeight)}</strong>
      </div>
    </div>

    <form class="readingForm" id="reading-form">
      <label>
        Punkt
        <input id="reading-name" maxlength="60" placeholder="H345" required type="text">
      </label>
      <label>
        Stångavläsning (m)
        <input id="staff-reading" inputmode="decimal" placeholder="4,740" required type="text">
      </label>
      <button class="primaryButton" type="submit">Lägg till</button>
    </form>

    ${session.readings.length ? `
      <table class="readingTable">
        <thead>
          <tr><th>Punkt</th><th>Avläsning</th><th>Höjd</th><th>Tid</th><th></th></tr>
        </thead>
        <tbody>
          ${session.readings.map((reading) => `
            <tr>
              <td><strong>${escapeHtml(reading.name)}</strong></td>
              <td class="number">${formatMeters(reading.staffReading)}</td>
              <td class="number">${formatMeters(reading.height)}</td>
              <td>${formatTime(reading.createdAt)}</td>
              <td><button class="iconButton" data-delete-reading="${escapeHtml(reading.id)}" aria-label="Radera avläsning" type="button">×</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    ` : '<p class="listEmpty">Mata in den första punktens stångavläsning ovan.</p>'}
  `;

  document.getElementById("reading-form").addEventListener("submit", addReading);
  elements.measureDetail.querySelectorAll("[data-delete-reading]").forEach((button) => {
    button.addEventListener("click", () => deleteReading(button.dataset.deleteReading));
  });
}

function switchView(viewName) {
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === viewName));
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === `view-${viewName}`));
  if (viewName === "map") window.setTimeout(() => map.invalidateSize(), 0);
}

function openMapPicker() {
  elements.mapFileInput.value = "";
  elements.mapFileInput.click();
}

async function importMapImage(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    showToast("Välj en bildfil.");
    return;
  }

  try {
    const dimensions = await imageDimensions(file);
    workspace.mapImage = {
      name: file.name,
      mimeType: file.type,
      width: dimensions.width,
      height: dimensions.height,
      blob: file,
      updatedAt: nowIso()
    };
    await saveWorkspace("Kartbilden är sparad lokalt.");
    await renderMapImage();
    renderMapItems();
  } catch (error) {
    console.error(error);
    showToast("Kartbilden kunde inte läsas.");
  }
}

function toggleAddPointMode() {
  if (!workspace.mapImage) {
    showToast("Lägg in en kartbild först.");
    return;
  }
  addPointMode = !addPointMode;
  elements.addPointButton.classList.toggle("active", addPointMode);
  elements.mapHint.classList.toggle("hidden", !addPointMode);
  map.getContainer().style.cursor = addPointMode ? "crosshair" : "grab";
}

function openPointDialog(item = null) {
  const isEditing = Boolean(item);
  elements.pointDialogTitle.textContent = isEditing ? "Redigera punkt" : "Ny punkt";
  elements.pointId.value = item?.id || "";
  elements.pointTitle.value = item?.title || "";
  elements.pointNote.value = item?.note || "";
  elements.pointStatus.value = item?.status || "info";
  elements.deletePointButton.classList.toggle("hidden", !isEditing);
  elements.pointDialog.showModal();
  window.setTimeout(() => elements.pointTitle.focus(), 0);
}

async function handlePointSubmit(event) {
  event.preventDefault();
  if (event.submitter?.value === "cancel") {
    pendingPoint = null;
    elements.pointDialog.close();
    return;
  }

  if (!elements.pointForm.reportValidity()) return;
  const existing = workspace.items.find((item) => item.id === elements.pointId.value);
  const point = existing ? { x: existing.x, y: existing.y } : pendingPoint;
  if (!point) return;

  const item = {
    id: existing?.id || newId(),
    type: "point",
    x: point.x,
    y: point.y,
    title: elements.pointTitle.value.trim(),
    note: elements.pointNote.value.trim(),
    status: elements.pointStatus.value,
    createdAt: existing?.createdAt || nowIso(),
    updatedAt: nowIso()
  };

  if (existing) {
    workspace.items = workspace.items.map((candidate) => candidate.id === item.id ? item : candidate);
  } else {
    workspace.items.push(item);
  }

  pendingPoint = null;
  addPointMode = false;
  elements.addPointButton.classList.remove("active");
  elements.mapHint.classList.add("hidden");
  map.getContainer().style.cursor = "grab";
  elements.pointDialog.close();
  await saveWorkspace("Punkten är sparad lokalt.");
  renderMapItems();
  renderObjectList();
}

async function deleteCurrentPoint() {
  const id = elements.pointId.value;
  const item = workspace.items.find((candidate) => candidate.id === id);
  if (!item || !window.confirm(`Radera punkten ”${item.title}”?`)) return;
  workspace.items = workspace.items.filter((candidate) => candidate.id !== id);
  elements.pointDialog.close();
  await saveWorkspace("Punkten är raderad.");
  renderMapItems();
  renderObjectList();
}

function openSessionDialog() {
  elements.sessionForm.reset();
  elements.sessionName.value = `Mätning ${new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" }).format(new Date())}`;
  elements.fixHeight.value = "100,000";
  elements.instrumentPreview.textContent = "Instrumenthöjd visas här";
  elements.sessionDialog.showModal();
}

function updateInstrumentPreview() {
  const fixHeight = parseDecimal(elements.fixHeight.value);
  const fixReading = parseDecimal(elements.fixReading.value);
  elements.instrumentPreview.textContent = Number.isFinite(fixHeight) && Number.isFinite(fixReading)
    ? `Instrumenthöjd: ${formatMeters(fixHeight + fixReading)}`
    : "Instrumenthöjd visas här";
}

async function handleSessionSubmit(event) {
  event.preventDefault();
  if (event.submitter?.value === "cancel") {
    elements.sessionDialog.close();
    return;
  }
  if (!elements.sessionForm.reportValidity()) return;

  const fixHeight = parseDecimal(elements.fixHeight.value);
  const fixReading = parseDecimal(elements.fixReading.value);
  if (!Number.isFinite(fixHeight) || !Number.isFinite(fixReading)) {
    showToast("Kontrollera höjd och avläsning.");
    return;
  }

  const session = {
    id: newId(),
    name: elements.sessionName.value.trim(),
    fixName: elements.fixName.value.trim(),
    fixHeight,
    fixReading,
    instrumentHeight: fixHeight + fixReading,
    readings: [],
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

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
  if (!session || !nameInput.value.trim() || !Number.isFinite(staffReading)) {
    showToast("Ange punkt och giltig stångavläsning.");
    return;
  }

  session.readings.unshift({
    id: newId(),
    name: nameInput.value.trim(),
    staffReading,
    height: session.instrumentHeight - staffReading,
    createdAt: nowIso()
  });
  session.updatedAt = nowIso();
  await saveWorkspace(`${nameInput.value.trim()} är sparad.`);
  renderSessions();
  renderMeasureDetail();
}

async function deleteReading(readingId) {
  const session = workspace.measurements.find((candidate) => candidate.id === activeSessionId);
  if (!session || !window.confirm("Radera den här avläsningen?")) return;
  session.readings = session.readings.filter((reading) => reading.id !== readingId);
  session.updatedAt = nowIso();
  await saveWorkspace("Avläsningen är raderad.");
  renderSessions();
  renderMeasureDetail();
}

async function savePropertyName() {
  workspace.property.name = elements.propertyNameInput.value.trim() || "Namnlös gård";
  workspace.property.updatedAt = nowIso();
  await saveWorkspace("Gårdens namn är sparat.");
  renderProperty();
}

async function exportWorkspace() {
  try {
    const payload = {
      format: "torpnotes",
      exportVersion: EXPORT_VERSION,
      exportedAt: nowIso(),
      workspace: {
        ...workspace,
        mapImage: workspace.mapImage ? {
          ...workspace.mapImage,
          blob: undefined,
          dataUrl: await blobToDataUrl(workspace.mapImage.blob)
        } : null
      }
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeFilename(workspace.property.name || "torpnotes")}-${dateStamp()}.torpnotes`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("Exporten är skapad.");
  } catch (error) {
    console.error(error);
    showToast("Exporten misslyckades.");
  }
}

async function importWorkspace(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;

  try {
    const payload = JSON.parse(await file.text());
    if (payload?.format !== "torpnotes" || payload?.exportVersion !== EXPORT_VERSION || !payload.workspace) {
      throw new Error("Unsupported export format");
    }
    if (!window.confirm("Importen ersätter all TorpNotes-data i den här webbläsaren. Fortsätta?")) return;

    const imported = payload.workspace;
    if (imported.mapImage?.dataUrl) {
      imported.mapImage.blob = dataUrlToBlob(imported.mapImage.dataUrl);
      delete imported.mapImage.dataUrl;
    }
    workspace = normalizeWorkspace(imported);
    activeSessionId = workspace.measurements[0]?.id || null;
    await saveWorkspace("Importen är klar.");
    await renderAll();
    switchView("map");
  } catch (error) {
    console.error(error);
    showToast("Filen är inte en giltig TorpNotes-export.");
  }
}

async function clearWorkspace() {
  if (!window.confirm("Radera all lokal TorpNotes-data på den här enheten? Detta går inte att ångra utan en export.")) return;
  workspace = createEmptyWorkspace();
  activeSessionId = null;
  await saveWorkspace("Den lokala datan är raderad.");
  await renderAll();
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
  elements.storageState.lastChild.textContent = saving ? " Sparar lokalt" : " Sparat lokalt";
}

function setMapButtons(enabled) {
  elements.addPointButton.disabled = !enabled;
  elements.fitMapButton.disabled = !enabled;
}

function fitImage() {
  if (imageBounds) map.fitBounds(imageBounds, { padding: [18, 18], animate: false });
}

function markerIcon(status) {
  return L.divIcon({
    className: "",
    html: `<span class="torp-marker ${escapeHtml(status)}"></span>`,
    iconAnchor: [11, 11],
    iconSize: [22, 22],
    tooltipAnchor: [0, -12]
  });
}

function createEmptyWorkspace() {
  const timestamp = nowIso();
  return {
    schemaVersion: 1,
    property: { id: newId(), name: "", createdAt: timestamp, updatedAt: timestamp },
    mapImage: null,
    items: [],
    measurements: [],
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function normalizeWorkspace(value) {
  const fallback = createEmptyWorkspace();
  return {
    ...fallback,
    ...value,
    property: { ...fallback.property, ...(value.property || {}) },
    items: Array.isArray(value.items) ? value.items : [],
    measurements: Array.isArray(value.measurements) ? value.measurements.map((session) => ({
      ...session,
      readings: Array.isArray(session.readings) ? session.readings : []
    })) : []
  };
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
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
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

function imageDimensions(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image could not be decoded"));
    };
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
  const normalized = String(value).trim().replace(/\s/g, "").replace(",", ".");
  return normalized === "" ? Number.NaN : Number(normalized);
}

function formatMeters(value) {
  return `${new Intl.NumberFormat("sv-SE", { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(value)} m`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" }).format(new Date(value));
}

function formatTime(value) {
  return new Intl.DateTimeFormat("sv-SE", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function statusLabel(status) {
  if (status === "todo") return "Att göra";
  if (status === "done") return "Klart";
  return "Information";
}

function newId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}

function safeFilename(value) {
  return value.toLowerCase().replace(/[^a-z0-9åäö]+/gi, "-").replace(/^-|-$/g, "") || "torpnotes";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toCamel(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  toastTimer = window.setTimeout(() => elements.toast.classList.remove("visible"), 2400);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
  navigator.serviceWorker.register("./sw.js").catch((error) => console.warn("Service worker registration failed", error));
}
