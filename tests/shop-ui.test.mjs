import assert from "node:assert/strict";
import test from "node:test";

import { polishSavedListActions, shopExperienceCopy } from "../shop-ui.js";

test("Shop experience copy keeps the primary flow explicit in English and Spanish", () => {
  const en = shopExperienceCopy("en");
  const es = shopExperienceCopy("es");

  assert.equal(en.shoppingNow, "Shopping now");
  assert.equal(en.checkout, "Checkout");
  assert.equal(en.spendingHistory, "Spending & history");
  assert.equal(en.useSavedList, "Add to shopping list");
  assert.equal(es.shoppingNow, "Comprando ahora");
  assert.equal(es.checkout, "Terminar compra");
  assert.equal(es.spendingHistory, "Gastos e historial");
  assert.equal(es.useSavedList, "Agregar a la lista de compras");
});

test("saved list actions use plain-language shopping verbs", () => {
  const runButton = { textContent: "Run this list" };
  const deleteButton = { textContent: "Delete" };
  const root = {
    querySelectorAll(selector) {
      if (selector === "[data-run-shopping-list]") return [runButton];
      if (selector === "[data-delete-shopping-list]") return [deleteButton];
      return [];
    },
  };

  assert.equal(polishSavedListActions(root, shopExperienceCopy("en")), 2);
  assert.equal(runButton.textContent, "Add to shopping list");
  assert.equal(deleteButton.textContent, "Delete saved list");
});
