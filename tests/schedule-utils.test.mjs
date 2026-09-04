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
  cookingServings,
  plannedServings,
  recipeBatchPlan,
  removeRecipeFromPlans,
  appendRecipeToMeal,
  applyPersistedMealTarget,
  upcomingMealDateOptions,
  mealPlanForDateKey,
} from "../schedule-utils.js";

test("serving plans default to two adults and two kids", () => {
  const plan = normalizeServingPlan();
  assert.deepEqual(plan, { adults: 2, kids: 2, guests: 0, extraServings: 0, actualLeftovers: {} });
  assert.equal(plannedServings(plan), 3);
  assert.equal(plannedServings({ adults: 2, kids: 1, guests: 2 }), 4.5);
  assert.equal(cookingServings({ adults: 2, kids: 0, guests: 0, extraServings: 3 }), 5);
});

test("meal periods inherit legacy counts and can diverge safely", () => {
  const plans = normalizeMealServingPlans({
    servingPlan: { adults: 1, kids: 2, guests: 1 },
    servingPlans: { lunch: { adults: 2, kids: 0, guests: 0 } },
  });
  assert.deepEqual(plans.breakfast, { adults: 1, kids: 2, guests: 1, extraServings: 0, actualLeftovers: {} });
  assert.deepEqual(plans.lunch, { adults: 2, kids: 0, guests: 0, extraServings: 0, actualLeftovers: {} });
  assert.deepEqual(plans.dinner, { adults: 1, kids: 2, guests: 1, extraServings: 0, actualLeftovers: {} });
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
  assert.deepEqual(recipeBatchPlan(4, 5, 2), { batches: 1.25, cookedServings: 5, expectedLeftovers: 3 });
  assert.equal(recipeBatchPlan(0, 4).assumedYield, true);
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

test("legacy dinner pace remains compatible without driving the planner UI", () => {
  const meal = normalizeMealPlan({ dinnerPace: "no-cooking" });
  assert.equal(meal.dinnerPace, "no-cooking");
  assert.equal(mealHasContent(meal), true);
  assert.equal(normalizeMealPlan({ dinnerPace: "unsupported" }).dinnerPace, "");
});

test("upcomingMealDateOptions returns the next seven local dates", () => {
  const options = upcomingMealDateOptions(new Date("2026-09-03T08:15:00"), 7);
  assert.deepEqual(options.map((option) => [option.offset, option.dateKey]), [
    [0, "2026-09-03"],
    [1, "2026-09-04"],
    [2, "2026-09-05"],
    [3, "2026-09-06"],
    [4, "2026-09-07"],
    [5, "2026-09-08"],
    [6, "2026-09-09"],
  ]);
});

test("appendRecipeToMeal adds a recipe without dropping existing dishes", () => {
  const meal = appendRecipeToMeal({
    mealItemsVersion: 1,
    items: [{
      id: "existing-breakfast",
      period: "breakfast",
      role: "main",
      sourceType: "recipe",
      recipeId: "oatmeal",
    }],
  }, {
    id: "planned-dinner",
    recipeId: "lemon-chicken",
    period: "dinner",
    role: "main",
  });

  assert.equal(meal.items.length, 2);
  assert.equal(meal.items[0].recipeId, "oatmeal");
  assert.deepEqual(meal.items[1], {
    id: "planned-dinner",
    period: "dinner",
    role: "main",
    sourceType: "recipe",
    recipeId: "lemon-chicken",
  });
  assert.equal(meal.dinner, "lemon-chicken");
});

test("appendRecipeToMeal ignores blank recipes and unknown meal slots", () => {
  const empty = appendRecipeToMeal(emptyMeal, { recipeId: "   " });
  assert.equal(empty.items.length, 0);
  const fallback = appendRecipeToMeal(emptyMeal, {
    id: "side-item",
    recipeId: "green-salad",
    period: "brunch",
    role: "salad",
  });
  assert.equal(fallback.items[0].period, "dinner");
  assert.equal(fallback.items[0].role, "salad");
});

test("next-week meal edits write calendar dates instead of deleting them", () => {
  const currentWeekStartKey = "2026-06-15";
  const visibleWeekStartKey = "2026-06-22";
  const existing = normalizeMealPlan({
    items: [
      { id: "breakfast-1", period: "breakfast", role: "main", recipeId: "oats" },
      { id: "lunch-1", period: "lunch", role: "main", recipeId: "soup" },
      { id: "dinner-1", period: "dinner", role: "main", recipeId: "tacos" },
    ],
  });
  const nextDinner = normalizeMealPlan({
    items: [
      ...existing.items.filter((item) => item.period !== "dinner"),
      { id: "dinner-2", period: "dinner", role: "main", recipeId: "pasta" },
    ],
  });

  const result = applyPersistedMealTarget({
    context: "weekdate:2026-06-22",
    meal: nextDinner,
    schedule: { mon: { dinner: "tacos" } },
    calendarMeals: { "2026-06-22": existing },
    visibleWeekStartKey,
    currentWeekStartKey,
  });

  assert.equal(result.applied, true);
  assert.equal(result.mode, "calendar");
  assert.equal(result.calendarMeals["2026-06-22"].dinner, "pasta");
  assert.equal(result.calendarMeals["2026-06-22"].breakfast, "oats");
  assert.equal(result.calendarMeals["2026-06-22"].lunch, "soup");
});

test("this-week meal edits still update the repeating weekday template", () => {
  const result = applyPersistedMealTarget({
    context: "weekdate:2026-06-22",
    meal: { dinner: "pasta" },
    schedule: { mon: { dinner: "tacos" } },
    calendarMeals: { "2026-06-22": { dinner: "override" } },
    visibleWeekStartKey: "2026-06-22",
    currentWeekStartKey: "2026-06-22",
  });

  assert.equal(result.mode, "week-template");
  assert.equal(result.schedule.mon.dinner, "pasta");
  assert.equal(result.calendarMeals["2026-06-22"], undefined);
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

test("next-week dates use calendar meals only and do not inherit this week's repeating dinners", () => {
  const repeatingWeek = {
    mon: { items: [{ id: "d1", period: "dinner", role: "main", recipeId: "tacos", sourceType: "recipe" }] },
    tue: { items: [{ id: "d2", period: "dinner", role: "main", recipeId: "chili", sourceType: "recipe" }] },
    wed: { items: [{ id: "d3", period: "dinner", role: "main", recipeId: "roast", sourceType: "recipe" }] },
    thu: { items: [{ id: "d4", period: "dinner", role: "main", recipeId: "pesto", sourceType: "recipe" }] },
    fri: { items: [{ id: "d5", period: "dinner", role: "main", recipeId: "halibut", sourceType: "recipe" }] },
    sat: { items: [{ id: "d6", period: "dinner", role: "main", recipeId: "pasta", sourceType: "recipe" }] },
    sun: { items: [{ id: "d7", period: "dinner", role: "main", recipeId: "soup", sourceType: "recipe" }] },
  };
  const nextMonday = mealPlanForDateKey({
    dateKey: "2026-09-07",
    calendarMeals: {},
    schedule: repeatingWeek,
    visibleWeekStartKey: "2026-09-07",
    currentWeekStartKey: "2026-08-31",
  });
  assert.equal(nextMonday.items.length, 0);

  const plannedTuesday = mealPlanForDateKey({
    dateKey: "2026-09-08",
    calendarMeals: {
      "2026-09-08": { items: [{ id: "cal", period: "dinner", role: "main", recipeId: "roast", sourceType: "recipe" }] },
    },
    schedule: repeatingWeek,
    visibleWeekStartKey: "2026-09-07",
    currentWeekStartKey: "2026-08-31",
  });
  assert.equal(plannedTuesday.items[0].recipeId, "roast");

  const thisMonday = mealPlanForDateKey({
    dateKey: "2026-08-31",
    calendarMeals: {},
    schedule: repeatingWeek,
    visibleWeekStartKey: "2026-08-31",
    currentWeekStartKey: "2026-08-31",
  });
  assert.equal(thisMonday.items[0].recipeId, "tacos");
});
