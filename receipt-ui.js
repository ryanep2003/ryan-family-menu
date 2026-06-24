export function createReceiptUi({
  $,
  $$,
  t,
  escapeHtml,
  inventoryItem,
  mergeInventory,
  readFilesAsDataUrls,
  recognizeReceipt,
  shoppingMatchForReceiptItem,
  renderGroceries,
  bindGroceryControls,
  renderInventory,
  bindInventoryControls,
  saveGroceries,
  saveInventory,
  getReceiptSuggestions,
  setReceiptSuggestions,
  getInventory,
  setInventory,
  getGroceries,
  setGroceries,
}) {
  function renderReceiptSuggestions() {
    const panel = $("#receiptSuggestions");
    if (!panel) return;
    const receiptSuggestions = getReceiptSuggestions();

    if (!receiptSuggestions.length) {
      panel.hidden = true;
      panel.innerHTML = "";
      return;
    }

    panel.hidden = false;
    panel.innerHTML = `
      <h3>${t("receiptSuggestionsHeading")}</h3>
      <div class="suggestion-list">
        ${receiptSuggestions.map((item, index) => `
          <label class="suggestion-item">
            <input type="checkbox" data-receipt-suggestion="${index}" checked />
            <span>
              <strong>${escapeHtml(item.text)}</strong>
              <em>${escapeHtml([item.quantity, item.matchText ? `${t("receiptMatch")}: ${item.matchText}` : t("receiptNewItem")].filter(Boolean).join(" · "))}</em>
            </span>
          </label>
        `).join("")}
      </div>
      <button class="primary-action" type="button" id="addReceiptSuggestions">${t("addSelectedReceipt")}</button>
    `;

    $("#addReceiptSuggestions").addEventListener("click", async () => {
      const selected = $$("[data-receipt-suggestion]")
        .filter((checkbox) => checkbox.checked)
        .map((checkbox) => getReceiptSuggestions()[Number(checkbox.dataset.receiptSuggestion)])
        .filter(Boolean);

      if (!selected.length) return;

      const matchedIds = new Set(selected.map((item) => item.matchId).filter(Boolean));
      setInventory(mergeInventory(getInventory(), selected.map((item) => inventoryItem(
        item.matchText || item.text,
        item.quantity,
        $("#receiptScanLocationInput").value,
        [],
        "full"
      ))));
      setGroceries(getGroceries().filter((item) => !matchedIds.has(item.id)));
      setReceiptSuggestions([]);
      $("#groceryStatus").textContent = t("receiptItemsMoved");
      renderReceiptSuggestions();
      renderGroceries();
      renderInventory();
      bindInventoryControls();
      await Promise.all([saveInventory(), saveGroceries()]);
    });
  }

  function bindReceiptControls() {
    $("#scanReceiptToggle").addEventListener("click", () => {
      $("#receiptScanPanel").hidden = !$("#receiptScanPanel").hidden;
    });

    $("#receiptScanForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const files = $("#receiptScanPhotoInput").files;
      if (!files.length) return;

      const submitButton = $("#receiptScanForm .primary-action");
      const status = $("#groceryStatus");
      submitButton.disabled = true;
      status.textContent = t("receiptScanWorking");
      status.classList.remove("error");

      try {
        const images = await readFilesAsDataUrls(files, 4, {
          maxSide: 1100,
          quality: 0.74,
          maxBytes: 650000,
        });
        const items = await recognizeReceipt(images);
        setReceiptSuggestions(items.map((item) => {
          const match = shoppingMatchForReceiptItem(item.text);
          return {
            ...item,
            matchId: match?.id || "",
            matchText: match?.text || "",
          };
        }));
        $("#receiptScanPhotoInput").value = "";
        renderReceiptSuggestions();
        status.textContent = getReceiptSuggestions().length ? "" : t("receiptScanEmpty");
      } catch (error) {
        console.warn(error);
        setReceiptSuggestions([]);
        renderReceiptSuggestions();
        status.textContent = error.message || t("receiptScanError");
        status.classList.add("error");
      } finally {
        submitButton.disabled = false;
      }
    });
  }

  return {
    bindReceiptControls,
    renderReceiptSuggestions,
  };
}
