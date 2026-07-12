import assert from "node:assert/strict";
import test from "node:test";

import { createInventoryUi } from "../inventory-ui.js";

function renderInventoryWith(filter, inventory) {
  const inventoryList = { innerHTML: "" };
  const ui = createInventoryUi({
    $: (selector) => selector === "#inventoryList" ? inventoryList : { hidden: false },
    $$: () => [],
    t: (key) => ({
      locationPantry: "Pantry",
      locationFridge: "Fridge",
      locationFreezer: "Freezer",
      locationHousehold: "Household",
      inventoryAttentionEmpty: "Everything is stocked.",
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
