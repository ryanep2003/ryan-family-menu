import { readJsonStorage, readNumberStorage } from "./storage-utils.js";

// Persisted household data is JSON-shaped. Keep conflict baselines detached
// from live UI objects so in-place UI edits cannot rewrite the baseline.
export function cloneVersionedValue(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export function cloneVersionedItems(items) {
  return cloneVersionedValue(Array.isArray(items) ? items : []);
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function mergeVersionedItems(localItems, baseItems, remoteItems) {
  const local = new Map((Array.isArray(localItems) ? localItems : []).map((item) => [item?.id, item]));
  const base = new Map((Array.isArray(baseItems) ? baseItems : []).map((item) => [item?.id, item]));
  const remote = new Map((Array.isArray(remoteItems) ? remoteItems : []).map((item) => [item?.id, item]));
  const ids = new Set([...base.keys(), ...local.keys(), ...remote.keys()]);
  const merged = [];
  ids.forEach((id) => {
    if (!id) return;
    const localValue = local.get(id);
    const baseValue = base.get(id);
    const remoteValue = remote.get(id);
    const localChanged = !sameValue(localValue, baseValue);
    if (localChanged ? localValue : remoteValue) merged.push(localChanged ? localValue : remoteValue);
  });
  return merged;
}

export function applyLoadedVersionedCollection({
  remoteItems,
  remoteVersion,
  localItems,
  localVersion,
  baseItems,
  saveInFlight = false,
} = {}) {
  if (saveInFlight) return { apply: false, reason: "save-in-flight" };
  const remoteVer = Number(remoteVersion) || 0;
  const localVer = Number(localVersion) || 0;
  if (remoteVer < localVer) return { apply: false, reason: "stale-remote" };

  const remote = Array.isArray(remoteItems) ? remoteItems : [];
  const local = Array.isArray(localItems) ? localItems : [];
  const base = Array.isArray(baseItems) ? baseItems : [];
  if (sameValue(local, remote)) {
    return { apply: true, items: remote, version: remoteVer, shouldSave: false };
  }

  // A persist-before-PUT snapshot keeps the old version, so a reload looks like
  // local === base even though checked state has not reached the server yet.
  if (remoteVer === localVer) {
    return { apply: true, items: local, version: remoteVer, shouldSave: true };
  }

  if (sameValue(local, base)) {
    return { apply: true, items: remote, version: remoteVer, shouldSave: false };
  }

  const merged = mergeVersionedItems(local, base, remote);
  return {
    apply: true,
    items: merged,
    version: remoteVer,
    shouldSave: !sameValue(merged, remote),
  };
}

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
  const data = await putJson(url, { items: cloneVersionedItems(items), version }, fallbackMessage);
  const nextItems = Array.isArray(data.items) ? data.items : items;
  const nextVersion = Number(data.version) || version;
  setItems(nextItems);
  setVersion(nextVersion);
  persist?.(nextItems, nextVersion);
  return { saved: true, conflict: false, items: nextItems, version: nextVersion };
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
