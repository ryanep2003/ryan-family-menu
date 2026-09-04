import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalHouseholdMember,
  cleanHouseholdMember,
  DEFAULT_HOUSEHOLD_MEMBER,
  displayHouseholdMember,
  isDefaultHouseholdMember,
} from "../household-attribution.js";
import { translations } from "../translations.js";
import { readFile } from "node:fs/promises";

test("household attribution preserves recognized family members", () => {
  assert.equal(cleanHouseholdMember("Eric"), "Eric");
  assert.equal(cleanHouseholdMember("Nelly"), "Nelly");
});

test("household attribution supports any family while cleaning unsafe values", () => {
  assert.equal(cleanHouseholdMember("  Jordan Smith  "), "Jordan Smith");
  assert.equal(cleanHouseholdMember("<Jordan>"), "Jordan");
  assert.equal(cleanHouseholdMember(undefined), "");
});

test("app normalizes stored household attribution", async () => {
  const source = await readFile(new URL("../app.js", import.meta.url), "utf8");

  assert.match(source, /canonicalHouseholdMember\(readStringStorage\(householdStorage, "dinner-household-member", DEFAULT_HOUSEHOLD_MEMBER\)\) \|\| DEFAULT_HOUSEHOLD_MEMBER/);
  assert.match(source, /displayHouseholdMember\(item\.updatedBy, t\)/);
  assert.match(source, /syncTaskAssigneeInput\(\)/);
});

test("default Family identity stays stored as Family and displays through householdFamily", () => {
  const tEn = (key) => translations.en[key];
  const tEs = (key) => translations.es[key];

  assert.equal(DEFAULT_HOUSEHOLD_MEMBER, "Family");
  assert.equal(translations.en.householdFamily, "Family");
  assert.equal(translations.es.householdFamily, "Familia");
  assert.ok(isDefaultHouseholdMember(translations.en.householdFamily));
  assert.ok(isDefaultHouseholdMember(translations.es.householdFamily));
  assert.equal(canonicalHouseholdMember("Family"), "Family");
  assert.equal(canonicalHouseholdMember("Familia"), "Family");
  assert.equal(canonicalHouseholdMember("  Familia  "), "Family");
  assert.equal(canonicalHouseholdMember("Eric"), "Eric");
  assert.equal(displayHouseholdMember("Family", tEn), "Family");
  assert.equal(displayHouseholdMember("Family", tEs), "Familia");
  assert.equal(displayHouseholdMember("Familia", tEs), "Familia");
  assert.equal(displayHouseholdMember("Eric", tEs), "Eric");
});

test("Household chrome and Family labels go through i18n with English/Spanish key parity", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const familyUi = await readFile(new URL("../family-ui.js", import.meta.url), "utf8");
  const activityUi = await readFile(new URL("../activity-ui.js", import.meta.url), "utf8");
  const auditUi = await readFile(new URL("../audit-ui.js", import.meta.url), "utf8");
  const dashboardUi = await readFile(new URL("../dashboard-ui.js", import.meta.url), "utf8");

  assert.deepEqual(Object.keys(translations.es).sort(), Object.keys(translations.en).sort());
  assert.equal(translations.en.householdButton, "Household");
  assert.equal(translations.es.householdButton, "Hogar");
  assert.match(html, /class="household-button"[^>]*data-i18n-aria-label="householdButton"/);
  assert.match(html, /<option value="Family" data-i18n="householdFamily">Family<\/option>/);
  assert.match(familyUi, /displayHouseholdMember\(name, t\)/);
  assert.match(familyUi, /displayHouseholdMember\(event\.updatedBy, t\)/);
  assert.match(activityUi, /displayHouseholdMember\(entry\.updatedBy, t\)/);
  assert.match(auditUi, /displayHouseholdMember\(event\.actor, t\)/);
  assert.match(dashboardUi, /isDefaultHouseholdMember\(assignee\)/);
  assert.match(dashboardUi, /canonicalHouseholdMember\(\$\("#taskAssigneeInput"\)\.value\)/);
});
