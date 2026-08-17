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
  finishPurchasedItems = () => 0,
  onTripFinished = () => {},
}) {
  let queuedReceiptFiles = [];

  function showQueuedPhotoCount() {
    const status = $("#receiptScanPhotoInputFileStatus");
    if (!status) return;
    status.textContent = queuedReceiptFiles.length
      ? t("filesSelected").replace("{count}", queuedReceiptFiles.length)
      : t("noFilesSelected");
  }

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

      const pendingReceipt = getPendingReceipt();
      const manualTotal = $("#receiptTotalInput")?.value?.trim() || "";
      const receiptTotal = Number(manualTotal || pendingReceipt?.total || 0);
      if (!selected.length && !(receiptTotal > 0)) return;

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
      const additionalPurchased = finishPurchasedItems();
      if (pendingReceipt) {
        await addReceipt({
          ...pendingReceipt,
          store: $("#receiptStoreInput")?.value || pendingReceipt.store,
          date: $("#receiptDateInput")?.value || pendingReceipt.date,
          total: receiptTotal,
          totalEstimated: !manualTotal && pendingReceipt.totalEstimated === true,
          itemCount: selected.length + additionalPurchased,
        });
      }
      setReceiptSuggestions([]);
      setPendingReceipt(null);
      setGroceryStatus("receiptItemsMoved");
      renderReceiptSuggestions();
      renderGroceries();
      renderInventory();
      bindGroceryControls();
      bindInventoryControls();
      await Promise.all([saveInventory(), saveGroceries()]);
      onTripFinished();
    });
  }

  function bindReceiptControls() {
    $("#scanReceiptToggle").addEventListener("click", () => {
      $("#receiptScanPanel").hidden = !$("#receiptScanPanel").hidden;
      $("#scanReceiptToggle").setAttribute?.("aria-expanded", `${!$("#receiptScanPanel").hidden}`);
      if (!$("#receiptScanPanel").hidden) {
        $("#receiptScanPanel").scrollIntoView?.({ behavior: "smooth", block: "start" });
      }
    });

    $("#receiptScanForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const photoInput = $("#receiptScanPhotoInput");
      const cameraInput = $("#receiptScanCameraInput");
      const files = queuedReceiptFiles.length
        ? queuedReceiptFiles
        : [...(photoInput?.files || []), ...(cameraInput?.files || [])];
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
        const parsedReceipt = Array.isArray(result) ? null : result.receipt;
        setPendingReceipt(parsedReceipt || {
          store: "",
          date: new Date().toISOString().slice(0, 10),
          total: 0,
          itemCount: items.length,
        });
        setReceiptSuggestions(items.map((item) => {
          const match = shoppingMatchForReceiptItem(item.text);
          return {
            ...item,
            matchId: match?.id || "",
            matchText: match?.text || "",
          };
        }));
        if (photoInput) photoInput.value = "";
        if (cameraInput) cameraInput.value = "";
        queuedReceiptFiles = [];
        updateFileInputStatus(photoInput);
        showQueuedPhotoCount();
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

    [$("#receiptScanPhotoInput"), $("#receiptScanCameraInput")].filter(Boolean).forEach((input) => {
      input.addEventListener("change", () => {
        queuedReceiptFiles = [...queuedReceiptFiles, ...(input.files || [])];
        // Camera capture returns one file and replaces the previous selection.
        // Keep the files in our queue so families can take both sides of a
        // long receipt before pressing Read receipt photos.
        input.value = "";
        showQueuedPhotoCount();
      });
    });
  }

  return {
    bindReceiptControls,
    renderReceiptSuggestions,
  };
}
