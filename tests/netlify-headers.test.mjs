import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Netlify serves baseline security headers for the app shell", async () => {
  const source = await readFile(new URL("../netlify.toml", import.meta.url), "utf8");

  assert.match(source, /\[\[headers\]\]/);
  assert.match(source, /for = "\/\*"/);
  assert.match(source, /Content-Security-Policy = "default-src 'self'/);
  assert.match(source, /script-src 'self'/);
  assert.match(source, /style-src 'self'/);
  assert.match(source, /img-src 'self' data: blob:/);
  assert.match(source, /connect-src 'self'/);
  assert.match(source, /frame-ancestors 'none'/);
  assert.match(source, /X-Content-Type-Options = "nosniff"/);
  assert.match(source, /X-Frame-Options = "DENY"/);
  assert.match(source, /Permissions-Policy = "camera=\(self\), microphone=\(\), geolocation=\(\), payment=\(\), usb=\(\)"/);
});
