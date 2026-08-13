const DEFAULT_RETRY_DELAYS = [2000, 10000];

export function createSharedStateLoader({
  fetchState,
  applyState,
  onUnavailable,
  onApplyError = onUnavailable,
  retryDelays = DEFAULT_RETRY_DELAYS,
  setTimer = (callback, delay) => window.setTimeout(callback, delay),
  clearTimer = (timer) => window.clearTimeout(timer),
}) {
  let retryTimer = 0;
  let retryAttempt = 0;
  let inFlight = null;

  function cancelRetry() {
    if (retryTimer) clearTimer(retryTimer);
    retryTimer = 0;
  }

  function scheduleRetry(error) {
    const delay = retryDelays[retryAttempt];
    if (delay === undefined) {
      onUnavailable(error);
      return;
    }

    retryAttempt += 1;
    retryTimer = setTimer(() => {
      retryTimer = 0;
      return load();
    }, delay);
  }

  function load({ restart = false } = {}) {
    if (restart) {
      cancelRetry();
      retryAttempt = 0;
    }
    if (inFlight) return inFlight;

    inFlight = (async () => {
      let data;
      try {
        data = await fetchState();
      } catch (error) {
        scheduleRetry(error);
        return { status: "network-error", error };
      }

      // A successful HTTP response ends network retry handling. Errors while
      // applying or rendering the response must never trigger another fetch.
      cancelRetry();
      retryAttempt = 0;
      try {
        await applyState(data);
        return { status: "loaded", data };
      } catch (error) {
        onApplyError(error);
        return { status: "apply-error", error };
      }
    })().finally(() => {
      inFlight = null;
    });

    return inFlight;
  }

  return {
    load,
    cancel: cancelRetry,
    retryAttempt: () => retryAttempt,
  };
}
