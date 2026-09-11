const SWIPER_URL = "https://cdn.jsdelivr.net/npm/swiper@14.2.0/swiper-bundle.min.mjs";
const SURFACE_SELECTOR = "#recipeList, .focused-recipe-results, .meal-recipe-results";
const REEL_CLASS = "recipe-swiper";
const WRAPPER_CLASS = "swiper-wrapper";
const SLIDE_CLASS = "swiper-slide";

let swiperConstructorPromise = null;
const stateBySurface = new WeakMap();
const scheduled = new WeakSet();

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

function restoreSurface(surface) {
  const state = stateBySurface.get(surface);
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
  const directItems = directRecipeItems(surface);
  const existingSlides = currentSlides(surface);
  const existing = stateBySurface.get(surface);

  // Already mounted and still structurally intact. Swiper can refresh in place.
  if (existing?.swiper && !existing.swiper.destroyed && existingSlides.length) {
    existing.swiper.update();
    return;
  }

  if (existing) restoreSurface(surface);

  // A renderer may have just replaced the surface contents.
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

  if (!document.contains(surface)) return;

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
    watchSlidesProgress: true,
    effect: "coverflow",
    freeMode: {
      enabled: true,
      momentum: true,
      momentumRatio: 1.55,
      momentumVelocityRatio: 1.25,
      minimumVelocity: 0.015,
      momentumBounce: true,
      momentumBounceRatio: 0.65,
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
        swiper.update();
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

function scheduleAll() {
  document.querySelectorAll(SURFACE_SELECTOR).forEach(scheduleSurface);
}

export function installRecipeReels() {
  if (document.documentElement.dataset.recipeReelsInstalled === "true") return;
  document.documentElement.dataset.recipeReelsInstalled = "true";

  const observer = new MutationObserver((mutations) => {
    const touched = new Set();
    mutations.forEach((mutation) => {
      const targetSurface = mutation.target.closest?.(SURFACE_SELECTOR);
      if (targetSurface) touched.add(targetSurface);
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        if (node.matches?.(SURFACE_SELECTOR)) touched.add(node);
        node.querySelectorAll?.(SURFACE_SELECTOR).forEach((surface) => touched.add(surface));
      });
    });
    touched.forEach(scheduleSurface);
  });

  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("resize", scheduleAll, { passive: true });
  scheduleAll();
}

installRecipeReels();
