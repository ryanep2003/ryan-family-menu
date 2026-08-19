import { getStore } from "@netlify/blobs";
import { householdDataKey, requireHouseholdAccess } from "./_household.js";
import { jsonResponse, readJsonRequest } from "./_http.js";
import { hasVersionConflict, nextVersionedRecord, versionedRecord } from "./_versioned-record.js";
import { cleanCalendar, cleanSchedule } from "./family-state.js";
import { hasPlannedMeals } from "../../audit-logic.js";

const STORE_NAME = "family-menu-state";
const SCHEDULE_KEY = "schedule";
const STATE_KEY = "shared-state";
const MAX_REQUEST_BYTES = 1200000;

function cleanWeekStart(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(`${value || ""}`) ? value : "";
}

function cleanScheduleRecord(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    schedule: cleanSchedule(source.schedule),
    calendarMeals: cleanCalendar(source.calendarMeals),
    weekStartKey: cleanWeekStart(source.weekStartKey),
  };
}

async function readSchedule(store, scheduleKey, stateKey) {
  const saved = await store.get(scheduleKey, { type: "json" });
  if (saved) {
    const record = versionedRecord(saved, "schedule");
    return { ...record, ...cleanScheduleRecord(record.schedule) };
  }

  const legacy = versionedRecord(await store.get(stateKey, { type: "json" }), "state");
  const state = legacy.state || {};
  return {
    schedule: cleanSchedule(state.schedule),
    calendarMeals: cleanCalendar(state.calendarMeals),
    weekStartKey: cleanWeekStart(state.weekStartKey),
    version: 0,
    updatedAt: legacy.updatedAt || "",
    source: "legacy",
  };
}

export default async (request) => {
  const store = getStore(STORE_NAME);
  const access = await requireHouseholdAccess(request);
  if (access.error) return access.error;
  const scheduleKey = householdDataKey(access.household.id, SCHEDULE_KEY);
  const stateKey = householdDataKey(access.household.id, STATE_KEY);

  if (request.method === "GET") {
    return jsonResponse(await readSchedule(store, scheduleKey, stateKey));
  }

  if (request.method === "PUT") {
    const { payload, error } = await readJsonRequest(request, { maxBytes: MAX_REQUEST_BYTES });
    if (error) return error;
    const current = await readSchedule(store, scheduleKey, stateKey);
    if (hasVersionConflict(payload.version, current.version)) {
      return jsonResponse({
        error: "Meal plan changed on another device. Your local plan is still safe.",
        schedule: current.schedule,
        calendarMeals: current.calendarMeals,
        weekStartKey: current.weekStartKey,
        version: current.version,
        updatedAt: current.updatedAt,
      }, 409);
    }
    const next = cleanScheduleRecord(payload);
    if (hasPlannedMeals({ schedule: current.schedule, calendarMeals: current.calendarMeals })
      && !hasPlannedMeals(next)
      && payload.allowEmptySchedule !== true) {
      return jsonResponse({
        error: "This change would remove every planned meal. Confirm Clear week before replacing the shared menu.",
        code: "empty-overwrite-blocked",
        schedule: current.schedule,
        calendarMeals: current.calendarMeals,
        weekStartKey: current.weekStartKey,
        version: current.version,
        updatedAt: current.updatedAt,
      }, 409);
    }
    const record = nextVersionedRecord("schedule", next, current.version);
    await store.setJSON(scheduleKey, record);
    return jsonResponse({ ...record, ...next });
  }

  return jsonResponse({ error: "Method not allowed" }, 405);
};
