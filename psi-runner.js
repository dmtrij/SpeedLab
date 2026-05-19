const fs = require("fs/promises");
const path = require("path");
const { extractMetrics } = require("./stats");
const { createCancelledError } = require("./cancellation");
const runtimePaths = require("./runtime-paths");

const PSI_ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

function buildPsiUrl(url, device, apiKey) {
  const params = new URLSearchParams({
    url,
    strategy: device,
    category: "performance"
  });

  if (apiKey) {
    params.set("key", apiKey);
  }

  return `${PSI_ENDPOINT}?${params.toString()}`;
}

function getFetchTimeoutSignal(timeoutMs) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(timeoutMs);
  }

  return undefined;
}

function throwIfCancelled(testController) {
  if (testController?.cancelled) {
    throw createCancelledError(testController.reason);
  }
}

function mergeAbortSignals(signals) {
  const activeSignals = signals.filter(Boolean);
  if (!activeSignals.length) {
    return undefined;
  }
  if (activeSignals.length === 1) {
    return activeSignals[0];
  }
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.any === "function") {
    return AbortSignal.any(activeSignals);
  }

  const controller = new AbortController();
  const abort = () => controller.abort();
  activeSignals.forEach((signal) => {
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
  });
  return controller.signal;
}

function formatPsiError(status, payload, fallbackText) {
  const apiMessage = payload?.error?.message || payload?.lighthouseResult?.runtimeError?.message || fallbackText;

  if (status === 429) {
    return "Достигнут лимит Google PSI API. Добавь ключ PSI API или повтори попытку позже.";
  }

  if (status === 403) {
    return apiMessage || "Google PSI API отклонил запрос. Проверь ключ или квоту.";
  }

  return apiMessage || `Запрос к Google PSI API завершился ошибкой со статусом ${status}.`;
}

async function runSinglePsi(url, device, apiKey, signal) {
  const requestUrl = buildPsiUrl(url, device, apiKey);
  let response;

  try {
    response = await fetch(requestUrl, {
      headers: {
        Accept: "application/json"
      },
      signal: mergeAbortSignals([signal, getFetchTimeoutSignal(90000)])
    });
  } catch (error) {
    if (signal?.aborted) {
      throw createCancelledError("Test cancelled");
    }

    if (error?.name === "AbortError") {
      throw new Error("Google PSI API request timed out.");
    }

    throw error;
  }

  const responseText = await response.text();
  let payload = null;

  try {
    payload = JSON.parse(responseText);
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(formatPsiError(response.status, payload, responseText));
  }

  if (!payload?.lighthouseResult) {
    throw new Error("Ответ Google PSI API не содержит lighthouseResult.");
  }

  return {
    reportJson: JSON.stringify(payload, null, 2),
    metrics: extractMetrics(payload.lighthouseResult)
  };
}

async function runPsiSequence({
  testId,
  url,
  device,
  runs,
  apiKey,
  testController,
  onLog,
  onMainRunStart,
  onRunComplete
}) {
  const resultsDir = runtimePaths.resolveTestResultsDir(testId);
  await fs.mkdir(resultsDir, { recursive: true });

  if (!apiKey) {
    onLog?.("Ключ PSI API не передан. Используются неавторизованные запросы к Google PSI API.");
  }

  const savedRuns = [];

  if (runs > 1) {
    onLog?.("PSI-серия повторяет один и тот же исходный URL без добавления служебных query-параметров. Google может вернуть одинаковый лабораторный снимок.");
  }

  for (let runIndex = 1; runIndex <= runs; runIndex += 1) {
    throwIfCancelled(testController);
    onMainRunStart?.({ runIndex });
    onLog?.(`PSI run ${runIndex}/${runs} started for URL: ${url}`);

    const runAbortController = new AbortController();
    const releaseCancel = testController?.onCancel(() => {
      runAbortController.abort();
    });

    let reportJson;
    let metrics;
    try {
      ({ reportJson, metrics } = await runSinglePsi(url, device, apiKey, runAbortController.signal));
    } catch (error) {
      if (testController?.cancelled) {
        throw createCancelledError(testController.reason);
      }
      throw error;
    } finally {
      releaseCancel?.();
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
    onLog?.(`PSI-прогон ${runIndex}/${runs} сохранен в ${publicPath}.`);
  }

  return savedRuns;
}

module.exports = {
  runPsiSequence
};
