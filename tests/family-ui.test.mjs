import assert from "node:assert/strict";
import test from "node:test";

import { createFamilyUi } from "../family-ui.js";

function element() {
  return {
    hidden: false,
    innerHTML: "",
    value: "",
    handlers: {},
    addEventListener(type, handler) {
      this.handlers[type] = handler;
    },
    focus() {
      this.focused = true;
    },
  };
}

function familyUiFixture({ members = [], currentMember = "Family" } = {}) {
  const elements = {
    householdMemberSuggestions: element(),
    householdMemberPicker: element(),
    setupFamilyMembers: element(),
    householdMemberInput: element(),
  };
  let selectedMember = currentMember;
  const ui = createFamilyUi({
    $: (selector) => elements[selector.slice(1)] || null,
    $$: () => [],
    t: (key) => ({ householdFamily: "Family", addFamilyMembersShort: "Add family members" })[key] || key,
    escapeHtml: (value) => `${value}`,
    getHouseholdMember: () => selectedMember,
    setHouseholdMember: (name) => { selectedMember = name; },
    getFamilyMembers: () => members,
  });
  return { ui, elements, getSelectedMember: () => selectedMember };
}

test("member attribution offers setup instead of a dead-looking Family field", () => {
  const { ui, elements } = familyUiFixture();

  ui.updateMemberSuggestions();

  assert.equal(elements.householdMemberPicker.hidden, true);
  assert.equal(elements.setupFamilyMembers.hidden, false);
  assert.equal(elements.setupFamilyMembers.textContent, "Add family members");
  assert.match(elements.householdMemberInput.innerHTML, /value="Family">Family/);
  assert.match(elements.householdMemberSuggestions.innerHTML, /value="Family"/);
});

test("Spanish member chrome localizes Family while keeping the stored Family value", () => {
  const { elements } = familyUiFixture();
  const spanish = createFamilyUi({
    $: (selector) => elements[selector.slice(1)] || null,
    $$: () => [],
    t: (key) => ({ householdFamily: "Familia", addFamilyMembersShort: "Agregar familiares" })[key] || key,
    escapeHtml: (value) => `${value}`,
    getHouseholdMember: () => "Family",
    setHouseholdMember: () => {},
    getFamilyMembers: () => [],
  });

  spanish.updateMemberSuggestions();

  assert.match(elements.householdMemberInput.innerHTML, /value="Family">Familia/);
  assert.match(elements.householdMemberSuggestions.innerHTML, /value="Familia"/);
  assert.doesNotMatch(elements.householdMemberInput.innerHTML, /value="Family">Family/);
});

test("member attribution becomes a selector when active profiles exist", () => {
  const { ui, elements, getSelectedMember } = familyUiFixture({
    currentMember: "Alyson",
    members: [
      { id: "member-alyson", name: "Alyson", role: "adult", active: true },
      { id: "member-archived", name: "Archived", role: "adult", active: false },
    ],
  });

  ui.updateMemberSuggestions();

  assert.equal(elements.householdMemberPicker.hidden, false);
  assert.equal(elements.setupFamilyMembers.hidden, true);
  assert.equal(elements.householdMemberInput.value, "Alyson");
  assert.match(elements.householdMemberInput.innerHTML, /value="Alyson">Alyson/);
  assert.doesNotMatch(elements.householdMemberInput.innerHTML, /Archived/);
  assert.equal(getSelectedMember(), "Alyson");
});

test("stale attribution safely falls back to the shared Family identity", () => {
  const { ui, elements, getSelectedMember } = familyUiFixture({
    currentMember: "Former member",
    members: [{ id: "member-eric", name: "Eric", role: "adult", active: true }],
  });

  ui.updateMemberSuggestions();

  assert.equal(elements.householdMemberInput.value, "Family");
  assert.equal(getSelectedMember(), "Family");
});

test("memory separates stated preferences from cooked observations and labels takeout truthfully", () => {
  const elements = {
    familyMemorySummary: element(), familyMembersList: element(), pastDinnersList: element(),
    householdMemberSuggestions: element(), householdMemberPicker: element(),
    setupFamilyMembers: element(), householdMemberInput: element(),
  };
  const members = [{ id: "member-avery", name: "Avery", role: "adult", active: true }];
  const events = [
    { dateKey: "2026-09-22", status: "takeout", outcome: "skip", items: [{ recipeId: "tacos", name: "Tacos" }], reactions: {}, leftovers: {}, updatedBy: "Family" },
    { dateKey: "2026-09-21", status: "cooked", outcome: "loved", items: [{ recipeId: "pasta", name: "Pasta" }], reactions: { "member-avery": "loved" }, leftovers: {}, updatedBy: "Family" },
  ];
  const ui = createFamilyUi({
    $: (selector) => elements[selector.slice(1)] || null,
    $$: () => [],
    t: (key) => ({ householdFamily: "Family", dinnerHistoryTakeout: "Takeout", dinnerOutcomeLoved: "Loved it", reactionLoved: "Loved it", memoryRecordedReaction: "{name}: {reaction}" })[key] || key,
    escapeHtml: (value) => `${value}`,
    localize: (value) => value?.en || value || "",
    getLang: () => "en",
    getHouseholdMember: () => "Family",
    setHouseholdMember: () => {},
    getFamilyMembers: () => members,
    getFamilyPreferences: () => [{ id: "preference-1", memberId: "member-avery", kind: "like", value: "Pasta" }],
    getFamilyRules: () => ({}),
    getDinnerEvents: () => events,
    recipeById: () => null,
  });
  ui.renderFamily();
  assert.match(elements.familyMemorySummary.innerHTML, /family-member-member-avery/);
  assert.match(elements.familyMemorySummary.innerHTML, /past-dinner-2026-09-21/);
  assert.doesNotMatch(elements.familyMemorySummary.innerHTML, /past-dinner-2026-09-22/);
  assert.match(elements.pastDinnersList.innerHTML, /Takeout/);
});

test("a slow dinner correction stays visibly pending and preserves the edit after failure", async () => {
  const history = element();
  const outcomeControl = element();
  const reactionControl = element();
  const saveButton = element();
  const status = element();
  const form = {
    dataset: { historyCorrection: "2026-09-22" },
    querySelector: (selector) => selector === "button[type='submit']" ? saveButton : status,
    querySelectorAll: () => [outcomeControl, reactionControl],
  };
  history.querySelector = (selector) => selector.includes("select[name='outcome']") ? outcomeControl : saveButton;
  const elements = {
    pastDinnersList: history, familyMemorySummary: element(), familyMembersList: element(),
    householdMemberSuggestions: element(), householdMemberPicker: element(),
    setupFamilyMembers: element(), householdMemberInput: element(),
  };
  const source = {
    dateKey: "2026-09-22", status: "cooked", outcome: "loved", updatedAt: "2026-09-22T20:00:00.000Z",
    items: [{ id: "main", recipeId: "tacos", name: "Tacos" }], attendeeIds: ["member-a"],
    reactions: { "member-a": "loved" }, leftovers: {}, updatedBy: "Family",
  };
  let finishSave;
  let calls = 0;
  let submitted;
  const ui = createFamilyUi({
    $: (selector) => elements[selector.slice(1)] || null,
    $$: () => [],
    t: (key) => key,
    escapeHtml: (value) => `${value}`,
    localize: (value) => value?.en || value || "",
    getLang: () => "en",
    getHouseholdMember: () => "Family",
    setHouseholdMember: () => {},
    getFamilyMembers: () => [{ id: "member-a", name: "Avery", role: "adult", active: true }],
    getFamilyPreferences: () => [],
    getFamilyRules: () => ({}),
    getDinnerEvents: () => [source],
    recipeById: () => null,
    correctDinnerHistory: (correction) => { calls += 1; submitted = correction; return new Promise((resolve) => { finishSave = resolve; }); },
  });
  ui.bind();
  await history.handlers.click({ target: { closest: (selector) => selector === "[data-edit-dinner]" ? { dataset: { editDinner: source.dateKey } } : null } });
  history.handlers.change({ target: { name: "outcome", value: "mixed", closest: () => form } });
  const submission = history.handlers.submit({ target: { closest: () => form }, preventDefault() {} });
  assert.equal(calls, 1);
  assert.equal(submitted.outcome, "mixed");
  assert.equal(status.textContent, "dinnerHistorySaving");
  assert.equal(saveButton.disabled, true);
  await history.handlers.submit({ target: { closest: () => form }, preventDefault() {} });
  assert.equal(calls, 1);
  ui.renderFamily();
  assert.match(history.innerHTML, /value="mixed" selected/);
  assert.match(history.innerHTML, /name="outcome" disabled/);
  assert.match(history.innerHTML, /dinnerHistorySaving/);
  finishSave({ status: "unavailable" });
  await submission;
  assert.match(history.innerHTML, /value="mixed" selected/);
  assert.match(history.innerHTML, /dinnerHistoryUnavailable/);
  assert.equal(outcomeControl.focused, true);
});
