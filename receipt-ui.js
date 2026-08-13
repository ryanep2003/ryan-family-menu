import { localizedText } from "./localized-data.js";

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
  setGroceryStatus,
  clearGroceryStatus,
  getReceiptSuggestions,
  setReceiptSuggestions,
  getPendingReceipt = () => null,
  setPendingReceipt = () => {},
  addReceipt = async () => {},
  getLang,
  getHouseholdMember = () => "Family",
  updateFileInputStatus = () => {},
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
      ${getPendingReceipt() ? `<div class="receipt-purchase-summary">
        <label><span>${t("receiptStore")}</span><input id="receiptStoreInput" type="text" value="${escapeHtml(getPendingReceipt().store || "")}" /></label>
        <label><span>${t("receiptDate")}</span><input id="receiptDateInput" type="date" value="${escapeHtml(getPendingReceipt().date || "")}" /></label>
        <label><span>${t("receiptTotal")}</span><input id="receiptTotalInput" type="number" min="0" max="100000" step="0.01" value="${Number(getPendingReceipt().total) || ""}" /></label>
      </div>` : ""}
      <div class="suggestion-list">
        ${receiptSuggestions.map((item, index) => `
          <label class="suggestion-item">
            <input type="checkbox" data-receipt-suggestion="${index}" checked />
            <span>
              <strong>${escapeHtml(localizedText(item.text, getLang()))}</strong>
              <em>${escapeHtml([
                localizedText(item.quantity, getLang()),
                item.matchText ? `${t("receiptMatch")}: ${localizedText(item.matchText, getLang())}` : t("receiptNewItem"),
              ].filter(Boolean).join(" · "))}</em>
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
        "full",
        getLang(),
        getHouseholdMember()
      ))));
      setGroceries(getGroceries().filter((item) => !matchedIds.has(item.id)));
      const pendingReceipt = getPendingReceipt();
      if (pendingReceipt && Number($("#receiptTotalInput")?.value || pendingReceipt.total) > 0) {
        await addReceipt({
          ...pendingReceipt,
          store: $("#receiptStoreInput")?.value || pendingReceipt.store,
          date: $("#receiptDateInput")?.value || pendingReceipt.date,
          total: Number($("#receiptTotalInput")?.value || pendingReceipt.total),
          itemCount: selected.length,
        });
      }
      setReceiptSuggestions([]);
      setPendingReceipt(null);
      setGroceryStatus("receiptItemsMoved");
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
      const menu = $("#scanReceiptToggle").closest?.(".grocery-tools-menu");
      if (menu) menu.open = false;
    });

    $("#receiptScanForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const files = $("#receiptScanPhotoInput").files;
      if (!files.length) return;

      const submitButton = $("#receiptScanForm .primary-action");
      submitButton.disabled = true;
      setGroceryStatus("receiptScanWorking");

      try {
        const images = await readFilesAsDataUrls(files, 4, {
          maxSide: 1100,
          quality: 0.74,
          maxBytes: 650000,
        });
        const result = await recognizeReceipt(images);
        const items = Array.isArray(result) ? result : result.items;
        setPendingReceipt(Array.isArray(result) ? null : result.receipt);
        setReceiptSuggestions(items.map((item) => {
          const match = shoppingMatchForReceiptItem(item.text);
          return {
            ...item,
            matchId: match?.id || "",
            matchText: match?.text || "",
          };
        }));
        $("#receiptScanPhotoInput").value = "";
        updateFileInputStatus($("#receiptScanPhotoInput"));
        renderReceiptSuggestions();
        if (getReceiptSuggestions().length) clearGroceryStatus();
        else setGroceryStatus("receiptScanEmpty");
      } catch (error) {
        console.warn(error);
        setReceiptSuggestions([]);
        renderReceiptSuggestions();
        setGroceryStatus("receiptScanError", { state: "error" });
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
