function jsonHeaders() {
  const headers = { "content-type": "application/json", accept: "application/json" };
  const householdKey = localStorage.getItem("family-menu-household-key") || "";
  if (householdKey) headers["x-household-key"] = householdKey;
  return headers;
}

async function parseJson(response) {
  return response.json().catch(() => ({}));
}

export async function getJson(url, fallbackMessage) {
  const response = await fetch(url, {
    headers: jsonHeaders(),
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
