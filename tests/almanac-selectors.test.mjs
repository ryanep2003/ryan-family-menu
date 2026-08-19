import test from "node:test";
import assert from "node:assert/strict";
import { daysSince, navigationLabel, selectRecipeMemory, selectTodayStory } from "../almanac-selectors.js";
import { readFile } from "node:fs/promises";

test("Living Almanac selectors keep family memory presentation-only", () => {
  const memory = selectRecipeMemory("cutlets", [{ dateKey: "2026-08-01", items: [{ recipeId: "cutlets" }] }]);
  assert.equal(memory.count, 1);
  assert.equal(memory.lastMade, "2026-08-01");
  assert.equal(selectTodayStory({}).state, "empty");
  assert.equal(navigationLabel("grocery"), "Shop");
});

test("family-memory selectors derive factual household language from recorded reactions", () => {
  const members = [
    { id: "eric", name: "Eric", active: true },
    { id: "theo", name: "Theo", active: true },
  ];
  const memory = selectRecipeMemory("tacos", [{
    dateKey: "2026-08-01",
    attendeeIds: ["eric", "theo"],
    reactions: { eric: "loved", theo: "ate" },
    items: [{ recipeId: "tacos" }],
  }], members);

  assert.equal(memory.fact, "everyoneAte");
  assert.deepEqual(memory.likedNames, ["Eric", "Theo"]);
  assert.equal(daysSince("2026-08-01", "2026-08-19"), 18);
  assert.equal(daysSince("not-a-date", "2026-08-19"), null);
});

test("family-memory selectors condense a deep history into one current record", () => {
  const members = [{ id: "theo", name: "Theo", active: true }];
  const events = Array.from({ length: 6 }, (_, index) => ({
    dateKey: `2026-08-0${index + 1}`,
    attendeeIds: ["theo"],
    reactions: { theo: index === 5 ? "ate" : "neutral" },
    items: [{ recipeId: "pasta" }],
  }));

  const memory = selectRecipeMemory("pasta", events, members);

  assert.equal(memory.count, 6);
  assert.equal(memory.lastMade, "2026-08-06");
  assert.equal(memory.fact, "everyoneAte");
});

test("Living Almanac stylesheet uses only declared custom properties", async () => {
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  const declared = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]));
  const referenced = new Set([...css.matchAll(/var\((--[\w-]+)/g)].map((match) => match[1]));
  assert.deepEqual([...referenced].filter((name) => !declared.has(name)), []);
  assert.match(css, /--ground: #F1F2EE/);
  assert.match(css, /--blue: #2947B8/);
});
