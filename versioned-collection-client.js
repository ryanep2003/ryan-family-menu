export async function loadVersionedCollection({
  getJson,
  url,
  fallbackMessage,
  setItems,
  setVersion,
  render,
}) {
  const data = await getJson(url, fallbackMessage);
  setItems(Array.isArray(data.items) ? data.items : []);
  setVersion(Number(data.version) || 0);
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
}) {
  const data = await putJson(url, { items, version }, fallbackMessage);
  setItems(Array.isArray(data.items) ? data.items : items);
  setVersion(Number(data.version) || version);
  return { saved: true, conflict: false };
}

export function applyVersionConflict(error, { setItems, setVersion, currentVersion }) {
  if (error.status !== 409 || !Array.isArray(error.data?.items)) return false;
  setItems(error.data.items);
  setVersion(Number(error.data.version) || currentVersion);
  return true;
}
