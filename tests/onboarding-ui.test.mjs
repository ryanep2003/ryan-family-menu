import assert from "node:assert/strict";
import test from "node:test";

import { createOnboardingUi } from "../onboarding-ui.js";

function element({ hidden = false, dataset = {} } = {}) {
  const listeners = {};
  return {
    hidden,
    dataset,
    attributes: {},
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
    async click() {
      await listeners.click?.();
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    focus() {
      this.focused = true;
    },
  };
}

function harness(dismissed = false) {
  const guideButtons = [
    element({ dataset: { guideView: "schedule" } }),
    element({ dataset: { guideView: "grocery", guideInventory: "home" } }),
  ];
  const elements = {
    "#quickGuide": element({ hidden: true }),
    "#quickGuideToggle": element(),
    "#dismissQuickGuide": element(),
  };
  const values = new Map(dismissed ? [["dinner-quick-guide-dismissed", "true"]] : []);
  const state = { view: "", inventoryOpened: false };
  const ui = createOnboardingUi({
    $: (selector) => elements[selector],
    $$: () => guideButtons,
    storage: {
      getItem: (key) => values.get(key) || null,
      setItem: (key, value) => values.set(key, value),
    },
    setView: (view) => {
      state.view = view;
    },
    openInventory: () => {
      state.inventoryOpened = true;
    },
  });

  ui.bind();
  return { elements, guideButtons, state, values };
}

test("quick guide appears once and respects dismissal", async () => {
  const first = harness();
  assert.equal(first.elements["#quickGuide"].hidden, false);
  await first.elements["#dismissQuickGuide"].click();
  assert.equal(first.elements["#quickGuide"].hidden, true);
  assert.equal(first.values.get("dinner-quick-guide-dismissed"), "true");

  const returning = harness(true);
  assert.equal(returning.elements["#quickGuide"].hidden, true);
});

test("quick guide actions enter real workflows and can open inventory", async () => {
  const { guideButtons, state } = harness();

  await guideButtons[1].click();

  assert.equal(state.view, "grocery");
  assert.equal(state.inventoryOpened, true);
});
