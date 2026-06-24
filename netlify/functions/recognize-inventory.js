import { requireWriteAuth } from "./_auth.js";
import { jsonResponse, readJsonRequest } from "./_http.js";
import { cleanImageDataUrl, openAiErrorMessage, outputTextFromResponse, parseJsonObject } from "./_openai.js";

const ALLOWED_LOCATIONS = new Set(["pantry", "fridge", "freezer", "household"]);
const MAX_IMAGES = 6;
const MAX_IMAGE_BYTES = 700000;
const MAX_REQUEST_BYTES = 6000000;
const MODEL = process.env.OPENAI_MODEL || "gpt-5.4-mini";

function cleanLocation(location, fallback = "fridge") {
  return ALLOWED_LOCATIONS.has(location) ? location : fallback;
}

function cleanSuggestion(item, fallbackLocation) {
  const text = `${item?.text || ""}`.trim().slice(0, 120);
  if (!text) return null;

  return {
    text,
    quantity: `${item?.quantity || ""}`.trim().slice(0, 80),
    location: cleanLocation(item?.location, fallbackLocation),
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

  const { payload, error } = await readJsonRequest(request, { maxBytes: MAX_REQUEST_BYTES });
  if (error) return error;

  const fallbackLocation = cleanLocation(payload.location, "fridge");
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
    "You identify household food inventory from photos for a family meal-planning app.",
    "Return only JSON in this shape: {\"items\":[{\"text\":\"Eggs\",\"quantity\":\"2 cartons\",\"location\":\"fridge\",\"confidence\":0.9}]}",
    "Use plain grocery item names, not brands unless the brand is the useful item name.",
    "Be conservative. Include only visible items you can identify. Do not guess hidden items.",
    "Merge duplicates across photos. Estimate quantities with words like 'about 4', '1 jar', 'multiple cartons', or 'several'.",
    "Valid locations are pantry, fridge, freezer, household. Use the provided default location unless the image clearly shows another location.",
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
            { type: "input_text", text: `${prompt}\nDefault location: ${fallbackLocation}` },
            ...images.map((image) => ({
              type: "input_image",
              image_url: image,
              detail: "low",
            })),
          ],
        },
      ],
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    return jsonResponse({
      error: openAiErrorMessage(response, data, "Image recognition failed."),
    }, response.status);
  }

  const parsed = parseJsonObject(outputTextFromResponse(data));
  const items = Array.isArray(parsed?.items)
    ? parsed.items.map((item) => cleanSuggestion(item, fallbackLocation)).filter(Boolean).slice(0, 80)
    : [];

  return jsonResponse({ items });
};
