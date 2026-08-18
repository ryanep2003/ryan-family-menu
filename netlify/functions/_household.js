import { createHash, randomBytes, randomUUID } from "node:crypto";
import { jsonResponse } from "./_http.js";

const STORE_NAME = "family-menu-households";
const PROFILE_PREFIX = "access:";
const HOUSEHOLD_KEY_PATTERN = /^fm_[A-Za-z0-9_-]{32}$/;

async function householdStore() {
  const { getStore } = await import("@netlify/blobs");
  return getStore(STORE_NAME);
}

export function cleanHouseholdName(value) {
  return `${value || ""}`.trim().replace(/\s+/g, " ").slice(0, 80);
}

export function createHouseholdKey() {
  return `fm_${randomBytes(24).toString("base64url")}`;
}

export function householdKeyDigest(key) {
  return createHash("sha256").update(key).digest("hex");
}

export function householdDataKey(householdId, key) {
  return `household:${householdId}:${key}`;
}

export function householdAccessKey(request) {
  return `${request.headers.get("x-household-key") || ""}`.trim();
}

export async function householdForRequest(request) {
  const key = householdAccessKey(request);
  if (!HOUSEHOLD_KEY_PATTERN.test(key)) return null;
  const store = await householdStore();
  const profile = await store.get(`${PROFILE_PREFIX}${householdKeyDigest(key)}`, { type: "json" });
  if (!profile?.id || !profile?.name) return null;
  return profile;
}

export async function requireHouseholdAccess(request) {
  const household = await householdForRequest(request);
  if (household) return { household, error: null };
  return {
    household: null,
    error: jsonResponse({ error: "A valid household key is required." }, 401),
  };
}

export async function createHouseholdProfile(name) {
  const key = createHouseholdKey();
  const now = new Date().toISOString();
  const profile = {
    id: randomUUID(),
    name: cleanHouseholdName(name),
    createdAt: now,
    updatedAt: now,
  };
  const store = await householdStore();
  await store.setJSON(`${PROFILE_PREFIX}${householdKeyDigest(key)}`, profile);
  return { key, profile };
}

export async function updateHouseholdProfile(key, profile) {
  const next = { ...profile, updatedAt: new Date().toISOString() };
  const store = await householdStore();
  await store.setJSON(`${PROFILE_PREFIX}${householdKeyDigest(key)}`, next);
  return next;
}

export async function rotateHouseholdKey(currentKey, profile) {
  const nextKey = createHouseholdKey();
  const store = await householdStore();
  const next = { ...profile, updatedAt: new Date().toISOString() };
  await store.setJSON(`${PROFILE_PREFIX}${householdKeyDigest(nextKey)}`, next);
  await store.delete(`${PROFILE_PREFIX}${householdKeyDigest(currentKey)}`);
  return { key: nextKey, profile: next };
}
