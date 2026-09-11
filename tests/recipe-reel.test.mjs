import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  DRAG_THRESHOLD_PX,
  IMAGE_NEAR_RADIUS,
  isDragGesture,
  isNearIndex,
  itemIdsSignature,
  mostIntersectingIndex,
  nearestIndexByCenters,
  needsSnapCorrection,
  recipeIdFromRecord,
  rememberedIndex,
  scrollLeftToCenter,
  shouldParkMedia,
  usesCustomPointerDrag,
} from "../recipe-reel-logic.js";

test("nearestIndexByCenters picks the card closest to the reel midpoint", () => {
  assert.equal(nearestIndexByCenters([40, 160, 280], 200), 1);
  assert.equal(nearestIndexByCenters([40, 160, 280], 40), 0);
  assert.equal(nearestIndexByCenters([40, 160, 280], 279), 2);
});

test("scrollLeftToCenter leaves equal leftover space on both sides", () => {
  assert.equal(scrollLeftToCenter(80, 240, 390), 5);
  assert.equal(scrollLeftToCenter(0, 308, 390), 0);
  assert.equal(scrollLeftToCenter(440, 320, 1200), 0);
});

test("isDragGesture ignores taps inside the movement threshold", () => {
  assert.equal(isDragGesture(10, 10, 12, 11), false);
  assert.equal(isDragGesture(10, 10, 10 + DRAG_THRESHOLD_PX, 10), true);
  assert.equal(isDragGesture(10, 10, 10, 10 + DRAG_THRESHOLD_PX), true);
});

test("rememberedIndex prefers a still-present recipe id, then a clamped index", () => {
  const ids = ["a", "b", "c", "d"];
  assert.equal(rememberedIndex(ids, { recipeId: "c", index: 0 }, ids.length), 2);
  assert.equal(rememberedIndex(ids, { recipeId: "missing", index: 3 }, ids.length), 3);
  assert.equal(rememberedIndex(ids, { recipeId: "missing", index: 99 }, ids.length), 3);
  assert.equal(rememberedIndex(ids, {}, ids.length), 1);
  assert.equal(rememberedIndex([], { recipeId: "a" }, 0), 0);
});

test("near and parked media stay limited to neighbors of the active card", () => {
  assert.equal(isNearIndex(2, 3), true);
  assert.equal(isNearIndex(0, 3), false);
  assert.equal(shouldParkMedia(0, 3, IMAGE_NEAR_RADIUS), true);
  assert.equal(shouldParkMedia(1, 3, IMAGE_NEAR_RADIUS), false);
  assert.equal(shouldParkMedia(5, 3, IMAGE_NEAR_RADIUS), false);
  assert.equal(shouldParkMedia(6, 3, IMAGE_NEAR_RADIUS), true);
});

test("recipeIdFromRecord reads library, meal, and focused result ids", () => {
  assert.equal(recipeIdFromRecord({ childOpen: "lib-1" }), "lib-1");
  assert.equal(recipeIdFromRecord({ recipeId: "meal-2" }), "meal-2");
  assert.equal(recipeIdFromRecord({ focusedRecipe: "focus-3" }), "focus-3");
  assert.equal(recipeIdFromRecord({}), "");
});

test("item identity changes when the visible recipe set changes", () => {
  const first = itemIdsSignature(["a", "b", "c"]);
  assert.equal(first, itemIdsSignature(["a", "b", "c"]));
  assert.notEqual(first, itemIdsSignature(["a", "c"]));
});

test("mostIntersectingIndex ignores empty ratios and prefers the densest card", () => {
  assert.equal(mostIntersectingIndex([0, 0.2, 0.9, 0.4]), 2);
  assert.equal(mostIntersectingIndex([0, 0, 0]), 0);
});

test("snap correction only runs when the card is materially off-center", () => {
  assert.equal(needsSnapCorrection(100, 101), false);
  assert.equal(needsSnapCorrection(100, 104), true);
});

test("only mouse pointers use custom drag; touch keeps native overflow", () => {
  assert.equal(usesCustomPointerDrag("mouse"), true);
  assert.equal(usesCustomPointerDrag("touch"), false);
  assert.equal(usesCustomPointerDrag("pen"), false);
});

test("native reel CSS snaps to a centered card and disables text selection", async () => {
  const css = await readFile(new URL("../recipe-reel.css", import.meta.url), "utf8");
  assert.match(css, /scroll-snap-type:\s*x mandatory/);
  assert.match(css, /scroll-snap-align:\s*center/);
  assert.match(css, /scroll-padding-inline:\s*var\(--recipe-reel-gutter\)/);
  assert.match(css, /user-select:\s*none/);
  assert.doesNotMatch(css, /swiper/i);
  assert.doesNotMatch(css, /translate3d|perspective\(|rotateY\(/);
});

test("native reel module does not measure every card on every scroll tick", async () => {
  const source = await readFile(new URL("../recipe-reel.js", import.meta.url), "utf8");
  assert.match(source, /IntersectionObserver/);
  assert.match(source, /dataset\.reelSrc/);
  assert.match(source, /suppressClick/);
  assert.doesNotMatch(source, /swiper/i);
  assert.doesNotMatch(source, /addEventListener\("scroll", state\.scrollHandler.*updateActive/);
  assert.match(source, /childList: true, subtree: true/);
  assert.match(source, /mutationAddsSurface/);
});
