// Controlled, local-only smoke harness for Family Help. It never uses a
// household key or production data. Screenshots stay in ignored test-artifacts.
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const root = normalize(join(dirname(fileURLToPath(import.meta.url)), ".."));
const artifacts = join(root, "test-artifacts", "assistant-browser");
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png" };
let workerRevision = 180;
let serveHeadRelease = false;
const execFileAsync = promisify(execFile);
const releaseRevision = "528d6c65f01bc55b1b60be231c1981b076e49b2e"; // Last released v177 shell, not mutable HEAD.
const fixtureDate = "2026-09-10";
const recipePesto = { id: "pesto", name: { en: "Pesto pasta", es: "Pasta al pesto" }, ingredientsText: { en: "fresh basil\npasta", es: "albahaca fresca\npasta" }, stepsText: { en: "Blend basil.", es: "Licua la albahaca." }, category: "main", servings: 4 };
const recipeTacos = { id: "tacos", name: { en: "Tacos", es: "Tacos" }, ingredientsText: { en: "tortillas", es: "tortillas" }, stepsText: { en: "Warm tortillas.", es: "Calienta las tortillas." }, category: "main", servings: 4 };
const canonicalGroceries = () => [{ id: "basil", text: { en: "Basil", es: "Albahaca" }, checked: false, source: "meal-plan", ingredientKey: "basil", mealUses: [{ dateKey: fixtureDate, mealSlot: "dinner", recipeId: "pesto", recipeName: recipePesto.name }] }];
const canonicalInventory = () => [{ id: "oil", text: { en: "Olive oil", es: "Aceite de oliva" }, amount: 1, unit: "bottle", location: "pantry", stockState: "some" }];
const canonicalState = () => ({ weekStartKey: "2026-09-07", schedule: {}, calendarMeals: { [fixtureDate]: { items: [{ id: "pesto-dinner", period: "dinner", role: "main", sourceType: "recipe", recipeId: "pesto" }], servingPlans: { dinner: { adults: 2, kids: 0, guests: 0, actualLeftovers: {} } } } }, familyMembers: [{ id: "member-1", name: "Avery", restrictions: [] }], familyPreferences: {}, familyRules: {} });
const browserState = {
  groceries: canonicalGroceries(), inventory: canonicalInventory(), state: canonicalState(),
  groceryVersion: 1, inventoryVersion: 1, stateVersion: 1, groceryWrites: [], inventoryWrites: [], stateWrites: [], assistantRequests: [], requestLog: [], failNextGroceryPut: false,
};

function resetCanonicalRecords() {
  browserState.groceries = canonicalGroceries();
  browserState.inventory = canonicalInventory();
  browserState.state = canonicalState();
  browserState.groceryVersion = 1;
  browserState.inventoryVersion = 1;
  browserState.stateVersion = 1;
  browserState.groceryWrites = [];
  browserState.inventoryWrites = [];
  browserState.stateWrites = [];
  browserState.failNextGroceryPut = false;
}

async function staticContent(pathname) {
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\//, "");
  if (serveHeadRelease) return (await execFileAsync("git", ["show", `${releaseRevision}:${relative}`], { cwd: root, encoding: "buffer" })).stdout;
  return readFile(normalize(join(root, relative)));
}

function json(response, body) {
  response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

async function requestBody(request) {
  let value = "";
  for await (const chunk of request) value += chunk;
  try { return JSON.parse(value || "{}"); } catch { return {}; }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");
  browserState.requestLog.push(`${request.method} ${url.pathname}`);
  if (url.pathname === "/.netlify/functions/households") return json(response, { household: { id: "harness-home", name: "Harness household" } });
  if (url.pathname === "/.netlify/functions/groceries") {
    if (request.method === "PUT") {
      const body = await requestBody(request);
      if (browserState.failNextGroceryPut) {
        browserState.failNextGroceryPut = false;
        response.writeHead(503, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "Controlled grocery save failure." }));
        return;
      }
      browserState.groceries = Array.isArray(body.items) ? body.items : [];
      browserState.groceryWrites.push(browserState.groceries);
      browserState.groceryVersion += 1;
    }
    return json(response, { items: browserState.groceries, version: browserState.groceryVersion });
  }
  if (url.pathname === "/.netlify/functions/inventory") {
    if (request.method === "PUT") {
      const body = await requestBody(request);
      browserState.inventory = Array.isArray(body.items) ? body.items : [];
      browserState.inventoryWrites.push(browserState.inventory);
      browserState.inventoryVersion += 1;
    }
    return json(response, { items: browserState.inventory, version: browserState.inventoryVersion });
  }
  if (url.pathname === "/.netlify/functions/family-state") {
    if (request.method === "PUT") {
      const body = await requestBody(request);
      browserState.state = body.state || browserState.state;
      browserState.stateWrites.push(browserState.state);
      browserState.stateVersion += 1;
    }
    return json(response, { state: browserState.state, version: browserState.stateVersion });
  }
  if (url.pathname === "/.netlify/functions/schedule") {
    if (request.method === "PUT") {
      const body = await requestBody(request);
      browserState.state = { ...browserState.state, schedule: body.schedule || {}, calendarMeals: body.calendarMeals || {}, weekStartKey: body.weekStartKey || browserState.state.weekStartKey };
      browserState.stateWrites.push(browserState.state);
      browserState.stateVersion += 1;
    }
    return json(response, { schedule: browserState.state.schedule, calendarMeals: browserState.state.calendarMeals, weekStartKey: browserState.state.weekStartKey, version: browserState.stateVersion });
  }
  if (url.pathname === "/.netlify/functions/recipes") return json(response, { recipes: [recipePesto, recipeTacos] });
  if (url.pathname === "/.netlify/functions/assistant") {
    const body = await requestBody(request);
    if (`${body.question || ""}`.includes("Force failure")) { response.writeHead(503, { "content-type": "application/json" }); response.end(JSON.stringify({ error: "Family Help mock failure." })); return; }
    browserState.assistantRequests.push(body);
    const ids = new Set((body.context?.sources || []).map((source) => source.id));
    const spanish = body.language === "es";
    const reply = (answer, sources, type = "none", sourceId = "", args = {}) => ({ answer, sources, action: { type, sourceId, args: { dateKeys: null, dateKey: null, fromDateKey: null, recipeSourceId: null, period: null, mode: null, servings: null, text: null, store: null, checked: null, location: null, stockState: null, amount: null, unit: null, ...args } } });
    const question = `${body.question || ""}`.toLowerCase();
    if (question.includes("mark basil")) return json(response, reply("I can mark the cited basil row bought.", ["grocery:basil"], "edit_grocery", "grocery:basil", { checked: true }));
    if (question.includes("basil") || question.includes("albahaca")) {
      if (!["meal:2026-09-10", "recipe:pesto", "grocery:basil"].every((id) => ids.has(id))) return json(response, { error: "Harness did not receive the canonical basil context." });
      return json(response, reply(spanish ? "La Pasta al pesto del jueves incluye albahaca fresca; la lista muestra Albahaca sin marcar como comprada." : "Thursday's Pesto pasta lists fresh basil; the grocery row is not checked as bought.", ["meal:2026-09-10", "recipe:pesto", "grocery:basil"]));
    }
    if (question.includes("add parsley")) return json(response, reply("I can prepare parsley for the shopping list.", [], "add_grocery", "", { text: "Parsley", store: "Produce" }));
    if (question.includes("add olive oil")) return json(response, reply("I can add olive oil at home.", [], "add_inventory", "", { text: "Olive oil", location: "pantry", stockState: "some", amount: 1, unit: "bottle" }));
    if (question.includes("mark olive oil")) return json(response, reply("I can update the cited oil stock.", ["inventory:oil"], "update_inventory", "inventory:oil", { stockState: "low", amount: 0.5 }));
    if (question.includes("record two leftovers")) return json(response, reply("I can record two actual leftovers for Thursday.", ["meal:2026-09-10", "recipe:pesto"], "update_leftovers", "", { dateKey: fixtureDate, recipeSourceId: "recipe:pesto", servings: 2 }));
    if (question.includes("replace thursday")) return json(response, reply("I can replace Thursday dinner with tacos.", ["recipe:tacos", "meal:2026-09-10"], "change_meal", "", { dateKey: fixtureDate, recipeSourceId: "recipe:tacos", period: "dinner", mode: "replace" }));
    return json(response, reply("I need a supported Family Help request.", []));
  }
  if (url.pathname.startsWith("/.netlify/functions/")) return json(response, { state: {}, items: [], version: 0, recipes: [], receipts: [], lists: [] });
  if (url.pathname === "/service-worker.js") {
    response.writeHead(200, { "content-type": "text/javascript", "cache-control": "no-store" });
    response.end((await staticContent(url.pathname)).toString("utf8").replace(/ryan-family-menu-v\d+/, `ryan-family-menu-v${workerRevision}`));
    return;
  }
  const target = normalize(join(root, url.pathname === "/" ? "index.html" : url.pathname));
  if (!target.startsWith(root)) { response.writeHead(403); response.end(); return; }
  try {
    response.writeHead(200, { "content-type": mime[extname(target)] || "application/octet-stream" });
    response.end(await staticContent(url.pathname));
  } catch { response.writeHead(404); response.end(); }
});

await mkdir(artifacts, { recursive: true });
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  // Exercise the actual checked-in release shell/cache (v177) before serving
  // this worktree's final shell (v180) as its update.
  serveHeadRelease = true;
  workerRevision = 177;
  const releaseContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await releaseContext.addInitScript(() => localStorage.setItem("family-menu-household-key", "fm_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
  const releasePage = await releaseContext.newPage();
  await releasePage.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
  await releasePage.locator("#householdGate").waitFor({ state: "hidden" });
  await releasePage.evaluate(async () => { await navigator.serviceWorker.ready; });
  await releaseContext.setOffline(true);
  await releasePage.reload({ waitUntil: "domcontentloaded" });
  await releasePage.locator("#assistantHelpToday").waitFor();
  await releaseContext.setOffline(false);
  serveHeadRelease = false;
  workerRevision = 180;
  const controllerChanged = releasePage.evaluate(() => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("service worker did not take control")), 10000);
    navigator.serviceWorker.addEventListener("controllerchange", () => { clearTimeout(timer); resolve(); }, { once: true });
  }));
  await releasePage.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update());
  await controllerChanged;
  await releasePage.reload({ waitUntil: "networkidle" });
  const releaseResult = await releasePage.evaluate(async () => ({ scripts: [...document.scripts].map((script) => script.src), caches: await caches.keys() }));
  if (!releaseResult.scripts.some((src) => src.includes("app.js?v=180")) || !releaseResult.caches.includes("ryan-family-menu-v180")) throw new Error(`release update did not activate: ${JSON.stringify(releaseResult)}`);
  await releaseContext.setOffline(true);
  await releasePage.reload({ waitUntil: "domcontentloaded" });
  await releasePage.locator("#assistantHelpToday").waitFor();
  await releaseContext.setOffline(false);
  await releaseContext.close();
  // The old release shell is allowed to issue its own bootstrap saves; restore
  // the canonical synthetic household before the current-app assertions begin.
  resetCanonicalRecords();
  for (const [name, viewport] of [["desktop-en", { width: 1280, height: 900 }], ["mobile-es", { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport });
    await context.addInitScript(() => {
      const NativeDate = Date;
      class FixtureDate extends NativeDate {
        constructor(...args) { super(...(args.length ? args : ["2026-09-08T12:00:00"])); }
        static now() { return new NativeDate("2026-09-08T12:00:00").getTime(); }
      }
      globalThis.Date = FixtureDate;
      localStorage.setItem("family-menu-household-key", "fm_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    const pageErrors = [];
    const requestFailures = [];
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("requestfailed", (request) => requestFailures.push(`${request.method()} ${new URL(request.url()).pathname}: ${request.failure()?.errorText || "failed"}`));
    try {
      await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle", timeout: 15000 });
      await page.locator("#householdGate").waitFor({ state: "hidden" });
      await page.locator("#groceryList").getByText("Basil").waitFor({ state: "attached" });
      if (name === "mobile-es") await page.getByRole("button", { name: "ES" }).click();
      await page.locator("#assistantHelpToday").click();
      await page.locator("#assistantAskInput").fill(name === "mobile-es" ? "¿Qué pasó con la albahaca el jueves?" : "What happened to basil Thursday?");
      await page.locator("#assistantAskSubmit").click();
      await page.getByText(name === "mobile-es" ? "La Pasta al pesto" : "Thursday's Pesto pasta").waitFor();
      if (await page.locator(".assistant-source-card").count() < 3) throw new Error(`${name}: canonical basil sources were not rendered`);
      const posted = browserState.assistantRequests.at(-1);
      const postedIds = new Set((posted?.context?.sources || []).map((source) => source.id));
      if (posted?.language !== (name === "mobile-es" ? "es" : "en") || !["meal:2026-09-10", "recipe:pesto", "grocery:basil"].every((id) => postedIds.has(id))) throw new Error(`${name}: canonical basil context was not posted`);
      const sizes = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, inputFont: getComputedStyle(document.querySelector("#assistantAskInput")).fontSize }));
      if (sizes.scrollWidth !== sizes.clientWidth || (name === "mobile-es" && sizes.inputFont !== "16px") || errors.length || pageErrors.length || requestFailures.length) throw new Error(`${name}: ${JSON.stringify({ sizes, errors, pageErrors, requestFailures })}`);
      await page.screenshot({ path: join(artifacts, `${name}.png`), fullPage: true });
      if (name === "desktop-en") {
      const openAssistant = async () => {
        const newConversation = page.locator("[data-assistant-new]");
        if (!(await newConversation.isVisible())) await page.locator("#assistantHelpToday").click();
        await newConversation.waitFor({ state: "visible" });
      };
      const apply = async (question, endpoint) => {
        await openAssistant();
        await page.locator("[data-assistant-new]").click();
        await page.locator("#assistantAskInput").fill(question);
        await page.locator("#assistantAskSubmit").click();
        await page.locator("[data-assistant-conversation-action]").click();
        await page.locator(".assistant-proposal-diff").waitFor();
        const saved = page.waitForResponse((res) => new URL(res.url()).pathname === endpoint && res.request().method() === "PUT");
        await page.locator("#assistantApply").click();
        await saved;
        await page.locator("#assistantSheet").waitFor({ state: "hidden" });
      };
      browserState.failNextGroceryPut = true;
      await openAssistant();
      await page.locator("[data-assistant-new]").click();
      await page.locator("#assistantAskInput").fill("Add parsley");
      await page.locator("#assistantAskSubmit").click();
      await page.locator("[data-assistant-conversation-action]").click();
      await page.locator(".assistant-proposal-diff").waitFor();
      await page.locator("#assistantApply").click();
      await page.locator("#assistantStatus").getByText("Could not save yet. Try again when the site is online.").waitFor();
      await page.locator("#assistantClose").click();
      await openAssistant();
      await page.locator("[data-assistant-conversation-action]").click();
      await page.locator(".assistant-proposal-diff").waitFor();
      const retrySaved = page.waitForResponse((res) => new URL(res.url()).pathname === "/.netlify/functions/groceries" && res.request().method() === "PUT");
      await page.locator("#assistantApply").click();
      await retrySaved;
      await page.locator("#assistantSheet").waitFor({ state: "hidden" });
      if (browserState.groceries.filter((item) => item.text?.en === "Parsley").length !== 1) throw new Error("failed additive proposal did not retry as one frozen record");
      await apply("Add parsley", "/.netlify/functions/groceries");
      if (browserState.groceries.filter((item) => item.text?.en === "Parsley").length !== 2) throw new Error("intentionally repeated proposal did not create a new operation");
      await apply("Mark basil bought", "/.netlify/functions/groceries");
      await apply("Add olive oil at home", "/.netlify/functions/inventory");
      await apply("Mark olive oil low", "/.netlify/functions/inventory");
      await apply("Record two leftovers", "/.netlify/functions/schedule");
      await apply("Replace Thursday dinner with tacos", "/.netlify/functions/schedule");
      if (!browserState.groceries.find((item) => item.id === "basil")?.checked || browserState.inventory.filter((item) => item.text?.en === "Olive oil").length < 2 || browserState.inventory.find((item) => item.id === "oil")?.stockState !== "low" || browserState.state.calendarMeals?.[fixtureDate]?.items?.some((item) => item.recipeId !== "tacos")) throw new Error("controlled action writes did not preserve expected records");
      await page.reload({ waitUntil: "networkidle" });
      await page.locator('[data-view="grocery"]').click();
      await page.locator("#groceryList").getByText("Parsley").first().waitFor();
      const basilCheckbox = page.locator('#groceryList input[data-grocery-id="basil"]');
      if (!(await page.locator("#groceryList").textContent()).includes("Basil") || !(await basilCheckbox.isChecked())) throw new Error("grocery reload did not render the saved checked row from its collection envelope");
      if (!(await page.locator("#inventoryList").textContent()).includes("Olive oil")) throw new Error("inventory reload did not render the saved collection envelope");
      await page.locator('[data-view="today"]').click();
      await page.locator("#assistantHelpToday").click();
      await page.locator("[data-assistant-new]").click();
      await page.locator("#assistantAskInput").fill("Force failure");
      await page.locator("#assistantAskSubmit").click();
      await page.locator("#assistantStatus").getByText("Family Help could not answer right now.").waitFor();
      await page.screenshot({ path: join(artifacts, "desktop-en-failure.png"), fullPage: true });
      await page.evaluate(async () => { await navigator.serviceWorker.ready; });
      await context.setOffline(true);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.locator("#assistantHelpToday").waitFor();
      await context.setOffline(false);
      await page.reload({ waitUntil: "networkidle" });
      if (!browserState.groceries.some((item) => item.text?.en === "Parsley")) throw new Error("saved grocery did not survive the controlled reload");
      }
    } catch (error) {
      const status = await page.locator("#assistantStatus").textContent().catch(() => "");
      const groceryMarkup = await page.locator("#groceryList").innerHTML().catch(() => "");
      const snapshot = { error: error.message, status, errors, pageErrors, requestFailures, groceryMarkup, requestLog: browserState.requestLog, lastAssistantRequest: browserState.assistantRequests.at(-1) || null };
      await page.screenshot({ path: join(artifacts, `${name}-failure.png`), fullPage: true }).catch(() => {});
      await writeFile(join(artifacts, `${name}-failure.json`), JSON.stringify(snapshot, null, 2));
      throw new Error(`${name} harness failed; synthetic evidence: ${join(artifacts, `${name}-failure.json`)}\n${error.message}`);
    } finally { await context.close(); }
  }
  process.stdout.write(`Family Help browser evidence: ${artifacts}\n`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
