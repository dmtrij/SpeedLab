function createCancelledError(message) {
  const error = new Error(message || "Test cancelled");
  error.name = "CancelledError";
  error.code = "SPEEDLAB_CANCELLED";
  return error;
}

function isCancelledError(error) {
  return error?.code === "SPEEDLAB_CANCELLED" || error?.name === "CancelledError";
}

function createTestController(testId) {
  let cancelled = false;
  let reason = "";
  const listeners = new Set();

  return {
    testId,
    get cancelled() {
      return cancelled;
    },
    get reason() {
      return reason;
    },
    cancel(message = "Test cancelled") {
      if (cancelled) {
        return;
      }

      cancelled = true;
      reason = message;
      listeners.forEach((listener) => {
        try {
          listener(message);
        } catch {
        }
      });
      listeners.clear();
    },
    onCancel(listener) {
      if (cancelled) {
        listener(reason);
        return () => {};
      }

      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    throwIfCancelled() {
      if (cancelled) {
        throw createCancelledError(reason);
      }
    }
  };
}

module.exports = {
  createCancelledError,
  isCancelledError,
  createTestController
};
