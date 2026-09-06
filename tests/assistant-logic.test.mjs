import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  applyDinnerAssignments,
  assistantPreviewNeedsConfirm,
  classifyAskIntent,
  dateKeysForAction,
  dinnerIsOccupied,
  horizonDateKeys,
  lookupDinner,
  matchAskAction,
  nextWeekDateKeys,
  proposeDinnerFill,
  proposeShoppingRefresh,
  relativeDinnerDateKey,
  remainingWeekDateKeys,
} from "../assistant-logic.js";
import { groceryItem } from "../grocery-logic.js";
import { emptyMeal, formatDateKey, normalizeMealPlan } from "../schedule-utils.js";
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

test("fill-gaps uses remaining current-week dates from today through Sunday", () => {
  assert.deepEqual(dateKeysForAction("fill-gaps", thursdayEvening), [
    "2026-09-03",
    "2026-09-04",
    "2026-09-05",
    "2026-09-06",
  ]);
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
  const existing = [{ ...groceryItem("Milk", { source: "manual" }), checked: true }];
  const generated = [groceryItem("Tortillas", {
    source: "meal-plan",
    ingredientKey: "tortilla",
    mealUses: [{ dateKey: "2026-09-07", mealSlot: "dinner", recipeId: "tacos", recipeName: { en: "Tacos" } }],
  })];
  const snapshot = JSON.stringify(existing);
  const proposal = proposeShoppingRefresh({ generatedItems: generated, existingItems: existing });
  assert.equal(proposal.kind, "shopping");
  assert.equal(proposal.generatedCount, 1);
  assert.equal(proposal.listCount, 2);
  assert.equal(proposal.proposedItems.find((item) => item.source === "manual")?.checked, true);
  assert.equal(proposal.changes.added[0]?.ingredientKey, "tortilla");
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

test("Ask text maps only explicit supported commands to existing chip actions", () => {
  const cases = [
    ["Plan next week", "plan-next-week"],
    ["plan dinners", "plan-next-week"],
    ["planear la próxima semana", "plan-next-week"],
    ["Fill gaps this week", "fill-gaps"],
    ["fill empty dinners this week", "fill-gaps"],
    ["completar huecos de esta semana", "fill-gaps"],
    ["Build shopping list", "refresh-shopping"],
    ["refresh the shopping list", "refresh-shopping"],
    ["crear lista de compras", "refresh-shopping"],
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

test("shopping capability questions, typos, negation, and unsupported constraints never become a refresh", () => {
  const clarify = [
    "can you cusomize a shopping list?",
    "can you customize a shopping list?",
    "how do I edit groceries?",
    "shopping list for next week",
    "how do I refresh the shopping list?",
    "can you explain how to build a shopping list?",
    "build shopping list for next week",
  ];
  for (const phrase of clarify) {
    assert.equal(classifyAskIntent(phrase).kind, "shopping-clarification", phrase);
    assert.equal(matchAskAction(phrase), null, phrase);
  }
  assert.equal(classifyAskIntent("don't refresh the shopping list").kind, "shopping-negated");
  assert.equal(classifyAskIntent("refresh the shopping list under $100").kind, "shopping-unsupported");
  assert.equal(classifyAskIntent("grocery list with vegan substitutions").kind, "shopping-unsupported");
  assert.equal(classifyAskIntent("build shopping list without dairy").kind, "shopping-unsupported");
  assert.deepEqual(classifyAskIntent("build shopping list for tomorrow only"), {
    kind: "action", action: "refresh-shopping", dateWindow: "tomorrow",
  });
  assert.equal(matchAskAction("don't refresh the shopping list"), null);
  assert.equal(matchAskAction("refresh the shopping list under $100"), null);
  assert.equal(matchAskAction("don't plan next week"), null);
  assert.equal(matchAskAction("don't fill gaps this week"), null);
});

test("shopping refresh distinguishes a real change from a no-op and keeps manual checked items", () => {
  const planned = groceryItem("Tortillas", {
    source: "meal-plan",
    ingredientKey: "tortilla",
    mealUses: [{ dateKey: "2026-09-07", mealSlot: "dinner", recipeId: "tacos" }],
  });
  const manual = { ...groceryItem("Milk", { source: "manual" }), checked: true };
  const noOp = proposeShoppingRefresh({ generatedItems: [planned], existingItems: [manual, planned] });
  assert.equal(noOp.hasChanges, false);
  assert.equal(assistantPreviewNeedsConfirm(noOp), false);
  assert.equal(noOp.proposedItems.find((item) => item.source === "manual")?.checked, true);

  const changed = proposeShoppingRefresh({ generatedItems: [], existingItems: [manual, planned] });
  assert.equal(changed.hasChanges, true);
  assert.equal(changed.changes.removed[0]?.ingredientKey, "tortilla");
  assert.equal(changed.proposedItems.find((item) => item.source === "manual")?.checked, true);
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
