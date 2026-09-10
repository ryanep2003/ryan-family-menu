export function shopExperienceCopy(lang = "en") {
  if (lang === "es") {
    return {
      shoppingNow: "Comprando ahora",
      shoppingNowHelper: "Tu lista activa, organizada para comprar rápido.",
      checkout: "Terminar compra",
      checkoutHelper: "Marca lo que compraste, guarda el recibo y pásalo a En casa.",
      planAndLists: "Planificar y listas guardadas",
      planAndListsHelper: "Agrega artículos, crea desde el plan de comidas o reutiliza una lista guardada.",
      spendingHistory: "Gastos e historial",
      moreActions: "Más acciones",
      useSavedList: "Agregar a la lista de compras",
      deleteSavedList: "Borrar lista guardada",
    };
  }
  return {
    shoppingNow: "Shopping now",
    shoppingNowHelper: "Your active list, organized for a quick trip through the store.",
    checkout: "Checkout",
    checkoutHelper: "Check off what you bought, save the receipt, and move it to At Home.",
    planAndLists: "Plan & saved lists",
    planAndListsHelper: "Add items, build from the meal plan, or reuse a saved list.",
    spendingHistory: "Spending & history",
    moreActions: "More actions",
    useSavedList: "Add to shopping list",
    deleteSavedList: "Delete saved list",
  };
}

function stageHeader(documentRef, title, helper = "") {
  const header = documentRef.createElement("div");
  header.className = "shop-stage-header";
  const heading = documentRef.createElement("h2");
  heading.textContent = title;
  header.appendChild(heading);
  if (helper) {
    const note = documentRef.createElement("p");
    note.textContent = helper;
    header.appendChild(note);
  }
  return header;
}

function moveIfPresent(parent, node) {
  if (parent && node) parent.appendChild(node);
}

export function polishSavedListActions(root, copy) {
  if (!root?.querySelectorAll) return 0;
  let changed = 0;
  root.querySelectorAll("[data-run-shopping-list]").forEach((button) => {
    if (button.textContent !== copy.useSavedList) {
      button.textContent = copy.useSavedList;
      changed += 1;
    }
  });
  root.querySelectorAll("[data-delete-shopping-list]").forEach((button) => {
    if (button.textContent !== copy.deleteSavedList) {
      button.textContent = copy.deleteSavedList;
      changed += 1;
    }
  });
  return changed;
}

export function organizeShopExperience({ documentRef = globalThis.document, getLang = () => "en" } = {}) {
  if (!documentRef?.querySelector || !documentRef?.createElement) return false;
  const panel = documentRef.querySelector("#shoppingPanel");
  if (!panel || panel.dataset.shopExperienceReady === "true") return false;

  const copy = shopExperienceCopy(getLang());
  const banner = panel.querySelector(".grocery-heading");
  const filter = panel.querySelector("#groceryMealFilterPanel");
  const status = panel.querySelector(".sync-status-row");
  const list = panel.querySelector("#groceryList");
  const finishPrompt = panel.querySelector("#finishShoppingPrompt");
  const finishPanel = panel.querySelector("#finishShoppingPanel");
  const setup = panel.querySelector("#shoppingListSetup");
  const savedLists = panel.querySelector("#savedShoppingListsPanel");
  const monthlyBudget = panel.querySelector(".monthly-budget");
  const tools = panel.querySelector(".grocery-tools-menu");

  if (!list) return false;

  const shoppingStage = documentRef.createElement("section");
  shoppingStage.className = "shop-stage shop-stage-primary";
  shoppingStage.setAttribute("aria-label", copy.shoppingNow);
  shoppingStage.appendChild(stageHeader(documentRef, copy.shoppingNow, copy.shoppingNowHelper));
  moveIfPresent(shoppingStage, filter);
  moveIfPresent(shoppingStage, status);
  moveIfPresent(shoppingStage, list);

  const checkoutStage = documentRef.createElement("section");
  checkoutStage.className = "shop-stage shop-stage-checkout";
  checkoutStage.setAttribute("aria-label", copy.checkout);
  checkoutStage.appendChild(stageHeader(documentRef, copy.checkout, copy.checkoutHelper));
  moveIfPresent(checkoutStage, finishPrompt);
  moveIfPresent(checkoutStage, finishPanel);

  const secondaryStack = documentRef.createElement("div");
  secondaryStack.className = "shop-secondary-stack";

  const planningDetails = documentRef.createElement("details");
  planningDetails.className = "shop-secondary-section";
  const planningSummary = documentRef.createElement("summary");
  planningSummary.textContent = copy.planAndLists;
  planningDetails.appendChild(planningSummary);
  const planningBody = documentRef.createElement("div");
  planningBody.className = "shop-secondary-body";
  const planningHelper = documentRef.createElement("p");
  planningHelper.className = "shop-secondary-helper";
  planningHelper.textContent = copy.planAndListsHelper;
  planningBody.appendChild(planningHelper);
  moveIfPresent(planningBody, setup);
  moveIfPresent(planningBody, savedLists);
  planningDetails.appendChild(planningBody);
  secondaryStack.appendChild(planningDetails);

  if (monthlyBudget) {
    const historyDetails = documentRef.createElement("details");
    historyDetails.className = "shop-secondary-section";
    const historySummary = documentRef.createElement("summary");
    historySummary.textContent = copy.spendingHistory;
    historyDetails.appendChild(historySummary);
    const historyBody = documentRef.createElement("div");
    historyBody.className = "shop-secondary-body";
    historyBody.appendChild(monthlyBudget);
    historyDetails.appendChild(historyBody);
    secondaryStack.appendChild(historyDetails);
  }

  if (tools) {
    const toolsDetails = documentRef.createElement("details");
    toolsDetails.className = "shop-secondary-section shop-secondary-danger";
    const toolsSummary = documentRef.createElement("summary");
    toolsSummary.textContent = copy.moreActions;
    toolsDetails.appendChild(toolsSummary);
    const toolsBody = documentRef.createElement("div");
    toolsBody.className = "shop-secondary-body";
    toolsBody.appendChild(tools);
    toolsDetails.appendChild(toolsBody);
    secondaryStack.appendChild(toolsDetails);
  }

  const anchor = banner?.nextSibling || panel.firstChild;
  panel.insertBefore(shoppingStage, anchor);
  panel.insertBefore(checkoutStage, shoppingStage.nextSibling);
  panel.insertBefore(secondaryStack, checkoutStage.nextSibling);

  if (savedLists) {
    polishSavedListActions(savedLists, copy);
    const MutationObserverRef = documentRef.defaultView?.MutationObserver || globalThis.MutationObserver;
    if (MutationObserverRef) {
      const observer = new MutationObserverRef(() => polishSavedListActions(savedLists, shopExperienceCopy(getLang())));
      observer.observe(savedLists, { childList: true, subtree: true });
    }
  }

  if (!documentRef.querySelector("#shopExperienceStyles")) {
    const style = documentRef.createElement("style");
    style.id = "shopExperienceStyles";
    style.textContent = `
      .shop-stage { margin: 0 0 18px; }
      .shop-stage-header { margin: 0 0 12px; }
      .shop-stage-header h2 { margin: 0; font-size: 1.12rem; }
      .shop-stage-header p { margin: 4px 0 0; color: var(--muted, #6d747b); font-size: .92rem; line-height: 1.35; }
      .shop-stage-checkout { padding-top: 4px; }
      .shop-secondary-stack { display: grid; gap: 10px; margin: 20px 0 8px; }
      .shop-secondary-section { border: 1px solid var(--line, rgba(22,57,91,.14)); border-radius: 14px; background: var(--surface, #fff); overflow: hidden; }
      .shop-secondary-section > summary { cursor: pointer; list-style: none; padding: 14px 16px; font-weight: 700; }
      .shop-secondary-section > summary::-webkit-details-marker { display: none; }
      .shop-secondary-section > summary::after { content: '›'; float: right; transform: rotate(90deg); opacity: .6; }
      .shop-secondary-section[open] > summary::after { transform: rotate(-90deg); }
      .shop-secondary-body { padding: 0 14px 14px; }
      .shop-secondary-helper { margin: 0 0 12px; color: var(--muted, #6d747b); font-size: .9rem; line-height: 1.35; }
      .shop-secondary-body > .shopping-list-setup,
      .shop-secondary-body > .monthly-budget,
      .shop-secondary-body > .grocery-tools-menu { margin-top: 0; }
      .shop-secondary-danger .danger-action { font-weight: 600; }
      .saved-shopping-list-actions [data-delete-shopping-list] { opacity: .72; }
      @media (max-width: 640px) {
        .shop-stage-header h2 { font-size: 1.05rem; }
        .shop-secondary-stack { margin-top: 16px; }
        .saved-shopping-list-actions { align-items: stretch; }
        .saved-shopping-list-actions [data-run-shopping-list] { width: 100%; }
      }
    `;
    documentRef.head?.appendChild(style);
  }

  panel.dataset.shopExperienceReady = "true";
  return true;
}
