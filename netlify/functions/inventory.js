import { getStore } from "@netlify/blobs";
import { requireWriteAuth } from "./_auth.js";
import { jsonResponse } from "./_http.js";
import { hasVersionConflict, nextVersionedRecord, versionedRecord } from "./_versioned-record.js";

const STORE_NAME = "family-menu-inventory";
const INVENTORY_KEY = "items";
const MAX_ITEMS = 500;
const MAX_PHOTO_BYTES = 500000;

function cleanPhoto(value) {
  const photo = `${value || ""}`.trim();
  if (photo.startsWith("data:image/") && photo.length * 0.75 <= MAX_PHOTO_BYTES) return photo;
  return "";
}

function cleanItem(item) {
  const text = `${item.text || ""}`.trim().slice(0, 220);
  if (!text) return null;
  const location = ["pantry", "fridge", "freezer", "household"].includes(item.location)
    ? item.location
    : "pantry";
  const stockState = ["full", "some", "low", "out"].includes(item.stockState)
    ? item.stockState
    : "some";

  return {
    id: `${item.id || `inventory-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`}`,
    text,
    quantity: `${item.quantity || ""}`.trim().slice(0, 80),
    location,
    stockState,
    photos: Array.isArray(item.photos)
      ? item.photos.map(cleanPhoto).filter(Boolean).slice(0, 1)
      : [],
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt || item.createdAt || new Date().toISOString(),
  };
}

function cleanItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map(cleanItem).filter(Boolean).slice(0, MAX_ITEMS);
}

async function readItems(store) {
  const saved = (await store.get(INVENTORY_KEY, { type: "json" })) || [];
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
        error: "Inventory changed on another device. Refresh and try again.",
        items: current.items,
        version: current.version,
        updatedAt: current.updatedAt,
      }, 409);
    }

    const record = nextVersionedRecord("items", cleanItems(payload.items), current.version);
    await store.setJSON(INVENTORY_KEY, record);
    return jsonResponse(record);
  }

  return jsonResponse({ error: "Method not allowed" }, 405);
};
