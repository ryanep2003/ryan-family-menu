import { getStore } from "@netlify/blobs";
import {
  cleanHouseholdName,
  createHouseholdProfile,
  householdAccessKey,
  householdDataKey,
  requireHouseholdAccess,
  updateHouseholdProfile,
} from "./_household.js";
import { jsonResponse, readJsonRequest } from "./_http.js";

const MAX_REQUEST_BYTES = 4000;

function requireCreationCode(request) {
  const expected = process.env.HOUSEHOLD_CREATION_CODE || "";
  if (!expected) {
    return jsonResponse({ error: "New household setup is not enabled yet." }, 503);
  }
  if (request.headers.get("x-household-creation-code") === expected) return null;
  return jsonResponse({ error: "The new-family invite code is not valid." }, 401);
}

function requireLegacyMigrationCode(value) {
  const expected = process.env.LEGACY_MIGRATION_CODE || "";
  if (expected && value === expected) return null;
  return jsonResponse({ error: "Legacy migration is not authorized." }, 401);
}

async function copyLegacyRecord(storeName, legacyKey, householdId, nextKey = legacyKey) {
  const store = getStore(storeName);
  const saved = await store.get(legacyKey, { type: "json" }).catch(() => null);
  if (saved !== null && saved !== undefined) {
    await store.setJSON(householdDataKey(householdId, nextKey), saved);
  }
}

async function migrateLegacyData(householdId) {
  await Promise.all([
    copyLegacyRecord("family-menu-state", "shared-state", householdId),
    copyLegacyRecord("family-menu-groceries", "items", householdId),
    copyLegacyRecord("family-menu-inventory", "items", householdId),
    copyLegacyRecord("family-menu-recipes", "recipes", householdId),
    copyLegacyRecord("family-menu-recipes", "recipe-index", householdId),
  ]);

  const recipeStore = getStore("family-menu-recipes");
  const index = await recipeStore.get("recipe-index", { type: "json" }).catch(() => []);
  await Promise.all((Array.isArray(index) ? index : []).map(async (entry) => {
    if (!entry?.id) return;
    const recipe = await recipeStore.get(`recipe:${entry.id}`, { type: "json" }).catch(() => null);
    if (recipe) await recipeStore.setJSON(householdDataKey(householdId, `recipe:${entry.id}`), recipe);
  }));
}

export default async (request) => {
  if (request.method === "GET") {
    const access = await requireHouseholdAccess(request);
    if (access.error) return access.error;
    return jsonResponse({ household: access.household });
  }

  if (request.method === "POST") {
    const creationError = requireCreationCode(request);
    if (creationError) return creationError;
    const { payload, error } = await readJsonRequest(request, { maxBytes: MAX_REQUEST_BYTES });
    if (error) return error;
    const name = cleanHouseholdName(payload.name);
    if (!name) return jsonResponse({ error: "Household name is required." }, 400);

    if (payload.migrateLegacy) {
      const legacyError = requireLegacyMigrationCode(payload.legacyMigrationCode);
      if (legacyError) return legacyError;
    }

    const created = await createHouseholdProfile(name);
    if (payload.migrateLegacy) await migrateLegacyData(created.profile.id);
    return jsonResponse({ household: created.profile, key: created.key }, 201);
  }

  if (request.method === "PUT") {
    const access = await requireHouseholdAccess(request);
    if (access.error) return access.error;
    const { payload, error } = await readJsonRequest(request, { maxBytes: MAX_REQUEST_BYTES });
    if (error) return error;
    const name = cleanHouseholdName(payload.name);
    if (!name) return jsonResponse({ error: "Household name is required." }, 400);
    const household = await updateHouseholdProfile(householdAccessKey(request), { ...access.household, name });
    return jsonResponse({ household });
  }

  return jsonResponse({ error: "Method not allowed" }, 405);
};
