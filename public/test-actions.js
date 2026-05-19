(function exposeSpeedLabTestActions() {
  function createTestActions({ loadTestPage, navigate, requestJson } = {}) {
    if (typeof loadTestPage !== "function" || typeof navigate !== "function" || typeof requestJson !== "function") {
      throw new Error("SpeedLab test actions require loadTestPage, navigate, and requestJson.");
    }

    function bindTestDetailActions(testId) {
      window.SpeedLabCustomSelect.bindRenderedSelects(document, ({ action, value }) => {
        if (action === "open-test" && value && value !== String(testId)) {
          navigate(`/test/${value}`);
          return;
        }

        if (action === "baseline") {
          const url = new URL(window.location.href);
          if (value) {
            url.searchParams.set("baseline", value);
          } else {
            url.searchParams.delete("baseline");
          }
          history.replaceState({}, "", `${url.pathname}${url.search}`);
          loadTestPage(testId);
        }
      });

      const repeatButton = document.querySelector("[data-repeat-test]");
      if (repeatButton) {
        repeatButton.addEventListener("click", async () => {
          const response = await requestJson(`/api/tests/${testId}/retry`, { method: "POST" });
          navigate(`/test/${response.testId}`);
        });
      }

      const cancelButton = document.querySelector("[data-cancel-test]");
      if (cancelButton) {
        cancelButton.addEventListener("click", async () => {
          if (!window.confirm(`\u041e\u0442\u043c\u0435\u043d\u0438\u0442\u044c \u0442\u0435\u0441\u0442 #${testId}?`)) {
            return;
          }

          await requestJson(`/api/tests/${testId}/cancel`, { method: "POST" });
          loadTestPage(testId);
        });
      }

      const resetBaselineButton = document.querySelector("[data-reset-baseline]");
      if (resetBaselineButton) {
        resetBaselineButton.addEventListener("click", () => {
          const url = new URL(window.location.href);
          if (!url.searchParams.has("baseline")) {
            return;
          }

          url.searchParams.delete("baseline");
          history.replaceState({}, "", `${url.pathname}${url.search}`);
          loadTestPage(testId);
        });
      }
    }

    return Object.freeze({
      bindTestDetailActions
    });
  }

  window.SpeedLabTestActions = Object.freeze({
    createTestActions
  });
})();
