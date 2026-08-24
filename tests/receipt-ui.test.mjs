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
    focus() {
      this.focused = true;
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
    getPurchasedCount: () => 1,
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

test("receipt photo and camera selections queue together before parsing", async () => {
  const form = element();
  const photoInput = Object.assign(element(), { files: [], value: "" });
  const cameraInput = Object.assign(element(), { files: [], value: "" });
  const submitButton = Object.assign(element(), { disabled: false });
  const elements = {
    "#scanReceiptToggle": element(),
    "#receiptScanPanel": element(),
    "#receiptScanForm": form,
    "#receiptScanPhotoInput": photoInput,
    "#receiptScanCameraInput": cameraInput,
    "#receiptScanLocationInput": Object.assign(element(), { value: "pantry" }),
    "#receiptScanForm .primary-action": submitButton,
    "#receiptSuggestions": element(),
    "#receiptScanPhotoInputFileStatus": element(),
  };
  let parsed = [];
  const ui = createReceiptUi({
    $: (selector) => elements[selector],
    $$: () => [],
    t: (key) => key === "filesSelected" ? "{count} photos selected" : key,
    escapeHtml: (value) => `${value || ""}`,
    readFilesAsDataUrls: async (files) => { parsed = files; return files; },
    recognizeReceipt: async () => ({ items: [] }),
    shoppingMatchForReceiptItem: () => null,
    setGroceryStatus: () => {},
    clearGroceryStatus: () => {},
    getReceiptSuggestions: () => [],
    setReceiptSuggestions: () => {},
    setPendingReceipt: () => {},
    getLang: () => "en",
  });
  ui.bindReceiptControls();
  photoInput.files = [{ name: "front.jpg" }];
  cameraInput.files = [{ name: "back.jpg" }];
  await photoInput.dispatch("change");
  await cameraInput.dispatch("change");
  await form.dispatch("submit");
  assert.deepEqual(parsed.map((file) => file.name), ["front.jpg", "back.jpg"]);
});

test("receipt review requires a total before it can update the budget", async () => {
  const elements = {
    "#receiptSuggestions": element(),
    "#addReceiptSuggestions": element(),
    "#receiptStoreInput": Object.assign(element(), { value: "Market" }),
    "#receiptDateInput": Object.assign(element(), { value: "2026-08-17" }),
    "#receiptTotalInput": Object.assign(element(), { value: "" }),
    "#receiptScanLocationInput": Object.assign(element(), { value: "pantry" }),
  };
  const checkbox = Object.assign(element(), { dataset: { receiptSuggestion: "0" }, checked: true });
  let savedReceipt = null;
  let statusKey = "";
  let tripFinished = false;
  const ui = createReceiptUi({
    $: (selector) => elements[selector],
    $$: (selector) => selector === "[data-receipt-suggestion]" ? [checkbox] : [],
    t: (key) => key,
    escapeHtml: (value) => `${value || ""}`,
    inventoryItem: (text) => ({ text }),
    mergeInventory: (current, incoming) => [...current, ...incoming],
    readFilesAsDataUrls: async () => [],
    recognizeReceipt: async () => ({}),
    shoppingMatchForReceiptItem: () => null,
    renderGroceries: () => {},
    bindGroceryControls: () => {},
    renderInventory: () => {},
    bindInventoryControls: () => {},
    saveGroceries: async () => {},
    saveInventory: async () => {},
    setGroceryStatus: (key) => { statusKey = key; },
    clearGroceryStatus: () => {},
    getReceiptSuggestions: () => [{ text: "milk", quantity: "1" }],
    setReceiptSuggestions: () => {},
    getPendingReceipt: () => ({ store: "Market", date: "2026-08-17", total: 0 }),
    setPendingReceipt: () => {},
    addReceipt: async (receipt) => { savedReceipt = receipt; },
    getLang: () => "en",
    getInventory: () => [], setInventory: () => {},
    getGroceries: () => [], setGroceries: () => {},
    finishPurchasedItems: () => 0,
    onTripFinished: () => { tripFinished = true; },
  });
  ui.renderReceiptSuggestions();
  await elements["#addReceiptSuggestions"]?.dispatch("click");
  assert.equal(savedReceipt, null);
  assert.equal(statusKey, "receiptTotalRequired");
  assert.equal(elements["#receiptTotalInput"].focused, true);
  assert.equal(tripFinished, false);
});

test("receipt save failures keep the review open", async () => {
  const elements = {
    "#receiptSuggestions": element(),
    "#addReceiptSuggestions": element(),
    "#receiptStoreInput": Object.assign(element(), { value: "Market" }),
    "#receiptDateInput": Object.assign(element(), { value: "2026-08-17" }),
    "#receiptTotalInput": Object.assign(element(), { value: "18.25" }),
    "#receiptScanLocationInput": Object.assign(element(), { value: "pantry" }),
  };
  const checkbox = Object.assign(element(), { dataset: { receiptSuggestion: "0" }, checked: true });
  let statusKey = "";
  let tripFinished = false;
  const ui = createReceiptUi({
    $: (selector) => elements[selector],
    $$: (selector) => selector === "[data-receipt-suggestion]" ? [checkbox] : [],
    t: (key) => key,
    escapeHtml: (value) => `${value || ""}`,
    inventoryItem: (text) => ({ text }),
    mergeInventory: (current, incoming) => [...current, ...incoming],
    readFilesAsDataUrls: async () => [],
    recognizeReceipt: async () => ({}),
    shoppingMatchForReceiptItem: () => null,
    renderGroceries: () => {},
    bindGroceryControls: () => {},
    renderInventory: () => {},
    bindInventoryControls: () => {},
    saveGroceries: async () => {},
    saveInventory: async () => {},
    setGroceryStatus: (key) => { statusKey = key; },
    clearGroceryStatus: () => {},
    getReceiptSuggestions: () => [{ text: "milk", quantity: "1" }],
    setReceiptSuggestions: () => {},
    getPendingReceipt: () => ({ store: "Market", date: "2026-08-17", total: 18.25 }),
    setPendingReceipt: () => {},
    addReceipt: async () => false,
    getLang: () => "en",
    getInventory: () => [], setInventory: () => {},
    getGroceries: () => [], setGroceries: () => {},
    finishPurchasedItems: () => 0,
    onTripFinished: () => { tripFinished = true; },
  });
  ui.renderReceiptSuggestions();
  await elements["#addReceiptSuggestions"]?.dispatch("click");
  assert.equal(statusKey, "receiptSaveError");
  assert.equal(tripFinished, false);
});
