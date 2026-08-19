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

export async function getJson(url, fallbackMessage, { timeoutMs = 15000, signal } = {}) {
  const controller = signal ? null : (typeof AbortController === "function" ? new AbortController() : null);
  const requestSignal = signal || controller?.signal;
  const setTimer = globalThis.setTimeout || (() => 0);
  const clearTimer = globalThis.clearTimeout || (() => {});
  const timeout = requestSignal ? setTimer(() => controller?.abort(), timeoutMs) : 0;
  try {
    const response = await fetch(url, {
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
    if (error?.name === "AbortError") throw new Error(fallbackMessage);
    throw error;
  } finally {
    if (timeout) clearTimer(timeout);
  }
}

export async function postJson(url, body, fallbackMessage) {
  const response = await fetch(url, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseJson(response);

  if (!response.ok) {
    const error = new Error(data.error || fallbackMessage);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

export async function putJson(url, body, fallbackMessage) {
  const response = await fetch(url, {
    method: "PUT",
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseJson(response);

  if (!response.ok) {
    const error = new Error(data.error || fallbackMessage);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}
