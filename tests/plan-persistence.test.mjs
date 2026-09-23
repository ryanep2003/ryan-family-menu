import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeCalendar,
  normalizeMealPlan,
  normalizeSchedule,
  planSavePresentation,
  reconcileLoadedPlan,
} from "../schedule-utils.js";
import { viewScrollAfterChange } from "../app-lifecycle.js";

function meal(recipeId) {
  return normalizeMealPlan({
    items: [{ id: recipeId, period: "dinner", role: "main", sourceType: "recipe", recipeId }],
  });
}

function plan(schedule, version = 1) {
  return {
    schedule: normalizeSchedule(schedule),
    calendarMeals: normalizeCalendar({}),
    weekStartKey: "2026-09-21",
    version,
  };
}

test("unsaved plan edits survive a reload of the same schedule version", () => {
  const server = plan({ mon: meal("old") }, 4);
  const result = reconcileLoadedPlan({
    server,
    pending: {
      schedule: normalizeSchedule({ mon: meal("new") }),
      calendarMeals: {},
      weekStartKey: "2026-09-21",
      baseVersion: 4,
      base: server,
    },
  });

  assert.equal(result.pending, true);
  assert.equal(result.retry, true);
  assert.equal(result.version, 4);
  assert.equal(result.schedule.mon.items[0].recipeId, "new");
  assert.equal(result.base.schedule.mon.items[0].recipeId, "old");
});

test("a pending plan already stored on the schedule record is dropped", () => {
  const saved = normalizeSchedule({ mon: meal("same") });
  const result = reconcileLoadedPlan({
    server: { schedule: saved, calendarMeals: {}, weekStartKey: "2026-09-21", version: 5 },
    pending: {
      schedule: saved,
      calendarMeals: {},
      weekStartKey: "2026-09-21",
      baseVersion: 4,
      base: { schedule: normalizeSchedule({}), calendarMeals: {}, weekStartKey: "2026-09-21" },
    },
  });

  assert.equal(result.pending, false);
  assert.equal(result.retry, false);
  assert.equal(result.schedule.mon.items[0].recipeId, "same");
});

test("a newer server plan keeps unrelated days and the phone's unsaved day", () => {
  const result = reconcileLoadedPlan({
    server: plan({ mon: meal("mon-old"), tue: meal("tue-server") }, 8),
    pending: {
      schedule: normalizeSchedule({ mon: meal("mon-new"), tue: meal("tue-old") }),
      calendarMeals: {},
      weekStartKey: "2026-09-21",
      baseVersion: 3,
      base: {
        schedule: normalizeSchedule({ mon: meal("mon-old"), tue: meal("tue-old") }),
        calendarMeals: {},
        weekStartKey: "2026-09-21",
      },
    },
  });

  assert.equal(result.pending, true);
  assert.equal(result.schedule.mon.items[0].recipeId, "mon-new");
  assert.equal(result.schedule.tue.items[0].recipeId, "tue-server");
});

test("an intentional clear stays marked so reload can still replace the week", () => {
  const result = reconcileLoadedPlan({
    server: plan({ mon: meal("keep") }, 2),
    pending: {
      schedule: normalizeSchedule({}),
      calendarMeals: {},
      weekStartKey: "2026-09-21",
      baseVersion: 2,
      allowEmptySchedule: true,
      base: plan({ mon: meal("keep") }, 2),
    },
  });

  assert.equal(result.pending, true);
  assert.equal(result.allowEmptySchedule, true);
  assert.equal(result.schedule.mon.items.length, 0);
});

test("Plan save chrome stays visible while dirty and quiets after the schedule record accepts it", () => {
  const dirty = planSavePresentation({ dirty: true, view: "grocery" });
  assert.equal(dirty.visible, true);
  assert.equal(dirty.showButton, true);
  assert.equal(dirty.state, "dirty");

  const waiting = planSavePresentation({ pending: true, view: "today" });
  assert.equal(waiting.state, "pending");
  assert.equal(waiting.showButton, true);

  const savedOnPlan = planSavePresentation({ saved: true, view: "schedule" });
  assert.equal(savedOnPlan.visible, true);
  assert.equal(savedOnPlan.showButton, false);
  assert.equal(savedOnPlan.state, "saved");

  const savedElsewhere = planSavePresentation({ saved: true, view: "recipes" });
  assert.equal(savedElsewhere.visible, false);

  const blocked = planSavePresentation({ blocked: true, dirty: true, view: "schedule" });
  assert.equal(blocked.visible, false);
  assert.equal(blocked.state, "clean");
});

test("bottom tabs restore the scroll position from the last visit", () => {
  const positions = new Map();
  const leftToday = viewScrollAfterChange({
    positions,
    previousView: "today",
    nextView: "schedule",
    currentScroll: 480,
  });
  assert.equal(leftToday.scrollTop, 0);
  assert.equal(leftToday.positions.get("today"), 480);

  const backToToday = viewScrollAfterChange({
    positions: leftToday.positions,
    previousView: "schedule",
    nextView: "today",
    currentScroll: 120,
  });
  assert.equal(backToToday.scrollTop, 480);
  assert.equal(backToToday.positions.get("schedule"), 120);

  const sameTab = viewScrollAfterChange({
    positions: backToToday.positions,
    previousView: "today",
    nextView: "today",
    currentScroll: 20,
  });
  assert.equal(sameTab.scrollTop, null);
  assert.equal(sameTab.positions.get("today"), 480);
});
