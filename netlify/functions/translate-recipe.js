import { requireWriteAuth } from "./_auth.js";
import { jsonResponse, readJsonRequest } from "./_http.js";
import { openAiErrorMessage, outputTextFromResponse, parseJsonObject } from "./_openai.js";

const MAX_REQUEST_BYTES = 400000;
const MODEL = process.env.OPENAI_MODEL || "gpt-5.4-mini";

function cleanLanguage(value) {
  return value === "es" ? "es" : "en";
}

function cleanText(value, limit = 12000) {
  return `${value || ""}`.trim().slice(0, limit);
}

function cleanLines(value, limit = 120) {
  if (!Array.isArray(value)) return [];
  return value
    .map((line) => cleanText(line, 220))
    .filter(Boolean)
    .slice(0, limit);
}

function cleanRecipe(recipe) {
  const category = ["main", "side", "salad", "sauce", "dessert", "draft"].includes(recipe?.category)
    ? recipe.category
    : "main";

  return {
    name: cleanText(recipe?.name, 120),
    category,
    ingredientsText: cleanText(recipe?.ingredientsText, 12000),
    stepsText: cleanText(recipe?.stepsText, 12000),
    allergyWarning: cleanText(recipe?.allergyWarning, 600),
    notes: cleanText(recipe?.notes, 2000),
  };
}

function languageLabel(lang) {
  return lang === "es" ? "Spanish" : "English";
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

  const sourceLang = cleanLanguage(payload.sourceLang);
  const targetLang = cleanLanguage(payload.targetLang);
  const recipe = cleanRecipe(payload.recipe);

  if (!recipe.name && !recipe.ingredientsText && !recipe.stepsText && !recipe.notes && !recipe.allergyWarning) {
    return jsonResponse({ error: "Recipe content is required." }, 400);
  }

  if (sourceLang === targetLang) {
    return jsonResponse({ recipe });
  }

  const prompt = [
    `Translate this family recipe from ${languageLabel(sourceLang)} to ${languageLabel(targetLang)}.`,
    "Return only JSON in this exact shape:",
    "{\"recipe\":{\"name\":\"...\",\"ingredients\":[\"...\"],\"steps\":[\"...\"],\"allergyWarning\":\"...\",\"notes\":\"...\"}}",
    "Translate naturally for a family cooking app while preserving meaning.",
    "Preserve quantities, temperatures, times, ingredient amounts, numbered step order, and safety warnings exactly.",
    "Keep ingredients and steps concise, one item per array entry.",
    "If a field is empty, return it empty.",
    "Do not add commentary or markdown.",
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
            {
              type: "input_text",
              text: `${prompt}

Recipe category: ${recipe.category}
Recipe name: ${recipe.name}
Ingredients:
${recipe.ingredientsText}

Steps:
${recipe.stepsText}

Allergy warning:
${recipe.allergyWarning}

Family notes:
${recipe.notes}`,
            },
          ],
        },
      ],
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    return jsonResponse({
      error: openAiErrorMessage(response, data, "Recipe translation failed."),
    }, response.status);
  }

  const parsed = parseJsonObject(outputTextFromResponse(data)) || {};
  const translated = cleanRecipe({
    ...recipe,
    ...parsed.recipe,
    ingredientsText: cleanLines(parsed.recipe?.ingredients).join("\n"),
    stepsText: cleanLines(parsed.recipe?.steps).join("\n"),
  });

  return jsonResponse({ recipe: translated });
};
