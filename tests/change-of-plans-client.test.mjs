import assert from "node:assert/strict";
import test from "node:test";
import { applyDinnerAttendanceChange, applyQuickDinnerReplacement, prepareDinnerAttendanceChange, prepareQuickDinnerReplacement } from "../change-of-plans-client.js";
import { previewQuickDinnerReplacement } from "../change-of-plans-logic.js";
import { normalizeMealPlan, normalizeSchedule } from "../schedule-utils.js";

const dateKey = "2026-09-30";
const dinner = normalizeMealPlan({ dinner: "pasta", lunch: "sandwich", notes: "Keep this", servingPlan: { adults: 2, kids: 2, guests: 0 } });
const latest = () => ({
  schedule: normalizeSchedule({ wed: dinner }), calendarMeals: { "2026-10-01": { dinner: "beans" } },
  weekStartKey: "2026-09-28", version: 4,
});

test("attendance write changes only the target date while preserving its meal and other dates", () => {
  const input = latest();
  const snapshot = structuredClone(input);
  const result = prepareDinnerAttendanceChange({
    preview: { dateKey, before: dinner }, attendance: { adults: 3, kids: 2, guests: 1 },
    baseWeekStartKey: input.weekStartKey, latestRecord: input,
  });
  assert.equal(result.status, "ready");
  assert.deepEqual(input, snapshot);
  assert.equal(result.record.version, 4);
  assert.deepEqual(result.record.schedule, input.schedule);
  assert.deepEqual(result.record.calendarMeals["2026-10-01"], normalizeMealPlan(input.calendarMeals["2026-10-01"]));
  assert.equal(result.record.calendarMeals[dateKey].dinner, "pasta");
  assert.equal(result.record.calendarMeals[dateKey].lunch, "sandwich");
  assert.equal(result.record.calendarMeals[dateKey].notes, "Keep this");
  assert.equal(result.record.calendarMeals[dateKey].servingPlans.dinner.guests, 1);
});

test("same-date edits and active-week changes block the write", () => {
  const changedDate = latest();
  changedDate.calendarMeals[dateKey] = { dinner: "beans" };
  assert.equal(prepareDinnerAttendanceChange({
    preview: { dateKey, before: dinner }, attendance: { adults: 3, kids: 2, guests: 0 },
    baseWeekStartKey: "2026-09-28", latestRecord: changedDate,
  }).reason, "date-changed");
  assert.equal(prepareDinnerAttendanceChange({
    preview: { dateKey, before: dinner }, attendance: { adults: 3, kids: 2, guests: 0 },
    baseWeekStartKey: "2026-09-21", latestRecord: latest(),
  }).reason, "active-week-changed");
});

test("a version conflict stops and undo rechecks the saved date", async () => {
  const preview = { dateKey, before: dinner };
  let writes = 0;
  const conflict = await applyDinnerAttendanceChange({
    preview, attendance: { adults: 3, kids: 2, guests: 0 }, baseWeekStartKey: "2026-09-28",
    getLatest: async () => latest(), putRecord: async () => { writes += 1; throw { status: 409 }; },
  });
  assert.equal(conflict.status, "conflict");
  assert.equal(writes, 1);
  const saved = await applyDinnerAttendanceChange({
    preview, attendance: { adults: 3, kids: 2, guests: 0 }, baseWeekStartKey: "2026-09-28",
    getLatest: async () => latest(), putRecord: async (record) => ({ ...record, version: 5 }),
  });
  assert.equal(saved.status, "saved");
  const remote = { ...saved.record, calendarMeals: { ...saved.record.calendarMeals, [dateKey]: { dinner: "rice" } }, version: 6 };
  const undo = await applyDinnerAttendanceChange({
    preview: saved.undo, attendance: saved.undo.attendance, baseWeekStartKey: saved.undo.baseWeekStartKey,
    getLatest: async () => remote, putRecord: async () => { throw new Error("Undo must not overwrite remote dinner"); },
  });
  assert.equal(undo.reason, "date-changed");
});

test("undo remains valid after the schedule endpoint sanitizes the saved meal", async () => {
  const withLeftovers = normalizeMealPlan({
    ...dinner,
    servingPlan: { ...dinner.servingPlan, actualLeftovers: { "legacy-dinner-main-0-pasta": 1 } },
    servingPlans: {
      ...dinner.servingPlans,
      dinner: { ...dinner.servingPlans.dinner, actualLeftovers: { "legacy-dinner-main-0-pasta": 1 } },
    },
  });
  const saved = await applyDinnerAttendanceChange({
    preview: { dateKey, before: withLeftovers }, attendance: { adults: 3, kids: 2, guests: 0 },
    baseWeekStartKey: "2026-09-28", getLatest: async () => ({ ...latest(), schedule: normalizeSchedule({ wed: withLeftovers }) }),
    putRecord: async (record) => ({
      ...record, version: 5,
      calendarMeals: {
        ...record.calendarMeals,
        [dateKey]: {
          ...record.calendarMeals[dateKey],
          servingPlans: {
            ...record.calendarMeals[dateKey].servingPlans,
            dinner: { ...record.calendarMeals[dateKey].servingPlans.dinner, actualLeftovers: undefined },
          },
        },
      },
    }),
  });
  assert.equal(saved.status, "saved");
  const undo = prepareDinnerAttendanceChange({
    preview: saved.undo, attendance: saved.undo.attendance, baseWeekStartKey: saved.undo.baseWeekStartKey,
    latestRecord: saved.record,
  });
  assert.equal(undo.status, "ready");
});

test("quick dinner swap writes only one date and undo refuses a remote same-date edit", async () => {
  const recipePreview = previewQuickDinnerReplacement({ dateKey, meal: dinner, recipeId: "beans", recipes: [
    { id: "pasta", ingredients: { en: ["1 lb pasta"] } },
    { id: "beans", ingredients: { en: ["1 can beans"] } },
  ] });
  const prepared = prepareQuickDinnerReplacement({ preview: recipePreview, baseWeekStartKey: "2026-09-28", latestRecord: latest() });
  assert.equal(prepared.status, "ready");
  assert.equal(prepared.record.calendarMeals[dateKey].dinner, "beans");
  assert.equal(prepared.record.calendarMeals[dateKey].lunch, "sandwich");
  assert.equal(prepared.record.calendarMeals["2026-10-01"].dinner, "beans");
  assert.equal(prepared.record.version, 4);
  let writes = 0;
  const saved = await applyQuickDinnerReplacement({ preview: recipePreview, baseWeekStartKey: "2026-09-28",
    getLatest: async () => latest(), putRecord: async (record) => { writes += 1; return { ...record, version: 5 }; } });
  assert.equal(saved.status, "saved");
  assert.equal(writes, 1);
  assert.equal(saved.undo.after.dinner, "pasta");
  const remote = { ...saved.record, version: 6,
    calendarMeals: { ...saved.record.calendarMeals, [dateKey]: { dinner: "rice" } } };
  assert.equal(prepareQuickDinnerReplacement({ preview: saved.undo,
    baseWeekStartKey: "2026-09-28", latestRecord: remote }).reason, "date-changed");
  const undo = await applyQuickDinnerReplacement({ preview: saved.undo, baseWeekStartKey: "2026-09-28",
    getLatest: async () => saved.record, putRecord: async (record) => ({ ...record, version: 6 }) });
  assert.equal(undo.status, "saved");
});

test("quick dinner swap stops on a write conflict without retry", async () => {
  const preview = previewQuickDinnerReplacement({ dateKey, meal: dinner, recipeId: "beans", recipes: [
    { id: "beans", ingredients: { en: ["1 can beans"] } },
  ] });
  let writes = 0;
  const result = await applyQuickDinnerReplacement({ preview, baseWeekStartKey: "2026-09-28",
    getLatest: async () => latest(), putRecord: async () => { writes += 1; throw { status: 409 }; } });
  assert.equal(result.status, "conflict");
  assert.equal(writes, 1);
});
