function jsonHeaders() {
  const headers = { "content-type": "application/json", accept: "application/json" };
  const householdKey = localStorage.getItem("family-menu-household-key") || "";
  if (householdKey) headers["x-household-key"] = householdKey;
  return headers;
}

async function parseJson(response) {
  return response.json().catch((error) => {
    if (error?.name === "AbortError") throw error;
    return {};
  });
}

function timeoutFailure(fallbackMessage) {
  const error = new Error(fallbackMessage);
  error.code = "request-timeout";
  return error;
}

async function requestJson(url, requestOptions, fallbackMessage, { timeoutMs = 0, signal } = {}) {
  const controller = !signal && timeoutMs > 0 && typeof AbortController === "function" ? new AbortController() : null;
  const requestSignal = signal || controller?.signal;
  const setTimer = globalThis.setTimeout || (() => 0);
  const clearTimer = globalThis.clearTimeout || (() => {});
  const timeout = controller && timeoutMs > 0 ? setTimer(() => controller.abort(), timeoutMs) : 0;
  try {
    const response = await fetch(url, {
      ...requestOptions,
      headers: jsonHeaders(),
      ...(requestSignal ? { signal: requestSignal } : {}),
    });
    const data = await parseJson(response);

    if (!response.ok) {
      const error = new Error(data.error || fallbackMessage);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  } catch (error) {
    if (error?.name === "AbortError" && controller?.signal.aborted) throw timeoutFailure(fallbackMessage);
    throw error;
  } finally {
    if (timeout) clearTimer(timeout);
  }
}

export function classifyRequestFailure(error, { online = globalThis.navigator?.onLine } = {}) {
  if (["QuotaExceededError", "SecurityError"].includes(error?.name) || error?.code === "storage-unavailable") {
    return "storage";
  }
  if (online === false) return "offline";
  if (error?.code === "request-timeout") return "timeout";
  if (error?.code === "malformed-response") return "malformed";
  if ([401, 403].includes(Number(error?.status))) return "access";
  if (Number(error?.status) === 429) return "rate-limit";
  if (Number(error?.status) >= 500) return "service";
  return "unknown";
}

export async function getJson(url, fallbackMessage, options = {}) {
  return requestJson(url, {}, fallbackMessage, { ...options, timeoutMs: options.timeoutMs ?? 15000 });
}

export async function postJson(url, body, fallbackMessage, options = {}) {
  return requestJson(url, {
    method: "POST",
    body: JSON.stringify(body),
  }, fallbackMessage, options);
}

export async function putJson(url, body, fallbackMessage, options = {}) {
  return requestJson(url, {
    method: "PUT",
    body: JSON.stringify(body),
  }, fallbackMessage, options);
}
