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
