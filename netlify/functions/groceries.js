import { getStore } from "@netlify/blobs";

const STORE_NAME = "family-menu-groceries";
const GROCERIES_KEY = "items";
const MAX_ITEMS = 500;

const jsonHeaders = {
  "content-type": "application/json",
  "cache-control": "no-store",
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders,
  });
}

function cleanItem(item) {
  const text = `${item.text || ""}`.trim().slice(0, 220);
  if (!text) return null;
  const store = ["any", "publix", "whole-foods", "costco"].includes(item.store) ? item.store : "any";

  return {
    id: `${item.id || `grocery-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`}`,
    text,
    checked: Boolean(item.checked),
    store,
    source: `${item.source || "manual"}`.slice(0, 80),
    recipeName: `${item.recipeName || ""}`.trim().slice(0, 160),
    createdAt: item.createdAt || new Date().toISOString(),
  };
}

function cleanItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map(cleanItem).filter(Boolean).slice(0, MAX_ITEMS);
}

async function readItems(store) {
  return (await store.get(GROCERIES_KEY, { type: "json" })) || [];
}

export default async (request) => {
  const store = getStore(STORE_NAME);

  if (request.method === "GET") {
    return jsonResponse({ items: await readItems(store) });
  }

  if (request.method === "PUT") {
    let payload;
    try {
      payload = await request.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON" }, 400);
    }

    const items = cleanItems(payload.items);
    await store.setJSON(GROCERIES_KEY, items);
    return jsonResponse({ items });
  }

  return jsonResponse({ error: "Method not allowed" }, 405);
};
