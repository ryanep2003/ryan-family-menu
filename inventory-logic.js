import { cleanIngredientForGrocery } from "./grocery-logic.js";
import { canonicalText, updateLocalizedText } from "./localized-data.js";

export function inventoryItem(text, quantity = "", location = "pantry", photos = [], stockState = "some", lang = "en", updatedBy = "") {
  const timestamp = new Date().toISOString();
  return {
    id: `inventory-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text: typeof text === "string"
      ? updateLocalizedText("", cleanIngredientForGrocery(text), lang)
      : text,
    quantity: typeof quantity === "string"
      ? updateLocalizedText("", cleanIngredientForGrocery(quantity), lang)
      : quantity,
    location,
    photos,
    stockState,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(updatedBy ? { updatedBy } : {}),
  };
}

function inventoryKey(item) {
  return `${(item.location || "pantry").toLowerCase()}::${canonicalText(item.text).trim().toLowerCase()}`;
}

export function mergeInventory(existingItems, newItems) {
  const merged = new Map(existingItems.map((item) => [inventoryKey(item), item]));

  newItems.forEach((item) => {
    const key = inventoryKey(item);
    if (merged.has(key)) {
      const current = merged.get(key);
      merged.set(key, {
        ...current,
        quantity: item.quantity || current.quantity,
        location: item.location || current.location,
        stockState: item.stockState || current.stockState || "some",
        updatedAt: item.updatedAt || new Date().toISOString(),
        updatedBy: item.updatedBy || current.updatedBy,
      });
    } else {
      merged.set(key, item);
    }
  });

  return [...merged.values()];
}
