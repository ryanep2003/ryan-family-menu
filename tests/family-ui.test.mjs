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
