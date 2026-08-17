import test from "node:test";
import assert from "node:assert/strict";
import { auditEvent, hasPlannedMeals, normalizeAuditEvents, normalizeStateSnapshots, stateSnapshot } from "../audit-logic.js";

test("audit history recognizes legacy and current meal plans", () => {
  assert.equal(hasPlannedMeals({ schedule: { mon: { dinner: "pasta" } } }), true);
  assert.equal(hasPlannedMeals({ calendarMeals: { "2026-08-17": { items: [{ recipeId: "pasta" }] } } }), true);
  assert.equal(hasPlannedMeals({ schedule: {}, calendarMeals: {} }), false);
});

test("audit events describe changed meal dates and stay normalized", () => {
  const event = auditEvent({
    action: "state-updated",
    actor: "Alyson",
    version: 4,
    before: { calendarMeals: { "2026-08-17": { dinner: "old" } } },
    after: { calendarMeals: { "2026-08-17": { dinner: "new" }, "2026-08-18": { dinner: "newer" } } },
  });
  assert.deepEqual(event.changedDates, ["2026-08-17", "2026-08-18"]);
  assert.equal(normalizeAuditEvents([event, { id: "bad" }]).length, 1);
});

test("state snapshots retain only recoverable schedule data", () => {
  const snapshot = stateSnapshot({
    actor: "Eric",
    version: 2,
    state: { weekStart: "2026-08-17", schedule: { mon: { dinner: "pasta" } }, calendarMeals: {} },
  });
  const normalized = normalizeStateSnapshots([snapshot]);
  assert.equal(normalized[0].actor, "Eric");
  assert.equal(normalized[0].schedule.mon.dinner, "pasta");
  assert.equal(normalizeStateSnapshots([{ id: "bad" }]).length, 0);
});
