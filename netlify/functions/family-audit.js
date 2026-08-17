import { getStore } from "@netlify/blobs";
import { householdDataKey, requireHouseholdAccess } from "./_household.js";
import { jsonResponse } from "./_http.js";
import { normalizeAuditEvents, normalizeStateSnapshots } from "../../audit-logic.js";

const STORE_NAME = "family-menu-audit";
const AUDIT_KEY = "history";
function record(value) {
  return {
    events: normalizeAuditEvents(value?.events),
    snapshots: normalizeStateSnapshots(value?.snapshots),
    version: Number(value?.version) || 0,
    updatedAt: typeof value?.updatedAt === "string" ? value.updatedAt : "",
  };
}

export default async (request) => {
  const access = await requireHouseholdAccess(request);
  if (access.error) return access.error;
  const store = getStore(STORE_NAME);
  const key = householdDataKey(access.household.id, AUDIT_KEY);

  if (request.method === "GET") {
    return jsonResponse(record(await store.get(key, { type: "json" })));
  }

  return jsonResponse({ error: "Method not allowed" }, 405);
};
