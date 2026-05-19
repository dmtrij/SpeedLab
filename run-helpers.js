const { metricsFromTest } = require("./stats");

function runnerLabel(runner) {
  return runner === "psi" ? "PSI API Google" : "Локальный Lighthouse";
}

function normalizeRunnerMode(value) {
  const requestedRunner = typeof value === "string" ? value.trim() : "local";

  if (!requestedRunner) {
    return "local";
  }

  if (requestedRunner === "psi-fresh" || requestedRunner === "psi-series") {
    return "psi";
  }

  return requestedRunner;
}

function isTerminalStatus(status) {
  return ["completed", "failed", "cancelled"].includes(String(status || "").toLowerCase());
}

function cloneTestConfig(test) {
  return {
    url: test.url,
    device: test.device,
    runner: test.runner || "local",
    runs: test.runs_requested,
    warmup: Boolean(test.warmup),
    note: test.note || ""
  };
}

function validateTestPayload(payload) {
  const errors = [];
  const url = typeof payload?.url === "string" ? payload.url.trim() : "";
  const runs = Number(payload?.runs);
  const device = typeof payload?.device === "string" ? payload.device.trim() : "";
  const runner = normalizeRunnerMode(payload?.runner);
  const note = typeof payload?.note === "string" ? payload.note.trim() : "";
  const psiApiKey = typeof payload?.psiApiKey === "string" ? payload.psiApiKey.trim() : "";

  if (!url || !/^https?:\/\//i.test(url)) {
    errors.push("URL должен начинаться с http:// или https://");
  } else {
    try {
      new URL(url);
    } catch {
      errors.push("URL указан некорректно");
    }
  }

  if (!Number.isInteger(runs) || runs < 1 || runs > 20) {
    errors.push("Количество прогонов должно быть целым числом от 1 до 20");
  }

  if (!["mobile", "desktop"].includes(device)) {
    errors.push("Устройство должно быть mobile или desktop");
  }

  if (!["local", "psi"].includes(runner)) {
    errors.push("Источник запуска должен быть local или psi");
  }

  return {
    errors,
    value: {
      url,
      runs,
      device,
      runner,
      warmup: runner === "local" && payload?.warmup !== false,
      note,
      psiApiKey
    }
  };
}

function serializeTest(test, fallbackStats = {}) {
  const metrics = metricsFromTest(test, fallbackStats);
  return {
    id: test.id,
    url: test.url,
    device: test.device,
    runner: test.runner || "local",
    runnerLabel: runnerLabel(test.runner || "local"),
    runsRequested: test.runs_requested,
    runsCompleted: test.runs_completed,
    warmup: Boolean(test.warmup),
    note: test.note || "",
    status: test.status,
    progressCurrent: test.progress_current,
    progressTotal: test.progress_total,
    log: test.log || "",
    errorMessage: test.error_message || "",
    pinned: Boolean(test.pinned),
    createdAt: test.created_at,
    completedAt: test.completed_at,
    medianScore: metrics.score,
    medianFcp: metrics.fcp,
    medianLcp: metrics.lcp,
    medianSi: metrics.si,
    medianTbt: metrics.tbt,
    medianCls: metrics.cls,
    medianTtfb: metrics.ttfb
  };
}

function serializeRuns(runs) {
  return runs.map((run) => ({
    id: run.id,
    runIndex: run.run_index,
    score: run.score,
    fcp: run.fcp,
    lcp: run.lcp,
    si: run.si,
    tbt: run.tbt,
    cls: run.cls,
    ttfb: run.ttfb,
    jsonPath: run.json_path,
    createdAt: run.created_at
  }));
}

function normalizeRunsForStats(savedRuns) {
  return savedRuns.map((run) => ({
    run_index: run.runIndex,
    score: run.score,
    fcp: run.fcp,
    lcp: run.lcp,
    si: run.si,
    tbt: run.tbt,
    cls: run.cls,
    ttfb: run.ttfb
  }));
}

function resolvePsiApiKey(runtimeOptions, env = process.env) {
  return runtimeOptions.psiApiKey || env.PSI_API_KEY || "";
}

module.exports = {
  runnerLabel,
  normalizeRunnerMode,
  isTerminalStatus,
  cloneTestConfig,
  validateTestPayload,
  serializeTest,
  serializeRuns,
  normalizeRunsForStats,
  resolvePsiApiKey
};
