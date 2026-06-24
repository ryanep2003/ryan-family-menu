import { requireWriteAuth } from "./_auth.js";

const jsonHeaders = {
  "content-type": "application/json",
  "cache-control": "no-store",
};

const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 700000;
const MODEL = process.env.OPENAI_MODEL || "gpt-5.4-mini";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders,
  });
}

function cleanText(value, limit) {
  return `${value || ""}`.trim().slice(0, limit);
}

function cleanLines(value, limit = 80) {
  if (!Array.isArray(value)) return [];
  return value
    .map((line) => cleanText(line, 220))
    .filter(Boolean)
    .slice(0, limit);
}

function cleanCategory(value) {
  return ["main", "side", "salad", "sauce"].includes(value) ? value : "";
}

function cleanImageDataUrl(value) {
  if (typeof value !== "string" || !value.startsWith("data:image/")) return "";
  return value.length * 0.75 <= MAX_IMAGE_BYTES ? value : "";
}

function parseJsonObject(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function outputTextFromResponse(data) {
  if (typeof data.output_text === "string") return data.output_text;

  return (data.output || [])
    .flatMap((entry) => entry.content || [])
    .map((content) => content.text || "")
    .join("\n")
    .trim();
}

export default async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  if (!process.env.OPENAI_API_KEY) {
    return jsonResponse({ error: "Missing OPENAI_API_KEY in Netlify environment variables." }, 500);
  }

  const authError = requireWriteAuth(request);
  if (authError) return authError;

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const images = Array.isArray(payload.images)
    ? payload.images
        .map(cleanImageDataUrl)
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
    const message = data.error?.message || "Recipe photo scan failed.";
    const authError = response.status === 401 || /authentication token|api key|issuer/i.test(message);

    return jsonResponse({
      error: authError
        ? "OpenAI API key is missing or invalid in Netlify. Set OPENAI_API_KEY to a valid OpenAI project API key."
        : message,
    }, response.status);
  }

  const parsed = parseJsonObject(outputTextFromResponse(data)) || {};

  return jsonResponse({
    recipe: {
      name: cleanText(parsed.name, 120),
      category: cleanCategory(parsed.category),
      ingredientsText: cleanLines(parsed.ingredients).join("\n"),
      stepsText: cleanLines(parsed.steps).join("\n"),
      notes: cleanText(parsed.notes, 1200),
    },
  });
};
