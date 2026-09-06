import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const translations = readFileSync(new URL("../translations.js", import.meta.url), "utf8");

test("a validated grocery GET renders before attempting the local cache write", () => {
  const loadSource = app.match(/function loadGroceries\(\)[\s\S]*?\nasync function saveGroceries\(\)/)?.[0] || "";
  const renderIndex = loadSource.indexOf("render();");
  const persistIndex = loadSource.indexOf("persistGroceriesLocally(groceries, groceryVersion);");
  assert.ok(renderIndex >= 0);
  assert.ok(persistIndex > renderIndex);
  assert.match(loadSource, /catch \(error\) \{\s+storageError \|\|= error;/);
  assert.match(loadSource, /finishGroceryCloudSync\(\{ storageError, cleanupPending \}\)/);
});

test("cloud save success distinguishes an unavailable offline backup", () => {
  assert.match(app, /onSaved: \(\{ settled, storageError, cleanupPending \}\)/);
  assert.match(app, /finishGroceryCloudSync\(\{ storageError, cleanupPending \}\)/);
  assert.match(translations, /groceriesSyncedNoOfflineBackup:/);
  assert.match(translations, /Shopping changes aren’t shared yet and couldn’t be saved on this device/);
  assert.match(translations, /Los cambios de Compras aún no se compartieron y no pudieron guardarse en este dispositivo/);
});

test("acknowledgement cleanup has a local-only retry state", () => {
  assert.match(app, /groceryRetryCoordinator\.setFailure\("cleanup"\)/);
  assert.match(app, /cleanup: \(\) => \{\s+const result = grocerySaveCoordinator\.retryLocalCleanup\(\);/);
  assert.match(translations, /groceriesCleanupPending:/);
});
