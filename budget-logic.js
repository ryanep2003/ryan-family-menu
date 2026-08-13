export function normalizeBudgetSettings(value) {
  const target = Number(value?.monthlyTarget);
  return {
    monthlyTarget: Number.isFinite(target) ? Math.min(100000, Math.max(0, Math.round(target * 100) / 100)) : 0,
  };
}

function cleanMoney(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.min(100000, Math.max(0, Math.round(amount * 100) / 100)) : 0;
}

export function normalizeReceipt(value) {
  const source = value && typeof value === "object" ? value : {};
  const date = /^\d{4}-\d{2}-\d{2}$/.test(source.date) ? source.date : new Date().toISOString().slice(0, 10);
  return {
    id: `${source.id || `receipt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`}`.slice(0, 160),
    date,
    store: `${source.store || "Store"}`.trim().slice(0, 120) || "Store",
    subtotal: cleanMoney(source.subtotal),
    tax: cleanMoney(source.tax),
    total: cleanMoney(source.total),
    itemCount: Math.min(500, Math.max(0, Math.round(Number(source.itemCount) || 0))),
    createdAt: `${source.createdAt || new Date().toISOString()}`.slice(0, 40),
    updatedBy: `${source.updatedBy || ""}`.trim().slice(0, 80),
  };
}

export function normalizeReceipts(value) {
  return Array.isArray(value)
    ? value.map(normalizeReceipt).filter((receipt) => receipt.total > 0).slice(0, 500)
    : [];
}

export function budgetForMonth(receipts, monthDate = new Date(), settings = {}) {
  const monthKey = `${monthDate.getFullYear()}-${`${monthDate.getMonth() + 1}`.padStart(2, "0")}`;
  const monthReceipts = normalizeReceipts(receipts).filter((receipt) => receipt.date.startsWith(monthKey));
  const spent = Math.round(monthReceipts.reduce((sum, receipt) => sum + receipt.total, 0) * 100) / 100;
  const target = normalizeBudgetSettings(settings).monthlyTarget;
  return {
    monthKey,
    receipts: monthReceipts.sort((left, right) => right.date.localeCompare(left.date)),
    spent,
    target,
    remaining: Math.round((target - spent) * 100) / 100,
    percent: target > 0 ? Math.min(100, Math.round((spent / target) * 100)) : 0,
  };
}
