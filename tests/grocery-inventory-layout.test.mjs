import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../app.js", import.meta.url), "utf8");
const inventoryUi = await readFile(new URL("../inventory-ui.js", import.meta.url), "utf8");
const styles = await readFile(new URL("../styles.css", import.meta.url), "utf8");
const shoppingListLogic = await readFile(new URL("../shopping-list-logic.js", import.meta.url), "utf8");
const shoppingListsEndpoint = await readFile(new URL("../netlify/functions/shopping-lists.js", import.meta.url), "utf8");

test("shopping keeps the active list before occasional utility controls", () => {
  assert.ok(html.indexOf('id="groceryList"') < html.indexOf('class="grocery-tools-menu"'));
  assert.ok(html.indexOf('id="groceryList"') < html.indexOf('class="monthly-budget"'));
  assert.ok(styles.includes(".grocery-list { margin-top: 0; }"));
});

test("shopping completion and receipt capture remain available", () => {
  assert.ok(html.includes('id="finishShoppingPanel"') && html.includes('id="scanReceiptToggle"'));
  assert.ok(html.includes('id="manualReceiptForm"') && html.includes('id="manualReceiptTotal"'));
  assert.ok(app.includes("#finishWithoutReceipt") && app.includes("movePurchasedItemsHome()"));
  assert.ok(styles.includes(".finish-shopping-prompt { display: flex"));
  assert.doesNotMatch(html, /class="grocery-tools-menu"[\s\S]*id="scanReceiptToggle"/);
});

test("receipt upload remains available without preceding the working list", () => {
  assert.match(html, /class="ghost-button receipt-upload-button" id="quickReceiptUpload"[^>]*data-i18n="uploadReceipt"/);
  assert.ok(html.indexOf('id="quickReceiptUpload"') > html.indexOf('id="groceryList"'));
  assert.ok(app.includes("#quickReceiptUpload") && app.includes("openFinishShopping({ showReceipt: true })"));
  assert.ok(app.includes("showReceipt") && app.includes("#receiptScanPanel"));
});

test("inventory remains a progressive-disclosure maintenance surface", () => {
  assert.match(html, /class="inventory-tools-menu"/);
  assert.match(html, /class="inventory-tools">\s*<details>/);
  assert.match(html, /id="inventoryLocationFilter"/);
  assert.ok(app.includes("inventoryLocationFilter") && app.includes('addEventListener("change"'));
  assert.match(inventoryUi, /#inventoryStatus.+addedToShopping/);
});

test("inventory controls retain practical touch targets", () => {
  assert.match(styles, /input, select, textarea\s*\{[\s\S]*?width: 100%;[\s\S]*?min-height: 44px;/);
  assert.ok(styles.includes("min-height: 44px"));
  assert.match(html, /data-inventory-filter="all"/);
  assert.match(html, /id="inventoryLocationFilter"/);
});

test("inventory uses compact rows with explicit bulk management", () => {
  assert.match(html, /id="inventorySelectMode"/);
  assert.match(html, /id="inventoryBulkToolbar"[^>]*hidden/);
  assert.match(html, /id="inventorySelectVisible"/);
  assert.match(html, /id="inventoryRemoveSelected"/);
  assert.match(html, /id="inventoryClearAll"/);
  assert.match(html, /id="clearAllGroceries"/);
  assert.ok(inventoryUi.includes("removeSelectedInventoryConfirm"));
  assert.ok(inventoryUi.includes("clearAllInventoryConfirm"));
  assert.ok(app.includes("clearAllGroceriesConfirm"));
  assert.match(styles, /\.inventory-row-details\s*\{/);
  assert.match(styles, /\.inventory-bulk-toolbar\s*\{/);
});

test("inventory maintenance does not replace shopping context", () => {
  assert.match(html, /id="inventorySearch"[^>]*type="search"/);
  assert.ok(app.includes("inventorySearch") && app.includes('addEventListener("input"'));
  assert.doesNotMatch(inventoryUi, /setInventoryMode\("shopping"\)/);
});

test("mobile shell preserves room for the fixed five-view navigation", () => {
  assert.ok(styles.includes("--bottom-nav-space: calc(76px + env(safe-area-inset-bottom))"));
  assert.ok(styles.includes("padding: 0 var(--space-4) calc(var(--bottom-nav-space) + var(--space-6))"));
  assert.ok(styles.includes("env(safe-area-inset-top)"));
  assert.ok(styles.includes(".tabs { position: fixed") && styles.includes("grid-template-columns: repeat(5, 1fr)"));
  assert.match(html, /class="sync-status-row app-sync-status"/);
  assert.match(html, /id="sharedSyncStatusPanel"[^>]*hidden/);
  assert.match(html, /id="recipeSyncStatusPanel"[^>]*hidden/);
  assert.match(html, /id="sharedSyncStatusPanel"[\s\S]*?id="sharedStateStatus"[\s\S]*?id="retrySharedState"/);
  assert.match(html, /id="recipeSyncStatusPanel"[\s\S]*?id="recipeSyncStatus"[\s\S]*?id="retryRecipes"/);
  assert.match(html, /id="previousWeek"/);
  assert.match(html, /id="nextWeek"/);
  assert.match(html, /id="copyWeekForward"/);
});

test("the new core navigation keeps the existing route mapping intact", () => {
  assert.match(html, /data-view="schedule" data-i18n="planTab"/);
  assert.match(html, /data-view="lunches" data-i18n="lunchesTab"/);
  assert.match(html, /data-view="grocery" data-i18n="shopTab"/);
  assert.match(html, /data-view="recipes" data-i18n="libraryTab"/);
  assert.ok(app.includes('viewName === "add" ? "recipes" : viewName'));
});

test("the compact mobile shell keeps account actions separate from content", () => {
  assert.match(styles, /\.app-header\s*\{[\s\S]*?min-height: 64px;/);
  assert.match(styles, /\.household-menu-panel\s*\{[\s\S]*?position: absolute;/);
  assert.doesNotMatch(styles, /@media\s*\(max-width:[^)]*\)[\s\S]*?\.segmented\s*\{[^}]*display:\s*none/);
});

test("meal-linked shopping stays concise and mobile-friendly", () => {
  assert.match(html, /id="groceryMealFilterPanel"[^>]*hidden/);
  assert.match(html, /id="groceryMealFilter"/);
  assert.match(html, /value="next3"[^>]*data-i18n="groceryRangeNext3"/);
  assert.match(html, /value="nextWeek"[^>]*data-i18n="groceryRangeNextWeek"/);
  assert.ok(styles.includes(".grocery-meal-filter { display: flex"));
  assert.match(styles, /@media \(max-width: 699px\)[\s\S]*?\.grocery-meal-filter, \.finish-shopping-prompt \{ display: grid; \}/);
  assert.ok(styles.includes(".grocery-meal-filter select { max-width: 17rem; }"));
});

test("shopping retains every supported planning range", () => {
  for (const range of ["week", "next3", "nextWeek", "next14", "month"]) {
    assert.match(html, new RegExp(`value="${range}"`));
  }
  assert.match(html, /id="generateGroceries"/);
});

test("shopping supports reusable scoped lists without replacing the active list", () => {
  assert.match(html, /id="savedShoppingListsPanel"/);
  assert.match(html, /id="savedShoppingListScope"/);
  for (const scope of ["day", "two-days", "recipe", "lunch", "snapshot"]) {
    assert.match(html, new RegExp(`value="${scope}"`));
  }
  assert.match(html, /id="savedShoppingLists"/);
  assert.ok(app.includes("/.netlify/functions/shopping-lists"));
  assert.ok(app.includes("generatedGroceriesForSavedList"));
  assert.ok(shoppingListLogic.includes("normalizeShoppingLists"));
  assert.ok(shoppingListsEndpoint.includes("MAX_LISTS = 100"));
  assert.match(styles, /\.saved-shopping-list-card\s*\{/);
});

test("Today keeps the meal, memory, and next actions ahead of household utilities", () => {
  assert.match(html, /id="dinnerFeedback"[^>]*hidden/);
  assert.ok(html.indexOf('id="todayMemory"') < html.indexOf('class="today-tools"'));
  assert.ok(html.indexOf('id="todayBefore"') < html.indexOf('class="today-tools"'));
  assert.match(html, /<details class="today-handoff"[\s\S]*id="todayHandoffSummary"/);
  assert.match(styles, /\.today-memory-record, \.detail-memory-record\s*\{[\s\S]*?border-left:/);
  assert.match(styles, /\.dinner-outcome-options button\s*\{[\s\S]*?min-height: 44px;/);
});

test("Today puts recipe search and the shopping list on the primary surface", () => {
  assert.ok(html.indexOf('id="todayDailyLoop"') < html.indexOf('class="today-tools"'));
  assert.ok(html.indexOf('id="todayRecipeSearch"') < html.indexOf('class="today-tools"'));
  assert.ok(html.indexOf('id="todayGrocerySummary"') < html.indexOf('class="today-tools"'));
  assert.ok(html.indexOf('id="todayInventorySummary"') > html.indexOf('class="today-tools"'));
  assert.match(html, /id="todayRecipeSearchForm"/);
  assert.match(html, /data-view-target="grocery"[^>]*data-inventory-target="shopping"/);
  assert.match(app, /inventoryMode = "shopping"/);
  assert.match(app, /#todayRecipeSearchForm/);
});

test("the Shop tab always opens the persistent shopping list", () => {
  assert.match(app, /button\.dataset\.view === "grocery"[\s\S]*inventoryMode = "shopping"/);
  assert.match(html, /data-view="grocery" data-i18n="shopTab"/);
});

test("shopping rows keep a phone-sized tap target and a clear checked state", () => {
  assert.match(styles, /\.grocery-item input\s*\{[^}]*min-height: 44px;/);
  assert.match(styles, /\.grocery-item-row\.is-checked/);
  assert.match(styles, /\.grocery-item-row\.is-unchecked/);
});

test("a recipe can be added to a day from the recipe screen", () => {
  assert.match(html, /id="addRecipeToMealForm"/);
  assert.match(html, /id="addRecipeToMealDate"/);
  assert.match(html, /id="addRecipeToMealPeriod"/);
  assert.ok(html.indexOf('id="recipeSearch"') < html.indexOf('id="recipePicksSection"'));
});

test("household attribution remains available for any family", () => {
  assert.match(html, /id="householdMemberInput"/);
  assert.match(html, /id="householdMemberSuggestions"/);
  assert.ok(app.includes("cleanHouseholdMember"));
  assert.match(html, /id="setupFamilyMembers"/);
});

test("Today has an explicit empty-state path to planning", () => {
  assert.match(html, /id="cookToday"[^>]*data-i18n="cookButton"/);
  assert.match(html, /data-view="schedule" data-i18n="planTab"/);
  assert.match(html, /id="focusedDinnerPanel"[^>]*hidden/);
  assert.match(styles, /\.today-story\s*\{/);
  assert.match(app, /openFocusedDinnerPlan:[\s\S]*scheduleUi\.openFocusedDinner/);
});

test("transient update notices have clear safe-area clearance", () => {
  const noticeRule = styles.match(/\.app-update-notice\s*\{([^}]*)\}/)?.[1] || "";
  assert.match(noticeRule, /position: fixed;/);
  assert.match(noticeRule, /bottom: calc\(80px \+ env\(safe-area-inset-bottom\)\);/);
});

test("every id in the application shell is unique", () => {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
});

test("recipe detail owns the page instead of appearing under library chrome", () => {
  assert.match(styles, /#recipesView\.detail-open \.recipe-banner[^}]*display: none/);
  assert.match(html, /id="recipePhotoRegion"[^>]*hidden/);
});

test("the household library opens to the complete catalog instead of hiding it behind a disclosure", () => {
  assert.match(html, /<details class="recipe-browse" id="recipeBrowse" open>/);
  assert.ok(html.indexOf('id="recipeLibraryTools"') < html.indexOf('id="recipePicksSection"'));
  assert.doesNotMatch(html, /id="recipeBrowse"[\s\S]*id="recipeSearch"/);
});

test("file inputs remain usable through localized picker controls", () => {
  assert.match(html, /id="receiptScanPhotoInput"[^>]*data-file-action="choosePhotos"/);
  assert.match(html, /id="receiptScanCameraInput"[^>]*capture="environment"[^>]*data-file-action="takePhoto"/);
  assert.match(html, /id="photoCameraInput"[^>]*data-file-action="takePhoto"/);
  assert.ok(app.includes("function setupLocalizedFileInputs()"));
  assert.ok(app.includes('button.addEventListener("click", () => input.click())'));
  assert.ok(styles.includes(".localized-file-input input[type=file]"));
});

test("recipe creation remains reachable from the Library route", () => {
  assert.match(html, /id="addRecipeFromLibrary"/);
  assert.match(html, /id="backToRecipeLibrary"/);
  assert.ok(app.includes("#globalAddRecipe"));
});
