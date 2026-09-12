// Native recipe reel. Safari owns momentum scrolling; no carousel library, no 3D engine.
import {
  DRAG_THRESHOLD_PX,
  IMAGE_NEAR_RADIUS,
  isDragGesture,
  isNearIndex,
  itemIdsSignature,
  itemIndexForRecipeId,
  lockedActiveIndex,
  mostIntersectingIndex,
  nearestIndexByCenters,
  needsSnapCorrection,
  preferredRestoreIndex,
  recipeIdFromElement,
  recipeIdFromRecord,
  reelClickAction,
  scrollLeftToAlignCenter,
  shouldParkMedia,
  usesCustomPointerDrag,
} from "./recipe-reel-logic.js";

const REEL_CSS_URL = "./recipe-reel.css?v=9";
const START_LOCK_CLASS = "is-start-locked";
const SURFACE_SELECTOR = "#recipeList, .focused-recipe-results, .meal-recipe-results";
const ITEM_SELECTOR = ".recipe-browse-card, .focused-recipe-result, .meal-recipe-result";
const REEL_CLASS = "recipe-native-reel";
const ACTIVE_CLASS = "recipe-reel-active";
const NEAR_CLASS = "recipe-reel-near";
const FAR_CLASS = "recipe-reel-far";
const DRAGGING_CLASS = "is-dragging";

const stateBySurface = new WeakMap();
const positionBySurface = new WeakMap();
const watchedSurfaces = new WeakSet();
const scheduled = new WeakSet();
let scanQueued = false;

function ensureStyles(root) {
  if (root.querySelector('link[data-recipe-reel="local"]')) return;
  const localCss = root.createElement("link");
  localCss.rel = "stylesheet";
  localCss.href = REEL_CSS_URL;
  localCss.dataset.recipeReel = "local";
  root.head?.append(localCss);
}

function isHtmlElement(node) {
  return typeof HTMLElement !== "undefined" && node instanceof HTMLElement;
}

function isRecipeItem(node) {
  return isHtmlElement(node) && node.matches(ITEM_SELECTOR);
}

function itemsFor(surface) {
  return [...surface.children].filter(isRecipeItem);
}

function recipeIdForItem(item) {
  if (!isHtmlElement(item)) return "";
  const fromCard = recipeIdFromElement(item);
  if (fromCard) return fromCard;
  const child = item.querySelector?.("[data-open], [data-recipe-id], [data-focused-recipe]");
  return recipeIdFromRecord({
    attrFocusedRecipe: item.getAttribute("data-focused-recipe"),
    attrRecipeId: item.getAttribute("data-recipe-id"),
    attrOpen: item.getAttribute("data-open"),
    open: item.dataset.open,
    recipeId: item.dataset.recipeId,
    focusedRecipe: item.dataset.focusedRecipe,
    childOpen: child?.dataset?.open,
    childRecipeId: child?.dataset?.recipeId,
    childFocusedRecipe: child?.dataset?.focusedRecipe,
  });
}

function indexForRecipeId(items, recipeId) {
  const ids = items.map(recipeIdForItem);
  const byId = itemIndexForRecipeId(ids, recipeId);
  if (byId >= 0) return byId;
  return items.findIndex((item) => recipeIdFromElement(item) === recipeId);
}

function startIsLocked(surface) {
  const state = stateBySurface.get(surface);
  return Boolean(startRecipeId(surface) && state && !state.releasedStart);
}

function setStartLock(surface, locked) {
  surface.classList.toggle(START_LOCK_CLASS, Boolean(locked));
}

function itemIdsFor(surface) {
  return itemsFor(surface).map(recipeIdForItem);
}

function isLayoutVisible(surface) {
  if (!isHtmlElement(surface) || !surface.isConnected) return false;
  if (surface.hidden || surface.closest("[hidden]")) return false;
  const style = getComputedStyle(surface);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const rect = surface.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function prefersReducedMotion() {
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
}

function snapBehavior() {
  return prefersReducedMotion() ? "auto" : "smooth";
}

function alignedScrollLeft(surface, item) {
  return scrollLeftToAlignCenter(
    surface.scrollLeft,
    surface.getBoundingClientRect(),
    item.getBoundingClientRect(),
  );
}

function centerItem(surface, item, behavior = "auto") {
  if (!surface || !item) return;
  const locked = startIsLocked(surface);
  setStartLock(surface, true);
  void surface.offsetWidth;
  surface.scrollTo({
    left: alignedScrollLeft(surface, item),
    behavior: behavior === "smooth" && !locked ? "smooth" : "auto",
  });
  if (!locked) {
    requestAnimationFrame(() => setStartLock(surface, false));
  }
}

function nearestIndexFromSurface(surface, items) {
  const surfaceRect = surface.getBoundingClientRect();
  const viewportCenter = surfaceRect.left + surfaceRect.width / 2;
  const centers = items.map((item) => {
    const rect = item.getBoundingClientRect();
    return rect.left + rect.width / 2;
  });
  return nearestIndexByCenters(centers, viewportCenter);
}

function elementFromEventTarget(target) {
  if (target instanceof Element) return target;
  return target?.parentElement || null;
}

function reelItemFromEvent(event, surface) {
  const path = typeof event.composedPath === "function" ? event.composedPath() : [event.target];
  for (const node of path) {
    if (isRecipeItem(node) && node.parentElement === surface) return node;
  }
  const item = elementFromEventTarget(event.target)?.closest?.(ITEM_SELECTOR);
  return item?.parentElement === surface ? item : null;
}

function parkImage(image) {
  const src = image.getAttribute("src");
  if (src && !image.dataset.reelSrc) image.dataset.reelSrc = src;
  if (src) image.removeAttribute("src");
}

function restoreImage(image) {
  const parked = image.dataset.reelSrc;
  if (parked && image.getAttribute("src") !== parked) image.src = parked;
}

function tuneImages(surface) {
  surface.querySelectorAll("img").forEach((image) => {
    image.loading = "lazy";
    image.decoding = "async";
    image.draggable = false;
  });
}

function syncImageBudget(items, activeIndex) {
  items.forEach((item, index) => {
    const park = shouldParkMedia(index, activeIndex, IMAGE_NEAR_RADIUS);
    item.querySelectorAll("img").forEach((image) => {
      if (park) parkImage(image);
      else restoreImage(image);
    });
  });
}

function applyActive(surface, items, activeIndex, { restore = false } = {}) {
  if (!items.length) return;
  const state = stateBySurface.get(surface);
  const requested = Math.max(0, Math.min(items.length - 1, activeIndex));
  const lockedIndex = lockedActiveIndex({
    itemIds: items.map(recipeIdForItem),
    startId: startRecipeId(surface),
    releasedStart: Boolean(state?.releasedStart),
    requestedIndex: requested,
  });
  if (lockedIndex < 0) return;
  const index = lockedIndex;
  items.forEach((item, itemIndex) => {
    item.classList.toggle(ACTIVE_CLASS, itemIndex === index);
    item.classList.toggle(NEAR_CLASS, isNearIndex(itemIndex, index));
    item.classList.toggle(FAR_CLASS, shouldParkMedia(itemIndex, index, IMAGE_NEAR_RADIUS));
    if (itemIndex === index) item.setAttribute("aria-current", "true");
    else item.removeAttribute("aria-current");
  });
  syncImageBudget(items, index);
  const recipeId = recipeIdForItem(items[index]);
  const previous = positionBySurface.get(surface);
  positionBySurface.set(surface, {
    index,
    recipeId,
  });
  if (recipeId && previous?.recipeId !== recipeId) {
    surface.dispatchEvent(new CustomEvent("recipe-reel-active", {
      bubbles: true,
      detail: {
        recipeId,
        index,
        restore: restore || Boolean(state?.ignoreActive),
      },
    }));
  }
}

function startRecipeId(surface) {
  return surface.dataset?.reelStart || "";
}

function restoreRemembered(surface, items) {
  if (!items.length) return;
  const remembered = positionBySurface.get(surface);
  const startId = startRecipeId(surface);
  let index = preferredRestoreIndex(items.map(recipeIdForItem), startId, remembered, items.length);
  if (index < 0 && startId) {
    index = indexForRecipeId(items, startId);
  }
  if (index < 0) return;
  if (startId && !stateBySurface.get(surface)?.releasedStart) {
    setStartLock(surface, true);
  }
  centerItem(surface, items[index], "auto");
  applyActive(surface, items, index, { restore: true });
}

function settleSnap(surface, state) {
  if (state.pointer) return;
  const items = itemsFor(surface);
  if (!items.length) return;
  const lockId = !state.releasedStart && startRecipeId(surface);
  if (lockId) {
    restoreRemembered(surface, items);
    return;
  }
  const index = nearestIndexFromSurface(surface, items);
  const item = items[index];
  const target = alignedScrollLeft(surface, item);
  if (needsSnapCorrection(surface.scrollLeft, target)) {
    surface.scrollTo({ left: target, behavior: snapBehavior() });
  }
  applyActive(surface, items, index);
}

function queueLockedRecenter(surface) {
  const state = stateBySurface.get(surface);
  if (!state || state.releasedStart || !startRecipeId(surface)) return;
  let frames = 8;
  const tick = () => {
    if (!surface.isConnected || state.releasedStart || !startRecipeId(surface)) return;
    restoreRemembered(surface, itemsFor(surface));
    frames -= 1;
    if (frames > 0) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function observeActiveItems(surface, state) {
  state.itemObserver?.disconnect();
  const items = itemsFor(surface);
  if (!items.length || typeof IntersectionObserver !== "function") return;

  const ratios = new Map();
  state.itemObserver = new IntersectionObserver((entries) => {
    if (state.ignoreActive || (!state.releasedStart && startRecipeId(surface))) return;
    for (const entry of entries) ratios.set(entry.target, entry.intersectionRatio);
    const ordered = itemsFor(surface);
    if (!ordered.length) return;
    const visibleRatios = ordered.map((item) => ratios.get(item) || 0);
    if (!visibleRatios.some((ratio) => ratio > 0)) return;
    const nextIndex = mostIntersectingIndex(visibleRatios);
    if (ordered[nextIndex]?.classList.contains(ACTIVE_CLASS)) return;
    applyActive(surface, ordered, nextIndex);
  }, {
    root: surface,
    threshold: [0, 0.25, 0.5, 0.75, 1],
    rootMargin: "0px -28% 0px -28%",
  });
  items.forEach((item) => state.itemObserver.observe(item));
}

function bindPointer(surface, state) {
  state.pointer = null;
  state.suppressClick = false;

  state.pointerDownHandler = (event) => {
    if (event.button !== 0) return;
    state.releasedStart = true;
    setStartLock(surface, false);
    state.suppressClick = false;
    state.pointer = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      scrollLeft: surface.scrollLeft,
      moved: false,
      captured: false,
      customDrag: usesCustomPointerDrag(event.pointerType),
    };
  };

  state.pointerMoveHandler = (event) => {
    const pointer = state.pointer;
    if (!pointer || event.pointerId !== pointer.id) return;
    if (!pointer.moved && isDragGesture(pointer.x, pointer.y, event.clientX, event.clientY, DRAG_THRESHOLD_PX)) {
      pointer.moved = true;
      surface.classList.add(DRAGGING_CLASS);
      // Capture only after a real drag so a clean tap still lands on nested buttons.
      if (pointer.customDrag && !pointer.captured) {
        surface.setPointerCapture?.(event.pointerId);
        pointer.captured = true;
      }
    }
    if (pointer.customDrag && pointer.moved) {
      event.preventDefault();
      surface.scrollLeft = pointer.scrollLeft - (event.clientX - pointer.x);
    }
  };

  state.pointerEndHandler = (event) => {
    const pointer = state.pointer;
    if (!pointer || event.pointerId !== pointer.id) return;
    if (pointer.moved) state.suppressClick = true;
    else state.suppressClick = false;
    surface.classList.remove(DRAGGING_CLASS);
    if (pointer.captured) surface.releasePointerCapture?.(event.pointerId);
    state.pointer = null;
    if (pointer.moved) settleSnap(surface, state);
  };

  state.selectStartHandler = (event) => {
    if (state.pointer?.moved) event.preventDefault();
  };

  state.clickHandler = (event) => {
    const item = reelItemFromEvent(event, surface);
    const items = itemsFor(surface);
    const nearest = items[nearestIndexFromSurface(surface, items)];
    const action = reelClickAction({
      movementExceededThreshold: state.suppressClick,
      hasReelItem: Boolean(item),
      itemIsActive: Boolean(item && (item.classList.contains(ACTIVE_CLASS) || item === nearest)),
    });
    state.suppressClick = false;

    if (action === "allow" || action === "ignore") return;
    event.preventDefault();
    event.stopPropagation();
    if (action === "center") centerItem(surface, item, snapBehavior());
  };

  surface.addEventListener("pointerdown", state.pointerDownHandler);
  surface.addEventListener("pointermove", state.pointerMoveHandler);
  surface.addEventListener("pointerup", state.pointerEndHandler);
  surface.addEventListener("pointercancel", state.pointerEndHandler);
  surface.addEventListener("selectstart", state.selectStartHandler);
  surface.addEventListener("click", state.clickHandler, true);
}

function bindScrollSettle(surface, state) {
  const settle = () => settleSnap(surface, state);
  if ("onscrollend" in surface) {
    state.scrollEndHandler = settle;
    surface.addEventListener("scrollend", state.scrollEndHandler, { passive: true });
    return;
  }
  let timer = 0;
  state.scrollHandler = () => {
    clearTimeout(timer);
    timer = setTimeout(settle, 140);
  };
  surface.addEventListener("scroll", state.scrollHandler, { passive: true });
}

function bindStartLayout(surface, state) {
  if (typeof ResizeObserver !== "function") return;
  if (!startRecipeId(surface)) return;
  if (!state.startObserver) {
    state.startObserver = new ResizeObserver(() => {
      if (!surface.isConnected || state.releasedStart || state.pointer) return;
      const items = itemsFor(surface);
      const startId = startRecipeId(surface);
      if (!startId || !items.length) return;
      const index = indexForRecipeId(items, startId);
      const item = items[index];
      if (!item) return;
      if (!needsSnapCorrection(surface.scrollLeft, alignedScrollLeft(surface, item))) return;
      restoreRemembered(surface, items);
    });
  }
  state.startObserver.disconnect();
  state.startObserver.observe(surface);
  if (surface.parentElement) state.startObserver.observe(surface.parentElement);
  const items = itemsFor(surface);
  const startItem = items[indexForRecipeId(items, startRecipeId(surface))];
  if (startItem) state.startObserver.observe(startItem);
}

function refreshSurface(surface) {
  const state = stateBySurface.get(surface);
  if (!state) return;
  tuneImages(surface);
  const signature = itemIdsSignature(itemIdsFor(surface));
  const itemsChanged = state.signature !== signature;
  state.signature = signature;
  if (itemsChanged) {
    state.ignoreActive = true;
    observeActiveItems(surface, state);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!surface.isConnected) return;
        restoreRemembered(surface, itemsFor(surface));
        state.ignoreActive = false;
        bindStartLayout(surface, state);
        queueLockedRecenter(surface);
      });
    });
    return;
  }
  observeActiveItems(surface, state);
  bindStartLayout(surface, state);
}

function bindSurface(surface) {
  if (!isHtmlElement(surface)) return;
  if (stateBySurface.has(surface)) {
    refreshSurface(surface);
    return;
  }

  surface.classList.add(REEL_CLASS);
  const state = {
    signature: "",
    updating: false,
    pointer: null,
    suppressClick: false,
    itemObserver: null,
    startObserver: null,
    releasedStart: false,
  };
  stateBySurface.set(surface, state);
  bindPointer(surface, state);
  bindScrollSettle(surface, state);
  refreshSurface(surface);
}

function unbindSurface(surface) {
  const state = stateBySurface.get(surface);
  if (!state) return;
  state.itemObserver?.disconnect();
  state.startObserver?.disconnect();
  surface.removeEventListener("pointerdown", state.pointerDownHandler);
  surface.removeEventListener("pointermove", state.pointerMoveHandler);
  surface.removeEventListener("pointerup", state.pointerEndHandler);
  surface.removeEventListener("pointercancel", state.pointerEndHandler);
  surface.removeEventListener("selectstart", state.selectStartHandler);
  surface.removeEventListener("click", state.clickHandler, true);
  surface.removeEventListener("scrollend", state.scrollEndHandler);
  surface.removeEventListener("scroll", state.scrollHandler);
  surface.classList.remove(DRAGGING_CLASS);
  stateBySurface.delete(surface);
}

function scheduleSurface(surface) {
  if (!isHtmlElement(surface) || scheduled.has(surface)) return;
  scheduled.add(surface);
  requestAnimationFrame(() => {
    scheduled.delete(surface);
    if (isLayoutVisible(surface)) bindSurface(surface);
    else if (stateBySurface.has(surface)) unbindSurface(surface);
  });
}

function watchSurface(surface) {
  if (!isHtmlElement(surface) || watchedSurfaces.has(surface)) {
    scheduleSurface(surface);
    return;
  }
  watchedSurfaces.add(surface);
  const observer = new MutationObserver(() => scheduleSurface(surface));
  observer.observe(surface, { childList: true });
  scheduleSurface(surface);
}

function scanSurfaces(root) {
  root.querySelectorAll(SURFACE_SELECTOR).forEach(watchSurface);
}

function queueScan(root) {
  if (scanQueued) return;
  scanQueued = true;
  requestAnimationFrame(() => {
    scanQueued = false;
    scanSurfaces(root);
  });
}

function mutationAddsSurface(mutations) {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (!isHtmlElement(node)) continue;
      if (node.matches?.(SURFACE_SELECTOR) || node.querySelector?.(SURFACE_SELECTOR)) return true;
    }
  }
  return false;
}

export function syncReelToRecipeId(surface, recipeId) {
  if (!isHtmlElement(surface) || !recipeId) return false;
  surface.dataset.reelStart = recipeId;
  if (!stateBySurface.has(surface) && isLayoutVisible(surface)) {
    bindSurface(surface);
  }
  const items = itemsFor(surface);
  const index = indexForRecipeId(items, recipeId);
  if (index < 0) return false;
  const state = stateBySurface.get(surface);
  if (state && !state.pointer) {
    state.releasedStart = false;
    setStartLock(surface, true);
  }
  restoreRemembered(surface, items);
  return true;
}

export function installRecipeReels(root = globalThis.document) {
  if (!root?.documentElement || root.documentElement.dataset.recipeReelsInstalled === "native") return;
  root.documentElement.dataset.recipeReelsInstalled = "native";
  ensureStyles(root);

  const observer = new MutationObserver((mutations) => {
    if (mutationAddsSurface(mutations)) queueScan(root);
  });
  observer.observe(root.body, { childList: true, subtree: true });

  const viewObserver = new MutationObserver(() => queueScan(root));
  viewObserver.observe(root.body, { attributes: true, attributeFilter: ["data-view"] });

  globalThis.addEventListener?.("resize", () => queueScan(root), { passive: true });
  root.addEventListener?.("visibilitychange", () => queueScan(root));
  scanSurfaces(root);
}

if (typeof document !== "undefined") {
  installRecipeReels(document);
}
