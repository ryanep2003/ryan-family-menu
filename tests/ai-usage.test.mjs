import assert from "node:assert/strict";
import test from "node:test";
import { withUsageLock } from "../netlify/functions/_ai-usage.js";

test("usage reservations serialize concurrent attempts for one key", async () => {
  let active = 0;
  let maximum = 0;
  const results = await Promise.all(Array.from({ length: 4 }, (_, index) => withUsageLock("household:route:day", async () => {
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, index === 0 ? 4 : 1));
    active -= 1;
    return index;
  })));
  assert.deepEqual(results, [0, 1, 2, 3]);
  assert.equal(maximum, 1);
});
