import assert from "node:assert/strict";
import test from "node:test";

import { createSharedStateLoader } from "../shared-state-loader.js";

function timerHarness() {
  const scheduled = [];
  return {
    scheduled,
    setTimer(callback, delay) {
      scheduled.push({ callback, delay, cleared: false });
      return scheduled.length;
    },
    clearTimer(id) {
      if (scheduled[id - 1]) scheduled[id - 1].cleared = true;
    },
  };
}

test("render failures after a successful response never schedule another request", async () => {
  const timers = timerHarness();
  let fetches = 0;
  let applyErrors = 0;
  const loader = createSharedStateLoader({
    fetchState: async () => {
      fetches += 1;
      return { state: {} };
    },
    applyState: async () => {
      throw new Error("render failed");
    },
    onUnavailable: () => assert.fail("successful responses are not network failures"),
    onApplyError: () => { applyErrors += 1; },
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  });

  const result = await loader.load();

  assert.equal(result.status, "apply-error");
  assert.equal(fetches, 1);
  assert.equal(applyErrors, 1);
  assert.equal(timers.scheduled.length, 0);
});

test("network retries stop after the configured finite ceiling", async () => {
  const timers = timerHarness();
  let fetches = 0;
  let unavailable = 0;
  const loader = createSharedStateLoader({
    fetchState: async () => {
      fetches += 1;
      throw new Error("offline");
    },
    applyState: async () => assert.fail("offline responses cannot be applied"),
    onUnavailable: () => { unavailable += 1; },
    retryDelays: [100, 500],
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  });

  await loader.load();
  assert.deepEqual(timers.scheduled.map(({ delay }) => delay), [100]);
  await timers.scheduled[0].callback();
  assert.deepEqual(timers.scheduled.map(({ delay }) => delay), [100, 500]);
  await timers.scheduled[1].callback();

  assert.equal(fetches, 3);
  assert.equal(unavailable, 1);
  assert.equal(timers.scheduled.length, 2);
});

test("concurrent callers share one in-flight request", async () => {
  let resolveFetch;
  let fetches = 0;
  const loader = createSharedStateLoader({
    fetchState: () => {
      fetches += 1;
      return new Promise((resolve) => { resolveFetch = resolve; });
    },
    applyState: async () => {},
    onUnavailable: () => {},
  });

  const first = loader.load();
  const second = loader.load();
  resolveFetch({ state: {} });
  await Promise.all([first, second]);

  assert.equal(fetches, 1);
});
