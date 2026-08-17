import { budgetForMonth } from "./budget-logic.js";

export function createBudgetUi({ $, $$, t, escapeHtml, getBudgetSettings, setBudgetSettings, getReceipts, setReceipts, saveSharedState }) {
  const money = (value) => new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(Number(value) || 0);

  function renderBudget() {
    const summary = budgetForMonth(getReceipts(), new Date(), getBudgetSettings());
    $("#budgetSpent").textContent = money(summary.spent);
    $("#budgetTarget").textContent = summary.target ? money(summary.target) : t("budgetNotSet");
    $("#budgetRemaining").textContent = summary.target ? money(Math.abs(summary.remaining)) : "—";
    $("#budgetRemainingLabel").textContent = t(summary.remaining < 0 ? "budgetOver" : "budgetRemaining");
    $("#budgetProgress").style.width = `${summary.percent}%`;
    $("#monthlyBudgetInput").value = summary.target || "";
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
      setBudgetSettings({ monthlyTarget: Number($("#monthlyBudgetInput").value) || 0 });
      renderBudget();
      bindReceiptRemoval();
      await saveSharedState();
    });
    bindReceiptRemoval();
  }

  function bindReceiptRemoval() {
    $$("[data-remove-receipt]").forEach((button) => {
      button.addEventListener("click", async () => {
        setReceipts(getReceipts().filter((receipt) => receipt.id !== button.dataset.removeReceipt));
        renderBudget();
        bindReceiptRemoval();
        await saveSharedState();
      });
    });
  }

  return { bindBudgetControls, renderBudget };
}
