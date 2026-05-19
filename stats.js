const fs = require("fs");
const runtimePaths = require("./runtime-paths");

const METRICS = ["score", "fcp", "lcp", "si", "tbt", "cls", "ttfb"];

function toNumber(value, digits = 3) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }

  return Number(value.toFixed(digits));
}

function unwrapLhr(reportLike) {
  if (reportLike?.lighthouseResult) {
    return reportLike.lighthouseResult;
  }

  return reportLike || {};
}

function median(values) {
  if (!values.length) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return toNumber((sorted[middle - 1] + sorted[middle]) / 2);
  }

  return toNumber(sorted[middle]);
}

function metricSeries(runs, key) {
  return runs
    .map((run) => run[key])
    .filter((value) => typeof value === "number" && !Number.isNaN(value));
}

function seriesStats(values) {
  if (!values.length) {
    return {
      median: null,
      min: null,
      max: null,
      spread: null
    };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);

  return {
    median: median(values),
    min: toNumber(min),
    max: toNumber(max),
    spread: toNumber(max - min)
  };
}

function computeMetricStats(runs) {
  return METRICS.reduce((acc, metric) => {
    acc[metric] = seriesStats(metricSeries(runs, metric));
    return acc;
  }, {});
}

function extractMetrics(reportLike) {
  const lhr = unwrapLhr(reportLike);
  const audits = lhr.audits || {};
  const performanceScore = lhr.categories?.performance?.score;

  return {
    score: typeof performanceScore === "number" ? toNumber(performanceScore * 100, 2) : null,
    fcp: toNumber(audits["first-contentful-paint"]?.numericValue),
    lcp: toNumber(audits["largest-contentful-paint"]?.numericValue),
    si: toNumber(audits["speed-index"]?.numericValue),
    tbt: toNumber(audits["total-blocking-time"]?.numericValue),
    cls: toNumber(audits["cumulative-layout-shift"]?.numericValue, 4),
    ttfb: toNumber(audits["server-response-time"]?.numericValue)
  };
}

function metricsFromTest(test, fallbackStats = {}) {
  return {
    score: test.median_score ?? fallbackStats.score?.median ?? null,
    fcp: test.median_fcp ?? fallbackStats.fcp?.median ?? null,
    lcp: test.median_lcp ?? fallbackStats.lcp?.median ?? null,
    si: test.median_si ?? fallbackStats.si?.median ?? null,
    tbt: test.median_tbt ?? fallbackStats.tbt?.median ?? null,
    cls: test.median_cls ?? fallbackStats.cls?.median ?? null,
    ttfb: test.median_ttfb ?? fallbackStats.ttfb?.median ?? null
  };
}

function compareTests(currentMetrics, previousMetrics) {
  if (!previousMetrics) {
    return {
      hasPrevious: false,
      verdict: "No previous test",
      metrics: {}
    };
  }

  const diff = {
    score: currentMetrics.score != null && previousMetrics.score != null
      ? toNumber(currentMetrics.score - previousMetrics.score, 2)
      : null,
    fcp: currentMetrics.fcp != null && previousMetrics.fcp != null
      ? toNumber(currentMetrics.fcp - previousMetrics.fcp)
      : null,
    lcp: currentMetrics.lcp != null && previousMetrics.lcp != null
      ? toNumber(currentMetrics.lcp - previousMetrics.lcp)
      : null,
    si: currentMetrics.si != null && previousMetrics.si != null
      ? toNumber(currentMetrics.si - previousMetrics.si)
      : null,
    tbt: currentMetrics.tbt != null && previousMetrics.tbt != null
      ? toNumber(currentMetrics.tbt - previousMetrics.tbt)
      : null,
    cls: currentMetrics.cls != null && previousMetrics.cls != null
      ? toNumber(currentMetrics.cls - previousMetrics.cls, 4)
      : null,
    ttfb: currentMetrics.ttfb != null && previousMetrics.ttfb != null
      ? toNumber(currentMetrics.ttfb - previousMetrics.ttfb)
      : null
  };

  const scoreImproved = diff.score != null && diff.score >= 3;
  const scoreWorse = diff.score != null && diff.score <= -3;
  const lcpWorse = diff.lcp != null && diff.lcp >= 300;
  const lcpNotWorse = diff.lcp == null || diff.lcp <= 0;

  let verdict = "NoChange";
  if (scoreImproved && lcpNotWorse) {
    verdict = "Improved";
  } else if (scoreWorse || lcpWorse) {
    verdict = "Worse";
  }

  return {
    hasPrevious: true,
    verdict,
    metrics: Object.fromEntries(
      METRICS.map((metric) => [
        metric,
        {
          previous: previousMetrics[metric] ?? null,
          current: currentMetrics[metric] ?? null,
          diff: diff[metric]
        }
      ])
    )
  };
}

function selectRepresentativeRun(runs, medianScore) {
  if (!runs.length) {
    return null;
  }

  if (medianScore == null) {
    return runs[0];
  }

  return [...runs].sort((left, right) => {
    const leftDistance = Math.abs((left.score ?? 0) - medianScore);
    const rightDistance = Math.abs((right.score ?? 0) - medianScore);

    if (leftDistance !== rightDistance) {
      return leftDistance - rightDistance;
    }

    return (left.run_index ?? left.runIndex ?? 0) - (right.run_index ?? right.runIndex ?? 0);
  })[0];
}

function truncate(text, maxLength = 240) {
  if (!text || text.length <= maxLength) {
    return text || "";
  }

  return `${text.slice(0, maxLength - 3).trim()}...`;
}

const DIAGNOSTIC_FIXES = {
  "render-blocking-resources": "Критичный CSS оставить inline, остальной CSS грузить позже. JS поставить defer/async или убрать с первого экрана.",
  "render-blocking-insight": "Критичный CSS оставить inline, остальной CSS грузить позже. JQuery и лишний JS перенести в defer или убрать с первого экрана.",
  "unused-css-rules": "Удалить неиспользуемый CSS, разбить стили по страницам, отключить лишние стили плагинов.",
  "unused-javascript": "Убрать лишние скрипты, разделить JS на чанки, отложить виджеты/аналитику до взаимодействия.",
  "largest-contentful-paint-element": "Оптимизировать LCP-элемент: preload главной картинки/шрифта, убрать lazy для hero, уменьшить размер изображения.",
  "uses-optimized-images": "Сжать изображения и отдавать правильный размер под экран.",
  "image-delivery-insight": "Сжать перечисленные изображения, заменить тяжелые PNG/JPEG на WebP/AVIF и не отдавать картинки крупнее реального размера.",
  "uses-responsive-images": "Добавить srcset/sizes и не отдавать desktop-картинки на mobile.",
  "offscreen-images": "Для изображений ниже первого экрана включить loading=\"lazy\".",
  "modern-image-formats": "Отдавать WebP/AVIF вместо PNG/JPEG.",
  "total-byte-weight": "Срезать общий вес страницы: картинки, CSS, JS, сторонние виджеты.",
  "mainthread-work-breakdown": "Сократить JS на главном потоке: меньше page builder скриптов, виджетов, тяжелых обработчиков.",
  "bootup-time": "Уменьшить время выполнения JS: убрать лишние библиотеки, отложить сторонние скрипты.",
  "third-party-summary": "Отключить или отложить сторонние скрипты: аналитика, карты, чаты, пиксели, embed.",
  "server-response-time": "Ускорить TTFB: кеш HTML, CDN, оптимизация backend/WordPress, меньше тяжелых запросов.",
  "font-display": "Добавить font-display: swap и preload только для реально нужных шрифтов первого экрана.",
  "font-display-insight": "Добавить font-display: swap для перечисленных шрифтов. Если это Font Awesome, заменить иконки на SVG или грузить шрифт позже.",
  "uses-text-compression": "Включить Brotli или gzip на сервере/CDN.",
  "uses-long-cache-ttl": "Добавить долгий cache-control для статических CSS/JS/изображений.",
  "cache-insight": "Настроить cache-control для статических файлов: изображения, шрифты, CSS и JS держать в кеше браузера долго.",
  redirects: "Убрать лишние редиректы, сразу ссылаться на финальный URL.",
  "dom-size": "Упростить DOM: меньше вложенных блоков, секций page builder и скрытых элементов.",
  "layout-shifts": "Задать width/height для медиа, резервировать место под баннеры/шрифты/динамические блоки.",
  "unsized-images": "Проставить width и height у перечисленных img или задать aspect-ratio через CSS.",
  "network-dependency-tree-insight": "Уменьшить цепочку критичных запросов: меньше CSS/JS до первого рендера, preload только реально важных ресурсов.",
  "forced-reflow-insight": "Найти скрипт, который читает размеры DOM после изменений стилей. Обычно виноваты слайдеры, анимации или page builder виджеты.",
  "prioritize-lcp-image": "Добавить fetchpriority=\"high\" и preload для LCP-картинки.",
  "first-contentful-paint": "FCP тормозит из-за блокирующих CSS/JS, шрифтов или тяжелого первого экрана. Сначала править render-blocking и шрифты.",
  "largest-contentful-paint": "LCP слишком поздний. Найти главный элемент первого экрана и ускорить его загрузку: image preload, меньше CSS/JS до рендера.",
  "speed-index": "Контент визуально появляется медленно. Убрать блокирующие ресурсы, тяжелые изображения и лишний JS на старте."
};

const DIAGNOSTIC_PROBLEMS = {
  "image-delivery-insight": "Изображения можно отдать легче. Lighthouse нашел файлы, которые зря добавляют вес странице.",
  "unused-css-rules": "Загружается CSS, который не нужен для первого экрана или вообще не используется.",
  "unused-javascript": "Загружается JS, который не нужен при старте страницы.",
  "render-blocking-insight": "CSS/JS блокируют первый рендер. Пока они не загрузятся, страница не может нормально показаться.",
  "render-blocking-resources": "CSS/JS блокируют первый рендер. Пока они не загрузятся, страница не может нормально показаться.",
  "cache-insight": "Статика плохо кешируется. Повторные заходы снова тянут тяжелые файлы.",
  "uses-long-cache-ttl": "Статика плохо кешируется. Повторные заходы снова тянут тяжелые файлы.",
  "font-display-insight": "Шрифты задерживают отображение текста.",
  "font-display": "Шрифты задерживают отображение текста.",
  "unsized-images": "У картинок нет фиксированных размеров. Из-за этого layout может прыгать при загрузке.",
  "layout-shifts": "Элементы двигаются во время загрузки страницы.",
  "network-dependency-tree-insight": "Слишком длинная цепочка критичных запросов до первого рендера.",
  "forced-reflow-insight": "JavaScript заставляет браузер пересчитывать layout во время работы.",
  "mainthread-work-breakdown": "Слишком много работы на главном потоке браузера.",
  "bootup-time": "JavaScript долго выполняется после загрузки.",
  "third-party-summary": "Сторонние скрипты забирают время загрузки и выполнения.",
  "server-response-time": "Сервер медленно отдает первый ответ.",
  "total-byte-weight": "Страница слишком тяжелая по общему весу.",
  "first-contentful-paint": "Первый видимый контент появляется поздно.",
  "largest-contentful-paint": "Главный контент первого экрана появляется поздно.",
  "speed-index": "Видимая часть страницы наполняется медленно."
};

const AUDIT_TITLE_OVERRIDES = {
  "first-contentful-paint": "Первая отрисовка",
  "largest-contentful-paint": "Главный контент",
  "speed-index": "Скорость наполнения",
  "total-blocking-time": "Блокировка главного потока",
  "cumulative-layout-shift": "Визуальная стабильность",
  "server-response-time": "Ответ сервера",
  "render-blocking-resources": "Блокирующие ресурсы",
  "render-blocking-insight": "Блокирующие ресурсы",
  "unused-css-rules": "Неиспользуемый CSS",
  "unused-javascript": "Неиспользуемый JavaScript",
  "uses-long-cache-ttl": "Кеширование статики",
  "cache-insight": "Кеширование статики",
  "font-display": "Загрузка шрифтов",
  "font-display-insight": "Загрузка шрифтов",
  "uses-text-compression": "Сжатие текста",
  "image-delivery-insight": "Оптимизация изображений",
  "uses-optimized-images": "Оптимизация изображений",
  "uses-responsive-images": "Адаптивные изображения",
  "offscreen-images": "Отложенная загрузка изображений",
  "modern-image-formats": "Современные форматы изображений",
  "largest-contentful-paint-element": "LCP-элемент",
  "lcp-breakdown": "Разбор LCP",
  "network-dependency-tree-insight": "Критическая цепочка запросов",
  "forced-reflow-insight": "Принудительный перерасчет layout",
  "mainthread-work-breakdown": "Нагрузка на главный поток",
  "bootup-time": "Время запуска JavaScript",
  "third-party-summary": "Сторонние скрипты",
  "dom-size": "Размер DOM",
  "layout-shifts": "Сдвиги layout",
  "unsized-images": "Изображения без размеров",
  "prioritize-lcp-image": "Приоритет LCP-изображения",
  redirects: "Редиректы",
  "total-byte-weight": "Общий вес страницы"
};

const EXTRA_AUDIT_TITLE_OVERRIDES = {
  "network-requests": "Сетевые запросы",
  "modern-http-insight": "Современный HTTP"
};

Object.assign(AUDIT_TITLE_OVERRIDES, EXTRA_AUDIT_TITLE_OVERRIDES);

function getAuditTitle(id, fallback) {
  return AUDIT_TITLE_OVERRIDES[id] || fallback || id;
}

function getDiagnosticFix(id) {
  if (id === "lcp-breakdown") {
    return "Разобрать вклад LCP по этапам: TTFB, загрузка ресурса, задержка рендера и CSS/JS до hero-элемента. Дальше чинить самый большой вклад, а не сам LCP вслепую.";
  }

  return DIAGNOSTIC_FIXES[id] || "Открыть raw JSON этого прогона, найти ресурсы в details и убрать, отложить или оптимизировать конкретный файл.";
}

function getDiagnosticProblem(id, fallback) {
  if (id === "lcp-breakdown") {
    return "LCP складывается из нескольких этапов, и основной тормоз может быть не в самой картинке, а в ответе сервера, блокирующих ресурсах или задержке рендера.";
  }

  return DIAGNOSTIC_PROBLEMS[id] || truncate(fallback || "", 170);
}

function extractDetailTargets(details) {
  const items = Array.isArray(details?.items) ? details.items : [];
  return items
    .map((item) => {
      const target = item.url || item.source?.url || item.node?.snippet || item.node?.selector || item.request?.url;
      const wastedMs = typeof item.wastedMs === "number" ? `${Math.round(item.wastedMs)} ms` : "";
      const wastedBytes = typeof item.wastedBytes === "number" ? `${Math.round(item.wastedBytes / 1024)} KiB` : "";
      const totalBytes = typeof item.totalBytes === "number" && !wastedBytes ? `${Math.round(item.totalBytes / 1024)} KiB` : "";
      const meta = [wastedMs, wastedBytes, totalBytes].filter(Boolean).join(", ");

      if (!target) {
        return null;
      }

      return truncate(meta ? `${target} (${meta})` : String(target), 150);
    })
    .filter(Boolean)
    .slice(0, 4);
}

function classifyResource(url, auditId = "") {
  const value = String(url || "").toLowerCase();
  if (/\.(png|jpe?g|webp|avif|gif|svg)(\?|$)/.test(value) || auditId.includes("image")) {
    return "Images";
  }
  if (/\.css(\?|$)/.test(value) || auditId.includes("css") || auditId.includes("render-blocking")) {
    return "CSS";
  }
  if (/\.m?js(\?|$)/.test(value) || auditId.includes("javascript") || auditId.includes("bootup")) {
    return "JS";
  }
  if (/\.(woff2?|ttf|otf)(\?|$)/.test(value) || auditId.includes("font")) {
    return "Fonts";
  }
  if (auditId.includes("cache")) {
    return "Cache";
  }
  if (auditId.includes("server")) {
    return "Server";
  }
  return "Other";
}

function pluginNameFromUrl(url) {
  const match = String(url || "").match(/\/wp-content\/plugins\/([^/]+)/i);
  if (match) {
    return match[1];
  }
  if (String(url || "").includes("/wp-includes/")) {
    return "WordPress core";
  }
  if (String(url || "").includes("/uploads/")) {
    return "Uploads";
  }
  return "";
}

function numberOrZero(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function parseUrl(value) {
  try {
    return new URL(String(value || ""));
  } catch {
    return null;
  }
}

function normalizeAssetUrl(url) {
  const parsed = parseUrl(url);
  if (!parsed) {
    return String(url || "");
  }

  parsed.hash = "";
  return parsed.toString();
}

function resourceUrlFromItem(item = {}) {
  return item.url || item.source?.url || item.request?.url || "";
}

function assetTypeFromNetworkItem(item = {}) {
  const url = String(item.url || "").toLowerCase();
  const resourceType = String(item.resourceType || "").toLowerCase();
  const mimeType = String(item.mimeType || "").toLowerCase();

  if (resourceType === "stylesheet" || mimeType.includes("text/css") || /\.css(?:[?#]|$)/.test(url)) {
    return "css";
  }

  if (resourceType === "script" || mimeType.includes("javascript") || /\.m?js(?:[?#]|$)/.test(url)) {
    return "js";
  }

  return null;
}

function pageOriginFromReport(lhr = {}) {
  const parsed = parseUrl(lhr.finalDisplayedUrl || lhr.finalUrl || lhr.requestedUrl || "");
  return parsed?.origin || "";
}

function classifyAssetSource(url, pageOrigin = "") {
  const parsed = parseUrl(url);
  const pathname = parsed?.pathname || String(url || "");
  const origin = parsed?.origin || "";
  const hostname = parsed?.hostname || "";

  if (parsed && pageOrigin && origin && origin !== pageOrigin) {
    return {
      sourceType: "third-party",
      sourceName: hostname,
      sourceKey: `third-party:${hostname}`
    };
  }

  const pluginMatch = pathname.match(/\/wp-content\/plugins\/([^/]+)/i);
  const themeMatch = pathname.match(/\/wp-content\/themes\/([^/]+)/i);

  if (/\/wp-content\/uploads\/elementor\//i.test(pathname)) {
    return {
      sourceType: "elementor",
      sourceName: "Elementor uploads",
      sourceKey: "elementor:uploads"
    };
  }

  if (pluginMatch) {
    return {
      sourceType: "plugin",
      sourceName: pluginMatch[1],
      sourceKey: `plugin:${pluginMatch[1]}`
    };
  }

  if (themeMatch) {
    return {
      sourceType: "theme",
      sourceName: themeMatch[1],
      sourceKey: `theme:${themeMatch[1]}`
    };
  }

  if (/\/wp-includes\/|\/wp-admin\//i.test(pathname)) {
    return {
      sourceType: "wordpress-core",
      sourceName: "WordPress core",
      sourceKey: "wordpress-core"
    };
  }

  if (/\/wp-content\/uploads\//i.test(pathname)) {
    return {
      sourceType: "uploads",
      sourceName: "Uploads",
      sourceKey: "uploads"
    };
  }

  return {
    sourceType: "first-party",
    sourceName: hostname || "First-party",
    sourceKey: `first-party:${hostname || "site"}`
  };
}

function assetFileName(url) {
  const parsed = parseUrl(url);
  const pathname = parsed?.pathname || String(url || "");
  const fileName = pathname.split("/").filter(Boolean).pop() || parsed?.hostname || url || "-";

  try {
    return decodeURIComponent(fileName);
  } catch {
    return fileName;
  }
}

function collectAuditResourceMetrics(audits = {}, auditIds = []) {
  const metrics = new Map();

  auditIds.forEach((auditId) => {
    const items = Array.isArray(audits[auditId]?.details?.items)
      ? audits[auditId].details.items
      : [];

    items.forEach((item) => {
      const url = resourceUrlFromItem(item);
      if (!url) {
        return;
      }

      const key = normalizeAssetUrl(url);
      const existing = metrics.get(key) || {
        occurrences: 0,
        wastedMs: 0,
        wastedBytes: 0,
        totalBytes: 0,
        wastedPercent: 0
      };

      existing.occurrences += 1;
      existing.wastedMs = Math.max(existing.wastedMs, numberOrZero(item.wastedMs));
      existing.wastedBytes = Math.max(existing.wastedBytes, numberOrZero(item.wastedBytes));
      existing.totalBytes = Math.max(existing.totalBytes, numberOrZero(item.totalBytes));
      existing.wastedPercent = Math.max(existing.wastedPercent, numberOrZero(item.wastedPercent));
      metrics.set(key, existing);
    });
  });

  return metrics;
}

function emptyAssetPayloadReport(reportCount = 0) {
  return {
    summary: {
      reportCount,
      assetCount: 0,
      totalTransferBytes: 0,
      totalResourceBytes: 0,
      totalUnusedBytes: 0,
      renderBlockingCount: 0,
      css: {
        count: 0,
        transferBytes: 0,
        resourceBytes: 0,
        unusedBytes: 0,
        renderBlockingCount: 0,
        thirdPartyBytes: 0
      },
      js: {
        count: 0,
        transferBytes: 0,
        resourceBytes: 0,
        unusedBytes: 0,
        renderBlockingCount: 0,
        thirdPartyBytes: 0
      }
    },
    groups: [],
    css: [],
    js: []
  };
}

function roundByteValue(value) {
  return Math.max(0, Math.round(numberOrZero(value)));
}

function finalizeAssetRecord(record, totalReports) {
  const sampleCount = Math.max(1, record.sampleCount);
  const priority = [...record.priorities.entries()]
    .sort((left, right) => right[1] - left[1])[0]?.[0] || null;

  return {
    url: record.url,
    fileName: assetFileName(record.url),
    type: record.type,
    sourceType: record.sourceType,
    sourceName: record.sourceName,
    sourceKey: record.sourceKey,
    occurrences: record.occurrences,
    reportsSeen: record.reports.size,
    totalReports,
    transferBytes: roundByteValue(record.maxTransferBytes),
    resourceBytes: roundByteValue(record.maxResourceBytes),
    avgTransferBytes: roundByteValue(record.transferBytesTotal / sampleCount),
    avgResourceBytes: roundByteValue(record.resourceBytesTotal / sampleCount),
    unusedBytes: roundByteValue(record.unusedBytes),
    unusedPercent: toNumber(record.unusedPercent, 1) || 0,
    renderBlockingMs: roundByteValue(record.renderBlockingMs),
    renderBlockingReports: record.renderBlockingReports,
    firstRequestTimeMs: record.firstRequestTimeMs == null ? null : toNumber(record.firstRequestTimeMs, 1),
    lastEndTimeMs: record.lastEndTimeMs == null ? null : toNumber(record.lastEndTimeMs, 1),
    priority
  };
}

function buildAssetGroups(assets = []) {
  const groups = new Map();

  assets.forEach((asset) => {
    const group = groups.get(asset.sourceKey) || {
      sourceKey: asset.sourceKey,
      sourceType: asset.sourceType,
      sourceName: asset.sourceName,
      assetCount: 0,
      cssCount: 0,
      jsCount: 0,
      cssTransferBytes: 0,
      jsTransferBytes: 0,
      totalTransferBytes: 0,
      totalResourceBytes: 0,
      unusedBytes: 0,
      renderBlockingCount: 0
    };

    group.assetCount += 1;
    group.cssCount += asset.type === "css" ? 1 : 0;
    group.jsCount += asset.type === "js" ? 1 : 0;
    group.cssTransferBytes += asset.type === "css" ? asset.transferBytes : 0;
    group.jsTransferBytes += asset.type === "js" ? asset.transferBytes : 0;
    group.totalTransferBytes += asset.transferBytes;
    group.totalResourceBytes += asset.resourceBytes;
    group.unusedBytes += asset.unusedBytes;
    group.renderBlockingCount += asset.renderBlockingReports > 0 ? 1 : 0;
    groups.set(asset.sourceKey, group);
  });

  return [...groups.values()]
    .map((group) => ({
      ...group,
      cssTransferBytes: roundByteValue(group.cssTransferBytes),
      jsTransferBytes: roundByteValue(group.jsTransferBytes),
      totalTransferBytes: roundByteValue(group.totalTransferBytes),
      totalResourceBytes: roundByteValue(group.totalResourceBytes),
      unusedBytes: roundByteValue(group.unusedBytes)
    }))
    .sort((left, right) =>
      (right.totalTransferBytes - left.totalTransferBytes) ||
      (right.renderBlockingCount - left.renderBlockingCount) ||
      String(left.sourceName).localeCompare(String(right.sourceName))
    )
    .slice(0, 24);
}

function summarizeAssets(assets = [], reportCount = 0) {
  const report = emptyAssetPayloadReport(reportCount);

  assets.forEach((asset) => {
    const bucket = report.summary[asset.type];
    bucket.count += 1;
    bucket.transferBytes += asset.transferBytes;
    bucket.resourceBytes += asset.resourceBytes;
    bucket.unusedBytes += asset.unusedBytes;
    bucket.renderBlockingCount += asset.renderBlockingReports > 0 ? 1 : 0;
    bucket.thirdPartyBytes += asset.sourceType === "third-party" ? asset.transferBytes : 0;
  });

  ["css", "js"].forEach((type) => {
    report.summary[type].transferBytes = roundByteValue(report.summary[type].transferBytes);
    report.summary[type].resourceBytes = roundByteValue(report.summary[type].resourceBytes);
    report.summary[type].unusedBytes = roundByteValue(report.summary[type].unusedBytes);
    report.summary[type].thirdPartyBytes = roundByteValue(report.summary[type].thirdPartyBytes);
  });

  report.summary.assetCount = assets.length;
  report.summary.totalTransferBytes = roundByteValue(report.summary.css.transferBytes + report.summary.js.transferBytes);
  report.summary.totalResourceBytes = roundByteValue(report.summary.css.resourceBytes + report.summary.js.resourceBytes);
  report.summary.totalUnusedBytes = roundByteValue(report.summary.css.unusedBytes + report.summary.js.unusedBytes);
  report.summary.renderBlockingCount = report.summary.css.renderBlockingCount + report.summary.js.renderBlockingCount;
  report.groups = buildAssetGroups(assets);
  report.css = assets.filter((asset) => asset.type === "css").slice(0, 50);
  report.js = assets.filter((asset) => asset.type === "js").slice(0, 50);

  return report;
}

function extractAssetPayloadFromReports(reportPaths = []) {
  const reports = reportPaths
    .map((reportPath) => readReport(reportPath))
    .filter(Boolean);

  if (!reports.length) {
    return emptyAssetPayloadReport(0);
  }

  const assets = new Map();

  reports.forEach((lhr, reportIndex) => {
    const audits = lhr.audits || {};
    const pageOrigin = pageOriginFromReport(lhr);
    const networkItems = Array.isArray(audits["network-requests"]?.details?.items)
      ? audits["network-requests"].details.items
      : [];
    const renderBlockingMetrics = collectAuditResourceMetrics(audits, [
      "render-blocking-resources",
      "render-blocking-insight",
      "network-dependency-tree-insight"
    ]);
    const unusedMetrics = collectAuditResourceMetrics(audits, [
      "unused-css-rules",
      "unused-javascript"
    ]);
    const seenInReport = new Set();

    networkItems.forEach((item) => {
      const type = assetTypeFromNetworkItem(item);
      const url = item.url;
      if (!type || !url) {
        return;
      }

      const normalizedUrl = normalizeAssetUrl(url);
      const key = `${type}:${normalizedUrl}`;
      const source = classifyAssetSource(normalizedUrl, pageOrigin);
      const renderBlocking = renderBlockingMetrics.get(normalizedUrl);
      const unused = unusedMetrics.get(normalizedUrl);
      const transferBytes = numberOrZero(item.transferSize);
      const resourceBytes = numberOrZero(item.resourceSize);
      const startTime = typeof item.networkRequestTime === "number" ? item.networkRequestTime : null;
      const endTime = typeof item.networkEndTime === "number" ? item.networkEndTime : null;
      const record = assets.get(key) || {
        url: normalizedUrl,
        type,
        sourceType: source.sourceType,
        sourceName: source.sourceName,
        sourceKey: source.sourceKey,
        reports: new Set(),
        occurrences: 0,
        sampleCount: 0,
        transferBytesTotal: 0,
        resourceBytesTotal: 0,
        maxTransferBytes: 0,
        maxResourceBytes: 0,
        unusedBytes: 0,
        unusedPercent: 0,
        renderBlockingMs: 0,
        renderBlockingReports: 0,
        firstRequestTimeMs: null,
        lastEndTimeMs: null,
        priorities: new Map()
      };

      record.occurrences += 1;
      record.sampleCount += 1;
      record.transferBytesTotal += transferBytes;
      record.resourceBytesTotal += resourceBytes;
      record.maxTransferBytes = Math.max(record.maxTransferBytes, transferBytes);
      record.maxResourceBytes = Math.max(record.maxResourceBytes, resourceBytes);
      record.unusedBytes = Math.max(record.unusedBytes, unused?.wastedBytes || 0);
      record.unusedPercent = Math.max(record.unusedPercent, unused?.wastedPercent || 0);
      record.renderBlockingMs = Math.max(record.renderBlockingMs, renderBlocking?.wastedMs || 0);

      if (renderBlocking && !seenInReport.has(`${key}:render-blocking`)) {
        record.renderBlockingReports += 1;
        seenInReport.add(`${key}:render-blocking`);
      }

      record.reports.add(reportIndex);
      if (startTime != null) {
        record.firstRequestTimeMs = record.firstRequestTimeMs == null
          ? startTime
          : Math.min(record.firstRequestTimeMs, startTime);
      }
      if (endTime != null) {
        record.lastEndTimeMs = record.lastEndTimeMs == null
          ? endTime
          : Math.max(record.lastEndTimeMs, endTime);
      }
      if (item.priority) {
        record.priorities.set(item.priority, (record.priorities.get(item.priority) || 0) + 1);
      }

      seenInReport.add(key);
      assets.set(key, record);
    });
  });

  const finalizedAssets = [...assets.values()]
    .map((record) => finalizeAssetRecord(record, reports.length))
    .sort((left, right) =>
      (right.transferBytes - left.transferBytes) ||
      (right.renderBlockingReports - left.renderBlockingReports) ||
      (right.unusedBytes - left.unusedBytes) ||
      String(left.fileName).localeCompare(String(right.fileName))
    );

  return summarizeAssets(finalizedAssets, reports.length);
}

function collectResourceOffenders(auditsOrSeries) {
  const auditSets = Array.isArray(auditsOrSeries)
    ? auditsOrSeries.filter(Boolean)
    : [auditsOrSeries || {}];
  const offenders = new Map();

  auditSets.forEach((audits) => {
    const seenUrls = new Set();

    Object.entries(audits).forEach(([auditId, audit]) => {
      const items = Array.isArray(audit?.details?.items) ? audit.details.items : [];
      items.forEach((item) => {
        const url = item.url || item.source?.url || item.request?.url;
        if (!url) {
          return;
        }

        const existing = offenders.get(url) || {
          url,
          type: classifyResource(url, auditId),
          plugin: pluginNameFromUrl(url),
          wastedMs: 0,
          wastedBytes: 0,
          totalBytes: 0,
          occurrences: 0,
          audits: new Set()
        };

        if (!seenUrls.has(url)) {
          existing.occurrences += 1;
          seenUrls.add(url);
        }
        if (typeof item.wastedMs === "number") {
          existing.wastedMs = Math.max(existing.wastedMs, item.wastedMs);
        }
        if (typeof item.wastedBytes === "number") {
          existing.wastedBytes = Math.max(existing.wastedBytes, item.wastedBytes);
        }
        if (typeof item.totalBytes === "number" || typeof item.transferSize === "number") {
          existing.totalBytes = Math.max(existing.totalBytes, item.totalBytes || item.transferSize || 0);
        }
        existing.audits.add(getAuditTitle(auditId, audit.title || auditId));
        offenders.set(url, existing);
      });
    });
  });

  return [...offenders.values()]
    .map((item) => ({
      ...item,
      wastedMs: item.wastedMs ? toNumber(item.wastedMs, 0) : null,
      wastedBytes: item.wastedBytes ? toNumber(item.wastedBytes, 0) : null,
      totalBytes: item.totalBytes ? toNumber(item.totalBytes, 0) : null,
      occurrences: item.occurrences || 0,
      totalReports: auditSets.length,
      audits: [...item.audits].slice(0, 3)
    }))
    .sort((left, right) =>
      ((right.occurrences || 0) - (left.occurrences || 0)) ||
      ((right.wastedMs || 0) - (left.wastedMs || 0)) ||
      ((right.wastedBytes || 0) - (left.wastedBytes || 0)) ||
      ((right.totalBytes || 0) - (left.totalBytes || 0))
    )
    .slice(0, 20);
}

function readReport(reportPath) {
  if (!reportPath) {
    return null;
  }

  const absolutePath = runtimePaths.resolvePublicAssetPath(reportPath);
  if (!fs.existsSync(absolutePath)) {
    return null;
  }

  const raw = fs.readFileSync(absolutePath, "utf8");
  return unwrapLhr(JSON.parse(raw));
}

function extractReportContext(reportPath) {
  const lhr = readReport(reportPath);
  if (!lhr) {
    return {};
  }

  return {
    lighthouseVersion: lhr.lighthouseVersion || null,
    fetchTime: lhr.fetchTime || null,
    finalUrl: lhr.finalDisplayedUrl || lhr.finalUrl || null,
    userAgent: lhr.userAgent || null,
    formFactor: lhr.configSettings?.formFactor || null,
    throttlingMethod: lhr.configSettings?.throttlingMethod || null,
    screenEmulation: lhr.configSettings?.screenEmulation || null,
    environment: lhr.environment || null
  };
}

function extractResourceOffendersFromReports(reportPaths = []) {
  const auditSets = reportPaths
    .map((reportPath) => readReport(reportPath)?.audits || null)
    .filter(Boolean);

  if (!auditSets.length) {
    return [];
  }

  return collectResourceOffenders(auditSets);
}

function extractResourceOffendersFromReport(reportPath) {
  return extractResourceOffendersFromReports([reportPath]);
}

function extractDiagnosticsFromReports(reportPaths = []) {
  const auditSets = reportPaths
    .map((reportPath) => readReport(reportPath)?.audits || null)
    .filter(Boolean);

  if (!auditSets.length) {
    return [];
  }
  const diagnostics = new Map();

  auditSets.forEach((audits) => {
    Object.entries(audits)
      .filter(([, audit]) => typeof audit?.score === "number" && audit.score < 1)
      .forEach(([id, audit]) => {
        const existing = diagnostics.get(id) || {
          id,
          title: getAuditTitle(id, audit.title),
          displayValue: audit.displayValue || null,
          description: getDiagnosticProblem(id, audit.description),
          fix: getDiagnosticFix(id),
          targets: new Set(),
          occurrences: 0,
          scoreTotal: 0,
          scoreCount: 0,
          bestScore: Number.POSITIVE_INFINITY
        };

        existing.occurrences += 1;
        if (typeof audit.score === "number") {
          existing.scoreTotal += audit.score;
          existing.scoreCount += 1;

          if (audit.score <= existing.bestScore) {
            existing.bestScore = audit.score;
            if (audit.displayValue) {
              existing.displayValue = audit.displayValue;
            }
          }
        }
        if (!existing.displayValue && audit.displayValue) {
          existing.displayValue = audit.displayValue;
        }

        extractDetailTargets(audit.details).forEach((target) => existing.targets.add(target));
        diagnostics.set(id, existing);
      });
  });

  return [...diagnostics.values()]
    .map((item) => ({
      id: item.id,
      title: item.title,
      displayValue: item.displayValue || null,
      description: item.description,
      fix: item.fix,
      targets: [...item.targets].slice(0, 4),
      score: item.scoreCount ? toNumber(item.scoreTotal / item.scoreCount, 2) : null,
      occurrences: item.occurrences,
      totalReports: auditSets.length
    }))
    .sort((left, right) =>
      ((right.occurrences || 0) - (left.occurrences || 0)) ||
      ((left.score ?? 1) - (right.score ?? 1)) ||
      String(left.title || "").localeCompare(String(right.title || ""))
    )
    .slice(0, 12);
}

function extractDiagnosticsFromReport(reportPath) {
  return extractDiagnosticsFromReports([reportPath]);
}

module.exports = {
  METRICS,
  computeMetricStats,
  extractMetrics,
  metricsFromTest,
  compareTests,
  selectRepresentativeRun,
  extractDiagnosticsFromReports,
  extractDiagnosticsFromReport,
  extractReportContext,
  extractAssetPayloadFromReports,
  extractResourceOffendersFromReports,
  extractResourceOffendersFromReport
};
