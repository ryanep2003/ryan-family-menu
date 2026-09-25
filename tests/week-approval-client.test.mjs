import assert from "node:assert/strict";
import test from "node:test";
import { approveWeekDraft } from "../week-approval-client.js";
import { createWeekDraft } from "../week-planner-logic.js";

const monday = "2026-09-28";
const recipe = { id: "rice", category: "main", name: { en: "Rice", es: "Arroz" }, meta: { en: "20 minutes", es: "20 minutos" }, ingredients: { en: ["rice"], es: ["arroz"] } };
const draft = createWeekDraft({ weekStartKey: monday, recipes: [recipe], targetDinnerCount: 1, scheduleVersion: 4 });
const record = (calendarMeals = {}, version = 4) => ({ schedule: {}, calendarMeals, weekStartKey: monday, version });
const input = (getLatest, putRecord) => ({ draft, approvedDateKeys: [monday], visibleRecipeIds: ["rice"], getLatest, putRecord });

test("approval reads the latest schedule before a single versioned write", async () => {
  const writes = [];
  const result = await approveWeekDraft(input(async () => record(), async (body) => {
    writes.push(body);
    return { ...body, version: 5 };
  }));
  assert.equal(result.status, "saved");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].version, 4);
  assert.equal(writes[0].calendarMeals[monday].dinner, "rice");
});

test("a same-date edit in a 409 response blocks retry", async () => {
  let writes = 0;
  const result = await approveWeekDraft(input(async () => record(), async () => {
    writes += 1;
    throw Object.assign(new Error("changed"), { status: 409, data: record({ [monday]: { lunch: "remote" } }, 5) });
  }));
  assert.equal(result.status, "conflict");
  assert.deepEqual(result.conflicts, [monday]);
  assert.equal(writes, 1);
});

test("an unrelated edit in a 409 response survives one bounded retry", async () => {
  let writes = 0;
  const result = await approveWeekDraft(input(async () => record(), async (body) => {
    writes += 1;
    if (writes === 1) throw Object.assign(new Error("changed"), { status: 409, data: record({ "2026-09-29": { lunch: "remote" } }, 5) });
    return { ...body, version: 6 };
  }));
  assert.equal(result.status, "saved");
  assert.equal(writes, 2);
  assert.equal(result.record.calendarMeals["2026-09-29"].lunch, "remote");
  assert.equal(result.record.calendarMeals[monday].dinner, "rice");
});

test("a second version conflict stops without unbounded retry", async () => {
  let writes = 0;
  const result = await approveWeekDraft(input(async () => record(), async () => {
    writes += 1;
    throw Object.assign(new Error("changed"), { status: 409, data: record({}, 4 + writes) });
  }));
  assert.equal(result.status, "conflict");
  assert.equal(result.reason, "version-changed-again");
  assert.equal(writes, 2);
});

test("read and save failures never claim approval", async () => {
  let writes = 0;
  const load = await approveWeekDraft(input(async () => { throw new Error("offline"); }, async () => { writes += 1; }));
  assert.equal(load.status, "load-error");
  assert.equal(writes, 0);
  const save = await approveWeekDraft(input(async () => record(), async () => { throw new Error("offline"); }));
  assert.equal(save.status, "save-error");
});
