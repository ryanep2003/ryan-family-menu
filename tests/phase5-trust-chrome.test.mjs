import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { translations } from "../translations.js";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
const app = await readFile(new URL("../app.js", import.meta.url), "utf8");
const worker = await readFile(new URL("../service-worker.js", import.meta.url), "utf8");

test("Phase 5 cache version is paired across shell and service worker", () => {
  assert.match(html, /styles\.css\?v=204/);
  assert.match(html, /app\.js\?v=204/);
  assert.match(worker, /ryan-family-menu-v204/);
  assert.match(worker, /v203: Phase 5 keeps Plan saves/);
});

test("Plan save writes the schedule record and keeps an unsent edit for reload", () => {
  assert.match(app, /dinner-schedule-pending/);
  assert.match(app, /reconcileLoadedPlan\(/);
  assert.match(app, /code === "empty-overwrite-blocked"/);
  assert.match(app, /clearSchedulePending\(\)/);
  const saveFn = app.match(/async function saveSchedule\([\s\S]*?\n\}/)?.[0] || "";
  assert.match(saveFn, /\/\.netlify\/functions\/schedule/);
  assert.match(saveFn, /writeSchedulePending\(/);
  const emptyGuard = saveFn.indexOf("empty-overwrite-blocked");
  const genericConflict = saveFn.indexOf("error.status === 409 && !conflictRetried");
  assert.ok(emptyGuard > 0);
  assert.ok(genericConflict > emptyGuard);
  const mainEnd = html.indexOf("</main>");
  const barAt = html.indexOf('id="planSaveBar"');
  const weekPanel = html.indexOf('id="weekPlanningPanel"');
  assert.ok(barAt > mainEnd);
  assert.ok(weekPanel > 0 && weekPanel < mainEnd);
  assert.match(css, /\.plan-save-bar\s*\{[\s\S]*position: fixed;/);
  assert.match(css, /\.plan-save-bar \.primary-action\s*\{[\s\S]*background: var\(--navy\)/);
});

test("tab changes restore the previous scroll instead of jumping to the top", () => {
  assert.match(app, /viewScrollAfterChange\(/);
  assert.doesNotMatch(app, /window\.scrollTo\(\{ top: 0/);
});

test("Spanish Family Menu and back-to-Today chrome stay on one line", () => {
  assert.equal(translations.en.eyebrow, "Family Menu");
  assert.equal(translations.es.eyebrow, "Menú familiar");
  assert.equal(translations.en.backToToday, "Back to Today");
  assert.equal(translations.es.backToToday, "Volver a Hoy");
  assert.match(html, /class="brand-name eyebrow"[^>]*data-i18n="eyebrow"/);
  assert.match(html, /id="closeFamily"[^>]*data-i18n="backToToday"/);
  assert.match(css, /\.family-banner > \.ghost-button,\s*\.detail-back,\s*\.lunch-plan-bar \.text-button \{[^}]*white-space: nowrap;/);
  assert.doesNotMatch(css, /\.brand-name \{[^}]*max-width: 8rem/);
  const phoneBrand = css.match(/@media \(max-width: 479px\) \{[\s\S]*?\.brand-lockup \.brand-name \{([^}]*)\}/)?.[1] || "";
  assert.match(phoneBrand, /white-space: nowrap/);
  assert.match(phoneBrand, /max-width: none/);
});
