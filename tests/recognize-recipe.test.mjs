import assert from "node:assert/strict";
import test from "node:test";

import { cleanLines } from "../netlify/functions/recognize-recipe.js";

test("recipe photo scan cleanup preserves long step sentences", () => {
  const longStep = [
    "Add the beer to deglaze, scraping the bottom of the pot with a wooden spoon.",
    "Then add the milk, brown sugar, and any of the leftover marinade juices and solids to the pot.",
    "Bring to a lively simmer over medium-high heat.",
  ].join(" ");

  assert.deepEqual(
    cleanLines([longStep], { lineLength: 1200 }),
    [longStep]
  );
  assert.match(cleanLines([longStep], { lineLength: 1200 })[0], /medium-high heat\.$/);
});
