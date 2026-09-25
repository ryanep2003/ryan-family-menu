import { prepareWeekDraftApproval } from "./week-approval-logic.js";

/** One bounded approval attempt against the authoritative schedule record. */
export async function approveWeekDraft({ draft, approvedDateKeys, visibleRecipeIds, getLatest, putRecord }) {
  if (typeof getLatest !== "function" || typeof putRecord !== "function") {
    throw new TypeError("Schedule read and write functions are required.");
  }
  let latest;
  try {
    latest = await getLatest();
  } catch {
    return { status: "load-error", appliedDates: [], conflicts: [] };
  }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const prepared = prepareWeekDraftApproval({ draft, approvedDateKeys, visibleRecipeIds, latestRecord: latest });
    if (prepared.status !== "ready") return prepared;
    try {
      const saved = await putRecord(prepared.record);
      return { status: "saved", appliedDates: prepared.appliedDates, conflicts: [], record: saved };
    } catch (error) {
      if (error?.status !== 409) return { status: "save-error", appliedDates: [], conflicts: [] };
      if (attempt === 1) return { status: "conflict", reason: "version-changed-again", appliedDates: [], conflicts: [] };
      latest = error.data;
    }
  }
  return { status: "conflict", reason: "version-changed-again", appliedDates: [], conflicts: [] };
}
