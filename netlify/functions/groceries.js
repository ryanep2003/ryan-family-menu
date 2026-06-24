import { getStore } from "@netlify/blobs";
import { requireWriteAuth } from "./_auth.js";
import { jsonResponse } from "./_http.js";
import { hasVersionConflict, nextVersionedRecord, versionedRecord } from "./_versioned-record.js";

const STORE_NAME = "family-menu-groceries";
const GROCERIES_KEY = "items";
const MAX_ITEMS = 500;

function cleanItem(item) {
  const text = `${item.text || ""}`.trim().slice(0, 220);
  if (!text) return null;
  const store = ["any", "publix", "whole-foods", "costco"].includes(item.store) ? item.store : "any";

  return {
    id: `${item.id || `grocery-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`}`,
    text,
    checked: Boolean(item.checked),
    store,
    source: `${item.source || "manual"}`.slice(0, 80),
    recipeId: `${item.recipeId || ""}`.trim().slice(0, 160),
    recipeName: `${item.recipeName || ""}`.trim().slice(0, 160),
    inInventory: Boolean(item.inInventory),
    createdAt: item.createdAt || new Date().toISOString(),
  };
}

function cleanItems(items) {
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

    let payload;
    try {
      payload = await request.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON" }, 400);
    }

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
