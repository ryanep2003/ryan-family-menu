import { translations } from "./translations.js";

export const DEFAULT_HOUSEHOLD_MEMBER = "Family";

export function cleanHouseholdMember(value) {
  return `${value || ""}`
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}

function defaultHouseholdMemberNames() {
  return new Set(
    [DEFAULT_HOUSEHOLD_MEMBER, translations.en?.householdFamily, translations.es?.householdFamily]
      .map((value) => `${value || ""}`.trim())
      .filter(Boolean)
  );
}

export function isDefaultHouseholdMember(name) {
  return defaultHouseholdMemberNames().has(cleanHouseholdMember(name));
}

export function displayHouseholdMember(name, translate) {
  const cleaned = cleanHouseholdMember(name);
  if (!cleaned) return "";
  if (isDefaultHouseholdMember(cleaned)) {
    return typeof translate === "function" ? translate("householdFamily") : DEFAULT_HOUSEHOLD_MEMBER;
  }
  return cleaned;
}

export function canonicalHouseholdMember(name) {
  const cleaned = cleanHouseholdMember(name);
  if (!cleaned) return "";
  if (isDefaultHouseholdMember(cleaned)) return DEFAULT_HOUSEHOLD_MEMBER;
  return cleaned;
}
