const HOUSEHOLD_MEMBERS = new Set(["Family", "Alyson", "Eric", "Nelly", "Theo", "Pierce"]);

export function cleanHouseholdMember(value) {
  return HOUSEHOLD_MEMBERS.has(value) ? value : "";
}
