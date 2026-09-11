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

  navigatorObject?.serviceWorker?.addEventListener?.("controllerchange", () => {
    if (hadController) onUpdateAvailable();
    hadController = true;
  });

  navigator.serviceWorker.register("service-worker.js").then((registration) => {
    registrationRef = registration;
    checkForUpdate();
    window.addEventListener("focus", checkForUpdate);
    window.addEventListener("online", checkForUpdate);
    if (registration.waiting && navigator.serviceWorker.controller) onUpdateAvailable();
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) onUpdateAvailable();
      });
    });
  });
}

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

    .recipe-reel-viewport {
      --gravity-height: clamp(420px, 108vw, 525px);
      --card-w: min(72vw, 292px);
      --card-h: min(84vw, 342px);
      --rail-bottom: clamp(34px, 9vw, 46px);
      position: relative;
      width: 100%;
      height: var(--gravity-height);
      min-height: 420px;
      margin-top: 12px;
      overflow: hidden;
      touch-action: pan-y;
      isolation: isolate;
      border-radius: 24px;
      background: linear-gradient(180deg, rgba(251,250,247,.99) 0%, rgba(246,247,248,.99) 54%, rgba(239,242,244,.99) 100%);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.82), inset 0 -1px 0 rgba(26,58,92,.04);
    }
    .recipe-reel-viewport::before {
      content: "";
      position: absolute;
      left: 7%;
      right: 7%;
      bottom: calc(var(--rail-bottom) + 52px);
      height: 220px;
      border-radius: 36px;
      background: linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.66) 20%, rgba(255,255,255,.92) 50%, rgba(255,255,255,.66) 80%, rgba(255,255,255,0));
      filter: blur(14px);
      pointer-events: none;
      opacity: .94;
    }
    .recipe-reel-viewport::after {
      content: "";
      position: absolute;
      left: 17%;
      right: 17%;
      bottom: calc(var(--rail-bottom) - 8px);
      height: 14px;
      border-radius: 999px;
      background: rgba(26,58,92,.09);
      filter: blur(11px);
      pointer-events: none;
    }
    .recipe-gravity-field {
      position: absolute !important;
      left: 50% !important;
      bottom: var(--rail-bottom) !important;
      top: auto !important;
      width: max-content !important;
      height: var(--card-h) !important;
      min-height: 0 !important;
      display: flex !important;
      align-items: flex-end !important;
      gap: 18px !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: visible !important;
      background: transparent !important;
      transform: translate3d(var(--track-x, 0px), 0, 0);
      will-change: transform;
    }
    .recipe-gravity-field > .gravity-node {
      --gs: 1;
      --go: 1;
      position: relative !important;
      inset: auto !important;
      flex: 0 0 var(--card-w) !important;
      width: var(--card-w) !important;
      height: var(--card-h) !important;
      min-height: var(--card-h) !important;
      max-width: var(--card-w) !important;
      margin: 0 !important;
      overflow: hidden !important;
      opacity: var(--go) !important;
      transform: scale(var(--gs)) !important;
      transform-origin: 50% 100% !important;
      transition: opacity 90ms linear, filter 90ms linear !important;
      backface-visibility: hidden;
      will-change: transform, opacity;
      filter: saturate(.84) brightness(.99);
      box-sizing: border-box !important;
      z-index: var(--gzi, 1) !important;
    }
    .recipe-gravity-field > .gravity-node.gravity-active {
      filter: none;
      box-shadow: 0 22px 52px rgba(26,58,92,.18), 0 3px 12px rgba(26,58,92,.08);
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
      border: 1px solid rgba(26,58,92,.10) !important;
      border-radius: 22px !important;
      background: rgba(255,255,255,.97) !important;
      color: var(--ink) !important;
      text-align: left !important;
      box-sizing: border-box !important;
      backdrop-filter: blur(8px);
    }
    #recipeList.recipe-gravity-field > .recipe-browse-card .recipe-card {
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
    #recipeList.recipe-gravity-field .recipe-photo-shell,
    .focused-recipe-results.recipe-gravity-field .recipe-photo-shell,
    .meal-recipe-results.recipe-gravity-field .recipe-photo-shell {
      width: 100% !important;
      height: 164px !important;
      min-height: 164px !important;
      border-radius: 15px !important;
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
    #recipeList.recipe-gravity-field > .recipe-browse-card:not(.gravity-active) .recipe-add-meal { opacity: .16; pointer-events: none; }
    @media (min-width: 760px) {
      .recipe-reel-viewport { --gravity-height: 555px; --card-w: 316px; --card-h: 368px; --rail-bottom: 50px; }
      .recipe-gravity-field { gap: 22px !important; }
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
  function mod(value, length) { return ((value % length) + length) % length; }
  function wrappedDelta(index, position, length) {
    let delta = index - position;
    while (delta > length / 2) delta -= length;
    while (delta < -length / 2) delta += length;
    return delta;
  }
  function getState(surface) {
    let state = fieldState.get(surface);
    if (!state) {
      state = { position: 0, pointer: null, suppressClick: false, signature: "", animationFrame: null };
      fieldState.set(surface, state);
    }
    return state;
  }
  function ensureViewport(surface) {
    if (surface.parentElement?.classList.contains("recipe-reel-viewport")) return surface.parentElement;
    const viewport = document.createElement("div");
    viewport.className = "recipe-reel-viewport";
    surface.before(viewport);
    viewport.append(surface);
    return viewport;
  }
  function cancelAnimation(state) {
    if (state.animationFrame != null) cancelAnimationFrame(state.animationFrame);
    state.animationFrame = null;
  }
  function geometryFor(surface, nodes) {
    const viewport = ensureViewport(surface);
    const width = nodes[0]?.offsetWidth || Math.min(viewport.clientWidth * .72, 292);
    const computed = getComputedStyle(surface);
    const gap = parseFloat(computed.columnGap || computed.gap) || 18;
    return { viewport, width, step: width + gap };
  }
  function layoutSurface(surface) {
    const nodes = nodesFor(surface);
    if (!nodes.length) return;
    ensureViewport(surface);
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
    nodes.forEach((node) => node.classList.add("gravity-node"));
    const { width, step } = geometryFor(surface, nodes);
    const activeIndex = mod(Math.round(state.position), nodes.length);
    surface.style.setProperty("--track-x", `${-(width / 2) - state.position * step}px`);
    nodes.forEach((node, index) => {
      const delta = wrappedDelta(index, state.position, nodes.length);
      const distance = Math.abs(delta);
      const active = index === activeIndex && distance < .55;
      const scale = distance < .48 ? 1 : Math.max(.78, .93 - Math.min(2.15, distance) * .07);
      const opacity = distance < .48 ? 1 : Math.max(.18, .84 - Math.min(2.15, distance) * .25);
      const hidden = distance > 2.35;
      node.style.setProperty("--gs", `${scale}`);
      node.style.setProperty("--go", hidden ? "0" : `${opacity}`);
      node.style.setProperty("--gzi", `${active ? 30 : Math.max(1, 20 - Math.round(distance * 5))}`);
      node.classList.toggle("gravity-active", active);
      node.setAttribute("aria-hidden", `${hidden}`);
      node.querySelectorAll("button").forEach((button) => { button.tabIndex = active ? 0 : -1; });
      if (node.matches("button")) node.tabIndex = active ? 0 : -1;
    });
  }
  function animateTo(surface, target, duration = 650) {
    const state = getState(surface);
    cancelAnimation(state);
    const start = state.position;
    const distance = target - start;
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
  function enhanceAll() { document.querySelectorAll(surfaceSelector).forEach(layoutSurface); }
  function surfaceFromEvent(event) {
    const direct = event.target?.closest?.(surfaceSelector);
    if (direct) return direct;
    const viewport = event.target?.closest?.(".recipe-reel-viewport");
    return viewport ? viewport.querySelector(surfaceSelector) : null;
  }

  document.addEventListener("pointerdown", (event) => {
    const surface = surfaceFromEvent(event);
    if (!surface?.classList.contains("recipe-gravity-field")) return;
    const state = getState(surface);
    cancelAnimation(state);
    state.pointer = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startPosition: state.position,
      lastX: event.clientX,
      lastTime: performance.now(),
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
      if (Math.abs(dy) > Math.abs(dx) * 1.05) { pointer.rejected = true; return; }
      if (Math.abs(dx) < Math.abs(dy) * 1.12) return;
      pointer.horizontal = true;
      ensureViewport(surface).setPointerCapture?.(event.pointerId);
    }
    event.preventDefault();
    pointer.moved = true;
    const now = performance.now();
    const dt = Math.max(8, now - pointer.lastTime);
    const instantaneous = (event.clientX - pointer.lastX) / dt;
    pointer.velocityX = pointer.velocityX * .68 + instantaneous * .32;
    pointer.lastX = event.clientX;
    pointer.lastTime = now;
    const { step } = geometryFor(surface, nodesFor(surface));
    state.position = pointer.startPosition - (dx / Math.max(1, step));
    layoutSurface(surface);
  }, { capture: true, passive: false });

  function finishPointer(event) {
    const surface = surfaceFromEvent(event);
    const state = surface ? fieldState.get(surface) : null;
    const pointer = state?.pointer;
    if (!pointer || pointer.id !== event.pointerId) return;
    state.pointer = null;
    if (!pointer.horizontal || !pointer.moved) return;
    const { step } = geometryFor(surface, nodesFor(surface));
    const projectedCards = -(pointer.velocityX * 1900) / Math.max(1, step);
    const cappedProjection = Math.max(-20, Math.min(20, projectedCards));
    let target = Math.round(state.position + cappedProjection);
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