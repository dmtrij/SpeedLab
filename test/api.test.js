const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");

process.env.SPEEDLAB_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "speedlab-api-"));
process.env.SPEEDLAB_DISABLE_WORKER = "1";
process.env.HOST = "127.0.0.1";
process.env.PORT = "0";

const db = require("../db");
const runtimePaths = require("../runtime-paths");
const { createApp } = require("../server");

async function requestJson(baseUrl, route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  return { response, body };
}

test("API supports create, pin, retry, cancel, delete, list, and markdown export", async () => {
  const app = createApp();
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    let result = await requestJson(baseUrl, "/api/tests");
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.body, { tests: [] });

    result = await requestJson(baseUrl, "/api/tests", {
      method: "POST",
      body: JSON.stringify({
        url: "ftp://example.com",
        runs: 1,
        device: "mobile",
        runner: "psi"
      })
    });
    assert.equal(result.response.status, 400);

    result = await requestJson(baseUrl, "/api/tests", {
      method: "POST",
      body: JSON.stringify({
        url: "https://example.com",
        runs: 2,
        device: "mobile",
        runner: "psi-series",
        note: "api integration"
      })
    });
    assert.equal(result.response.status, 201);
    assert.equal(result.body.status, "queued");
    assert.equal(result.body.queuePosition, 1);
    const testId = result.body.testId;

    result = await requestJson(baseUrl, `/api/tests/${testId}`);
    assert.equal(result.response.status, 200);
    assert.equal(result.body.test.id, testId);
    assert.equal(result.body.test.runner, "psi");
    assert.equal(result.body.test.status, "pending");
    assert.equal(result.body.queue.position, 1);
    assert.deepEqual(result.body.optimizationReport, {
      summary: {
        reportCount: 0,
        workItemCount: 0,
        topCategory: null,
        totalBlockingMs: 0,
        totalWastedKb: 0,
        totalTransferKb: 0
      },
      workItems: []
    });

    result = await requestJson(baseUrl, `/api/tests/${testId}`, {
      method: "PATCH",
      body: JSON.stringify({ pinned: true })
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.test.pinned, true);

    result = await requestJson(baseUrl, `/api/tests/${testId}/retry`, {
      method: "POST",
      body: "{}"
    });
    assert.equal(result.response.status, 201);
    assert.equal(result.body.status, "queued");
    assert.equal(result.body.queuePosition, 2);
    const retryTestId = result.body.testId;

    result = await requestJson(baseUrl, `/api/tests/${testId}/cancel`, {
      method: "POST",
      body: "{}"
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.status, "cancelled");

    result = await requestJson(baseUrl, `/api/tests/${testId}`, {
      method: "DELETE"
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.ok, true);

    result = await requestJson(baseUrl, `/api/tests/${retryTestId}/cancel`, {
      method: "POST",
      body: "{}"
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.status, "cancelled");

    const completedTestId = db.createTest({
      url: "https://example.com/report",
      runs: 1,
      device: "desktop",
      runner: "local",
      warmup: false,
      note: "completed fixture"
    });
    db.completeTest(completedTestId, {
      score: 95,
      fcp: 1000,
      lcp: 1800,
      si: 1700,
      tbt: 20,
      cls: 0.01,
      ttfb: 300
    });
    const reportDir = path.join(runtimePaths.resultsDir, `test-${completedTestId}`);
    const reportPath = path.join(reportDir, "run-1.json");
    fs.mkdirSync(reportDir, { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify({
      finalUrl: "https://example.com/report",
      audits: {
        "network-requests": {
          details: {
            items: [
              {
                url: "https://example.com/wp-content/plugins/demo/frontend.css?ver=1",
                transferSize: 24000,
                resourceSize: 72000,
                resourceType: "Stylesheet",
                mimeType: "text/css",
                priority: "VeryHigh",
                networkRequestTime: 20,
                networkEndTime: 140
              },
              {
                url: "https://example.com/wp-content/plugins/demo/frontend.js?ver=1",
                transferSize: 36000,
                resourceSize: 120000,
                resourceType: "Script",
                mimeType: "application/javascript",
                priority: "High",
                networkRequestTime: 30,
                networkEndTime: 180
              }
            ]
          }
        },
        "render-blocking-insight": {
          score: 0,
          details: {
            items: [
              {
                url: "https://example.com/wp-content/plugins/demo/frontend.css?ver=1",
                totalBytes: 24000,
                wastedMs: 900
              }
            ]
          }
        },
        "unused-javascript": {
          score: 0,
          details: {
            items: [
              {
                url: "https://example.com/wp-content/plugins/demo/frontend.js?ver=1",
                totalBytes: 120000,
                wastedBytes: 60000,
                wastedPercent: 50
              }
            ]
          }
        }
      }
    }), "utf8");
    db.insertRun({
      testId: completedTestId,
      runIndex: 1,
      score: 95,
      fcp: 1000,
      lcp: 1800,
      si: 1700,
      tbt: 20,
      cls: 0.01,
      ttfb: 300,
      jsonPath: `/results/test-${completedTestId}/run-1.json`
    });

    result = await requestJson(baseUrl, `/api/tests/${completedTestId}`);
    assert.equal(result.response.status, 200);
    assert.equal(result.body.comparisonQuality.label, "Нет базы");
    assert.equal(result.body.runQuality.totalRuns, 1);
    assert.equal(result.body.runQuality.uniqueRuns, 1);
    assert.equal(result.body.runQuality.reliabilityScore, 35);
    assert.equal(result.body.assetPayloadReport.summary.assetCount, 2);
    assert.equal(result.body.assetPayloadReport.summary.css.count, 1);
    assert.equal(result.body.assetPayloadReport.summary.js.count, 1);
    assert.equal(result.body.assetPayloadReport.summary.renderBlockingCount, 1);
    assert.ok(result.body.assetPayloadReport.actions.some((action) =>
      action.resources?.some((resource) => resource.url.includes("frontend.css"))
    ));
    assert.ok(result.body.assetPayloadReport.actions.some((action) =>
      action.resources?.some((resource) => resource.url.includes("frontend.js"))
    ));

    const exportResponse = await fetch(`${baseUrl}/api/tests/${completedTestId}/export.md`);
    const markdown = await exportResponse.text();
    assert.equal(exportResponse.status, 200);
    assert.match(exportResponse.headers.get("content-type"), /text\/markdown/);
    assert.match(markdown, /SpeedLab/);
    assert.match(markdown, /https:\/\/example\.com\/report/);
    assert.match(markdown, /Качество серии/);
    assert.match(markdown, /Надежность серии:/);
    assert.match(markdown, /Приоритетные задачи оптимизации/);
    assert.match(markdown, /Риск:/);
    assert.match(markdown, /frontend\.css/);
    assert.match(markdown, /План оптимизации/);

    const assetsJsonResponse = await fetch(`${baseUrl}/api/tests/${completedTestId}/assets.json`);
    const assetsJson = await assetsJsonResponse.json();
    assert.equal(assetsJsonResponse.status, 200);
    assert.equal(assetsJson.test.id, completedTestId);
    assert.ok(assetsJson.assets.some((asset) => asset.url.includes("frontend.css")));
    assert.ok(assetsJson.assets.every((asset) => asset.recommendation?.risk?.label));

    const assetsCsvResponse = await fetch(`${baseUrl}/api/tests/${completedTestId}/assets.csv`);
    const assetsCsv = await assetsCsvResponse.text();
    assert.equal(assetsCsvResponse.status, 200);
    assert.match(assetsCsv, /type,file,url,source_type/);
    assert.match(assetsCsv, /frontend\.css/);
    assert.match(assetsCsv, /risk_detail/);

    result = await requestJson(baseUrl, "/api/tests", {
      method: "DELETE"
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.ok, true);

    result = await requestJson(baseUrl, "/api/tests");
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.body, { tests: [] });
    assert.ok(fs.existsSync(runtimePaths.resultsDir));
  } finally {
    server.closeAllConnections?.();
    server.close();
    await once(server, "close");
    db.closeDatabase();
    fs.rmSync(process.env.SPEEDLAB_DATA_DIR, { recursive: true, force: true });
  }
});
