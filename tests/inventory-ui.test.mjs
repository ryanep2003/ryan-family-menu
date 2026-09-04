import assert from "node:assert/strict";
import test from "node:test";

import { createInventoryUi } from "../inventory-ui.js";

function interactiveElement() {
  const listeners = new Map();
  return {
    dataset: {},
    hidden: false,
    innerHTML: "",
    value: "",
    addEventListener(type, listener) { listeners.set(type, listener); },
    setAttribute(name, value) { this[name] = value; },
    async dispatch(type, event = {}) { await listeners.get(type)?.({ target: this, ...event }); },
  };
}

function renderInventoryWith(filter, inventory, query = "") {
  const inventoryList = { innerHTML: "" };
  const ui = createInventoryUi({
    $: (selector) => {
      if (selector === "#inventoryList") return inventoryList;
      if (selector === "#inventorySearch") return { value: query };
      return { hidden: false };
    },
    $$: () => [],
    t: (key) => ({
      locationPantry: "Pantry",
      locationFridge: "Fridge",
      locationFreezer: "Freezer",
      locationHousehold: "Household",
      inventoryAttentionEmpty: "Everything is stocked.",
      inventorySearchEmpty: "No search matches.",
      noInventoryMatches: "No matches.",
      stockFull: "Full",
      stockSome: "Some",
      stockLow: "Low",
      stockOut: "Out",
      stockLabel: "Stock",
      stockControlLabel: "Stock for {item}",
      itemActions: "Actions for {item}",
      addToShopping: "Add to shopping",
      remove: "Remove",
    }[key] || key),
    escapeHtml: (value) => `${value}`,
    inventoryShoppingNote: () => "",
    getInventory: () => inventory,
    getInventoryFilter: () => filter,
    getLang: () => "en",
  });

  ui.renderInventory();
  return inventoryList.innerHTML;
}

test("attention inventory shows only low and out items", () => {
  const html = renderInventoryWith("attention", [
    { id: "full", text: "Rice", location: "pantry", stockState: "full" },
    { id: "low", text: "Beans", location: "pantry", stockState: "low" },
    { id: "out", text: "Milk", location: "fridge", stockState: "out" },
  ]);

  assert.doesNotMatch(html, /Rice/);
  assert.match(html, /Beans/);
  assert.match(html, /Milk/);
});

test("attention inventory also surfaces expired food", () => {
  const html = renderInventoryWith("attention", [
    { id: "fresh", text: "Rice", location: "pantry", stockState: "full", expiresOn: "2026-09-30" },
    { id: "soon", text: "Milk", location: "fridge", stockState: "full", expiresOn: "2020-01-01" },
  ]);

  assert.doesNotMatch(html, /Rice/);
  assert.match(html, /Milk/);
  assert.match(html, /inventoryExpired/);
});

test("attention inventory explains when everything is stocked", () => {
  const html = renderInventoryWith("attention", [
    { id: "full", text: "Rice", location: "pantry", stockState: "full" },
  ]);

  assert.match(html, /Everything is stocked/);
});

test("inventory rows keep stock states readable and secondary actions quiet", () => {
  const html = renderInventoryWith("all", [
    { id: "full", text: "Extra long ground cinnamon container", location: "pantry", stockState: "full" },
    { id: "some", text: "Paprika", location: "pantry", stockState: "some" },
    { id: "low", text: "Turmeric", location: "pantry", stockState: "low" },
    { id: "out", text: "Ground cloves", location: "pantry", stockState: "out" },
  ]);

  assert.match(html, /class="inventory-item-main"/);
  assert.match(html, /class="inventory-stock-control">\s*<span>Stock<\/span>/);
  assert.match(html, /value="full" selected>Full/);
  assert.match(html, /value="some" selected>Some/);
  assert.match(html, /value="low" selected>Low/);
  assert.match(html, /value="out" selected>Out/);
  assert.match(html, /class="inventory-menu-icon"[^>]*>&#8942;/);
  assert.doesNotMatch(html, /•••/);
});

test("inventory search finds stocked items regardless of the active attention filter", () => {
  const html = renderInventoryWith("attention", [
    { id: "rice", text: "Brown rice", location: "pantry", stockState: "full" },
    { id: "beans", text: "Black beans", location: "pantry", stockState: "low" },
  ], "rice");

  assert.match(html, /Brown rice/);
  assert.doesNotMatch(html, /Black beans/);
});

test("inventory search has a specific empty state", () => {
  const html = renderInventoryWith("all", [
    { id: "rice", text: "Brown rice", location: "pantry", stockState: "full" },
  ], "milk");

  assert.match(html, /No search matches/);
});

test("low and out items expose one direct grocery action", () => {
  const html = renderInventoryWith("attention", [
    { id: "low", text: "Beans", location: "pantry", stockState: "low" },
    { id: "out", text: "Milk", location: "fridge", stockState: "out" },
  ]);

  assert.equal((html.match(/data-add-inventory-to-shopping="low"/g) || []).length, 1);
  assert.equal((html.match(/data-add-inventory-to-shopping="out"/g) || []).length, 1);
  assert.equal((html.match(/class="inventory-restock-action"/g) || []).length, 2);
});

test("empty inventory keeps add and scan reachable without opening Manage first", () => {
  const inventoryList = interactiveElement();
  const toolsMenu = { open: false, dataset: {} };
  const addPanel = { open: false, dataset: {} };
  const scanPanel = { open: false, dataset: {} };
  const inventoryInput = { focused: false, dataset: {}, focus() { this.focused = true; } };
  const ui = createInventoryUi({
    $: (selector) => {
      if (selector === "#inventoryList") return inventoryList;
      if (selector === "#inventorySearch") return { value: "", dataset: {} };
      if (selector === "#inventoryToolsMenu") return toolsMenu;
      if (selector === "#inventoryAddPanel") return addPanel;
      if (selector === "#inventoryScanPanel") return scanPanel;
      if (selector === "#inventoryInput") return inventoryInput;
      return { hidden: false, dataset: {}, disabled: false };
    },
    $$: () => [],
    t: (key) => ({
      inventoryEmpty: "No items at home yet. Add an item or scan a shelf to get started.",
      addInventoryItem: "Add item",
      scanShelf: "Scan shelf",
    })[key] || key,
    escapeHtml: (value) => `${value}`,
    inventoryShoppingNote: () => "",
    getInventory: () => [],
    getInventoryFilter: () => "all",
    getLang: () => "en",
  });

  ui.renderInventory();
  ui.bindInventoryControls();

  assert.match(inventoryList.innerHTML, /No items at home yet/);
  assert.doesNotMatch(inventoryList.innerHTML, /above/);
  assert.match(inventoryList.innerHTML, /data-open-inventory-add/);
  assert.match(inventoryList.innerHTML, /data-open-inventory-scan/);
  assert.equal(toolsMenu.open, true);

  const addButton = { dataset: {}, closest(selector) { return selector === "[data-open-inventory-add]" ? this : null; } };
  inventoryList.dispatch("click", { target: addButton });
  assert.equal(addPanel.open, true);
  assert.equal(scanPanel.open, false);
  assert.equal(inventoryInput.focused, true);
});

test("clear inventory removes the collection in one confirmed action and offers undo", async () => {
  const inventoryList = interactiveElement();
  const elements = {
    "#inventoryList": inventoryList,
    "#inventorySearch": Object.assign(interactiveElement(), { value: "" }),
    "#inventoryBulkToolbar": interactiveElement(),
    "#inventorySelectMode": interactiveElement(),
    "#inventoryBulkCount": interactiveElement(),
    "#inventoryRemoveSelected": interactiveElement(),
    "#inventoryClearSelection": interactiveElement(),
    "#inventorySelectVisible": interactiveElement(),
    "#inventoryClearAll": interactiveElement(),
  };
  let inventory = [
    { id: "milk", text: "Milk", location: "fridge", stockState: "full" },
    { id: "rice", text: "Rice", location: "pantry", stockState: "some" },
  ];
  let saved = 0;
  let undo = null;
  const ui = createInventoryUi({
    $: (selector) => elements[selector],
    $$: () => [],
    t: (key) => ({
      locationPantry: "Pantry", locationFridge: "Fridge", locationFreezer: "Freezer", locationHousehold: "Household",
      inventoryEmpty: "Empty", inventorySelectedCount: "{count} selected", selectInventory: "Select", doneSelecting: "Done",
      removeSelectedInventory: "Remove selected", clearAllInventory: "Clear inventory", clearAllInventoryConfirm: "Confirm",
      inventoryCleared: "Cleared", selectVisible: "Select visible", clearSelection: "Clear selection", inventoryBulkHelper: "Helper",
      inventoryAttentionEmpty: "Nothing", inventorySearchEmpty: "No search", noInventoryMatches: "No matches",
      stockFull: "Full", stockSome: "Some", stockLow: "Low", stockOut: "Out", stockLabel: "Stock", stockControlLabel: "Stock for {item}",
      itemActions: "Actions for {item}", editInventoryItem: "Edit", addToShopping: "Add", remove: "Remove", inventoryAmountShort: "Amount",
      inventoryUnitShort: "Unit", expiresOn: "Expires", unitEach: "Each",
    }[key] || key),
    escapeHtml: (value) => `${value}`,
    inventoryShoppingNote: () => "",
    getInventory: () => inventory,
    setInventory: (items) => { inventory = items; },
    getInventoryFilter: () => "all",
    getLang: () => "en",
    saveInventory: async () => { saved += 1; },
    offerUndo: (label, action) => { undo = { label, action }; },
  });

  ui.bindInventoryControls();
  await elements["#inventoryClearAll"].dispatch("click");
  assert.deepEqual(inventory, []);
  assert.equal(saved, 1);
  assert.equal(undo.label, "Cleared");
  await undo.action();
  assert.deepEqual(inventory.map((item) => item.id), ["milk", "rice"]);
  assert.equal(saved, 2);
});
