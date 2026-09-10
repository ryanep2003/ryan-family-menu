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

// Experimental recipe gravity field. This is deliberately UI-only and attaches to
// every existing recipe-search result surface without changing search or recipe data.
function installRecipeGravityFieldPrototype() {
  if (typeof document === "undefined" || document.documentElement.dataset.recipeGravityInstalled) return;
  document.documentElement.dataset.recipeGravityInstalled = "true";

  const style = document.createElement("style");
  style.id = "recipeGravityFieldStyles";
  style.textContent = `
    /* Library: search results are the primary experience, not a section below Family Picks. */
    #recipesView:not(.detail-open) #recipePicksSection { display: none !important; }
    #recipesView:not(.detail-open) #recipeBrowse { border-top: 0; }
    #recipesView:not(.detail-open) #recipeBrowse > summary { display: none; }
    #recipesView:not(.detail-open) #recipeBrowse .recipe-browse-content { display: block; }

    .recipe-gravity-field {
      --gravity-height: clamp(430px, 112vw, 590px);
      position: relative !important;
      display: block !important;
      width: 100%;
      height: var(--gravity-height) !important;
      min-height: 430px !important;
      margin-top: 12px;
      overflow: hidden !important;
      perspective: 1100px;
      perspective-origin: 50% 48%;
      touch-action: pan-y;
      isolation: isolate;
      border-radius: 24px;
      background:
        radial-gradient(circle at 50% 50%, rgba(175,203,255,.18), rgba(207,232,213,.08) 32%, transparent 68%);
    }
    .recipe-gravity-field::before {
      content: "";
      position: absolute;
      inset: 10% 8%;
      border-radius: 50%;
      background:
        radial-gradient(circle at center, rgba(26,58,92,.09) 0 2px, transparent 3px),
        radial-gradient(ellipse at center, transparent 0 43%, rgba(26,58,92,.06) 44% 44.5%, transparent 45%),
        radial-gradient(ellipse at center, transparent 0 67%, rgba(26,58,92,.045) 68% 68.5%, transparent 69%);
      pointer-events: none;
      transform: perspective(700px) rotateX(62deg) scale(1.2);
      opacity: .7;
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
      width: min(74vw, 330px) !important;
      max-width: 330px !important;
      min-height: 0 !important;
      margin: 0 !important;
      opacity: var(--go) !important;
      visibility: visible !important;
      transform: translate3d(calc(-50% + var(--gx)), calc(-50% + var(--gy)), var(--gz)) scale(var(--gs)) !important;
      transform-origin: center;
      transition: transform 360ms cubic-bezier(.2,.78,.18,1), opacity 240ms ease, filter 240ms ease !important;
      backface-visibility: hidden;
      will-change: transform, opacity;
      filter: saturate(.78) brightness(.98);
    }
    .recipe-gravity-field > .gravity-node.gravity-active {
      filter: none;
      box-shadow: 0 18px 48px rgba(26,58,92,.18);
    }
    .recipe-gravity-field > .gravity-node:not(.gravity-active) { cursor: pointer; }
    .recipe-gravity-field > .gravity-node[aria-hidden="true"] { pointer-events: none; }

    /* Library browse cards become visual recipe tiles inside the field. */
    #recipeList.recipe-gravity-field > .recipe-browse-card {
      padding: 12px !important;
      border-radius: 20px;
      background: var(--paper);
    }
    #recipeList.recipe-gravity-field > .recipe-browse-card .recipe-card {
      display: grid;
      grid-template-columns: 1fr !important;
      gap: 7px;
      min-height: 0 !important;
      padding: 0 !important;
      border: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
    }
    #recipeList.recipe-gravity-field > .recipe-browse-card .recipe-photo-shell {
      grid-column: 1 !important;
      grid-row: auto !important;
      width: 100% !important;
      height: 150px !important;
      border-radius: 14px !important;
      overflow: hidden;
    }
    #recipeList.recipe-gravity-field > .recipe-browse-card .recipe-photo-shell img {
      width: 100%; height: 100%; object-fit: cover;
    }
    #recipeList.recipe-gravity-field > .recipe-browse-card .recipe-card h3,
    #recipeList.recipe-gravity-field > .recipe-browse-card .recipe-card p,
    #recipeList.recipe-gravity-field > .recipe-browse-card .category-pill { grid-column: 1 !important; }
    #recipeList.recipe-gravity-field > .recipe-browse-card:not(.gravity-active) .recipe-add-meal { opacity: .2; pointer-events: none; }

    /* Planner result buttons use the same field rather than a vertical result list. */
    .focused-recipe-results.recipe-gravity-field,
    .meal-recipe-results.recipe-gravity-field {
      --gravity-height: clamp(390px, 104vw, 520px);
      padding: 0 !important;
    }
    .focused-recipe-results.recipe-gravity-field > .focused-recipe-result,
    .meal-recipe-results.recipe-gravity-field > .meal-recipe-result {
      display: grid !important;
      grid-template-columns: 1fr !important;
      gap: 8px !important;
      padding: 12px !important;
      border: 1px solid var(--rule) !important;
      border-radius: 18px !important;
      background: var(--paper) !important;
      color: var(--ink) !important;
      text-align: left !important;
    }
    .focused-recipe-results.recipe-gravity-field .recipe-photo-shell,
    .meal-recipe-results.recipe-gravity-field .recipe-photo-shell {
      width: 100% !important;
      height: 138px !important;
      border-radius: 13px !important;
      overflow: hidden;
    }
    .focused-recipe-results.recipe-gravity-field .recipe-photo-shell img,
    .meal-recipe-results.recipe-gravity-field .recipe-photo-shell img { width: 100%; height: 100%; object-fit: cover; }

    .recipe-gravity-field .gravity-active::after {
      content: "";
      position: absolute;
      inset: -8px;
      z-index: -1;
      border-radius: 26px;
      border: 1px solid rgba(175,203,255,.55);
      box-shadow: 0 0 34px rgba(175,203,255,.22);
      pointer-events: none;
    }

    @media (min-width: 760px) {
      .recipe-gravity-field { --gravity-height: 590px; }
      .recipe-gravity-field > .gravity-node { width: 340px !important; max-width: 340px !important; }
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
      .recipe-gravity-field::before { display: none; }
      .recipe-gravity-field > .gravity-node {
        position: relative !important;
        top: auto !important;
        left: auto !important;
        flex: 0 0 min(80vw, 330px);
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

  function categoryKey(node) {
    const explicit = node.dataset.recipeCategory || "";
    if (explicit) return explicit;
    const text = `${node.querySelector(".category-pill")?.textContent || ""}`.trim().toLocaleLowerCase();
    if (/dessert|postre/.test(text)) return "dessert";
    if (/salad|ensalada/.test(text)) return "salad";
    if (/side|acompa/.test(text)) return "side";
    if (/sauce|salsa/.test(text)) return "sauce";
    if (/drink|bebida/.test(text)) return "drink";
    if (/draft|borrador/.test(text)) return "draft";
    if (/main|principal/.test(text)) return "main";
    // Focused dinner results currently do not print their category. Keep their
    // position deterministic until the renderer exposes category metadata.
    const identity = node.dataset.recipeId || node.dataset.focusedRecipe || node.textContent || "recipe";
    let hash = 0;
    for (let i = 0; i < identity.length; i += 1) hash = ((hash << 5) - hash + identity.charCodeAt(i)) | 0;
    return ["main", "side", "salad", "dessert", "sauce"][Math.abs(hash) % 5];
  }

  const vertices = {
    main: { x: 0, y: -1 },
    side: { x: 1, y: -.25 },
    salad: { x: .72, y: .78 },
    dessert: { x: -.72, y: .78 },
    sauce: { x: -1, y: -.25 },
    drink: { x: -.55, y: -.72 },
    draft: { x: .55, y: -.72 },
  };

  function layoutSurface(surface) {
    const nodes = nodesFor(surface);
    if (!nodes.length) {
      surface.classList.remove("recipe-gravity-field");
      return;
    }
    surface.classList.add("recipe-gravity-field");
    // Neutralize the original one-dimensional library wheel when this prototype owns it.
    surface.classList.remove("recipe-wheel-list");
    let state = fieldState.get(surface);
    if (!state) {
      state = { active: 0, dragX: 0, dragY: 0, pointer: null, suppressClick: false, signature: "" };
      fieldState.set(surface, state);
    }
    const signature = nodes.map((node) => node.dataset.recipeId || node.dataset.focusedRecipe || node.querySelector("[data-open]")?.dataset.open || node.textContent?.slice(0, 40)).join("|");
    if (state.signature !== signature) {
      state.active = 0;
      state.dragX = 0;
      state.dragY = 0;
      state.signature = signature;
    }
    state.active = Math.max(0, Math.min(state.active, nodes.length - 1));

    const width = Math.max(320, surface.clientWidth || 360);
    const height = Math.max(390, surface.clientHeight || 460);
    const radiusX = Math.min(width * .72, 330);
    const radiusY = Math.min(height * .36, 180);
    const activeCategory = categoryKey(nodes[state.active]);
    const activeVertex = vertices[activeCategory] || { x: 0, y: 0 };

    nodes.forEach((node, index) => {
      node.classList.add("gravity-node");
      const category = categoryKey(node);
      const vertex = vertices[category] || { x: 0, y: 0 };
      const relative = index - state.active;
      const ring = Math.min(3, Math.abs(relative));
      const sameClusterOffset = category === activeCategory ? relative : 0;
      // Coordinates are category attractor minus the active attractor, which makes
      // the active recipe the apparent gravitational center while preserving neighborhoods.
      let x = (vertex.x - activeVertex.x) * radiusX + Math.sign(sameClusterOffset) * Math.min(150, Math.abs(sameClusterOffset) * 72);
      let y = (vertex.y - activeVertex.y) * radiusY + (category === activeCategory ? Math.sin(relative * 1.35) * 42 : 0);
      if (index === state.active) { x = 0; y = 0; }
      x += state.dragX;
      y += state.dragY;
      const distance = Math.hypot(x / Math.max(1, radiusX), y / Math.max(1, radiusY));
      const depth = index === state.active ? 0 : -Math.min(420, 120 + distance * 115 + ring * 28);
      const scale = index === state.active ? 1 : Math.max(.54, .82 - distance * .10 - ring * .025);
      const opacity = index === state.active ? 1 : Math.max(.16, .76 - distance * .18 - ring * .06);
      const hidden = distance > 2.75 || Math.abs(relative) > 12;
      node.style.setProperty("--gx", `${x}px`);
      node.style.setProperty("--gy", `${y}px`);
      node.style.setProperty("--gz", `${depth}px`);
      node.style.setProperty("--gs", `${scale}`);
      node.style.setProperty("--go", hidden ? "0" : `${opacity}`);
      node.style.setProperty("--gzi", `${index === state.active ? 30 : Math.max(1, 20 - Math.round(distance * 4) - ring)}`);
      node.classList.toggle("gravity-active", index === state.active);
      node.setAttribute("aria-hidden", `${hidden}`);
      if (index === state.active) node.setAttribute("data-gravity-active", "true");
      else node.removeAttribute("data-gravity-active");
      node.querySelectorAll("button").forEach((button) => { button.tabIndex = index === state.active ? 0 : -1; });
      if (node.matches("button")) node.tabIndex = index === state.active ? 0 : -1;
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
    state.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    state.dragX = 0;
    state.dragY = 0;
  }, true);

  document.addEventListener("pointermove", (event) => {
    const surface = surfaceFromEvent(event);
    const state = surface ? fieldState.get(surface) : null;
    if (!state?.pointer || state.pointer.id !== event.pointerId) return;
    const dx = event.clientX - state.pointer.x;
    const dy = event.clientY - state.pointer.y;
    if (Math.hypot(dx, dy) < 8 && !state.pointer.moved) return;
    state.pointer.moved = true;
    // Once the gesture clearly becomes field exploration, keep it inside the field.
    if (Math.abs(dx) > Math.abs(dy) * .75 || Math.abs(dx) > 18) event.preventDefault();
    state.dragX = Math.max(-120, Math.min(120, dx * .42));
    state.dragY = Math.max(-100, Math.min(100, dy * .34));
    layoutSurface(surface);
  }, { capture: true, passive: false });

  function finishPointer(event) {
    const surface = surfaceFromEvent(event);
    const state = surface ? fieldState.get(surface) : null;
    if (!state?.pointer || state.pointer.id !== event.pointerId) return;
    const dx = event.clientX - state.pointer.x;
    const dy = event.clientY - state.pointer.y;
    const nodes = nodesFor(surface);
    const moved = state.pointer.moved;
    state.pointer = null;
    state.dragX = 0;
    state.dragY = 0;
    if (moved && Math.hypot(dx, dy) > 44 && nodes.length > 1) {
      // Find the neighboring node whose current category vertex best matches the drag direction.
      const angle = Math.atan2(dy, dx);
      let bestIndex = state.active;
      let bestScore = Infinity;
      const activeCategory = categoryKey(nodes[state.active]);
      const av = vertices[activeCategory] || { x: 0, y: 0 };
      nodes.forEach((node, index) => {
        if (index === state.active) return;
        const v = vertices[categoryKey(node)] || { x: 0, y: 0 };
        const vx = v.x - av.x || (index - state.active) * .25;
        const vy = v.y - av.y || Math.sin((index - state.active) * 1.2) * .25;
        const nodeAngle = Math.atan2(vy, vx);
        let delta = Math.abs(nodeAngle - angle);
        delta = Math.min(delta, Math.PI * 2 - delta);
        const score = delta + Math.min(1.2, Math.abs(index - state.active) * .025);
        if (score < bestScore) { bestScore = score; bestIndex = index; }
      });
      state.active = bestIndex;
      state.suppressClick = true;
      globalThis.setTimeout?.(() => { state.suppressClick = false; }, 220);
    }
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
    // First tap bends the field around the peripheral recipe. A second tap on the
    // centered recipe falls through to the app's existing open/choose behavior.
    event.preventDefault();
    event.stopImmediatePropagation();
    state.active = index;
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
      state.active = Math.max(0, Math.min(nodes.length - 1, state.active + direction));
    }
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
