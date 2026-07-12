import { getStore } from "@netlify/blobs";
import { requireWriteAuth } from "./_auth.js";
import { jsonResponse, readJsonRequest } from "./_http.js";
import { hasVersionConflict, nextVersionedRecord, versionedRecord } from "./_versioned-record.js";
import { cleanLocalizedText, hasLocalizedContent } from "../../localized-data.js";
import { cleanHouseholdMember } from "../../household-attribution.js";

const STORE_NAME = "family-menu-groceries";
const GROCERIES_KEY = "items";
const MAX_ITEMS = 500;
const MAX_REQUEST_BYTES = 250000;

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
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt || item.createdAt || new Date().toISOString(),
    updatedBy: cleanHouseholdMember(item.updatedBy),
  };
}

export function cleanItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map(cleanItem).filter(Boolean).slice(0, MAX_ITEMS);
}

async function readItems(store) {
  const saved = (await store.get(GROCERIES_KEY, { type: "json" })) || [];
  const record = versionedRecord(saved, "items");
  return {
    ...record,
    items: Array.isArray(record.items) ? record.items : [],
  };
}

export default async (request) => {
  const store = getStore(STORE_NAME);

  if (request.method === "GET") {
    return jsonResponse(await readItems(store));
  }

  if (request.method === "PUT") {
    const authError = requireWriteAuth(request);
    if (authError) return authError;

    const { payload, error } = await readJsonRequest(request, { maxBytes: MAX_REQUEST_BYTES });
    if (error) return error;

    const current = await readItems(store);
    if (hasVersionConflict(payload.version, current.version)) {
      return jsonResponse({
        error: "Grocery list changed on another device. Refresh and try again.",
        items: current.items,
        version: current.version,
        updatedAt: current.updatedAt,
      }, 409);
    }

    const record = nextVersionedRecord("items", cleanItems(payload.items), current.version);
    await store.setJSON(GROCERIES_KEY, record);
    return jsonResponse(record);
  }

  return jsonResponse({ error: "Method not allowed" }, 405);
};
