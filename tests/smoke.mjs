import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "test-output");
const baseUrl = process.env.TORPNOTES_URL || "http://127.0.0.1:4174";
await fs.mkdir(output, { recursive: true });

const browser = await chromium.launch({ channel: "msedge", headless: true });

try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await desktop.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Lägg till bildlager" }).click();
  await page.locator("#layer-file-input").setInputFiles(path.join(root, "icon.svg"));
  await page.locator("#layer-name").fill("Situationsplan");
  await page.locator("#layer-white-transparent").check();
  await page.locator("#save-layer-button").click();
  await page.locator("#empty-map").waitFor({ state: "hidden" });

  await page.getByRole("button", { name: "Lägg till objekt" }).click();
  await page.getByRole("button", { name: "Punkt", exact: true }).click();
  await page.locator("#map").click({ position: { x: 520, y: 330 } });
  await page.locator("#object-form").getByRole("button", { name: "Avbryt" }).click();
  await page.locator("#object-dialog").waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Lägg till objekt" }).click();
  await page.getByRole("button", { name: "Punkt", exact: true }).click();
  await page.locator("#map").click({ position: { x: 520, y: 330 } });
  await page.locator("#object-title").fill("Kopplingsdosa K12");
  await page.locator("#object-note").fill("Sladd mot central och uttag U14");
  await page.locator('[data-object-category="electricity"]').check();
  await page.locator("#object-image-input").setInputFiles(path.join(root, "icon.svg"));
  await page.locator("#save-object-button").click();
  await page.getByRole("button", { name: "Öppna meny" }).click();
  await page.getByRole("button", { name: "Objekt", exact: true }).click();
  await page.locator("#object-list").getByRole("button", { name: /Kopplingsdosa K12/ }).waitFor();

  await page.getByRole("button", { name: "Lägg till objekt" }).click();
  await page.getByRole("button", { name: "Område", exact: true }).click();
  await page.locator("#map").click({ position: { x: 420, y: 260 } });
  await page.locator("#map").click({ position: { x: 610, y: 270 } });
  await page.locator("#map").click({ position: { x: 590, y: 410 } });
  if (await page.locator(".draftVertex").count() !== 3) throw new Error("Expected three visible polygon vertices");
  await page.locator("#finish-draw-button").click();
  await page.locator("#object-title").fill("Husgrund");
  await page.locator('[data-object-category="construction"]').check();
  await page.locator("#status-cycle-button").click();
  await page.locator("#status-cycle-button").click();
  await page.locator("#save-object-button").click();

  await page.getByRole("button", { name: "Lägg till objekt" }).click();
  await page.getByRole("button", { name: "Linje", exact: true }).click();
  await page.locator("#map").click({ position: { x: 450, y: 300 } });
  await page.locator("#map").click({ position: { x: 650, y: 380 } });
  await page.locator("#finish-draw-button").click();
  await page.locator("#object-title").fill("Vattenledning");
  await page.locator('[data-object-category="water"]').check();
  await page.locator("#status-cycle-button").click();
  await page.locator("#save-object-button").click();
  await page.locator("#object-list").getByRole("button", { name: /Vattenledning/ }).waitFor();

  await page.locator("#close-object-panel").click();
  await page.locator("#layer-button").click();
  await page.locator("[data-layer-edit]").click();
  await page.locator("#calibrate-layer-button").click();
  await page.locator("#map").click({ position: { x: 670, y: 430 } });
  await page.locator("#map").click({ position: { x: 770, y: 430 } });
  await page.locator("#calibration-distance").fill("10");
  await page.locator("#calibration-form").getByRole("button", { name: "Använd skala" }).click();

  await page.locator("#layer-button").click();
  await page.locator("[data-layer-edit]").click();
  await page.locator("#layer-x").fill("-88,5");
  await page.locator("#layer-y").fill("75,4");
  await page.locator("#save-layer-button").click();
  await page.locator("#layer-dialog").waitFor({ state: "hidden" });
  await page.locator("#layer-button").click();
  await page.locator("[data-layer-edit]").click();
  await page.locator("#save-layer-button").click();
  await page.locator("#layer-dialog").waitFor({ state: "hidden" });
  await page.locator("#layer-button").click();
  await page.locator("[data-layer-edit]").click();
  await page.locator("#layer-x").fill("0");
  await page.locator("#layer-y").fill("4");
  await page.locator("#save-layer-button").click();
  await page.getByRole("button", { name: "Visa allt", exact: true }).click();
  await page.locator("#layer-button").click();
  await page.locator("[data-layer-edit]").click();
  await page.locator("#move-layer-button").click();
  await page.mouse.move(540, 430);
  await page.mouse.down();
  await page.mouse.move(575, 455, { steps: 5 });
  await page.mouse.up();
  await page.locator("#finish-draw-button").click();
  await page.getByRole("button", { name: "Hantera kartlager" }).click();
  await page.locator("[data-layer-edit]").click();
  const savedX = await page.locator("#layer-x").inputValue();
  const savedY = await page.locator("#layer-y").inputValue();
  await page.locator("#move-layer-button").click();
  await page.mouse.move(540, 430);
  await page.mouse.down();
  await page.mouse.move(620, 490, { steps: 5 });
  await page.mouse.up();
  await page.locator("#cancel-draw-button").click();
  await page.getByRole("button", { name: "Hantera kartlager" }).click();
  await page.locator("[data-layer-edit]").click();
  if (await page.locator("#layer-x").inputValue() !== savedX || await page.locator("#layer-y").inputValue() !== savedY) throw new Error("Cancelled layer move changed the saved position");
  await page.locator("#layer-form").getByRole("button", { name: "Avbryt" }).click();
  await page.screenshot({ path: path.join(output, "desktop-map-v2.png"), fullPage: true });

  await page.locator('[data-level-id="ground"]').click();
  await page.getByRole("button", { name: "Öppna meny" }).click();
  await page.getByRole("button", { name: "Höjdmätning" }).click();
  await page.getByRole("button", { name: "Ny mätning" }).click();
  await page.locator("#fix-name").fill("FIX-01");
  await page.locator("#fix-reading").fill("1,325");
  await page.locator("#save-session-button").click();
  await page.locator("#reading-name").fill("H345");
  await page.locator("#staff-reading").fill("4,740");
  await page.locator("#reading-form").getByRole("button", { name: "Lägg till" }).click();
  await page.getByText("96,585 m").waitFor();
  await page.getByRole("button", { name: "Placera" }).click();
  await page.locator("#map").click({ position: { x: 560, y: 350 } });
  await page.locator("#object-dialog").waitFor({ state: "visible" });
  await page.locator("#object-level").evaluate((element) => { if (element.value !== "site") throw new Error(`Expected site level, got ${element.value}`); });
  await page.locator("#object-status-section").waitFor({ state: "hidden" });
  await page.locator("#object-category-section").waitFor({ state: "hidden" });
  await page.locator("#height-summary").getByText(/råavläsning 4,740 m/).waitFor();
  await page.locator("#object-form").getByRole("button", { name: "Avbryt" }).click();
  await page.screenshot({ path: path.join(output, "desktop-height-point.png"), fullPage: true });

  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Öppna meny" }).click();
  await page.getByRole("button", { name: "Höjdmätning" }).click();
  await page.getByText("96,585 m").waitFor();
  await page.getByRole("button", { name: "Till kartan" }).click();
  await page.getByRole("button", { name: "Öppna meny" }).click();
  await page.getByRole("button", { name: "Objekt", exact: true }).click();
  await page.locator("#object-list").getByRole("button", { name: /Kopplingsdosa K12/ }).waitFor();

  await page.locator("#filter-button").click();
  await page.locator('[data-filter-category="electricity"]').check();
  await page.locator("#filter-form").getByRole("button", { name: "Visa" }).click();
  await page.locator("#item-count").filter({ hasText: "1" }).waitFor();
  await page.getByRole("button", { name: "Visa allt", exact: true }).click();
  await page.locator('[data-level-id="all"].active').waitFor();
  await page.locator("#active-filters").waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Öppna meny" }).click();
  await page.getByRole("button", { name: "Objekt", exact: true }).click();
  await page.locator("#item-count").filter({ hasText: "4" }).waitFor();
  await page.locator('[data-level-id="site"]').click();

  await page.locator("#object-list").getByRole("button", { name: /Vattenledning/ }).click();
  await page.locator("#status-cycle-button").click();
  await page.locator("#toast-action").click();
  await page.locator("#status-cycle-label").filter({ hasText: "Att göra" }).waitFor();
  await page.locator("#edit-geometry-button").click();
  await page.locator(".vertexHandle").first().waitFor();
  await page.locator("#cancel-draw-button").click();

  await page.locator("#object-list").getByRole("button", { name: /Kopplingsdosa K12/ }).click();
  await page.locator("[data-view-attachment]").click();
  await page.locator("#photo-dialog").waitFor({ state: "visible" });
  await page.locator("#photo-close").click();
  await page.locator("#object-form").getByRole("button", { name: "Avbryt" }).click();

  await page.locator('[data-level-id="ground"]').click();
  await page.locator("#item-count").filter({ hasText: "0" }).waitFor();
  await page.locator('[data-level-id="site"]').click();

  await page.getByRole("button", { name: "Öppna meny" }).click();
  await page.getByRole("button", { name: "Data och export" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#export-button").click();
  const download = await downloadPromise;
  const exportPath = path.join(output, "smoke-export.torpnotes");
  await download.saveAs(exportPath);

  const imported = await browser.newContext({ viewport: { width: 1100, height: 760 } });
  const importedPage = await imported.newPage();
  await importedPage.goto(baseUrl, { waitUntil: "networkidle" });
  importedPage.once("dialog", (dialog) => dialog.accept());
  await importedPage.locator("#import-file-input").setInputFiles(exportPath);
  await importedPage.locator("#empty-map").waitFor({ state: "hidden" });
  await importedPage.getByRole("button", { name: "Öppna meny" }).click();
  await importedPage.getByRole("button", { name: "Objekt", exact: true }).click();
  await importedPage.locator("#object-list").getByRole("button", { name: /Kopplingsdosa K12/ }).waitFor();
  await imported.close();

  if (errors.length) throw new Error(`Browser errors: ${errors.join(" | ")}`);
  await desktop.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(baseUrl, { waitUntil: "networkidle" });
  await mobilePage.screenshot({ path: path.join(output, "mobile-empty-v2.png"), fullPage: true });
  await mobilePage.getByRole("button", { name: "Öppna meny" }).click();
  await mobilePage.getByRole("button", { name: "Data och export" }).click();
  mobilePage.once("dialog", (dialog) => dialog.accept());
  await mobilePage.locator("#import-file-input").setInputFiles(exportPath);
  await mobilePage.locator("#empty-map").waitFor({ state: "hidden" });
  await mobilePage.screenshot({ path: path.join(output, "mobile-map-v3.png"), fullPage: true });
  await mobilePage.locator("#add-tool-button").click();
  await mobilePage.getByRole("button", { name: "Linje", exact: true }).click();
  await mobilePage.locator("#map").click({ position: { x: 120, y: 190 } });
  await mobilePage.locator("#map").click({ position: { x: 210, y: 245 } });
  if (await mobilePage.locator(".draftVertex").count() !== 2) throw new Error("Mobile line drawing did not create visible vertices");
  await mobilePage.locator("#cancel-draw-button").click();
  await mobilePage.locator("#object-panel-button").click();
  await mobilePage.locator(".objectPanel.mobileOpen").waitFor();
  await mobilePage.screenshot({ path: path.join(output, "mobile-objects-v3.png"), fullPage: true });
  await mobilePage.locator("#close-object-panel").click();
  await mobilePage.locator("#level-button").click();
  await mobilePage.locator("#level-bar.open").waitFor();
  await mobilePage.locator('[data-level-id="site"]').click();
  await mobilePage.locator("#layer-button").click();
  await mobilePage.locator("[data-layer-edit]").click();
  await mobilePage.locator("#move-layer-button").click();
  await mobilePage.locator("#draw-actions").waitFor({ state: "visible" });
  await mobilePage.screenshot({ path: path.join(output, "mobile-layer-move-v3.png"), fullPage: true });
  await mobilePage.locator("#cancel-draw-button").click();
  await mobilePage.getByRole("button", { name: "Öppna meny" }).click();
  await mobilePage.getByRole("button", { name: "Höjdmätning" }).click();
  await mobilePage.screenshot({ path: path.join(output, "mobile-measurement-v2.png"), fullPage: true });
  await mobile.close();

  console.log("Smoke test passed: calibrated layers, editable point/line/area objects, photos, filters, leveling placement, persistence, export/import, and responsive layouts.");
} finally {
  await browser.close();
}
