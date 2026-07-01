export function isLocalizedValue(value) {
  return Boolean(
    value
      && typeof value === "object"
      && !Array.isArray(value)
      && (typeof value.en === "string" || typeof value.es === "string")
  );
}

export function localizedText(value, preferredLang = "en") {
  if (typeof value === "string") return value;
  if (!isLocalizedValue(value)) return "";

  const fallbackLang = preferredLang === "es" ? "en" : "es";
  return value[preferredLang] || value[fallbackLang] || "";
}

export function localizedTextExact(value, preferredLang = "en") {
  if (typeof value === "string") return preferredLang === "en" ? value : "";
  if (!isLocalizedValue(value)) return "";
  return value[preferredLang] || "";
}

export function allLocalizedText(value) {
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  if (!isLocalizedValue(value)) return [];

  return [...new Set([value.en, value.es].map((item) => `${item || ""}`.trim()).filter(Boolean))];
}

export function hasLocalizedContent(value) {
  return allLocalizedText(value).length > 0;
}

export function localizedTextMap(value) {
  if (isLocalizedValue(value)) {
    const result = {};
    if (`${value.en || ""}`.trim()) result.en = `${value.en}`.trim();
    if (`${value.es || ""}`.trim()) result.es = `${value.es}`.trim();
    return result;
  }

  const text = `${value || ""}`.trim();
  return text ? { en: text, es: text } : {};
}

export function updateLocalizedText(value, nextValue, preferredLang = "en") {
  const result = localizedTextMap(value);
  const text = `${nextValue || ""}`.trim();

  if (text) {
    result[preferredLang] = text;
  } else {
    delete result[preferredLang];
  }

  return hasLocalizedContent(result) ? result : "";
}

export function canonicalText(value) {
  return localizedText(value, "en") || localizedText(value, "es") || "";
}

export function cleanLocalizedText(value, limit) {
  const trim = (entry) => `${entry || ""}`.trim().slice(0, limit);

  if (isLocalizedValue(value)) {
    const result = {};
    const en = trim(value.en);
    const es = trim(value.es);
    if (en) result.en = en;
    if (es) result.es = es;
    return hasLocalizedContent(result) ? result : "";
  }

  const text = trim(value);
  return text ? { en: text, es: text } : "";
}
