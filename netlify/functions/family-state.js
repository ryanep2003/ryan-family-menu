import { getStore } from "@netlify/blobs";

const STORE_NAME = "family-menu-state";
const STATE_KEY = "shared-state";
const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const MEAL_KEYS = ["main", "side", "salad", "notes"];
const MAX_CALENDAR_DAYS = 730;
const MAX_FAVORITES = 100;
const MAX_TASKS = 300;
const TASK_ASSIGNEES = ["alyson", "eric", "nelly", "theo", "pierce", "other"];

const jsonHeaders = {
  "content-type": "application/json",
  "cache-control": "no-store",
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders,
  });
}

function cleanText(value, maxLength) {
  return `${value || ""}`.trim().slice(0, maxLength);
}

function cleanMeal(value) {
  const source = value && typeof value === "object" ? value : {};
  return Object.fromEntries(MEAL_KEYS.map((key) => [key, cleanText(source[key], key === "notes" ? 500 : 120)]));
}

function cleanSchedule(value) {
  const source = value && typeof value === "object" ? value : {};
  return Object.fromEntries(DAY_KEYS.map((day) => [day, cleanMeal(source[day]) ]));
}

function cleanCalendar(value) {
  if (!value || typeof value !== "object") return {};

  return Object.fromEntries(
    Object.entries(value)
      .filter(([date]) => /^\d{4}-\d{2}-\d{2}$/.test(date))
      .slice(0, MAX_CALENDAR_DAYS)
      .map(([date, meal]) => [date, cleanMeal(meal)])
  );
}

function cleanFavorites(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((id) => cleanText(id, 120)).filter(Boolean))].slice(0, MAX_FAVORITES);
}

function cleanTask(task) {
  const text = cleanText(task?.text, 220);
  if (!text) return null;
  const assignee = TASK_ASSIGNEES.includes(task.assignee)
    ? task.assignee
    : "other";

  return {
    id: cleanText(task.id, 160) || `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text,
    assignee,
    date: /^\d{4}-\d{2}-\d{2}$/.test(task.date) ? task.date : new Date().toISOString().slice(0, 10),
    completed: Boolean(task.completed),
    createdAt: task.createdAt || new Date().toISOString(),
  };
}

function cleanTasks(value) {
  if (!Array.isArray(value)) return [];
  return value.map(cleanTask).filter(Boolean).slice(0, MAX_TASKS);
}

export function cleanState(value) {
  return {
    weekStart: /^\d{4}-\d{2}-\d{2}$/.test(value?.weekStart) ? value.weekStart : "",
    schedule: cleanSchedule(value?.schedule),
    calendarMeals: cleanCalendar(value?.calendarMeals),
    favorites: cleanFavorites(value?.favorites),
    tasks: cleanTasks(value?.tasks),
    updatedAt: new Date().toISOString(),
  };
}

export default async (request) => {
  const store = getStore(STORE_NAME);

  if (request.method === "GET") {
    return jsonResponse({ state: await store.get(STATE_KEY, { type: "json" }) });
  }

  if (request.method === "PUT") {
    let payload;
    try {
      payload = await request.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON" }, 400);
    }

    const state = cleanState(payload.state);
    await store.setJSON(STATE_KEY, state);
    return jsonResponse({ state });
  }

  return jsonResponse({ error: "Method not allowed" }, 405);
};
