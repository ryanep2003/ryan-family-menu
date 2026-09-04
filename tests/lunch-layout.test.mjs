import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../app.js", import.meta.url), "utf8");
const ui = await readFile(new URL("../lunch-ui.js", import.meta.url), "utf8");
const styles = await readFile(new URL("../styles.css", import.meta.url), "utf8");

test("School Lunches stays available from Plan without occupying the bottom nav", () => {
  assert.match(html, /id="lunchesView"/);
  assert.match(html, /data-view-target="lunches"/);
  assert.match(html, /data-i18n="planLunchesEntry"/);
  assert.doesNotMatch(html, /class="tabs"[\s\S]*data-view="lunches"/);
  assert.match(app, /createLunchUi/);
  assert.match(app, /lunchUi\.render\(\)/);
  assert.match(app, /lunchUi\.bind\(\)/);
});

test("lunch workflows remain vertical and thumb-friendly on phones", () => {
  assert.match(styles, /\.lunch-component-card[^{]*\{[^}]*min-height: 108px/);
  assert.match(styles, /\.lunch-swap-button[^{]*\{[^}]*min-height: 44px/);
  assert.match(styles, /\.packing-check[^{]*\{[^}]*min-height: 64px/);
  assert.match(styles, /\.lunch-builder-actions[^{]*\{[^}]*position: sticky/);
  assert.match(styles, /\.lunch-week-days \{ border-bottom:/);
  assert.match(styles, /@media \(min-width: 960px\)[\s\S]*?\.lunch-week-days \{ display: grid/);
});

test("the lunch UI exposes all required fast paths without a chatbot", () => {
  for (const marker of [
    "data-generate-lunch",
    "data-swap-component",
    "data-fill-week",
    "data-day-type",
    "data-open-packing",
    "data-rate-food",
    "data-save-combination",
  ]) assert.match(ui, new RegExp(marker));
  assert.match(ui, /data-approve-builder\$\{complete \? "" : " disabled"\}/);
  assert.match(ui, /lunchNeedsSafeOption/);
  assert.match(ui, /planIsSafeFor\(member\.id, state\(\)\.plans\[dateKey\]\[member\.id\]\)/);
  assert.match(ui, /foodAllowedFor\(builder\.memberId, food\)/);
  assert.match(ui, /persist\(next, \{ groceries: replacedApprovedPlan \}\)/);
  assert.match(ui, /id="lunchBuilderHeading" tabindex="-1"/);
  assert.match(ui, /id="lunchSwapHeading" tabindex="-1"/);
  assert.doesNotMatch(ui, /chat|prompt|message composer/i);
});

test("approved lunches rebuild the existing planned grocery contribution", () => {
  assert.match(app, /approvedLunchFoodUses/);
  assert.match(app, /generatedSchoolLunchGroceries/);
  assert.match(app, /approvedLunchDateKeys\(schoolLunches/);
  assert.match(app, /replacePlannedGroceries\(groceries, generatedGroceriesFromPlan\(range, upcomingLunchDates\)\)/);
  assert.match(app, /recipeGroceries\(recipe, "meal-plan"/);
  assert.match(ui, /replacedApprovedPlan/);
  assert.match(ui, /persist\(next, \{ groceries: replacedApprovedPlan \}\)/);
});
