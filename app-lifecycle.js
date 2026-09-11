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

// Experimental recipe plane field. UI-only: search, recipe data, and persistence stay authoritative.
function installRecipeGravityFieldPrototype() {
  if (typeof document === "undefined" || document.documentElement.dataset.recipeGravityInstalled) return;
  document.documentElement.dataset.recipeGravityInstalled = "true";

  const style = document.createElement("style");
  style.id = "recipeGravityFieldStyles";
  style.textContent = `
    #recipesView:not(.detail-open) #recipePicksSection { display: none !important; }
    #recipesView:not(.detail-open) #recipeBrowse { border-top: 0; }
    #recipesView:not(.detail-open) #recipeBrowse > summary { display: none; }
    #recipesView:not(.detail-open) #recipeBrowse .recipe-browse-content { display: block; }

    .recipe-gravity-field {
      --gravity-height: clamp(430px, 116vw, 560px);
      --card-w: min(72vw, 292px);
      --card-h: min(86vw, 350px);
      position: relative !important;
      display: block !important;
      width: 100%;
      height: var(--gravity-height) !important;
      min-height: 430px !important;
      margin-top: 12px;
      overflow: hidden !important;
      perspective: 1150px;
      perspective-origin: 50% 50%;
      touch-action: none;
      isolation: isolate;
      border-radius: 24px;
      background: radial-gradient(circle at 50% 50%, rgba(175,203,255,.16), rgba(207,232,213,.06) 34%, transparent 70%);
    }

    .recipe-gravity-field > .gravity-node {
      --gx: 0px;
      --gy: 0px;
      --gz: 0px;
      --gs: 1;
      --go: 1;
      position: absolute !important;
      top: 50% !important;
      left: 50% !important;
      right: auto !important;
      bottom: auto !important;
      z-index: var(--gzi, 1) !important;
      width: var(--card-w) !important;
      height: var(--card-h) !important;
      min-height: var(--card-h) !important;
      max-width: none !important;
      margin: 0 !important;
      overflow: hidden !important;
      opacity: var(--go) !important;
      visibility: visible !important;
      transform: translate3d(calc(-50% + var(--gx)), calc(-50% + var(--gy)), var(--gz)) scale(var(--gs)) !important;
      transform-origin: center;
      transition: transform 230ms cubic-bezier(.2,.78,.18,1), opacity 180ms ease, filter 180ms ease !important;
      backface-visibility: hidden;
      will-change: transform, opacity;
      filter: saturate(.76) brightness(.98);
      box-sizing: border-box !important;
    }
    .recipe-gravity-field.is-dragging > .gravity-node { transition: none !important; }
    .recipe-gravity-field > .gravity-node.gravity-active {
      filter: none;
      box-shadow: 0 18px 44px rgba(26,58,92,.18);
    }
    .recipe-gravity-field > .gravity-node:not(.gravity-active) { cursor: pointer; }
    .recipe-gravity-field > .gravity-node[aria-hidden="true"] { pointer-events: none; }

    #recipeList.recipe-gravity-field > .recipe-browse-card,
    .focused-recipe-results.recipe-gravity-field > .focused-recipe-result,
    .meal-recipe-results.recipe-gravity-field > .meal-recipe-result {
      display: grid !important;
      grid-template-rows: 1fr auto !important;
      gap: 8px !important;
      padding: 12px !important;
      border: 1px solid var(--rule) !important;
      border-radius: 20px !important;
      background: var(--paper) !important;
      color: var(--ink) !important;
      text-align: left !important;
      box-sizing: border-box !important;
    }

    #recipeList.recipe-gravity-field > .recipe-browse-card .recipe-card {
      display: grid !important;
      grid-template-columns: 1fr !important;
      grid-template-rows: 166px auto !important;
      gap: 8px !important;
      min-height: 0 !important;
      height: 100% !important;
      padding: 0 !important;
      border: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
      overflow: hidden;
    }
    #recipeList.recipe-gravity-field .recipe-photo-shell,
    .focused-recipe-results.recipe-gravity-field .recipe-photo-shell,
    .meal-recipe-results.recipe-gravity-field .recipe-photo-shell {
      width: 100% !important;
      height: 166px !important;
      min-height: 166px !important;
      border-radius: 14px !important;
      overflow: hidden !important;
    }
    #recipeList.recipe-gravity-field .recipe-photo-shell img,
    .focused-recipe-results.recipe-gravity-field .recipe-photo-shell img,
    .meal-recipe-results.recipe-gravity-field .recipe-photo-shell img {
      width: 100% !important;
      height: 100% !important;
      object-fit: cover !important;
    }
    #recipeList.recipe-gravity-field .recipe-card h3,
    #recipeList.recipe-gravity-field .recipe-card p,
    #recipeList.recipe-gravity-field .category-pill { grid-column: 1 !important; }
    #recipeList.recipe-gravity-field > .recipe-browse-card:not(.gravity-active) .recipe-add-meal { opacity: .2; pointer-events: none; }

    .recipe-gravity-field .gravity-active::after {
      content: "";
      position: absolute;
      inset: -7px;
      z-index: -1;
      border-radius: 26px;
      border: 1px solid rgba(175,203,255,.52);
      box-shadow: 0 0 30px rgba(175,203,255,.2);
      pointer-events: none;
    }

    @media (min-width: 760px) {
      .recipe-gravity-field { --gravity-height: 570px; --card-w: 316px; --card-h: 372px; }
    }

    @media (prefers-reduced-motion: reduce) {
      .recipe-gravity-field {
        display: flex !important;
        position: relative !important;
        height: auto !important;
        min-height: 0 !important;
        gap: 12px;
        overflow-x: auto !important;
        perspective: none;
        scroll-snap-type: x mandatory;
        touch-action: pan-x pan-y;
        padding: 8px 0 16px !important;
        background: transparent;
      }
      .recipe-gravity-field > .gravity-node {
        position: relative !important;
        top: auto !important;
        left: auto !important;
        flex: 0 0 var(--card-w);
        width: var(--card-w) !important;
        height: var(--card-h) !important;
        opacity: 1 !important;
        transform: none !important;
        filter: none !important;
        transition: none !important;
        scroll-snap-align: center;
      }
    }
  `;
  document.head.append(style);

  const fieldState = new WeakMap();
  const surfaceSelector = "#recipeList, .focused-recipe-results, .meal-recipe-results";
  const planeSlots = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
    { x: 2, y: 0 },
    { x: -2, y: 0 },
    { x: 0, y: 2 },
    { x: 0, y: -2 },
    { x: 1, y: 1 },
    { x: -1, y: 1 },
    { x: 1, y: -1 },
    { x: -1, y: -1 },
  ];

  function nodesFor(surface) {
    if (surface.id === "recipeList") return [...surface.querySelectorAll(":scope > .recipe-browse-card")];
    if (surface.classList.contains("focused-recipe-results")) return [...surface.querySelectorAll(":scope > .focused-recipe-result")];
    return [...surface.querySelectorAll(":scope > .meal-recipe-result")];
  }

  function signedOffset(index, active, length) {
    let offset = index - active;
    if (length > 2) {
      const wrapped = offset > 0 ? offset - length : offset + length;
      if (Math.abs(wrapped) < Math.abs(offset)) offset = wrapped;
    }
    return offset;
  }

  function slotForOffset(offset) {
    if (offset === 0) return planeSlots[0];
    const distance = Math.abs(offset);
    const base = 1 + ((distance - 1) % (planeSlots.length - 1));
    const slot = planeSlots[base];
    return offset < 0 ? { x: -slot.x, y: -slot.y } : slot;
  }

  function layoutSurface(surface) {
    const nodes = nodesFor(surface);
    if (!nodes.length) {
      surface.classList.remove("recipe-gravity-field", "is-dragging");
      return;
    }
    surface.classList.add("recipe-gravity-field");
    surface.classList.remove("recipe-wheel-list");

    let state = fieldState.get(surface);
    if (!state) {
      state = { active: 0, axis: null, progress: 0, pointer: null, suppressClick: false, signature: "" };
      fieldState.set(surface, state);
    }

    const signature = nodes.map((node) => node.dataset.recipeId || node.dataset.focusedRecipe || node.querySelector("[data-open]")?.dataset.open || node.textContent?.slice(0, 40)).join("|");
    if (state.signature !== signature) {
      state.active = 0;
      state.axis = null;
      state.progress = 0;
      state.signature = signature;
    }
    state.active = Math.max(0, Math.min(state.active, nodes.length - 1));

    const width = Math.max(320, surface.clientWidth || 360);
    const height = Math.max(430, surface.clientHeight || 500);
    const stepX = Math.min(205, width * .56);
    const stepY = Math.min(215, height * .42);
    const dragX = state.axis === "x" ? state.progress * stepX : 0;
    const dragY = state.axis === "y" ? state.progress * stepY : 0;

    nodes.forEach((node, index) => {
      node.classList.add("gravity-node");
      const offset = signedOffset(index, state.active, nodes.length);
      const slot = slotForOffset(offset);
      const x = slot.x * stepX + dragX;
      const y = slot.y * stepY + dragY;
      const planeDistance = Math.abs(slot.x) + Math.abs(slot.y);
      const depth = offset === 0 ? 0 : -Math.min(360, 110 + planeDistance * 70);
      const scale = offset === 0 ? 1 : Math.max(.62, .84 - planeDistance * .06);
      const opacity = offset === 0 ? 1 : Math.max(.22, .78 - planeDistance * .13);
      const hidden = planeDistance > 3 || Math.abs(offset) > 12;

      node.style.setProperty("--gx", `${x}px`);
      node.style.setProperty("--gy", `${y}px`);
      node.style.setProperty("--gz", `${depth}px`);
      node.style.setProperty("--gs", `${scale}`);
      node.style.setProperty("--go", hidden ? "0" : `${opacity}`);
      node.style.setProperty("--gzi", `${offset === 0 ? 30 : Math.max(1, 18 - planeDistance * 3)}`);
      node.classList.toggle("gravity-active", offset === 0);
      node.setAttribute("aria-hidden", `${hidden}`);
      if (offset === 0) node.setAttribute("data-gravity-active", "true");
      else node.removeAttribute("data-gravity-active");
      node.querySelectorAll("button").forEach((button) => { button.tabIndex = offset === 0 ? 0 : -1; });
      if (node.matches("button")) node.tabIndex = offset === 0 ? 0 : -1;
    });
  }

  function enhanceAll() {
    document.querySelectorAll(surfaceSelector).forEach(layoutSurface);
  }

  function surfaceFromEvent(event) {
    return event.target?.closest?.(surfaceSelector) || null;
  }

  document.addEventListener("pointerdown", (event) => {
    const surface = surfaceFromEvent(event);
    if (!surface?.classList.contains("recipe-gravity-field")) return;
    const state = fieldState.get(surface);
    if (!state) return;
    state.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, axis: null, moved: false };
    state.axis = null;
    state.progress = 0;
    surface.classList.add("is-dragging");
    surface.setPointerCapture?.(event.pointerId);
  }, true);

  document.addEventListener("pointermove", (event) => {
    const surface = surfaceFromEvent(event);
    const state = surface ? fieldState.get(surface) : null;
    if (!state?.pointer || state.pointer.id !== event.pointerId) return;
    const dx = event.clientX - state.pointer.x;
    const dy = event.clientY - state.pointer.y;
    if (!state.pointer.axis) {
      if (Math.hypot(dx, dy) < 10) return;
      state.pointer.axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
      state.axis = state.pointer.axis;
    }
    state.pointer.moved = true;
    event.preventDefault();
    const primary = state.pointer.axis === "x" ? dx : dy;
    const denominator = state.pointer.axis === "x"
      ? Math.min(205, Math.max(320, surface.clientWidth || 360) * .56)
      : Math.min(215, Math.max(430, surface.clientHeight || 500) * .42);
    state.progress = Math.max(-1.15, Math.min(1.15, primary / Math.max(1, denominator)));
    layoutSurface(surface);
  }, { capture: true, passive: false });

  function finishPointer(event) {
    const surface = surfaceFromEvent(event);
    const state = surface ? fieldState.get(surface) : null;
    if (!state?.pointer || state.pointer.id !== event.pointerId) return;
    const moved = state.pointer.moved;
    const axis = state.pointer.axis;
    const progress = state.progress;
    const nodes = nodesFor(surface);
    state.pointer = null;
    surface.classList.remove("is-dragging");

    if (moved && axis && Math.abs(progress) > .22 && nodes.length > 1) {
      const direction = progress < 0 ? 1 : -1;
      state.active = (state.active + direction + nodes.length) % nodes.length;
      state.suppressClick = true;
      globalThis.setTimeout?.(() => { state.suppressClick = false; }, 180);
    }
    state.axis = null;
    state.progress = 0;
    layoutSurface(surface);
  }

  document.addEventListener("pointerup", finishPointer, true);
  document.addEventListener("pointercancel", finishPointer, true);

  document.addEventListener("click", (event) => {
    const surface = surfaceFromEvent(event);
    const state = surface ? fieldState.get(surface) : null;
    if (!state) return;
    if (state.suppressClick) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    const nodes = nodesFor(surface);
    const node = event.target.closest?.(".gravity-node");
    const index = node ? nodes.indexOf(node) : -1;
    if (index < 0 || index === state.active) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    state.active = index;
    state.axis = null;
    state.progress = 0;
    layoutSurface(surface);
  }, true);

  document.addEventListener("keydown", (event) => {
    const surface = surfaceFromEvent(event);
    const state = surface ? fieldState.get(surface) : null;
    if (!state || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    const nodes = nodesFor(surface);
    if (!nodes.length) return;
    event.preventDefault();
    if (event.key === "Home") state.active = 0;
    else if (event.key === "End") state.active = nodes.length - 1;
    else {
      const direction = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
      state.active = (state.active + direction + nodes.length) % nodes.length;
    }
    state.axis = null;
    state.progress = 0;
    layoutSurface(surface);
    nodesFor(surface)[state.active]?.focus?.({ preventScroll: true });
  }, true);

  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      enhanceAll();
    });
  });
  observer.observe(document.documentElement, { subtree: true, childList: true });
  window.addEventListener("resize", enhanceAll, { passive: true });
  requestAnimationFrame(enhanceAll);
}

installRecipeGravityFieldPrototype();