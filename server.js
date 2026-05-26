const fs = require("fs");
const path = require("path");
const express = require("express");

const db = require("./db");
const envUtils = require("./env");
const runtimePaths = require("./runtime-paths");
const { runLighthouseSequence } = require("./lighthouse-runner");
const { runPsiSequence } = require("./psi-runner");
const controllerUtils = require("./cancellation");
const testDomain = require("./run-helpers");
const { computeMetricStats, metricsFromTest } = require("./stats");
const {
  buildTestResponse,
  buildMarkdownReport,
  buildAssetJsonExport,
  buildAssetCsvExport
} = require("./report-service");

runtimePaths.prepareRuntimePaths();
envUtils.loadLocalEnvFile(runtimePaths.envFilePath);

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const WORKER_DISABLED = process.env.SPEEDLAB_DISABLE_WORKER === "1";
const testSecrets = new Map();
const testControllers = new Map();

let activeTestId = null;

db.initializeDatabase();

function scheduleNextTest() {
  if (WORKER_DISABLED) {
    return null;
  }

  if (activeTestId != null) {
    return null;
  }

  const nextTest = db.getNextPendingTest();
  if (!nextTest) {
    return null;
  }

  activeTestId = nextTest.id;
  testControllers.set(nextTest.id, controllerUtils.createTestController(nextTest.id));
  void executeTest(nextTest.id);
  return nextTest.id;
}

async function clearResultsDirectory() {
  if (!fs.existsSync(runtimePaths.resultsDir)) {
    return;
  }

  const entries = await fs.promises.readdir(runtimePaths.resultsDir, { withFileTypes: true });
  await Promise.all(entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("test-"))
    .map((entry) => fs.promises.rm(path.join(runtimePaths.resultsDir, entry.name), {
      recursive: true,
      force: true
    })));
}

async function clearTestResultsDirectory(testId) {
  await fs.promises.rm(runtimePaths.resolveTestResultsDir(testId), {
    recursive: true,
    force: true
  });
}

async function executeTest(testId) {
  const test = db.getTestById(testId);
  if (!test) {
    if (activeTestId === testId) {
      activeTestId = null;
    }
    testSecrets.delete(testId);
    testControllers.delete(testId);
    scheduleNextTest();
    return;
  }

  const runtimeOptions = testSecrets.get(testId) || {};
  const testController = testControllers.get(testId) || controllerUtils.createTestController(testId);
  testControllers.set(testId, testController);

  testController.throwIfCancelled();
  db.appendLog(
    testId,
    `Тест поставлен в очередь: ${testDomain.runnerLabel(test.runner || "local")} для ${test.url} на профиле ${test.device}.`
  );

  try {
    const sequenceOptions = {
      testId,
      url: test.url,
      device: test.device,
      runs: test.runs_requested,
      testController,
      onLog: (message) => db.appendLog(testId, message),
      onMainRunStart: ({ runIndex }) => {
        db.updateTest(testId, {
          status: `run ${runIndex} of ${test.runs_requested}`
        });
      },
      onRunComplete: (runResult) => {
        db.insertRun({
          testId,
          runIndex: runResult.runIndex,
          score: runResult.score,
          fcp: runResult.fcp,
          lcp: runResult.lcp,
          si: runResult.si,
          tbt: runResult.tbt,
          cls: runResult.cls,
          ttfb: runResult.ttfb,
          jsonPath: runResult.jsonPath
        });

        db.updateTest(testId, {
          progress_current: runResult.runIndex + (test.warmup ? 1 : 0),
          runs_completed: runResult.runIndex
        });
      }
    };

    let savedRuns = [];

    if ((test.runner || "local") === "psi") {
      const previousCompletedTest = db.getPreviousCompletedTest(
        test.url,
        test.device,
        test.runner || "local",
        test.id
      );

      savedRuns = await runPsiSequence({
        ...sequenceOptions,
        apiKey: testDomain.resolvePsiApiKey(runtimeOptions),
        previousMetrics: previousCompletedTest ? metricsFromTest(previousCompletedTest) : null,
        onDecoyStart: () => {
          db.updateTest(testId, {
            status: "tuning"
          });
        },
        onDecoyComplete: ({ runIndex }) => {
          db.updateTest(testId, {
            status: `run ${runIndex} of ${test.runs_requested}`
          });
        }
      });
    } else {
      savedRuns = await runLighthouseSequence({
        ...sequenceOptions,
        warmup: Boolean(test.warmup),
        onWarmupStart: () => {
          db.updateTest(testId, {
            status: "warming up"
          });
        },
        onWarmupComplete: () => {
          db.updateTest(testId, {
            progress_current: 1
          });
        }
      });
    }

    const metricStats = computeMetricStats(testDomain.normalizeRunsForStats(savedRuns));

    testController.throwIfCancelled();
    db.completeTest(testId, {
      score: metricStats.score.median,
      fcp: metricStats.fcp.median,
      lcp: metricStats.lcp.median,
      si: metricStats.si.median,
      tbt: metricStats.tbt.median,
      cls: metricStats.cls.median,
      ttfb: metricStats.ttfb.median
    });
    db.appendLog(testId, `Серия ${testDomain.runnerLabel(test.runner || "local")} завершена.`);
  } catch (error) {
    if (testController.cancelled || controllerUtils.isCancelledError(error)) {
      const cancelledMessage = error instanceof Error ? error.message : "Test cancelled";
      db.cancelTest(testId, cancelledMessage);
      db.appendLog(testId, `Тест отменен: ${cancelledMessage}`);
      return;
    }

    const message = error instanceof Error
      ? error.message
      : "Неизвестная ошибка выполнения теста";
    db.failTest(testId, message);
    db.appendLog(testId, `Выполнение завершилось ошибкой: ${message}`);
  } finally {
    activeTestId = null;
    testSecrets.delete(testId);
    testControllers.delete(testId);
    scheduleNextTest();
  }
}

function createApp() {
  const app = express();

  app.use(express.json({ limit: "1mb" }));

  app.get("/", (_req, res) => {
    res.sendFile(path.join(runtimePaths.publicDir, "index.html"));
  });

  app.get("/history", (_req, res) => {
    res.sendFile(path.join(runtimePaths.publicDir, "index.html"));
  });

  app.get("/test/:id", (_req, res) => {
    res.sendFile(path.join(runtimePaths.publicDir, "index.html"));
  });

  app.use("/results", express.static(runtimePaths.resultsDir));
  app.use(express.static(runtimePaths.publicDir, {
    etag: false,
    maxAge: 0,
    setHeaders: (res) => {
      res.setHeader("Cache-Control", "no-store, max-age=0");
      res.setHeader("Pragma", "no-cache");
    }
  }));

  app.post("/api/tests", (req, res) => {
    const { errors, value } = testDomain.validateTestPayload(req.body);
    if (errors.length) {
      return res.status(400).json({ error: errors.join(". ") });
    }

    const testId = db.createTest(value);
    if (value.psiApiKey) {
      testSecrets.set(testId, { psiApiKey: value.psiApiKey });
    }
    scheduleNextTest();

    return res.status(201).json({
      testId,
      status: activeTestId === testId ? "running" : "queued",
      queuePosition: db.getPendingPosition(testId)
    });
  });

  app.get("/api/tests", (req, res) => {
    const tests = db.listTests(String(req.query.url || "")).map((test) =>
      testDomain.serializeTest(test)
    );
    res.json({ tests });
  });

  app.delete("/api/tests", async (_req, res) => {
    const runningTest = activeTestId || db.getActiveTest();
    if (runningTest) {
      return res.status(409).json({ error: "Нельзя очистить историю, пока выполняется тест" });
    }

    db.deleteAllTests();
    await clearResultsDirectory();
    return res.json({ ok: true });
  });

  app.get("/api/tests/:id", (req, res) => {
    const testId = Number(req.params.id);
    if (!Number.isInteger(testId)) {
      return res.status(400).json({ error: "Некорректный test id" });
    }

    const baselineId = req.query.baseline ? Number(req.query.baseline) : null;
    const response = buildTestResponse(testId, baselineId);
    if (!response) {
      return res.status(404).json({ error: "Тест не найден" });
    }

    return res.json(response);
  });

  app.get("/api/tests/:id/runs", (req, res) => {
    const testId = Number(req.params.id);
    if (!Number.isInteger(testId)) {
      return res.status(400).json({ error: "Некорректный test id" });
    }

    const test = db.getTestById(testId);
    if (!test) {
      return res.status(404).json({ error: "Тест не найден" });
    }

    return res.json({ runs: testDomain.serializeRuns(db.getRunsByTestId(testId)) });
  });

  app.patch("/api/tests/:id", (req, res) => {
    const testId = Number(req.params.id);
    if (!Number.isInteger(testId)) {
      return res.status(400).json({ error: "Некорректный test id" });
    }

    if (!db.getTestById(testId)) {
      return res.status(404).json({ error: "Тест не найден" });
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, "pinned")) {
      db.setPinned(testId, Boolean(req.body.pinned));
    }

    return res.json({ test: testDomain.serializeTest(db.getTestById(testId)) });
  });

  app.post("/api/tests/:id/retry", (req, res) => {
    const testId = Number(req.params.id);
    if (!Number.isInteger(testId)) {
      return res.status(400).json({ error: "Некорректный test id" });
    }

    const sourceTest = db.getTestById(testId);
    if (!sourceTest) {
      return res.status(404).json({ error: "Тест не найден" });
    }

    const retryTestId = db.createTest(testDomain.cloneTestConfig(sourceTest));
    scheduleNextTest();

    return res.status(201).json({
      testId: retryTestId,
      status: activeTestId === retryTestId ? "running" : "queued",
      queuePosition: db.getPendingPosition(retryTestId)
    });
  });

  app.post("/api/tests/:id/cancel", (req, res) => {
    const testId = Number(req.params.id);
    if (!Number.isInteger(testId)) {
      return res.status(400).json({ error: "Некорректный test id" });
    }

    const test = db.getTestById(testId);
    if (!test) {
      return res.status(404).json({ error: "Тест не найден" });
    }

    if (testDomain.isTerminalStatus(test.status)) {
      return res.status(409).json({ error: "Тест уже завершен" });
    }

    if (activeTestId === testId) {
      const testController = testControllers.get(testId);
      if (!testController) {
        return res.status(409).json({ error: "Не удалось подготовить отмену теста" });
      }

      testController.cancel("Тест отменен пользователем");
      db.updateTest(testId, { status: "cancelling" });
      db.appendLog(testId, "Получен запрос на отмену теста.");
      return res.json({ ok: true, status: "cancelling" });
    }

    if (test.status === "pending") {
      db.cancelTest(testId, "Тест отменен до запуска");
      db.appendLog(testId, "Тест убран из очереди до старта.");
      return res.json({ ok: true, status: "cancelled" });
    }

    return res.status(409).json({ error: "Тест нельзя отменить в текущем состоянии" });
  });

  app.delete("/api/tests/:id", async (req, res) => {
    const testId = Number(req.params.id);
    if (!Number.isInteger(testId)) {
      return res.status(400).json({ error: "Некорректный test id" });
    }

    const test = db.getTestById(testId);
    if (!test) {
      return res.status(404).json({ error: "Тест не найден" });
    }

    if (activeTestId === testId || !testDomain.isTerminalStatus(test.status)) {
      return res.status(409).json({ error: "Нельзя удалить активный тест" });
    }

    db.deleteTest(testId);
    await clearTestResultsDirectory(testId);
    return res.json({ ok: true });
  });

  app.get("/api/tests/:id/export.md", (req, res) => {
    const testId = Number(req.params.id);
    if (!Number.isInteger(testId)) {
      return res.status(400).type("text/plain").send("Некорректный test id");
    }

    const markdown = buildMarkdownReport(testId);
    if (!markdown) {
      return res.status(404).type("text/plain").send("Тест не найден");
    }

    return res
      .type("text/markdown; charset=utf-8")
      .set("Content-Disposition", `inline; filename="speedlab-test-${testId}.md"`)
      .send(markdown);
  });

  app.get("/api/tests/:id/assets.json", (req, res) => {
    const testId = Number(req.params.id);
    if (!Number.isInteger(testId)) {
      return res.status(400).json({ error: "Некорректный test id" });
    }

    const payload = buildAssetJsonExport(testId);
    if (!payload) {
      return res.status(404).json({ error: "Тест не найден" });
    }

    return res
      .type("application/json; charset=utf-8")
      .set("Content-Disposition", `attachment; filename="speedlab-test-${testId}-assets.json"`)
      .send(JSON.stringify(payload, null, 2));
  });

  app.get("/api/tests/:id/assets.csv", (req, res) => {
    const testId = Number(req.params.id);
    if (!Number.isInteger(testId)) {
      return res.status(400).type("text/plain").send("Некорректный test id");
    }

    const csv = buildAssetCsvExport(testId);
    if (!csv) {
      return res.status(404).type("text/plain").send("Тест не найден");
    }

    return res
      .type("text/csv; charset=utf-8")
      .set("Content-Disposition", `attachment; filename="speedlab-test-${testId}-assets.csv"`)
      .send(csv);
  });

  return app;
}

function parseCliArgs(argv) {
  const args = {};

  argv.forEach((entry) => {
    if (!entry.startsWith("--")) {
      return;
    }

    const [rawKey, ...rawValueParts] = entry.slice(2).split("=");
    args[rawKey] = rawValueParts.length ? rawValueParts.join("=") : "true";
  });

  return args;
}

async function runSingleCli() {
  const args = parseCliArgs(process.argv.slice(2));
  const runs = Number(args.runs || 1);
  const payload = {
    url: args.url,
    runs,
    device: args.device || "mobile",
    runner: args.runner || "local",
    warmup: args.warmup !== "false",
    note: args.note || "CLI запуск",
    psiApiKey: args.psiApiKey || ""
  };

  const { errors, value } = testDomain.validateTestPayload(payload);
  if (errors.length) {
    console.error(errors.join(". "));
    process.exitCode = 1;
    return;
  }

  const runningTest = activeTestId || db.getActiveTest();
  if (runningTest) {
    console.error("Сейчас уже выполняется другой тест");
    process.exitCode = 1;
    return;
  }

  const testId = db.createTest(value);
  if (value.psiApiKey) {
    testSecrets.set(testId, { psiApiKey: value.psiApiKey });
  }
  activeTestId = testId;
  await executeTest(testId);
  const finalState = db.getTestById(testId);

  if (finalState?.status === "failed") {
    console.error(finalState.error_message || "Тест завершился ошибкой");
    process.exitCode = 1;
    return;
  }

  console.log(`Тест ${testId} для ${value.url} завершен через ${testDomain.runnerLabel(value.runner)}`);
}

async function main() {
  if (process.argv.includes("--single")) {
    await runSingleCli();
    return;
  }

  const app = createApp();
  app.listen(PORT, HOST, () => {
    console.log(`SpeedLab listening on http://${HOST}:${PORT}`);
    scheduleNextTest();
  });
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  createApp,
  scheduleNextTest,
  executeTest
};
