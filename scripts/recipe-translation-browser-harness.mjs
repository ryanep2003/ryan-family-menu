// Local-only legacy translation repair. No household or provider credentials are used.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { extname, join, normalize } from "node:path";

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE);
const root = process.cwd();
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png" };
const english = "Roast the cauliflower until golden. ".repeat(18);
const completeSpanish = "Asa la coliflor hasta que esté dorada. ".repeat(18) + "Termina con tahini y perejil.";
const clippedSpanish = completeSpanish.slice(0, 220);
const today = new Date();
const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
const recipe = { id: "shared-long-step", category: "main", name: { en: "Roasted cauliflower", es: "Coliflor asada" },
  ingredientsText: { en: "1 cauliflower", es: "1 coliflor" },
  stepsText: { en: english, es: clippedSpanish }, photos: [] };
let familyState = { state: { recipeEdits: {}, familyMembers: [], familyPreferences: [], familyRules: {},
  schedule: {}, calendarMeals: { [todayKey]: { items: [{ id: "cauliflower-dinner", recipeId: recipe.id,
    period: "dinner", role: "main", sourceType: "recipe" }] } } }, version: 1 };
let translationCalls = 0;
let writes = 0;
const json = (response, body, status = 200) => {
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
};
const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");
  if (url.pathname === "/.netlify/functions/households") return json(response, { household: { id: "translation-fixture", name: "Test household" } });
  if (url.pathname === "/.netlify/functions/recipes") return json(response, url.searchParams.has("id") ? { recipe } : { recipes: [recipe] });
  if (url.pathname === "/.netlify/functions/schedule") return json(response, {
    schedule: familyState.state.schedule, calendarMeals: familyState.state.calendarMeals, version: familyState.version,
  });
  if (url.pathname === "/.netlify/functions/translate-recipe") {
    translationCalls += 1;
    return json(response, { recipe: { name: "Coliflor asada", ingredientsText: "1 coliflor", stepsText: completeSpanish,
      allergyWarning: "", notes: "" } });
  }
  if (url.pathname === "/.netlify/functions/family-state") {
    if (request.method === "PUT") {
      let raw = "";
      for await (const chunk of request) raw += chunk;
      const body = JSON.parse(raw || "{}");
      if (body.version !== familyState.version) return json(response, familyState, 409);
      familyState = { state: body.state, version: familyState.version + 1 };
      writes += 1;
    }
    return json(response, familyState);
  }
  if (url.pathname.startsWith("/.netlify/functions/")) return json(response, { items: [], state: {}, version: 0 });
  const file = normalize(join(root, url.pathname === "/" ? "index.html" : url.pathname));
  if (!file.startsWith(root)) { response.writeHead(403); response.end(); return; }
  try {
    response.writeHead(200, { "content-type": mime[extname(file)] || "application/octet-stream" });
    response.end(await readFile(file));
  } catch { response.writeHead(404); response.end(); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(() => {
    localStorage.setItem("family-menu-household-key", "fm_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    localStorage.setItem("dinner-lang", "en");
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "networkidle" });
  await page.locator("#householdGate").waitFor({ state: "hidden" });
  await page.locator('button[data-view="schedule"]').click();
  await page.locator(`#scheduleGrid [data-edit-week-date="${todayKey}"]`).first().click();
  await page.locator('#weekDateEditor .meal-item-open[data-open="shared-long-step"]').click();
  assert.equal(await page.locator("#recipesView").isVisible(), true, "Plan's re-rendered Open recipe button must navigate");
  assert.equal(await page.locator("#recipeDetail").isVisible(), true);
  assert.equal(await page.locator("#detailName").textContent(), "Roasted cauliflower");
  await page.locator('header [data-lang="es"]').first().click();
  await page.locator('button[data-view="recipes"]').click();
  await page.locator('#recipeList [data-open="shared-long-step"]').click();
  await page.locator("#repairRecipeTranslation").waitFor({ state: "visible" });
  assert.equal(await page.locator("#startCooking").isEnabled(), false);
  const baselineWrites = writes;
  await page.locator("#repairRecipeTranslation").click();
  await page.locator("#repairRecipeTranslation").waitFor({ state: "hidden" });
  await page.getByText("Termina con tahini y perejil.", { exact: false }).waitFor();
  assert.equal(await page.locator("#startCooking").isEnabled(), true);
  assert.equal(translationCalls, 1);
  assert.equal(writes - baselineWrites, 1);
  assert.equal(familyState.state.recipeEdits[recipe.id].stepsText.en, english.trim());
  assert.equal(familyState.state.recipeEdits[recipe.id].stepsText.es, completeSpanish.trim());
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
  await page.setViewportSize({ width: 360, height: 780 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true);
  const offlineResponse = await page.reload({ waitUntil: "load" });
  assert.equal(offlineResponse?.status(), 200);
  await page.locator("#householdGate").waitFor({ state: "hidden" });
  assert.equal(await page.locator('button[data-view="recipes"]').count(), 1);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ widths: [390, 360], translationCalls, repairWrites: writes - baselineWrites, completeStepSaved: true, overflow: 0, offlineShell: true, pageErrors: 0 }));
  await context.close();
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
