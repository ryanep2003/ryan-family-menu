import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

function pngDimensions(buffer) {
  assert.equal(buffer.toString("ascii", 1, 4), "PNG");
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

test("home screen metadata uses dedicated app icons", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const manifest = JSON.parse(await readFile(new URL("../manifest.webmanifest", import.meta.url), "utf8"));

  assert.match(html, /rel="apple-touch-icon" href="assets\/app-icon-180\.png"/);
  assert.match(html, /rel="icon" href="assets\/app-icon\.svg" type="image\/svg\+xml"/);
  assert.deepEqual(
    manifest.icons.map(({ src, sizes, type }) => ({ src, sizes, type })),
    [
      { src: "assets/app-icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "assets/app-icon-512.png", sizes: "512x512", type: "image/png" },
    ]
  );
  assert.doesNotMatch(JSON.stringify(manifest.icons), /meatballs|\.jpg/i);
});

test("raster app icons have their declared dimensions", async () => {
  const icons = [
    ["app-icon-180.png", 180],
    ["app-icon-192.png", 192],
    ["app-icon-512.png", 512],
  ];

  for (const [name, size] of icons) {
    const buffer = await readFile(new URL("../assets/" + name, import.meta.url));
    assert.deepEqual(pngDimensions(buffer), { width: size, height: size });
  }
});
