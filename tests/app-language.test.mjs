import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { translations } from "../translations.js";

test("app normalizes unsupported stored language values", async () => {
  const source = await readFile(new URL("../app.js", import.meta.url), "utf8");

  assert.match(source, /function supportedLang\(value\)/);
  assert.match(source, /let lang = supportedLang\(readStringStorage\(localStorage, "dinner-lang", "en"\)\)/);
  assert.match(source, /lang = supportedLang\(button\.dataset\.lang\)/);
});

test("translation helper falls back when current language is missing", async () => {
  const source = await readFile(new URL("../app.js", import.meta.url), "utf8");

  assert.match(source, /const messages = translations\[lang\] \|\| translations\.en/);
  assert.match(source, /return messages\[key\] \|\| translations\.en\[key\] \|\| key/);
});

test("dashboard renderDetail callback is lazy to avoid startup TDZ failures", async () => {
  const source = await readFile(new URL("../app.js", import.meta.url), "utf8");

  assert.match(source, /renderDetail: \(\) => \{\s+renderDetail\(\);/);
  assert.doesNotMatch(source, /createDashboardUi\(\{[\s\S]*?\n  renderDetail,\n/);
});

test("app localizes document language, accessible names, and titles", async () => {
  const app = await readFile(new URL("../app.js", import.meta.url), "utf8");
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

  assert.match(app, /document\.documentElement\.lang = lang/);
  assert.match(app, /\[data-i18n-aria-label\]/);
  assert.match(app, /node\.setAttribute\("aria-label", t\(node\.dataset\.i18nAriaLabel\)\)/);
  assert.match(app, /\[data-i18n-title\]/);
  assert.match(html, /data-i18n-aria-label="taskInputLabel"/);
  assert.match(html, /data-i18n-aria-label="receiptPhotoLabel"/);
});

test("language refresh keeps the current view page title instead of defaulting to Today", async () => {
  const source = await readFile(new URL("../app.js", import.meta.url), "utf8");

  assert.match(source, /function applyViewPageTitle\(/);
  assert.match(source, /pageTitle\.dataset\.i18n = key/);
  assert.match(source, /schedule: "planTab"/);
  assert.match(source, /applyStaticTranslations\(\) \{[\s\S]*applyViewPageTitle\(\);/);
  assert.match(source, /function renderTranslations\(\) \{[\s\S]*applyViewPageTitle\(\);/);
  assert.match(source, /document\.body\.dataset\.view = viewName;\s*applyViewPageTitle\(viewName\)/);
});

test("English and Spanish expose the same translation keys", () => {
  assert.deepEqual(Object.keys(translations.es).sort(), Object.keys(translations.en).sort());
  assert.equal(translations.es.title, "La cena, más fácil.");
  assert.equal(translations.es.categoryLabel, "Categoría");
  assert.match(translations.es.sharedStateError, /teléfono.*sincronizarán.*esté en línea/);
});

test("household menu chrome is localized in English and Spanish", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../app.js", import.meta.url), "utf8");
  for (const key of [
    "shareFamilyKeyHint",
    "familyKeyLabel",
    "copyFamilyKey",
    "rotateFamilyKey",
    "rotateFamilyKeyNote",
    "rotationCodeLabel",
    "createNewFamilyKey",
    "leaveHousehold",
    "leaveHouseholdConfirm",
    "familyKeyCopied",
    "familyKeySelected",
    "familyKeyRotated",
    "rotateFamilyKeyError",
  ]) {
    assert.ok(translations.en[key], `English missing ${key}`);
    assert.ok(translations.es[key], `Spanish missing ${key}`);
  }
  assert.equal(translations.en.familyKeyLabel, "Family key");
  assert.equal(translations.es.familyKeyLabel, "Clave familiar");
  assert.equal(translations.es.copyFamilyKey, "Copiar clave familiar");
  assert.equal(translations.es.leaveHousehold, "Usar otro hogar");
  assert.match(translations.es.shareFamilyKeyHint, /clave/);
  assert.match(html, /data-i18n="shareFamilyKeyHint"/);
  assert.match(html, /id="copyHouseholdKey"[^>]*data-i18n="copyFamilyKey"/);
  assert.match(html, /data-i18n="rotateFamilyKey"/);
  assert.match(html, /id="leaveHousehold"[^>]*data-i18n="leaveHousehold"/);
  assert.match(app, /t\("familyKeyCopied"\)/);
  assert.match(app, /t\("leaveHouseholdConfirm"\)/);
  assert.match(app, /function localizeDisplayed\(/);
});

test("missing recipe language copy names the recipe text, not the whole app", () => {
  assert.equal(translations.en.translationPendingShort, "Recipe text not in English yet");
  assert.equal(translations.es.translationPendingShort, "Aún no hay texto en español");
  assert.doesNotMatch(translations.es.translationPendingShort, /Español aún no disponible/);
  assert.doesNotMatch(translations.en.translationPendingShort, /English not available yet/);
});

test("Help Ask placeholder is an example question, not coming soon", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.equal(translations.en.assistantAskPlaceholder, "What’s for dinner tomorrow?");
  assert.equal(translations.es.assistantAskPlaceholder, "¿Qué hay de cena mañana?");
  assert.match(html, /data-i18n-placeholder="assistantAskPlaceholder"/);
  assert.doesNotMatch(html, /placeholder="Coming soon"/);
  assert.doesNotMatch(translations.en.assistantAskPlaceholder, /coming soon/i);
  assert.doesNotMatch(translations.es.assistantAskPlaceholder, /próximamente/i);
});

test("offline collection status never exposes an internal translation key", () => {
  assert.equal(translations.en.usingSavedCopy, "Offline. Changes will sync when the connection returns.");
  assert.equal(translations.es.usingSavedCopy, "Sin conexión. Los cambios se sincronizarán cuando vuelva la conexión.");
});
