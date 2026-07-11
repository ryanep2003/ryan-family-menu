const englishMarkers = new Set([
  "add", "and", "bake", "beans", "before", "butter", "chicken", "chopped", "cook",
  "cup", "cups", "family", "fresh", "good", "heat", "leaves", "lemony", "minutes",
  "large", "like", "note", "notes", "oil", "other", "oven", "packed", "pepper", "pork",
  "recipe", "roast", "roasted", "salt", "says", "serve", "simmer", "stir", "storage",
  "tablespoon", "tablespoons", "teaspoon", "teaspoons", "then", "the", "until", "used",
  "vegetables", "white", "with",
]);

const spanishMarkers = new Set([
  "aceite", "agrega", "agregar", "antes", "cocina", "cocinar", "con", "cucharada",
  "cucharadas", "de", "del", "despues", "el", "familia", "fresco", "fresca", "frijoles",
  "hasta", "hornea", "hornear", "la", "las", "limon", "los", "luego", "mantequilla",
  "minutos", "nota", "notas", "para", "pimienta", "pollo", "receta", "sal", "sirve",
  "servir", "taza", "tazas", "verduras",
]);

function words(value) {
  return `${value || ""}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .match(/[a-z]+/g) || [];
}

export function appearsEnglish(value) {
  const tokens = words(value);
  if (!tokens.length) return false;
  const englishScore = tokens.filter((token) => englishMarkers.has(token)).length;
  const spanishScore = tokens.filter((token) => spanishMarkers.has(token)).length;
  const threshold = tokens.length <= 8 ? 2 : 3;
  return englishScore >= threshold && englishScore > spanishScore * 1.5;
}

export function textMatchesLanguage(value, lang) {
  return lang !== "es" || !appearsEnglish(value);
}
