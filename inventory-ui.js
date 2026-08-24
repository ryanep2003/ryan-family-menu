import { canonicalText, localizedText } from "./localized-data.js";
import { inventoryExpirationState } from "./inventory-logic.js";

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
  offerUndo,
  getInventory,
  setInventory,
  getGroceries,
  setGroceries,
  getInventoryMode,
  getInventoryFilter,
  getHouseholdMember = () => "Family",
  formatItemActivity = () => "",
  getLang,
  getInventorySuggestions,
  setInventorySuggestions,
}) {
  let selectionMode = false;
  let selectedIds = new Set();

  function touchItem(item) {
    item.updatedBy = getHouseholdMember();
    item.updatedAt = new Date().toISOString();
  }

  function inventoryLocationLabel(location) {
    if (location === "fridge") return t("locationFridge");
    if (location === "freezer") return t("locationFreezer");
    if (location === "household") return t("locationHousehold");
    return t("locationPantry");
  }

  function inventoryStockLabel(stockState) {
    return t({ full: "stockFull", some: "stockSome", low: "stockLow", out: "stockOut" }[stockState] || "stockSome");
  }

  function inventoryUnitLabel(unit) {
    return t({
      each: "unitEach", package: "unitPackage", container: "unitContainer", cup: "unitCup",
      oz: "unitOunce", lb: "unitPound", g: "unitGram", kg: "unitKilogram",
    }[unit] || "unitEach");
  }

  function expirationLabel(item) {
    const state = inventoryExpirationState(item);
    if (state === "expired") return t("inventoryExpired");
    if (state === "soon") return t("inventoryUseSoon").replace("{date}", item.expiresOn);
    return item.expiresOn ? t("inventoryExpires").replace("{date}", item.expiresOn) : "";
  }

  function visibleInventoryItems() {
    const inventory = getInventory();
    const inventoryFilter = getInventoryFilter();
    const inventoryQuery = canonicalText($("#inventorySearch")?.value || "").trim().toLowerCase();
    return inventory.filter((item) => {
      const matchesQuery = !inventoryQuery
        || canonicalText(localizedText(item.text, getLang())).toLowerCase().includes(inventoryQuery);
      const matchesFilter = inventoryQuery
        || inventoryFilter === "all"
        || (inventoryFilter === "attention" && (["low", "out"].includes(item.stockState) || ["expired", "soon"].includes(inventoryExpirationState(item))))
        || (item.location || "pantry") === inventoryFilter;
      return matchesQuery && matchesFilter;
    });
  }

  function updateBulkToolbar() {
    selectedIds = new Set([...selectedIds].filter((id) => getInventory().some((item) => item.id === id)));
    const toolbar = $("#inventoryBulkToolbar");
    const toggle = $("#inventorySelectMode");
    if (toolbar) toolbar.hidden = !selectionMode;
    if (toggle) {
      toggle.textContent = selectionMode ? t("doneSelecting") : t("selectInventory");
      toggle.setAttribute?.("aria-pressed", `${selectionMode}`);
    }
    const count = $("#inventoryBulkCount");
    if (count) count.textContent = t("inventorySelectedCount").replace("{count}", `${selectedIds.size}`);
    ["#inventoryRemoveSelected", "#inventoryClearSelection"].forEach((selector) => {
      const button = $(selector);
      if (button) button.disabled = selectedIds.size === 0;
    });
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
    if (globalThis.document?.activeElement?.closest?.("#inventoryList")) return;
    const inventory = getInventory();
    const inventoryFilter = getInventoryFilter();
    const inventoryQuery = canonicalText($("#inventorySearch")?.value || "").trim().toLowerCase();
    const visibleItems = visibleInventoryItems();
    const groups = [
      { key: "pantry", label: t("locationPantry") },
      { key: "fridge", label: t("locationFridge") },
      { key: "freezer", label: t("locationFreezer") },
      { key: "household", label: t("locationHousehold") },
    ].map((group) => ({
      ...group,
      items: visibleItems.filter((item) => (item.location || "pantry") === group.key)
        .sort((left, right) => (left.expiresOn || "9999-12-31").localeCompare(right.expiresOn || "9999-12-31")),
    })).filter((group) => group.items.length);

    updateBulkToolbar();

    if (!inventory.length) {
      $("#inventoryList").innerHTML = `<p class="empty-state">${t("inventoryEmpty")}</p>`;
      return;
    }

    if (!groups.length) {
      const emptyKey = inventoryQuery
        ? "inventorySearchEmpty"
        : inventoryFilter === "attention" ? "inventoryAttentionEmpty" : "noInventoryMatches";
      $("#inventoryList").innerHTML = `<p class="empty-state">${t(emptyKey)}</p>`;
      return;
    }

    $("#inventoryList").innerHTML = groups.map((group) => `
      <section class="inventory-section">
        <h3>${escapeHtml(group.label)}</h3>
        ${group.items.map((item) => `
          <div class="inventory-item${item.photos?.[0] ? " has-photo" : ""}">
            ${selectionMode ? `<label class="inventory-select-control"><span class="visually-hidden">${escapeHtml(t("selectInventoryItem").replace("{item}", localizedText(item.text, getLang())))}</span><input type="checkbox" data-select-inventory="${escapeHtml(item.id)}" ${selectedIds.has(item.id) ? "checked" : ""} /></label>` : ""}
            ${item.photos?.[0] ? `<img src="${escapeHtml(item.photos[0])}" alt="${escapeHtml(localizedText(item.text, getLang()))}" loading="lazy" decoding="async" />` : ""}
            <div class="inventory-item-main">
              <span class="inventory-item-copy">
                <strong>${escapeHtml(localizedText(item.text, getLang()))}</strong>
                <em>${escapeHtml(item.amount > 0
                  ? `${item.amount} ${inventoryUnitLabel(item.unit)}`
                  : localizedText(item.quantity, getLang()) || inventoryLocationLabel(item.location))}</em>
                ${expirationLabel(item) ? `<em class="inventory-expiration expiration-${inventoryExpirationState(item)}">${escapeHtml(expirationLabel(item))}</em>` : ""}
                ${formatItemActivity(item) ? `<em class="item-activity">${escapeHtml(formatItemActivity(item))}</em>` : ""}
                ${inventoryShoppingNote(item) ? `<em class="shopping-overlap">${escapeHtml(inventoryShoppingNote(item))}</em>` : ""}
                ${["low", "out"].includes(item.stockState) && !inventoryShoppingNote(item)
                  ? `<button class="inventory-restock-action" type="button" data-add-inventory-to-shopping="${escapeHtml(item.id)}">${t("addToShopping")}</button>`
                  : ""}
              </span>
              <details class="inventory-row-details">
                <summary>${escapeHtml(t("editInventoryItem"))}</summary>
                <div class="inventory-detail-controls">
                  <label>
                    <span>${escapeHtml(t("inventoryAmountShort"))}</span>
                    <input type="number" min="0" max="10000" step="0.25" value="${Number(item.amount) || 0}" data-inventory-amount="${escapeHtml(item.id)}" />
                  </label>
                  <label>
                    <span>${escapeHtml(t("inventoryUnitShort"))}</span>
                    <select data-inventory-unit="${escapeHtml(item.id)}">
                      ${["each", "package", "container", "cup", "oz", "lb", "g", "kg"].map((unit) => `<option value="${unit}" ${unit === (item.unit || "each") ? "selected" : ""}>${escapeHtml(inventoryUnitLabel(unit))}</option>`).join("")}
                    </select>
                  </label>
                  <label>
                    <span>${escapeHtml(t("expiresOn"))}</span>
                    <input type="date" value="${escapeHtml(item.expiresOn || "")}" data-inventory-expiration="${escapeHtml(item.id)}" />
                  </label>
                </div>
              </details>
              <label class="inventory-stock-control">
                <span>${escapeHtml(t("stockLabel"))}</span>
                <select class="stock-select stock-${escapeHtml(item.stockState || "some")}" data-stock-state="${escapeHtml(item.id)}" aria-label="${escapeHtml(t("stockControlLabel").replace("{item}", localizedText(item.text, getLang())))}">
                  ${["full", "some", "low", "out"].map((state) => `<option value="${state}" ${state === (item.stockState || "some") ? "selected" : ""}>${inventoryStockLabel(state)}</option>`).join("")}
                </select>
              </label>
              <details class="inventory-row-menu">
                <summary aria-label="${escapeHtml(t("itemActions").replace("{item}", localizedText(item.text, getLang())))}"><span class="inventory-menu-icon" aria-hidden="true">&#8942;</span></summary>
                <div class="inventory-item-actions">
                  ${["low", "out"].includes(item.stockState)
                    ? ""
                    : `<button class="ghost-button" type="button" data-add-inventory-to-shopping="${escapeHtml(item.id)}">${t("addToShopping")}</button>`}
                  <button class="text-button" type="button" data-remove-inventory="${escapeHtml(item.id)}">${t("remove")}</button>
                </div>
              </details>
            </div>
          </div>
        `).join("")}
      </section>
    `).join("");
  }

  function bindInventoryControls() {
    const selectToggle = $("#inventorySelectMode");
    if (selectToggle && !selectToggle.dataset?.inventoryBound) {
      selectToggle.dataset.inventoryBound = "true";
      selectToggle.addEventListener?.("click", () => {
        selectionMode = !selectionMode;
        if (!selectionMode) selectedIds.clear();
        renderInventory();
        bindInventoryControls();
      });
    }

    const inventoryList = $("#inventoryList");
    if (inventoryList && !inventoryList.dataset?.inventoryBulkBound) {
      inventoryList.dataset.inventoryBulkBound = "true";
      inventoryList.addEventListener?.("change", (event) => {
        const checkbox = event.target.closest?.("[data-select-inventory]");
        if (!checkbox) return;
        if (checkbox.checked) selectedIds.add(checkbox.dataset.selectInventory);
        else selectedIds.delete(checkbox.dataset.selectInventory);
        updateBulkToolbar();
      });
    }

    const bindBulkAction = (selector, handler) => {
      const button = $(selector);
      if (!button || button.dataset?.inventoryBound) return;
      button.dataset.inventoryBound = "true";
      button.addEventListener?.("click", handler);
    };

    bindBulkAction("#inventorySelectVisible", () => {
      visibleInventoryItems().forEach((item) => selectedIds.add(item.id));
      updateBulkToolbar();
      renderInventory();
    });
    bindBulkAction("#inventoryClearSelection", () => {
      selectedIds.clear();
      updateBulkToolbar();
      renderInventory();
    });
    bindBulkAction("#inventoryRemoveSelected", async () => {
      const current = getInventory();
      const removed = current.filter((item) => selectedIds.has(item.id));
      if (!removed.length) return;
      if (globalThis.confirm && !globalThis.confirm(t("removeSelectedInventoryConfirm"))) return;
      setInventory(current.filter((item) => !selectedIds.has(item.id)));
      selectedIds.clear();
      renderInventory();
      bindInventoryControls();
      await saveInventory();
      offerUndo?.(t("inventoryItemsRemoved"), async () => {
        setInventory([...removed, ...getInventory()]);
        renderInventory();
        bindInventoryControls();
        await saveInventory();
      });
    });
    bindBulkAction("#inventoryClearAll", async () => {
      const current = getInventory();
      if (!current.length) return;
      if (globalThis.confirm && !globalThis.confirm(t("clearAllInventoryConfirm"))) return;
      setInventory([]);
      selectedIds.clear();
      selectionMode = false;
      renderInventory();
      bindInventoryControls();
      await saveInventory();
      offerUndo?.(t("inventoryCleared"), async () => {
        setInventory(current);
        renderInventory();
        bindInventoryControls();
        await saveInventory();
      });
    });

    $$('[data-inventory-amount], [data-inventory-unit], [data-inventory-expiration]').forEach((control) => {
      control.addEventListener("change", async () => {
        const id = control.dataset.inventoryAmount || control.dataset.inventoryUnit || control.dataset.inventoryExpiration;
        const item = getInventory().find((entry) => entry.id === id);
        if (!item) return;
        const nextItem = { ...item };
        if (control.dataset.inventoryAmount) {
          nextItem.amount = Math.min(10000, Math.max(0, Number(control.value) || 0));
          if (nextItem.amount === 0) nextItem.stockState = "out";
          else if (nextItem.stockState === "out") nextItem.stockState = "some";
        } else if (control.dataset.inventoryUnit) {
          nextItem.unit = control.value;
        } else {
          nextItem.expiresOn = /^\d{4}-\d{2}-\d{2}$/.test(control.value) ? control.value : "";
        }
        touchItem(nextItem);
        setInventory(getInventory().map((entry) => entry.id === item.id ? nextItem : entry));
        renderInventory();
        bindInventoryControls();
        await saveInventory();
      });
    });

    $$("[data-stock-state]").forEach((select) => {
      select.addEventListener("change", async () => {
        const item = getInventory().find((entry) => entry.id === select.dataset.stockState);
        if (!item) return;
        const nextItem = { ...item, stockState: select.value };
        touchItem(nextItem);
        setInventory(getInventory().map((entry) => entry.id === item.id ? nextItem : entry));
        renderInventory();
        bindInventoryControls();
        await saveInventory();
      });
    });

    $$("[data-add-inventory-to-shopping]").forEach((button) => {
      button.addEventListener("click", async () => {
        const item = getInventory().find((entry) => entry.id === button.dataset.addInventoryToShopping);
        if (!item) return;
        const nextItem = { ...item, stockState: "out" };
        touchItem(nextItem);
        setInventory(getInventory().map((entry) => entry.id === item.id ? nextItem : entry));
        const groceries = getGroceries();
        const matchingGrocery = groceries.find((entry) => canonicalText(entry.text).toLowerCase() === canonicalText(item.text).toLowerCase());
        if (matchingGrocery) {
          const nextGrocery = { ...matchingGrocery, checked: false, inInventory: false, source: "inventory-restock" };
          touchItem(nextGrocery);
          setGroceries(groceries.map((entry) => entry.id === matchingGrocery.id ? nextGrocery : entry));
        } else {
          setGroceries([groceryItem(item.text, {
            source: "inventory-restock",
            updatedBy: getHouseholdMember(),
          }), ...groceries]);
        }
        $("#inventoryStatus").textContent = t("addedToShopping");
        renderGroceries();
        renderInventory();
        bindGroceryControls();
        bindInventoryControls();
        await Promise.all([saveInventory(), saveGroceries()]);
      });
    });

    $$("[data-remove-inventory]").forEach((button) => {
      button.addEventListener("click", async () => {
        const current = getInventory();
        const index = current.findIndex((item) => item.id === button.dataset.removeInventory);
        const removed = current[index];
        setInventory(current.filter((item) => item.id !== button.dataset.removeInventory));
        renderInventory();
        bindInventoryControls();
        await saveInventory();
        if (removed) offerUndo?.(t("inventoryItemRemoved"), async () => {
          const restored = [...getInventory()];
          restored.splice(Math.max(index, 0), 0, removed);
          setInventory(restored);
          renderInventory();
          bindInventoryControls();
          await saveInventory();
        });
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
              <strong>${escapeHtml(localizedText(item.text, getLang()))}</strong>
              <em>${escapeHtml([localizedText(item.quantity, getLang()), inventoryLocationLabel(item.location)].filter(Boolean).join(" · "))}</em>
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
        [],
        "some",
        getLang(),
        getHouseholdMember()
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
