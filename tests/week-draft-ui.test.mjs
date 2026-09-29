import assert from "node:assert/strict";
import test from "node:test";

import { createWeekDraftUi } from "../week-draft-ui.js";
import { prepareWeekDraftApproval } from "../week-approval-logic.js";

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

test("restricted recipes require explicit review, then shopping review survives reopening on this household's device", async () => {
  const values = new Map();
  const householdStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const input = {
    weekStartKey: "2026-09-28", scheduleVersion: 1, schedule: {}, calendarMeals: {},
    recipes: [{ id: "rice", name: { en: "Rice", es: "Arroz" }, category: "main", ingredients: { en: ["rice"], es: ["arroz"] }, meta: { en: "20 min" } }],
    members: [{ id: "adult", name: "Alex", role: "adult" }],
    preferences: [{ memberId: "adult", kind: "restriction", value: "peanut" }],
    rules: {}, events: [], favorites: [], inventory: [], lang: "en", targetDinnerCount: 1,
  };
  let approvals = 0;
  const makeUi = () => {
    const listeners = {};
    const panel = { innerHTML: "", addEventListener: (name, listener) => { listeners[name] = listener; },
      contains: () => true, querySelector: () => ({ focus() {} }) };
    const ui = createWeekDraftUi({ $: () => panel, t: (key) => key, escapeHtml: (value) => `${value}`,
      localize: (value) => value?.en || value, getPlannerInput: () => input,
      getCatalogStatus: () => "ready", householdStorage,
      onApprove: async (draft, dates) => {
        approvals += 1;
        const prepared = prepareWeekDraftApproval({ draft, approvedDateKeys: dates, visibleRecipeIds: ["rice"],
          latestRecord: { version: 1, weekStartKey: input.weekStartKey, schedule: {}, calendarMeals: {} } });
        return { status: prepared.status === "ready" ? "saved" : prepared.status };
      },
      onShoppingPreview: async () => ({ status: "ready", changes: [] }), onShoppingUpdate: async () => ({}),
    });
    ui.bind();
    ui.render();
    const click = async (action) => listeners.click({ target: { closest: () => ({ dataset: { weekDraft: action } }) } });
    return { ui, panel, listeners, click };
  };
  const first = makeUi();
  await first.click("generate");
  assert.match(first.panel.innerHTML, /data-week-draft-review="2026-09-28"/);
  assert.match(first.panel.innerHTML, /data-week-draft="approve" disabled/);
  await first.click("approve");
  assert.equal(approvals, 0);
  first.listeners.change({ target: { dataset: { weekDraftReview: "2026-09-28" }, checked: true } });
  assert.match(first.panel.innerHTML, /data-week-draft="approve"\s*>/);
  first.listeners.change({ target: { dataset: { weekDraftReview: "2026-09-28" }, checked: false } });
  assert.match(first.panel.innerHTML, /data-week-draft="approve" disabled/);
  first.listeners.change({ target: { dataset: { weekDraftReview: "2026-09-28" }, checked: true } });
  await first.click("approve");
  assert.equal(approvals, 1);
  const reopened = makeUi();
  assert.match(reopened.panel.innerHTML, /data-week-draft="shopping"/);
  await reopened.click("shopping");
  const afterReview = makeUi();
  assert.doesNotMatch(afterReview.panel.innerHTML, /data-week-draft="shopping"/);
});
