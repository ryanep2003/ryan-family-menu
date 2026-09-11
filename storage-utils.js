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
