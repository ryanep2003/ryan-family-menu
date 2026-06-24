export function createInventoryUi({
  $,
  $$,
  t,
  escapeHtml,
  groceryItem,
  inventoryItem,
  mergeInventory,
  inventoryShoppingNote,
  renderGroceries,
  bindGroceryControls,
  saveGroceries,
  saveInventory,
  getInventory,
  setInventory,
  getGroceries,
  setGroceries,
  getInventoryMode,
  setInventoryMode,
  getInventoryFilter,
  getInventorySuggestions,
  setInventorySuggestions,
}) {
  function inventoryLocationLabel(location) {
    if (location === "fridge") return t("locationFridge");
    if (location === "freezer") return t("locationFreezer");
    if (location === "household") return t("locationHousehold");
    return t("locationPantry");
  }

  function inventoryStockLabel(stockState) {
    return t({ full: "stockFull", some: "stockSome", low: "stockLow", out: "stockOut" }[stockState] || "stockSome");
  }

  function renderInventoryMode() {
    $("#shoppingPanel").hidden = getInventoryMode() !== "shopping";
    $("#homePanel").hidden = getInventoryMode() !== "home";
    $$("[data-inventory-mode]").forEach((button) => {
      const active = button.dataset.inventoryMode === getInventoryMode();
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", `${active}`);
    });
  }

  function renderInventory() {
    const inventory = getInventory();
    const inventoryFilter = getInventoryFilter();
    const groups = [
      { key: "pantry", label: t("locationPantry") },
      { key: "fridge", label: t("locationFridge") },
      { key: "freezer", label: t("locationFreezer") },
      { key: "household", label: t("locationHousehold") },
    ].map((group) => ({
      ...group,
      items: inventory.filter((item) => (item.location || "pantry") === group.key
        && (inventoryFilter === "all" || group.key === inventoryFilter)),
    })).filter((group) => group.items.length);

    if (!inventory.length) {
      $("#inventoryList").innerHTML = `<p class="empty-state">${t("inventoryEmpty")}</p>`;
      return;
    }

    if (!groups.length) {
      $("#inventoryList").innerHTML = `<p class="empty-state">${t("noInventoryMatches")}</p>`;
      return;
    }

    $("#inventoryList").innerHTML = groups.map((group) => `
      <section class="inventory-section">
        <h3>${escapeHtml(group.label)}</h3>
        ${group.items.map((item) => `
          <div class="inventory-item">
            ${item.photos?.[0] ? `<img src="${escapeHtml(item.photos[0])}" alt="" />` : ""}
            <span class="inventory-item-copy">
              <strong>${escapeHtml(item.text)}</strong>
              <em>${escapeHtml(item.quantity || inventoryLocationLabel(item.location))}</em>
              ${inventoryShoppingNote(item) ? `<em class="shopping-overlap">${escapeHtml(inventoryShoppingNote(item))}</em>` : ""}
            </span>
            <select class="stock-select stock-${escapeHtml(item.stockState || "some")}" data-stock-state="${escapeHtml(item.id)}" aria-label="${escapeHtml(item.text)} stock">
              ${["full", "some", "low", "out"].map((state) => `<option value="${state}" ${state === (item.stockState || "some") ? "selected" : ""}>${inventoryStockLabel(state)}</option>`).join("")}
            </select>
            <div class="inventory-item-actions">
              <button class="ghost-button" type="button" data-add-inventory-to-shopping="${escapeHtml(item.id)}">${t("addToShopping")}</button>
              <button class="text-button" type="button" data-remove-inventory="${escapeHtml(item.id)}">${t("remove")}</button>
            </div>
          </div>
        `).join("")}
      </section>
    `).join("");
  }

  function bindInventoryControls() {
    $$("[data-stock-state]").forEach((select) => {
      select.addEventListener("change", async () => {
        const item = getInventory().find((entry) => entry.id === select.dataset.stockState);
        if (!item) return;
        item.stockState = select.value;
        item.updatedAt = new Date().toISOString();
        renderInventory();
        bindInventoryControls();
        await saveInventory();
      });
    });

    $$("[data-add-inventory-to-shopping]").forEach((button) => {
      button.addEventListener("click", async () => {
        const item = getInventory().find((entry) => entry.id === button.dataset.addInventoryToShopping);
        if (!item) return;
        item.stockState = "out";
        item.updatedAt = new Date().toISOString();
        const groceries = getGroceries();
        const matchingGrocery = groceries.find((entry) => entry.text.toLowerCase() === item.text.toLowerCase());
        if (matchingGrocery) {
          matchingGrocery.checked = false;
          matchingGrocery.inInventory = false;
          matchingGrocery.source = "inventory-restock";
        } else {
          setGroceries([groceryItem(item.text, { source: "inventory-restock" }), ...groceries]);
        }
        setInventoryMode("shopping");
        $("#groceryStatus").textContent = t("addedToShopping");
        renderGroceries();
        renderInventory();
        renderInventoryMode();
        bindGroceryControls();
        bindInventoryControls();
        await Promise.all([saveInventory(), saveGroceries()]);
      });
    });

    $$("[data-remove-inventory]").forEach((button) => {
      button.addEventListener("click", async () => {
        setInventory(getInventory().filter((item) => item.id !== button.dataset.removeInventory));
        renderInventory();
        bindInventoryControls();
        await saveInventory();
      });
    });
  }

  function renderInventorySuggestions() {
    const panel = $("#inventorySuggestions");
    if (!panel) return;
    const inventorySuggestions = getInventorySuggestions();

    if (!inventorySuggestions.length) {
      panel.hidden = true;
      panel.innerHTML = "";
      return;
    }

    panel.hidden = false;
    panel.innerHTML = `
      <h3>${t("inventorySuggestionsHeading")}</h3>
      <div class="suggestion-list">
        ${inventorySuggestions.map((item, index) => `
          <label class="suggestion-item">
            <input type="checkbox" data-inventory-suggestion="${index}" checked />
            <span>
              <strong>${escapeHtml(item.text)}</strong>
              <em>${escapeHtml([item.quantity, inventoryLocationLabel(item.location)].filter(Boolean).join(" · "))}</em>
            </span>
          </label>
        `).join("")}
      </div>
      <button class="primary-action" type="button" id="addInventorySuggestions">${t("addSelectedInventory")}</button>
    `;

    $("#addInventorySuggestions").addEventListener("click", async () => {
      const selected = $$("[data-inventory-suggestion]")
        .filter((checkbox) => checkbox.checked)
        .map((checkbox) => getInventorySuggestions()[Number(checkbox.dataset.inventorySuggestion)])
        .filter(Boolean);

      if (!selected.length) return;

      setInventory(mergeInventory(getInventory(), selected.map((item) => inventoryItem(
        item.text,
        item.quantity,
        item.location,
        []
      ))));
      setInventorySuggestions([]);
      renderInventorySuggestions();
      renderInventory();
      bindInventoryControls();
      await saveInventory();
    });
  }

  return {
    bindInventoryControls,
    inventoryLocationLabel,
    inventoryStockLabel,
    renderInventory,
    renderInventoryMode,
    renderInventorySuggestions,
  };
}
