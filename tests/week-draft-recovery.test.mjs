import assert from "node:assert/strict";
import test from "node:test";

import { createHouseholdStorage } from "../household-access.js";
import { createWeekDraft } from "../week-planner-logic.js";
import { recoverWeekDraft, serializeWeekDraftRecovery, WEEK_DRAFT_RECOVERY_KEY } from "../week-draft-recovery.js";

const recipe = { id: "tacos", name: { en: "Tacos", es: "Tacos" }, category: "main", ingredients: { en: ["4 tortillas"], es: ["4 tortillas"] }, meta: { en: "20 min", es: "20 minutos" }, servings: 4 };
const input = () => ({
  weekStartKey: "2026-09-21", schedule: {}, calendarMeals: {}, recipes: [recipe],
  members: [], preferences: [], rules: {}, events: [], favorites: [], inventory: [],
  scheduleVersion: 3,
});

test("an unfinished draft restores kept choices and selected dates only on the same baseline", () => {
  const source = input();
  const draft = createWeekDraft({ ...source, targetDinnerCount: 1 });
  const choice = draft.days.find((day) => day.recipeId === "tacos");
  assert.ok(choice);
  choice.locked = true;
  const raw = serializeWeekDraftRecovery({ draft, selectedDateKeys: [choice.dateKey], input: source });
  const restored = recoverWeekDraft(raw, input());
  assert.equal(restored.status, "restored");
  assert.equal(restored.draft.days.find((day) => day.dateKey === choice.dateKey).locked, true);
  assert.deepEqual(restored.selectedDateKeys, [choice.dateKey]);
  assert.equal(restored.draft.base.scheduleVersion, 3);
});

test("a changed week, catalog, restriction, version, or effective meal makes recovery review-only", () => {
  const source = input();
  const draft = createWeekDraft({ ...source, targetDinnerCount: 1 });
  const raw = serializeWeekDraftRecovery({ draft, selectedDateKeys: [draft.days[0].dateKey], input: source });
  const changed = [
    { ...input(), weekStartKey: "2026-09-28" },
    { ...input(), recipes: [{ ...recipe, ingredients: { en: ["2 tortillas"], es: ["2 tortillas"] } }] },
    { ...input(), preferences: [{ id: "p1", memberId: "m1", kind: "restriction", value: "wheat" }] },
    { ...input(), scheduleVersion: 4 },
    { ...input(), calendarMeals: { "2026-09-21": { dinner: "tacos" } } },
  ];
  for (const current of changed) assert.equal(recoverWeekDraft(raw, current).status, "stale");
  assert.equal(recoverWeekDraft(raw, input()).status, "restored");
});

test("malformed, oversized, and invented draft choices cannot be restored", () => {
  const source = input();
  const draft = createWeekDraft({ ...source, targetDinnerCount: 1 });
  const raw = serializeWeekDraftRecovery({ draft, selectedDateKeys: [], input: source });
  assert.equal(recoverWeekDraft(null, source).status, "empty");
  assert.equal(recoverWeekDraft("{bad", source).status, "stale");
  assert.equal(recoverWeekDraft("x".repeat(65537), source).status, "stale");
  const invented = JSON.parse(raw);
  invented.draft.days[0].recipeId = "missing";
  assert.equal(recoverWeekDraft(JSON.stringify(invented), source).status, "stale");
  invented.draft.days[0].recipeId = "tacos";
  invented.selectedDateKeys = ["2030-01-01"];
  assert.equal(recoverWeekDraft(JSON.stringify(invented), source).status, "stale");
});

test("draft storage remains inside the selected household namespace", () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  const first = createHouseholdStorage(storage, "household-a");
  const second = createHouseholdStorage(storage, "household-b");
  first.setItem(WEEK_DRAFT_RECOVERY_KEY, "private draft");
  assert.equal(second.getItem(WEEK_DRAFT_RECOVERY_KEY), null);
  assert.equal(first.getItem(WEEK_DRAFT_RECOVERY_KEY), "private draft");
});
