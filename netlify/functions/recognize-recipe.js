import { requireWriteAuth } from "./_auth.js";
import { jsonResponse, readJsonRequest } from "./_http.js";
import { cleanImageDataUrl, openAiErrorMessage, outputTextFromResponse, parseJsonObject } from "./_openai.js";

const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 700000;
const MAX_REQUEST_BYTES = 3000000;
const MODEL = process.env.OPENAI_MODEL || "gpt-5.4-mini";
const MAX_INGREDIENT_CHARS = 500;
const MAX_STEP_CHARS = 1200;

function cleanText(value, limit) {
  return `${value || ""}`.trim().slice(0, limit);
}

export function cleanLines(value, { limit = 80, lineLength = 220 } = {}) {
  if (!Array.isArray(value)) return [];
  return value
    .map((line) => cleanText(line, lineLength))
    .filter(Boolean)
    .slice(0, limit);
}

function cleanCategory(value) {
  return ["main", "side", "salad", "sauce"].includes(value) ? value : "";
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
    "You transcribe recipe photos for a private family meal-planning app.",
    "Return only JSON in this shape: {\"name\":\"Recipe name\",\"category\":\"side\",\"ingredients\":[\"1 lb carrots\"],\"steps\":[\"Heat oven to 425 F.\"],\"notes\":\"Short useful family note\"}",
    "Use the recipe text visible in the photos. Do not invent missing ingredients or steps.",
    "Treat the photos as pages of one recipe. Combine all visible ingredients and every visible numbered step across every photo in order.",
    "If the recipe name is not visible, use an empty string.",
    "Valid categories are main, side, salad, sauce. Choose the best category, or use an empty string if unclear.",
    "Keep ingredients and steps concise, one item per array entry.",
    "Preserve temperatures, times, quantities, and safety notes exactly when visible.",
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
      error: openAiErrorMessage(response, data, "Recipe photo scan failed."),
    }, response.status);
  }

  const parsed = parseJsonObject(outputTextFromResponse(data)) || {};

  return jsonResponse({
    recipe: {
      name: cleanText(parsed.name, 120),
      category: cleanCategory(parsed.category),
      ingredientsText: cleanLines(parsed.ingredients, { lineLength: MAX_INGREDIENT_CHARS }).join("\n"),
      stepsText: cleanLines(parsed.steps, { lineLength: MAX_STEP_CHARS }).join("\n"),
      notes: cleanText(parsed.notes, 1200),
    },
  });
};
