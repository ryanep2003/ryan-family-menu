import { getStore } from "@netlify/blobs";
import { householdDataKey, requireHouseholdAccess } from "./_household.js";
import { jsonResponse, readJsonRequest } from "./_http.js";
import { hasVersionConflict, nextVersionedRecord, versionedRecord } from "./_versioned-record.js";
import { cleanItem, cleanItems } from "./groceries.js";
import { cleanHouseholdMember } from "../../household-attribution.js";

const STORE_NAME = "family-menu-grocery-lists";
const LISTS_KEY = "lists";
const MAX_LISTS = 100;
const MAX_ITEMS_PER_LIST = 300;
const MAX_TOTAL_ITEMS = 3000;
const MAX_REQUEST_BYTES = 400000;
const SCOPES = ["day", "two-days", "recipe", "lunch", "snapshot"];
const RANGES = ["week", "next3", "nextWeek", "next14", "month"];
const MEAL_SLOTS = ["breakfast", "lunch", "dinner"];

function boundedText(value, max) {
  return `${value || ""}`.trim().slice(0, max);
}

function dateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(`${value || ""}`) ? `${value}` : "";
}

export function cleanList(list) {
  if (!list || typeof list !== "object") return null;
  const scope = SCOPES.includes(list.scope) ? list.scope : "snapshot";
  const dateKeys = Array.isArray(list.dateKeys) ? list.dateKeys.map(dateKey).filter(Boolean).slice(0, 14) : [];
  return {
    id: boundedText(list.id || `shopping-list-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, 180),
    name: boundedText(list.name, 120) || "Saved shopping list",
    scope,
    ...(RANGES.includes(list.range) ? { range: list.range } : {}),
    ...(dateKey(list.dateKey) ? { dateKey: dateKey(list.dateKey) } : {}),
    ...(dateKeys.length ? { dateKeys } : {}),
    ...(boundedText(list.recipeId, 160) ? { recipeId: boundedText(list.recipeId, 160) } : {}),
    ...(boundedText(list.memberId, 160) ? { memberId: boundedText(list.memberId, 160) } : {}),
    ...(MEAL_SLOTS.includes(list.mealSlot) ? { mealSlot: list.mealSlot } : {}),
    items: cleanItems(Array.isArray(list.items) ? list.items : []).slice(0, MAX_ITEMS_PER_LIST),
    createdAt: list.createdAt || new Date().toISOString(),
    updatedAt: list.updatedAt || list.createdAt || new Date().toISOString(),
    updatedBy: cleanHouseholdMember(list.updatedBy),
  };
}

export function cleanLists(lists) {
  if (!Array.isArray(lists)) return [];
  const seen = new Set();
  const cleaned = lists
    .map(cleanList)
    .filter((list) => list && !seen.has(list.id) && seen.add(list.id))
    .slice(0, MAX_LISTS);
  let remaining = MAX_TOTAL_ITEMS;
  return cleaned.map((list) => {
    const items = list.items.slice(0, remaining);
    remaining -= items.length;
    return { ...list, items };
  });
}

async function readLists(store, key) {
  const saved = (await store.get(key, { type: "json" })) || [];
  const record = versionedRecord(saved, "items");
  return { ...record, items: cleanLists(record.items) };
}

export default async (request) => {
  const store = getStore(STORE_NAME);
  const access = await requireHouseholdAccess(request);
  if (access.error) return access.error;
  const listsKey = householdDataKey(access.household.id, LISTS_KEY);

  if (request.method === "GET") return jsonResponse(await readLists(store, listsKey));

  if (request.method === "PUT") {
    const { payload, error } = await readJsonRequest(request, { maxBytes: MAX_REQUEST_BYTES });
    if (error) return error;
    const current = await readLists(store, listsKey);
    if (hasVersionConflict(payload.version, current.version)) {
      return jsonResponse({
        error: "Saved shopping lists changed on another device. Refresh and try again.",
        items: current.items,
        version: current.version,
        updatedAt: current.updatedAt,
      }, 409);
    }
    const record = nextVersionedRecord("items", cleanLists(payload.items), current.version);
    await store.setJSON(listsKey, record);
    return jsonResponse(record);
  }

  return jsonResponse({ error: "Method not allowed" }, 405);
};
