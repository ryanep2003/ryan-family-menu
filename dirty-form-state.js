function areaFor(form) {
  return form?.dataset?.dirtyArea
    || form?.closest?.("[data-dirty-area]")?.dataset?.dirtyArea
    || (form?.id === "editRecipeForm" || form?.id === "uploadForm" ? "recipes" : "shared");
}

function surfaceFor(form) {
  return form?.dataset?.dirtySurface
    || form?.closest?.("[data-dirty-surface]")?.dataset?.dirtySurface
    || areaFor(form);
}

function targetFor(node) {
  return node?.closest?.("form") || node?.closest?.("[data-dirty-area]") || node;
}

export function createDirtyFormTracker() {
  const dirtyForms = new Set();
  const generations = new WeakMap();

  function mark(node) {
    const target = targetFor(node);
    if (!target) return null;
    const generation = (generations.get(target) || 0) + 1;
    generations.set(target, generation);
    dirtyForms.add(target);
    target.dataset.dirty = "true";
    target.classList?.add("is-dirty");
    return target;
  }

  function clear(node) {
    const target = targetFor(node);
    if (!target) return;
    dirtyForms.delete(target);
    if (target.dataset) delete target.dataset.dirty;
    target.classList?.remove("is-dirty");
  }

  function snapshot(surface) {
    return [...dirtyForms]
      .filter((target) => surfaceFor(target) === surface)
      .map((target) => ({ target, generation: generations.get(target) || 0 }));
  }

  function clearSnapshot(savedSnapshot = []) {
    savedSnapshot.forEach(({ target, generation }) => {
      if (!dirtyForms.has(target) || generations.get(target) !== generation) return;
      clear(target);
    });
  }

  return {
    dirtyFormArea: areaFor,
    dirtyFormSurface: surfaceFor,
    dirtyFormTarget: targetFor,
    markDirtyForm: mark,
    clearDirtyForm: clear,
    clearDirtyArea(area) {
      [...dirtyForms].filter((target) => areaFor(target) === area).forEach(clear);
    },
    clearDirtySurface(surface) {
      [...dirtyForms].filter((target) => surfaceFor(target) === surface).forEach(clear);
    },
    hasDirtyArea(area) {
      return [...dirtyForms].some((target) => areaFor(target) === area);
    },
    hasDirtySurface(surface) {
      return [...dirtyForms].some((target) => surfaceFor(target) === surface);
    },
    dirtySnapshotForSurface: snapshot,
    clearDirtySnapshot: clearSnapshot,
  };
}
