import { requireHouseholdAccess } from "./_household.js";
import { jsonResponse, readJsonRequest } from "./_http.js";
import { cleanImageDataUrl, openAiErrorMessage, outputTextFromResponse, parseJsonObject } from "./_openai.js";
import { checkAiUsage } from "./_ai-usage.js";

const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 700000;
const MAX_REQUEST_BYTES = 4000000;
const MODEL = process.env.OPENAI_MODEL || "gpt-5.4-mini";

function cleanLanguage(value) {
  return value === "es" ? "es" : "en";
}

function cleanText(value, limit = 160) {
  return `${value || ""}`.trim().slice(0, limit);
}

function cleanReceiptItem(item) {
  const text = cleanText(item?.text);
  if (!text) return null;

  return {
    text,
    quantity: cleanText(item?.quantity, 80),
    price: cleanMoney(item?.price),
    confidence: Math.max(0, Math.min(1, Number(item?.confidence) || 0.7)),
  };
}

function cleanMoney(value) {
  const amount = Number(`${value ?? ""}`.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(amount) ? Math.min(100000, Math.max(0, Math.round(amount * 100) / 100)) : 0;
}

function cleanReceiptMeta(value) {
  return {
    store: cleanText(value?.store, 120) || "Store",
    date: /^\d{4}-\d{2}-\d{2}$/.test(value?.date) ? value.date : new Date().toISOString().slice(0, 10),
    subtotal: cleanMoney(value?.subtotal),
    tax: cleanMoney(value?.tax),
    total: cleanMoney(value?.total),
    totalEstimated: value?.totalEstimated === true,
  };
}

export default async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const access = await requireHouseholdAccess(request);
  if (access.error) return access.error;
  const usage = await checkAiUsage(access.household.id, "receipt");
  if (!usage.allowed) return usage.response;

  if (!process.env.OPENAI_API_KEY) {
    return jsonResponse({ error: "Missing OPENAI_API_KEY in Netlify environment variables." }, 500);
  }

  const { payload, error } = await readJsonRequest(request, { maxBytes: MAX_REQUEST_BYTES });
  if (error) return error;

  const images = Array.isArray(payload.images)
    ? payload.images
        .map((image) => cleanImageDataUrl(image, MAX_IMAGE_BYTES))
        .filter(Boolean)
        .slice(0, MAX_IMAGES)
    : [];

  if (!images.length) {
    return jsonResponse({ error: "No images provided." }, 400);
  }

  const outputLanguage = cleanLanguage(payload.lang);

  const prompt = [
    "You read grocery receipts for a family meal-planning app.",
    "Return only JSON in this shape: {\"receipt\":{\"store\":\"Publix\",\"date\":\"2026-08-13\",\"subtotal\":42.10,\"tax\":2.90,\"total\":45.00},\"items\":[{\"text\":\"Milk\",\"quantity\":\"1 gallon\",\"price\":4.99,\"confidence\":0.9}]}",
    "Extract purchased grocery and household items only.",
    "Use plain item names and quantities; do not include item prices in item names.",
    "Read the store, purchase date, subtotal, tax, and final total when visible. Use numbers for money. Also read each line item's price when visible so the app can calculate a fallback total if the printed total is obscured.",
    "Ignore payment details, store messages, and bag fees as purchased items.",
    "Merge duplicate items and include quantities when clear.",
    "Be conservative; include only purchased items visible in the receipt.",
    outputLanguage === "es"
      ? "Write item names and quantities in Spanish."
      : "Write item names and quantities in English.",
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

  const receipt = cleanReceiptMeta(parsed?.receipt);
  if (!(receipt.total > 0)) {
    const itemSubtotal = items.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
    const itemTotal = Math.round((itemSubtotal + (receipt.tax || 0)) * 100) / 100;
    if (itemTotal > 0) {
      receipt.subtotal = receipt.subtotal || Math.round(itemSubtotal * 100) / 100;
      receipt.total = itemTotal;
      receipt.totalEstimated = true;
    }
  }
  return jsonResponse({ items, receipt });
};
