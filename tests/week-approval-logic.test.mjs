import assert from "node:assert/strict";
import test from "node:test";
import { createWeekDraft } from "../week-planner-logic.js";
import { prepareWeekDraftApproval } from "../week-approval-logic.js";

const monday = "2026-09-28";
const wednesday = "2026-09-30";
const recipes = [{ id: "rice", category: "main", name: { en: "Rice", es: "Arroz" }, meta: { en: "20 minutes", es: "20 minutos" }, ingredients: { en: ["rice"], es: ["arroz"] } }];
const draftFor = (calendarMeals = {}) => createWeekDraft({ weekStartKey: monday, calendarMeals, recipes, targetDinnerCount: 3, scheduleVersion: 4 });
const current = (calendarMeals = {}, version = 4) => ({ schedule: {}, calendarMeals, weekStartKey: monday, version });

test("approval writes only selected dinner overrides and keeps other date content", () => {
  const starting = { [monday]: { breakfast: "oats", lunch: "soup", side: "salad", notes: "late pickup", handoff: { kidsSnack: true } } };
  const draft = draftFor(starting);
  const snapshot = structuredClone(starting);
  const result = prepareWeekDraftApproval({ draft, approvedDateKeys: [monday], visibleRecipeIds: ["rice"], latestRecord: current(starting) });
  assert.equal(result.status, "ready");
  assert.deepEqual(result.appliedDates, [monday]);
  const meal = result.record.calendarMeals[monday];
  assert.equal(meal.dinner, "rice");
  assert.equal(meal.breakfast, "oats");
  assert.equal(meal.lunch, "soup");
  assert.equal(meal.side, "salad");
  assert.equal(meal.notes, "late pickup");
  assert.equal(meal.handoff.kidsSnack, true);
  assert.deepEqual(starting, snapshot);
});

test("two-device same-date lunch edit blocks an older dinner draft without overwriting it", () => {
  const draft = draftFor({ [monday]: { lunch: "soup" } });
  const latest = current({ [monday]: { lunch: "new-lunch" } }, 5);
  const result = prepareWeekDraftApproval({ draft, approvedDateKeys: [monday], visibleRecipeIds: ["rice"], latestRecord: latest });
  assert.deepEqual(result, { status: "conflict", conflicts: [monday], appliedDates: [] });
  assert.equal(latest.calendarMeals[monday].lunch, "new-lunch");
});

test("a remote edit on an unselected date survives rebase", () => {
  const draft = draftFor();
  const latest = current({ [wednesday]: { lunch: "remote-lunch" } }, 5);
  const result = prepareWeekDraftApproval({ draft, approvedDateKeys: [monday], visibleRecipeIds: ["rice"], latestRecord: latest });
  assert.equal(result.status, "ready");
  assert.equal(result.record.version, 5);
  assert.equal(result.record.calendarMeals[wednesday].lunch, "remote-lunch");
  assert.equal(result.record.calendarMeals[monday].dinner, "rice");
});

test("a moved active week requires a fresh draft before approval", () => {
  const draft = draftFor();
  const latest = { ...current({}, 5), weekStartKey: "2026-10-05" };
  const result = prepareWeekDraftApproval({ draft, approvedDateKeys: [monday], visibleRecipeIds: ["rice"], latestRecord: latest });
  assert.deepEqual(result, { status: "conflict", reason: "active-week-changed", conflicts: [], appliedDates: [] });
});

test("same-date dinner edit and remote notes edit both require review", () => {
  const draft = draftFor();
  for (const changed of [{ dinner: "someone-else" }, { notes: "later" }]) {
    const result = prepareWeekDraftApproval({
      draft, approvedDateKeys: [monday], visibleRecipeIds: ["rice"], latestRecord: current({ [monday]: changed }, 5),
    });
    assert.equal(result.status, "conflict");
    assert.deepEqual(result.conflicts, [monday]);
  }
});

test("unknown, unresolved, or restriction-review choices cannot be approved", () => {
  const draft = draftFor();
  assert.equal(prepareWeekDraftApproval({ draft, approvedDateKeys: [monday], visibleRecipeIds: [], latestRecord: current() }).status, "invalid");
  draft.days[0].needsRestrictionReview = true;
  assert.equal(prepareWeekDraftApproval({ draft, approvedDateKeys: [monday], visibleRecipeIds: ["rice"], latestRecord: current() }).status, "invalid");
  assert.equal(prepareWeekDraftApproval({ draft, approvedDateKeys: ["2030-01-01"], visibleRecipeIds: ["rice"], latestRecord: current() }).status, "invalid");
});

test("unmodified selected dinner returns no change", () => {
  const draft = draftFor({ [monday]: { dinner: "rice" } });
  const result = prepareWeekDraftApproval({ draft, approvedDateKeys: [monday], visibleRecipeIds: ["rice"], latestRecord: current({ [monday]: { dinner: "rice" } }) });
  assert.equal(result.status, "no-change");
});
