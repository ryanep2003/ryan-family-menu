import assert from "node:assert/strict";
import test from "node:test";

import { createWeekDraftUi } from "../week-draft-ui.js";

test("a background schedule change keeps the unfinished draft visible but blocks approval", async () => {
  const listeners = {};
  const panel = {
    innerHTML: "",
    addEventListener: (name, listener) => { listeners[name] = listener; },
    contains: () => true,
    querySelector: () => ({ focus() {} }),
  };
  const values = new Map();
  const householdStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  let input = {
    weekStartKey: "2026-09-21", scheduleVersion: 1, schedule: {}, calendarMeals: {},
    recipes: [{ id: "tacos", name: { en: "Tacos" }, category: "main", ingredients: { en: ["4 tortillas"] }, meta: { en: "20 min" } }],
    members: [], preferences: [], rules: {}, events: [], favorites: [], inventory: [], lang: "en",
  };
  let approvals = 0;
  const ui = createWeekDraftUi({
    $: () => panel, t: (key) => key, escapeHtml: (value) => `${value}`,
    localize: (value) => value?.en || value,
    getPlannerInput: () => input, getCatalogStatus: () => "ready", householdStorage,
    onApprove: async () => { approvals += 1; return { status: "saved" }; },
    onShoppingPreview: async () => ({}), onShoppingUpdate: async () => ({}),
  });
  ui.bind();
  ui.render();
  const click = async (weekDraft) => listeners.click({ target: { closest: () => ({ dataset: { weekDraft } }) } });
  await click("generate");
  assert.match(panel.innerHTML, /class="week-draft-days"/);
  assert.match(panel.innerHTML, /data-week-draft="approve"\s*>/);

  input = { ...input, scheduleVersion: 2 };
  ui.render();
  assert.match(panel.innerHTML, /class="week-draft-days"/);
  assert.match(panel.innerHTML, /weekDraftRecoveryStale/);
  assert.match(panel.innerHTML, /data-week-draft="approve" disabled/);
  await click("approve");
  assert.equal(approvals, 0);

  await click("generate");
  assert.doesNotMatch(panel.innerHTML, /weekDraftRecoveryStale/);
  assert.match(panel.innerHTML, /data-week-draft="approve"\s*>/);
});
