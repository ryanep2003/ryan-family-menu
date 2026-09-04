import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  applyDinnerAssignments,
  assistantPreviewNeedsConfirm,
  dateKeysForAction,
  dinnerIsOccupied,
  horizonDateKeys,
  lookupDinner,
  lookupDinnersRange,
  matchAskAction,
  nextWeekDateKeys,
  proposeDinnerFill,
  proposeShoppingRefresh,
  relativeDinnerDateKey,
  remainingWeekDateKeys,
} from "../assistant-logic.js";
import { groceryItem } from "../grocery-logic.js";
import { emptyMeal, formatDateKey, mealPlanForDateKey, normalizeMealPlan } from "../schedule-utils.js";
import { translations } from "../translations.js";

function localDate(year, month, day, hour = 12, minute = 0) {
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

const thursdayEvening = localDate(2026, 9, 3, 20, 15);
const monday = localDate(2026, 9, 7, 15);
const nextWeek = [
  "2026-09-07",
  "2026-09-08",
  "2026-09-09",
  "2026-09-10",
  "2026-09-11",
  "2026-09-12",
  "2026-09-13",
];

const recipes = [
  { id: "tacos", name: { en: "Tacos" }, category: "main" },
  { id: "chili", name: { en: "Chili" }, category: "main" },
  { id: "roast", name: { en: "Pot roast" }, category: "main" },
  { id: "potatoes", name: { en: "Potatoes" }, category: "side" },
];

function mealWithDinner(recipeId) {
  return normalizeMealPlan({
    items: [{ id: `dinner-${recipeId}`, period: "dinner", role: "main", recipeId, sourceType: "recipe" }],
  });
}

function mealWithLunch(recipeId) {
  return normalizeMealPlan({
    items: [{ id: `lunch-${recipeId}`, period: "lunch", role: "main", recipeId, sourceType: "recipe" }],
  });
}

test("plan next week is the calendar week after this week's Monday, not today", () => {
  assert.equal(formatDateKey(thursdayEvening), "2026-09-03");
  assert.deepEqual(nextWeekDateKeys(thursdayEvening), nextWeek);
  assert.deepEqual(dateKeysForAction("plan-next-week", thursdayEvening), nextWeek);
  assert.ok(!dateKeysForAction("plan-next-week", thursdayEvening).includes("2026-09-03"));
  assert.deepEqual(dateKeysForAction("plan-next-week", localDate(2026, 9, 6, 21)), nextWeek);
  assert.deepEqual(dateKeysForAction("plan-next-week", monday), [
    "2026-09-14",
    "2026-09-15",
    "2026-09-16",
    "2026-09-17",
    "2026-09-18",
    "2026-09-19",
    "2026-09-20",
  ]);
});

test("today and tomorrow use the local calendar date, including Thursday evening", () => {
  assert.equal(relativeDinnerDateKey("today", thursdayEvening), "2026-09-03");
  assert.equal(relativeDinnerDateKey("tomorrow", thursdayEvening), "2026-09-04");
  assert.equal(relativeDinnerDateKey("dinner-tomorrow", thursdayEvening), "2026-09-04");
  assert.equal(relativeDinnerDateKey("today", localDate(2026, 9, 6, 21, 45)), "2026-09-06");
  assert.equal(relativeDinnerDateKey("dinner-tomorrow", localDate(2026, 9, 6, 21, 45)), "2026-09-07");
  assert.notEqual(relativeDinnerDateKey("today", thursdayEvening), relativeDinnerDateKey("tomorrow", thursdayEvening));
});

test("the shopping horizon starts today locally and stays seven dates", () => {
  assert.deepEqual(horizonDateKeys(thursdayEvening), [
    "2026-09-03",
    "2026-09-04",
    "2026-09-05",
    "2026-09-06",
    "2026-09-07",
    "2026-09-08",
    "2026-09-09",
  ]);
  assert.deepEqual(dateKeysForAction("refresh-shopping", thursdayEvening), horizonDateKeys(thursdayEvening));
});

test("fill-gaps and this-week lookup use remaining current-week dates from today through Sunday", () => {
  assert.deepEqual(dateKeysForAction("fill-gaps", thursdayEvening), [
    "2026-09-03",
    "2026-09-04",
    "2026-09-05",
    "2026-09-06",
  ]);
  assert.deepEqual(dateKeysForAction("dinners-this-week", thursdayEvening), dateKeysForAction("fill-gaps", thursdayEvening));
  assert.deepEqual(dateKeysForAction("dinners-next-week", thursdayEvening), nextWeek);
  assert.deepEqual(remainingWeekDateKeys(localDate(2026, 9, 9, 12)), [
    "2026-09-09",
    "2026-09-10",
    "2026-09-11",
    "2026-09-12",
    "2026-09-13",
  ]);
});

test("dinner occupancy ignores breakfast and lunch so those meals are not deleted", () => {
  assert.equal(dinnerIsOccupied(mealWithLunch("tacos")), false);
  assert.equal(dinnerIsOccupied(mealWithDinner("tacos")), true);
  assert.equal(dinnerIsOccupied(emptyMeal), false);
});

test("planning proposals fill only empty dinners in next week and prefer favorites then recent wins", () => {
  const meals = {
    "2026-09-03": mealWithDinner("pesto"),
    "2026-09-06": mealWithDinner("halibut"),
    "2026-09-09": mealWithDinner("roast"),
    "2026-09-07": mealWithLunch("potatoes"),
  };
  const proposal = proposeDinnerFill({
    action: "plan-next-week",
    now: thursdayEvening,
    mealForDate: (dateKey) => meals[dateKey] || emptyMeal,
    recipes,
    favorites: ["tacos"],
    events: [{
      id: "dinner-2026-08-01",
      dateKey: "2026-08-01",
      status: "cooked",
      outcome: "loved",
      items: [{ id: "win", recipeId: "chili" }],
      updatedAt: "2026-08-01T20:00:00.000Z",
    }],
  });

  assert.equal(proposal.kind, "fill-dinners");
  assert.deepEqual(proposal.dateKeys, nextWeek);
  assert.ok(!proposal.dateKeys.includes("2026-09-03"));
  assert.ok(!proposal.assignments.some((item) => item.dateKey === "2026-09-03" || item.dateKey === "2026-09-06"));
  assert.equal(proposal.occupied[0].dateKey, "2026-09-09");
  assert.ok(!proposal.assignments.some((item) => item.dateKey === "2026-09-09"));
  assert.equal(proposal.assignments.find((item) => item.dateKey === "2026-09-07")?.recipeId, "tacos");
  assert.ok(proposal.assignments.some((item) => item.recipeId === "chili"));
  assert.ok(!proposal.assignments.some((item) => item.recipeId === "potatoes"));
  assert.equal(assistantPreviewNeedsConfirm(proposal), true);
});

test("applying dinner assignments never overwrites an occupied dinner", () => {
  const calendarMeals = {
    "2026-09-09": mealWithDinner("roast"),
  };
  const result = applyDinnerAssignments({
    calendarMeals,
    mealForDate: (dateKey) => calendarMeals[dateKey] || emptyMeal,
    assignments: [
      { dateKey: "2026-09-09", recipeId: "tacos" },
      { dateKey: "2026-09-10", recipeId: "chili" },
    ],
  });

  assert.equal(result.skipped[0].reason, "occupied");
  assert.equal(dinnerItemsRecipe(result.calendarMeals["2026-09-09"]), "roast");
  assert.equal(dinnerItemsRecipe(result.calendarMeals["2026-09-10"]), "chili");
  assert.equal(calendarMeals["2026-09-10"], undefined);
});

function dinnerItemsRecipe(meal) {
  return normalizeMealPlan(meal).items.find((item) => item.period === "dinner")?.recipeId || "";
}

test("proposing a shopping refresh does not mutate the existing list", () => {
  const existing = [groceryItem("Milk", { source: "manual" })];
  const generated = [groceryItem("Tortillas", {
    source: "meal-plan",
    mealUses: [{ dateKey: "2026-09-07", mealSlot: "dinner", recipeId: "tacos", recipeName: { en: "Tacos" } }],
  })];
  const snapshot = JSON.stringify(existing);
  const proposal = proposeShoppingRefresh({ generatedItems: generated, existingItems: existing });
  assert.equal(proposal.kind, "shopping");
  assert.equal(proposal.generatedCount, 1);
  assert.equal(proposal.listCount, 2);
  assert.equal(JSON.stringify(existing), snapshot);
  assert.equal(assistantPreviewNeedsConfirm(proposal), true);
});

test("dinner lookup answers without writing and keeps today vs tomorrow labels", () => {
  const today = lookupDinner({
    dateKey: relativeDinnerDateKey("today", thursdayEvening),
    todayKey: formatDateKey(thursdayEvening),
    when: "today",
    meal: mealWithDinner("pesto"),
  });
  const tomorrow = lookupDinner({
    dateKey: relativeDinnerDateKey("dinner-tomorrow", thursdayEvening),
    todayKey: formatDateKey(thursdayEvening),
    when: "tomorrow",
    meal: emptyMeal,
  });
  assert.equal(today.when, "today");
  assert.equal(today.dateKey, "2026-09-03");
  assert.equal(today.items[0].recipeId, "pesto");
  assert.equal(tomorrow.when, "tomorrow");
  assert.equal(tomorrow.dateKey, "2026-09-04");
  assert.equal(tomorrow.empty, true);
  assert.equal(assistantPreviewNeedsConfirm(today), false);
});

test("Ask text maps to existing chip actions in English and Spanish without a model", () => {
  const cases = [
    ["What's for dinner next week?", "dinners-next-week"],
    ["whats for dinner next week", "dinners-next-week"],
    ["What's for dinner this week?", "dinners-this-week"],
    ["¿Qué hay de cena la próxima semana?", "dinners-next-week"],
    ["¿Qué hay de cena esta semana?", "dinners-this-week"],
    ["What's for lunch and dinner next week?", "dinners-next-week"],
    ["whats for lunch and dinner next week", "dinners-next-week"],
    ["¿Qué hay de almuerzo y cena la próxima semana?", "dinners-next-week"],
    ["Plan next week", "plan-next-week"],
    ["plan dinners", "plan-next-week"],
    ["planear la próxima semana", "plan-next-week"],
    ["PRÓXIMA SEMANA", "plan-next-week"],
    ["Fill gaps this week", "fill-gaps"],
    ["fill empty dinners this week", "fill-gaps"],
    ["completar huecos de esta semana", "fill-gaps"],
    ["esta semana", "fill-gaps"],
    ["Build shopping list", "refresh-shopping"],
    ["refresh the shopping list", "refresh-shopping"],
    ["grocery list", "refresh-shopping"],
    ["shopping list for next week", "refresh-shopping"],
    ["crear lista de compras", "refresh-shopping"],
    ["lista de compras", "refresh-shopping"],
    ["What's for dinner today?", "dinner-today"],
    ["what's for dinner", "dinner-today"],
    ["cena hoy", "dinner-today"],
    ["¿Qué hay de cena hoy?", "dinner-today"],
    ["What's for dinner tomorrow?", "dinner-tomorrow"],
    ["cena mañana", "dinner-tomorrow"],
    ["¿Qué hay de cena mañana?", "dinner-tomorrow"],
    ["what's for lunch and dinner tomorrow", "dinner-tomorrow"],
  ];
  for (const [phrase, action] of cases) {
    assert.equal(matchAskAction(phrase), action, phrase);
  }
  assert.equal(matchAskAction(""), null);
  assert.equal(matchAskAction("   "), null);
  assert.equal(matchAskAction("tell me a joke"), null);
  assert.equal(matchAskAction("invent a new meal plan with AI"), null);
});

test("week dinner lookups list each date without requiring Apply", () => {
  const meals = {
    "2026-09-07": mealWithDinner("tacos"),
    "2026-09-09": mealWithDinner("chili"),
    "2026-09-03": mealWithDinner("pesto"),
  };
  const next = lookupDinnersRange({
    action: "dinners-next-week",
    now: thursdayEvening,
    mealForDate: (dateKey) => meals[dateKey] || emptyMeal,
  });
  assert.equal(next.kind, "dinners-range");
  assert.equal(next.when, "next-week");
  assert.deepEqual(next.dateKeys, nextWeek);
  assert.equal(next.days.length, 7);
  assert.equal(next.days[0].dateKey, "2026-09-07");
  assert.equal(next.days[0].items[0].recipeId, "tacos");
  assert.equal(next.days[1].empty, true);
  assert.equal(next.days[2].items[0].recipeId, "chili");
  assert.equal(assistantPreviewNeedsConfirm(next), false);

  const remaining = lookupDinnersRange({
    action: "dinners-this-week",
    now: thursdayEvening,
    mealForDate: (dateKey) => meals[dateKey] || emptyMeal,
  });
  assert.equal(remaining.when, "this-week");
  assert.deepEqual(remaining.dateKeys, dateKeysForAction("fill-gaps", thursdayEvening));
  assert.equal(remaining.days[0].dateKey, "2026-09-03");
  assert.equal(remaining.days[0].items[0].recipeId, "pesto");
  assert.equal(assistantPreviewNeedsConfirm(remaining), false);
});

test("next-week fill and lookup count only real calendar dinners, not this week's template", () => {
  const thisWeekStart = "2026-08-31";
  const nextWeekStart = "2026-09-07";
  const repeatingWeek = {
    mon: mealWithDinner("meatballs"),
    tue: mealWithDinner("chicken"),
    wed: mealWithDinner("lemon"),
    thu: mealWithDinner("halibut"),
    fri: mealWithDinner("pasta"),
    sat: mealWithDinner("tacos"),
    sun: mealWithDinner("chili"),
  };
  const calendarMeals = {
    "2026-09-08": mealWithDinner("roast"),
    "2026-09-10": mealWithDinner("pesto"),
  };
  const mealForDate = (dateKey) => mealPlanForDateKey({
    dateKey,
    calendarMeals,
    schedule: repeatingWeek,
    visibleWeekStartKey: nextWeekStart,
    currentWeekStartKey: thisWeekStart,
  });

  const fill = proposeDinnerFill({
    action: "plan-next-week",
    now: thursdayEvening,
    mealForDate,
    recipes,
  });
  assert.deepEqual(fill.dateKeys, nextWeek);
  assert.equal(fill.occupied.length, 2);
  assert.deepEqual(fill.occupied.map((entry) => entry.dateKey), ["2026-09-08", "2026-09-10"]);
  assert.equal(fill.assignments.length, 5);
  assert.ok(!fill.occupied.some((entry) => entry.dateKey === "2026-09-07"));

  const lookup = lookupDinnersRange({
    action: "dinners-next-week",
    now: thursdayEvening,
    mealForDate,
  });
  assert.equal(lookup.days.length, 7);
  assert.equal(lookup.days.filter((day) => !day.empty).length, 2);
  assert.equal(lookup.days.filter((day) => day.empty).length, 5);
  assert.equal(lookup.days.find((day) => day.dateKey === "2026-09-08")?.items[0].recipeId, "roast");
  assert.equal(lookup.days.find((day) => day.dateKey === "2026-09-10")?.items[0].recipeId, "pesto");
  assert.equal(lookup.days.find((day) => day.dateKey === "2026-09-07")?.empty, true);
});

test("assistant translation keys stay in English/Spanish parity", async () => {
  const logic = await readFile(new URL("../assistant-logic.js", import.meta.url), "utf8");
  const ui = await readFile(new URL("../assistant-ui.js", import.meta.url), "utf8");
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const keys = [
    ...ui.matchAll(/\bt\("([^"]+)"\)/g),
    ...html.matchAll(/data-i18n="([^"]+)"/g),
    ...html.matchAll(/data-i18n-placeholder="([^"]+)"/g),
    ...html.matchAll(/data-i18n-aria-label="([^"]+)"/g),
  ].map((match) => match[1]).filter((key) => key.startsWith("assistant") || key === "assistantHelp");

  for (const key of new Set(keys)) {
    assert.ok(translations.en[key], `English missing ${key}`);
    assert.ok(translations.es[key], `Spanish missing ${key}`);
  }
  assert.equal(translations.es.assistantApply, "Aplicar");
  assert.ok(!logic.includes("openai") && !logic.includes("OpenAI"));
});
