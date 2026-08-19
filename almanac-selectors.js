// Presentation-only selectors for the Living Almanac surfaces.  These do not
// change stored household data; they turn existing records into concise UI copy.

export function selectRecipeMemory(recipeId, events = [], familyMembers = []) {
  const matching = events
    .filter((event) => Array.isArray(event?.items) && event.items.some((item) => item.recipeId === recipeId))
    .sort((left, right) => `${right.dateKey || ""}`.localeCompare(`${left.dateKey || ""}`));
  if (!matching.length) return {
    count: 0,
    lastMade: "",
    fact: "",
    likedNames: [],
    skippedNames: [],
  };

  const latest = matching[0];
  const reactions = latest.reactions || latest.memberFeedback || latest.feedback || {};
  const activeMembers = familyMembers.filter((member) => member?.active !== false);
  const likedNames = activeMembers
    .filter((member) => ["loved", "ate"].includes(reactions[member.id] || reactions[member.name]))
    .map((member) => member.name)
    .filter(Boolean);
  const skippedNames = activeMembers
    .filter((member) => ["neutral", "disliked"].includes(reactions[member.id] || reactions[member.name]))
    .map((member) => member.name)
    .filter(Boolean);
  const attendeeIds = new Set(Array.isArray(latest.attendeeIds) ? latest.attendeeIds : []);
  const recordedAttendees = activeMembers.filter((member) => attendeeIds.has(member.id));
  const everyoneAte = recordedAttendees.length > 0 && recordedAttendees.every((member) => (
    ["loved", "ate"].includes(reactions[member.id] || reactions[member.name])
  ));
  const fact = everyoneAte
    ? "everyoneAte"
    : likedNames.length ? "liked"
      : skippedNames.length ? "skipped"
        : latest.outcome === "loved" ? "familyLoved"
          : "";
  return {
    count: matching.length,
    lastMade: latest.dateKey || "",
    fact,
    likedNames,
    skippedNames,
  };
}

export function selectTodayStory({ recipe, meal, memory, dateLabel = "" } = {}) {
  const dinnerPlan = meal?.servingPlans?.dinner || meal?.servingPlan || {};
  const servings = Number(dinnerPlan.adults || 0)
    + (Number(dinnerPlan.kids || 0) * 0.5)
    + Number(dinnerPlan.guests || 0);
  const extraServings = Math.max(0, Number(dinnerPlan.extraServings) || 0);
  if (!recipe) {
    return {
      state: "empty",
      dateLabel,
      servings: 0,
      extraServings: 0,
      memory: memory || null,
    };
  }
  return {
    state: "planned",
    dateLabel,
    servings,
    extraServings,
    memory: memory || null,
  };
}

export function daysSince(dateKey, referenceDateKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey || "") || !/^\d{4}-\d{2}-\d{2}$/.test(referenceDateKey || "")) return null;
  const start = new Date(`${dateKey}T12:00:00Z`);
  const end = new Date(`${referenceDateKey}T12:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000));
}

export function navigationLabel(viewName) {
  return ({ today: "Today", schedule: "Plan", grocery: "Shop", recipes: "Library" })[viewName] || viewName;
}
