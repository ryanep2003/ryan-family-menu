import { getStore } from "@netlify/blobs";
import { householdDataKey, requireHouseholdAccess } from "./_household.js";
import { jsonResponse, readJsonRequest } from "./_http.js";
import { hasVersionConflict, nextVersionedRecord, versionedRecord } from "./_versioned-record.js";
import { cleanLocalizedText, hasLocalizedContent } from "../../localized-data.js";
import { cleanHouseholdMember } from "../../household-attribution.js";

const STORE_NAME = "family-menu-groceries";
const GROCERIES_KEY = "items";
const MAX_ITEMS = 500;
const MAX_REQUEST_BYTES = 250000;
const MEAL_SLOTS = ["breakfast", "lunch", "dinner"];

export function cleanItem(item) {
  const text = cleanLocalizedText(item.text, 220);
  if (!hasLocalizedContent(text)) return null;
  const store = ["any", "publix", "whole-foods", "costco"].includes(item.store) ? item.store : "any";

  return {
    id: `${item.id || `grocery-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`}`,
    text,
    checked: Boolean(item.checked),
    store,
    source: `${item.source || "manual"}`.slice(0, 80),
    recipeId: `${item.recipeId || ""}`.trim().slice(0, 160),
    recipeName: cleanLocalizedText(item.recipeName, 160),
    inInventory: Boolean(item.inInventory),
    inventorySuggested: Boolean(item.inventorySuggested),
    inventoryDecision: ["review", "need", "have"].includes(item.inventoryDecision)
      ? item.inventoryDecision
      : "",
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt || item.createdAt || new Date().toISOString(),
    updatedBy: cleanHouseholdMember(item.updatedBy),
    ingredientKey: `${item.ingredientKey || ""}`.replace(/[^a-z0-9-]/gi, "").slice(0, 220),
    plannedQuantities: Object.fromEntries(["en", "es"].map((lang) => [
      lang,
      Math.min(10000, Math.max(0, Number(item.plannedQuantities?.[lang]) || 0)),
    ]).filter(([, amount]) => amount > 0)),
    ingredientRemainders: cleanLocalizedText(item.ingredientRemainders, 180),
    plannedUnits: Object.fromEntries(["en", "es"].map((lang) => [
      lang,
      `${item.plannedUnits?.[lang] || ""}`.trim().slice(0, 20),
    ]).filter(([, unit]) => unit)),
    remainingQuantities: Object.fromEntries(["en", "es"].map((lang) => [
      lang,
      Math.min(10000, Math.max(0, Number(item.remainingQuantities?.[lang]) || 0)),
    ]).filter(([, amount]) => amount > 0)),
    mealUses: Array.isArray(item.mealUses)
      ? item.mealUses.map((use) => ({
        dateKey: /^\d{4}-\d{2}-\d{2}$/.test(use?.dateKey) ? use.dateKey : "",
        mealSlot: MEAL_SLOTS.includes(use?.mealSlot) ? use.mealSlot : "",
        recipeId: `${use?.recipeId || ""}`.trim().slice(0, 160),
        recipeName: cleanLocalizedText(use?.recipeName, 160),
        ...(Number(use?.batches) > 0 ? { batches: Math.min(100, Number(use.batches)) } : {}),
        ...(Number(use?.servings) > 0 ? { servings: Math.min(100, Number(use.servings)) } : {}),
      })).filter((use) => use.dateKey && use.mealSlot && (use.recipeId || hasLocalizedContent(use.recipeName))).slice(0, 12)
      : [],
  };
}

export function cleanItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map(cleanItem).filter(Boolean).slice(0, MAX_ITEMS);
}

async function readItems(store, key) {
  const saved = (await store.get(key, { type: "json" })) || [];
  const record = versionedRecord(saved, "items");
  return {
    ...record,
    items: Array.isArray(record.items) ? record.items : [],
  };
}

export default async (request) => {
  const store = getStore(STORE_NAME);
  const access = await requireHouseholdAccess(request);
  if (access.error) return access.error;
  const groceriesKey = householdDataKey(access.household.id, GROCERIES_KEY);

  if (request.method === "GET") {
    return jsonResponse(await readItems(store, groceriesKey));
  }

  if (request.method === "PUT") {
    const { payload, error } = await readJsonRequest(request, { maxBytes: MAX_REQUEST_BYTES });
    if (error) return error;

    const current = await readItems(store, groceriesKey);
    if (hasVersionConflict(payload.version, current.version)) {
      return jsonResponse({
        error: "Grocery list changed on another device. Refresh and try again.",
        items: current.items,
        version: current.version,
        updatedAt: current.updatedAt,
      }, 409);
    }

    const record = nextVersionedRecord("items", cleanItems(payload.items), current.version);
    await store.setJSON(groceriesKey, record);
    return jsonResponse(record);
  }

  return jsonResponse({ error: "Method not allowed" }, 405);
};
