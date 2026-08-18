import { getStore } from "@netlify/blobs";
import { householdDataKey, requireHouseholdAccess } from "./_household.js";
import { jsonResponse, readJsonRequest } from "./_http.js";
import { hasVersionConflict, nextVersionedRecord, versionedRecord } from "./_versioned-record.js";

const STORE_NAME = "family-menu-ledger";
const MAX_ITEMS = 500;
const KINDS = new Set(["receipts", "activity"]);

function cleanText(value, limit) { return `${value || ""}`.trim().slice(0, limit); }
function cleanReceipt(item) {
  if (!item || typeof item !== "object") return null;
  const total = Math.min(100000, Math.max(0, Math.round(Number(item.total || 0) * 100) / 100));
  const itemCount = Math.min(500, Math.max(0, Math.round(Number(item.itemCount) || 0)));
  const store = cleanText(item.store, 120) || "Store";
  if (!(total > 0) && itemCount < 1 && store === "Store") return null;
  return { id: cleanText(item.id, 160), date: /^\d{4}-\d{2}-\d{2}$/.test(item.date) ? item.date : new Date().toISOString().slice(0, 10), store, subtotal: total ? Math.max(0, Number(item.subtotal) || 0) : 0, tax: Math.max(0, Number(item.tax) || 0), total, totalEstimated: item.totalEstimated === true, itemCount, createdAt: cleanText(item.createdAt, 40), updatedBy: cleanText(item.updatedBy, 80) };
}
function cleanActivity(item) {
  if (!item || typeof item !== "object") return null;
  const id = cleanText(item.id, 160);
  const label = cleanText(item.label, 220);
  const updatedAt = cleanText(item.updatedAt, 40);
  return id && label && !Number.isNaN(new Date(updatedAt).getTime()) ? { id, type: ["meal", "grocery", "inventory", "receipt", "budget", "recipe"].includes(item.type) ? item.type : "meal", label, updatedBy: cleanText(item.updatedBy, 80) || "Family", updatedAt } : null;
}
function cleanItems(kind, items) {
  const cleaner = kind === "receipts" ? cleanReceipt : cleanActivity;
  return (Array.isArray(items) ? items : []).map(cleaner).filter(Boolean).slice(0, MAX_ITEMS);
}
function kindFromRequest(request) { return new URL(request.url).searchParams.get("kind") || ""; }

export default async (request) => {
  const access = await requireHouseholdAccess(request);
  if (access.error) return access.error;
  const kind = kindFromRequest(request);
  if (!KINDS.has(kind)) return jsonResponse({ error: "A valid ledger kind is required." }, 400);
  const store = getStore(STORE_NAME);
  const key = householdDataKey(access.household.id, kind);
  if (request.method === "GET") return jsonResponse(versionedRecord(await store.get(key, { type: "json" }), "items"));
  if (request.method !== "PUT") return jsonResponse({ error: "Method not allowed" }, 405);
  const { payload, error } = await readJsonRequest(request, { maxBytes: 1000000 });
  if (error) return error;
  const current = versionedRecord(await store.get(key, { type: "json" }), "items");
  if (hasVersionConflict(payload.version, current.version)) return jsonResponse({ error: "This ledger changed on another device.", items: current.items, version: current.version }, 409);
  const record = nextVersionedRecord("items", cleanItems(kind, payload.items), current.version);
  await store.setJSON(key, record);
  return jsonResponse(record);
};
