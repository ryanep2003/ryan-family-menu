import { localizedText } from "./localized-data.js";
import { organizeShopExperience } from "./shop-ui.js";

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
  getPurchasedCount = () => 0,
  finishPurchasedItems = () => 0,
  onTripFinished = () => {},
}) {
  let queuedReceiptFiles = [];
  let receiptScanInFlight = null;
  let receiptPreviewUrl = "";

  function selectedPhotoLabel(count) {
    const key = count === 1 ? "oneFileSelected" : "filesSelected";
    return t(key).replace("{count}", count);
  }

  function showQueuedPhotoCount() {
    const status = $("#receiptScanPhotoInputFileStatus");
    if (!status) return;
    status.textContent = queuedReceiptFiles.length
      ? `✓ ${selectedPhotoLabel(queuedReceiptFiles.length)}`
      : t("noFilesSelected");
  }

  function clearReceiptPreviewUrl() {
    if (!receiptPreviewUrl) return;
    try {
      URL.revokeObjectURL(receiptPreviewUrl);
    } catch {
      // Object URL cleanup is best-effort and should never block receipt entry.
    }
    receiptPreviewUrl = "";
  }

  function clearReceiptPreview() {
    clearReceiptPreviewUrl();
    const preview = $("#receiptScanPreview");
    if (preview) preview.hidden = true;
    const image = $("#receiptScanPreviewImage");
    image?.removeAttribute?.("src");
    queuedReceiptFiles = [];
    showQueuedPhotoCount();
  }

  function ensureReceiptPreview() {
    let preview = $("#receiptScanPreview");
    if (preview || typeof document === "undefined") return preview;
    const form = $("#receiptScanForm");
    const location = $("#receiptScanLocationInput");
    if (!form?.insertBefore) return null;

    preview = document.createElement("div");
    preview.id = "receiptScanPreview";
    preview.hidden = true;
    preview.setAttribute("role", "status");
    preview.setAttribute("aria-live", "polite");
    preview.style.cssText = "display:flex;align-items:center;gap:12px;padding:10px 12px;border:1px solid rgba(22,57,91,.18);border-radius:14px;background:#fff;margin:2px 0 8px;";
    preview.innerHTML = `
      <img id="receiptScanPreviewImage" alt="" style="width:58px;height:72px;object-fit:cover;border-radius:10px;background:#f1eee8;" />
      <div style="min-width:0;">
        <strong id="receiptScanPreviewTitle" style="display:block;color:#173a5e;"></strong>
        <span id="receiptScanPreviewText" style="display:block;color:#6d747b;font-size:.92rem;margin-top:2px;"></span>
      </div>
    `;
    form.insertBefore(preview, location || form.firstChild || null);
    return preview;
  }

  function showReceiptPreview(files = queuedReceiptFiles) {
    const preview = ensureReceiptPreview();
    const firstFile = files?.[0];
    if (!preview || !firstFile) return;

    preview.hidden = false;
    const title = $("#receiptScanPreviewTitle");
    const text = $("#receiptScanPreviewText");
    const image = $("#receiptScanPreviewImage");
    if (title) title.textContent = `✓ ${selectedPhotoLabel(files.length)}`;
    if (text) text.textContent = t("scanReceiptPhotos");

    clearReceiptPreviewUrl();
    if (image && typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
      try {
        receiptPreviewUrl = URL.createObjectURL(firstFile);
        image.src = receiptPreviewUrl;
      } catch {
        image.removeAttribute?.("src");
      }
    }
  }

  function receiptSpinnerMarkup() {
    return `<span style="display:inline-flex;align-items:center;gap:9px;">
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" style="flex:none;">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-dasharray="42 18">
          <animateTransform attributeName="transform" attributeType="XML" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite" />
        </circle>
      </svg>
      <span>${t("receiptScanWorking")}</span>
    </span>`;
  }

  function setReceiptProcessingState(isProcessing) {
    const submitButton = $("#receiptScanForm .primary-action");
    const photoInput = $("#receiptScanPhotoInput");
    const cameraInput = $("#receiptScanCameraInput");
    const locationInput = $("#receiptScanLocationInput");
    if (submitButton) {
      submitButton.disabled = isProcessing;
      submitButton.setAttribute?.("aria-busy", `${isProcessing}`);
      if (isProcessing) {
        submitButton.innerHTML = receiptSpinnerMarkup();
      } else {
        submitButton.textContent = t("scanReceiptPhotos");
      }
    }
    if (photoInput) photoInput.disabled = isProcessing;
    if (cameraInput) cameraInput.disabled = isProcessing;
    if (locationInput) locationInput.disabled = isProcessing;
  }

  function itemReviewMeta(item) {
    const parts = [];
    const quantity = localizedText(item.quantity, getLang());
    if (quantity) parts.push(quantity);
    if (item.matchText) parts.push(`${t("receiptMatch")}: ${localizedText(item.matchText, getLang())}`);
    if (Number(item.confidence) < 0.8) parts.push("⚠");
    return parts.join(" · ");
  }

  function renderReceiptSuggestions() {
    const panel = $("#receiptSuggestions");
    const scanForm = $("#receiptScanForm");
    if (!panel) return;
    const receiptSuggestions = getReceiptSuggestions();

    if (!receiptSuggestions.length) {
      panel.hidden = true;
      panel.innerHTML = "";
      if (scanForm) scanForm.hidden = false;
      return;
    }

    if (scanForm) scanForm.hidden = true;
    panel.hidden = false;
    panel.innerHTML = `
      <h3>${t("receiptSuggestionsHeading")}</h3>
      ${getPendingReceipt() ? `<div class="receipt-purchase-summary">
        <label><span>${t("receiptStore")}</span><input id="receiptStoreInput" type="text" value="${escapeHtml(getPendingReceipt().store || "")}" /></label>
        <label><span>${t("receiptDate")}</span><input id="receiptDateInput" type="date" value="${escapeHtml(getPendingReceipt().date || "")}" /></label>
        <label><span>${t("receiptTotal")}</span><input id="receiptTotalInput" type="number" min="0.01" max="100000" step="0.01" required value="${Number(getPendingReceipt().total) || ""}" /></label>
      </div>` : ""}
      <div class="suggestion-list">
        ${receiptSuggestions.map((item, index) => `
          <label class="suggestion-item${Number(item.confidence) < 0.8 ? " needs-review" : ""}">
            <input type="checkbox" data-receipt-suggestion="${index}" checked />
            <span>
              <strong>${escapeHtml(localizedText(item.text, getLang()))}</strong>
              ${itemReviewMeta(item) ? `<em>${escapeHtml(itemReviewMeta(item))}</em>` : ""}
            </span>
          </label>
        `).join("")}
      </div>
      <button class="primary-action" type="button" id="addReceiptSuggestions">${t("saveReceiptAndMove")}</button>
    `;
    panel.scrollIntoView?.({ behavior: "smooth", block: "start" });

    $("#addReceiptSuggestions").addEventListener("click", async () => {
      const selected = $$("[data-receipt-suggestion]")
        .filter((checkbox) => checkbox.checked)
        .map((checkbox) => getReceiptSuggestions()[Number(checkbox.dataset.receiptSuggestion)])
        .filter(Boolean);

      const pendingReceipt = getPendingReceipt();
      const manualTotal = $("#receiptTotalInput")?.value?.trim() || "";
      const receiptTotal = Number(manualTotal || pendingReceipt?.total || 0);
      if (!selected.length && !(receiptTotal > 0)) return;

      if (pendingReceipt && !(receiptTotal > 0)) {
        setGroceryStatus("receiptTotalRequired", { state: "error" });
        const totalInput = $("#receiptTotalInput");
        totalInput?.setAttribute?.("aria-invalid", "true");
        totalInput?.focus?.();
        return;
      }

      const matchedIds = new Set(selected.map((item) => item.matchId).filter(Boolean));
      const additionalPurchased = pendingReceipt ? getPurchasedCount(matchedIds) : 0;
      if (pendingReceipt) {
        const saved = await addReceipt({
          ...pendingReceipt,
          store: $("#receiptStoreInput")?.value || pendingReceipt.store,
          date: $("#receiptDateInput")?.value || pendingReceipt.date,
          total: receiptTotal,
          totalEstimated: !manualTotal && pendingReceipt.totalEstimated === true,
          itemCount: selected.length + additionalPurchased,
        });
        if (saved === false) {
          setGroceryStatus("receiptSaveError", { state: "error" });
          return;
        }
      }
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
      finishPurchasedItems();
      setReceiptSuggestions([]);
      setPendingReceipt(null);
      setGroceryStatus("receiptItemsMoved");
      renderReceiptSuggestions();
      renderGroceries();
      renderInventory();
      bindGroceryControls();
      bindInventoryControls();
      await Promise.all([saveInventory(), saveGroceries()]);
      clearReceiptPreview();
      onTripFinished();
    });
  }

  async function readQueuedReceipt() {
    if (receiptScanInFlight) return receiptScanInFlight;

    const photoInput = $("#receiptScanPhotoInput");
    const cameraInput = $("#receiptScanCameraInput");
    const files = queuedReceiptFiles.length
      ? [...queuedReceiptFiles]
      : [...(photoInput?.files || []), ...(cameraInput?.files || [])];
    if (!files.length) return null;

    setReceiptProcessingState(true);
    setGroceryStatus("receiptScanWorking");

    receiptScanInFlight = (async () => {
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
        renderReceiptSuggestions();
        if (getReceiptSuggestions().length) clearGroceryStatus();
        else setGroceryStatus("receiptScanEmpty");
        return result;
      } catch (error) {
        console.warn(error);
        setReceiptSuggestions([]);
        renderReceiptSuggestions();
        setGroceryStatus("receiptScanError", { state: "error" });
        return null;
      } finally {
        setReceiptProcessingState(false);
        receiptScanInFlight = null;
      }
    })();

    return receiptScanInFlight;
  }

  function bindReceiptControls() {
    organizeShopExperience({ getLang });

    $("#scanReceiptToggle").addEventListener("click", () => {
      $("#receiptScanPanel").hidden = !$("#receiptScanPanel").hidden;
      $("#scanReceiptToggle").setAttribute?.("aria-expanded", `${!$("#receiptScanPanel").hidden}`);
      if (!$("#receiptScanPanel").hidden) {
        $("#receiptScanPanel").scrollIntoView?.({ behavior: "smooth", block: "start" });
      }
    });

    $("#receiptScanForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      await readQueuedReceipt();
    });

    const photoInput = $("#receiptScanPhotoInput");
    const cameraInput = $("#receiptScanCameraInput");

    [photoInput, cameraInput].filter(Boolean).forEach((input) => {
      input.addEventListener("change", async () => {
        const addedFiles = [...(input.files || [])];
        if (!addedFiles.length) return;
        queuedReceiptFiles = [...queuedReceiptFiles, ...addedFiles];
        input.value = "";
        showQueuedPhotoCount();
        showReceiptPreview(queuedReceiptFiles);

        if (input === cameraInput) await readQueuedReceipt();
      });
    });
  }

  return {
    bindReceiptControls,
    renderReceiptSuggestions,
  };
}
