const db = require("./db");
const testDomain = require("./run-helpers");
const { buildOptimizationReportFromReports } = require("./optimization-analyzer");
const {
  computeMetricStats,
  metricsFromTest,
  compareTests,
  selectRepresentativeRun,
  extractDiagnosticsFromReports,
  extractReportContext,
  extractAssetPayloadFromReports,
  extractResourceOffendersFromReports
} = require("./stats");

function buildTestResponse(testId, baselineId = null) {
  const test = db.getTestById(testId);
  if (!test) {
    return null;
  }

  const runs = db.getRunsByTestId(testId);
  const metricStats = computeMetricStats(runs);
  const serializedTest = testDomain.serializeTest(test, metricStats);
  const requestedBaseline = baselineId ? db.getTestById(baselineId) : null;
  const previous = requestedBaseline &&
    requestedBaseline.url === test.url &&
    requestedBaseline.device === test.device &&
    (requestedBaseline.runner || "local") === (test.runner || "local") &&
    requestedBaseline.status === "completed" &&
    requestedBaseline.id !== test.id
    ? requestedBaseline
    : db.getPreviousCompletedTest(test.url, test.device, test.runner || "local", test.id);
  const previousMetrics = previous ? metricsFromTest(previous) : null;
  const comparison = compareTests(
    {
      score: serializedTest.medianScore,
      fcp: serializedTest.medianFcp,
      lcp: serializedTest.medianLcp,
      si: serializedTest.medianSi,
      tbt: serializedTest.medianTbt,
      cls: serializedTest.medianCls,
      ttfb: serializedTest.medianTtfb
    },
    previousMetrics
  );

  const representativeRun = selectRepresentativeRun(runs, serializedTest.medianScore);
  const reportPaths = runs
    .map((run) => run.json_path)
    .filter(Boolean);
  const diagnostics = extractDiagnosticsFromReports(reportPaths);
  const reportContext = representativeRun
    ? extractReportContext(representativeRun.json_path)
    : {};
  const resourceOffenders = extractResourceOffendersFromReports(reportPaths);
  const assetPayloadReport = extractAssetPayloadFromReports(reportPaths);
  const optimizationReport = buildOptimizationReportFromReports(reportPaths);
  const queuePosition = test.status === "pending" ? db.getPendingPosition(test.id) : null;

  return {
    test: serializedTest,
    progress: {
      current: test.progress_current,
      total: test.progress_total,
      percentage: test.progress_total > 0
        ? Math.round((test.progress_current / test.progress_total) * 100)
        : 0
    },
    metricStats,
    comparison,
    relatedTests: db.listCompletedTestsGroup(test.url, test.device, test.runner || "local").map((item) =>
      testDomain.serializeTest(item)
    ),
    baselineTests: db.listCompletedTestsFor(test.url, test.device, test.runner || "local", test.id).map((item) =>
      testDomain.serializeTest(item)
    ),
    baseline: previous ? testDomain.serializeTest(previous) : null,
    diagnostics,
    resourceOffenders,
    assetPayloadReport,
    optimizationReport,
    reportContext,
    queue: {
      position: queuePosition,
      total: db.countPendingTests()
    },
    rawReports: runs.map((run) => ({
      runIndex: run.run_index,
      jsonPath: run.json_path
    })),
    logLines: (test.log || "").split("\n").filter(Boolean)
  };
}

function formatMarkdownMetric(metric, value) {
  if (value == null) {
    return "-";
  }
  if (metric === "score") {
    return `${value}`;
  }
  if (metric === "cls") {
    return Number(value).toFixed(3);
  }
  if (metric === "tbt") {
    return `${Math.round(value)} ms`;
  }
  return `${(Number(value) / 1000).toFixed(2)} s`;
}

function reportVerdictLabel(verdict) {
  switch (verdict) {
    case "Improved":
      return "Улучшилось";
    case "Worse":
      return "Стало хуже";
    case "NoChange":
      return "Без изменений";
    case "No previous test":
      return "Нет предыдущего теста";
    default:
      return verdict || "-";
  }
}

function formatDiagnosticDetailLabel(item) {
  const parts = [];

  if (item?.totalReports > 1) {
    parts.push(`${item.occurrences}/${item.totalReports}`);
  }
  if (item?.displayValue) {
    parts.push(item.displayValue);
  }

  return parts.length ? ` (${parts.join(", ")})` : "";
}

function formatOptimizationImpact(impact = {}) {
  return [
    impact.lcpMs ? `LCP ${impact.lcpMs} ms` : "",
    impact.tbtMs ? `TBT ${impact.tbtMs} ms` : "",
    impact.renderBlockingMs ? `blocking ${impact.renderBlockingMs} ms` : "",
    impact.wastedKb ? `wasted ${impact.wastedKb} KiB` : "",
    impact.transferKb ? `transfer ${impact.transferKb} KiB` : ""
  ].filter(Boolean).join(", ") || "-";
}

function formatOptimizationMarkdown(optimizationReport = {}) {
  const workItems = optimizationReport.workItems || [];
  if (!workItems.length) {
    return [
      "## Optimization plan",
      "",
      "No grouped optimization work items were found for this report."
    ];
  }

  return [
    "## Optimization plan",
    "",
    ...workItems.slice(0, 8).flatMap((item, index) => [
      `### ${index + 1}. ${item.title}`,
      `Category: ${item.categoryLabel || item.category}`,
      `Priority: ${item.priority} / confidence: ${item.confidence} / risk: ${item.risk}`,
      `Impact: ${formatOptimizationImpact(item.impact)}`,
      `Problem: ${item.problem}`,
      `Recommended: ${item.solution}`,
      item.resources?.length
        ? `Resources: ${item.resources.slice(0, 6).map((resource) => resource.url).join("; ")}`
        : "",
      ""
    ].filter(Boolean))
  ];
}

function formatBytes(value) {
  if (value == null) {
    return "-";
  }

  if (value >= 1024 * 1024) {
    return `${(value / 1024 / 1024).toFixed(2)} MB`;
  }

  return `${Math.round(value / 1024)} KiB`;
}

function formatSourceLabel(item = {}) {
  switch (item.sourceType) {
    case "plugin":
      return `Plugin: ${item.sourceName}`;
    case "theme":
      return `Theme: ${item.sourceName}`;
    case "elementor":
      return "Elementor generated CSS";
    case "wordpress-core":
      return "WordPress core";
    case "uploads":
      return "Uploads";
    case "third-party":
      return `Third-party: ${item.sourceName}`;
    default:
      return item.sourceName || item.sourceType || "-";
  }
}

function formatAssetPayloadMarkdown(assetPayloadReport = {}) {
  const summary = assetPayloadReport.summary || {};
  const groups = assetPayloadReport.groups || [];
  const css = assetPayloadReport.css || [];
  const js = assetPayloadReport.js || [];

  if (!summary.assetCount) {
    return [
      "## CSS/JS payload",
      "",
      "No full CSS/JS network payload data was found."
    ];
  }

  const assetLine = (item, index) => {
    const flags = [
      item.renderBlockingReports ? `render-blocking ${item.renderBlockingReports}/${item.totalReports}` : "",
      item.unusedBytes ? `unused ${formatBytes(item.unusedBytes)}` : ""
    ].filter(Boolean).join(", ");

    return `${index + 1}. ${item.url} - ${formatBytes(item.transferBytes)} transfer / ${formatBytes(item.resourceBytes)} raw / ${formatSourceLabel(item)}${flags ? ` / ${flags}` : ""}`;
  };

  return [
    "## CSS/JS payload",
    "",
    `Reports analyzed: ${summary.reportCount}`,
    `CSS: ${summary.css?.count || 0} files / ${formatBytes(summary.css?.transferBytes)} transfer / ${summary.css?.renderBlockingCount || 0} render-blocking`,
    `JS: ${summary.js?.count || 0} files / ${formatBytes(summary.js?.transferBytes)} transfer / ${summary.js?.renderBlockingCount || 0} render-blocking`,
    `Known unused CSS/JS: ${formatBytes(summary.totalUnusedBytes)}`,
    "",
    "### Sources",
    "| Source | CSS | JS | Transfer | Raw | Unused | Blocking |",
    "|---|---:|---:|---:|---:|---:|---:|",
    ...groups.slice(0, 12).map((group) =>
      `| ${formatSourceLabel(group)} | ${group.cssCount} | ${group.jsCount} | ${formatBytes(group.totalTransferBytes)} | ${formatBytes(group.totalResourceBytes)} | ${formatBytes(group.unusedBytes)} | ${group.renderBlockingCount} |`
    ),
    "",
    "### Heaviest CSS",
    ...css.slice(0, 10).map(assetLine),
    "",
    "### Heaviest JS",
    ...js.slice(0, 10).map(assetLine)
  ];
}

function buildMarkdownReport(testId) {
  const details = buildTestResponse(testId);
  if (!details) {
    return null;
  }

  const metrics = ["score", "fcp", "lcp", "si", "tbt", "cls", "ttfb"];
  const metricLabels = {
    score: "Оценка",
    fcp: "FCP",
    lcp: "LCP",
    si: "SI",
    tbt: "TBT",
    cls: "CLS",
    ttfb: "TTFB"
  };
  const lines = [
    `# Отчет SpeedLab #${details.test.id}`,
    "",
    `URL: ${details.test.url}`,
    `Устройство: ${details.test.device}`,
    `Источник: ${details.test.runnerLabel}`,
    details.test.runner === "local"
      ? `Основные прогоны: ${details.test.runsCompleted}/${details.test.runsRequested}`
      : `Запросы PSI: ${details.test.runsCompleted}/${details.test.runsRequested}`,
    details.test.runner === "local"
      ? `Прогрев: ${details.test.warmup ? "включен, исключен из статистики" : "выключен"}`
      : "Прогрев: не используется в PSI",
    `Вердикт: ${reportVerdictLabel(details.comparison.verdict)}`,
    "",
    "## Метрики",
    "| Метрика | Медиана | Мин | Макс | Разброс |",
    "|---|---:|---:|---:|---:|",
    ...metrics.map((metric) => {
      const stats = details.metricStats[metric] || {};
      return `| ${metricLabels[metric]} | ${formatMarkdownMetric(metric, stats.median)} | ${formatMarkdownMetric(metric, stats.min)} | ${formatMarkdownMetric(metric, stats.max)} | ${formatMarkdownMetric(metric, stats.spread)} |`;
    }),
    "",
    ...formatOptimizationMarkdown(details.optimizationReport),
    "",
    ...formatAssetPayloadMarkdown(details.assetPayloadReport),
    "",
    "## Что чинить первым",
    ...details.diagnostics.slice(0, 8).flatMap((item, index) => [
      `${index + 1}. ${item.title}${formatDiagnosticDetailLabel(item)}`,
      `Проблема: ${item.description}`,
      `Решение: ${item.fix}`,
      item.targets?.length ? `Ресурсы: ${item.targets.join("; ")}` : ""
    ].filter(Boolean))
  ];

  return lines.join("\n");
}

module.exports = {
  buildTestResponse,
  buildMarkdownReport
};
