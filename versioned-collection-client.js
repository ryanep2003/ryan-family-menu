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

function boundedVersion(value) {
  const version = Number(value);
  return Number.isSafeInteger(version) && version > 0 ? version : 0;
}

export function normalizeVersionedIntent(value, { maxItems = 500 } = {}) {
  if (!value || value.schemaVersion !== 1 || !Array.isArray(value.baseItems) || !Array.isArray(value.items)) return null;
  return {
    schemaVersion: 1,
    baseItems: cloneVersionedItems(value.baseItems).slice(0, maxItems),
    baseVersion: boundedVersion(value.baseVersion),
    items: cloneVersionedItems(value.items).slice(0, maxItems),
  };
}

export function createVersionedIntent({ items, version, baseItems, pendingIntent } = {}) {
  const pending = normalizeVersionedIntent(pendingIntent);
  return {
    schemaVersion: 1,
    baseItems: cloneVersionedItems(pending?.baseItems || baseItems).slice(0, 500),
    baseVersion: pending?.baseVersion ?? boundedVersion(version),
    items: cloneVersionedItems(items).slice(0, 500),
  };
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

export function reconcileLoadedVersionedCollection({ pendingIntent, ...options } = {}) {
  const pending = normalizeVersionedIntent(pendingIntent);
  if (!pending) return applyLoadedVersionedCollection(options);
  if (options.saveInFlight) return { apply: false, reason: "save-in-flight" };

  const remoteVersion = boundedVersion(options.remoteVersion);
  if (remoteVersion < pending.baseVersion) return { apply: false, reason: "stale-remote" };

  const remoteItems = cloneVersionedItems(options.remoteItems);
  const items = mergeVersionedItems(pending.items, pending.baseItems, remoteItems);
  const shouldSave = !sameValue(items, remoteItems);
  return {
    apply: true,
    items,
    version: remoteVersion,
    baseItems: remoteItems,
    shouldSave,
    clearPending: !shouldSave,
    pendingIntent: shouldSave ? {
      schemaVersion: 1,
      baseItems: remoteItems,
      baseVersion: remoteVersion,
      items: cloneVersionedItems(items),
    } : null,
  };
}

export function createVersionedCollectionSaveCoordinator({
  getItems,
  setItems,
  getVersion,
  setVersion,
  getBaseItems,
  setBaseItems,
  getPendingIntent,
  setPendingIntent,
  persist,
  put,
  invalidateLoads = () => {},
  onSaving = () => {},
  onSaved = () => {},
  onPending = () => {},
} = {}) {
  let tail = Promise.resolve();
  let pendingCount = 0;
  let sequence = 0;

  function storePending(baseItems, baseVersion, items) {
    const pending = {
      schemaVersion: 1,
      baseItems: cloneVersionedItems(baseItems),
      baseVersion: boundedVersion(baseVersion),
      items: cloneVersionedItems(items).slice(0, 500),
    };
    setPendingIntent(pending);
    return pending;
  }

  function capture() {
    const request = {
      sequence: ++sequence,
      intent: cloneVersionedItems(getItems()),
      captureBase: cloneVersionedItems(getBaseItems()),
    };
    const pending = createVersionedIntent({
      items: request.intent,
      version: getVersion(),
      baseItems: request.captureBase,
      pendingIntent: getPendingIntent(),
    });
    setPendingIntent(pending);
    persist(request.intent, getVersion());
    invalidateLoads();
    return request;
  }

  async function execute(request) {
    onSaving();
    let sendBase = cloneVersionedItems(getBaseItems());
    let sendVersion = getVersion();
    let outgoing = mergeVersionedItems(request.intent, request.captureBase, sendBase);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const data = await put(cloneVersionedItems(outgoing), sendVersion);
        const savedItems = cloneVersionedItems(Array.isArray(data?.items) ? data.items : outgoing);
        const savedVersion = boundedVersion(data?.version) || boundedVersion(sendVersion);
        const currentItems = mergeVersionedItems(getItems(), outgoing, savedItems);
        setItems(currentItems);
        setVersion(savedVersion);
        setBaseItems(savedItems);
        persist(currentItems, savedVersion);
        const settled = request.sequence === sequence && sameValue(currentItems, savedItems);
        if (settled) setPendingIntent(null);
        else storePending(savedItems, savedVersion, currentItems);
        onSaved({ settled });
        return true;
      } catch (error) {
        if (error?.status === 409 && Array.isArray(error.data?.items)) {
          const remoteItems = cloneVersionedItems(error.data.items);
          const remoteVersion = boundedVersion(error.data.version) || boundedVersion(sendVersion);
          const retryIntent = mergeVersionedItems(outgoing, sendBase, remoteItems);
          const currentItems = mergeVersionedItems(getItems(), outgoing, retryIntent);
          setItems(currentItems);
          setVersion(remoteVersion);
          setBaseItems(remoteItems);
          persist(currentItems, remoteVersion);
          storePending(remoteItems, remoteVersion, currentItems);
          if (attempt === 0) {
            outgoing = retryIntent;
            sendBase = remoteItems;
            sendVersion = remoteVersion;
            continue;
          }
        }
        const currentItems = cloneVersionedItems(getItems());
        persist(currentItems, getVersion());
        const pending = normalizeVersionedIntent(getPendingIntent());
        if (!pending) storePending(getBaseItems(), getVersion(), currentItems);
        onPending(error);
        return false;
      }
    }
    return false;
  }

  function save() {
    const request = capture();
    pendingCount += 1;
    const result = tail.then(() => execute(request), () => execute(request));
    tail = result.then(
      () => { pendingCount -= 1; },
      () => { pendingCount -= 1; },
    );
    return result;
  }

  return {
    save,
    isBusy: () => pendingCount > 0,
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
