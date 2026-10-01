import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "test-output");
await fs.mkdir(output, { recursive: true });

const browser = await chromium.launch({ channel: "msedge", headless: true });

try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await desktop.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("http://127.0.0.1:4173", { waitUntil: "networkidle" });
  await page.locator("#map-file-input").setInputFiles(path.join(root, "icon.svg"));
  await page.locator("#empty-map").waitFor({ state: "hidden" });

  await page.getByRole("button", { name: "+ Punkt" }).click();
  await page.locator("#map").click({ position: { x: 520, y: 360 } });
  await page.locator("#point-title").fill("Provpunkt");
  await page.locator("#point-note").fill("Lokalt sparad anteckning");
  await page.locator("#save-point-button").click();
  await page.locator("#object-list").getByRole("button", { name: /Provpunkt/ }).waitFor();
  await page.screenshot({ path: path.join(output, "desktop-map.png"), fullPage: true });

  await page.getByRole("button", { name: "Mätning", exact: true }).click();
  await page.getByRole("button", { name: "Ny mätning" }).click();
  await page.locator("#fix-name").fill("FIX-01");
  await page.locator("#fix-reading").fill("1,325");
  await page.locator("#save-session-button").click();
  await page.locator("#reading-name").fill("H345");
  await page.locator("#staff-reading").fill("4,740");
  await page.locator("#reading-form").getByRole("button", { name: "Lägg till" }).click();
  await page.getByText("96,585 m").waitFor();
  await page.screenshot({ path: path.join(output, "desktop-measurement.png"), fullPage: true });

  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Mätning", exact: true }).click();
  await page.getByText("96,585 m").waitFor();

  if (errors.length) throw new Error(`Browser errors: ${errors.join(" | ")}`);
  await desktop.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto("http://127.0.0.1:4173", { waitUntil: "networkidle" });
  await mobilePage.screenshot({ path: path.join(output, "mobile-empty.png"), fullPage: true });
  await mobilePage.getByRole("button", { name: "Mätning", exact: true }).click();
  await mobilePage.screenshot({ path: path.join(output, "mobile-measurement.png"), fullPage: true });
  await mobile.close();

  console.log("Smoke test passed: IndexedDB persistence, map point, leveling calculation, desktop and mobile layouts.");
} finally {
  await browser.close();
}
