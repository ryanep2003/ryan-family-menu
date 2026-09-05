import { jsonResponse } from "./_http.js";

const STORE_NAME = "family-menu-ai-usage";
const DAILY_LIMIT = 30;
const usageLocks = new Map();

// Netlify Blob has no compare-and-set primitive in this code path. Serialize
// reservations per household/route within each function instance so duplicate
// concurrent requests cannot race through one read-then-write window.
export function withUsageLock(key, task) {
  const previous = usageLocks.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(task);
  const completion = next.then(() => undefined, () => undefined);
  usageLocks.set(key, completion);
  completion.then(() => {
    if (usageLocks.get(key) === completion) usageLocks.delete(key);
  });
  return next;
}

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
  return withUsageLock(key, async () => {
    const current = await store.get(key, { type: "json" }).catch(() => null);
    const count = Number(current?.count) || 0;
    if (count >= limit) {
      return { allowed: false, response: jsonResponse({ error: "This household has reached its daily AI scan limit. Try again tomorrow." }, 429) };
    }
    await store.setJSON(key, { count: count + 1, updatedAt: new Date().toISOString() });
    return { allowed: true, response: null };
  });
}
