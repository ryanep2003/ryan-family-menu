export function normalizeActivity(value) {
  return Array.isArray(value) ? value.map((entry) => ({
    id: `${entry?.id || ""}`.trim().slice(0, 160),
    type: ["meal", "grocery", "inventory", "receipt", "budget", "recipe"].includes(entry?.type) ? entry.type : "meal",
    label: `${entry?.label || ""}`.trim().slice(0, 220),
    updatedBy: `${entry?.updatedBy || "Family"}`.trim().slice(0, 80) || "Family",
    updatedAt: `${entry?.updatedAt || ""}`.slice(0, 40),
  })).filter((entry) => entry.id && entry.label && !Number.isNaN(new Date(entry.updatedAt).getTime())).slice(0, 200) : [];
}

export function activityEntry(type, label, updatedBy, updatedAt = new Date().toISOString()) {
  return normalizeActivity([{
    id: `activity-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    label,
    updatedBy,
    updatedAt,
  }])[0];
}
