(function exposeSpeedLabHistoryActions() {
  function createHistoryActions({ navigate, requestJson } = {}) {
    if (typeof navigate !== "function" || typeof requestJson !== "function") {
      throw new Error("SpeedLab history actions require navigate and requestJson.");
    }

    function bindHistoryActions(reload, filterValue = "") {
      document.querySelectorAll("[data-test-open]").forEach((button) => {
        button.addEventListener("click", () => {
          navigate(`/test/${button.getAttribute("data-test-open")}`);
        });
      });

      document.querySelectorAll("[data-test-pin]").forEach((button) => {
        button.addEventListener("click", async () => {
          const testId = button.getAttribute("data-test-pin");
          if (!testId) {
            return;
          }

          const nextPinned = button.getAttribute("data-pinned") !== "1";
          button.disabled = true;

          try {
            await requestJson(`/api/tests/${testId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ pinned: nextPinned })
            });
            reload(filterValue);
          } catch (error) {
            button.disabled = false;
            window.alert(error.message);
          }
        });
      });

      document.querySelectorAll("[data-history-toggle]").forEach((button) => {
        button.addEventListener("click", () => {
          const details = document.getElementById(button.getAttribute("data-history-toggle"));
          if (!details) {
            return;
          }
          const isHidden = details.classList.toggle("is-hidden");
          button.textContent = isHidden ? "\u0415\u0449\u0435" : "\u0421\u043a\u0440\u044b\u0442\u044c";
          button.setAttribute("aria-expanded", String(!isHidden));
        });
      });

      document.querySelectorAll("[data-test-delete]").forEach((button) => {
        button.addEventListener("click", async () => {
          const testId = button.getAttribute("data-test-delete");
          if (!window.confirm(`\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u0442\u0435\u0441\u0442 #${testId}?`)) {
            return;
          }
          await requestJson(`/api/tests/${testId}`, { method: "DELETE" });
          reload(filterValue);
        });
      });

      document.querySelectorAll("[data-test-retry]").forEach((button) => {
        button.addEventListener("click", async () => {
          const testId = button.getAttribute("data-test-retry");
          const response = await requestJson(`/api/tests/${testId}/retry`, { method: "POST" });
          navigate(`/test/${response.testId}`);
        });
      });

      document.querySelectorAll("[data-test-cancel]").forEach((button) => {
        button.addEventListener("click", async () => {
          const testId = button.getAttribute("data-test-cancel");
          if (!window.confirm(`\u041e\u0442\u043c\u0435\u043d\u0438\u0442\u044c \u0442\u0435\u0441\u0442 #${testId}?`)) {
            return;
          }
          await requestJson(`/api/tests/${testId}/cancel`, { method: "POST" });
          reload(filterValue);
        });
      });
    }

    return Object.freeze({
      bindHistoryActions
    });
  }

  window.SpeedLabHistoryActions = Object.freeze({
    createHistoryActions
  });
})();
