const fs = require("fs/promises");
const path = require("path");
const { launch } = require("chrome-launcher");
const { extractMetrics } = require("./stats");
const { createCancelledError } = require("./cancellation");
const runtimePaths = require("./runtime-paths");

let lighthouseModulePromise;
let desktopConfigPromise;

async function getLighthouse() {
  if (!lighthouseModulePromise) {
    lighthouseModulePromise = import("lighthouse").then((module) => module.default || module);
  }

  return lighthouseModulePromise;
}

async function getDesktopConfig() {
  if (!desktopConfigPromise) {
    desktopConfigPromise = import("lighthouse/core/config/desktop-config.js")
      .then((module) => module.default || module)
      .catch(() => null);
  }

  return desktopConfigPromise;
}

function normalizeReport(report) {
  if (Array.isArray(report)) {
    return String(report[0] || "");
  }

  return String(report || "");
}

function throwIfCancelled(testController) {
  if (testController?.cancelled) {
    throw createCancelledError(testController.reason);
  }
}

async function runSingleLighthouse(url, device, port) {
  const lighthouse = await getLighthouse();
  const config = device === "desktop" ? await getDesktopConfig() : undefined;
  const options = {
    port,
    output: "json",
    logLevel: "error",
    onlyCategories: ["performance"]
  };

  const result = await lighthouse(url, options, config || undefined);
  const reportJson = normalizeReport(result.report);
  const lhr = result.lhr || JSON.parse(reportJson);

  return {
    reportJson,
    metrics: extractMetrics(lhr)
  };
}

async function runLighthouseSequence({
  testId,
  url,
  device,
  runs,
  warmup,
  testController,
  onLog,
  onWarmupStart,
  onWarmupComplete,
  onMainRunStart,
  onRunComplete
}) {
  const resultsDir = runtimePaths.resolveTestResultsDir(testId);
  const chromeProfileDir = runtimePaths.resolveChromeProfileDir(testId);
  await fs.mkdir(resultsDir, { recursive: true });
  await fs.mkdir(chromeProfileDir, { recursive: true });

  const chrome = await launch({
    userDataDir: chromeProfileDir,
    chromeFlags: [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-dev-shm-usage"
    ]
  });

  let chromeClosed = false;
  const stopChrome = async () => {
    if (chromeClosed) {
      return;
    }

    chromeClosed = true;
    try {
      await chrome.kill();
    } catch {
    }
  };
  const releaseCancel = testController?.onCancel(() => {
    void stopChrome();
  });

  try {
    throwIfCancelled(testController);
    if (warmup) {
      throwIfCancelled(testController);
      onWarmupStart?.();
      onLog?.("Запущен прогревочный Lighthouse-прогон.");
      try {
        await runSingleLighthouse(url, device, chrome.port);
      } catch (error) {
        if (testController?.cancelled) {
          throw createCancelledError(testController.reason);
        }
        throw error;
      }
      throwIfCancelled(testController);
      onWarmupComplete?.();
      onLog?.("Прогрев завершен и исключен из статистики.");
    }

    const savedRuns = [];

    for (let runIndex = 1; runIndex <= runs; runIndex += 1) {
      throwIfCancelled(testController);
      onMainRunStart?.({ runIndex });
      onLog?.(`Запущен прогон ${runIndex}/${runs}.`);

      let reportJson;
      let metrics;
      try {
        ({ reportJson, metrics } = await runSingleLighthouse(url, device, chrome.port));
      } catch (error) {
        if (testController?.cancelled) {
          throw createCancelledError(testController.reason);
        }
        throw error;
      }
      throwIfCancelled(testController);
      const fileName = `run-${runIndex}.json`;
      const diskPath = path.join(resultsDir, fileName);
      const publicPath = runtimePaths.createPublicReportPath(testId, fileName);

      await fs.writeFile(diskPath, reportJson, "utf8");

      const runResult = {
        runIndex,
        jsonPath: publicPath,
        ...metrics
      };

      savedRuns.push(runResult);
      onRunComplete?.(runResult);
      onLog?.(`Прогон ${runIndex}/${runs} сохранен в ${publicPath}.`);
    }

    return savedRuns;
  } finally {
    releaseCancel?.();
    await stopChrome();
    try {
      await fs.rm(chromeProfileDir, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 250
      });
    } catch {
    }
  }
}

module.exports = {
  runLighthouseSequence
};
