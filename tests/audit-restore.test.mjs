import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createAuditUi } from "../audit-ui.js";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../app.js", import.meta.url), "utf8");
const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");

test("Restore this menu writes the Plan schedule record after applying the snapshot", () => {
  const restoreFn = app.match(/async function restoreAuditSnapshot\([\s\S]*?\n\}/)?.[0] || "";
  assert.match(restoreFn, /applySharedState\(restored\)/);
  assert.match(restoreFn, /persistScheduleLocally\(\)/);
  assert.match(restoreFn, /persistRestoredMealPlan\(\{ saveSharedState, saveSchedule \}\)/);
  assert.doesNotMatch(restoreFn, /await saveSharedState\([^)]*\)\s*;\s*setSyncStatus/);
});

test("Change history opens the audit snapshots used by Restore this menu", () => {
  const historyPanel = html.match(/<details class="household-activity" id="householdHistoryPanel">[\s\S]*?<\/details>/)?.[0] || "";
  assert.match(historyPanel, /data-i18n="changeHistory"/);
  assert.match(historyPanel, /id="householdHistory"/);
  assert.doesNotMatch(historyPanel, /data-i18n="recentActivity"/);
  assert.match(html, /id="householdActivityPanel"/);
  assert.match(app, /\$\("#householdHistoryPanel"\)\?\.addEventListener\("toggle"/);
  assert.match(app, /loadAuditHistory\(\)/);
});

test("saved-menu history keeps the title and actor on separate lines", () => {
  const target = {
    innerHTML: "",
    querySelectorAll() {
      return [];
    },
  };
  const ui = createAuditUi({
    $: (selector) => (selector === "#householdHistory" ? target : null),
    t: (key) => ({
      historySnapshot: "Saved menu version",
      historyBy: "{name} · {time}",
      restoreMenu: "Restore this menu",
      historyEmpty: "No recoverable menu history yet.",
      householdFamily: "Family",
    }[key] || key),
    escapeHtml: (value) => value,
    getHistory: () => ({
      events: [],
      snapshots: [{ id: "snap-1", actor: "Family", updatedAt: "2026-09-04T12:00:00.000Z" }],
    }),
    onRestore() {},
  });
  ui.render();
  assert.doesNotMatch(target.innerHTML, /Saved menu versionFamily/);
  assert.match(target.innerHTML, /<strong>Saved menu version<\/strong><span class="household-history-meta">Family/);
  assert.match(css, /\.household-history-meta \{[^}]*display: block;/);
});
