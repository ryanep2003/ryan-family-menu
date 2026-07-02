import { requireWriteAuth } from "./_auth.js";
import { jsonResponse, readJsonRequest } from "./_http.js";
import { outputTextFromResponse, parseJsonObject } from "./_openai.js";

const MODEL = process.env.OPENAI_MODEL || "gpt-5.4-mini";
const MAX_REQUEST_BYTES = 4000;
const MAX_HTML_BYTES = 900000;
const MAX_TEXT_CHARS = 16000;
const MAX_PHOTO_BYTES = 420000;
const MAX_INGREDIENT_CHARS = 500;
const MAX_STEP_CHARS = 1200;

function cleanText(value, limit) {
  return `${value || ""}`.replace(/\s+/g, " ").trim().slice(0, limit);
}

function cleanLines(value, { limit = 80, lineLength = 240 } = {}) {
  if (!Array.isArray(value)) return [];
  return value
    .map((line) => cleanText(line, lineLength))
    .filter(Boolean)
    .slice(0, limit);
}

function cleanCategory(value) {
  return ["main", "side", "salad", "sauce"].includes(value) ? value : "";
}

function isBlockedHost(hostname) {
  const host = `${hostname || ""}`.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:")) return true;
  return /^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host);
}

export function safeUrl(value) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    if (isBlockedHost(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

export async function readLimitedText(response, maxBytes) {
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > maxBytes) return null;

  if (!response.body?.getReader) {
    const text = await response.text();
    return new TextEncoder().encode(text).length > maxBytes ? null : text;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(bytes);
}

function htmlEntityDecode(value = "") {
  const named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };

  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === "#") {
      const codePoint = entity[1]?.toLowerCase() === "x"
        ? Number.parseInt(entity.slice(2), 16)
        : Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return named[entity.toLowerCase()] || match;
  });
}

function stripHtml(html) {
  return htmlEntityDecode(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TEXT_CHARS);
}

function absolutizeUrl(value, baseUrl) {
  if (!value) return "";
  try {
    return new URL(value, baseUrl).href;
  } catch {
    return "";
  }
}

function typeMatches(value, target) {
  return Array.isArray(value)
    ? value.some((item) => `${item}`.toLowerCase() === target)
    : `${value || ""}`.toLowerCase() === target;
}

function findRecipeNode(value) {
  if (!value || typeof value !== "object") return null;
  if (typeMatches(value["@type"], "recipe")) return value;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findRecipeNode(item);
      if (found) return found;
    }
  }

  for (const key of ["@graph", "mainEntity", "itemListElement"]) {
    const found = findRecipeNode(value[key]);
    if (found) return found;
  }

  return null;
}

function jsonLdRecipe(html) {
  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];

  for (const [, raw] of scripts) {
    const parsed = parseJsonObject(htmlEntityDecode(raw));
    const recipe = findRecipeNode(parsed);
    if (recipe) return recipe;
  }

  return null;
}

function instructionText(instruction) {
  if (typeof instruction === "string") return instruction;
  if (!instruction || typeof instruction !== "object") return "";
  if (instruction.text) return instruction.text;
  if (Array.isArray(instruction.itemListElement)) {
    return instruction.itemListElement.map(instructionText).filter(Boolean).join("\n");
  }
  return "";
}

function imageUrlFromRecipe(recipe, baseUrl) {
  const image = recipe?.image;
  if (typeof image === "string") return absolutizeUrl(image, baseUrl);
  if (Array.isArray(image)) return imageUrlFromRecipe({ image: image[0] }, baseUrl);
  if (image && typeof image === "object") return absolutizeUrl(image.url || image.contentUrl, baseUrl);
  return "";
}

function openGraphImage(html, baseUrl) {
  const match = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["'][^>]*>/i);
  return match ? absolutizeUrl(htmlEntityDecode(match[1]), baseUrl) : "";
}

function titleFromHtml(html) {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["'][^>]*>/i);
  if (og) return htmlEntityDecode(og[1]);
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return title ? htmlEntityDecode(title[1]) : "";
}

function categoryFromText(recipe) {
  const text = [recipe.recipeCategory, recipe.recipeCuisine, recipe.name].flat().join(" ").toLowerCase();
  if (/salad/.test(text)) return "salad";
  if (/sauce|dressing|dip|marinade|vinaigrette|aioli/.test(text)) return "sauce";
  if (/side|vegetable|potato|rice|beans|bread|roll/.test(text)) return "side";
  return "";
}

export function recipeFromJsonLd(recipe, html, url) {
  const ingredients = cleanLines(recipe?.recipeIngredient, { lineLength: MAX_INGREDIENT_CHARS });
  const steps = cleanLines(
    Array.isArray(recipe?.recipeInstructions)
      ? recipe.recipeInstructions.flatMap((step) => instructionText(step).split("\n"))
      : instructionText(recipe?.recipeInstructions).split("\n"),
    { lineLength: MAX_STEP_CHARS }
  );
  const notes = cleanText(recipe?.description || "", 900);

  return {
    name: cleanText(recipe?.name || titleFromHtml(html), 120),
    category: cleanCategory(categoryFromText(recipe)),
    ingredientsText: ingredients.join("\n"),
    stepsText: steps.join("\n"),
    allergyWarning: "",
    notes,
    imageUrl: imageUrlFromRecipe(recipe, url) || openGraphImage(html, url),
  };
}

async function recipeFromTextWithAi(text, url, html) {
  if (!process.env.OPENAI_API_KEY) return null;

  const prompt = [
    "Extract one recipe from this webpage text for a private family meal-planning app.",
    "Return only JSON in this shape: {\"name\":\"Recipe name\",\"category\":\"side\",\"ingredients\":[\"1 lb carrots\"],\"steps\":[\"Heat oven to 425 F.\"],\"notes\":\"Short useful family note\"}",
    "Use only information in the page text. Do not invent missing ingredients or steps.",
    "Valid categories are main, side, salad, sauce. Use an empty string if unclear.",
    `Source URL: ${url}`,
    `Page title: ${cleanText(titleFromHtml(html), 160)}`,
    `Page text: ${text}`,
  ].join("\n\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) return null;

  const parsed = parseJsonObject(outputTextFromResponse(data)) || {};
  return {
    name: cleanText(parsed.name || titleFromHtml(html), 120),
    category: cleanCategory(parsed.category),
    ingredientsText: cleanLines(parsed.ingredients, { lineLength: MAX_INGREDIENT_CHARS }).join("\n"),
    stepsText: cleanLines(parsed.steps, { lineLength: MAX_STEP_CHARS }).join("\n"),
    allergyWarning: "",
    notes: cleanText(parsed.notes, 900),
    imageUrl: openGraphImage(html, url),
  };
}

async function imageAsDataUrl(imageUrl) {
  const url = safeUrl(imageUrl);
  if (!url) return "";

  try {
    const response = await fetch(url, {
      headers: { accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8" },
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return "";
    const contentType = response.headers.get("content-type") || "";
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (!contentType.startsWith("image/") || contentLength > MAX_PHOTO_BYTES) return "";

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length || bytes.byteLength > MAX_PHOTO_BYTES) return "";

    return `data:${contentType.split(";")[0]};base64,${Buffer.from(bytes).toString("base64")}`;
  } catch {
    return "";
  }
}

export default async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const authError = requireWriteAuth(request);
  if (authError) return authError;

  const { payload, error } = await readJsonRequest(request, { maxBytes: MAX_REQUEST_BYTES });
  if (error) return error;

  const url = safeUrl(payload.url);
  if (!url) return jsonResponse({ error: "Enter a valid public recipe URL." }, 400);

  const page = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "RyanFamilyMenu/1.0 recipe importer",
    },
    redirect: "manual",
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);

  if (!page?.ok) return jsonResponse({ error: "Could not open that recipe URL." }, 502);

  const contentType = page.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) {
    return jsonResponse({ error: "That URL does not look like a recipe webpage." }, 400);
  }

  const html = await readLimitedText(page, MAX_HTML_BYTES);
  if (!html) return jsonResponse({ error: "That recipe page is too large to import." }, 413);

  const jsonLd = jsonLdRecipe(html);
  const recipe = jsonLd
    ? recipeFromJsonLd(jsonLd, html, url.href)
    : await recipeFromTextWithAi(stripHtml(html), url.href, html);

  if (!recipe?.name && !recipe?.ingredientsText && !recipe?.stepsText) {
    return jsonResponse({ error: "Could not find a readable recipe on that page." }, 422);
  }

  const photo = await imageAsDataUrl(recipe.imageUrl);
  return jsonResponse({
    recipe: {
      name: recipe.name,
      category: recipe.category,
      ingredientsText: recipe.ingredientsText,
      stepsText: recipe.stepsText,
      allergyWarning: recipe.allergyWarning,
      notes: recipe.notes,
      photos: photo ? [photo] : [],
    },
  });
};
