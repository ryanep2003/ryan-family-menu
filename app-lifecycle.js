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

// Experimental inertial recipe reel. UI-only: search, recipe data, and persistence stay authoritative.
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
      touch-action: pan-y;
      isolation: isolate;
      border-radius: 24px;
      background: radial-gradient(circle at 50% 50%, rgba(175,203,255,.16), rgba(207,232,213,.06) 34%, transparent 70%);
    }

    .recipe-gravity-field > .gravity-node {
      --gx: 0px;
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
      transform: translate3d(calc(-50% + var(--gx)), -50%, var(--gz)) scale(var(--gs)) !important;
      transform-origin: center;
      transition: opacity 120ms linear, filter 120ms linear !important;
      backface-visibility: hidden;
      will-change: transform, opacity;
      filter: saturate(.76) brightness(.98);
      box-sizing: border-box !important;
    }
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

  function nodesFor(surface) {
    if (surface.id === "recipeList") return [...surface.querySelectorAll(":scope > .recipe-browse-card")];
    if (surface.classList.contains("focused-recipe-results")) return [...surface.querySelectorAll(":scope > .focused-recipe-result")];
    return [...surface.querySelectorAll(":scope > .meal-recipe-result")];
  }

  function mod(value, length) {
    return ((value % length) + length) % length;
  }

  function wrappedDelta(index, position, length) {
    let delta = index - position;
    while (delta > length / 2) delta -= length;
    while (delta < -length / 2) delta += length;
    return delta;
  }

  function stepFor(surface) {
    return Math.min(184, Math.max(320, surface.clientWidth || 360) * .50);
  }

  function getState(surface) {
    let state = fieldState.get(surface);
    if (!state) {
      state = {
        position: 0,
        pointer: null,
        suppressClick: false,
        signature: "",
        animationFrame: null,
      };
      fieldState.set(surface, state);
    }
    return state;
  }

  function cancelAnimation(state) {
    if (state.animationFrame != null) cancelAnimationFrame(state.animationFrame);
    state.animationFrame = null;
  }

  function layoutSurface(surface) {
    const nodes = nodesFor(surface);
    if (!nodes.length) {
      surface.classList.remove("recipe-gravity-field");
      return;
    }
    surface.classList.add("recipe-gravity-field");
    surface.classList.remove("recipe-wheel-list");

    const state = getState(surface);
    const signature = nodes.map((node) => node.dataset.recipeId || node.dataset.focusedRecipe || node.querySelector("[data-open]")?.dataset.open || node.textContent?.slice(0, 40)).join("|");
    if (state.signature !== signature) {
      cancelAnimation(state);
      state.position = 0;
      state.pointer = null;
      state.signature = signature;
    }

    const step = stepFor(surface);
    const activeIndex = mod(Math.round(state.position), nodes.length);

    nodes.forEach((node, index) => {
      node.classList.add("gravity-node");
      const delta = wrappedDelta(index, state.position, nodes.length);
      const distance = Math.abs(delta);
      const x = delta * step;
      const depth = distance < .5 ? 0 : -Math.min(420, 80 + distance * 54);
      const scale = Math.max(.54, 1 - distance * .105);
      const opacity = Math.max(.10, 1 - distance * .18);
      const hidden = distance > 5.6;
      const active = index === activeIndex && Math.abs(delta) < .55;

      node.style.setProperty("--gx", `${x}px`);
      node.style.setProperty("--gz", `${depth}px`);
      node.style.setProperty("--gs", `${scale}`);
      node.style.setProperty("--go", hidden ? "0" : `${opacity}`);
      node.style.setProperty("--gzi", `${active ? 30 : Math.max(1, 22 - Math.round(distance * 3))}`);
      node.classList.toggle("gravity-active", active);
      node.setAttribute("aria-hidden", `${hidden}`);
      if (active) node.setAttribute("data-gravity-active", "true");
      else node.removeAttribute("data-gravity-active");
      node.querySelectorAll("button").forEach((button) => { button.tabIndex = active ? 0 : -1; });
      if (node.matches("button")) node.tabIndex = active ? 0 : -1;
    });
  }

  function animateTo(surface, target, duration = 650) {
    const state = getState(surface);
    cancelAnimation(state);
    const start = state.position;
    const distance = target - start;
    if (Math.abs(distance) < .001) {
      state.position = target;
      layoutSurface(surface);
      return;
    }
    const startedAt = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - ((1 - t) ** 4);
      state.position = start + distance * eased;
      layoutSurface(surface);
      if (t < 1) state.animationFrame = requestAnimationFrame(tick);
      else {
        state.position = target;
        state.animationFrame = null;
        layoutSurface(surface);
      }
    };
    state.animationFrame = requestAnimationFrame(tick);
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
    const state = getState(surface);
    cancelAnimation(state);
    const now = performance.now();
    state.pointer = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startPosition: state.position,
      lastX: event.clientX,
      lastTime: now,
      velocityX: 0,
      horizontal: false,
      rejected: false,
      moved: false,
    };
  }, true);

  document.addEventListener("pointermove", (event) => {
    const surface = surfaceFromEvent(event);
    const state = surface ? fieldState.get(surface) : null;
    const pointer = state?.pointer;
    if (!pointer || pointer.id !== event.pointerId || pointer.rejected) return;

    const dx = event.clientX - pointer.startX;
    const dy = event.clientY - pointer.startY;
    if (!pointer.horizontal) {
      if (Math.hypot(dx, dy) < 8) return;
      if (Math.abs(dy) > Math.abs(dx) * 1.05) {
        pointer.rejected = true;
        return;
      }
      if (Math.abs(dx) < Math.abs(dy) * 1.12) return;
      pointer.horizontal = true;
      surface.setPointerCapture?.(event.pointerId);
    }

    event.preventDefault();
    pointer.moved = true;
    const now = performance.now();
    const dt = Math.max(8, now - pointer.lastTime);
    const instantaneous = (event.clientX - pointer.lastX) / dt;
    pointer.velocityX = pointer.velocityX * .68 + instantaneous * .32;
    pointer.lastX = event.clientX;
    pointer.lastTime = now;

    state.position = pointer.startPosition - (dx / stepFor(surface));
    layoutSurface(surface);
  }, { capture: true, passive: false });

  function finishPointer(event) {
    const surface = surfaceFromEvent(event);
    const state = surface ? fieldState.get(surface) : null;
    const pointer = state?.pointer;
    if (!pointer || pointer.id !== event.pointerId) return;
    state.pointer = null;

    if (!pointer.horizontal || !pointer.moved) return;

    const nodes = nodesFor(surface);
    const step = stepFor(surface);
    const projectedCards = -(pointer.velocityX * 1900) / Math.max(1, step);
    const cappedProjection = Math.max(-20, Math.min(20, projectedCards));
    let target = Math.round(state.position + cappedProjection);

    // A deliberate slow drag should still settle on the nearest card.
    if (Math.abs(pointer.velocityX) < .12) target = Math.round(state.position);

    const travel = Math.abs(target - state.position);
    const duration = Math.max(320, Math.min(1050, 360 + travel * 42));
    state.suppressClick = true;
    globalThis.setTimeout?.(() => { state.suppressClick = false; }, Math.min(1100, duration + 100));
    animateTo(surface, target, duration);
  }

  document.addEventListener("pointerup", finishPointer, true);
  document.addEventListener("pointercancel", (event) => {
    const surface = surfaceFromEvent(event);
    const state = surface ? fieldState.get(surface) : null;
    if (!state?.pointer || state.pointer.id !== event.pointerId) return;
    if (state.pointer.horizontal) finishPointer(event);
    else state.pointer = null;
  }, true);

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
    if (index < 0) return;
    const active = mod(Math.round(state.position), nodes.length);
    if (index === active && Math.abs(wrappedDelta(index, state.position, nodes.length)) < .55) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    const delta = wrappedDelta(index, state.position, nodes.length);
    animateTo(surface, state.position + delta, Math.max(260, Math.min(600, 280 + Math.abs(delta) * 50)));
  }, true);

  document.addEventListener("keydown", (event) => {
    const surface = surfaceFromEvent(event);
    const state = surface ? fieldState.get(surface) : null;
    if (!state || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const nodes = nodesFor(surface);
    if (!nodes.length) return;
    event.preventDefault();
    if (event.key === "Home") animateTo(surface, Math.round(state.position) - mod(Math.round(state.position), nodes.length), 420);
    else if (event.key === "End") {
      const current = mod(Math.round(state.position), nodes.length);
      animateTo(surface, Math.round(state.position) + ((nodes.length - 1) - current), 520);
    } else {
      const direction = event.key === "ArrowLeft" ? -1 : 1;
      animateTo(surface, Math.round(state.position) + direction, 260);
    }
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
