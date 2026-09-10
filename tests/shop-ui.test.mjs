import assert from "node:assert/strict";
import test from "node:test";

import { shopExperienceCopy } from "../shop-ui.js";

test("Shop experience copy keeps the primary flow explicit in English and Spanish", () => {
  const en = shopExperienceCopy("en");
  const es = shopExperienceCopy("es");

  assert.equal(en.shoppingNow, "Shopping now");
  assert.equal(en.checkout, "Checkout");
  assert.equal(en.spendingHistory, "Spending & history");
  assert.equal(es.shoppingNow, "Comprando ahora");
  assert.equal(es.checkout, "Terminar compra");
  assert.equal(es.spendingHistory, "Gastos e historial");
});
