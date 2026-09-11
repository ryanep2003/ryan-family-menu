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
// Deliberately uses the browser's own touch scrolling and momentum instead of custom swipe physics.
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

    #recipeList.recipe-native-reel,
    .focused-recipe-results.recipe-native-reel,
    .meal-recipe-results.recipe-native-reel {
      --card-w: min(72vw, 292px);
      --card-h: min(84vw, 342px);
      display: flex !important;
      align-items: flex-end !important;
      gap: 16px !important;
      width: 100% !important;
      min-width: 0 !important;
      height: clamp(420px, 108vw, 525px) !important;
      min-height: 420px !important;
      margin-top: 12px !important;
      padding: 28px max(14vw, calc((100% - var(--card-w)) / 2)) 38px !important;
      overflow-x: auto !important;
      overflow-y: hidden !important;
      box-sizing: border-box !important;
      overscroll-behavior-x: contain;
      -webkit-overflow-scrolling: touch;
      touch-action: pan-x pan-y;
      scroll-snap-type: x proximity;
      scroll-padding-inline: max(14vw, calc((100% - var(--card-w)) / 2));
      scrollbar-width: none;
      border-radius: 24px;
      background: linear-gradient(180deg, #fbfaf7 0%, #f5f7f8 54%, #edf1f3 100%) !important;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.88), inset 0 -1px 0 rgba(26,58,92,.04);
      position: relative !important;
    }

    #recipeList.recipe-native-reel::-webkit-scrollbar,
    .focused-recipe-results.recipe-native-reel::-webkit-scrollbar,
    .meal-recipe-results.recipe-native-reel::-webkit-scrollbar { display: none; }

    #recipeList.recipe-native-reel > *,
    .focused-recipe-results.recipe-native-reel > *,
    .meal-recipe-results.recipe-native-reel > * {
      --reel-scale: .88;
      --reel-opacity: .68;
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
      scroll-snap-align: center;
      transform: scale(var(--reel-scale)) !important;
      transform-origin: 50% 100% !important;
      opacity: var(--reel-opacity) !important;
      transition: transform 120ms linear, opacity 120ms linear, filter 120ms linear !important;
      filter: saturate(.88) brightness(.99);
      overflow: hidden !important;
    }

    #recipeList.recipe-native-reel > .reel-active,
    .focused-recipe-results.recipe-native-reel > .reel-active,
    .meal-recipe-results.recipe-native-reel > .reel-active {
      --reel-scale: 1;
      --reel-opacity: 1;
      filter: none;
      z-index: 3;
      box-shadow: 0 22px 52px rgba(26,58,92,.17), 0 3px 12px rgba(26,58,92,.08) !important;
    }

    #recipeList.recipe-native-reel > .recipe-browse-card,
    .focused-recipe-results.recipe-native-reel > .focused-recipe-result,
    .meal-recipe-results.recipe-native-reel > .meal-recipe-result {
      display: grid !important;
      grid-template-rows: 1fr auto !important;
      gap: 8px !important;
      padding: 12px !important;
      border: 1px solid rgba(26,58,92,.10) !important;
      border-radius: 22px !important;
      background: rgba(255,255,255,.97) !important;
      color: var(--ink) !important;
      text-align: left !important;
      backdrop-filter: blur(8px);
    }

    #recipeList.recipe-native-reel > .recipe-browse-card .recipe-card {
      display: grid !important;
      grid-template-columns: 1fr !important;
      grid-template-rows: 164px auto !important;
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
      height: 164px !important;
      min-height: 164px !important;
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
        --card-w: 316px;
        --card-h: 368px;
        gap: 20px !important;
        height: 555px !important;
        padding-bottom: 44px !important;
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
    const halfWidth = Math.max(1, surfaceRect.width * .58);
    let closest = null;
    let closestDistance = Infinity;

    items.forEach((item) => {
      const rect = item.getBoundingClientRect();
      const itemCenter = rect.left + rect.width / 2;
      const pxDistance = Math.abs(itemCenter - center);
      const normalized = Math.min(1.5, pxDistance / halfWidth);
      const scale = Math.max(.84, 1 - normalized * .11);
      const opacity = Math.max(.56, 1 - normalized * .28);
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
  requestAnimationFrame(enhanceAll);
}

installRecipeGravityFieldPrototype();