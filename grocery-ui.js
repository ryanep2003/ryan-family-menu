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
  saveGroceries,
}) {
  let controlsBound = false;

  function recipeForGroceryItem(item) {
    if (item.recipeId) {
      const byId = allRecipes().find((recipe) => recipe.id === item.recipeId);
      if (byId) return byId;
    }

    if (!item.recipeName) return null;
    return allRecipes().find((recipe) => [
      localize(recipe.name),
      recipe.name?.en,
      recipe.name?.es,
    ].includes(item.recipeName)) || null;
  }

  function grocerySourceLabel(item) {
    const recipe = recipeForGroceryItem(item);
    if (recipe) return localize(recipe.name);
    if (item.recipeName) return item.recipeName;
    if (item.source === "inventory-restock") return t("restockSource");
    return t("addOnsSection");
  }

  function groceryIngredientTranslation(item) {
    const recipe = recipeForGroceryItem(item);
    if (!recipe) return "";

    const lang = getLang();
    const englishIngredients = recipe.ingredients?.en || [];
    const spanishIngredients = recipe.ingredients?.es || [];
    const currentIngredients = recipe.ingredients?.[lang] || englishIngredients;
    const itemText = cleanIngredientForGrocery(item.text).toLowerCase();
    const ingredientIndex = [...englishIngredients, ...spanishIngredients, ...currentIngredients]
      .findIndex((ingredient) => cleanIngredientForGrocery(ingredient).toLowerCase() === itemText);
    const index = ingredientIndex >= englishIngredients.length + spanishIngredients.length
      ? ingredientIndex - englishIngredients.length - spanishIngredients.length
      : ingredientIndex >= englishIngredients.length
        ? ingredientIndex - englishIngredients.length
        : ingredientIndex;
    const translated = currentIngredients[index] || "";

    return cleanIngredientForGrocery(translated).toLowerCase() === itemText ? "" : translated;
  }

  function groceryItemNote(item) {
    if (item.source === "week-plan") return t("weekPlanSource");
    if (item.source === "recipe-detail") return t("selectedRecipeSource");
    if (item.source === "inventory-restock") return t("restockSource");
    return t("manualSource");
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
    return `${t("alreadyAtHomeLabel")}: ${match.quantity || inventoryLocationLabel(match.location)}`;
  }

  function inventoryShoppingNote(item) {
    const overlap = shoppingOverlapFor(item.text);
    return overlap ? `${t("onShoppingList")}: ${overlap.text}` : "";
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
    return `
      <section class="grocery-section${options.checkedSection ? " checked-section" : ""}">
        <div class="grocery-section-header">
          <h3>${escapeHtml(label)}</h3>
          <div class="grocery-section-actions">
            ${options.checkedSection ? "" : `<button class="text-button" type="button" data-check-grocery-section="${escapeHtml(sectionIds)}">${t("checkSection")}</button>`}
            <button class="text-button" type="button" data-delete-grocery-section="${escapeHtml(sectionIds)}">${t("deleteSection")}</button>
          </div>
        </div>
        ${items.map((item) => {
          const translation = groceryIngredientTranslation(item);
          const atHomeNote = groceryAtHomeNote(item);
          return `
            <label class="grocery-item">
              <input type="checkbox" data-grocery-id="${item.id}" ${item.checked ? "checked" : ""} />
              <span>
                <strong>${escapeHtml(item.text)}</strong>
                ${translation ? `<em class="translation-note">${escapeHtml(translation)}</em>` : ""}
                <em>${escapeHtml(groceryItemNote(item))}</em>
                ${atHomeNote ? `<em class="at-home-note">${escapeHtml(atHomeNote)}</em>` : ""}
              </span>
              <small>${escapeHtml(groceryStoreLabel(item.store))}</small>
            </label>
          `;
        }).join("")}
      </section>
    `;
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
      inventoryItems.length ? grocerySection(t("alreadyHave"), inventoryItems, { checkedSection: true }) : "",
      checkedItems.length ? grocerySection(t("checkedOffSection"), checkedItems, { checkedSection: true }) : "",
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
          if (ids.has(item.id)) item.checked = true;
        });
        renderGroceries();
        await saveGroceries();
        return;
      }

      if (deleteButton) {
        event.preventDefault();
        const ids = new Set(deleteButton.dataset.deleteGrocerySection.split("|").filter(Boolean));
        setGroceries(getGroceries().filter((item) => !ids.has(item.id)));
        renderGroceries();
        await saveGroceries();
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
