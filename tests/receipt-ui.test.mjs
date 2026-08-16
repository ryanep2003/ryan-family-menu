import assert from "node:assert/strict";
import test from "node:test";

import { createReceiptUi } from "../receipt-ui.js";

function element() {
  const listeners = new Map();
  return {
    checked: true,
    dataset: {},
    hidden: false,
    innerHTML: "",
    value: "",
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    async dispatch(type) {
      await listeners.get(type)?.({ preventDefault() {} });
    },
  };
}

test("accepting a scanned receipt finishes checked purchases and records the whole trip", async () => {
  const elements = {
    "#receiptSuggestions": element(),
    "#addReceiptSuggestions": element(),
    "#receiptStoreInput": Object.assign(element(), { value: "Market" }),
    "#receiptDateInput": Object.assign(element(), { value: "2026-08-16" }),
    "#receiptTotalInput": Object.assign(element(), { value: "42.50" }),
    "#receiptScanLocationInput": Object.assign(element(), { value: "pantry" }),
  };
  const checkboxes = [Object.assign(element(), { dataset: { receiptSuggestion: "0" }, checked: true })];
  let groceries = [
    { id: "matched", text: "milk", checked: true },
    { id: "also-checked", text: "bread", checked: true },
  ];
  let inventory = [];
  let recordedReceipt = null;
  let tripFinished = false;
  let groceryBindings = 0;

  const ui = createReceiptUi({
    $: (selector) => elements[selector],
    $$: (selector) => selector === "[data-receipt-suggestion]" ? checkboxes : [],
    t: (key) => key,
    escapeHtml: (value) => `${value || ""}`,
    inventoryItem: (text) => ({ text }),
    mergeInventory: (current, incoming) => [...current, ...incoming],
    readFilesAsDataUrls: async () => [],
    recognizeReceipt: async () => ({}),
    shoppingMatchForReceiptItem: () => null,
    renderGroceries: () => {},
    bindGroceryControls: () => { groceryBindings += 1; },
    renderInventory: () => {},
    bindInventoryControls: () => {},
    saveGroceries: async () => {},
    saveInventory: async () => {},
    setGroceryStatus: () => {},
    clearGroceryStatus: () => {},
    getReceiptSuggestions: () => [{ text: "milk", matchId: "matched", matchText: "milk" }],
    setReceiptSuggestions: () => {},
    getPendingReceipt: () => ({ store: "", date: "", total: 0 }),
    setPendingReceipt: () => {},
    addReceipt: async (receipt) => { recordedReceipt = receipt; },
    getLang: () => "en",
    getInventory: () => inventory,
    setInventory: (items) => { inventory = items; },
    getGroceries: () => groceries,
    setGroceries: (items) => { groceries = items; },
    finishPurchasedItems: () => {
      groceries = groceries.filter((item) => item.id !== "also-checked");
      return 1;
    },
    onTripFinished: () => { tripFinished = true; },
  });

  ui.renderReceiptSuggestions();
  await elements["#addReceiptSuggestions"].dispatch("click");

  assert.deepEqual(inventory, [{ text: "milk" }]);
  assert.deepEqual(groceries, []);
  assert.equal(recordedReceipt.total, 42.5);
  assert.equal(recordedReceipt.itemCount, 2);
  assert.equal(groceryBindings, 1);
  assert.equal(tripFinished, true);
});
