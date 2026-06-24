const OPENAI_AUTH_ERROR = "OpenAI API key is missing or invalid in Netlify. Set OPENAI_API_KEY to a valid OpenAI project API key.";

export function cleanImageDataUrl(value, maxBytes) {
  if (typeof value !== "string" || !value.startsWith("data:image/")) return "";
  return value.length * 0.75 <= maxBytes ? value : "";
}

export function parseJsonObject(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = `${text || ""}`.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

export function outputTextFromResponse(data) {
  if (typeof data.output_text === "string") return data.output_text;

  return (data.output || [])
    .flatMap((entry) => entry.content || [])
    .map((content) => content.text || "")
    .join("\n")
    .trim();
}

export function openAiErrorMessage(response, data, fallbackMessage) {
  const message = data?.error?.message || fallbackMessage;
  const authError = response.status === 401 || /authentication token|api key|issuer/i.test(message);
  return authError ? OPENAI_AUTH_ERROR : message;
}
