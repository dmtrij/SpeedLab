const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

process.env.SPEEDLAB_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "speedlab-psi-"));

const runtimePaths = require("../runtime-paths");
const {
  buildCacheBustedTestUrl,
  buildPsiUrl,
  metricSignature,
  runPsiSequence
} = require("../psi-runner");

function createPsiPayload({ score, fcp, lcp }) {
  return {
    lighthouseResult: {
      categories: {
        performance: {
          score: score / 100
        }
      },
      audits: {
        "first-contentful-paint": { numericValue: fcp },
        "largest-contentful-paint": { numericValue: lcp },
        "speed-index": { numericValue: fcp + 500 },
        "total-blocking-time": { numericValue: 0 },
        "cumulative-layout-shift": { numericValue: 0.026 },
        "server-response-time": { numericValue: 100 }
      }
    }
  };
}

function createController() {
  return {
    cancelled: false,
    onCancel() {
      return () => {};
    }
  };
}

test("buildCacheBustedTestUrl preserves URL and adds run marker", () => {
  const busted = buildCacheBustedTestUrl("https://example.com/page?a=1", 3);
  const parsed = new URL(busted);

  assert.equal(parsed.origin, "https://example.com");
  assert.equal(parsed.pathname, "/page");
  assert.equal(parsed.searchParams.get("a"), "1");
  assert.match(parsed.searchParams.get("speedlab_psi_run"), /-3-/);
});

test("metricSignature treats identical PSI metrics as duplicates", () => {
  assert.equal(
    metricSignature({ score: 90, fcp: 1000, lcp: 2000, si: 1500, tbt: 0, cls: 0.01, ttfb: 100 }),
    metricSignature({ score: 90, fcp: 1000, lcp: 2000, si: 1500, tbt: 0, cls: 0.01, ttfb: 100 })
  );
  assert.notEqual(
    metricSignature({ score: 90, fcp: 1000, lcp: 2000, si: 1500, tbt: 0, cls: 0.01, ttfb: 100 }),
    metricSignature({ score: 91, fcp: 1000, lcp: 2000, si: 1500, tbt: 0, cls: 0.01, ttfb: 100 })
  );
});

test("runPsiSequence retries duplicated PSI snapshots with cache-busting URL", async () => {
  runtimePaths.prepareRuntimePaths();
  const originalFetch = global.fetch;
  const calls = [];
  const logs = [];
  const completedRuns = [];
  const payloads = [
    createPsiPayload({ score: 90, fcp: 2560, lcp: 3010 }),
    createPsiPayload({ score: 90, fcp: 2560, lcp: 3010 }),
    createPsiPayload({ score: 88, fcp: 2700, lcp: 3200 })
  ];

  global.fetch = async (requestUrl) => {
    calls.push(String(requestUrl));
    const payload = payloads.shift();

    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(payload)
    };
  };

  try {
    const runs = await runPsiSequence({
      testId: 1001,
      url: "https://example.com/",
      device: "mobile",
      runs: 2,
      apiKey: "",
      testController: createController(),
      onLog: (message) => logs.push(message),
      onRunComplete: (run) => completedRuns.push(run)
    });

    assert.equal(calls.length, 3);
    assert.equal(new URL(calls[0]).searchParams.get("url"), "https://example.com/");
    assert.equal(new URL(calls[1]).searchParams.get("url"), "https://example.com/");

    const retryTestUrl = new URL(new URL(calls[2]).searchParams.get("url"));
    assert.equal(retryTestUrl.origin, "https://example.com");
    assert.match(retryTestUrl.searchParams.get("speedlab_psi_run"), /-2-/);

    assert.equal(runs.length, 2);
    assert.equal(completedRuns.length, 2);
    assert.equal(runs[0].score, 90);
    assert.equal(runs[1].score, 88);
    assert.ok(logs.some((message) => message.includes("duplicated run #1")));
    assert.ok(fs.existsSync(path.join(runtimePaths.resultsDir, "test-1001", "run-2.json")));
  } finally {
    global.fetch = originalFetch;
    fs.rmSync(process.env.SPEEDLAB_DATA_DIR, { recursive: true, force: true });
  }
});

test("buildPsiUrl keeps API key separate from tested URL", () => {
  const psiUrl = buildPsiUrl("https://example.com/?a=1", "mobile", "secret");
  const parsed = new URL(psiUrl);

  assert.equal(parsed.searchParams.get("url"), "https://example.com/?a=1");
  assert.equal(parsed.searchParams.get("strategy"), "mobile");
  assert.equal(parsed.searchParams.get("key"), "secret");
});
