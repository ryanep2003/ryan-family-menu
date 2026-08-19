import test from "node:test";
import assert from "node:assert/strict";
import { createActivityUi } from "../activity-ui.js";

test("activity renderer tolerates an older shell without the activity target", () => {
  const ui = createActivityUi({
    $: () => null,
    t: (key) => key,
    escapeHtml: (value) => value,
    getActivity: () => [],
  });
  assert.doesNotThrow(() => ui.renderActivity());
});
