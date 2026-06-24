import assert from "node:assert/strict";
import test from "node:test";

import { readLimitedText, safeUrl } from "../netlify/functions/import-recipe-url.js";

test("safeUrl allows public http and https URLs", () => {
  assert.equal(safeUrl("https://example.com/recipe")?.href, "https://example.com/recipe");
  assert.equal(safeUrl("http://example.com/recipe")?.href, "http://example.com/recipe");
});

test("safeUrl blocks local and private-network URLs", () => {
  const blocked = [
    "file:///etc/passwd",
    "https://localhost/recipe",
    "https://127.0.0.1/recipe",
    "https://10.0.0.4/recipe",
    "https://172.16.0.4/recipe",
    "https://192.168.1.2/recipe",
    "https://169.254.169.254/latest/meta-data/",
    "https://[::1]/recipe",
  ];

  for (const url of blocked) {
    assert.equal(safeUrl(url), null, url);
  }
});

test("readLimitedText reads bodies within the byte limit", async () => {
  const text = await readLimitedText(new Response("recipe page"), 100);

  assert.equal(text, "recipe page");
});

test("readLimitedText rejects oversized content-length headers", async () => {
  const text = await readLimitedText(new Response("small", {
    headers: { "content-length": "100" },
  }), 10);

  assert.equal(text, null);
});

test("readLimitedText rejects oversized streamed bodies", async () => {
  const text = await readLimitedText(new Response("this body is too large"), 10);

  assert.equal(text, null);
});
