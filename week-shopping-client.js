import { applyInventoryCoverage, checkedGroceryEvidenceAtRisk, previewPlannedGroceryChanges, replacePlannedGroceries } from "./grocery-logic.js";

/** One explicit grocery write for the exact shared records the shopper previewed. */
export async function commitWeekShoppingPreview({ preview, getLatestSchedule, getLatestGroceries, putGroceries, isStillCurrent = () => true }) {
  if (!preview || !Array.isArray(preview.generatedItems)
    || !Number.isInteger(preview.scheduleVersion) || !Number.isInteger(preview.groceryVersion)) {
    return { status: "invalid" };
  }
  let schedule;
  let groceries;
  try {
    [schedule, groceries] = await Promise.all([getLatestSchedule(), getLatestGroceries()]);
  } catch {
    return { status: "load-error" };
  }
  if (Number(schedule?.version) !== preview.scheduleVersion
    || Number(groceries?.version) !== preview.groceryVersion
    || !Array.isArray(groceries?.items)) return { status: "stale" };

  const review = previewPlannedGroceryChanges(groceries.items, preview.generatedItems);
  if (review.needsPurchaseReview) return { status: "review-required", changes: review.changes };
  if (!review.changes.length) return { status: "no-change" };

  const nextItems = applyInventoryCoverage(
    replacePlannedGroceries(groceries.items, preview.generatedItems),
    preview.inventorySnapshot || [],
  );
  // Inventory reconciliation must not silently undo an existing checked purchase.
  if (checkedGroceryEvidenceAtRisk(groceries.items, nextItems)) {
    return { status: "review-required", changes: review.changes };
  }
  if (!isStillCurrent()) return { status: "pending" };
  try {
    const record = await putGroceries({ items: nextItems, version: groceries.version });
    if (!Array.isArray(record?.items) || !Number.isInteger(Number(record?.version))) return { status: "save-error" };
    return { status: "saved", record, changes: review.changes };
  } catch (error) {
    return { status: error?.status === 409 ? "conflict" : "save-error" };
  }
}
