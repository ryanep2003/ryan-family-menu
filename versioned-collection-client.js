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

export function versionedCollectionResponse(data) {
  const version = Number(data?.version);
  if (!data || !Array.isArray(data.items) || !Number.isSafeInteger(version) || version < 0) {
    const error = new Error("Invalid versioned collection response.");
    error.code = "malformed-response";
    throw error;
  }
  return { ...data, items: cloneVersionedItems(data.items), version };
}

export function createVersionedCollectionRetryCoordinator({
  load,
  save,
  cleanup = load,
  hasPending = () => false,
  onBusyChange = () => {},
} = {}) {
  let retryMode = "load";
  let inFlight = null;

  function setFailure(operation) {
    retryMode = ["save", "cleanup"].includes(operation) ? operation : "load";
  }

  function clear() {
    retryMode = "";
  }

  function retry() {
    if (inFlight) return inFlight;
    const operation = retryMode || (hasPending() ? "save" : "load");
    onBusyChange(true, operation);
    inFlight = Promise.resolve()
      .then(() => operation === "save" ? save() : operation === "cleanup" ? cleanup() : load())
      .finally(() => {
        inFlight = null;
        onBusyChange(false, operation);
      });
    return inFlight;
  }

  return {
    retry,
    setFailure,
    clear,
    mode: () => retryMode,
    isBusy: () => Boolean(inFlight),
  };
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
  let volatilePendingIntent = normalizeVersionedIntent(getPendingIntent());
  let localCleanupSnapshot = null;

  function currentPendingIntent() {
    return normalizeVersionedIntent(getPendingIntent()) || volatilePendingIntent;
  }

  function updatePendingIntent(intent) {
    const normalized = normalizeVersionedIntent(intent);
    volatilePendingIntent = normalized;
    try {
      setPendingIntent(normalized);
      return null;
    } catch (error) {
      return error;
    }
  }

  function persistLocalSnapshot({ pendingIntent, items, version }) {
    const pendingError = updatePendingIntent(pendingIntent);
    let cacheError = null;
    try {
      persist(items, version);
    } catch (error) {
      cacheError = error;
    }
    return pendingError || cacheError;
  }

  function persistAcknowledgedSnapshot({ items, version, baseItems, settled }) {
    let pendingError;
    let cleanupPending = false;
    if (settled) {
      // Rebase the durable journal before removing it. If removal is blocked,
      // reopening sees a no-op intent instead of replaying an older edit.
      const acknowledgeError = updatePendingIntent(createVersionedIntent({ items, version, baseItems }));
      const clearError = updatePendingIntent(null);
      cleanupPending = Boolean(acknowledgeError && clearError);
      pendingError = acknowledgeError && clearError ? clearError : null;
    } else {
      pendingError = updatePendingIntent(createVersionedIntent({ items, version, baseItems }));
    }
    let cacheError = null;
    try {
      persist(items, version);
    } catch (error) {
      cacheError = error;
    }
    return {
      storageError: pendingError || cacheError,
      cleanupPending,
    };
  }

  function acknowledgeLocalSnapshot({ items, version, baseItems = items, settled = true }) {
    const persistence = persistAcknowledgedSnapshot({ items, version, baseItems, settled });
    localCleanupSnapshot = persistence.cleanupPending ? {
      items: cloneVersionedItems(items),
      version,
      baseItems: cloneVersionedItems(baseItems),
    } : null;
    return persistence;
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
      pendingIntent: currentPendingIntent(),
    });
    persistLocalSnapshot({
      pendingIntent: pending,
      items: request.intent,
      version: getVersion(),
    });
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
        const settled = request.sequence === sequence && sameValue(currentItems, savedItems);
        const persistence = acknowledgeLocalSnapshot({
          items: currentItems,
          version: savedVersion,
          baseItems: savedItems,
          settled,
        });
        onSaved({ settled, ...persistence });
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
          persistLocalSnapshot({
            pendingIntent: createVersionedIntent({
              items: currentItems,
              version: remoteVersion,
              baseItems: remoteItems,
            }),
            items: currentItems,
            version: remoteVersion,
          });
          if (attempt === 0) {
            outgoing = retryIntent;
            sendBase = remoteItems;
            sendVersion = remoteVersion;
            continue;
          }
        }
        const currentItems = cloneVersionedItems(getItems());
        const pendingIntent = currentPendingIntent() || createVersionedIntent({
          items: currentItems,
          version: getVersion(),
          baseItems: getBaseItems(),
        });
        const storageError = persistLocalSnapshot({
          pendingIntent,
          items: currentItems,
          version: getVersion(),
        });
        onPending(storageError || error);
        return false;
      }
    }
    return false;
  }

  function save() {
    let request;
    try {
      request = capture();
    } catch (error) {
      onPending(error);
      return Promise.resolve(false);
    }
    pendingCount += 1;
    const result = tail.then(() => execute(request), () => execute(request));
    tail = result.then(
      () => { pendingCount -= 1; },
      () => { pendingCount -= 1; },
    );
    return result;
  }

  function retryLocalCleanup() {
    if (!localCleanupSnapshot) return { cleaned: true, storageError: null };
    const persistence = persistAcknowledgedSnapshot({
      ...localCleanupSnapshot,
      settled: true,
    });
    if (!persistence.cleanupPending) localCleanupSnapshot = null;
    return {
      cleaned: !persistence.cleanupPending,
      storageError: persistence.storageError,
    };
  }

  return {
    save,
    acknowledgeLocalSnapshot,
    retryLocalCleanup,
    hasLocalCleanup: () => Boolean(localCleanupSnapshot),
    isBusy: () => pendingCount > 0,
  };
}

export function readVersionedCollectionStorage(storage, { itemsKey, versionKey }) {
  let version = 0;
  try {
    version = readNumberStorage(storage, versionKey, 0);
  } catch {
    // A shared load can still recover when the browser's local cache is blocked.
  }
  return {
    items: readJsonStorage(storage, itemsKey, []),
    version,
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
