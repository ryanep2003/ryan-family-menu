// Swiper-backed recipe reel prototype for PR #28.
// Product rule: a hard flick must be able to traverse many recipes; side-card taps center first.
const SWIPER_URL = "https://cdn.jsdelivr.net/npm/swiper@14.2.0/swiper-bundle.min.mjs";
const SWIPER_CSS_URL = "https://cdn.jsdelivr.net/npm/swiper@14.2.0/swiper-bundle.min.css";
const REEL_CSS_URL = "./recipe-reel.css?v=3";
const SURFACE_SELECTOR = "#recipeList, .focused-recipe-results, .meal-recipe-results";
const REEL_CLASS = "recipe-swiper";
const WRAPPER_CLASS = "swiper-wrapper";
const SLIDE_CLASS = "swiper-slide";

let swiperConstructorPromise = null;
const stateBySurface = new WeakMap();
const scheduled = new WeakSet();
let reconcileQueued = false;

function ensureStyles() {
  if (!document.querySelector('link[data-recipe-reel="swiper"]')) {
    const swiperCss = document.createElement("link");
    swiperCss.rel = "stylesheet";
    swiperCss.href = SWIPER_CSS_URL;
    swiperCss.dataset.recipeReel = "swiper";
    document.head.append(swiperCss);
  }

  if (!document.querySelector('link[data-recipe-reel="local"]')) {
    const localCss = document.createElement("link");
    localCss.rel = "stylesheet";
    localCss.href = REEL_CSS_URL;
    localCss.dataset.recipeReel = "local";
    document.head.append(localCss);
  }
}

function loadSwiper() {
  if (!swiperConstructorPromise) {
    swiperConstructorPromise = import(SWIPER_URL).then((module) => module.default || module.Swiper);
  }
  return swiperConstructorPromise;
}

function isRecipeItem(node) {
  if (!(node instanceof HTMLElement)) return false;
  return node.matches(".recipe-browse-card, .focused-recipe-result, .meal-recipe-result");
}

function directRecipeItems(surface) {
  return [...surface.children].filter(isRecipeItem);
}

function currentSlides(surface) {
  const wrapper = surface.querySelector(`:scope > .${WRAPPER_CLASS}`);
  return wrapper ? [...wrapper.children].filter((node) => node.classList?.contains(SLIDE_CLASS)) : [];
}

function isLayoutVisible(surface) {
  if (!(surface instanceof HTMLElement) || !surface.isConnected) return false;
  if (surface.hidden || surface.closest("[hidden]")) return false;

  const style = getComputedStyle(surface);
  if (style.display === "none" || style.visibility === "hidden") return false;

  const rect = surface.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function restoreSurface(surface) {
  const state = stateBySurface.get(surface);
  if (state?.clickHandler) surface.removeEventListener("click", state.clickHandler, true);
  if (state?.swiper && !state.swiper.destroyed) {
    try {
      state.swiper.destroy(true, false);
    } catch {
      // A render can replace the DOM while Swiper is mid-update. The next sync rebuilds it.
    }
  }

  const wrapper = surface.querySelector(`:scope > .${WRAPPER_CLASS}`);
  if (wrapper) {
    const slides = [...wrapper.children];
    slides.forEach((slide) => {
      slide.classList.remove(SLIDE_CLASS, "swiper-slide-active", "swiper-slide-next", "swiper-slide-prev", "swiper-slide-visible", "swiper-slide-fully-visible");
      slide.removeAttribute("style");
      surface.append(slide);
    });
    wrapper.remove();
  }

  surface.classList.remove(REEL_CLASS, "swiper", "swiper-initialized", "swiper-horizontal", "swiper-backface-hidden", "swiper-3d", "swiper-free-mode", "swiper-watch-progress");
  surface.removeAttribute("style");
  delete surface.dataset.recipeReelReady;
  stateBySurface.delete(surface);
}

function prepareMarkup(surface, items) {
  const wrapper = document.createElement("div");
  wrapper.className = WRAPPER_CLASS;
  items.forEach((item) => {
    item.classList.add(SLIDE_CLASS);
    wrapper.append(item);
  });
  surface.replaceChildren(wrapper);
  surface.classList.add(REEL_CLASS, "swiper");
}

function bindSideCardCentering(surface, state) {
  if (state.clickHandler) return;

  const clickHandler = (event) => {
    const slide = event.target.closest?.(`.${SLIDE_CLASS}`);
    if (!slide || !surface.contains(slide)) return;

    const swiper = state.swiper;
    if (!swiper || swiper.destroyed) return;

    const index = [...slide.parentElement.children].indexOf(slide);
    if (index < 0) return;

    const activeSlide = swiper.slides?.[swiper.activeIndex];
    if (slide !== activeSlide) {
      event.preventDefault();
      event.stopPropagation();
      swiper.slideTo(index, 240);
    }
  };

  surface.addEventListener("click", clickHandler, true);
  state.clickHandler = clickHandler;
}

async function mountSurface(surface) {
  if (!isLayoutVisible(surface)) {
    if (stateBySurface.has(surface)) restoreSurface(surface);
    return;
  }

  const directItems = directRecipeItems(surface);
  const existingSlides = currentSlides(surface);
  const existing = stateBySurface.get(surface);

  if (existing?.swiper && !existing.swiper.destroyed && existingSlides.length) {
    existing.swiper.updateSize();
    existing.swiper.updateSlides();
    return;
  }

  if (existing) restoreSurface(surface);

  const items = directItems.length ? directItems : directRecipeItems(surface);
  if (items.length < 2) return;

  prepareMarkup(surface, items);

  let Swiper;
  try {
    Swiper = await loadSwiper();
  } catch (error) {
    console.error("Recipe reel failed to load Swiper; leaving standard recipe cards in place.", error);
    restoreSurface(surface);
    return;
  }

  if (!isLayoutVisible(surface)) {
    restoreSurface(surface);
    return;
  }

  const state = { swiper: null, clickHandler: null };
  stateBySurface.set(surface, state);

  state.swiper = new Swiper(surface, {
    direction: "horizontal",
    slidesPerView: "auto",
    centeredSlides: true,
    centeredSlidesBounds: true,
    spaceBetween: 18,
    speed: 240,
    threshold: 4,
    touchAngle: 35,
    resistance: true,
    resistanceRatio: 0.72,
    touchReleaseOnEdges: true,
    preventClicks: true,
    preventClicksPropagation: true,
    effect: "coverflow",
    freeMode: {
      enabled: true,
      momentum: true,
      momentumRatio: 1.9,
      momentumVelocityRatio: 1.35,
      minimumVelocity: 0.012,
      momentumBounce: true,
      momentumBounceRatio: 0.55,
      sticky: true,
    },
    coverflowEffect: {
      rotate: 0,
      stretch: 4,
      depth: 72,
      scale: 0.82,
      modifier: 1,
      slideShadows: false,
    },
    on: {
      init() {
        surface.dataset.recipeReelReady = "true";
      },
      destroy() {
        delete surface.dataset.recipeReelReady;
      },
    },
  });

  bindSideCardCentering(surface, state);
}

function scheduleSurface(surface) {
  if (!(surface instanceof HTMLElement) || scheduled.has(surface)) return;
  scheduled.add(surface);
  requestAnimationFrame(() => {
    scheduled.delete(surface);
    mountSurface(surface);
  });
}

function reconcileAll() {
  document.querySelectorAll(SURFACE_SELECTOR).forEach((surface) => {
    if (isLayoutVisible(surface)) {
      scheduleSurface(surface);
    } else if (stateBySurface.has(surface)) {
      restoreSurface(surface);
    }
  });
}

function queueReconcile() {
  if (reconcileQueued) return;
  reconcileQueued = true;
  requestAnimationFrame(() => {
    reconcileQueued = false;
    reconcileAll();
  });
}

export function installRecipeReels() {
  if (document.documentElement.dataset.recipeReelsInstalled === "true") return;
  document.documentElement.dataset.recipeReelsInstalled = "true";
  ensureStyles();

  const observer = new MutationObserver((mutations) => {
    const touched = new Set();
    let shouldReconcile = false;

    mutations.forEach((mutation) => {
      const targetSurface = mutation.target.closest?.(SURFACE_SELECTOR);
      if (targetSurface) touched.add(targetSurface);

      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        if (node.matches?.(SURFACE_SELECTOR)) touched.add(node);
        node.querySelectorAll?.(SURFACE_SELECTOR).forEach((surface) => touched.add(surface));
      });

      if (!targetSurface) shouldReconcile = true;
    });

    touched.forEach(scheduleSurface);
    if (shouldReconcile) queueReconcile();
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // View/panel changes happen through app controls rather than URL navigation.
  // Reconcile just after those interactions so hidden reels are torn down and
  // newly visible ones are mounted without keeping off-screen Swipers alive.
  document.addEventListener("click", () => {
    queueMicrotask(queueReconcile);
    window.setTimeout(queueReconcile, 260);
  }, true);

  window.addEventListener("resize", queueReconcile, { passive: true });
  document.addEventListener("visibilitychange", queueReconcile);
  queueReconcile();
}

installRecipeReels();
