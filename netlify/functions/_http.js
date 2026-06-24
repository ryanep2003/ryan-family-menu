const jsonHeaders = {
  "content-type": "application/json",
  "cache-control": "no-store",
};

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders,
  });
}

export async function readJsonRequest(request, { maxBytes = 1000000 } = {}) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > maxBytes) {
    return { error: jsonResponse({ error: "Request body is too large." }, 413) };
  }

  let text;
  try {
    text = await request.text();
  } catch {
    return { error: jsonResponse({ error: "Invalid JSON" }, 400) };
  }

  if (new TextEncoder().encode(text).length > maxBytes) {
    return { error: jsonResponse({ error: "Request body is too large." }, 413) };
  }

  try {
    return { payload: JSON.parse(text) };
  } catch {
    return { error: jsonResponse({ error: "Invalid JSON" }, 400) };
  }
}
