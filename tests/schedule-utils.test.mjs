import test from "node:test";
import assert from "node:assert/strict";
import {
  activeWeekDateKeys,
  currentWeekStartKey,
  emptyMeal,
  formatDateKey,
  mealHasContent,
  normalizeCalendar,
  normalizeMealPlan,
  normalizeSchedule,
  removeRecipeFromPlans,
} from "../schedule-utils.js";

test("formatDateKey and currentWeekStartKey use local noon week boundaries", () => {
  assert.equal(formatDateKey(new Date("2026-06-24T12:00:00")), "2026-06-24");
  assert.equal(currentWeekStartKey(new Date("2026-06-24T08:00:00")), "2026-06-22");
  assert.equal(currentWeekStartKey(new Date("2026-06-28T20:00:00")), "2026-06-22");
});

test("activeWeekDateKeys expands a monday week into seven date keys", () => {
  assert.deepEqual(
    activeWeekDateKeys("2026-06-22").map((day) => [day.key, day.dateKey]),
    [
      ["mon", "2026-06-22"],
      ["tue", "2026-06-23"],
      ["wed", "2026-06-24"],
      ["thu", "2026-06-25"],
      ["fri", "2026-06-26"],
      ["sat", "2026-06-27"],
      ["sun", "2026-06-28"],
    ]
  );
});

test("meal normalization preserves legacy string meals and fills blanks", () => {
  assert.deepEqual(normalizeMealPlan("meatballs"), { ...emptyMeal, main: "meatballs" });
  assert.deepEqual(normalizeMealPlan({ side: "potatoes" }), { ...emptyMeal, side: "potatoes" });
});

test("schedule and calendar normalization keep expected shape", () => {
  const schedule = normalizeSchedule({ mon: "meatballs" });
  assert.equal(schedule.mon.main, "meatballs");
  assert.deepEqual(schedule.tue, { ...emptyMeal });

  const calendar = normalizeCalendar({ "2026-06-24": { salad: "greens" } });
  assert.deepEqual(calendar["2026-06-24"], { ...emptyMeal, salad: "greens" });
});

test("mealHasContent checks any planned slot or notes", () => {
  assert.equal(mealHasContent({ ...emptyMeal }), false);
  assert.equal(mealHasContent({ ...emptyMeal, notes: "pizza night" }), true);
  assert.equal(mealHasContent({ ...emptyMeal, notes: { es: "noche de pizza" } }), true);
});

test("meal normalization preserves optional family handoff planning", () => {
  const meal = normalizeMealPlan({
    main: "meatballs",
    handoff: { leftovers: true, kidsSnack: "yes" },
  });

  assert.deepEqual(meal.handoff, { leftovers: true, kidsSnack: true, flexible: false });
  assert.equal(mealHasContent({ ...emptyMeal, handoff: { ...emptyMeal.handoff, flexible: true } }), true);
});

test("removeRecipeFromPlans clears deleted recipes from weekly and calendar meals", () => {
  const result = removeRecipeFromPlans(
    {
      mon: { ...emptyMeal, main: "deleted-recipe", side: "keeper" },
      tue: { ...emptyMeal, salad: "deleted-recipe", notes: "remember sauce" },
    },
    {
      "2026-06-24": { ...emptyMeal, main: "keeper", side: "deleted-recipe" },
    },
    "deleted-recipe",
  );

  assert.equal(result.schedule.mon.main, "");
  assert.equal(result.schedule.mon.side, "keeper");
  assert.equal(result.schedule.tue.salad, "");
  assert.equal(result.schedule.tue.notes, "remember sauce");
  assert.equal(result.calendarMeals["2026-06-24"].main, "keeper");
  assert.equal(result.calendarMeals["2026-06-24"].side, "");
});
