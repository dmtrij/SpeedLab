const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createCancelledError,
  createTestController,
  isCancelledError
} = require("../cancellation");

test("createCancelledError returns consistent cancellation shape", () => {
  const error = createCancelledError("Stop now");

  assert.equal(error.message, "Stop now");
  assert.equal(error.name, "CancelledError");
  assert.equal(error.code, "SPEEDLAB_CANCELLED");
  assert.equal(isCancelledError(error), true);
  assert.equal(isCancelledError(new Error("Other")), false);
});

test("createTestController notifies listeners once and throws after cancellation", () => {
  const controller = createTestController(42);
  const reasons = [];

  const unsubscribe = controller.onCancel((reason) => {
    reasons.push(reason);
  });

  controller.cancel("Manual stop");
  controller.cancel("Ignored");
  unsubscribe();

  assert.equal(controller.cancelled, true);
  assert.equal(controller.reason, "Manual stop");
  assert.deepEqual(reasons, ["Manual stop"]);
  assert.throws(() => controller.throwIfCancelled(), {
    name: "CancelledError",
    code: "SPEEDLAB_CANCELLED",
    message: "Manual stop"
  });
});

test("late cancellation subscribers are invoked immediately", () => {
  const controller = createTestController(99);

  controller.cancel("Late");

  let received = "";
  const unsubscribe = controller.onCancel((reason) => {
    received = reason;
  });

  unsubscribe();
  assert.equal(received, "Late");
});
