import assert from "node:assert/strict";
import test from "node:test";

import { createReceiptUi } from "../receipt-ui.js";

function element(overrides = {}) {
  return {
    hidden: false,
    innerHTML: "",
    textContent: "",
    value: "",
    addEventListener() {},
    scrollIntoView() {},
    ...overrides,
  };
}

test("receipt review becomes the primary surface and only flags uncertain items", () => {
  const elements = {
    "#receiptSuggestions": element(),
    "#receiptScanForm": element(),
    "#addReceiptSuggestions": element(),
  };
  const suggestions = [
    { text: "Milk", quantity: "1 gallon", confidence: 0.95, matchText: "Milk" },
    { text: "Parmigiano Reggiano", quantity: "0.46 lb", confidence: 0.62, matchText: "" },
  ];

  const ui = createReceiptUi({
    $: (selector) => elements[selector],
    $$: () => [],
    t: (key) => ({
      receiptSuggestionsHeading: "Review receipt",
      receiptStore: "Store",
      receiptDate: "Date",
      receiptTotal: "Total",
      receiptMatch: "Shopping match",
      receiptNewItem: "New item",
      saveReceiptAndMove: "Save receipt and move items",
    }[key] || key),
    escapeHtml: (value) => `${value || ""}`,
    getReceiptSuggestions: () => suggestions,
    getPendingReceipt: () => ({ store: "Publix", date: "2026-09-09", total: 42.5 }),
    getLang: () => "en",
  });

  ui.renderReceiptSuggestions();

  assert.equal(elements["#receiptScanForm"].hidden, true);
  assert.equal(elements["#receiptSuggestions"].hidden, false);
  assert.match(elements["#receiptSuggestions"].innerHTML, /Save receipt and move items/);
  assert.match(elements["#receiptSuggestions"].innerHTML, /needs-review/);
  assert.match(elements["#receiptSuggestions"].innerHTML, /⚠/);
  assert.doesNotMatch(elements["#receiptSuggestions"].innerHTML, /New item/);
});
