import assert from "node:assert/strict";
import test from "node:test";

import { bindInstallPrompt, installInstructions } from "../app-lifecycle.js";

const labels = {
  installInstructionsAndroid: "android",
  installInstructionsIos: "ios",
  installInstructions: "default",
};

const t = (key) => labels[key] || key;

test("installInstructions selects Android install copy", () => {
  assert.equal(installInstructions("Mozilla/5.0 Android", t), "android");
});

test("installInstructions selects iOS install copy", () => {
  assert.equal(installInstructions("Mozilla/5.0 iPhone", t), "ios");
});

test("installInstructions falls back for desktop browsers", () => {
  assert.equal(installInstructions("Mozilla/5.0 Macintosh", t), "default");
});

function element(hidden = false) {
  const listeners = {};
  return {
    hidden,
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
    async click() {
      await listeners.click?.();
    },
  };
}

function installHarness({ dismissed = false, standalone = false, userAgent = "Mozilla/5.0 Macintosh" } = {}) {
  const elements = {
    "#installPrompt": element(true),
    "#installButton": element(),
    "#dismissInstall": element(),
  };
  const listeners = {};
  const values = new Map(dismissed ? [["dinner-install-prompt-dismissed", "true"]] : []);
  const alerts = [];
  const windowObject = {
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
    alert(message) {
      alerts.push(message);
    },
    matchMedia: () => ({ matches: standalone }),
  };

  bindInstallPrompt({
    $: (selector) => elements[selector],
    t,
    windowObject,
    navigatorObject: { userAgent, standalone: false },
    storage: {
      getItem: (key) => values.get(key) || null,
      setItem: (key, value) => values.set(key, value),
    },
  });

  return { alerts, elements, listeners, values };
}

test("install suggestion appears only when installation is relevant", () => {
  const desktop = installHarness();
  assert.equal(desktop.elements["#installPrompt"].hidden, true);

  desktop.listeners.beforeinstallprompt({ preventDefault() {}, prompt() {}, userChoice: Promise.resolve({ outcome: "dismissed" }) });
  assert.equal(desktop.elements["#installPrompt"].hidden, false);

  const ios = installHarness({ userAgent: "Mozilla/5.0 iPhone" });
  assert.equal(ios.elements["#installPrompt"].hidden, false);

  const installed = installHarness({ standalone: true });
  assert.equal(installed.elements["#installPrompt"].hidden, true);
});

test("accepted install and dismissal permanently hide the suggestion", async () => {
  const accepted = installHarness();
  accepted.listeners.beforeinstallprompt({
    preventDefault() {},
    async prompt() {},
    userChoice: Promise.resolve({ outcome: "accepted" }),
  });
  await accepted.elements["#installButton"].click();
  assert.equal(accepted.elements["#installPrompt"].hidden, true);
  assert.equal(accepted.values.get("dinner-install-prompt-dismissed"), "true");

  const dismissed = installHarness({ userAgent: "Mozilla/5.0 iPhone" });
  await dismissed.elements["#dismissInstall"].click();
  assert.equal(dismissed.elements["#installPrompt"].hidden, true);
  assert.equal(dismissed.values.get("dinner-install-prompt-dismissed"), "true");
});

test("manual install instructions hide after use", async () => {
  const manual = installHarness({ userAgent: "Mozilla/5.0 iPhone" });

  await manual.elements["#installButton"].click();

  assert.deepEqual(manual.alerts, ["ios"]);
  assert.equal(manual.elements["#installPrompt"].hidden, true);
});
