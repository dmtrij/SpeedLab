const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const runtimePaths = require("../runtime-paths");

const {
  computeMetricStats,
  extractMetrics,
  compareTests,
  selectRepresentativeRun,
  extractAssetPayloadFromReports
} = require("../stats");

test("computeMetricStats calculates medians and spread from numeric series", () => {
  const stats = computeMetricStats([
    { score: 91.11, fcp: 1000, lcp: 2400, si: 2000, tbt: 30, cls: 0.01, ttfb: 400 },
    { score: 88.89, fcp: 1200, lcp: 2600, si: 2200, tbt: 50, cls: 0.03, ttfb: 500 },
    { score: null, fcp: 1100, lcp: 2500, si: 2100, tbt: 40, cls: 0.02, ttfb: 450 }
  ]);

  assert.deepEqual(stats.score, {
    median: 90,
    min: 88.89,
    max: 91.11,
    spread: 2.22
  });
  assert.deepEqual(stats.cls, {
    median: 0.02,
    min: 0.01,
    max: 0.03,
    spread: 0.02
  });
});

test("extractMetrics reads Lighthouse metrics from either LHR shape", () => {
  const metrics = extractMetrics({
    lighthouseResult: {
      categories: {
        performance: {
          score: 0.93
        }
      },
      audits: {
        "first-contentful-paint": { numericValue: 1234.4 },
        "largest-contentful-paint": { numericValue: 2345.5 },
        "speed-index": { numericValue: 2001.1 },
        "total-blocking-time": { numericValue: 55.6 },
        "cumulative-layout-shift": { numericValue: 0.01991 },
        "server-response-time": { numericValue: 432.7 }
      }
    }
  });

  assert.deepEqual(metrics, {
    score: 93,
    fcp: 1234.4,
    lcp: 2345.5,
    si: 2001.1,
    tbt: 55.6,
    cls: 0.0199,
    ttfb: 432.7
  });
});

test("compareTests marks improved only when score rises without worse LCP", () => {
  assert.equal(
    compareTests(
      { score: 92, fcp: 1200, lcp: 2400, si: 2000, tbt: 30, cls: 0.01, ttfb: 400 },
      { score: 88, fcp: 1300, lcp: 2500, si: 2100, tbt: 50, cls: 0.02, ttfb: 500 }
    ).verdict,
    "Improved"
  );

  assert.equal(
    compareTests(
      { score: 85, fcp: 1200, lcp: 2900, si: 2000, tbt: 30, cls: 0.01, ttfb: 400 },
      { score: 90, fcp: 1100, lcp: 2500, si: 1900, tbt: 20, cls: 0.01, ttfb: 350 }
    ).verdict,
    "Worse"
  );

  assert.equal(compareTests({ score: 90 }, null).hasPrevious, false);
});

test("selectRepresentativeRun picks the closest score and then lowest run index", () => {
  const selected = selectRepresentativeRun([
    { run_index: 3, score: 90 },
    { run_index: 1, score: 92 },
    { run_index: 2, score: 88 }
  ], 89);

  assert.deepEqual(selected, { run_index: 2, score: 88 });

  const tied = selectRepresentativeRun([
    { runIndex: 5, score: 90 },
    { runIndex: 2, score: 90 }
  ], 90);

  assert.deepEqual(tied, { runIndex: 2, score: 90 });
});

test("extractAssetPayloadFromReports aggregates CSS and JS network payload", () => {
  runtimePaths.prepareRuntimePaths();
  const fixtureDir = path.join(runtimePaths.resultsDir, "stats-payload-fixture");
  const fixturePath = path.join(fixtureDir, "run-1.json");
  fs.mkdirSync(fixtureDir, { recursive: true });

  fs.writeFileSync(fixturePath, JSON.stringify({
    finalUrl: "https://site.test/",
    audits: {
      "network-requests": {
        details: {
          items: [
            {
              url: "https://site.test/wp-content/plugins/royal/assets/frontend.css?ver=1",
              transferSize: 10000,
              resourceSize: 40000,
              resourceType: "Stylesheet",
              mimeType: "text/css",
              priority: "VeryHigh",
              networkRequestTime: 10,
              networkEndTime: 30
            },
            {
              url: "https://site.test/wp-content/uploads/elementor/css/post-2.css?ver=1",
              transferSize: 5000,
              resourceSize: 9000,
              resourceType: "Stylesheet",
              mimeType: "text/css",
              priority: "High",
              networkRequestTime: 12,
              networkEndTime: 28
            },
            {
              url: "https://cdn.test/widget.js",
              transferSize: 7000,
              resourceSize: 20000,
              resourceType: "Script",
              mimeType: "application/javascript",
              priority: "Low",
              networkRequestTime: 20,
              networkEndTime: 45
            }
          ]
        }
      },
      "render-blocking-insight": {
        details: {
          items: [
            {
              url: "https://site.test/wp-content/plugins/royal/assets/frontend.css?ver=1",
              totalBytes: 10000,
              wastedMs: 1200
            }
          ]
        }
      },
      "unused-css-rules": {
        details: {
          items: [
            {
              url: "https://site.test/wp-content/plugins/royal/assets/frontend.css?ver=1",
              totalBytes: 40000,
              wastedBytes: 6000,
              wastedPercent: 60
            }
          ]
        }
      },
      "unused-javascript": {
        details: {
          items: [
            {
              url: "https://cdn.test/widget.js",
              totalBytes: 20000,
              wastedBytes: 3000,
              wastedPercent: 15
            }
          ]
        }
      }
    }
  }));

  try {
    const report = extractAssetPayloadFromReports(["/results/stats-payload-fixture/run-1.json"]);

    assert.equal(report.summary.reportCount, 1);
    assert.equal(report.summary.assetCount, 3);
    assert.equal(report.summary.css.count, 2);
    assert.equal(report.summary.css.transferBytes, 15000);
    assert.equal(report.summary.css.renderBlockingCount, 1);
    assert.equal(report.summary.js.count, 1);
    assert.equal(report.summary.js.thirdPartyBytes, 7000);
    assert.equal(report.summary.totalUnusedBytes, 9000);
    assert.equal(report.css[0].sourceType, "plugin");
    assert.equal(report.css[0].sourceName, "royal");
    assert.equal(report.css[0].renderBlockingReports, 1);
    assert.equal(report.js[0].sourceType, "third-party");
    assert.ok(report.groups.some((group) => group.sourceType === "elementor" && group.cssCount === 1));
  } finally {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
});
