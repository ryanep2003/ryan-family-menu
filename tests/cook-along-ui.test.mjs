import assert from "node:assert/strict";
import test from "node:test";
import { durationSeconds, formatTimer } from "../cook-along-ui.js";

test("Cook Along detects practical timer durations in recipe steps", () => {
  assert.equal(durationSeconds("Bake for 25 minutes until golden."), 1500);
  assert.equal(durationSeconds("Rest 1 hour before serving."), 3600);
  assert.equal(durationSeconds("Chop the herbs."), 0);
});

test("Cook Along formats timers for glanceable kitchen use", () => {
  assert.equal(formatTimer(0), "0:00");
  assert.equal(formatTimer(65), "1:05");
  assert.equal(formatTimer(600), "10:00");
});
