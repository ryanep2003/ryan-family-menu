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
    return getGroceries().find((item) =>
      !item.inInventory && !item.checked && findInventoryMatch([{ text, stockState: "some" }], item.text)
    ) || null;
  }

  function groceryAtHomeNote(item) {
    if (item.inInventory) return "";
    const match = findInventoryMatch(getInventory(), item.text);
    if (!match) return "";
    return `${t("alreadyAtHomeLabel")}: ${localizedTextExact(match.quantity, getLang()) || inventoryLocationLabel(match.location)}`;
  }

  function inventoryShoppingNote(item) {
    const overlap = shoppingOverlapFor(item.text);
    return overlap ? `${t("onShoppingList")}: ${localizedTextExact(overlap.text, getLang()) || t("translationPendingShort")}` : "";
  }

  function purchasedGroceries() {
    return getGroceries().filter((item) => item.checked && !item.inInventory);
  }

  function renderPurchasedAction() {
    const button = $("#restockPurchased");
    const count = purchasedGroceries().length;
    button.hidden = count === 0;
    button.textContent = count ? `${t("movePurchasedHome")} (${count})` : t("movePurchasedHome");
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
          const activity = formatItemActivity(item);
          const store = item.store && item.store !== "any" ? groceryStoreLabel(item.store) : "";
          return `
            <label class="grocery-item">
              <input type="checkbox" data-grocery-id="${escapeHtml(item.id)}" ${item.checked ? "checked" : ""} />
              <span>
                <strong${displayText === t("translationPendingShort") ? ` class="translation-placeholder"` : ""}>${escapeHtml(displayText)}</strong>
                ${atHomeNote ? `<em class="at-home-note">${escapeHtml(atHomeNote)}</em>` : ""}
                ${activity ? `<em class="item-activity">${escapeHtml(activity)}</em>` : ""}
              </span>
              ${store ? `<small>${escapeHtml(store)}</small>` : ""}
            </label>
          `;
        }).join("")}
      </section>
    `;
    return options.collapsed
      ? `<details class="grocery-archive"><summary><span>${escapeHtml(label)}</span><strong>${items.length}</strong></summary>${content}</details>`
      : content;
  }

  function renderGroceries() {
    const groceries = getGroceries();
    const activeItems = groceries.filter((item) => !item.checked && !item.inInventory);
    const inventoryItems = groceries.filter((item) => item.inInventory);
    const checkedItems = groceries.filter((item) => item.checked && !item.inInventory);
    const sections = groupGroceriesBySource(activeItems);

    if (!groceries.length) {
      $("#groceryList").innerHTML = `<p class="empty-state">${t("groceryEmpty")}</p>`;
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

    $("#groceryList").addEventListener("change", async (event) => {
      const checkbox = event.target.closest("[data-grocery-id]");
      if (!checkbox) return;

      const groceries = getGroceries();
      const item = groceries.find((grocery) => grocery.id === checkbox.dataset.groceryId);
      if (!item) return;
      item.checked = checkbox.checked;
      touchItem(item);
      renderGroceries();
      await saveGroceries();
    });

    $("#groceryList").addEventListener("click", async (event) => {
      const checkButton = event.target.closest("[data-check-grocery-section]");
      const deleteButton = event.target.closest("[data-delete-grocery-section]");

      if (checkButton) {
        event.preventDefault();
        const ids = new Set(checkButton.dataset.checkGrocerySection.split("|").filter(Boolean));
        getGroceries().forEach((item) => {
          if (ids.has(item.id)) {
            item.checked = true;
            touchItem(item);
          }
        });
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
    shoppingMatchForReceiptItem,
  };
}
