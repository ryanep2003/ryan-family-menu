import { getStore } from "@netlify/blobs";
import { householdDataKey, requireHouseholdAccess } from "./_household.js";
import { jsonResponse, readJsonRequest } from "./_http.js";
import { hasVersionConflict, nextVersionedRecord, versionedRecord } from "./_versioned-record.js";
import { normalizeDinnerEvents } from "../../memory-logic.js";

const STORE_NAME = "family-menu-dinner-history";
const HISTORY_KEY = "events";
const MAX_REQUEST_BYTES = 750000;

function historyRecord(saved) {
  const record = versionedRecord(saved, "items");
  return { ...record, items: normalizeDinnerEvents(record.items) };
}

export default async (request) => {
  const access = await requireHouseholdAccess(request);
  if (access.error) return access.error;
  const store = getStore(STORE_NAME);
  const key = householdDataKey(access.household.id, HISTORY_KEY);

  if (request.method === "GET") {
    return jsonResponse(historyRecord(await store.get(key, { type: "json" })));
  }

  if (request.method === "PUT") {
    const { payload, error } = await readJsonRequest(request, { maxBytes: MAX_REQUEST_BYTES });
    if (error) return error;
    const current = historyRecord(await store.get(key, { type: "json" }));
    if (hasVersionConflict(payload.version, current.version)) {
      return jsonResponse({
        error: "Dinner history changed on another device. The newest copy has been loaded.",
        items: current.items,
        version: current.version,
        updatedAt: current.updatedAt,
      }, 409);
    }
    const record = nextVersionedRecord("items", normalizeDinnerEvents(payload.items), current.version);
    await store.setJSON(key, record);
    return jsonResponse(record);
  }

  return jsonResponse({ error: "Method not allowed" }, 405);
};
