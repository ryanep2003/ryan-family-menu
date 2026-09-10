// PR #28 preview bootstrap: force the gravity-field lifecycle module to load under
// a unique URL so stale module/service-worker caches cannot substitute an older copy.
// This side-effect import is intentionally isolated to this prototype branch.
import "./app-lifecycle.js?gravity-pr28-v3";

export function readJsonStorage(storage, key, fallback) {
  try {
    const value = storage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function readStringStorage(storage, key, fallback = "") {
  const value = storage.getItem(key);
  return value === null || value === "" ? fallback : value;
}

export function readNumberStorage(storage, key, fallback = 0) {
  const raw = storage.getItem(key);
  if (raw === null || raw === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}
