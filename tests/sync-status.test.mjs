import assert from "node:assert/strict";
import test from "node:test";

import { formatSyncTime, formatSyncedAtMessage, renderSyncStatus, syncRetryLabel } from "../sync-status.js";

test("sync recovery always uses a simple retry label", () => {
  assert.equal(syncRetryLabel("shared", "sharedMenuUnavailable"), "retrySync");
  assert.equal(syncRetryLabel("shared", "savedLocallyPending"), "retrySync");
  assert.equal(syncRetryLabel("groceries", "savedLocallyPending"), "retrySync");
});

test("shared menu recovery copy does not ask families to choose a device copy", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) => readFile(new URL("../translations.js", import.meta.url), "utf8"));
  assert.doesNotMatch(source, /Reload shared menu|Using the copy saved on this device/);
  assert.match(source, /Can’t reach the shared menu/);
});

test("normal shared menu startup stays visually quiet", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) => readFile(new URL("../app.js", import.meta.url), "utf8"));
  assert.doesNotMatch(source, /setSyncStatus\("shared", "connectingSharedMenu"/);
  assert.match(source, /if \(area === "shared"\) \{\s*clearAreaStatus\(area\)/);
});

test("same-device save conflicts stay a pending sync state", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) => readFile(new URL("../app.js", import.meta.url), "utf8"));
  assert.match(source, /if \(!retrying\) return performSaveSharedState\(\{ retrying: true, allowEmptySchedule, auditAction \}\);\s*\/\/ A second conflict/);
  assert.match(source, /setSyncStatus\("shared", "savedLocallyPending", \{ state: "pending", canRetry: true \}\);/);
  assert.doesNotMatch(source, /if \(!retrying\)[\s\S]{0,220}setSyncStatus\("shared", "sharedStateConflict", \{ state: "error" \}\)/);
});

function classList() {
  const values = new Set();
  return {
    contains: (value) => values.has(value),
    toggle(value, force) {
      if (force) values.add(value);
      else values.delete(value);
    },
  };
}

test("renderSyncStatus shows a retry for pending device-only changes", () => {
  const status = { textContent: "", classList: classList() };
  const retryButton = { hidden: true };

  renderSyncStatus({
    status,
    retryButton,
    message: "Saved on this device. Waiting to sync.",
    state: "pending",
    canRetry: true,
  });

  assert.equal(status.textContent, "Saved on this device. Waiting to sync.");
  assert.equal(status.classList.contains("pending"), true);
  assert.equal(status.classList.contains("error"), false);
  assert.equal(retryButton.hidden, false);
});

test("renderSyncStatus clears pending and retry after synchronization", () => {
  const status = { textContent: "", classList: classList() };
  const retryButton = { hidden: false };

  renderSyncStatus({
    status,
    retryButton,
    message: "Synced at 2:30 PM.",
  });

  assert.equal(status.classList.contains("pending"), false);
  assert.equal(status.classList.contains("error"), false);
  assert.equal(retryButton.hidden, true);
});

test("formatSyncTime uses the selected language locale", () => {
  const now = new Date("2026-09-04T18:30:00Z");
  const date = new Date("2026-09-04T18:30:00Z");
  const english = formatSyncTime("en", date, now);
  const spanish = formatSyncTime("es", date, now);

  assert.match(english, /AM|PM/);
  assert.match(spanish, /a\.\s*m\.?|p\.\s*m\.?/i);
  assert.doesNotMatch(spanish, /\.$/);
  assert.doesNotMatch(`Sincronizado a las ${spanish}.`, /\.\.$/);
  assert.doesNotMatch(english, /Sep|Sept|Jul/);
});

test("formatSyncTime includes the date when the last sync is not today", () => {
  const now = new Date("2026-09-04T18:30:00Z");
  const earlier = new Date("2026-09-03T12:24:00Z");
  const english = formatSyncTime("en", earlier, now);
  assert.match(english, /Sep|Sept/);
  assert.match(english, /3/);
});

test("Spanish synced-at copy does not add a second period after a.m.", () => {
  const now = new Date("2026-09-04T12:24:00Z");
  const message = formatSyncedAtMessage("es", "Sincronizado a las {time}.", now, now);
  assert.match(message, /Sincronizado a las /);
  assert.doesNotMatch(message, /\.\s*\.$/);
  assert.doesNotMatch(message, /m\.\.$/i);
});

test("English synced-at copy keeps a single sentence period", () => {
  const now = new Date("2026-09-04T18:30:00Z");
  const message = formatSyncedAtMessage("en", "Synced at {time}.", now, now);
  assert.match(message, /^Synced at .+[AP]M\.$/);
});
