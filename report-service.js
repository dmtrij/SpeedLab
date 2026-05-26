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
  extractAssetPayloadFromReports
} = require("./stats");

function buildTestResponse(testId, baselineId = null) {
  const test = db.getTestById(testId);
  if (!test) {
    return null;
  }

  const runs = db.getRunsByTestId(testId);
  const runQuality = buildRunQuality(runs, test);
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
  const baselineRuns = previous ? db.getRunsByTestId(previous.id) : [];
  const baselineMetricStats = previous ? computeMetricStats(baselineRuns) : null;
  const baselineRunQuality = previous ? buildRunQuality(baselineRuns, previous) : null;
  const comparisonQuality = buildComparisonQuality(comparison, runQuality, baselineRunQuality, metricStats, baselineMetricStats);

  const representativeRun = selectRepresentativeRun(runs, serializedTest.medianScore);
  const reportPaths = runs
    .map((run) => run.json_path)
    .filter(Boolean);
  const diagnostics = extractDiagnosticsFromReports(reportPaths);
  const reportContext = representativeRun
    ? extractReportContext(representativeRun.json_path)
    : {};
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
    runQuality,
    comparison,
    comparisonQuality,
    relatedTests: db.listCompletedTestsGroup(test.url, test.device, test.runner || "local").map((item) =>
      testDomain.serializeTest(item)
    ),
    baselineTests: db.listCompletedTestsFor(test.url, test.device, test.runner || "local", test.id).map((item) =>
      testDomain.serializeTest(item)
    ),
    baseline: previous ? testDomain.serializeTest(previous) : null,
    diagnostics,
    assetPayloadReport,
    optimizationReport,
    reportContext,
    queue: {
      position: queuePosition,
      total: db.countPendingTests()
    }
  };
}

function buildComparisonQuality(comparison = {}, currentRunQuality = {}, baselineRunQuality = null, currentStats = {}, baselineStats = null) {
  if (!comparison.hasPrevious) {
    return {
      tone: "muted",
      label: "Нет базы",
      score: 0,
      summary: "Сравнение появится после предыдущего завершенного теста с тем же URL, устройством и режимом."
    };
  }

  if (!currentRunQuality.totalRuns) {
    return {
      tone: "muted",
      label: "Ждет данные",
      score: 0,
      summary: "Сравнение станет осмысленным после первого сохраненного прогона текущего теста."
    };
  }

  const currentScore = currentRunQuality.reliabilityScore || 0;
  const baselineScore = baselineRunQuality?.reliabilityScore ?? 70;
  const confidenceScore = Math.min(currentScore, baselineScore);
  const scoreDiff = Math.abs(comparison.metrics?.score?.diff || 0);
  const lcpDiff = Math.abs(comparison.metrics?.lcp?.diff || 0);
  const scoreSpread = Math.max(currentStats.score?.spread || 0, baselineStats?.score?.spread || 0);
  const lcpSpread = Math.max(currentStats.lcp?.spread || 0, baselineStats?.lcp?.spread || 0);
  const looksLikeNoise = (
    (scoreDiff > 0 && scoreSpread > 0 && scoreDiff <= scoreSpread) ||
    (lcpDiff > 0 && lcpSpread > 0 && lcpDiff <= lcpSpread)
  );
  const hasDuplicateRisk = ["low", "muted"].includes(currentRunQuality.reliabilityTone) ||
    ["low", "muted"].includes(baselineRunQuality?.reliabilityTone);

  if (hasDuplicateRisk || confidenceScore < 45) {
    return {
      tone: "warning",
      label: "Низкая надежность",
      score: confidenceScore,
      summary: "Вывод по сравнению слабый: в текущей или базовой серии мало уникальных снимков."
    };
  }

  if (looksLikeNoise || comparison.verdict === "NoChange") {
    return {
      tone: "neutral",
      label: "Похоже на шум",
      score: confidenceScore,
      summary: "Разница близка к разбросу серии. Лучше подтвердить еще одной серией перед выводом."
    };
  }

  if (confidenceScore >= 80) {
    return {
      tone: "success",
      label: "Сравнение надежное",
      score: confidenceScore,
      summary: "Обе серии достаточно качественные, вывод по медианам можно использовать."
    };
  }

  return {
    tone: "info",
    label: "Средняя надежность",
    score: confidenceScore,
    summary: "Вывод пригоден как ориентир, но лучше сверить еще одной серией при спорной разнице."
  };
}

function buildRunSignature(run = {}) {
  return [
    run.score,
    run.fcp,
    run.lcp,
    run.si,
    run.tbt,
    run.cls,
    run.ttfb
  ].map((value) => value == null ? "" : String(value)).join("|");
}

function countLogMatches(logText, pattern) {
  return (String(logText || "").match(pattern) || []).length;
}

function buildRunMitigation(test = {}) {
  const runner = test.runner || "local";
  const logText = test.log || "";
  const cacheBustCount = countLogMatches(logText, /cache-busting URL|speedlab_psi_run/gi);
  const decoyCount = countLogMatches(logText, /Hidden PSI decoy started/gi);
  const retryCount = countLogMatches(logText, /retrying target URL|Retrying with cache-busting URL|failed with retryable error/gi);

  if (runner !== "psi") {
    return {
      label: "Не требуется",
      cacheBustUsed: false,
      cacheBustCount: 0,
      decoyUsed: false,
      decoyCount: 0,
      retryCount: 0
    };
  }

  if (decoyCount > 0) {
    return {
      label: "Decoy + cache-bust",
      cacheBustUsed: true,
      cacheBustCount,
      decoyUsed: true,
      decoyCount,
      retryCount
    };
  }

  if (cacheBustCount > 0 || retryCount > 0) {
    return {
      label: "Cache-bust",
      cacheBustUsed: true,
      cacheBustCount,
      decoyUsed: false,
      decoyCount: 0,
      retryCount
    };
  }

  return {
    label: "Не фиксировалась",
    cacheBustUsed: false,
    cacheBustCount: 0,
    decoyUsed: false,
    decoyCount: 0,
    retryCount: 0
  };
}

function buildReliabilitySummary({ totalRuns, uniqueRuns, allDuplicated, hasDuplicates }) {
  if (!totalRuns) {
    return {
      reliabilityScore: 0,
      reliabilityLabel: "Нет данных",
      reliabilityTone: "muted",
      recommendation: "Дождаться завершения хотя бы одного прогона."
    };
  }

  if (totalRuns === 1) {
    return {
      reliabilityScore: 35,
      reliabilityLabel: "Низкая",
      reliabilityTone: "low",
      recommendation: "Для выводов запускать серию минимум из 3 прогонов."
    };
  }

  if (allDuplicated) {
    return {
      reliabilityScore: 25,
      reliabilityLabel: "Низкая",
      reliabilityTone: "low",
      recommendation: "Считать серию одним снимком и не делать вывод по разбросу."
    };
  }

  if (hasDuplicates) {
    return {
      reliabilityScore: Math.max(45, Math.round((uniqueRuns / totalRuns) * 80)),
      reliabilityLabel: "Средняя",
      reliabilityTone: "medium",
      recommendation: "Оценивать медиану можно, но вывод по стабильности делать только по уникальным снимкам."
    };
  }

  return {
    reliabilityScore: totalRuns >= 3 ? 92 : 75,
    reliabilityLabel: totalRuns >= 3 ? "Высокая" : "Средняя",
    reliabilityTone: totalRuns >= 3 ? "high" : "medium",
    recommendation: totalRuns >= 3
      ? "Серия пригодна для сравнения медианы и разброса."
      : "Для стабильного вывода лучше иметь минимум 3 прогона."
  };
}

function buildRunQuality(runs = [], test = {}) {
  const firstBySignature = new Map();
  const duplicates = [];

  runs.forEach((run) => {
    const runIndex = run.run_index ?? run.runIndex ?? null;
    const signature = buildRunSignature(run);
    const firstRun = firstBySignature.get(signature);

    if (firstRun) {
      duplicates.push({
        runIndex,
        duplicateOf: firstRun.runIndex
      });
      return;
    }

    firstBySignature.set(signature, { runIndex });
  });

  const totalRuns = runs.length;
  const uniqueRuns = firstBySignature.size;
  const duplicateCount = duplicates.length;
  const uniquePercent = totalRuns ? Math.round((uniqueRuns / totalRuns) * 100) : 0;
  const allDuplicated = totalRuns > 1 && uniqueRuns === 1;
  const hasDuplicates = duplicateCount > 0;
  const runner = test.runner || "local";
  const mitigation = buildRunMitigation(test);
  const reliability = buildReliabilitySummary({
    totalRuns,
    uniqueRuns,
    allDuplicated,
    hasDuplicates
  });

  let verdict = "not-enough-data";
  let label = "Недостаточно данных";
  let note = "Для оценки качества серии нужно минимум два сохраненных прогона.";

  if (totalRuns > 1 && allDuplicated) {
    verdict = "all-duplicates";
    label = "Все прогоны повторились";
    note = runner === "psi"
      ? "Google вернул один и тот же lab-снимок для всех сохраненных PSI-прогонов. Считать это одним внешним снимком, а не стабильной серией."
      : "Все сохраненные прогоны имеют одинаковые метрики. Проверить, не переиспользовал ли runner кешированный отчет.";
  } else if (hasDuplicates) {
    verdict = "partial-duplicates";
    label = "Есть повторные снимки";
    note = runner === "psi"
      ? "Google вернул повторные PSI-снимки в части серии. Для надежности смотреть на число уникальных результатов."
      : "Часть сохраненных прогонов имеет одинаковые метрики. Медиана пригодна, но разброс менее информативен.";
  } else if (totalRuns > 1) {
    verdict = "unique";
    label = "Прогоны уникальны";
    note = "Каждый сохраненный прогон дал отдельный снимок метрик.";
  } else if (totalRuns === 1) {
    verdict = "single";
    label = "Один снимок";
    note = runner === "psi"
      ? "Один PSI-прогон полезен как внешняя сверка, но не проверяет стабильность."
      : "Один локальный прогон является быстрой проверкой, а не стабильной медианой.";
  }

  return {
    totalRuns,
    uniqueRuns,
    uniquePercent,
    duplicateCount,
    duplicateRate: totalRuns ? Number((duplicateCount / totalRuns).toFixed(3)) : 0,
    duplicates,
    mitigation,
    ...reliability,
    verdict,
    label,
    note
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
    impact.renderBlockingMs ? `блокировка ${impact.renderBlockingMs} ms` : "",
    impact.wastedKb ? `лишний вес ${impact.wastedKb} KiB` : "",
    impact.transferKb ? `передача ${impact.transferKb} KiB` : ""
  ].filter(Boolean).join(", ") || "-";
}

function formatOptimizationMarkdown(optimizationReport = {}) {
  const workItems = optimizationReport.workItems || [];
  if (!workItems.length) {
    return [
      "## План оптимизации",
      "",
      "Сгруппированные задачи оптимизации в этом отчете не найдены."
    ];
  }

  return [
    "## План оптимизации",
    "",
    ...workItems.slice(0, 8).flatMap((item, index) => [
      `### ${index + 1}. ${item.title}`,
      `Категория: ${item.categoryLabel || item.category}`,
      `Приоритет: ${item.priority} / уверенность: ${item.confidence} / риск: ${item.risk}`,
      `Эффект: ${formatOptimizationImpact(item.impact)}`,
      `Проблема: ${item.problem}`,
      `Рекомендация: ${item.solution}`,
      item.resources?.length
        ? `Ресурсы: ${item.resources.slice(0, 6).map((resource) => resource.url).join("; ")}`
        : "",
      ""
    ].filter(Boolean))
  ];
}

function formatAssetActionImpact(impact = {}) {
  return [
    impact.affectedCount ? `${impact.affectedCount} ресурсов` : "",
    impact.transferBytes ? `${formatBytes(impact.transferBytes)} передача` : "",
    impact.unusedBytes ? `${formatBytes(impact.unusedBytes)} лишнее` : "",
    impact.renderBlockingMs ? `${Math.round(impact.renderBlockingMs)} ms блокировка` : ""
  ].filter(Boolean).join(" / ") || "-";
}

function formatSeverityLabel(severity) {
  switch (severity) {
    case "high":
      return "высокий";
    case "medium":
      return "средний";
    case "low":
      return "низкий";
    default:
      return severity || "-";
  }
}

function formatAssetActionPlanMarkdown(assetPayloadReport = {}) {
  const actions = assetPayloadReport.actions || [];

  if (!actions.length) {
    return [
      "## Приоритетные задачи оптимизации",
      "",
      "По инвентарю ресурсов не найдено конкретных действий."
    ];
  }

  return [
    "## Приоритетные задачи оптимизации",
    "",
    ...actions.slice(0, 8).flatMap((action, index) => [
      `### ${index + 1}. ${action.title}`,
      `Важность: ${formatSeverityLabel(action.severity)}`,
      `Риск: ${action.risk?.label || "-"}`,
      `Эффект: ${formatAssetActionImpact(action.impact)}`,
      `Почему: ${action.reason}`,
      `Действие: ${action.fix}`,
      action.resources?.length
        ? "Ресурсы:"
        : "",
      ...(action.resources || []).slice(0, 8).map((resource) => {
        const flags = [
          resource.renderBlockingReports ? `блокирует ${resource.renderBlockingReports}/${resource.totalReports}` : "",
          resource.unusedBytes ? `лишнее ${formatBytes(resource.unusedBytes)}` : "",
          resource.transferBytes ? `${formatBytes(resource.transferBytes)} передача` : ""
        ].filter(Boolean).join(", ");

        return `- ${resource.url}${flags ? ` (${flags})` : ""}`;
      }),
      ""
    ].filter(Boolean))
  ];
}

function formatRunQualityMarkdown(runQuality = {}, test = {}) {
  const deviceLabel = test.device === "desktop"
    ? "Десктоп"
    : test.device === "mobile"
      ? "Мобильный"
      : test.device;
  const lines = [
    "## Качество серии",
    "",
    `Режим: ${test.runnerLabel || test.runner} / ${deviceLabel}`,
    `Сохранено прогонов: ${runQuality.totalRuns || 0}`,
    `Уникальных снимков: ${runQuality.uniqueRuns || 0}`,
    `Уникальность: ${runQuality.uniquePercent || 0}%`,
    `Повторов: ${runQuality.duplicateCount || 0}`,
    `Надежность серии: ${runQuality.reliabilityLabel || "-"} (${runQuality.reliabilityScore || 0}/100)`,
    test.runner === "psi"
      ? `Защита PSI: ${runQuality.mitigation?.label || "-"}`
      : "Среда запуска: локально",
    `Вердикт: ${runQuality.label || "-"}`,
    `Комментарий: ${runQuality.note || "-"}`,
    `Рекомендация: ${runQuality.recommendation || "-"}`
  ];

  if (runQuality.duplicates?.length) {
    lines.push(
      "Карта повторов:",
      ...runQuality.duplicates.map((item) => `- #${item.runIndex} повторяет #${item.duplicateOf}`)
    );
  }

  return lines;
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
      return `Плагин: ${item.sourceName}`;
    case "theme":
      return `Тема: ${item.sourceName}`;
    case "elementor":
      return "Elementor CSS";
    case "wordpress-core":
      return "Ядро WordPress";
    case "uploads":
      return "Медиа";
    case "third-party":
      return `Сторонний: ${item.sourceName}`;
    default:
      return item.sourceName || item.sourceType || "-";
  }
}

function formatAssetPayloadMarkdown(assetPayloadReport = {}) {
  const summary = assetPayloadReport.summary || {};
  const css = assetPayloadReport.css || [];
  const js = assetPayloadReport.js || [];
  const media = assetPayloadReport.media || [];
  const fonts = assetPayloadReport.fonts || [];
  const other = assetPayloadReport.other || [];

  if (!summary.assetCount) {
    return [
      "## Инвентарь ресурсов",
      "",
      "Полные данные сетевой загрузки не найдены."
    ];
  }

  const assetLine = (item, index) => {
    const flags = [
      item.renderBlockingReports ? `блокирует ${item.renderBlockingReports}/${item.totalReports}` : "",
      item.unusedBytes ? `лишнее ${formatBytes(item.unusedBytes)}` : ""
    ].filter(Boolean).join(", ");

    const recommendation = item.recommendation?.label
      ? ` / рекомендация: ${item.recommendation.label}${item.recommendation.risk?.label ? ` / риск: ${item.recommendation.risk.label}` : ""}`
      : "";

    return `${index + 1}. ${item.url} - ${formatBytes(item.transferBytes)} передача / ${formatBytes(item.resourceBytes)} исходный / ${formatSourceLabel(item)}${flags ? ` / ${flags}` : ""}${recommendation}`;
  };

  const sectionLines = (title, bucket = {}, items = []) => [
    `### ${title}`,
    `${items.length} файлов / ${formatBytes(bucket.transferBytes)} передача / ${formatBytes(bucket.resourceBytes)} исходный`,
    ...items.map(assetLine),
    ""
  ];

  return [
    "## Инвентарь ресурсов",
    "",
    `Отчетов проанализировано: ${summary.reportCount}`,
    `Все ресурсы: ${summary.assetCount} файлов / ${formatBytes(summary.totalTransferBytes)} передача / ${formatBytes(summary.totalResourceBytes)} исходный`,
    `JS: ${summary.js?.count || 0} файлов / ${formatBytes(summary.js?.transferBytes)} передача / ${summary.js?.renderBlockingCount || 0} блокируют`,
    `CSS: ${summary.css?.count || 0} файлов / ${formatBytes(summary.css?.transferBytes)} передача / ${summary.css?.renderBlockingCount || 0} блокируют`,
    `Медиа: ${summary.media?.count || 0} файлов / ${formatBytes(summary.media?.transferBytes)} передача`,
    `Шрифты: ${summary.font?.count || 0} файлов / ${formatBytes(summary.font?.transferBytes)} передача`,
    `Прочее: ${summary.other?.count || 0} файлов / ${formatBytes(summary.other?.transferBytes)} передача`,
    `Известный лишний CSS/JS: ${formatBytes(summary.totalUnusedBytes)}`,
    `Сторонние ресурсы: ${formatBytes(summary.totalThirdPartyBytes || 0)}`,
    "",
    ...sectionLines("JS-скрипты", summary.js, js),
    ...sectionLines("CSS-стили", summary.css, css),
    ...sectionLines("Медиа", summary.media, media),
    ...sectionLines("Шрифты", summary.font, fonts),
    ...sectionLines("Прочее", summary.other, other)
  ];
}

function flattenAssetPayloadReport(assetPayloadReport = {}) {
  return [
    ...(assetPayloadReport.js || []),
    ...(assetPayloadReport.css || []),
    ...(assetPayloadReport.media || []),
    ...(assetPayloadReport.fonts || []),
    ...(assetPayloadReport.other || [])
  ];
}

function buildAssetJsonExport(testId) {
  const details = buildTestResponse(testId);
  if (!details) {
    return null;
  }

  const assetPayloadReport = details.assetPayloadReport || {};
  return {
    test: {
      id: details.test.id,
      url: details.test.url,
      device: details.test.device,
      runner: details.test.runner,
      runnerLabel: details.test.runnerLabel,
      createdAt: details.test.createdAt,
      completedAt: details.test.completedAt
    },
    summary: assetPayloadReport.summary || {},
    actions: assetPayloadReport.actions || [],
    assets: flattenAssetPayloadReport(assetPayloadReport)
  };
}

function csvValue(value) {
  if (value == null) {
    return "";
  }

  const text = String(value);
  if (!/[",\n\r]/.test(text)) {
    return text;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

function buildAssetCsvExport(testId) {
  const payload = buildAssetJsonExport(testId);
  if (!payload) {
    return null;
  }

  const headers = [
    "type",
    "file",
    "url",
    "source_type",
    "source",
    "transfer_bytes",
    "raw_bytes",
    "unused_bytes",
    "unused_percent",
    "blocking_ms",
    "blocking_reports",
    "priority",
    "seen_reports",
    "total_reports",
    "start_ms",
    "end_ms",
    "recommendation",
    "risk",
    "risk_detail"
  ];

  const rows = payload.assets.map((asset) => [
    asset.type,
    asset.fileName,
    asset.url,
    asset.sourceType,
    asset.sourceName,
    asset.transferBytes,
    asset.resourceBytes,
    asset.unusedBytes,
    asset.unusedPercent,
    asset.renderBlockingMs,
    asset.renderBlockingReports,
    asset.priority,
    asset.reportsSeen,
    asset.totalReports,
    asset.firstRequestTimeMs,
    asset.lastEndTimeMs,
    asset.recommendation?.label,
    asset.recommendation?.risk?.label,
    asset.recommendation?.risk?.detail
  ]);

  return [
    headers.join(","),
    ...rows.map((row) => row.map(csvValue).join(","))
  ].join("\n");
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
    `Надежность сравнения: ${details.comparisonQuality?.label || "-"} (${details.comparisonQuality?.score || 0}/100)`,
    `Комментарий к сравнению: ${details.comparisonQuality?.summary || "-"}`,
    "",
    "## Метрики",
    "| Метрика | Медиана | Мин | Макс | Разброс |",
    "|---|---:|---:|---:|---:|",
    ...metrics.map((metric) => {
      const stats = details.metricStats[metric] || {};
      return `| ${metricLabels[metric]} | ${formatMarkdownMetric(metric, stats.median)} | ${formatMarkdownMetric(metric, stats.min)} | ${formatMarkdownMetric(metric, stats.max)} | ${formatMarkdownMetric(metric, stats.spread)} |`;
    }),
    "",
    ...formatRunQualityMarkdown(details.runQuality, details.test),
    "",
    ...formatAssetActionPlanMarkdown(details.assetPayloadReport),
    "",
    ...formatOptimizationMarkdown(details.optimizationReport),
    "",
    ...formatAssetPayloadMarkdown(details.assetPayloadReport),
    "",
    "## Приоритетные рекомендации",
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
  buildMarkdownReport,
  buildAssetJsonExport,
  buildAssetCsvExport
};
