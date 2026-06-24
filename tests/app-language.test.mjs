import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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
