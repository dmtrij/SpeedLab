const fs = require("fs/promises");
const path = require("path");
const { extractMetrics } = require("./stats");
const { createCancelledError } = require("./cancellation");
const runtimePaths = require("./runtime-paths");

const PSI_ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const PSI_DECOY_URL = process.env.SPEEDLAB_PSI_DECOY_URL || "https://example.com/";
const PSI_DECOY_MIN_VISIBLE_MS = Number(process.env.SPEEDLAB_PSI_DECOY_MIN_VISIBLE_MS || 1800);
const PSI_RETRY_DELAY_MS = Number(process.env.SPEEDLAB_PSI_RETRY_DELAY_MS || 1200);

function buildCacheBustedTestUrl(url, runIndex) {
  const parsedUrl = new URL(url);
  const token = `${Date.now().toString(36)}-${runIndex}-${Math.random().toString(36).slice(2, 8)}`;
  parsedUrl.searchParams.set("speedlab_psi_run", token);
  return parsedUrl.toString();
}

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

function metricSignature(metrics = {}) {
  return [
    metrics.score,
    metrics.fcp,
    metrics.lcp,
    metrics.si,
    metrics.tbt,
    metrics.cls,
    metrics.ttfb
  ].map((value) => value == null ? "" : String(value)).join("|");
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

function sleepWithCancellation(ms, testController) {
  if (!ms || ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    let releaseCancel = null;
    const timeout = setTimeout(() => {
      releaseCancel?.();
      resolve();
    }, ms);

    releaseCancel = testController?.onCancel((reason) => {
      clearTimeout(timeout);
      releaseCancel?.();
      reject(createCancelledError(reason));
    }) || null;
  });
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
    return "Google PSI API limit reached. Add a PSI API key or retry later.";
  }

  if (status === 403) {
    return apiMessage || "Google PSI API rejected the request. Check the key or quota.";
  }

  return apiMessage || `Google PSI API request failed with status ${status}.`;
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
    throw new Error("Google PSI API response does not contain lighthouseResult.");
  }

  return {
    reportJson: JSON.stringify(payload, null, 2),
    metrics: extractMetrics(payload.lighthouseResult),
    testedUrl: url
  };
}

async function runPsiAttempt({ url, device, apiKey, testController }) {
  const runAbortController = new AbortController();
  const releaseCancel = testController?.onCancel(() => {
    runAbortController.abort();
  });

  try {
    return await runSinglePsi(url, device, apiKey, runAbortController.signal);
  } catch (error) {
    if (testController?.cancelled) {
      throw createCancelledError(testController.reason);
    }
    throw error;
  } finally {
    releaseCancel?.();
  }
}

function isRetryablePsiError(error) {
  const message = error instanceof Error ? error.message : String(error || "");

  if (/limit|quota|api key|rejected|status 403|status 429/i.test(message)) {
    return false;
  }

  return /something went wrong|timed out|temporar|internal|unavailable|fetch failed|network|socket|econn|reset/i.test(message);
}

async function runPsiAttemptWithRetry({
  url,
  retryUrl,
  device,
  apiKey,
  testController,
  onLog,
  retryDelayMs = PSI_RETRY_DELAY_MS,
  runIndex
}) {
  try {
    return await runPsiAttempt({
      url,
      device,
      apiKey,
      testController
    });
  } catch (error) {
    if (testController?.cancelled || !isRetryablePsiError(error)) {
      throw error;
    }

    const message = error instanceof Error ? error.message : "unknown PSI error";
    const fallbackUrl = retryUrl || buildCacheBustedTestUrl(url, `retry-${runIndex || "unknown"}`);
    onLog?.(`PSI run ${runIndex || "?"} failed with retryable error (${message}). Retrying with cache-busting URL: ${fallbackUrl}`);
    await sleepWithCancellation(retryDelayMs, testController);

    return runPsiAttempt({
      url: fallbackUrl,
      device,
      apiKey,
      testController
    });
  }
}

async function runHiddenPsiDecoy({
  device,
  apiKey,
  testController,
  onLog,
  onDecoyStart,
  onDecoyComplete,
  minVisibleMs = PSI_DECOY_MIN_VISIBLE_MS,
  reason,
  runIndex
}) {
  const decoyUrl = buildCacheBustedTestUrl(PSI_DECOY_URL, `decoy-${runIndex}`);
  const visibleStartedAt = Date.now();
  onLog?.(`Hidden PSI decoy started before retry (${reason}): ${decoyUrl}`);
  onDecoyStart?.({ runIndex, url: decoyUrl, reason });

  try {
    await runPsiAttempt({
      url: decoyUrl,
      device,
      apiKey,
      testController
    });
    onLog?.("Hidden PSI decoy completed. Retrying target URL.");
  } catch (error) {
    if (testController?.cancelled) {
      throw createCancelledError(testController.reason);
    }

    const message = error instanceof Error ? error.message : "unknown decoy error";
    onLog?.(`Hidden PSI decoy failed (${message}). Retrying target URL anyway.`);
  } finally {
    const remainingVisibleMs = Math.max(0, minVisibleMs - (Date.now() - visibleStartedAt));
    await sleepWithCancellation(remainingVisibleMs, testController);
    onDecoyComplete?.({ runIndex, url: decoyUrl, reason });
  }
}

async function runPsiSequence({
  testId,
  url,
  device,
  runs,
  apiKey,
  previousMetrics,
  testController,
  onLog,
  onMainRunStart,
  onDecoyStart,
  onDecoyComplete,
  decoyMinVisibleMs,
  psiRetryDelayMs,
  onRunComplete
}) {
  const resultsDir = runtimePaths.resolveTestResultsDir(testId);
  await fs.mkdir(resultsDir, { recursive: true });

  if (!apiKey) {
    onLog?.("No PSI API key was provided. Unauthenticated Google PSI API requests are used.");
  }

  const savedRuns = [];
  const previousSignature = previousMetrics ? metricSignature(previousMetrics) : null;

  if (runs > 1) {
    onLog?.("PSI series starts with the original URL. If Google returns an identical lab snapshot, SpeedLab retries that run with a speedlab_psi_run cache-busting query parameter.");
  } else {
    onLog?.("Single PSI run uses a speedlab_psi_run cache-busting query parameter so Google is less likely to return the previous lab snapshot.");
  }

  for (let runIndex = 1; runIndex <= runs; runIndex += 1) {
    throwIfCancelled(testController);
    onMainRunStart?.({ runIndex });
    const initialUrl = runs === 1 ? buildCacheBustedTestUrl(url, runIndex) : url;
    onLog?.(`PSI run ${runIndex}/${runs} started for URL: ${initialUrl}`);

    let { reportJson, metrics, testedUrl } = await runPsiAttemptWithRetry({
      url: initialUrl,
      retryUrl: buildCacheBustedTestUrl(url, `error-${runIndex}`),
      device,
      apiKey,
      testController,
      onLog,
      retryDelayMs: psiRetryDelayMs,
      runIndex
    });

    const signature = metricSignature(metrics);
    const duplicateOf = savedRuns.find((run) => metricSignature(run) === signature);
    const matchesPrevious = previousSignature && signature === previousSignature;

    if ((runs > 1 && duplicateOf) || matchesPrevious) {
      throwIfCancelled(testController);
      const retryUrl = buildCacheBustedTestUrl(url, runIndex);
      const reason = duplicateOf
        ? `duplicated run #${duplicateOf.runIndex}`
        : "matched previous completed PSI snapshot";

      onLog?.(`PSI run ${runIndex}/${runs} ${reason}. Running hidden decoy before retry.`);
      await runHiddenPsiDecoy({
        device,
        apiKey,
        testController,
        onLog,
        onDecoyStart,
        onDecoyComplete,
        minVisibleMs: decoyMinVisibleMs,
        reason,
        runIndex
      });
      throwIfCancelled(testController);
      onLog?.(`PSI run ${runIndex}/${runs} retrying target URL with cache-busting URL: ${retryUrl}`);

      ({ reportJson, metrics, testedUrl } = await runPsiAttemptWithRetry({
        url: retryUrl,
        retryUrl: buildCacheBustedTestUrl(url, `error-retry-${runIndex}`),
        device,
        apiKey,
        testController,
        onLog,
        retryDelayMs: psiRetryDelayMs,
        runIndex
      }));

      if (metricSignature(metrics) === signature) {
        onLog?.(`PSI run ${runIndex}/${runs} is still identical after hidden decoy and cache-busting. Saving Google's response as returned.`);
      } else {
        onLog?.(`PSI run ${runIndex}/${runs} returned a separate result after hidden decoy and cache-busting.`);
      }
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
    onLog?.(`PSI run ${runIndex}/${runs} saved to ${publicPath}. Tested URL: ${testedUrl}`);
  }

  return savedRuns;
}

module.exports = {
  buildCacheBustedTestUrl,
  buildPsiUrl,
  metricSignature,
  runPsiSequence
};
