import { jsonResponse } from "./_http.js";

const STORE_NAME = "family-menu-ai-usage";
const DAILY_LIMIT = 30;

export async function checkAiUsage(householdId, route, limit = DAILY_LIMIT) {
  const day = new Date().toISOString().slice(0, 10);
  const key = `usage:${householdId}:${day}:${route}`;
  let getStore;
  try {
    ({ getStore } = await import("@netlify/blobs"));
  } catch {
    // Local unit tests do not install Netlify's runtime package. Production
    // functions always provide it, so keep local endpoint tests deterministic.
    return { allowed: true, response: null };
  }
  const store = getStore(STORE_NAME);
  const current = await store.get(key, { type: "json" }).catch(() => null);
  const count = Number(current?.count) || 0;
  if (count >= limit) {
    return { allowed: false, response: jsonResponse({ error: "This household has reached its daily AI scan limit. Try again tomorrow." }, 429) };
  }
  await store.setJSON(key, { count: count + 1, updatedAt: new Date().toISOString() });
  return { allowed: true, response: null };
}
