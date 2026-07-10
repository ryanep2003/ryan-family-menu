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

  assert.match(source, /renderDetail: \(\) => renderDetail\(\)/);
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

test("English and Spanish expose the same translation keys", () => {
  assert.deepEqual(Object.keys(translations.es).sort(), Object.keys(translations.en).sort());
  assert.equal(translations.es.title, "La cena, más fácil.");
  assert.equal(translations.es.categoryLabel, "Categoría");
  assert.match(translations.es.sharedStateError, /teléfono.*sincronizarán.*esté en línea/);
});
