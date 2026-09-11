// Native recipe reel. No carousel library, no transform engine.
// Safari owns momentum scrolling; this module only remembers/centers the nearest recipe.
const REEL_CSS_URL = "./recipe-reel.css?v=6";
const SURFACE_SELECTOR = "#recipeList, .focused-recipe-results, .meal-recipe-results";
const ITEM_SELECTOR = ".recipe-browse-card, .focused-recipe-result, .meal-recipe-result";
const REEL_CLASS = "recipe-native-reel";
const ACTIVE_CLASS = "recipe-reel-active";
const NEAR_CLASS = "recipe-reel-near";

const stateBySurface = new WeakMap();
const positionBySurface = new WeakMap();
const scheduled = new WeakSet();
let scanQueued = false;

function ensureStyles() {
  if (document.querySelector('link[data-recipe-reel="local"]')) return;
  const localCss = document.createElement("link");
  localCss.rel = "stylesheet";
  localCss.href = REEL_CSS_URL;
  localCss.dataset.recipeReel = "local";
  document.head.append(localCss);
}

function isRecipeItem(node) {
  return node instanceof HTMLElement && node.matches(ITEM_SELECTOR);
}

function itemsFor(surface) {
  return [...surface.children].filter(isRecipeItem);
}

function recipeIdForItem(item) {
  if (!(item instanceof HTMLElement)) return "";
  return item.dataset.open || item.querySelector?.("[data-open]")?.dataset.open || "";
}

function isLayoutVisible(surface) {
  if (!(surface instanceof HTMLElement) || !surface.isConnected) return false;
  if (surface.hidden || surface.closest("[hidden]")) return false;
  const style = getComputedStyle(surface);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const rect = surface.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function initialIndexForSurface(surface, items) {
  if (!items.length) return 0;
  const remembered = positionBySurface.get(surface);
  if (remembered?.recipeId) {
    const index = items.findIndex((item) => recipeIdForItem(item) === remembered.recipeId);
    if (index >= 0) return index;
  }
  if (Number.isInteger(remembered?.index)) {
    return Math.max(0, Math.min(items.length - 1, remembered.index));
  }
  return Math.floor((items.length - 1) / 2);
}

function centerItem(surface, item, behavior = "auto") {
  if (!surface || !item) return;
  const left = item.offsetLeft - ((surface.clientWidth - item.offsetWidth) / 2);
  surface.scrollTo({ left: Math.max(0, left), behavior });
}

function updateActive(surface) {
  const state = stateBySurface.get(surface);
  if (!state || state.updating) return;
  state.updating = true;
  requestAnimationFrame(() => {
    state.updating = false;
    if (!surface.isConnected) return;
    const items = itemsFor(surface);
    if (!items.length) return;

    const center = surface.scrollLeft + surface.clientWidth / 2;
    let activeIndex = 0;
    let bestDistance = Infinity;
    items.forEach((item, index) => {
      const itemCenter = item.offsetLeft + item.offsetWidth / 2;
      const distance = Math.abs(itemCenter - center);
      if (distance < bestDistance) {
        bestDistance = distance;
        activeIndex = index;
      }
    });

    items.forEach((item, index) => {
      item.classList.toggle(ACTIVE_CLASS, index === activeIndex);
      item.classList.toggle(NEAR_CLASS, Math.abs(index - activeIndex) === 1);
    });

    const active = items[activeIndex];
    positionBySurface.set(surface, {
      index: activeIndex,
      recipeId: recipeIdForItem(active),
    });
  });
}

function tuneImages(surface) {
  surface.querySelectorAll("img").forEach((image) => {
    image.loading = "lazy";
    image.decoding = "async";
  });
}

function bindSurface(surface) {
  if (!(surface instanceof HTMLElement)) return;
  const existing = stateBySurface.get(surface);
  if (existing) {
    tuneImages(surface);
    updateActive(surface);
    return;
  }

  surface.classList.add(REEL_CLASS);
  tuneImages(surface);
  const state = { updating: false, scrollHandler: null, clickHandler: null };

  state.scrollHandler = () => updateActive(surface);
  surface.addEventListener("scroll", state.scrollHandler, { passive: true });

  state.clickHandler = (event) => {
    const item = event.target.closest?.(ITEM_SELECTOR);
    if (!item || item.parentElement !== surface) return;
    const items = itemsFor(surface);
    const active = items.find((candidate) => candidate.classList.contains(ACTIVE_CLASS));
    if (item !== active) {
      event.preventDefault();
      event.stopPropagation();
      centerItem(surface, item, "smooth");
    }
  };
  surface.addEventListener("click", state.clickHandler, true);
  stateBySurface.set(surface, state);

  requestAnimationFrame(() => {
    const items = itemsFor(surface);
    if (!items.length) return;
    const initialIndex = initialIndexForSurface(surface, items);
    centerItem(surface, items[initialIndex], "auto");
    updateActive(surface);
  });
}

function unbindSurface(surface) {
  const state = stateBySurface.get(surface);
  if (!state) return;
  updateActive(surface);
  surface.removeEventListener("scroll", state.scrollHandler);
  surface.removeEventListener("click", state.clickHandler, true);
  stateBySurface.delete(surface);
}

function scheduleSurface(surface) {
  if (!(surface instanceof HTMLElement) || scheduled.has(surface)) return;
  scheduled.add(surface);
  requestAnimationFrame(() => {
    scheduled.delete(surface);
    if (isLayoutVisible(surface)) bindSurface(surface);
    else if (stateBySurface.has(surface)) unbindSurface(surface);
  });
}

function scanSurfaces() {
  document.querySelectorAll(SURFACE_SELECTOR).forEach(scheduleSurface);
}

function queueScan() {
  if (scanQueued) return;
  scanQueued = true;
  requestAnimationFrame(() => {
    scanQueued = false;
    scanSurfaces();
  });
}

export function installRecipeReels() {
  if (document.documentElement.dataset.recipeReelsInstalled === "native") return;
  document.documentElement.dataset.recipeReelsInstalled = "native";
  ensureStyles();

  // Existing renderers remain authoritative. This observer only notices when their
  // result cards change; it does not wrap, clone, transform, or continuously measure them.
  const observer = new MutationObserver((mutations) => {
    const touched = new Set();
    for (const mutation of mutations) {
      const surface = mutation.target.closest?.(SURFACE_SELECTOR);
      if (surface) touched.add(surface);
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.matches?.(SURFACE_SELECTOR)) touched.add(node);
        node.querySelectorAll?.(SURFACE_SELECTOR).forEach((candidate) => touched.add(candidate));
      }
    }
    touched.forEach(scheduleSurface);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  document.addEventListener("click", queueScan, true);
  document.addEventListener("input", queueScan, true);
  window.addEventListener("resize", queueScan, { passive: true });
  document.addEventListener("visibilitychange", queueScan);
  scanSurfaces();
}

installRecipeReels();
