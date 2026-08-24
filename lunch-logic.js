const COMPONENT_KEYS = ["main", "produce", "side", "extra", "drink"];
const RATINGS = ["love", "eat", "dislike", "never"];
const DAY_TYPES = ["pack", "school-lunch", "pizza-day", "no-school", "field-trip"];
const MAX_PLAN_DATES = 370;
const MAX_PREFERENCES = 600;
const MAX_SAVED_LUNCHES = 80;

function text(value, max = 160) {
  return `${value || ""}`.replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}

function validId(value) {
  const id = text(value, 160);
  return /^[a-z0-9-]{1,160}$/i.test(id) ? id : "";
}

function timestamp(value) {
  const candidate = text(value, 40);
  return candidate && !Number.isNaN(new Date(candidate).getTime()) ? candidate : "";
}

function localized(en, es) {
  return { en, es };
}

export const lunchComponentKeys = [...COMPONENT_KEYS];

export const lunchCatalog = [
  {
    id: "turkey-rollups", component: "main", art: "rollups",
    name: localized("Turkey & cheese roll-ups", "Rollitos de pavo y queso"),
    keywords: ["turkey", "cheese", "tortilla"], allergens: ["dairy", "wheat"], prepMinutes: 5, needsCold: true,
    groceries: { en: ["1 tortilla", "2 ounces sliced turkey", "1 ounce sliced cheese"], es: ["1 tortilla", "2 onzas de pavo rebanado", "1 onza de queso rebanado"] },
  },
  {
    id: "ham-sandwich", component: "main", art: "sandwich",
    name: localized("Ham & cheese sandwich", "Sándwich de jamón y queso"),
    keywords: ["ham", "cheese", "bread"], allergens: ["dairy", "wheat"], prepMinutes: 5, needsCold: true,
    groceries: { en: ["2 slices sandwich bread", "2 ounces sliced ham", "1 ounce sliced cheese"], es: ["2 rebanadas de pan", "2 onzas de jamón rebanado", "1 onza de queso rebanado"] },
  },
  {
    id: "sunbutter-jam", component: "main", art: "sandwich",
    name: localized("SunButter & jam sandwich", "Sándwich de crema de girasol y mermelada"),
    keywords: ["sunbutter", "jam", "bread", "nut-free"], allergens: ["wheat"], prepMinutes: 4,
    groceries: { en: ["2 slices sandwich bread", "2 tablespoons sunflower seed butter", "1 tablespoon jam"], es: ["2 rebanadas de pan", "2 cucharadas de crema de girasol", "1 cucharada de mermelada"] },
  },
  {
    id: "cheese-quesadilla", component: "main", art: "quesadilla",
    name: localized("Cheese quesadilla", "Quesadilla de queso"),
    keywords: ["tortilla", "cheese"], allergens: ["dairy", "wheat"], prepMinutes: 8, needsCold: true,
    groceries: { en: ["1 tortilla", "2 ounces shredded cheese"], es: ["1 tortilla", "2 onzas de queso rallado"] },
  },
  {
    id: "mini-bagel", component: "main", art: "bagel",
    name: localized("Mini bagel & cream cheese", "Mini bagel con queso crema"),
    keywords: ["bagel", "cream cheese"], allergens: ["dairy", "wheat"], prepMinutes: 3, needsCold: true,
    groceries: { en: ["1 mini bagel", "1 tablespoon cream cheese"], es: ["1 mini bagel", "1 cucharada de queso crema"] },
  },
  {
    id: "leftover-chicken", component: "main", art: "chicken",
    name: localized("Leftover chicken", "Pollo del día anterior"),
    keywords: ["chicken", "grilled chicken", "roast chicken"], allergens: [], prepMinutes: 3, needsCold: true, leftoverOnly: true,
    groceries: { en: [], es: [] },
  },
  {
    id: "pasta-box", component: "main", art: "pasta",
    name: localized("Pasta box", "Caja de pasta"),
    keywords: ["pasta", "noodles"], allergens: ["wheat"], prepMinutes: 5, needsCold: true, leftoverOnly: true,
    groceries: { en: [], es: [] },
  },
  {
    id: "mini-pizza", component: "main", art: "pizza",
    name: localized("Homemade mini pizza", "Mini pizza casera"),
    keywords: ["pizza", "pita", "tomato", "cheese"], allergens: ["dairy", "wheat"], prepMinutes: 12, needsCold: true,
    groceries: { en: ["1 mini pita", "2 tablespoons pizza sauce", "2 ounces shredded cheese"], es: ["1 mini pita", "2 cucharadas de salsa para pizza", "2 onzas de queso rallado"] },
  },
  {
    id: "cheese-crackers", component: "main", art: "snackbox",
    name: localized("Cheese & crackers", "Queso con galletas saladas"),
    keywords: ["cheese", "crackers"], allergens: ["dairy", "wheat"], prepMinutes: 3, needsCold: true,
    groceries: { en: ["2 ounces sliced cheese", "8 crackers"], es: ["2 onzas de queso rebanado", "8 galletas saladas"] },
  },
  {
    id: "mini-waffles", component: "main", art: "waffle",
    name: localized("Mini waffles", "Mini waffles"),
    keywords: ["waffle", "breakfast"], allergens: ["egg", "wheat", "dairy"], prepMinutes: 5,
    groceries: { en: ["3 mini waffles"], es: ["3 mini waffles"] },
  },

  { id: "strawberries", component: "produce", also: ["extra"], art: "berries", name: localized("Strawberries", "Fresas"), keywords: ["strawberry", "berries"], allergens: [], prepMinutes: 2, needsCold: true, groceries: { en: ["0.2 container strawberries"], es: ["0.2 envase de fresas"] } },
  { id: "blueberries", component: "produce", art: "berries", name: localized("Blueberries", "Arándanos"), keywords: ["blueberry", "berries"], allergens: [], prepMinutes: 1, needsCold: true, groceries: { en: ["0.2 container blueberries"], es: ["0.2 envase de arándanos"] } },
  { id: "apple-slices", component: "produce", art: "apple", name: localized("Apple slices", "Rodajas de manzana"), keywords: ["apple"], allergens: [], prepMinutes: 3, groceries: { en: ["1 apple"], es: ["1 manzana"] } },
  { id: "grapes", component: "produce", art: "grapes", name: localized("Grapes", "Uvas"), keywords: ["grape"], allergens: [], prepMinutes: 2, needsCold: true, groceries: { en: ["0.2 bag grapes"], es: ["0.2 bolsa de uvas"] } },
  { id: "cucumber", component: "produce", also: ["side"], art: "cucumber", name: localized("Cucumber slices", "Rodajas de pepino"), keywords: ["cucumber"], allergens: [], prepMinutes: 3, needsCold: true, groceries: { en: ["0.25 cucumber"], es: ["0.25 pepino"] } },
  { id: "carrots", component: "produce", also: ["side"], art: "carrot", name: localized("Carrot sticks", "Palitos de zanahoria"), keywords: ["carrot"], allergens: [], prepMinutes: 2, needsCold: true, groceries: { en: ["0.2 bag baby carrots"], es: ["0.2 bolsa de zanahorias baby"] } },
  { id: "orange-slices", component: "produce", art: "orange", name: localized("Orange slices", "Rodajas de naranja"), keywords: ["orange"], allergens: [], prepMinutes: 2, groceries: { en: ["1 orange"], es: ["1 naranja"] } },

  { id: "pretzels", component: "side", also: ["extra"], art: "pretzel", name: localized("Pretzels", "Pretzels"), keywords: ["pretzel"], allergens: ["wheat"], prepMinutes: 1, groceries: { en: ["1 ounce pretzels"], es: ["1 onza de pretzels"] } },
  { id: "crackers", component: "side", also: ["extra"], art: "crackers", name: localized("Crackers", "Galletas saladas"), keywords: ["cracker"], allergens: ["wheat"], prepMinutes: 1, groceries: { en: ["1 ounce crackers"], es: ["1 onza de galletas saladas"] } },
  { id: "goldfish", component: "side", art: "crackers", name: localized("Goldfish crackers", "Galletas Goldfish"), keywords: ["goldfish", "cracker"], allergens: ["dairy", "wheat"], prepMinutes: 1, groceries: { en: ["1 ounce Goldfish crackers"], es: ["1 onza de galletas Goldfish"] } },
  { id: "popcorn", component: "side", art: "popcorn", name: localized("Popcorn", "Palomitas"), keywords: ["popcorn"], allergens: [], prepMinutes: 2, groceries: { en: ["1 ounce popcorn"], es: ["1 onza de palomitas"] } },
  { id: "tortilla-chips", component: "side", art: "chips", name: localized("Tortilla chips", "Totopos"), keywords: ["tortilla", "chips"], allergens: [], prepMinutes: 1, groceries: { en: ["1 ounce tortilla chips"], es: ["1 onza de totopos"] } },
  { id: "pita-chips", component: "side", art: "chips", name: localized("Pita chips", "Chips de pita"), keywords: ["pita", "chips"], allergens: ["wheat"], prepMinutes: 1, groceries: { en: ["1 ounce pita chips"], es: ["1 onza de chips de pita"] } },

  { id: "yogurt", component: "extra", art: "yogurt", name: localized("Yogurt", "Yogur"), keywords: ["yogurt"], allergens: ["dairy"], prepMinutes: 1, needsCold: true, groceries: { en: ["1 yogurt cup"], es: ["1 envase de yogur"] } },
  { id: "cheese-stick", component: "extra", art: "cheese", name: localized("Cheese stick", "Palito de queso"), keywords: ["cheese"], allergens: ["dairy"], prepMinutes: 1, needsCold: true, groceries: { en: ["1 cheese stick"], es: ["1 palito de queso"] } },
  { id: "granola-bar", component: "extra", art: "bar", name: localized("Granola bar", "Barra de granola"), keywords: ["granola", "oats"], allergens: ["wheat"], prepMinutes: 1, groceries: { en: ["1 granola bar"], es: ["1 barra de granola"] } },
  { id: "muffin", component: "extra", art: "muffin", name: localized("Mini muffin", "Mini muffin"), keywords: ["muffin"], allergens: ["egg", "wheat", "dairy"], prepMinutes: 1, groceries: { en: ["1 mini muffin"], es: ["1 mini muffin"] } },
  { id: "cookie", component: "extra", art: "cookie", name: localized("Cookie", "Galleta"), keywords: ["cookie"], allergens: ["egg", "wheat", "dairy"], prepMinutes: 1, groceries: { en: ["1 cookie"], es: ["1 galleta"] } },
  { id: "applesauce", component: "extra", art: "applesauce", name: localized("Applesauce", "Puré de manzana"), keywords: ["apple", "applesauce"], allergens: [], prepMinutes: 1, groceries: { en: ["1 applesauce pouch"], es: ["1 bolsa de puré de manzana"] } },

  { id: "water", component: "drink", art: "water", name: localized("Water", "Agua"), keywords: ["water"], allergens: [], prepMinutes: 1, groceries: { en: [], es: [] } },
  { id: "milk", component: "drink", art: "milk", name: localized("Milk", "Leche"), keywords: ["milk"], allergens: ["dairy"], prepMinutes: 1, needsCold: true, groceries: { en: ["1 milk box"], es: ["1 caja de leche"] } },
  { id: "juice", component: "drink", art: "juice", name: localized("Juice", "Jugo"), keywords: ["juice"], allergens: [], prepMinutes: 1, groceries: { en: ["1 juice box"], es: ["1 caja de jugo"] } },
];

export const completeLunchIdeas = [
  { id: "turkey-box", name: localized("Turkey Roll-Up Box", "Caja de rollitos de pavo"), components: { main: "turkey-rollups", produce: "strawberries", side: "cucumber", extra: "pretzels", drink: "water" } },
  { id: "pizza-box", name: localized("Pizza Box", "Caja de pizza"), components: { main: "mini-pizza", produce: "blueberries", side: "cucumber", extra: "crackers", drink: "water" } },
  { id: "snack-box", name: localized("Snack Box", "Caja de bocadillos"), components: { main: "cheese-crackers", produce: "apple-slices", side: "carrots", extra: "yogurt", drink: "water" } },
  { id: "breakfast-lunch", name: localized("Breakfast-for-Lunch", "Desayuno para almorzar"), components: { main: "mini-waffles", produce: "strawberries", side: "pretzels", extra: "yogurt", drink: "water" } },
];

const catalogById = new Map(lunchCatalog.map((item) => [item.id, item]));

export function lunchFoodById(id) {
  return catalogById.get(id) || null;
}

export function normalizeLunchComponents(value) {
  const source = value && typeof value === "object" ? value : {};
  return Object.fromEntries(COMPONENT_KEYS.map((component) => {
    const food = lunchFoodById(source[component]);
    return [component, food && (food.component === component || food.also?.includes(component)) ? food.id : ""];
  }));
}

export function normalizeLunchPlan(value) {
  const source = value && typeof value === "object" ? value : {};
  const dayType = DAY_TYPES.includes(source.dayType) ? source.dayType : "pack";
  const components = normalizeLunchComponents(source.components);
  return {
    dayType,
    components,
    approved: dayType === "pack" && source.approved === true,
    packedSlots: dayType === "pack"
      ? [...new Set(Array.isArray(source.packedSlots) ? source.packedSlots.filter((key) => COMPONENT_KEYS.includes(key)) : [])]
      : [],
    packedAt: dayType === "pack" ? timestamp(source.packedAt) : "",
    updatedAt: timestamp(source.updatedAt),
    updatedBy: text(source.updatedBy, 80),
  };
}

export function emptySchoolLunches() {
  return { schemaVersion: 1, plans: {}, preferences: [], savedLunches: [], settings: {} };
}

export function normalizeSchoolLunches(value) {
  const source = value && typeof value === "object" ? value : {};
  const plans = Object.fromEntries(Object.entries(source.plans || {})
    .filter(([dateKey]) => /^\d{4}-\d{2}-\d{2}$/.test(dateKey))
    .sort(([left], [right]) => right.localeCompare(left))
    .slice(0, MAX_PLAN_DATES)
    .map(([dateKey, memberPlans]) => [dateKey, Object.fromEntries(Object.entries(memberPlans || {})
      .map(([memberId, plan]) => [validId(memberId), normalizeLunchPlan(plan)])
      .filter(([memberId]) => memberId)
      .slice(0, 20))]));
  const preferenceSeen = new Set();
  const preferences = (Array.isArray(source.preferences) ? source.preferences : []).map((entry) => {
    const memberId = validId(entry?.memberId);
    const foodId = validId(entry?.foodId);
    const rating = RATINGS.includes(entry?.rating) ? entry.rating : "";
    const key = `${memberId}:${foodId}`;
    if (!memberId || !lunchFoodById(foodId) || (!rating && entry?.favorite !== true) || preferenceSeen.has(key)) return null;
    preferenceSeen.add(key);
    return {
      id: validId(entry?.id) || `lunch-pref-${memberId}-${foodId}`.slice(0, 160),
      memberId,
      foodId,
      rating,
      favorite: entry?.favorite === true,
      updatedAt: timestamp(entry?.updatedAt),
      updatedBy: text(entry?.updatedBy, 80),
    };
  }).filter(Boolean).slice(0, MAX_PREFERENCES);
  const savedLunches = (Array.isArray(source.savedLunches) ? source.savedLunches : []).map((entry) => {
    const memberId = validId(entry?.memberId);
    const components = normalizeLunchComponents(entry?.components);
    if (!memberId || COMPONENT_KEYS.some((key) => !components[key])) return null;
    return {
      id: validId(entry?.id) || `saved-lunch-${Date.now()}`,
      memberId,
      name: text(entry?.name, 80),
      components,
      updatedAt: timestamp(entry?.updatedAt),
      updatedBy: text(entry?.updatedBy, 80),
    };
  }).filter(Boolean).slice(0, MAX_SAVED_LUNCHES);
  const settings = Object.fromEntries(Object.entries(source.settings || {}).map(([memberId, entry]) => [
    validId(memberId),
    {
      maxPrepMinutes: [5, 10, 15].includes(Number(entry?.maxPrepMinutes)) ? Number(entry.maxPrepMinutes) : 10,
      coldPack: entry?.coldPack !== false,
      reheat: entry?.reheat === true,
    },
  ]).filter(([memberId]) => memberId).slice(0, 20));
  return { schemaVersion: 1, plans, preferences, savedLunches, settings };
}

export function lunchPreferenceFor(state, memberId, foodId) {
  return normalizeSchoolLunches(state).preferences.find((entry) => entry.memberId === memberId && entry.foodId === foodId) || null;
}

export function rateLunchFood(state, memberId, foodId, rating, updatedBy = "Family", now = new Date().toISOString()) {
  const normalized = normalizeSchoolLunches(state);
  if (!validId(memberId) || !lunchFoodById(foodId) || !RATINGS.includes(rating)) return normalized;
  const current = normalized.preferences.find((entry) => entry.memberId === memberId && entry.foodId === foodId);
  const next = {
    id: current?.id || `lunch-pref-${memberId}-${foodId}`.slice(0, 160),
    memberId,
    foodId,
    rating,
    favorite: current?.favorite === true,
    updatedAt: now,
    updatedBy,
  };
  return { ...normalized, preferences: [next, ...normalized.preferences.filter((entry) => !(entry.memberId === memberId && entry.foodId === foodId))] };
}

export function toggleLunchFoodFavorite(state, memberId, foodId, updatedBy = "Family", now = new Date().toISOString()) {
  const normalized = normalizeSchoolLunches(state);
  if (!validId(memberId) || !lunchFoodById(foodId)) return normalized;
  const current = normalized.preferences.find((entry) => entry.memberId === memberId && entry.foodId === foodId);
  const next = {
    id: current?.id || `lunch-pref-${memberId}-${foodId}`.slice(0, 160),
    memberId,
    foodId,
    rating: current?.rating || "",
    favorite: current?.favorite !== true,
    updatedAt: now,
    updatedBy,
  };
  return { ...normalized, preferences: [next, ...normalized.preferences.filter((entry) => !(entry.memberId === memberId && entry.foodId === foodId))] };
}

function searchText(value) {
  if (Array.isArray(value)) return value.map(searchText).join(" ");
  if (value && typeof value === "object") return Object.values(value).map(searchText).join(" ");
  return `${value || ""}`.toLocaleLowerCase();
}

function hash(value) {
  return [...`${value || ""}`].reduce((total, character) => ((total * 31) + character.charCodeAt(0)) >>> 0, 7);
}

function ratingScore(rating) {
  return { love: 16, eat: 7, dislike: -50, never: -10000 }[rating] || 0;
}

function recentMainIds(state, memberId, beforeDate, days = 10) {
  const start = new Date(`${beforeDate}T12:00:00`);
  return Object.entries(normalizeSchoolLunches(state).plans).flatMap(([dateKey, plans]) => {
    const delta = Math.round((start - new Date(`${dateKey}T12:00:00`)) / 86400000);
    return delta > 0 && delta <= days && plans[memberId]?.dayType === "pack"
      ? [plans[memberId].components.main]
      : [];
  }).filter(Boolean);
}

function approvalCount(state, memberId, foodId) {
  return Object.values(normalizeSchoolLunches(state).plans).reduce((count, plans) => {
    const plan = plans[memberId];
    if (!plan?.approved || plan.dayType !== "pack") return count;
    return count + Object.values(plan.components).filter((id) => id === foodId).length;
  }, 0);
}

function restrictionBlocks(food, restrictions) {
  const foodText = searchText([food.name, food.keywords, food.allergens, food.groceries]);
  return restrictions.some((restriction) => {
    const raw = searchText(restriction);
    const terms = raw.split(/[^a-záéíóúñ0-9]+/).filter((term) => term.length > 2);
    if (/milk|cheese|lactose|lácte|leche|queso/.test(raw)) terms.push("dairy");
    if (/gluten|trigo/.test(raw)) terms.push("wheat");
    if (/peanut|tree nut|nuts|cacahuate|nuez/.test(raw)) terms.push("peanut", "nut");
    if (/egg|huevo/.test(raw)) terms.push("egg");
    return terms.some((term) => foodText.includes(term));
  });
}

export function lunchFoodBlockedByRestrictions(foodOrId, restrictions = []) {
  const food = typeof foodOrId === "string" ? lunchFoodById(foodOrId) : foodOrId;
  return Boolean(food && restrictionBlocks(food, Array.isArray(restrictions) ? restrictions : []));
}

function overlapScore(food, contextText) {
  return [...new Set(food.keywords || [])].reduce((score, keyword) => score + (contextText.includes(keyword.toLocaleLowerCase()) ? 4 : 0), 0);
}

export function generateLunch({
  state,
  memberId,
  dateKey,
  restrictions = [],
  context = {},
  settings = null,
  exclude = {},
} = {}) {
  const normalized = normalizeSchoolLunches(state);
  const memberSettings = settings || normalized.settings[memberId] || { maxPrepMinutes: 10, coldPack: true, reheat: false };
  const contextText = searchText([context.mealPlan, context.groceries, context.inventory, context.leftovers]);
  const leftoverText = searchText(context.leftovers);
  const recentMains = recentMainIds(normalized, memberId, dateKey);
  const preferences = new Map(normalized.preferences.filter((entry) => entry.memberId === memberId).map((entry) => [entry.foodId, entry]));
  const components = {};

  COMPONENT_KEYS.forEach((component, componentIndex) => {
    const candidates = lunchCatalog.filter((food) => food.component === component || food.also?.includes(component))
      .filter((food) => !restrictionBlocks(food, restrictions))
      .filter((food) => preferences.get(food.id)?.rating !== "never")
      .filter((food) => !food.leftoverOnly || food.keywords.some((keyword) => leftoverText.includes(keyword)))
      .filter((food) => memberSettings.coldPack !== false || !food.needsCold)
      .filter((food) => memberSettings.reheat === true || !food.needsHeat)
      .filter((food) => Number(food.prepMinutes || 0) <= Number(memberSettings.maxPrepMinutes || 10))
      .filter((food) => food.id !== exclude[component])
      .filter((food) => !Object.values(components).includes(food.id))
      .map((food) => {
        const preference = preferences.get(food.id);
        let score = ratingScore(preference?.rating) + overlapScore(food, contextText);
        score += Math.min(10, approvalCount(normalized, memberId, food.id) * 2);
        if (component === "main") score -= recentMains.filter((id) => id === food.id).length * 18;
        if (preference?.favorite) score += 5;
        score += (hash(`${memberId}:${dateKey}:${food.id}:${componentIndex}`) % 100) / 100;
        return { food, score };
      })
      .filter(({ score }) => score > -9999)
      .sort((left, right) => right.score - left.score || left.food.id.localeCompare(right.food.id));
    components[component] = candidates[0]?.food.id || "";
  });
  return normalizeLunchPlan({ dayType: "pack", components });
}

export function generateLunchWeek({ state, members = [], dateKeys = [], restrictionsByMember = {}, context = {}, contextForDate = null, settingsByMember = {} } = {}) {
  let next = normalizeSchoolLunches(state);
  dateKeys.forEach((dateKey) => {
    members.forEach((member) => {
      const existing = next.plans[dateKey]?.[member.id];
      if (existing && (existing.dayType !== "pack" || existing.approved)) return;
      const plan = generateLunch({
        state: next,
        memberId: member.id,
        dateKey,
        restrictions: restrictionsByMember[member.id] || [],
        context: typeof contextForDate === "function" ? contextForDate(dateKey, member) : context,
        settings: settingsByMember[member.id],
      });
      next = setLunchPlan(next, dateKey, member.id, plan);
    });
  });
  return next;
}

export function setLunchPlan(state, dateKey, memberId, plan, updatedBy = "", now = new Date().toISOString()) {
  const normalized = normalizeSchoolLunches(state);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !validId(memberId)) return normalized;
  const nextPlan = { ...normalizeLunchPlan(plan), updatedAt: now, updatedBy: text(updatedBy, 80) };
  return {
    ...normalized,
    plans: {
      ...normalized.plans,
      [dateKey]: { ...(normalized.plans[dateKey] || {}), [memberId]: nextPlan },
    },
  };
}

export function setLunchDayType(state, dateKey, memberId, dayType, updatedBy = "", now = new Date().toISOString()) {
  const current = normalizeSchoolLunches(state).plans[dateKey]?.[memberId] || {};
  return setLunchPlan(state, dateKey, memberId, { ...current, dayType: DAY_TYPES.includes(dayType) ? dayType : "pack", approved: false }, updatedBy, now);
}

export function setLunchSetting(state, memberId, setting, value) {
  const normalized = normalizeSchoolLunches(state);
  const current = normalized.settings[memberId] || { maxPrepMinutes: 10, coldPack: true, reheat: false };
  const next = { ...current, [setting]: value };
  return normalizeSchoolLunches({ ...normalized, settings: { ...normalized.settings, [memberId]: next } });
}

export function saveLunchCombination(state, memberId, components, name = "", updatedBy = "", now = new Date().toISOString()) {
  const normalized = normalizeSchoolLunches(state);
  const cleanComponents = normalizeLunchComponents(components);
  if (!validId(memberId) || COMPONENT_KEYS.some((key) => !cleanComponents[key])) return normalized;
  const signature = COMPONENT_KEYS.map((key) => cleanComponents[key]).join("|");
  const duplicate = normalized.savedLunches.find((entry) => entry.memberId === memberId
    && COMPONENT_KEYS.map((key) => entry.components[key]).join("|") === signature);
  if (duplicate) return normalized;
  return {
    ...normalized,
    savedLunches: [{
      id: `saved-lunch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      memberId,
      name: text(name, 80),
      components: cleanComponents,
      updatedAt: now,
      updatedBy: text(updatedBy, 80),
    }, ...normalized.savedLunches].slice(0, MAX_SAVED_LUNCHES),
  };
}

export function lunchFavoritesFor(state, memberId) {
  const normalized = normalizeSchoolLunches(state);
  const counts = new Map();
  Object.values(normalized.plans).forEach((plans) => {
    const plan = plans[memberId];
    if (!plan?.approved || plan.dayType !== "pack") return;
    COMPONENT_KEYS.forEach((key) => counts.set(plan.components[key], (counts.get(plan.components[key]) || 0) + 1));
  });
  normalized.preferences.filter((entry) => entry.memberId === memberId && entry.favorite)
    .forEach((entry) => counts.set(entry.foodId, Math.max(2, counts.get(entry.foodId) || 0)));
  return [...counts.entries()]
    .map(([foodId, count]) => ({ food: lunchFoodById(foodId), count }))
    .filter(({ food }) => food)
    .sort((left, right) => right.count - left.count || left.food.id.localeCompare(right.food.id));
}

export function schoolWeekDateKeys(anchor = new Date()) {
  const date = new Date(anchor);
  date.setHours(12, 0, 0, 0);
  const day = date.getDay();
  const distanceToMonday = day === 0 ? 1 : day === 6 ? 2 : 1 - day;
  date.setDate(date.getDate() + distanceToMonday);
  return Array.from({ length: 5 }, (_, index) => {
    const next = new Date(date);
    next.setDate(date.getDate() + index);
    return next.toISOString().slice(0, 10);
  });
}

export function nextSchoolDateKey(now = new Date()) {
  const date = new Date(now);
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + 1);
  while ([0, 6].includes(date.getDay())) date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function lunchPlanComplete(plan) {
  const normalized = normalizeLunchPlan(plan);
  return normalized.dayType !== "pack" || COMPONENT_KEYS.every((key) => normalized.components[key]);
}

export function lunchPlanSignature(plan) {
  const normalized = normalizeLunchPlan(plan);
  return COMPONENT_KEYS.map((key) => normalized.components[key]).join("|");
}

export function approvedLunchFoodUses(state, dateKeys = [], members = []) {
  const normalized = normalizeSchoolLunches(state);
  const memberMap = new Map(members.map((member) => [member.id, member]));
  return dateKeys.flatMap((dateKey) => Object.entries(normalized.plans[dateKey] || {}).flatMap(([memberId, plan]) => {
    if (!plan.approved || plan.dayType !== "pack") return [];
    const member = memberMap.get(memberId);
    if (!member) return [];
    return COMPONENT_KEYS.map((component) => ({
      dateKey,
      memberId,
      memberName: member.name,
      component,
      food: lunchFoodById(plan.components[component]),
    })).filter((entry) => entry.food && entry.food.groceries.en.length);
  }));
}

export function approvedLunchDateKeys(state, { from = "0000-00-00", to = "9999-99-99" } = {}) {
  const normalized = normalizeSchoolLunches(state);
  return Object.entries(normalized.plans)
    .filter(([dateKey, plans]) => dateKey >= from && dateKey <= to
      && Object.values(plans).some((plan) => plan.approved && plan.dayType === "pack"))
    .map(([dateKey]) => dateKey)
    .sort();
}
