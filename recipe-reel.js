// Swiper-backed recipe reel prototype for PR #28.
// Product rule: a hard flick must be able to traverse many recipes; side-card taps center first.
const SWIPER_URL = "https://cdn.jsdelivr.net/npm/swiper@14.2.0/swiper-bundle.min.mjs";
const SWIPER_CSS_URL = "https://cdn.jsdelivr.net/npm/swiper@14.2.0/swiper-bundle.min.css";
const REEL_CSS_URL = "./recipe-reel.css?v=4";
const SURFACE_SELECTOR = "#recipeList, .focused-recipe-results, .meal-recipe-results";
const REEL_CLASS = "recipe-swiper";
const WRAPPER_CLASS = "swiper-wrapper";
const SLIDE_CLASS = "swiper-slide";
const IMAGE_WINDOW_RADIUS = 3;

let swiperConstructorPromise = null;
const stateBySurface = new WeakMap();
const scheduled = new WeakSet();
const imageSyncScheduled = new WeakSet();
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

function rememberImageSource(image) {
  if (!(image instanceof HTMLImageElement)) return false;

  const src = image.getAttribute("src");
  if (!image.dataset.recipeReelSrc && src) image.dataset.recipeReelSrc = src;

  const srcset = image.getAttribute("srcset");
  if (!image.dataset.recipeReelSrcset && srcset) image.dataset.recipeReelSrcset = srcset;

  const sizes = image.getAttribute("sizes");
  if (!image.dataset.recipeReelSizes && sizes) image.dataset.recipeReelSizes = sizes;

  image.loading = "lazy";
  image.decoding = "async";
  return Boolean(image.dataset.recipeReelSrc);
}

function hydrateImage(image) {
  if (!rememberImageSource(image)) return;

  if (!image.getAttribute("src")) image.setAttribute("src", image.dataset.recipeReelSrc);
  if (image.dataset.recipeReelSrcset && !image.getAttribute("srcset")) {
    image.setAttribute("srcset", image.dataset.recipeReelSrcset);
  }
  if (image.dataset.recipeReelSizes && !image.getAttribute("sizes")) {
    image.setAttribute("sizes", image.dataset.recipeReelSizes);
  }
  image.classList.remove("recipe-reel-image-dormant");
}

function dehydrateImage(image) {
  if (!rememberImageSource(image)) return;

  image.removeAttribute("src");
  image.removeAttribute("srcset");
  image.removeAttribute("sizes");
  image.classList.add("recipe-reel-image-dormant");
}

function hydrateAllImages(surface) {
  surface.querySelectorAll("img").forEach(hydrateImage);
}

function dehydrateAllImages(surface) {
  surface.querySelectorAll("img").forEach(dehydrateImage);
}

function syncImageWindow(swiper) {
  if (!swiper || swiper.destroyed) return;
  const slides = [...(swiper.slides || [])];
  if (!slides.length) return;

  const activeIndex = Number.isInteger(swiper.activeIndex) ? swiper.activeIndex : 0;
  slides.forEach((slide, index) => {
    const shouldHydrate = Math.abs(index - activeIndex) <= IMAGE_WINDOW_RADIUS;
    slide.querySelectorAll("img").forEach((image) => {
      if (shouldHydrate) hydrateImage(image);
      else dehydrateImage(image);
    });
  });
}

function scheduleImageWindow(swiper) {
  if (!swiper || swiper.destroyed || imageSyncScheduled.has(swiper)) return;
  imageSyncScheduled.add(swiper);
  requestAnimationFrame(() => {
    imageSyncScheduled.delete(swiper);
    syncImageWindow(swiper);
  });
}

function primeImageWindow(surface, centerIndex = 0) {
  const slides = currentSlides(surface);
  slides.forEach((slide, index) => {
    const shouldHydrate = Math.abs(index - centerIndex) <= IMAGE_WINDOW_RADIUS;
    slide.querySelectorAll("img").forEach((image) => {
      if (shouldHydrate) hydrateImage(image);
      else dehydrateImage(image);
    });
  });
}

function restoreSurface(surface, { hydrateImages = true } = {}) {
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

  if (hydrateImages) hydrateAllImages(surface);
  else dehydrateAllImages(surface);
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
  primeImageWindow(surface);
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
    if (stateBySurface.has(surface)) restoreSurface(surface, { hydrateImages: false });
    else dehydrateAllImages(surface);
    return;
  }

  const directItems = directRecipeItems(surface);
  const existingSlides = currentSlides(surface);
  const existing = stateBySurface.get(surface);

  if (existing?.swiper && !existing.swiper.destroyed && existingSlides.length) {
    existing.swiper.updateSize();
    existing.swiper.updateSlides();
    scheduleImageWindow(existing.swiper);
    return;
  }

  if (existing) restoreSurface(surface);

  const items = directItems.length ? directItems : directRecipeItems(surface);
  if (items.length < 2) {
    hydrateAllImages(surface);
    return;
  }

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
    restoreSurface(surface, { hydrateImages: false });
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
      init(swiper) {
        surface.dataset.recipeReelReady = "true";
        syncImageWindow(swiper);
      },
      activeIndexChange(swiper) {
        scheduleImageWindow(swiper);
      },
      transitionEnd(swiper) {
        scheduleImageWindow(swiper);
      },
      touchEnd(swiper) {
        scheduleImageWindow(swiper);
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
    } else {
      if (stateBySurface.has(surface)) restoreSurface(surface, { hydrateImages: false });
      else dehydrateAllImages(surface);
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
