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

test("family memory does not call neutral feedback a skipped meal or takeout a cooked dinner", () => {
  const members = [{ id: "avery", name: "Avery", active: true }];
  const events = [
    { dateKey: "2026-09-21", status: "cooked", attendeeIds: ["avery"], reactions: { avery: "neutral" }, items: [{ recipeId: "tacos" }] },
    { dateKey: "2026-09-22", status: "takeout", outcome: "skip", items: [{ recipeId: "tacos" }] },
  ];
  const memory = selectRecipeMemory("tacos", events, members);
  assert.equal(memory.lastMade, "2026-09-21");
  assert.equal(memory.fact, "");
  const disliked = selectRecipeMemory("tacos", [{ ...events[0], reactions: { avery: "disliked" } }], members);
  assert.equal(disliked.fact, "disliked");
  assert.deepEqual(disliked.dislikedNames, ["Avery"]);
});

test("family visual system uses the locked navy and sage tokens", async () => {
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  const declared = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]));
  const referenced = new Set([...css.matchAll(/var\((--[\w-]+)/g)].map((match) => match[1]));
  assert.deepEqual([...referenced].filter((name) => !declared.has(name)), []);
  assert.match(css, /--navy: #1A3A5C/);
  assert.match(css, /--sage: #CFE8D5/);
  assert.match(css, /--soft-blue: #AFCBFF/);
  assert.match(css, /--ground: #F5F1EA/);
});

test("family screens share one paper ground without leftover undeclared tokens", async () => {
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");

  for (const view of ["today", "schedule", "grocery", "recipes"]) {
    assert.match(css, new RegExp(`body\\[data-view="${view}"\\]`));
  }
  assert.match(css, /--page-wash-primary: var\(--ground\)/);
  assert.doesNotMatch(css, /--page-wash-primary: color-mix/);
  assert.match(css, /--surface-clay: #FFFFFF/);
  assert.match(css, /--surface-herb: #CFE8D5/);
  assert.match(css, /--surface-utility: #FFFFFF/);
  const recipeBrowseRule = css.match(/\.recipe-browse\s*\{([^}]*)\}/)?.[1] || "";
  assert.match(recipeBrowseRule, /background: transparent/);
  assert.doesNotMatch(recipeBrowseRule, /surface-utility/);
  const recipeBannerRule = css.match(/\.recipe-banner\s*\{([^}]*)\}/)?.[1] || "";
  assert.doesNotMatch(recipeBannerRule, /min-height:\s*12rem/);
  assert.match(recipeBannerRule, /background: transparent/);
  const recipePicksEmptyRule = css.match(/\.recipe-picks #recipePicksEmpty\s*\{([^}]*)\}/)?.[1] || "";
  assert.doesNotMatch(recipePicksEmptyRule, /border-left/);
  assert.match(css, /\.dinner-feedback\s*\{[\s\S]*linear-gradient/);
  assert.match(css, /\.today-tools > summary\s*\{[\s\S]*linear-gradient/);
});
