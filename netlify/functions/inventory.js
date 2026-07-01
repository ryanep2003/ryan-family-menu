import { getStore } from "@netlify/blobs";
import { requireWriteAuth } from "./_auth.js";
import { jsonResponse, readJsonRequest } from "./_http.js";
import { hasVersionConflict, nextVersionedRecord, versionedRecord } from "./_versioned-record.js";
import { cleanLocalizedText, hasLocalizedContent } from "../../localized-data.js";

const STORE_NAME = "family-menu-inventory";
const INVENTORY_KEY = "items";
const MAX_ITEMS = 500;
const MAX_PHOTO_BYTES = 500000;
const MAX_REQUEST_BYTES = 1000000;

function cleanPhoto(value) {
  const photo = `${value || ""}`.trim();
  if (photo.startsWith("data:image/") && photo.length * 0.75 <= MAX_PHOTO_BYTES) return photo;
  return "";
}

export function cleanItem(item) {
  const text = cleanLocalizedText(item.text, 220);
  if (!hasLocalizedContent(text)) return null;
  const location = ["pantry", "fridge", "freezer", "household"].includes(item.location)
    ? item.location
    : "pantry";
  const stockState = ["full", "some", "low", "out"].includes(item.stockState)
    ? item.stockState
    : "some";

  return {
    id: `${item.id || `inventory-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`}`,
    text,
    quantity: cleanLocalizedText(item.quantity, 80),
    location,
    stockState,
    photos: Array.isArray(item.photos)
      ? item.photos.map(cleanPhoto).filter(Boolean).slice(0, 1)
      : [],
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt || item.createdAt || new Date().toISOString(),
  };
}

export function cleanItems(items) {
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

    const { payload, error } = await readJsonRequest(request, { maxBytes: MAX_REQUEST_BYTES });
    if (error) return error;

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
