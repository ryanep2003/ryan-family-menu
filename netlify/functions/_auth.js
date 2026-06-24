export function requireWriteAuth(request) {
  const WRITE_TOKEN = process.env.FAMILY_WRITE_TOKEN || "";
  if (!WRITE_TOKEN) return null;

  const token = request.headers.get("x-family-write-token") || "";
  if (token === WRITE_TOKEN) return null;

  return new Response(JSON.stringify({ error: "Family write access is required." }), {
    status: 401,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}
