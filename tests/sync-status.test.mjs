import assert from "node:assert/strict";
import test from "node:test";

import { formatSyncTime, renderSyncStatus } from "../sync-status.js";

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
  const date = new Date("2026-07-10T18:30:00Z");
  const english = formatSyncTime("en", date);
  const spanish = formatSyncTime("es", date);

  assert.match(english, /AM|PM/);
  assert.match(spanish, /a\.\s*m\.|p\.\s*m\./i);
});
