// Pure helpers for the native recipe reel. No DOM, no scroll engine.
export const DRAG_THRESHOLD_PX = 8;
export const IMAGE_NEAR_RADIUS = 2;
export const SNAP_ALIGN_SLOP_PX = 2;

export function nearestIndexByCenters(centers, viewportCenter) {
  let activeIndex = 0;
  let bestDistance = Infinity;
  for (let index = 0; index < centers.length; index += 1) {
    const distance = Math.abs(Number(centers[index]) - viewportCenter);
    if (distance < bestDistance) {
      bestDistance = distance;
      activeIndex = index;
    }
  }
  return activeIndex;
}

export function scrollLeftToCenter(itemOffsetLeft, itemWidth, surfaceWidth) {
  return Math.max(0, itemOffsetLeft - ((surfaceWidth - itemWidth) / 2));
}

export function scrollLeftToAlignCenter(surfaceScrollLeft, surfaceRect = {}, itemRect = {}) {
  const surfaceLeft = Number(surfaceRect.left) || 0;
  const surfaceWidth = Number(surfaceRect.width) || 0;
  const itemLeft = Number(itemRect.left) || 0;
  const itemWidth = Number(itemRect.width) || 0;
  const delta = (itemLeft + (itemWidth / 2)) - (surfaceLeft + (surfaceWidth / 2));
  return Math.max(0, (Number(surfaceScrollLeft) || 0) + delta);
}

export function recipeIdFromElement(item) {
  if (!item) return "";
  return item.getAttribute?.("data-focused-recipe")
    || item.getAttribute?.("data-recipe-id")
    || item.getAttribute?.("data-open")
    || "";
}

export function isDragGesture(startX, startY, currentX, currentY, threshold = DRAG_THRESHOLD_PX) {
  const deltaX = currentX - startX;
  const deltaY = currentY - startY;
  return (deltaX * deltaX) + (deltaY * deltaY) >= threshold * threshold;
}

export function rememberedIndex(itemIds, remembered, count) {
  if (!count) return 0;
  if (remembered?.recipeId) {
    const index = itemIds.indexOf(remembered.recipeId);
    if (index >= 0) return index;
  }
  if (Number.isInteger(remembered?.index)) {
    return Math.max(0, Math.min(count - 1, remembered.index));
  }
  return Math.floor((count - 1) / 2);
}

export function itemIndexForRecipeId(itemIds, recipeId) {
  if (!recipeId) return -1;
  return (itemIds || []).indexOf(recipeId);
}

export function preferredRestoreIndex(itemIds, startId, remembered, count) {
  if (!count) return 0;
  if (startId) {
    const index = itemIndexForRecipeId(itemIds, startId);
    // A requested start recipe must not fall back to the middle catalog card.
    // Desktop List→Explore used that fallback and lit Cheesy Chicken while the tray kept Picadillo.
    return index;
  }
  return rememberedIndex(itemIds, remembered, count);
}

export function lockedActiveIndex({ itemIds, startId, releasedStart, requestedIndex }) {
  if (!releasedStart && startId) {
    return itemIndexForRecipeId(itemIds, startId);
  }
  return requestedIndex;
}

export function isNearIndex(index, activeIndex) {
  return Math.abs(index - activeIndex) === 1;
}

export function shouldParkMedia(index, activeIndex, radius = IMAGE_NEAR_RADIUS) {
  return Math.abs(index - activeIndex) > radius;
}

export function itemIdsSignature(ids) {
  return (ids || []).join("\0");
}

export function recipeIdFromRecord(record = {}) {
  return record.attrFocusedRecipe
    || record.attrRecipeId
    || record.attrOpen
    || record.open
    || record.recipeId
    || record.focusedRecipe
    || record.childOpen
    || record.childRecipeId
    || record.childFocusedRecipe
    || "";
}

export function mostIntersectingIndex(ratios) {
  let bestIndex = 0;
  let bestRatio = -1;
  for (let index = 0; index < ratios.length; index += 1) {
    const ratio = Number(ratios[index]) || 0;
    if (ratio > bestRatio) {
      bestRatio = ratio;
      bestIndex = index;
    }
  }
  return bestIndex;
}

export function needsSnapCorrection(scrollLeft, targetLeft, slop = SNAP_ALIGN_SLOP_PX) {
  return Math.abs(scrollLeft - targetLeft) > slop;
}

export function usesCustomPointerDrag(pointerType) {
  return pointerType === "mouse";
}

// Decide what a pointer-generated click should do. Nested controls inside an
// active card (title button, Add to a meal) share the card's item and must
// stay "allow" so they can open or add.
export function reelClickAction({
  movementExceededThreshold = false,
  hasReelItem = false,
  itemIsActive = false,
} = {}) {
  if (movementExceededThreshold) return "suppress";
  if (!hasReelItem) return "ignore";
  if (itemIsActive) return "allow";
  return "center";
}
