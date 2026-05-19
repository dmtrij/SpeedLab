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

    const exportResponse = await fetch(`${baseUrl}/api/tests/${completedTestId}/export.md`);
    const markdown = await exportResponse.text();
    assert.equal(exportResponse.status, 200);
    assert.match(exportResponse.headers.get("content-type"), /text\/markdown/);
    assert.match(markdown, /SpeedLab/);
    assert.match(markdown, /https:\/\/example\.com\/report/);
    assert.match(markdown, /Optimization plan/);

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
