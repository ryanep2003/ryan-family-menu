function sanitizedText(value) {
  const text = `${value || ""}`.trim();
  if (!text) return "";
  return /^\[object [^\]]+\]$/.test(text) ? "" : text;
}

export function isLocalizedValue(value) {
  return Boolean(
    value
      && typeof value === "object"
      && !Array.isArray(value)
      && (typeof value.en === "string" || typeof value.es === "string")
  );
}

export function localizedText(value, preferredLang = "en") {
  if (typeof value === "string") return sanitizedText(value);
  if (!isLocalizedValue(value)) return "";

  const fallbackLang = preferredLang === "es" ? "en" : "es";
  return sanitizedText(value[preferredLang]) || sanitizedText(value[fallbackLang]) || "";
}

export function localizedTextExact(value, preferredLang = "en") {
  if (typeof value === "string") return preferredLang === "en" ? sanitizedText(value) : "";
  if (!isLocalizedValue(value)) return "";
  return sanitizedText(value[preferredLang]) || "";
}

export function allLocalizedText(value) {
  if (typeof value === "string") return sanitizedText(value) ? [sanitizedText(value)] : [];
  if (!isLocalizedValue(value)) return [];

  return [...new Set([value.en, value.es].map(sanitizedText).filter(Boolean))];
}

export function hasLocalizedContent(value) {
  return allLocalizedText(value).length > 0;
}

export function localizedTextMap(value) {
  if (isLocalizedValue(value)) {
    const result = {};
    const en = sanitizedText(value.en);
    const es = sanitizedText(value.es);
    if (en) result.en = en;
    if (es) result.es = es;
    return result;
  }

  const text = sanitizedText(value);
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
  const trim = (entry) => sanitizedText(entry).slice(0, limit);

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
