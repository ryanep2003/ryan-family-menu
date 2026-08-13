import test from "node:test";
import assert from "node:assert/strict";
import {
  activeWeekDateKeys,
  copyCurrentWeekToNextWeek,
  currentWeekStartKey,
  emptyMeal,
  formatDateKey,
  mealHasContent,
  normalizeCalendar,
  normalizeMealPlan,
  normalizeMealServingPlans,
  normalizeSchedule,
  normalizeServingPlan,
  plannedServings,
  recipeBatchPlan,
  removeRecipeFromPlans,
} from "../schedule-utils.js";

test("serving plans default to two adults and two kids", () => {
  const plan = normalizeServingPlan();
  assert.deepEqual(plan, { adults: 2, kids: 2, guests: 0, actualLeftovers: {} });
  assert.equal(plannedServings(plan), 3);
  assert.equal(plannedServings({ adults: 2, kids: 1, guests: 2 }), 4.5);
});

test("meal periods inherit legacy counts and can diverge safely", () => {
  const plans = normalizeMealServingPlans({
    servingPlan: { adults: 1, kids: 2, guests: 1 },
    servingPlans: { lunch: { adults: 2, kids: 0, guests: 0 } },
  });
  assert.deepEqual(plans.breakfast, { adults: 1, kids: 2, guests: 1, actualLeftovers: {} });
  assert.deepEqual(plans.lunch, { adults: 2, kids: 0, guests: 0, actualLeftovers: {} });
  assert.deepEqual(plans.dinner, { adults: 1, kids: 2, guests: 1, actualLeftovers: {} });
});

test("leftover meal items preserve their exact source and allocation", () => {
  const meal = normalizeMealPlan({
    mealItemsVersion: 1,
    items: [{
      id: "future-lunch",
      period: "lunch",
      role: "main",
      sourceType: "leftover",
      recipeId: "meatballs",
      leftoverSourceDate: "2026-06-21",
      leftoverSourceItemId: "sunday-meatballs",
      servings: 2.5,
    }],
  });
  assert.deepEqual(meal.items[0], {
    id: "future-lunch",
    period: "lunch",
    role: "main",
    sourceType: "leftover",
    recipeId: "meatballs",
    leftoverSourceDate: "2026-06-21",
    leftoverSourceItemId: "sunday-meatballs",
    servings: 2.5,
  });
});

test("recipe batch planning rounds up to quarter batches and estimates leftovers", () => {
  assert.deepEqual(recipeBatchPlan(4, 5), { batches: 1.25, cookedServings: 5, expectedLeftovers: 0 });
  assert.deepEqual(recipeBatchPlan(6, 4), { batches: 0.75, cookedServings: 4.5, expectedLeftovers: 0.5 });
  assert.equal(recipeBatchPlan(0, 4), null);
});

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
  const dinner = normalizeMealPlan("meatballs");
  assert.equal(dinner.dinner, "meatballs");
  assert.deepEqual(dinner.items.map(({ period, role, recipeId }) => ({ period, role, recipeId })), [
    { period: "dinner", role: "main", recipeId: "meatballs" },
  ]);
  const side = normalizeMealPlan({ side: "potatoes" });
  assert.equal(side.side, "potatoes");
  assert.equal(side.dinner, "");
  assert.equal(side.items[0].role, "side");
});

test("meal normalization maps legacy main recipes to dinner and preserves new periods", () => {
  const meal = normalizeMealPlan({ main: "legacy-dinner", breakfast: "oatmeal", lunch: "soup", lunchSalad: "greens" });

  assert.equal(meal.dinner, "legacy-dinner");
  assert.equal(meal.main, "legacy-dinner");
  assert.equal(meal.breakfast, "oatmeal");
  assert.equal(meal.lunch, "soup");
  assert.equal(meal.lunchSalad, "greens");
});

test("schedule and calendar normalization keep expected shape", () => {
  const schedule = normalizeSchedule({ mon: "meatballs" });
  assert.equal(schedule.mon.main, "meatballs");
  assert.deepEqual(schedule.tue, { ...emptyMeal });

  const calendar = normalizeCalendar({ "2026-06-24": { salad: "greens" } });
  assert.equal(calendar["2026-06-24"].salad, "greens");
  assert.deepEqual(calendar["2026-06-24"].items.map(({ period, role, recipeId }) => ({ period, role, recipeId })), [
    { period: "dinner", role: "salad", recipeId: "greens" },
  ]);
});

test("mealHasContent checks any planned slot or notes", () => {
  assert.equal(mealHasContent({ ...emptyMeal }), false);
  assert.equal(mealHasContent({ ...emptyMeal, notes: "pizza night" }), true);
  assert.equal(mealHasContent({ ...emptyMeal, notes: { es: "noche de pizza" } }), true);
});

test("copyCurrentWeekToNextWeek carries effective meals forward without overwriting planned dates", () => {
  const result = copyCurrentWeekToNextWeek(
    "2026-06-22",
    {
      mon: { main: "meatballs" },
      tue: { side: "keeper-side" },
      wed: {},
      thu: { notes: "leftovers" },
      fri: { salad: "greens" },
      sat: {},
      sun: {},
    },
    {
      "2026-06-23": { main: "override-taco" },
      "2026-06-30": { main: "already-planned" },
    },
  );

  assert.equal(result.copiedCount, 3);
  assert.equal(result.skippedCount, 1);
  assert.equal(result.calendarMeals["2026-06-29"].dinner, "meatballs");
  assert.equal(result.calendarMeals["2026-07-02"].notes, "leftovers");
  assert.equal(result.calendarMeals["2026-07-03"].salad, "greens");
  assert.equal(result.calendarMeals["2026-06-30"].main, "already-planned");
});

test("meal normalization preserves optional family handoff planning", () => {
  const meal = normalizeMealPlan({
    main: "meatballs",
    handoff: { leftovers: true, kidsSnack: "yes" },
  });

  assert.deepEqual(meal.handoff, {
    leftovers: true,
    kidsSnack: true,
    flexible: false,
    leftoverServings: "",
    leftoverUseFirst: "",
    snackStatus: "",
    snack: "",
  });
  assert.equal(mealHasContent({ ...emptyMeal, handoff: { ...emptyMeal.handoff, flexible: true } }), true);
});

test("meal normalization keeps only supported handoff detail choices", () => {
  const meal = normalizeMealPlan({
    handoff: {
      leftovers: true,
      leftoverServings: "two",
      leftoverUseFirst: "nextDinner",
      snackStatus: "prepare",
      snack: "Fruit",
      unknown: "discard me",
    },
  });

  assert.equal(meal.handoff.leftoverServings, "two");
  assert.equal(meal.handoff.leftoverUseFirst, "nextDinner");
  assert.equal(meal.handoff.snackStatus, "prepare");
  assert.equal(meal.handoff.snack, "Fruit");
  assert.equal(normalizeMealPlan({ handoff: { leftoverServings: "many" } }).handoff.leftoverServings, "");
});

test("removeRecipeFromPlans clears deleted recipes from weekly and calendar meals", () => {
  const result = removeRecipeFromPlans(
    {
      mon: { main: "deleted-recipe", side: "keeper" },
      tue: { salad: "deleted-recipe", notes: "remember sauce" },
    },
    {
      "2026-06-24": { main: "keeper", side: "deleted-recipe" },
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

test("mealHasContent recognizes breakfast and lunch plans", () => {
  assert.equal(mealHasContent({ ...emptyMeal, breakfast: "oatmeal" }), true);
  assert.equal(mealHasContent({ ...emptyMeal, lunch: "soup" }), true);
  assert.equal(mealHasContent({ ...emptyMeal, lunchSalad: "greens" }), true);
});

test("removeRecipeFromPlans clears a deleted lunch salad", () => {
  const result = removeRecipeFromPlans(
    { mon: { lunch: "sandwich", lunchSalad: "deleted-recipe" } },
    {},
    "deleted-recipe",
  );

  assert.equal(result.schedule.mon.lunch, "sandwich");
  assert.equal(result.schedule.mon.lunchSalad, "");
});
