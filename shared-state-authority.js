// Shared state still carries legacy copies of collections that now have their
// own authoritative records. Keep whichever domain record has already loaded.
export function sharedStateWithAuthoritativeDomains(current, incoming, { schedule = false, receipts = false, activity = false } = {}) {
  const next = { ...incoming };
  if (schedule) {
    next.schedule = current.schedule;
    next.calendarMeals = current.calendarMeals;
    next.weekStartKey = current.weekStartKey;
  }
  if (receipts) next.receipts = current.receipts;
  if (activity) next.activity = current.activity;
  return next;
}

// A version-zero empty collection is an uninitialized legacy endpoint, not an
// authoritative deletion. A positive version intentionally preserves empty.
export function collectionLoadState({ items = [], version = 0, localItems = [] } = {}) {
  const normalizedItems = Array.isArray(items) ? items : [];
  const normalizedLocalItems = Array.isArray(localItems) ? localItems : [];
  const initialized = Number(version) > 0 || normalizedItems.length > 0;
  return {
    items: initialized ? normalizedItems : normalizedLocalItems,
    initialized,
  };
}

// Reconcile a legacy collection after the shared record has had a chance to
// load. The callbacks keep this helper usable for receipts and activity while
// preserving the real loader's async ordering and save path.
export async function reconcileUninitializedLedger({
  items = [],
  version = 0,
  localItems = [],
  sharedReady = () => false,
  waitForShared = async () => {},
  getCurrentItems = () => [],
  setCurrentItems = () => {},
  setVersion = () => {},
  setDirty = () => {},
  isAuthoritative = () => false,
  setAuthoritative = () => {},
  save = async () => true,
} = {}) {
  const loaded = collectionLoadState({ items, version, localItems });
  if (loaded.initialized) {
    setCurrentItems(loaded.items);
    setVersion(version);
    setDirty(false);
    setAuthoritative(true);
    return { ...loaded, version, migrated: false, authoritative: true };
  }

  if (!sharedReady()) await waitForShared();
  if (isAuthoritative()) {
    return { items: getCurrentItems(), initialized: false, version, migrated: false, authoritative: true };
  }

  const currentItems = getCurrentItems();
  const nextItems = currentItems.length ? currentItems : loaded.items;
  setCurrentItems(nextItems);
  setVersion(version);
  setDirty(nextItems.length > 0);
  if (!sharedReady() || !nextItems.length) {
    return { items: nextItems, initialized: false, version, migrated: false, authoritative: false };
  }

  const saved = await save();
  const migrated = saved !== false;
  if (migrated) setAuthoritative(true);
  return { items: nextItems, initialized: false, version, migrated, authoritative: migrated };
}
