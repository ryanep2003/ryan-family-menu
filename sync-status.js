export function formatSyncTime(language, value = new Date()) {
  const locale = language === "es" ? "es-US" : "en-US";
  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
  }).format(value).replace(/\.+$/, "");
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
