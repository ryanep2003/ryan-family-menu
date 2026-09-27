import assert from "node:assert/strict";
import test from "node:test";
import { correctedDinnerEvent, saveDinnerHistoryCorrection } from "../dinner-history-correction.js";
import { normalizeDinnerEvent } from "../memory-logic.js";

const source = normalizeDinnerEvent({
  dateKey: "2026-09-22",
  status: "cooked",
  outcome: "loved",
  items: [{ id: "main-1", recipeId: "tacos", name: "Tacos", role: "main" }],
  attendeeIds: ["member-a"],
  reactions: { "member-a": "loved" },
  leftovers: { "main-1": 2 },
  note: "Family dinner",
  updatedAt: "2026-09-22T20:00:00.000Z",
  updatedBy: "Family",
});

test("correction keeps the same dinner source and changes only supported feedback", () => {
  const corrected = correctedDinnerEvent(source, {
    outcome: "mixed",
    reactions: { "member-a": "disliked", outsider: "loved" },
    updatedAt: "2026-09-23T12:00:00.000Z",
    updatedBy: "Avery",
  });
  assert.equal(corrected.id, source.id);
  assert.deepEqual(corrected.items, source.items);
  assert.deepEqual(corrected.leftovers, source.leftovers);
  assert.equal(corrected.note, source.note);
  assert.deepEqual(corrected.reactions, { "member-a": "disliked" });
  assert.equal(corrected.outcome, "mixed");
  assert.equal(corrected.updatedBy, "Avery");
  assert.equal(correctedDinnerEvent(source, { outcome: "invented" }), null);
});

test("a correction writes one fresh versioned record and can reverse dinner learning", async () => {
  let writes = 0;
  const result = await saveDinnerHistoryCorrection({
    getJson: async () => ({ items: [source], version: 9 }),
    putJson: async (_url, payload) => {
      writes += 1;
      assert.equal(payload.version, 9);
      assert.equal(payload.items[0].outcome, "not-made");
      assert.equal(payload.items[0].status, "skipped");
      assert.equal(payload.items[0].id, source.id);
      return { items: payload.items, version: 10 };
    },
    dateKey: source.dateKey,
    expectedEvent: source,
    correction: { outcome: "not-made", reactions: {}, updatedAt: "2026-09-23T12:00:00.000Z" },
  });
  assert.equal(writes, 1);
  assert.equal(result.status, "saved");
  assert.equal(result.version, 10);
});

test("stale source and server conflict never retry or overwrite another dinner edit", async () => {
  let writes = 0;
  const stale = await saveDinnerHistoryCorrection({
    getJson: async () => ({ items: [{ ...source, outcome: "mixed" }], version: 10 }),
    putJson: async () => { writes += 1; },
    dateKey: source.dateKey,
    expectedEvent: source,
    correction: { outcome: "worked" },
  });
  assert.equal(stale.status, "stale");
  assert.equal(writes, 0);
  const conflict = await saveDinnerHistoryCorrection({
    getJson: async () => ({ items: [source], version: 9 }),
    putJson: async () => { writes += 1; throw Object.assign(new Error("conflict"), { status: 409 }); },
    dateKey: source.dateKey,
    expectedEvent: source,
    correction: { outcome: "worked" },
  });
  assert.equal(conflict.status, "stale");
  assert.equal(writes, 1);
});

test("offline correction reports unavailable without claiming a saved record", async () => {
  const result = await saveDinnerHistoryCorrection({
    getJson: async () => { throw new Error("offline"); },
    putJson: async () => { throw new Error("should not write"); },
    dateKey: source.dateKey,
    expectedEvent: source,
    correction: { outcome: "worked" },
  });
  assert.deepEqual(result, { status: "unavailable" });
});
