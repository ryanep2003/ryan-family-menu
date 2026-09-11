export function installInstructions(userAgent, t) {
  const isAndroid = /Android/i.test(userAgent || "");
  const isIos = /iPhone|iPad|iPod/i.test(userAgent || "");
  if (isAndroid) return t("installInstructionsAndroid");
  if (isIos) return t("installInstructionsIos");
  return t("installInstructions");
}

const INSTALL_DISMISSED_KEY = "dinner-install-prompt-dismissed";

export function bindInstallPrompt({
  $,
  t,
  windowObject = window,
  navigatorObject = navigator,
  storage = localStorage,
}) {
  let deferredPrompt = null;
  const prompt = $("#installPrompt");

  function isDismissed() {
    try {
      return storage.getItem(INSTALL_DISMISSED_KEY) === "true";
    } catch {
      return false;
    }
  }

  function isStandalone() {
    return Boolean(
      navigatorObject.standalone
      || windowObject.matchMedia?.("(display-mode: standalone)").matches
    );
  }

  function dismiss() {
    prompt.hidden = true;
    canSuggest = false;
    try {
      storage.setItem(INSTALL_DISMISSED_KEY, "true");
    } catch {
      // Installation remains optional when browser storage is unavailable.
    }
  }

  let canSuggest = !isDismissed() && !isStandalone();
  const isIos = /iPhone|iPad|iPod/i.test(navigatorObject.userAgent || "");
  prompt.hidden = !(canSuggest && isIos);

  windowObject.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    if (!canSuggest) return;
    deferredPrompt = event;
    prompt.hidden = false;
  });

  $("#installButton").addEventListener("click", async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      deferredPrompt = null;
      if (choice?.outcome === "accepted") dismiss();
      return;
    }

    windowObject.alert(installInstructions(navigatorObject.userAgent, t));
    dismiss();
  });

  $("#dismissInstall").addEventListener("click", dismiss);
  windowObject.addEventListener("appinstalled", dismiss);
}

export function registerServiceWorker({ $, onUpdateAvailable }) {
  $("#refreshApp").addEventListener("click", () => {
    window.location.reload();
  });

  if (!("serviceWorker" in navigator)) return;

  let hadController = Boolean(navigator.serviceWorker.controller);
  let registrationRef = null;
  let lastUpdateCheck = 0;
  const updateCheckWindow = 5 * 60 * 1000;

  function checkForUpdate() {
    if (!registrationRef) return;
    const now = Date.now();
    if (now - lastUpdateCheck < updateCheckWindow) return;
    lastUpdateCheck = now;
    registrationRef.update().catch(() => {
      // A suspended or offline device can fail this check; the cached app remains usable.
    });
  }

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadController) onUpdateAvailable();
    hadController = true;
  });

  navigator.serviceWorker.register("service-worker.js").then((registration) => {
    registrationRef = registration;
    checkForUpdate();
    window.addEventListener("focus", checkForUpdate);
    window.addEventListener("online", checkForUpdate);
    if (registration.waiting && navigator.serviceWorker.controller) {
      onUpdateAvailable();
    }

    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          onUpdateAvailable();
        }
      });
    });
  });
}

// Native mobile recipe reel prototype.
// Browser-native scrolling owns touch physics; JS only provides visual focus.
function installRecipeGravityFieldPrototype() {
  if (typeof document === "undefined" || document.documentElement.dataset.recipeGravityInstalled) return;
  document.documentElement.dataset.recipeGravityInstalled = "true";

  const surfaceSelector = "#recipeList, .focused-recipe-results, .meal-recipe-results";

  const style = document.createElement("style");
  style.id = "recipeGravityFieldStyles";
  style.textContent = `
    #recipesView:not(.detail-open) #recipePicksSection { display: none !important; }
    #recipesView:not(.detail-open) #recipeBrowse { border-top: 0; }
    #recipesView:not(.detail-open) #recipeBrowse > summary { display: none; }
    #recipesView:not(.detail-open) #recipeBrowse .recipe-browse-content { display: block; }

    #recipeList,
    .focused-recipe-results,
    .meal-recipe-results {
      background: #f4f5f5 !important;
      background-image: none !important;
    }
    #recipeList::before,
    #recipeList::after,
    .focused-recipe-results::before,
    .focused-recipe-results::after,
    .meal-recipe-results::before,
    .meal-recipe-results::after {
      display: none !important;
      content: none !important;
    }

    #recipeList.recipe-native-reel,
    .focused-recipe-results.recipe-native-reel,
    .meal-recipe-results.recipe-native-reel {
      --card-w: min(82vw, 320px);
      --card-h: min(90vw, 364px);
      display: flex !important;
      align-items: flex-end !important;
      gap: 42px !important;
      width: 100% !important;
      min-width: 0 !important;
      height: clamp(408px, 101vw, 500px) !important;
      min-height: 408px !important;
      margin-top: 12px !important;
      padding: 20px max(9vw, calc((100% - var(--card-w)) / 2)) 30px !important;
      overflow-x: auto !important;
      overflow-y: hidden !important;
      box-sizing: border-box !important;
      overscroll-behavior-x: contain;
      -webkit-overflow-scrolling: touch;
      touch-action: pan-x pan-y;
      scroll-snap-type: none !important;
      scrollbar-width: none;
      border-radius: 24px;
      background: #f4f5f5 !important;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.94), inset 0 -1px 0 rgba(26,58,92,.025);
      position: relative !important;
    }

    #recipeList.recipe-native-reel::-webkit-scrollbar,
    .focused-recipe-results.recipe-native-reel::-webkit-scrollbar,
    .meal-recipe-results.recipe-native-reel::-webkit-scrollbar { display: none; }

    #recipeList.recipe-native-reel > *,
    .focused-recipe-results.recipe-native-reel > *,
    .meal-recipe-results.recipe-native-reel > * {
      --reel-scale: .68;
      --reel-opacity: .14;
      position: relative !important;
      inset: auto !important;
      flex: 0 0 var(--card-w) !important;
      width: var(--card-w) !important;
      min-width: var(--card-w) !important;
      max-width: var(--card-w) !important;
      height: var(--card-h) !important;
      min-height: var(--card-h) !important;
      margin: 0 !important;
      box-sizing: border-box !important;
      scroll-snap-align: none !important;
      transform: scale(var(--reel-scale)) !important;
      transform-origin: 50% 100% !important;
      opacity: var(--reel-opacity) !important;
      transition: transform 70ms linear, opacity 70ms linear, filter 70ms linear !important;
      filter: saturate(.72) brightness(1.03);
      overflow: hidden !important;
    }

    #recipeList.recipe-native-reel > .reel-active,
    .focused-recipe-results.recipe-native-reel > .reel-active,
    .meal-recipe-results.recipe-native-reel > .reel-active {
      --reel-scale: 1;
      --reel-opacity: 1;
      filter: none;
      z-index: 3;
      box-shadow: 0 18px 42px rgba(26,58,92,.14), 0 2px 8px rgba(26,58,92,.06) !important;
    }

    #recipeList.recipe-native-reel > .recipe-browse-card,
    .focused-recipe-results.recipe-native-reel > .focused-recipe-result,
    .meal-recipe-results.recipe-native-reel > .meal-recipe-result {
      display: grid !important;
      grid-template-rows: 1fr auto !important;
      gap: 8px !important;
      padding: 12px !important;
      border: 1px solid rgba(26,58,92,.07) !important;
      border-radius: 22px !important;
      background: rgba(255,255,255,.995) !important;
      color: var(--ink) !important;
      text-align: left !important;
      backdrop-filter: none !important;
    }

    #recipeList.recipe-native-reel > .recipe-browse-card .recipe-card {
      display: grid !important;
      grid-template-columns: 1fr !important;
      grid-template-rows: 168px auto !important;
      gap: 8px !important;
      min-height: 0 !important;
      height: 100% !important;
      padding: 0 !important;
      border: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
      overflow: hidden;
    }

    #recipeList.recipe-native-reel .recipe-photo-shell,
    .focused-recipe-results.recipe-native-reel .recipe-photo-shell,
    .meal-recipe-results.recipe-native-reel .recipe-photo-shell {
      width: 100% !important;
      height: 168px !important;
      min-height: 168px !important;
      border-radius: 15px !important;
      overflow: hidden !important;
    }

    #recipeList.recipe-native-reel .recipe-photo-shell img,
    .focused-recipe-results.recipe-native-reel .recipe-photo-shell img,
    .meal-recipe-results.recipe-native-reel .recipe-photo-shell img {
      width: 100% !important;
      height: 100% !important;
      object-fit: cover !important;
    }

    #recipeList.recipe-native-reel .recipe-card h3,
    #recipeList.recipe-native-reel .recipe-card p,
    #recipeList.recipe-native-reel .category-pill { grid-column: 1 !important; }

    @media (min-width: 760px) {
      #recipeList.recipe-native-reel,
      .focused-recipe-results.recipe-native-reel,
      .meal-recipe-results.recipe-native-reel {
        --card-w: 330px;
        --card-h: 380px;
        gap: 48px !important;
        height: 540px !important;
        padding-bottom: 40px !important;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      #recipeList.recipe-native-reel > *,
      .focused-recipe-results.recipe-native-reel > *,
      .meal-recipe-results.recipe-native-reel > * {
        transform: none !important;
        opacity: 1 !important;
        transition: none !important;
        filter: none !important;
      }
    }
  `;
  document.head.append(style);

  const scheduledSurfaces = new WeakSet();

  function itemsFor(surface) {
    return [...surface.children].filter((node) => node.nodeType === 1);
  }

  function updateFocus(surface) {
    const items = itemsFor(surface);
    if (!items.length) return;

    const surfaceRect = surface.getBoundingClientRect();
    const center = surfaceRect.left + surfaceRect.width / 2;
    const focusRadius = Math.max(1, surfaceRect.width * .34);
    let closest = null;
    let closestDistance = Infinity;

    items.forEach((item) => {
      const rect = item.getBoundingClientRect();
      const itemCenter = rect.left + rect.width / 2;
      const pxDistance = Math.abs(itemCenter - center);
      const normalized = Math.min(1, pxDistance / focusRadius);
      const focus = 1 - normalized;
      const scale = .68 + .32 * (focus ** 2.1);
      const opacity = .14 + .86 * (focus ** 2.4);
      item.style.setProperty("--reel-scale", `${scale}`);
      item.style.setProperty("--reel-opacity", `${opacity}`);
      if (pxDistance < closestDistance) {
        closestDistance = pxDistance;
        closest = item;
      }
    });

    items.forEach((item) => item.classList.toggle("reel-active", item === closest));
  }

  function scheduleFocus(surface) {
    if (scheduledSurfaces.has(surface)) return;
    scheduledSurfaces.add(surface);
    requestAnimationFrame(() => {
      scheduledSurfaces.delete(surface);
      updateFocus(surface);
    });
  }

  function enhanceSurface(surface) {
    const items = itemsFor(surface);
    if (!items.length) return;
    if (!surface.classList.contains("recipe-native-reel")) {
      surface.classList.remove("recipe-gravity-field", "recipe-wheel-list");
      surface.classList.add("recipe-native-reel");
      surface.addEventListener("scroll", () => scheduleFocus(surface), { passive: true });
      surface.addEventListener("scrollend", () => scheduleFocus(surface), { passive: true });
    }
    scheduleFocus(surface);
  }

  function enhanceAll() {
    document.querySelectorAll(surfaceSelector).forEach(enhanceSurface);
  }

  let mutationScheduled = false;
  const observer = new MutationObserver(() => {
    if (mutationScheduled) return;
    mutationScheduled = true;
    requestAnimationFrame(() => {
      mutationScheduled = false;
      enhanceAll();
    });
  });

  observer.observe(document.documentElement, { subtree: true, childList: true });
  window.addEventListener("resize", enhanceAll, { passive: true });
  enhanceAll();
  requestAnimationFrame(enhanceAll);
}

installRecipeGravityFieldPrototype();
