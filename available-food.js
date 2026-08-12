import { hasLocalizedContent, isLocalizedValue, updateLocalizedText } from "./localized-data.js";

export const availableFoodTypes = [
  { key: "snack", label: "availableFoodSnack" },
  { key: "leftover", label: "availableFoodLeftover" },
];

export const availableFoodFreshness = [
  { key: "today", label: "availableFoodToday" },
  { key: "tomorrow", label: "availableFoodTomorrow" },
  { key: "later", label: "availableFoodLater" },
];

const freshnessRank = Object.fromEntries(availableFoodFreshness.map(({ key }, index) => [key, index]));

function optionKey(value, options) {
  return options.some((option) => option.key === value) ? value : "";
}

export function normalizeAvailableFoodItem(value) {
  const source = value && typeof value === "object" ? value : {};
  const label = typeof source.label === "string" || isLocalizedValue(source.label) ? source.label : "";
  const type = optionKey(source.type, availableFoodTypes);
  const freshness = optionKey(source.freshness, availableFoodFreshness);
  if (!source.id || !hasLocalizedContent(label) || !type || !freshness) return null;

  return {
    id: `${source.id}`.slice(0, 160),
    label,
    type,
    freshness,
    createdAt: typeof source.createdAt === "string" ? source.createdAt : "",
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : "",
  };
}

export function normalizeAvailableFood(value) {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeAvailableFoodItem).filter(Boolean).slice(0, 100);
}

export function orderAvailableFood(value) {
  return normalizeAvailableFood(value)
    .map((item, index) => ({ item, index }))
    .sort((left, right) => (
      freshnessRank[left.item.freshness] - freshnessRank[right.item.freshness]
      || `${left.item.createdAt}`.localeCompare(`${right.item.createdAt}`)
      || left.index - right.index
    ))
    .map(({ item }) => item);
}

export function useFirstAvailableFood(value) {
  return orderAvailableFood(value)[0] || null;
}

export function addAvailableFood(existing, { label, type, freshness, lang = "en", now = new Date().toISOString(), id = `available-${Date.now()}` }) {
  const text = `${label || ""}`.trim().slice(0, 160);
  if (!text || !optionKey(type, availableFoodTypes) || !optionKey(freshness, availableFoodFreshness)) return null;

  const item = normalizeAvailableFoodItem({
    id,
    label: updateLocalizedText("", text, lang),
    type,
    freshness,
    createdAt: now,
    updatedAt: now,
  });
  return item ? [item, ...normalizeAvailableFood(existing)].slice(0, 100) : null;
}
