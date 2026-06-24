import { requireWriteAuth } from "./_auth.js";
import { jsonResponse } from "./_http.js";
import { cleanImageDataUrl, openAiErrorMessage, outputTextFromResponse, parseJsonObject } from "./_openai.js";

const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 700000;
const MODEL = process.env.OPENAI_MODEL || "gpt-5.4-mini";

function cleanText(value, limit = 160) {
  return `${value || ""}`.trim().slice(0, limit);
}

function cleanReceiptItem(item) {
  const text = cleanText(item?.text);
  if (!text) return null;

  return {
    text,
    quantity: cleanText(item?.quantity, 80),
    confidence: Math.max(0, Math.min(1, Number(item?.confidence) || 0.7)),
  };
}

export default async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const authError = requireWriteAuth(request);
  if (authError) return authError;

  if (!process.env.OPENAI_API_KEY) {
    return jsonResponse({ error: "Missing OPENAI_API_KEY in Netlify environment variables." }, 500);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const images = Array.isArray(payload.images)
    ? payload.images
        .map((image) => cleanImageDataUrl(image, MAX_IMAGE_BYTES))
        .filter(Boolean)
        .slice(0, MAX_IMAGES)
    : [];

  if (!images.length) {
    return jsonResponse({ error: "No images provided." }, 400);
  }

  const prompt = [
    "You read grocery receipts for a family meal-planning app.",
    "Return only JSON in this shape: {\"items\":[{\"text\":\"Milk\",\"quantity\":\"1 gallon\",\"confidence\":0.9}]}",
    "Extract purchased grocery and household items only.",
    "Use plain item names, not receipt abbreviations or prices.",
    "Ignore taxes, totals, payment lines, discounts, store messages, bag fees, and non-item receipt text.",
    "Merge duplicate items and include quantities when clear.",
    "Be conservative; include only purchased items visible in the receipt.",
  ].join(" ");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            ...images.map((image) => ({
              type: "input_image",
              image_url: image,
              detail: "high",
            })),
          ],
        },
      ],
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    return jsonResponse({
      error: openAiErrorMessage(response, data, "Receipt scan failed."),
    }, response.status);
  }

  const parsed = parseJsonObject(outputTextFromResponse(data));
  const items = Array.isArray(parsed?.items)
    ? parsed.items.map(cleanReceiptItem).filter(Boolean).slice(0, 120)
    : [];

  return jsonResponse({ items });
};
