export function cleanHouseholdMember(value) {
  return `${value || ""}`
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}
