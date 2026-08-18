import { allLocalizedText, canonicalText, localizedTextExact } from "./localized-data.js";
import { linesMatchLanguage, textMatchesLanguage } from "./language-quality.js";

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

  function mealUseRecipeName(use) {
    const recipe = use.recipeId ? allRecipes().find((entry) => entry.id === use.recipeId) : null;
    return recipe ? localize(recipe.name) : localizedTextExact(use.recipeName, getLang());
  }

  function mealFilterLabel(use) {
    return t("groceryMealFilterOption")
      .replace("{date}", mealDateLabel(use.dateKey))
      .replace("{meal}", t(`${use.mealSlot}Slot`));
  }

  function groceryMealUseNote(use) {
    const note = t("groceryMealUse")
      .replace("{date}", mealDateLabel(use.dateKey))
      .replace("{meal}", t(`${use.mealSlot}Slot`))
      .replace("{recipe}", mealUseRecipeName(use) || t("translationPendingShort"));
    const details = [
      Number(use.servings) > 0
        ? t("groceryMealServings").replace("{count}", `${use.servings}`)
        : "",
      Number(use.batches) > 0
        ? t("groceryMealBatches").replace("{count}", `${use.batches}`)
        : "",
    ].filter(Boolean);
    return [note, ...details].join(" · ");
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
    if (recipe) return localize(recipe.name) || t("translationPendingShort");
    if (item.recipeName) return localizedTextExact(item.recipeName, getLang()) || t("translationPendingShort");
    if (item.source === "inventory-restock") return t("restockSource");
    return t("addOnsSection");
  }

  function groceryDisplayText(item) {
    const direct = localizedTextExact(item.text, getLang());
    const recipe = recipeForGroceryItem(item);
    const recipeIngredients = recipe?.ingredients?.[getLang()] || [];
    const recipeLanguageReady = linesMatchLanguage(recipeIngredients, getLang());
    if (direct && textMatchesLanguage(direct, getLang()) && recipeLanguageReady) return direct;
    if (!recipe) return t("translationPendingShort");
    if (!recipeLanguageReady) return t("translationPendingShort");

    const lang = getLang();
    const englishIngredients = recipe.ingredients?.en || [];
    const spanishIngredients = recipe.ingredients?.es || [];
    const currentIngredients = recipe.ingredients?.[lang] || [];
    const itemText = cleanIngredientForGrocery(canonicalText(item.text)).toLowerCase();
    const ingredientIndex = [...englishIngredients, ...spanishIngredients, ...currentIngredients]
      .findIndex((ingredient) => cleanIngredientForGrocery(ingredient).toLowerCase() === itemText);
    const index = ingredientIndex >= englishIngredients.length + spanishIngredients.length
      ? ingredientIndex - englishIngredients.length - spanishIngredients.length
      : ingredientIndex >= englishIngredients.length
        ? ingredientIndex - englishIngredients.length
        : ingredientIndex;
    const translated = currentIngredients[index] || "";
    return translated && textMatchesLanguage(translated, getLang())
      ? translated
      : t("translationPendingShort");
  }

  function groupGroceriesBySource(items) {
    const groups = new Map();
    items.forEach((item) => {
      const label = grocerySourceLabel(item);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(item);
    });
    return [...groups.entries()].map(([label, groupItems]) => ({ label, items: groupItems }));
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
    const quantity = localizedTextExact(match.quantity, getLang())
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
    return overlap ? `${t("onShoppingList")}: ${localizedTextExact(overlap.text, getLang()) || t("translationPendingShort")}` : "";
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
    const showPrompt = count > 0 && !Boolean($("body")?.classList?.contains?.("finish-shopping-open"));
    if (prompt) prompt.hidden = !showPrompt;
    $("body")?.classList?.toggle("finish-shopping-visible", showPrompt);
    if (!hasShoppingItems) {
      const panel = $("#finishShoppingPanel");
      if (panel) panel.hidden = true;
    }
  }

  function grocerySection(label, items, options = {}) {
    const sectionIds = items.map((item) => item.id).join("|");
    const content = `
      <section class="grocery-section${options.checkedSection ? " checked-section" : ""}">
        <div class="grocery-section-header">
          ${options.collapsed ? "" : `<h3>${escapeHtml(label)}</h3>`}
          <div class="grocery-section-actions">
            ${options.checkedSection ? "" : `<button class="text-button" type="button" data-check-grocery-section="${escapeHtml(sectionIds)}">${t("checkSection")}</button>`}
            <button class="text-button" type="button" data-delete-grocery-section="${escapeHtml(sectionIds)}">${t("deleteSection")}</button>
          </div>
        </div>
        ${items.map((item) => {
          const displayText = groceryDisplayText(item);
          const atHomeNote = groceryAtHomeNote(item);
          const mealUseNotes = mealUsesFor(item)
            .sort((left, right) => {
              if (!selectedMealFilter) return 0;
              return Number(mealFilterKey(right) === selectedMealFilter) - Number(mealFilterKey(left) === selectedMealFilter);
            })
            .map(groceryMealUseNote);
          const activity = formatItemActivity(item);
          const store = item.store && item.store !== "any" ? groceryStoreLabel(item.store) : "";
          return `
            <article class="grocery-item-row${inventoryDecisionFor(item) === "review" ? " inventory-review" : ""}">
              <label class="grocery-item">
                <input type="checkbox" data-grocery-id="${escapeHtml(item.id)}" ${item.checked && inventoryDecisionFor(item) !== "review" ? "checked" : ""} />
                <span>
                  <strong${displayText === t("translationPendingShort") ? ` class="translation-placeholder"` : ""}>${escapeHtml(displayText)}</strong>
                  ${atHomeNote ? `<em class="at-home-note">${escapeHtml(atHomeNote)}</em>` : ""}
                  ${mealUseNotes.length ? `<span class="meal-use-list" aria-label="${escapeHtml(t("groceryPlannedFor"))}">
                    ${mealUseNotes.slice(0, 3).map((note) => `<em class="meal-use-note">${escapeHtml(note)}</em>`).join("")}
                    ${mealUseNotes.length > 3 ? `<em class="meal-use-more">${escapeHtml(t("groceryMealUseMore").replace("{count}", `${mealUseNotes.length - 3}`))}</em>` : ""}
                  </span>` : ""}
                  ${activity ? `<em class="item-activity">${escapeHtml(activity)}</em>` : ""}
                </span>
                ${store ? `<small>${escapeHtml(store)}</small>` : ""}
              </label>
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
      : getGroceries();
    const activeItems = groceries.filter((item) => inventoryDecisionFor(item) === "review" || (!item.checked && !isConfirmedAtHome(item)));
    const inventoryItems = groceries.filter(isConfirmedAtHome);
    const checkedItems = groceries.filter((item) => item.checked && inventoryDecisionFor(item) !== "review" && !isConfirmedAtHome(item));
    const sections = groupGroceriesBySource(activeItems);

    if (!groceries.length) {
      $("#groceryList").innerHTML = `<p class="empty-state">${t(selectedMealFilter ? "groceryMealFilterEmpty" : "groceryEmpty")}</p>`;
      renderPurchasedAction();
      return;
    }

    $("#groceryList").innerHTML = [
      ...sections.map((section) => grocerySection(section.label, section.items)),
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
      renderGroceries();
    });

    $("#groceryList").addEventListener("change", async (event) => {
      const checkbox = event.target.closest("[data-grocery-id]");
      if (!checkbox) return;

      const groceries = getGroceries();
      const item = groceries.find((grocery) => grocery.id === checkbox.dataset.groceryId);
      if (!item) return;
      const nextItem = { ...item, checked: checkbox.checked };
      if (!checkbox.checked && isConfirmedAtHome(item)) nextItem.inventoryDecision = "need";
      if (checkbox.checked && item.inventorySuggested) nextItem.inventoryDecision = "need";
      nextItem.inInventory = isConfirmedAtHome(item);
      touchItem(nextItem);
      setGroceries(groceries.map((entry) => entry.id === item.id ? nextItem : entry));
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
      selectedMealFilter = mealFilterKey({ dateKey, mealSlot });
      renderGroceries();
    },
    shoppingMatchForReceiptItem,
  };
}
