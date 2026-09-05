import assert from "node:assert/strict";
import test from "node:test";

import { createSerializedSaveCoordinator, finishSharedSave, preserveLaterState } from "../shared-save-coordinator.js";

const clone = (value) => JSON.parse(JSON.stringify(value));

function mergeState(server, current, submitted) {
  const merged = clone(server);
  Object.keys(current).forEach((key) => {
    if (JSON.stringify(current[key]) !== JSON.stringify(submitted[key])) merged[key] = clone(current[key]);
  });
  return merged;
}

test("two deferred submissions send immutable bodies and finish with the newer value", async () => {
  let state = { budget: 100, family: "Ryan" };
  let server = { budget: 0, family: "Ryan" };
  let releaseFirst;
  const firstResponse = new Promise((resolve) => { releaseFirst = resolve; });
  const bodies = [];
  let attempt = 0;
  const coordinator = createSerializedSaveCoordinator({
    capture: (options) => ({ ...options, submitted: clone(state) }),
    execute: async (request) => {
      attempt += 1;
      bodies.push(clone(request.submitted));
      if (attempt === 1) await firstResponse;
      server = clone(request.submitted);
      state = preserveLaterState(server, state, request.submitted, mergeState);
      return true;
    },
  });

  const first = coordinator.save({ surface: "budget" });
  state.budget = 200;
  const second = coordinator.save({ surface: "budget" });
  releaseFirst();

  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.deepEqual(bodies.map((body) => body.budget), [100, 200]);
  assert.equal(server.budget, 200);
  assert.equal(state.budget, 200);
});

test("a queued 503 reports failure without replacing the newer local state", async () => {
  let state = { budget: 100 };
  let releaseFirst;
  const firstResponse = new Promise((resolve) => { releaseFirst = resolve; });
  let attempt = 0;
  const coordinator = createSerializedSaveCoordinator({
    capture: (options) => ({ ...options, submitted: clone(state) }),
    execute: async (request) => {
      attempt += 1;
      if (attempt === 1) {
        await firstResponse;
        state = preserveLaterState(request.submitted, state, request.submitted, mergeState);
        return true;
      }
      return false;
    },
  });

  const first = coordinator.save();
  state.budget = 200;
  const second = coordinator.save();
  releaseFirst();
  assert.deepEqual(await Promise.all([first, second]), [true, false]);
  assert.equal(state.budget, 200);
});

test("a conflict retry preserves a third edit and unrelated remote fields", async () => {
  let state = { budget: 100, family: "Ryan" };
  let releaseFirst;
  const firstResponse = new Promise((resolve) => { releaseFirst = resolve; });
  const bodies = [];
  let attempt = 0;
  const coordinator = createSerializedSaveCoordinator({
    capture: (options) => ({ ...options, submitted: clone(state) }),
    execute: async (request) => {
      attempt += 1;
      bodies.push(clone(request.submitted));
      if (attempt === 1) {
        await firstResponse;
        state = preserveLaterState(request.submitted, state, request.submitted, mergeState);
        return true;
      }
      const remote = { budget: 100, family: "Ryan household" };
      state = mergeState(remote, state, request.submitted);
      bodies.push(clone(state));
      return true;
    },
  });

  const first = coordinator.save({ surface: "budget" });
  state.budget = 200;
  const second = coordinator.save({ surface: "budget", requireLedger: "receipts" });
  state.budget = 300;
  releaseFirst();
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.deepEqual(bodies.map((body) => body.budget), [100, 200, 300]);
  assert.equal(state.budget, 300);
  assert.equal(state.family, "Ryan household");
});

test("cross-surface requests retain their own options and results", async () => {
  let state = { budget: 100, family: "Ryan" };
  const seen = [];
  const coordinator = createSerializedSaveCoordinator({
    capture: (options) => ({ ...options, submitted: clone(state) }),
    execute: async (request) => {
      seen.push({ surface: request.surface, requireLedger: request.requireLedger || "" });
      return request.requireLedger !== "receipts";
    },
  });
  const budget = coordinator.save({ surface: "budget", requireLedger: "receipts" });
  state.family = "Ryan household";
  const family = coordinator.save({ surface: "family" });
  assert.deepEqual(await Promise.all([budget, family]), [false, true]);
  assert.deepEqual(seen, [
    { surface: "budget", requireLedger: "receipts" },
    { surface: "family", requireLedger: "" },
  ]);
});

test("a queued intent rebases over a remote-only change from the first conflict", async () => {
  let client = { budget: 0, familyNote: "old" };
  let baseline = clone(client);
  let server = clone(client);
  let version = 1;
  let releaseFirst;
  const firstResponse = new Promise((resolve) => { releaseFirst = resolve; });
  const bodies = [];
  let requestCount = 0;
  const coordinator = createSerializedSaveCoordinator({
    capture: (options) => ({
      ...options,
      intent: clone(client),
      captureBase: clone(baseline),
    }),
    execute: async (request) => {
      requestCount += 1;
      let outgoing = preserveLaterState(baseline, request.intent, request.captureBase, mergeState);
      bodies.push({ state: clone(outgoing), version });
      if (requestCount === 1) {
        await firstResponse;
        const remote = { budget: 0, familyNote: "remote edit" };
        const retryIntent = mergeState(remote, outgoing, baseline);
        client = preserveLaterState(retryIntent, client, outgoing, mergeState);
        baseline = clone(remote);
        version = 2;
        outgoing = retryIntent;
        bodies.push({ state: clone(outgoing), version });
      }
      server = clone(outgoing);
      version += 1;
      client = preserveLaterState(server, client, outgoing, mergeState);
      baseline = clone(server);
      return true;
    },
  });

  client.budget = 100;
  const first = coordinator.save({ surface: "budget" });
  client.budget = 200;
  const second = coordinator.save({ surface: "budget" });
  releaseFirst();
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.deepEqual(bodies.map(({ state }) => [state.budget, state.familyNote]), [
    [100, "old"],
    [100, "remote edit"],
    [200, "remote edit"],
  ]);
  assert.deepEqual(server, { budget: 200, familyNote: "remote edit" });
  assert.deepEqual(client, server);
});

test("receipt-required saves report the real ledger result", async () => {
  const writes = [];
  const result = await finishSharedSave(true, { requireLedger: "receipts" }, {
    activityDirty: true,
    receiptsDirty: true,
    saveLedger: async (kind) => {
      writes.push(kind);
      return kind !== "receipts";
    },
  });
  assert.equal(result, false);
  assert.deepEqual(writes.sort(), ["activity", "receipts"]);
});
