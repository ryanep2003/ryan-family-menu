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

export function preferredRestoreIndex(itemIds, startId, remembered, count) {
  if (!count) return 0;
  if (startId) {
    const index = (itemIds || []).indexOf(startId);
    if (index >= 0) return index;
  }
  return rememberedIndex(itemIds, remembered, count);
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
  return record.open
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
