import assert from "node:assert/strict";
import test from "node:test";

import { budgetForMonth, normalizeBudgetSettings, normalizeReceipt, normalizeReceipts, receiptFingerprint } from "../budget-logic.js";

test("budget settings and receipts sanitize money and dates", () => {
  assert.deepEqual(normalizeBudgetSettings({ monthlyTarget: "800.129" }), { monthlyTarget: 800.13 });
  const receipt = normalizeReceipt({ date: "2026-08-12", store: " Publix ", total: "45.219", tax: 2.5, itemCount: 9 });
  assert.equal(receipt.store, "Publix");
  assert.equal(receipt.total, 45.22);
  assert.equal(receipt.itemCount, 9);
  assert.equal(normalizeReceipts([{ total: 0 }, receipt]).length, 1);
  assert.equal(normalizeReceipts([{ total: 0, itemCount: 4, store: "Publix" }]).length, 1);
});

test("rapid identical receipt saves are counted once", () => {
  const first = {
    id: "receipt-a",
    date: "2026-09-10",
    store: "Publix",
    subtotal: 95,
    tax: 5,
    total: 100,
    itemCount: 12,
    createdAt: "2026-09-10T11:00:00.000Z",
  };
  const second = {
    ...first,
    id: "receipt-b",
    createdAt: "2026-09-10T11:03:00.000Z",
  };

  assert.equal(receiptFingerprint(first), receiptFingerprint(second));
  assert.equal(normalizeReceipts([second, first]).length, 1);
  assert.equal(budgetForMonth([second, first], new Date("2026-09-10T12:00:00Z")).spent, 100);
});

test("matching purchases outside the rapid duplicate window remain separate", () => {
  const base = {
    date: "2026-09-10",
    store: "Publix",
    subtotal: 95,
    tax: 5,
    total: 100,
    itemCount: 12,
  };
  const receipts = normalizeReceipts([
    { ...base, id: "receipt-a", createdAt: "2026-09-10T11:00:00.000Z" },
    { ...base, id: "receipt-b", createdAt: "2026-09-10T12:00:00.000Z" },
  ]);
  assert.equal(receipts.length, 2);
});

test("monthly budget summarizes spent and remaining from receipt history", () => {
  const summary = budgetForMonth([
    { date: "2026-08-02", store: "A", total: 125 },
    { date: "2026-08-12", store: "B", total: 75.5 },
    { date: "2026-07-31", store: "C", total: 50 },
  ], new Date("2026-08-13T12:00:00"), { monthlyTarget: 500 });

  assert.equal(summary.spent, 200.5);
  assert.equal(summary.remaining, 299.5);
  assert.equal(summary.receipts.length, 2);
  assert.equal(summary.percent, 40);
});
