const test = require("node:test");
const assert = require("node:assert/strict");

const {
  runnerLabel,
  normalizeRunnerMode,
  isTerminalStatus,
  cloneTestConfig,
  validateTestPayload,
  serializeTest,
  serializeRuns,
  normalizeRunsForStats,
  resolvePsiApiKey
} = require("../run-helpers");

test("runnerLabel and isTerminalStatus normalize runner and status values", () => {
  assert.equal(runnerLabel("psi"), "PSI API Google");
  assert.match(runnerLabel("local"), /Lighthouse/);
  assert.equal(isTerminalStatus("completed"), true);
  assert.equal(isTerminalStatus("CANCELLED"), true);
  assert.equal(isTerminalStatus("pending"), false);
});

test("normalizeRunnerMode supports current and legacy PSI aliases", () => {
  assert.equal(normalizeRunnerMode("psi-series"), "psi");
  assert.equal(normalizeRunnerMode("psi-fresh"), "psi");
  assert.equal(normalizeRunnerMode("psi"), "psi");
  assert.equal(normalizeRunnerMode(""), "local");
});

test("cloneTestConfig prepares a retry-safe payload", () => {
  assert.deepEqual(
    cloneTestConfig({
      url: "https://example.com",
      device: "desktop",
      runner: "psi",
      runs_requested: 5,
      warmup: 0,
      note: null
    }),
    {
      url: "https://example.com",
      device: "desktop",
      runner: "psi",
      runs: 5,
      warmup: false,
      note: ""
    }
  );
});

test("validateTestPayload trims inputs and normalizes psi-series to psi", () => {
  const { errors, value } = validateTestPayload({
    url: " https://example.com ",
    runs: "3",
    device: "mobile",
    runner: "psi-series",
    note: "  hello ",
    psiApiKey: " key ",
    warmup: false
  });

  assert.deepEqual(errors, []);
  assert.deepEqual(value, {
    url: "https://example.com",
    runs: 3,
    device: "mobile",
    runner: "psi",
    warmup: false,
    note: "hello",
    psiApiKey: "key"
  });
});

test("validateTestPayload returns validation errors for invalid input", () => {
  const { errors } = validateTestPayload({
    url: "ftp://example.com",
    runs: 0,
    device: "tablet",
    runner: "remote"
  });

  assert.equal(errors.length, 4);
});

test("serializeTest uses fallback metric stats when medians are absent", () => {
  const serialized = serializeTest({
    id: 7,
    url: "https://example.com",
    device: "desktop",
    runner: "local",
    runs_requested: 3,
    runs_completed: 2,
    warmup: 1,
    note: "",
    status: "pending",
    progress_current: 2,
    progress_total: 4,
    log: "",
    error_message: "",
    pinned: 0,
    created_at: "2026-05-17T10:00:00.000Z",
    completed_at: null,
    median_score: null,
    median_fcp: null,
    median_lcp: null,
    median_si: null,
    median_tbt: null,
    median_cls: null,
    median_ttfb: null
  }, {
    score: { median: 88.5 },
    fcp: { median: 1234 },
    lcp: { median: 2345 },
    si: { median: 2100 },
    tbt: { median: 99 },
    cls: { median: 0.0123 },
    ttfb: { median: 456 }
  });

  assert.equal(serialized.medianScore, 88.5);
  assert.equal(serialized.medianFcp, 1234);
  assert.equal(serialized.runner, "local");
  assert.equal(serialized.warmup, true);
});

test("serializeRuns and normalizeRunsForStats map run shapes explicitly", () => {
  const storedRuns = [{
    id: 3,
    run_index: 2,
    score: 91,
    fcp: 1000,
    lcp: 2100,
    si: 1900,
    tbt: 40,
    cls: 0.01,
    ttfb: 350,
    json_path: "/results/test-1/run-2.json",
    created_at: "2026-05-17T10:00:00.000Z"
  }];

  assert.deepEqual(serializeRuns(storedRuns), [{
    id: 3,
    runIndex: 2,
    score: 91,
    fcp: 1000,
    lcp: 2100,
    si: 1900,
    tbt: 40,
    cls: 0.01,
    ttfb: 350,
    jsonPath: "/results/test-1/run-2.json",
    createdAt: "2026-05-17T10:00:00.000Z"
  }]);

  assert.deepEqual(normalizeRunsForStats([{
    runIndex: 1,
    score: 92,
    fcp: 1100,
    lcp: 2200,
    si: 2000,
    tbt: 55,
    cls: 0.02,
    ttfb: 360
  }]), [{
    run_index: 1,
    score: 92,
    fcp: 1100,
    lcp: 2200,
    si: 2000,
    tbt: 55,
    cls: 0.02,
    ttfb: 360
  }]);
});

test("resolvePsiApiKey prefers runtime value over environment fallback", () => {
  assert.equal(resolvePsiApiKey({ psiApiKey: "runtime" }, { PSI_API_KEY: "env" }), "runtime");
  assert.equal(resolvePsiApiKey({}, { PSI_API_KEY: "env" }), "env");
  assert.equal(resolvePsiApiKey({}, {}), "");
});
