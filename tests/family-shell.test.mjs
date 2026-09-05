import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
const app = await readFile(new URL("../app.js", import.meta.url), "utf8");
const ui = await readFile(new URL("../schedule-ui.js", import.meta.url), "utf8");
const utils = await readFile(new URL("../schedule-utils.js", import.meta.url), "utf8");

test("the family shell keeps four tabs and opens lunches from Plan", () => {
  const tabBlock = html.match(/<nav class="tabs"[\s\S]*?<\/nav>/)?.[0] || "";
  const tabViews = [...tabBlock.matchAll(/data-view="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(tabViews, ["today", "schedule", "grocery", "recipes"]);
  assert.match(html, /data-i18n="todayTab"/);
  assert.match(html, /data-i18n="planTab"/);
  assert.match(html, /data-i18n="shopTab"/);
  assert.match(html, /data-i18n="libraryTab"/);
  assert.doesNotMatch(tabBlock, /data-view="lunches"/);
  assert.match(html, /class="plan-lunches-entry"[^>]*data-view-target="lunches"/);
  assert.match(html, /id="lunchesView"/);
  assert.match(app, /viewName === "lunches" \? "schedule"/);
});

test("Plan keeps a sticky navy Save bar and next-week calendar persist", () => {
  assert.match(html, /id="planSaveBar"[^>]*data-plan-save-bar/);
  assert.match(html, /id="planSaveBarButton"[^>]*data-i18n="saveMealChanges"/);
  const saveBarRule = css.match(/\.plan-save-bar\s*\{([^}]*)\}/)?.[1] || "";
  assert.match(saveBarRule, /position: fixed;/);
  assert.match(saveBarRule, /bottom: var\(--bottom-nav-space\)/);
  assert.match(css, /\.plan-save-bar \.primary-action\s*\{[\s\S]*background: var\(--navy\)/);
  assert.match(ui, /syncPlanSaveBar\(\{ dirty: true/);
  assert.match(app, /scheduleSaveQueued = true/);
  assert.match(utils, /mode: "calendar"/);
  assert.match(utils, /mode: "week-template"/);
});

test("navy/sage controls stay filled while the bought-item transfer remains compact", () => {
  assert.match(css, /--navy: #1A3A5C/);
  assert.match(css, /--sage: #CFE8D5/);
  assert.match(css, /--soft-blue: #AFCBFF/);
  assert.match(css, /--ground: #F5F1EA/);
  assert.match(css, /\.today-shop-button \{[^}]*background: var\(--navy\)/);
  assert.match(css, /\.today-find-button \{[^}]*background: var\(--soft-blue\)/);
  assert.match(css, /\.week-day-add \{[^}]*background: var\(--soft-blue\)/);
  assert.match(css, /\.week-day-card\.is-today \{[^}]*var\(--sage\)/);
  assert.match(css, /\.inventory-mode-switch \{[\s\S]*grid-template-columns: 1fr 1fr/);
  const finishPromptRule = css.match(/\.finish-shopping-prompt\s*\{([^}]*)\}/)?.[1] || "";
  const finishSpanRule = css.match(/\.finish-shopping-prompt span\s*\{([^}]*)\}/)?.[1] || "";
  assert.match(finishPromptRule, /border-top: 1px solid var\(--rule\)/);
  assert.match(finishPromptRule, /color: var\(--ink\)/);
  assert.match(finishSpanRule, /var\(--muted\)/);
  assert.match(css, /\.soft-action[\s\S]*background: var\(--soft-blue\)/);
});

test("Library search is the first library control and IDs stay unique", () => {
  assert.ok(html.indexOf('id="recipeLibraryTools"') < html.indexOf('id="recipePicksSection"'));
  assert.ok(html.indexOf('id="recipeSearch"') < html.indexOf('id="recipePicksSection"'));
  assert.ok(html.indexOf('id="recipeLibraryTools"') < html.indexOf('class="section-heading view-banner recipe-banner"'));
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual(duplicates, []);
});

test("family preference section links are styled as compact chips", () => {
  assert.match(html, /class="family-section-links"/);
  assert.match(css, /\.family-section-links\s*\{/);
  assert.match(css, /\.family-section-links a\s*\{/);
});
