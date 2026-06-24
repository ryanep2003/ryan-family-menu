function jsonHeaders({ write = false } = {}) {
  const headers = { "content-type": "application/json", accept: "application/json" };
  const token = localStorage.getItem("dinner-family-write-token") || "";
  if (write && token) headers["x-family-write-token"] = token;
  return headers;
}

async function parseJson(response) {
  return response.json().catch(() => ({}));
}

export async function getJson(url, fallbackMessage) {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
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
    headers: jsonHeaders({ write: true }),
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
    headers: jsonHeaders({ write: true }),
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
