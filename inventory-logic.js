import { cleanIngredientForGrocery, parseIngredientAmount } from "./grocery-logic.js";
import { canonicalText, updateLocalizedText } from "./localized-data.js";

function cleanAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.min(10000, Math.max(0, Math.round(amount * 100) / 100)) : 0;
}

function cleanExpiration(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(`${value || ""}`) ? `${value}` : "";
}

export function inventoryExpirationState(item, today = new Date()) {
  if (!item?.expiresOn) return "none";
  const expires = new Date(`${item.expiresOn}T12:00:00`);
  const current = new Date(today);
  current.setHours(12, 0, 0, 0);
  const days = Math.round((expires - current) / 86400000);
  if (days < 0) return "expired";
  if (days <= 3) return "soon";
  return "fresh";
}

export function inventoryItem(text, quantity = "", location = "pantry", photos = [], stockState = "some", lang = "en", updatedBy = "", details = {}) {
  const timestamp = new Date().toISOString();
  const parsedQuantity = typeof quantity === "string" ? parseIngredientAmount(quantity) : { quantity: 0, remainder: "" };
  const amount = cleanAmount(details.amount ?? parsedQuantity.quantity);
  const unit = cleanIngredientForGrocery(details.unit || (parsedQuantity.quantity ? parsedQuantity.remainder : "")).slice(0, 40);
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
    amount,
    unit,
    expiresOn: cleanExpiration(details.expiresOn),
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
        amount: Number.isFinite(Number(item.amount)) ? cleanAmount(item.amount) : current.amount || 0,
        unit: item.unit || current.unit || "",
        expiresOn: cleanExpiration(item.expiresOn) || current.expiresOn || "",
        updatedAt: item.updatedAt || new Date().toISOString(),
        updatedBy: item.updatedBy || current.updatedBy,
      });
    } else {
      merged.set(key, item);
    }
  });

  return [...merged.values()];
}
