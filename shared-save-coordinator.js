export function preserveLaterState(serverState, currentState, submittedState, mergeState) {
  return mergeState(serverState, currentState, submittedState);
}

export function createSerializedSaveCoordinator({ capture, execute }) {
  let tail = Promise.resolve();
  let pending = 0;

  function save(options = {}) {
    const request = capture(options);
    pending += 1;
    const result = tail.then(
      () => execute(request),
      () => execute(request),
    );
    tail = result.then(
      () => { pending -= 1; },
      () => { pending -= 1; },
    );
    return result;
  }

  return {
    save,
    isBusy: () => pending > 0,
  };
}

export async function finishSharedSave(result, request, { activityDirty = false, receiptsDirty = false, saveLedger }) {
  if (!result) return false;
  const ledgerResults = await Promise.all([
    activityDirty ? saveLedger("activity") : true,
    receiptsDirty ? saveLedger("receipts") : true,
  ]);
  return request.requireLedger === "receipts" ? ledgerResults[1] === true : result;
}
