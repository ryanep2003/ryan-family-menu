import { allLocalizedText, canonicalText, localizedTextExact, usableLocalizedText } from "./localized-data.js";
import { linesMatchLanguage, textMatchesLanguage } from "./language-quality.js";
import {
  collapseGroceryItemsByDisplayName,
  formatCompactGroceryMealCue,
  groceryAisleFor,
  groceryAisleLabelKey,
  groceryAisleOrder,
  groceryMealRowState,
  groceryRowParts,
  normalizedWords,
  parseIngredientAmount,
} from "./grocery-logic.js";

export function createGroceryUi({
  $,
  t,
  escapeHtml,
  cleanIngredientForGrocery,
  findInventoryMatch,
  getLang,
  getGroceries,
  setGroceries,
  getInventory,
  allRecipes,
  localize,
  groceryStoreLabel,
  inventoryLocationLabel,
  getHouseholdMember = () => "Family",
  formatItemActivity = () => "",
  saveGroceries,
  offerUndo,
}) {
  let controlsBound = false;
  let selectedMealFilter = "";
  let selectedRecipeFilter = "";

  function mealFilterKey(use) {
    const dateKey = /^\d{4}-\d{2}-\d{2}$/.test(use?.dateKey) ? use.dateKey : "";
    const mealSlot = ["breakfast", "lunch", "dinner"].includes(use?.mealSlot) ? use.mealSlot : "";
    return dateKey && mealSlot ? `${dateKey}::${mealSlot}` : "";
  }

  function mealUseFromFilterKey(key) {
    const [dateKey, mealSlot] = `${key || ""}`.split("::");
    return mealFilterKey({ dateKey, mealSlot }) ? { dateKey, mealSlot } : null;
  }

  function mealUsesFor(item) {
    return Array.isArray(item.mealUses)
      ? item.mealUses.filter((use) => mealFilterKey(use))
      : [];
  }

  function mealDateLabel(dateKey) {
    const date = new Date(`${dateKey}T12:00:00`);
    if (Number.isNaN(date.getTime())) return dateKey;
    return new Intl.DateTimeFormat(getLang() === "es" ? "es-US" : "en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(date);
  }

  function mealFilterLabel(use) {
    return t("groceryMealFilterOption")
      .replace("{date}", mealDateLabel(use.dateKey))
      .replace("{meal}", t(`${use.mealSlot}Slot`));
  }

  function visibleMealUses(item) {
    const uses = mealUsesFor(item);
    if (!selectedMealFilter) return uses;
    return uses.filter((use) => mealFilterKey(use) === selectedMealFilter);
  }

  function compactMealUseNote(use) {
    return formatCompactGroceryMealCue({
      dateLabel: mealDateLabel(use.dateKey),
      mealLabel: t(`${use.mealSlot}Slot`),
    });
  }

  function groceryMealMetaParts(item) {
    const summary = groceryMealRowState(visibleMealUses(item));
    if (!summary.count) return { inline: "", extra: "" };
    const notes = summary.uses.map((use) => escapeHtml(compactMealUseNote(use)));
    if (!summary.collapsed) {
      return { inline: `<em class="item-meal-note">${notes[0]}</em>`, extra: "" };
    }
    const countLabel = t("groceryMealCountMany").replace("{count}", `${summary.count}`);
    return {
      inline: "",
      extra: `<details class="grocery-meal-meta">
        <summary>${escapeHtml(countLabel)}</summary>
        <div>${notes.map((note) => `<em class="item-meal-note">${note}</em>`).join("")}</div>
      </details>`,
    };
  }

  function availableMealFilters() {
    const byKey = new Map();
    getGroceries().forEach((item) => {
      mealUsesFor(item).forEach((use) => {
        const key = mealFilterKey(use);
        if (!byKey.has(key)) byKey.set(key, use);
      });
    });
    const selectedUse = mealUseFromFilterKey(selectedMealFilter);
    if (selectedUse && !byKey.has(selectedMealFilter)) byKey.set(selectedMealFilter, selectedUse);
    return [...byKey.entries()]
      .map(([key, use]) => ({ key, use }))
      .sort((left, right) => left.key.localeCompare(right.key));
  }

  function renderMealFilter() {
    const panel = $("#groceryMealFilterPanel");
    const select = $("#groceryMealFilter");
    if (!panel || !select) return;
    const options = availableMealFilters();
    panel.hidden = options.length === 0;
    select.innerHTML = [
      `<option value="">${escapeHtml(t("groceryAllMeals"))}</option>`,
      ...options.map(({ key, use }) => `<option value="${escapeHtml(key)}">${escapeHtml(mealFilterLabel(use))}</option>`),
    ].join("");
    select.value = options.some(({ key }) => key === selectedMealFilter) ? selectedMealFilter : "";
    const context = $("#shoppingContext");
    const selected = options.find(({ key }) => key === selectedMealFilter);
    const selectedRecipe = selectedRecipeFilter
      ? allRecipes().find((recipe) => recipe.id === selectedRecipeFilter)
      : null;
    if (context) {
      context.textContent = selectedRecipe
        ? t("shoppingForRecipe").replace("{recipe}", usableLocalizedText(selectedRecipe.name, getLang()) || localize(selectedRecipe.name))
        : selected
        ? mealFilterLabel(selected.use)
        : t("shoppingToBuyForWeek").replace("{count}", `${getGroceries().filter((item) => !item.checked && !isConfirmedAtHome(item) && shopRowParts(item).name).length}`);
    }
    const showAll = $("#shoppingShowAll");
    if (showAll) showAll.hidden = !selectedRecipeFilter && !selectedMealFilter;
    $("#shoppingPanel")?.classList?.toggle("recipe-context", Boolean(selectedRecipeFilter));
  }

  function touchItem(item) {
    item.updatedBy = getHouseholdMember();
    item.updatedAt = new Date().toISOString();
  }

  function recipeForGroceryItem(item) {
    if (item.recipeId) {
      const byId = allRecipes().find((recipe) => recipe.id === item.recipeId);
      if (byId) return byId;
    }

    if (!item.recipeName) return null;
    const itemRecipeNames = new Set(allLocalizedText(item.recipeName));
    return allRecipes().find((recipe) => allLocalizedText(recipe.name)
      .some((name) => itemRecipeNames.has(name))) || null;
  }

  function grocerySourceLabel(item) {
    if (Array.isArray(item.mealUses) && item.mealUses.length > 1) return t("multipleMealsSource");
    const recipe = recipeForGroceryItem(item);
    const recipeLabel = recipe
      ? usableLocalizedText(recipe.name, getLang()) || localize(recipe.name)
      : "";
    if (recipeLabel) return recipeLabel;
    const savedRecipeName = usableLocalizedText(item.recipeName, getLang());
    if (savedRecipeName) return savedRecipeName;
    if (item.source === "inventory-restock") return t("restockSource");
    if (["meal-plan", "week-plan"].includes(item.source)) return t("weekPlanSource");
    return t("addOnsSection");
  }

  function groceryDisplayText(item) {
    const fallback = usableLocalizedText(item.text, getLang());
    const direct = localizedTextExact(item.text, getLang());
    if (direct && textMatchesLanguage(direct, getLang())) return direct;
    const recipe = recipeForGroceryItem(item);
    const recipeIngredients = recipe?.ingredients?.[getLang()] || [];
    const recipeLanguageReady = linesMatchLanguage(recipeIngredients, getLang());
    if (!recipe || !recipeLanguageReady) return fallback;

    const lang = getLang();
    const englishIngredients = recipe.ingredients?.en || [];
    const spanishIngredients = recipe.ingredients?.es || [];
    const currentIngredients = recipe.ingredients?.[lang] || [];
    const itemText = cleanIngredientForGrocery(canonicalText(item.text)).toLowerCase();
    const itemKey = `${item.ingredientKey || ""}`.trim();
    const ingredientSources = [englishIngredients, spanishIngredients, currentIngredients];
    const keySource = itemKey
      ? ingredientSources.find((ingredients) => ingredients.some((ingredient) => {
        const parsed = parseIngredientAmount(ingredient);
        return normalizedWords(parsed.remainder).join("-") === itemKey;
      }))
      : null;
    const keyIndex = keySource
      ? keySource.findIndex((ingredient) => {
        const parsed = parseIngredientAmount(ingredient);
        return normalizedWords(parsed.remainder).join("-") === itemKey;
      })
      : -1;
    const exactSources = [englishIngredients, spanishIngredients, currentIngredients];
    const exactSource = exactSources.find((ingredients) => ingredients.some((ingredient) => cleanIngredientForGrocery(ingredient).toLowerCase() === itemText));
    const exactIndex = exactSource
      ? exactSource.findIndex((ingredient) => cleanIngredientForGrocery(ingredient).toLowerCase() === itemText)
      : -1;
    const index = keyIndex >= 0 ? keyIndex : exactIndex;
    const translated = currentIngredients[index] || "";
    return translated && textMatchesLanguage(translated, getLang())
      ? translated
      : fallback;
  }

  function shopRowParts(item) {
    return groceryRowParts(groceryDisplayText(item));
  }

  function isShopDisplayableItem(item) {
    return Boolean(shopRowParts(item).name);
  }

  function shopDisplayRows(items) {
    return collapseGroceryItemsByDisplayName(items.filter(isShopDisplayableItem), (item) => shopRowParts(item).name)
      .map((row) => ({ ...row.item, collapsedIds: row.ids }));
  }

  function groceryRowIds(item) {
    return Array.isArray(item.collapsedIds) && item.collapsedIds.length ? item.collapsedIds : [item.id];
  }

  function groupGroceriesByAisle(items) {
    const groups = new Map();
    items.forEach((item) => {
      const aisle = groceryAisleFor(shopRowParts(item).name || groceryDisplayText(item) || canonicalText(item.text));
      if (!groups.has(aisle)) groups.set(aisle, []);
      groups.get(aisle).push(item);
    });
    return groceryAisleOrder()
      .filter((aisle) => groups.has(aisle))
      .map((aisle) => ({
        aisle,
        label: t(groceryAisleLabelKey(aisle)),
        items: groups.get(aisle),
      }));
  }

  function shoppingOverlapFor(text) {
    return getGroceries().find((item) =>
      !item.inInventory && !item.checked && findInventoryMatch([{ text, stockState: "some" }], item.text)
    ) || null;
  }

  function shoppingMatchForReceiptItem(text) {
    const candidates = getGroceries().filter((item) => !isConfirmedAtHome(item));
    return candidates.find((item) => item.checked
      && findInventoryMatch([{ text, stockState: "some" }], item.text))
      || candidates.find((item) => findInventoryMatch([{ text, stockState: "some" }], item.text))
      || null;
  }

  function groceryAtHomeNote(item) {
    const match = findInventoryMatch(getInventory(), item.text);
    if (!match) return "";
    const quantity = usableLocalizedText(match.quantity, getLang())
      || (Number(match.amount) > 0 ? `${match.amount} ${match.unit || ""}`.trim() : "");
    const updated = new Date(match.updatedAt || match.createdAt || "");
    const days = Number.isNaN(updated.getTime())
      ? null
      : Math.max(0, Math.floor((Date.now() - updated.getTime()) / 86400000));
    const age = days === null ? "" : t(days === 1 ? "inventoryUpdatedOneDay" : "inventoryUpdatedDays").replace("{count}", days);
    return [t("possibleAtHomeLabel"), quantity || inventoryLocationLabel(match.location), age].filter(Boolean).join(" · ");
  }

  function inventoryDecisionFor(item) {
    if (["review", "need", "have"].includes(item.inventoryDecision)) return item.inventoryDecision;
    return item.inInventory ? "review" : "";
  }

  function isConfirmedAtHome(item) {
    return inventoryDecisionFor(item) === "have";
  }

  function inventoryShoppingNote(item) {
    const overlap = shoppingOverlapFor(item.text);
    return overlap ? `${t("onShoppingList")}: ${usableLocalizedText(overlap.text, getLang())}` : "";
  }

  function purchasedGroceries() {
    return getGroceries().filter((item) => item.checked
      && inventoryDecisionFor(item) !== "review"
      && !isConfirmedAtHome(item));
  }

  function renderPurchasedAction() {
    const button = $("#restockPurchased");
    const prompt = $("#finishShoppingPrompt");
    const count = purchasedGroceries().length;
    const hasShoppingItems = getGroceries().some((item) => !isConfirmedAtHome(item));
    if (button) {
      button.hidden = !hasShoppingItems;
      button.textContent = count
        ? t("finishShoppingCount").replace("{count}", `${count}`)
        : t("finishShopping");
    }
    const showPrompt = hasShoppingItems && !Boolean($("body")?.classList?.contains?.("finish-shopping-open"));
    if (prompt) prompt.hidden = !showPrompt;
    $("body")?.classList?.toggle("finish-shopping-visible", showPrompt);
    if (!hasShoppingItems) {
      const panel = $("#finishShoppingPanel");
      if (panel) panel.hidden = true;
    }
  }

  function grocerySection(label, items, options = {}) {
    const sectionIds = items.flatMap(groceryRowIds).join("|");
    const content = `
      <section class="grocery-section${options.checkedSection ? " checked-section" : ""}">
        <div class="grocery-section-header">
          ${options.collapsed ? "" : `<div><h3>${escapeHtml(label)}</h3>${options.count != null ? `<span class="aisle-count">${escapeHtml(`${options.count}`)}</span>` : ""}</div>`}
          <details class="grocery-section-menu">
            <summary>${t("listTools")}</summary>
            <div class="grocery-section-actions">
              ${options.checkedSection ? "" : `<button class="text-button" type="button" data-check-grocery-section="${escapeHtml(sectionIds)}">${t("checkSection")}</button>`}
              <button class="text-button" type="button" data-delete-grocery-section="${escapeHtml(sectionIds)}">${t("deleteSection")}</button>
            </div>
          </details>
        </div>
        ${items.map((item) => {
          const parts = shopRowParts(item);
          if (!parts.name) return "";
          const rowIds = groceryRowIds(item);
          const atHomeNote = groceryAtHomeNote(item);
          const activity = formatItemActivity(item);
          const store = item.store && item.store !== "any" ? groceryStoreLabel(item.store) : "";
          const mealMeta = groceryMealMetaParts(item);
          return `
            <article class="grocery-item-row${inventoryDecisionFor(item) === "review" ? " inventory-review" : ""}${item.checked && inventoryDecisionFor(item) !== "review" ? " is-checked" : " is-unchecked"}">
              <label class="grocery-item">
                <input type="checkbox" data-grocery-id="${escapeHtml(item.id)}" data-collapsed-ids="${escapeHtml(rowIds.join("|"))}" ${item.checked && inventoryDecisionFor(item) !== "review" ? "checked" : ""} />
                  <span>
                    <strong>${escapeHtml(parts.name)}</strong>
                    ${mealMeta.inline}
                    ${atHomeNote ? `<em class="at-home-note">${escapeHtml(atHomeNote)}</em>` : ""}
                    ${activity ? `<em class="item-activity">${escapeHtml(activity)}</em>` : ""}
                </span>
                ${parts.quantityLabel ? `<span class="grocery-qty">${escapeHtml(parts.quantityLabel)}</span>` : ""}
                ${store ? `<small>${escapeHtml(store)}</small>` : ""}
              </label>
              ${mealMeta.extra}
              ${inventoryDecisionFor(item) === "review" ? `<div class="inventory-review-actions" aria-label="${escapeHtml(t("reviewInventoryMatch"))}">
                <button class="ghost-button" type="button" data-inventory-need="${escapeHtml(item.id)}">${t("keepOnList")}</button>
                <button class="text-button" type="button" data-inventory-have="${escapeHtml(item.id)}">${t("haveEnough")}</button>
              </div>` : ""}
            </article>
          `;
        }).join("")}
      </section>
    `;
    return options.collapsed
      ? `<details class="grocery-archive"><summary><span>${escapeHtml(label)}</span><strong>${items.length}</strong></summary>${content}</details>`
      : content;
  }

  function renderGroceries() {
    renderMealFilter();
    const setup = $("#shoppingListSetup");
    if (setup) setup.open = getGroceries().length === 0;
    const groceries = selectedMealFilter
      ? getGroceries().filter((item) => mealUsesFor(item).some((use) => mealFilterKey(use) === selectedMealFilter))
      : selectedRecipeFilter
        ? getGroceries().filter((item) => item.recipeId === selectedRecipeFilter
          || mealUsesFor(item).some((use) => use.recipeId === selectedRecipeFilter))
        : getGroceries();
    const visibleGroceries = groceries.filter(isShopDisplayableItem);
    const activeItems = shopDisplayRows(visibleGroceries.filter((item) => inventoryDecisionFor(item) === "review" || (!item.checked && !isConfirmedAtHome(item))));
    const inventoryItems = shopDisplayRows(visibleGroceries.filter(isConfirmedAtHome));
    const checkedItems = shopDisplayRows(visibleGroceries.filter((item) => item.checked && inventoryDecisionFor(item) !== "review" && !isConfirmedAtHome(item)));
    const sections = groupGroceriesByAisle(activeItems);

    if (!visibleGroceries.length) {
      $("#groceryList").innerHTML = `<div class="grocery-empty-state"><p class="empty-state">${t(selectedMealFilter ? "groceryMealFilterEmpty" : "groceryEmpty")}</p>${!selectedMealFilter && !selectedRecipeFilter ? `<button class="primary-action grocery-empty-action" type="button" data-open-shopping-generator>${t("buildListFromMealPlan")}</button>` : ""}</div>`;
      renderPurchasedAction();
      return;
    }

    $("#groceryList").innerHTML = [
      ...sections.map((section) => grocerySection(section.label, section.items, { count: section.items.length })),
      inventoryItems.length ? grocerySection(t("alreadyHave"), inventoryItems, { checkedSection: true, collapsed: true }) : "",
      checkedItems.length ? grocerySection(t("checkedOffSection"), checkedItems, { checkedSection: true, collapsed: true }) : "",
    ].join("");
    renderPurchasedAction();
  }

  function bindGroceryControls() {
    if (controlsBound) return;
    controlsBound = true;

    $("#groceryMealFilter")?.addEventListener("change", (event) => {
      selectedMealFilter = event.target.value;
      selectedRecipeFilter = "";
      renderGroceries();
    });
    $("#shoppingShowAll")?.addEventListener("click", () => {
      selectedMealFilter = "";
      selectedRecipeFilter = "";
      renderGroceries();
    });

    $("#groceryList").addEventListener("change", async (event) => {
      const checkbox = event.target.closest("[data-grocery-id]");
      if (!checkbox) return;

      const groceries = getGroceries();
      const ids = new Set(`${checkbox.dataset.collapsedIds || checkbox.dataset.groceryId || ""}`.split("|").filter(Boolean));
      if (!ids.size) return;
      setGroceries(groceries.map((grocery) => {
        if (!ids.has(grocery.id)) return grocery;
        const nextItem = { ...grocery, checked: checkbox.checked };
        if (!checkbox.checked && isConfirmedAtHome(grocery)) nextItem.inventoryDecision = "need";
        if (checkbox.checked && grocery.inventorySuggested) nextItem.inventoryDecision = "need";
        nextItem.inInventory = isConfirmedAtHome(grocery);
        touchItem(nextItem);
        return nextItem;
      }));
      renderGroceries();
      await saveGroceries();
    });

    $("#groceryList").addEventListener("click", async (event) => {
      const checkButton = event.target.closest("[data-check-grocery-section]");
      const deleteButton = event.target.closest("[data-delete-grocery-section]");
      const needButton = event.target.closest("[data-inventory-need]");
      const haveButton = event.target.closest("[data-inventory-have]");

      if (needButton || haveButton) {
        event.preventDefault();
        const id = needButton?.dataset.inventoryNeed || haveButton?.dataset.inventoryHave;
        const item = getGroceries().find((entry) => entry.id === id);
        if (!item) return;
        const nextItem = { ...item, inventoryDecision: haveButton ? "have" : "need", inInventory: Boolean(haveButton), checked: Boolean(haveButton) };
        touchItem(nextItem);
        setGroceries(getGroceries().map((entry) => entry.id === item.id ? nextItem : entry));
        renderGroceries();
        await saveGroceries();
        return;
      }

      if (checkButton) {
        event.preventDefault();
        const ids = new Set(checkButton.dataset.checkGrocerySection.split("|").filter(Boolean));
        setGroceries(getGroceries().map((item) => {
          if (!ids.has(item.id)) return item;
          const nextItem = { ...item, checked: true, inInventory: false };
          if (item.inventorySuggested) nextItem.inventoryDecision = "need";
          touchItem(nextItem);
          return nextItem;
        }));
        renderGroceries();
        await saveGroceries();
        return;
      }

      if (deleteButton) {
        event.preventDefault();
        const ids = new Set(deleteButton.dataset.deleteGrocerySection.split("|").filter(Boolean));
        const removed = getGroceries().filter((item) => ids.has(item.id));
        setGroceries(getGroceries().filter((item) => !ids.has(item.id)));
        renderGroceries();
        await saveGroceries();
        offerUndo?.(t("grocerySectionRemoved"), async () => {
          setGroceries([...removed, ...getGroceries()]);
          renderGroceries();
          await saveGroceries();
        });
      }
    });
  }

  return {
    bindGroceryControls,
    inventoryShoppingNote,
    purchasedGroceries,
    renderGroceries,
    showMeal(dateKey, mealSlot) {
      selectedRecipeFilter = "";
      selectedMealFilter = mealFilterKey({ dateKey, mealSlot });
      renderGroceries();
    },
    showRecipe(recipeId) {
      selectedMealFilter = "";
      selectedRecipeFilter = `${recipeId || ""}`;
      renderGroceries();
    },
    shoppingMatchForReceiptItem,
  };
}
