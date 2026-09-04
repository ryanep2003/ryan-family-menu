import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { translations } from "../translations.js";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
const ui = await readFile(new URL("../schedule-ui.js", import.meta.url), "utf8");
const app = await readFile(new URL("../app.js", import.meta.url), "utf8");

test("dirty Plan surfaces a persistent navy Save control that stays on screen", () => {
  assert.match(html, /id="planSaveBar"[^>]*data-plan-save-bar/);
  assert.match(html, /id="planSaveBarButton"[^>]*data-plan-save-bar-button[^>]*data-i18n="saveMealChanges"/);
  assert.match(css, /\.plan-save-bar\s*\{[\s\S]*position: fixed;/);
  assert.match(css, /\.plan-save-bar\s*\{[\s\S]*bottom: var\(--bottom-nav-space\)/);
  assert.match(css, /\.plan-save-bar \.primary-action\s*\{[\s\S]*background: var\(--navy\)/);
  assert.match(ui, /syncPlanSaveBar\(\{ dirty: true, saving: true/);
  assert.match(ui, /await saveMealContext\(context\)/);
  assert.match(app, /scheduleSaveQueued = true/);
});

test("Plan save copy stays in English and Spanish parity", () => {
  assert.equal(translations.en.saveMealChanges, "Save changes");
  assert.equal(translations.es.saveMealChanges, "Guardar cambios");
  assert.equal(translations.en.planUnsavedHint, "Unsaved meal changes");
  assert.equal(translations.es.planUnsavedHint, "Cambios de comidas sin guardar");
  assert.ok(translations.en.mealChangeSaved);
  assert.ok(translations.es.mealChangeSaved);
});
