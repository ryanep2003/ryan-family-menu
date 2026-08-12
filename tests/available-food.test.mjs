import assert from "node:assert/strict";
import test from "node:test";

import {
  addAvailableFood,
  normalizeAvailableFood,
  orderAvailableFood,
  useFirstAvailableFood,
} from "../available-food.js";

test("available food orders today before tomorrow and later", () => {
  const items = [
    { id: "later", label: "Crackers", type: "snack", freshness: "later", createdAt: "2026-07-17T08:00:00Z" },
    { id: "tomorrow", label: "Soup", type: "leftover", freshness: "tomorrow", createdAt: "2026-07-17T09:00:00Z" },
    { id: "today", label: "Pasta", type: "leftover", freshness: "today", createdAt: "2026-07-17T10:00:00Z" },
  ];

  assert.deepEqual(orderAvailableFood(items).map((item) => item.id), ["today", "tomorrow", "later"]);
  assert.equal(useFirstAvailableFood(items).id, "today");
});

test("available food persists a localized label and rejects invalid records", () => {
  const next = addAvailableFood([], {
    id: "snack-1",
    label: "Yogurt",
    type: "snack",
    freshness: "tomorrow",
    lang: "en",
    now: "2026-07-17T10:00:00Z",
  });

  assert.equal(next[0].label.en, "Yogurt");
  assert.equal(next[0].label.es, undefined);
  assert.equal(addAvailableFood([], { label: "", type: "snack", freshness: "today" }), null);
  assert.deepEqual(normalizeAvailableFood([{ id: "bad", label: "", type: "dessert", freshness: "never" }]), []);
});
