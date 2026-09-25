import assert from "node:assert/strict";
import test from "node:test";
import { createWeekDraft } from "../week-planner-logic.js";

const monday = "2026-09-28";
const recipe = (id, minutes = 20, ingredients = ["rice"]) => ({
  id, category: "main", name: { en: id, es: id },
  meta: { en: `${minutes} minutes`, es: `${minutes} minutos` },
  ingredients: { en: ingredients, es: ingredients },
});

test("draft is deterministic, spans Monday through Sunday, and never mutates inputs", () => {
  const recipes = [recipe("rice"), recipe("soup"), recipe("stew")];
  const input = { weekStartKey: monday, recipes, targetDinnerCount: 2, scheduleVersion: 7 };
  const before = structuredClone(input);
  const first = createWeekDraft(input);
  assert.deepEqual(first, createWeekDraft(input));
  assert.deepEqual(input, before);
  assert.equal(first.days.length, 7);
  assert.equal(first.days[0].dateKey, monday);
  assert.equal(first.days[6].dateKey, "2026-10-04");
  assert.equal(first.base.scheduleVersion, 7);
  assert.equal(first.days.filter((day) => day.status === "suggested").length, 2);
  assert.equal(new Set(first.days.filter((day) => day.recipeId).map((day) => day.recipeId)).size, 2);
});

test("existing date override and legacy weekday meal stay locked with other meal periods intact in base", () => {
  const draft = createWeekDraft({
    weekStartKey: monday, recipes: [recipe("fresh")], targetDinnerCount: 3,
    schedule: { mon: { dinner: "legacy", breakfast: "oats", notes: "home early" } },
    calendarMeals: { "2026-09-30": { dinner: "override", lunch: "soup", side: "salad" } },
  });
  assert.equal(draft.days[0].status, "kept");
  assert.equal(draft.days[0].recipeId, "legacy");
  assert.equal(draft.days[2].recipeId, "override");
  assert.equal(draft.base.effectiveMealsByDate[monday].breakfast, "oats");
  assert.equal(draft.base.effectiveMealsByDate["2026-09-30"].lunch, "soup");
  assert.equal(draft.base.effectiveMealsByDate["2026-09-30"].side, "salad");
  assert.equal(draft.days.filter((day) => day.status === "suggested").length, 1);
});

test("regeneration retains a locked draft choice and its original conflict baseline", () => {
  const options = { weekStartKey: monday, recipes: [recipe("a"), recipe("b"), recipe("c")], targetDinnerCount: 2, scheduleVersion: 4 };
  const first = createWeekDraft(options);
  first.days[0].locked = true;
  const second = createWeekDraft({ ...options, scheduleVersion: 5, favorites: ["c"], previousDraft: first });
  assert.equal(second.days[0].recipeId, first.days[0].recipeId);
  assert.equal(second.days[0].status, "kept");
  assert.equal(second.base.scheduleVersion, 4);
  assert.equal(second.days.filter((day) => day.recipeId).length, 2);
});

test("a quick night with no verified prep time or matching recipe stays unresolved", () => {
  const draft = createWeekDraft({
    weekStartKey: monday, recipes: [recipe("slow", 50), { id: "unknown", category: "main", ingredients: { en: ["rice"] } }],
    targetDinnerCount: 1, maxMinutesByDate: { [monday]: 15, "2030-01-01": 12 },
  });
  assert.equal(draft.days[0].status, "unresolved");
  assert.deepEqual(draft.days[0].reasonCodes, ["no-verified-match"]);
  assert.deepEqual(draft.constraints.maxMinutesByDate, { [monday]: 15 });
});

test("missing ingredients and an empty catalog produce honest unresolved slots", () => {
  const missing = createWeekDraft({ weekStartKey: monday, recipes: [recipe("unknown", 20, [])], targetDinnerCount: 1 });
  assert.deepEqual(missing.days[0].reasonCodes, ["ingredients-unknown"]);
  const empty = createWeekDraft({ weekStartKey: monday, recipes: [], targetDinnerCount: 1 });
  assert.equal(empty.days[0].recipeId, "");
  assert.deepEqual(empty.days[0].reasonCodes, ["no-verified-match"]);
});

test("English and Spanish restrictions block matching text and require review of ambiguous candidates", () => {
  for (const [restriction, ingredient] of [["peanut", "peanut sauce"], ["cacahuate", "salsa de cacahuate"]]) {
    const draft = createWeekDraft({
      weekStartKey: monday,
      recipes: [recipe("unsafe", 20, [ingredient]), recipe("ambiguous")],
      members: [{ id: "adult", name: "Alex", role: "adult" }],
      preferences: [{ memberId: "adult", kind: "restriction", value: restriction }],
      targetDinnerCount: 1,
    });
    assert.equal(draft.days[0].status, "unresolved");
    assert.equal(draft.days[0].recipeId, "");
    assert.equal(draft.days[0].needsRestrictionReview, true);
    assert.deepEqual(draft.days[0].reasonCodes, ["restriction-needs-review"]);
  }
});

test("favorite and home food matches are advisory reasons, never invented quantities", () => {
  const draft = createWeekDraft({
    weekStartKey: monday, recipes: [recipe("rice-bowl", 20, ["rice"])], favorites: ["rice-bowl"],
    inventory: [{ text: { en: "rice", es: "arroz" } }], targetDinnerCount: 1,
  });
  assert.equal(draft.days[0].recipeId, "rice-bowl");
  assert.ok(draft.days[0].reasonCodes.includes("favorite"));
  assert.ok(draft.days[0].reasonCodes.includes("uses-home-food"));
  assert.equal(Object.hasOwn(draft.days[0], "availableQuantity"), false);
});

test("invalid and non-Monday week starts fail before draft creation", () => {
  for (const date of ["2026-02-30", "2026-09-29", "tomorrow", undefined]) {
    assert.throws(() => createWeekDraft({ weekStartKey: date }), TypeError);
  }
});
