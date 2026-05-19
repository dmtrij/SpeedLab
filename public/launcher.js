(function exposeSpeedLabLauncher() {
  function createLauncher({
    UI,
    navigate,
    normalizeRunCountValue,
    requestJson,
    runnerModeLabel
  } = {}) {
    if (!UI || typeof navigate !== "function" || typeof normalizeRunCountValue !== "function" || typeof requestJson !== "function") {
      throw new Error("SpeedLab launcher requires UI, navigate, normalizeRunCountValue, and requestJson.");
    }

    function bindRunnerFields(form) {
      const runnerSelect = form.querySelector("[name='runner']");
      const runsInput = form.querySelector("[name='runs']");
      const warmupInput = form.querySelector("[name='warmup']");
      const warmupLabel = form.querySelector("[data-warmup-label]");
      const psiKeyWrap = form.querySelector("[data-psi-key-wrap]");
      const runnerHelp = form.querySelector("[data-runner-help]");
      const runsHelp = form.querySelector("[data-runs-help]");

      function syncRunnerFields() {
        const previousMode = runnerSelect.dataset.currentMode || "local";
        const mode = runnerSelect.value || "local";
        const isPsi = mode !== "local";
        const isPsiSingle = mode === "psi";

        if (previousMode !== "psi") {
          runsInput.dataset.multiValue = String(normalizeRunCountValue(runsInput.value, 5));
        }
        if (previousMode === "local") {
          warmupInput.dataset.localValue = String(warmupInput.checked);
        }

        runsInput.disabled = isPsiSingle;
        if (isPsiSingle) {
          runsInput.value = "1";
        } else {
          runsInput.value = String(normalizeRunCountValue(runsInput.dataset.multiValue, 5));
        }

        warmupInput.disabled = isPsi;

        if (isPsi) {
          warmupInput.checked = false;
          warmupLabel.hidden = true;
          warmupLabel.classList.add("is-disabled");
          psiKeyWrap.hidden = false;
          runnerHelp.textContent = "\u0412 PSI \u043d\u0435\u0442 \u0443\u043f\u0440\u0430\u0432\u043b\u044f\u0435\u043c\u043e\u0433\u043e \u043f\u0440\u043e\u0433\u0440\u0435\u0432\u0430: \u0442\u0435\u0441\u0442 \u0441\u0447\u0438\u0442\u0430\u0435\u0442 Google. \u041f\u0440\u043e\u0433\u0440\u0435\u0432 \u0434\u043e\u0441\u0442\u0443\u043f\u0435\u043d \u0442\u043e\u043b\u044c\u043a\u043e \u0432 \u043b\u043e\u043a\u0430\u043b\u044c\u043d\u043e\u043c Lighthouse.";
          runsHelp.textContent = isPsiSingle
            ? "\u0420\u0435\u0436\u0438\u043c \u0434\u043b\u044f \u0441\u0432\u0435\u0440\u043a\u0438 \u0441 PageSpeed: \u0432 \u0437\u0430\u043f\u0443\u0441\u043a \u0443\u0439\u0434\u0435\u0442 1 \u043f\u0440\u043e\u0433\u043e\u043d."
            : "\u0420\u0435\u0436\u0438\u043c \u0441\u0435\u0440\u0438\u0438 PSI \u043f\u043e\u0432\u0442\u043e\u0440\u044f\u0435\u0442 \u043e\u0434\u0438\u043d \u0438 \u0442\u043e\u0442 \u0436\u0435 URL \u0431\u0435\u0437 \u0441\u043b\u0443\u0436\u0435\u0431\u043d\u044b\u0445 query-\u043f\u0430\u0440\u0430\u043c\u0435\u0442\u0440\u043e\u0432. Google \u043c\u043e\u0436\u0435\u0442 \u0432\u0435\u0440\u043d\u0443\u0442\u044c \u0438\u0434\u0435\u043d\u0442\u0438\u0447\u043d\u044b\u0439 \u0441\u043d\u0438\u043c\u043e\u043a, \u0438 SpeedLab \u043f\u043e\u043a\u0430\u0436\u0435\u0442 \u0447\u0438\u0441\u043b\u043e \u0443\u043d\u0438\u043a\u0430\u043b\u044c\u043d\u044b\u0445 \u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442\u043e\u0432.";
        } else {
          warmupInput.checked = warmupInput.dataset.localValue !== "false";
          warmupLabel.hidden = false;
          warmupLabel.classList.remove("is-disabled");
          psiKeyWrap.hidden = true;
          runnerHelp.textContent = "\u041b\u043e\u043a\u0430\u043b\u044c\u043d\u044b\u0439 Lighthouse \u0437\u0430\u043f\u0443\u0441\u043a\u0430\u0435\u0442 Chrome \u043d\u0430 \u044d\u0442\u043e\u043c \u043a\u043e\u043c\u043f\u044c\u044e\u0442\u0435\u0440\u0435. \u0417\u0434\u0435\u0441\u044c \u043f\u0440\u043e\u0433\u0440\u0435\u0432 \u0438\u043c\u0435\u0435\u0442 \u0441\u043c\u044b\u0441\u043b: \u043f\u0435\u0440\u0432\u044b\u0439 \u043f\u0440\u043e\u0433\u043e\u043d \u0438\u0441\u043a\u043b\u044e\u0447\u0430\u0435\u0442\u0441\u044f \u0438\u0437 \u0441\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043a\u0438.";
          runsHelp.textContent = "\u0414\u043b\u044f \u043b\u043e\u043a\u0430\u043b\u044c\u043d\u043e\u0439 \u043c\u0435\u0434\u0438\u0430\u043d\u044b \u0441\u0442\u0430\u0432\u044c 5-10 \u043f\u0440\u043e\u0433\u043e\u043d\u043e\u0432.";
        }

        runnerSelect.dataset.currentMode = mode;
      }

      runnerSelect.addEventListener("change", syncRunnerFields);
      syncRunnerFields();
    }

    function applyPreset(form, preset) {
      const runner = form.querySelector("[name='runner']");
      const runs = form.querySelector("[name='runs']");
      const warmup = form.querySelector("[name='warmup']");

      if (preset === "psi") {
        runner.value = "psi";
      } else if (preset === "psi-series" || preset === "psi-fresh") {
        runner.value = "psi-series";
        runs.value = "5";
        runs.dataset.multiValue = "5";
      } else {
        runner.value = "local";
        runs.value = "7";
        runs.dataset.multiValue = "7";
        warmup.dataset.localValue = "true";
        warmup.checked = true;
      }

      runner.dispatchEvent(new Event("change"));
    }

    function applyRepeatPayload(form) {
      const raw = sessionStorage.getItem("speedlab-repeat");
      if (!raw) {
        return;
      }
      sessionStorage.removeItem("speedlab-repeat");

      try {
        const payload = JSON.parse(raw);
        const repeatNote = form.querySelector("[data-repeat-note]");
        const runnerField = form.querySelector("[name='runner']");
        const runsField = form.querySelector("[name='runs']");
        const warmupField = form.querySelector("[name='warmup']");
        const runnerMode = payload.runner === "psi" && payload.runs > 1 ? "psi-series" : (payload.runner || "local");
        const restoredWarmup = Boolean(payload.warmup);
        const restoredRuns = normalizeRunCountValue(payload.runs, 5);
        form.querySelector("[name='url']").value = payload.url || "";
        runsField.value = String(restoredRuns);
        runsField.dataset.multiValue = String(restoredRuns);
        form.querySelector("[name='device']").value = payload.device || "mobile";
        warmupField.dataset.localValue = String(restoredWarmup);
        runnerField.value = runnerMode;
        form.querySelector("[name='note']").value = payload.note || "";
        runnerField.dispatchEvent(new Event("change"));
        warmupField.checked = runnerMode === "local" ? restoredWarmup : false;
        warmupField.dataset.localValue = String(restoredWarmup);
        if (repeatNote) {
          const warmupText = payload.runner === "local"
            ? (payload.warmup ? ", \u043f\u0440\u043e\u0433\u0440\u0435\u0432 \u0432\u043a\u043b\u044e\u0447\u0435\u043d" : ", \u043f\u0440\u043e\u0433\u0440\u0435\u0432 \u0432\u044b\u043a\u043b\u044e\u0447\u0435\u043d")
            : "";
          repeatNote.hidden = false;
          repeatNote.textContent = `\u041f\u043e\u0432\u0442\u043e\u0440 \u0442\u0435\u0441\u0442\u0430${payload.sourceTestId ? ` #${payload.sourceTestId}` : ""}: \u043f\u043e\u0434\u0441\u0442\u0430\u0432\u043b\u0435\u043d\u043e ${restoredRuns} \u043f\u0440\u043e\u0433\u043e\u043d\u043e\u0432${warmupText}.`;
        }
      } catch {
      }
    }

    function bindLaunchForm(form) {
      const errorBox = form.querySelector("#form-error");
      bindRunnerFields(form);
      applyRepeatPayload(form);
      window.SpeedLabCustomSelect.enhanceNativeSelects(form);

      form.querySelectorAll("[data-preset]").forEach((button) => {
        button.addEventListener("click", () => applyPreset(form, button.getAttribute("data-preset")));
      });

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        errorBox.hidden = true;
        const formData = new FormData(form);
        const runnerMode = String(formData.get("runner") || "local");
        const requestedRuns = runnerMode === "psi"
          ? 1
          : normalizeRunCountValue(form.querySelector("[name='runs']").value, 5);
        const payload = {
          url: String(formData.get("url") || "").trim(),
          runs: requestedRuns,
          device: String(formData.get("device") || "mobile"),
          runner: runnerMode === "local" ? "local" : "psi",
          warmup: formData.get("warmup") === "on",
          note: String(formData.get("note") || "").trim() || runnerModeLabel(runnerMode),
          psiApiKey: String(formData.get("psiApiKey") || "").trim()
        };
        const submitButton = form.querySelector("button[type='submit']");
        submitButton.disabled = true;
        submitButton.textContent = UI.starting;

        try {
          const response = await requestJson("/api/tests", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          navigate(`/test/${response.testId}`);
        } catch (error) {
          errorBox.hidden = false;
          errorBox.textContent = error.message;
          submitButton.disabled = false;
          submitButton.textContent = UI.start;
        }
      });
    }

    return Object.freeze({
      bindLaunchForm
    });
  }

  window.SpeedLabLauncher = Object.freeze({
    createLauncher
  });
})();
