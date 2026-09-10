// PR #28 preview-only gravity-field bootstrap.
// Keep this self-contained so the prototype does not depend on app-lifecycle.js,
// the service worker, or any cached module alias during review.
function installRecipeGravityPreview() {
  if (typeof document === "undefined") return;
  if (document.documentElement.dataset.recipeGravityDirect === "true") return;
  document.documentElement.dataset.recipeGravityDirect = "true";

  const style = document.createElement("style");
  style.id = "recipeGravityDirectStyles";
  style.textContent = `
    #recipesView:not(.detail-open) #recipePicksSection { display: none !important; }
    #recipesView:not(.detail-open) #recipeBrowse { border-top: 0 !important; }
    #recipesView:not(.detail-open) #recipeBrowse > summary { display: none !important; }
    #recipesView:not(.detail-open) #recipeBrowse .recipe-browse-content { display: block !important; }

    #recipeList.recipe-gravity-direct {
      position: relative !important;
      display: block !important;
      width: 100% !important;
      height: clamp(450px, 118vw, 600px) !important;
      min-height: 450px !important;
      overflow: hidden !important;
      margin-top: 12px !important;
      border-radius: 24px;
      perspective: 1100px;
      perspective-origin: 50% 48%;
      touch-action: pan-y;
      background: radial-gradient(circle at 50% 48%, rgba(175,203,255,.18), rgba(207,232,213,.08) 36%, transparent 70%);
      isolation: isolate;
    }
    #recipeList.recipe-gravity-direct::before {
      content: "";
      position: absolute;
      inset: 12% 8%;
      border-radius: 50%;
      background:
        radial-gradient(ellipse at center, transparent 0 42%, rgba(26,58,92,.08) 43% 43.5%, transparent 44%),
        radial-gradient(ellipse at center, transparent 0 67%, rgba(26,58,92,.055) 68% 68.5%, transparent 69%);
      transform: perspective(700px) rotateX(60deg) scale(1.18);
      pointer-events: none;
    }
    #recipeList.recipe-gravity-direct > .recipe-browse-card {
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
      width: min(74vw, 330px) !important;
      max-width: 330px !important;
      min-height: 0 !important;
      margin: 0 !important;
      padding: 12px !important;
      border-radius: 20px !important;
      opacity: var(--go) !important;
      visibility: visible !important;
      z-index: var(--gzi, 1) !important;
      transform: translate3d(calc(-50% + var(--gx)), calc(-50% + var(--gy)), var(--gz)) scale(var(--gs)) !important;
      transform-origin: center;
      transition: transform 340ms cubic-bezier(.2,.78,.18,1), opacity 220ms ease, filter 220ms ease !important;
      filter: saturate(.78) brightness(.98);
      background: var(--paper, #fff) !important;
      backface-visibility: hidden;
      will-change: transform, opacity;
    }
    #recipeList.recipe-gravity-direct > .recipe-browse-card.gravity-direct-active {
      filter: none;
      box-shadow: 0 18px 48px rgba(26,58,92,.18);
    }
    #recipeList.recipe-gravity-direct > .recipe-browse-card .recipe-card {
      display: grid !important;
      grid-template-columns: 1fr !important;
      gap: 7px !important;
      min-height: 0 !important;
      padding: 0 !important;
      border: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
    }
    #recipeList.recipe-gravity-direct > .recipe-browse-card .recipe-photo-shell {
      width: 100% !important;
      height: 150px !important;
      border-radius: 14px !important;
      overflow: hidden !important;
      grid-column: 1 !important;
      grid-row: auto !important;
    }
    #recipeList.recipe-gravity-direct > .recipe-browse-card .recipe-photo-shell img {
      width: 100% !important;
      height: 100% !important;
      object-fit: cover !important;
    }
    #recipeList.recipe-gravity-direct > .recipe-browse-card:not(.gravity-direct-active) .recipe-add-meal {
      opacity: .2 !important;
      pointer-events: none !important;
    }
  `;
  document.head.append(style);

  let active = 0;
  let signature = "";

  function categoryForCard(card) {
    const text = `${card.querySelector(".category-pill")?.textContent || ""}`.toLowerCase();
    if (/dessert|postre/.test(text)) return 4;
    if (/salad|ensalada/.test(text)) return 2;
    if (/side|acompa/.test(text)) return 1;
    if (/sauce|salsa/.test(text)) return 3;
    return 0;
  }

  const anchors = [
    [0, -1],
    [1, -.18],
    [.7, .82],
    [-.92, .18],
    [-.65, .82],
  ];

  function layout() {
    const list = document.querySelector("#recipeList");
    if (!list) return;
    const cards = [...list.querySelectorAll(":scope > .recipe-browse-card")];
    if (!cards.length) return;

    list.classList.remove("recipe-wheel-list");
    list.classList.add("recipe-gravity-direct");
    const nextSignature = cards.map((card) => card.querySelector("[data-open]")?.dataset.open || card.textContent?.slice(0, 32)).join("|");
    if (nextSignature !== signature) {
      signature = nextSignature;
      active = 0;
    }
    active = Math.max(0, Math.min(active, cards.length - 1));

    const width = Math.max(320, list.clientWidth || 360);
    const radiusX = Math.min(width * .64, 300);
    const radiusY = 165;
    const activeAnchor = anchors[categoryForCard(cards[active])] || anchors[0];

    cards.forEach((card, index) => {
      const anchor = anchors[categoryForCard(card)] || anchors[0];
      const delta = index - active;
      let x = (anchor[0] - activeAnchor[0]) * radiusX;
      let y = (anchor[1] - activeAnchor[1]) * radiusY;
      if (categoryForCard(card) === categoryForCard(cards[active])) {
        x += Math.sign(delta) * Math.min(160, Math.abs(delta) * 74);
        y += Math.sin(delta * 1.3) * 38;
      }
      if (index === active) { x = 0; y = 0; }
      const distance = Math.hypot(x / Math.max(1, radiusX), y / radiusY);
      const hidden = Math.abs(delta) > 11 || distance > 2.8;
      const depth = index === active ? 0 : -Math.min(430, 125 + distance * 120 + Math.min(3, Math.abs(delta)) * 25);
      const scale = index === active ? 1 : Math.max(.55, .83 - distance * .11 - Math.min(3, Math.abs(delta)) * .025);
      const opacity = hidden ? 0 : index === active ? 1 : Math.max(.18, .76 - distance * .18);
      card.style.setProperty("--gx", `${x}px`);
      card.style.setProperty("--gy", `${y}px`);
      card.style.setProperty("--gz", `${depth}px`);
      card.style.setProperty("--gs", `${scale}`);
      card.style.setProperty("--go", `${opacity}`);
      card.style.setProperty("--gzi", `${index === active ? 30 : Math.max(1, 18 - Math.round(distance * 4))}`);
      card.classList.toggle("gravity-direct-active", index === active);
      card.setAttribute("aria-hidden", `${hidden}`);
      card.querySelectorAll("button").forEach((button) => { button.tabIndex = index === active ? 0 : -1; });
    });
  }

  document.addEventListener("click", (event) => {
    const card = event.target.closest?.("#recipeList.recipe-gravity-direct > .recipe-browse-card");
    if (!card) return;
    const list = card.parentElement;
    const cards = [...list.querySelectorAll(":scope > .recipe-browse-card")];
    const index = cards.indexOf(card);
    if (index < 0 || index === active) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    active = index;
    layout();
  }, true);

  let start = null;
  document.addEventListener("pointerdown", (event) => {
    if (!event.target.closest?.("#recipeList.recipe-gravity-direct")) return;
    start = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }, true);
  document.addEventListener("pointerup", (event) => {
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    start = null;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;
    const cards = [...document.querySelectorAll("#recipeList.recipe-gravity-direct > .recipe-browse-card")];
    if (!cards.length) return;
    active = Math.max(0, Math.min(cards.length - 1, active + (dx < 0 ? 1 : -1)));
    layout();
  }, true);

  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      layout();
    });
  });
  observer.observe(document.documentElement, { subtree: true, childList: true });
  window.addEventListener("resize", layout, { passive: true });
  requestAnimationFrame(layout);
}

installRecipeGravityPreview();

export function readJsonStorage(storage, key, fallback) {
  try {
    const value = storage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function readStringStorage(storage, key, fallback = "") {
  const value = storage.getItem(key);
  return value === null || value === "" ? fallback : value;
}

export function readNumberStorage(storage, key, fallback = 0) {
  const raw = storage.getItem(key);
  if (raw === null || raw === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}
