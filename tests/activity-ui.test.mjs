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

test("activity labels localize the default Family identity", () => {
  const target = { innerHTML: "" };
  const ui = createActivityUi({
    $: (selector) => selector === "#householdActivity" ? target : null,
    t: (key) => ({ activityBy: "{name} · {time}", householdFamily: "Familia", activityEmpty: "Empty" })[key] || key,
    escapeHtml: (value) => value,
    getActivity: () => [{
      type: "meal",
      label: "Planned Tuesday",
      updatedBy: "Family",
      updatedAt: "2026-09-03T12:00:00.000Z",
    }],
  });

  ui.renderActivity();

  assert.match(target.innerHTML, /Familia/);
  assert.doesNotMatch(target.innerHTML, /Updated by Family|Family ·/);
});
