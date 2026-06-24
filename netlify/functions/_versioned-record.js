export function versionedRecord(saved, dataKey) {
  if (!saved) return { [dataKey]: dataKey === "state" ? null : [], version: 0, updatedAt: "" };
  if (Object.prototype.hasOwnProperty.call(saved, dataKey)) {
    return {
      [dataKey]: saved[dataKey],
      version: Number(saved.version) || 0,
      updatedAt: saved.updatedAt || saved[dataKey]?.updatedAt || "",
    };
  }
  return {
    [dataKey]: saved,
    version: Number(saved.version) || 0,
    updatedAt: saved.updatedAt || "",
  };
}

export function hasVersionConflict(incomingVersion, currentVersion) {
  const parsed = Number(incomingVersion);
  return Number.isFinite(parsed) && parsed !== currentVersion;
}

export function nextVersionedRecord(dataKey, value, currentVersion) {
  return {
    [dataKey]: value,
    version: currentVersion + 1,
    updatedAt: new Date().toISOString(),
  };
}
