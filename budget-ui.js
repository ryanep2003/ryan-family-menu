import { budgetForMonth } from "./budget-logic.js";

export function createBudgetUi({ $, $$, t, escapeHtml, getBudgetSettings, setBudgetSettings, getReceipts, setReceipts, saveSharedState, markDirtySurface = () => {}, clearDirtySurface = () => {} }) {
  const money = (value) => new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(Number(value) || 0);

  function renderBudget() {
    const summary = budgetForMonth(getReceipts(), new Date(), getBudgetSettings());
    $("#budgetSpent").textContent = money(summary.spent);
    $("#budgetTarget").textContent = summary.target ? money(summary.target) : t("budgetNotSet");
    $("#budgetRemaining").textContent = summary.target ? money(Math.abs(summary.remaining)) : "—";
    $("#budgetRemainingLabel").textContent = t(summary.remaining < 0 ? "budgetOver" : "budgetRemaining");
    $("#budgetProgress").style.width = `${summary.percent}%`;
    const budgetInput = $("#monthlyBudgetInput");
    if (globalThis.document?.activeElement !== budgetInput) budgetInput.value = summary.target || "";
    $("#receiptHistory").innerHTML = summary.receipts.length
      ? summary.receipts.map((receipt) => `<article class="receipt-history-item">
          <div><strong>${escapeHtml(receipt.store)}</strong><span>${escapeHtml(receipt.date)} · ${receipt.itemCount} ${t("receiptItemsShort")}</span></div>
          <strong>${receipt.total > 0 ? escapeHtml(receipt.totalEstimated ? `${money(receipt.total)} · ${t("receiptTotalCalculated")}` : money(receipt.total)) : escapeHtml(t("receiptTotalMissing"))}</strong>
          <button class="text-button" type="button" data-remove-receipt="${escapeHtml(receipt.id)}">${t("remove")}</button>
        </article>`).join("")
      : `<p class="empty-state">${t("receiptHistoryEmpty")}</p>`;
  }

  function bindBudgetControls() {
    $("#budgetForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      markDirtySurface(event.currentTarget);
      setBudgetSettings({ monthlyTarget: Number($("#monthlyBudgetInput").value) || 0 });
      renderBudget();
      bindReceiptRemoval();
      const saved = await saveSharedState({ dirtySurface: "budget" });
      void saved;
    });
    bindReceiptRemoval();
  }

  function bindReceiptRemoval() {
    const history = $("#receiptHistory");
    if (!history || history.dataset.bound) return;
    history.dataset.bound = "true";
    history.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-remove-receipt]");
      if (!button) return;
      markDirtySurface($("#budgetForm"));
      setReceipts(getReceipts().filter((receipt) => receipt.id !== button.dataset.removeReceipt));
      renderBudget();
      const saved = await saveSharedState({ dirtySurface: "budget" });
      void saved;
    });
  }
  return { bindBudgetControls, renderBudget };
}
