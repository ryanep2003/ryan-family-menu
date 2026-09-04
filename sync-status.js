function asValidDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isSameCalendarDay(value, now = new Date()) {
  return value.getFullYear() === now.getFullYear()
    && value.getMonth() === now.getMonth()
    && value.getDate() === now.getDate();
}

export function formatSyncTime(language, value = new Date(), now = new Date()) {
  const date = asValidDate(value);
  if (!date) return "";
  const locale = language === "es" ? "es-US" : "en-US";
  const options = isSameCalendarDay(date, asValidDate(now) || new Date())
    ? { hour: "numeric", minute: "2-digit" }
    : { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };
  return new Intl.DateTimeFormat(locale, options).format(date).replace(/\.+$/, "");
}

export function formatSyncedAtMessage(language, template, value, now = new Date()) {
  const formatted = formatSyncTime(language, value, now) || formatSyncTime(language, now, now);
  if (!formatted) return `${template || ""}`.replace(/\s*\{time\}\.?/g, "").trim();
  return `${template || ""}`
    .replace("{time}", formatted)
    .replace(/([.!?…])(?:\s*[.])+$/u, "$1");
}

export function syncRetryLabel() {
  return "retrySync";
}

export function renderSyncStatus({
  status,
  retryButton,
  message,
  state = "success",
  canRetry = false,
}) {
  if (status) {
    status.textContent = message;
    status.classList.toggle("error", state === "error");
    status.classList.toggle("pending", state === "pending");
  }
  if (retryButton) retryButton.hidden = !canRetry;
}
