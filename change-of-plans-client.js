import { previewDinnerAttendanceChange } from "./change-of-plans-logic.js";
import { days, normalizeCalendar, normalizeMealPlan, normalizeSchedule } from "./schedule-utils.js";

function sameMeal(left, right) {
  return JSON.stringify(normalizeMealPlan(left)) === JSON.stringify(normalizeMealPlan(right));
}

/** Prepare one date-scoped attendance write against a freshly read schedule. */
export function prepareDinnerAttendanceChange({ preview, attendance, baseWeekStartKey, latestRecord } = {}) {
  const version = Number(latestRecord?.version);
  if (!preview?.dateKey || !preview.before || !Number.isSafeInteger(version) || version < 0
    || !latestRecord?.schedule || !latestRecord?.calendarMeals) {
    return { status: "invalid", reason: "missing-baseline" };
  }
  if (latestRecord.weekStartKey && baseWeekStartKey && latestRecord.weekStartKey !== baseWeekStartKey) {
    return { status: "conflict", reason: "active-week-changed" };
  }
  let desired;
  try {
    desired = previewDinnerAttendanceChange({ dateKey: preview.dateKey, meal: preview.before, attendance });
  } catch {
    return { status: "invalid", reason: "invalid-attendance-or-date" };
  }
  if (!desired.before.items.some((item) => item.period === "dinner")) {
    return { status: "invalid", reason: "no-dinner" };
  }
  const schedule = normalizeSchedule(latestRecord.schedule);
  const calendarMeals = normalizeCalendar(latestRecord.calendarMeals);
  const dayKey = days[(new Date(`${preview.dateKey}T12:00:00`).getDay() + 6) % 7].key;
  const current = Object.hasOwn(calendarMeals, preview.dateKey)
    ? calendarMeals[preview.dateKey] : schedule[dayKey];
  if (!sameMeal(current, desired.before)) {
    return { status: "conflict", reason: "date-changed", dateKey: preview.dateKey };
  }
  if (sameMeal(desired.before, desired.after)) return { status: "no-change" };
  return {
    status: "ready",
    dateKey: preview.dateKey,
    before: desired.before,
    after: desired.after,
    record: {
      schedule,
      calendarMeals: { ...calendarMeals, [preview.dateKey]: desired.after },
      weekStartKey: latestRecord.weekStartKey || baseWeekStartKey || "",
      version,
    },
  };
}

/** A conflict never automatically retries or overwrites the other device's edit. */
export async function applyDinnerAttendanceChange({ preview, attendance, baseWeekStartKey, getLatest, putRecord } = {}) {
  if (typeof getLatest !== "function" || typeof putRecord !== "function") {
    throw new TypeError("Schedule read and write functions are required.");
  }
  let latest;
  try {
    latest = await getLatest();
  } catch {
    return { status: "load-error" };
  }
  const prepared = prepareDinnerAttendanceChange({ preview, attendance, baseWeekStartKey, latestRecord: latest });
  if (prepared.status !== "ready") return prepared;
  try {
    const record = await putRecord(prepared.record);
    const savedMeal = record?.calendarMeals?.[prepared.dateKey]
      ? normalizeMealPlan(record.calendarMeals[prepared.dateKey]) : prepared.after;
    return {
      status: "saved", record, dateKey: prepared.dateKey,
      undo: {
        dateKey: prepared.dateKey,
        before: savedMeal,
        attendance: {
          adults: prepared.before.servingPlans.dinner.adults,
          kids: prepared.before.servingPlans.dinner.kids,
          guests: prepared.before.servingPlans.dinner.guests,
        },
        baseWeekStartKey: record.weekStartKey || prepared.record.weekStartKey,
      },
    };
  } catch (error) {
    return { status: error?.status === 409 ? "conflict" : "save-error", reason: error?.status === 409 ? "version-changed" : "write-failed" };
  }
}

/** A quick recipe swap writes only its date and never retries a version conflict. */
export function prepareQuickDinnerReplacement({ preview, baseWeekStartKey, latestRecord } = {}) {
  const version = Number(latestRecord?.version);
  if (!preview?.dateKey || !preview.before || !preview.after || !Number.isSafeInteger(version) || version < 0
    || !latestRecord?.schedule || !latestRecord?.calendarMeals) return { status: "invalid" };
  if (latestRecord.weekStartKey && baseWeekStartKey && latestRecord.weekStartKey !== baseWeekStartKey) {
    return { status: "conflict", reason: "active-week-changed" };
  }
  const schedule = normalizeSchedule(latestRecord.schedule);
  const calendarMeals = normalizeCalendar(latestRecord.calendarMeals);
  const day = new Date(`${preview.dateKey}T12:00:00`);
  if (Number.isNaN(day.getTime()) || day.getFullYear() !== Number(preview.dateKey.slice(0, 4))
    || day.getMonth() + 1 !== Number(preview.dateKey.slice(5, 7)) || day.getDate() !== Number(preview.dateKey.slice(8, 10))) {
    return { status: "invalid" };
  }
  const dayKey = days[(day.getDay() + 6) % 7].key;
  const current = Object.hasOwn(calendarMeals, preview.dateKey) ? calendarMeals[preview.dateKey] : schedule[dayKey];
  if (!sameMeal(current, preview.before)) return { status: "conflict", reason: "date-changed" };
  const before = normalizeMealPlan(preview.before);
  const after = normalizeMealPlan(preview.after);
  const oldMains = before.items.filter((item) => item.period === "dinner" && item.role === "main" && item.sourceType === "recipe");
  const newMains = after.items.filter((item) => item.period === "dinner" && item.role === "main" && item.sourceType === "recipe");
  const expected = oldMains.length === 1 && newMains.length === 1
    ? normalizeMealPlan({ ...before, items: before.items.map((item) => item.id === oldMains[0].id ? newMains[0] : item) })
    : null;
  if (oldMains.length !== 1 || newMains.length !== 1 || oldMains[0].id !== newMains[0].id
    || oldMains[0].recipeId === newMains[0].recipeId
    || JSON.stringify(expected) !== JSON.stringify(after)) return { status: "invalid" };
  return {
    status: "ready", dateKey: preview.dateKey, before, after,
    record: { schedule, calendarMeals: { ...calendarMeals, [preview.dateKey]: after },
      weekStartKey: latestRecord.weekStartKey || baseWeekStartKey || "", version },
  };
}

export async function applyQuickDinnerReplacement({ preview, baseWeekStartKey, getLatest, putRecord } = {}) {
  if (typeof getLatest !== "function" || typeof putRecord !== "function") {
    throw new TypeError("Schedule read and write functions are required.");
  }
  let latest;
  try { latest = await getLatest(); } catch { return { status: "load-error" }; }
  const prepared = prepareQuickDinnerReplacement({ preview, baseWeekStartKey, latestRecord: latest });
  if (prepared.status !== "ready") return prepared;
  try {
    const record = await putRecord(prepared.record);
    if (!record?.calendarMeals?.[prepared.dateKey]) return { status: "save-error" };
    const savedMeal = normalizeMealPlan(record.calendarMeals[prepared.dateKey]);
    const oldMain = prepared.before.items.find((item) => item.period === "dinner" && item.role === "main");
    const undoAfter = normalizeMealPlan({ ...savedMeal,
      items: savedMeal.items.map((item) => item.id === oldMain.id ? { ...item, recipeId: oldMain.recipeId } : item),
    });
    return {
      status: "saved", record, dateKey: prepared.dateKey,
      undo: { dateKey: prepared.dateKey, before: savedMeal, after: undoAfter },
    };
  } catch (error) {
    return { status: error?.status === 409 ? "conflict" : "save-error",
      reason: error?.status === 409 ? "version-changed" : "write-failed" };
  }
}
