import { readJsonStorage, readNumberStorage } from "./storage-utils.js";

export function readVersionedCollectionStorage(storage, { itemsKey, versionKey }) {
  return {
    items: readJsonStorage(storage, itemsKey, []),
    version: readNumberStorage(storage, versionKey, 0),
  };
}

export function persistVersionedCollection(storage, { itemsKey, versionKey }, items, version) {
  storage.setItem(itemsKey, JSON.stringify(Array.isArray(items) ? items : []));
  storage.setItem(versionKey, `${Number(version) || 0}`);
}

export async function loadVersionedCollection({
  getJson,
  url,
  fallbackMessage,
  setItems,
  setVersion,
  persist,
  render,
}) {
  const data = await getJson(url, fallbackMessage);
  const items = Array.isArray(data.items) ? data.items : [];
  const version = Number(data.version) || 0;
  setItems(items);
  setVersion(version);
  persist?.(items, version);
  render();
}

export async function saveVersionedCollection({
  putJson,
  url,
  fallbackMessage,
  items,
  version,
  setItems,
  setVersion,
  persist,
}) {
  persist?.(items, version);
  const data = await putJson(url, { items, version }, fallbackMessage);
  const nextItems = Array.isArray(data.items) ? data.items : items;
  const nextVersion = Number(data.version) || version;
  setItems(nextItems);
  setVersion(nextVersion);
  persist?.(nextItems, nextVersion);
  return { saved: true, conflict: false };
}

export function applyVersionConflict(error, { setItems, setVersion, currentVersion, persist }) {
  if (error.status !== 409 || !Array.isArray(error.data?.items)) return false;
  const items = error.data.items;
  const version = Number(error.data.version) || currentVersion;
  setItems(items);
  setVersion(version);
  persist?.(items, version);
  return true;
}
