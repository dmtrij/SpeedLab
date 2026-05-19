const fs = require("fs");
const runtimePaths = require("./runtime-paths");

const CATEGORY_LABELS = {
  js: "JavaScript",
  css: "CSS",
  images: "Images",
  fonts: "Fonts",
  thirdParty: "Third-party",
  cache: "Cache",
  server: "Server"
};

const WORK_ITEM_DEFINITIONS = {
  "render-blocking-css": {
    category: "css",
    title: "Remove render-blocking CSS from first paint",
    problem: "CSS blocks first render and can delay FCP/LCP.",
    solution: "Inline critical CSS, load non-critical CSS later, and split plugin/page styles.",
    risk: "medium",
    confidence: "high",
    basePriority: 360,
    impacts: { renderBlockingMs: 1, lcpMs: 0.55, fcpMs: 0.65 }
  },
  "render-blocking-js": {
    category: "js",
    title: "Defer render-blocking JavaScript",
    problem: "JavaScript blocks first render or extends the critical request chain.",
    solution: "Move safe scripts to defer/async or load them after first interaction.",
    risk: "medium",
    confidence: "high",
    basePriority: 340,
    impacts: { renderBlockingMs: 1, lcpMs: 0.45, tbtMs: 0.35, fcpMs: 0.5 }
  },
  "delay-third-party-js": {
    category: "thirdParty",
    title: "Delay third-party scripts",
    problem: "Third-party scripts compete for network and main-thread time.",
    solution: "Load analytics, pixels, chats, maps, and embeds after consent, interaction, or page idle.",
    risk: "medium",
    confidence: "medium",
    basePriority: 320,
    impacts: { tbtMs: 0.8, lcpMs: 0.25 }
  },
  "reduce-js-execution": {
    category: "js",
    title: "Reduce JavaScript execution cost",
    problem: "Scripts spend too much time on bootup or main-thread work.",
    solution: "Remove unused libraries, split bundles, lazy-load widgets, and reduce page-builder scripts.",
    risk: "high",
    confidence: "medium",
    basePriority: 300,
    impacts: { tbtMs: 1, lcpMs: 0.2 }
  },
  "remove-unused-js": {
    category: "js",
    title: "Remove or split unused JavaScript",
    problem: "JavaScript is downloaded but unused during page load.",
    solution: "Remove unused scripts, split bundles by route, or lazy-load features only where needed.",
    risk: "medium",
    confidence: "high",
    basePriority: 240,
    impacts: { tbtMs: 0.35 }
  },
  "remove-unused-css": {
    category: "css",
    title: "Remove or split unused CSS",
    problem: "CSS is downloaded but unused for the tested page.",
    solution: "Split CSS per page/component and disable unused plugin styles.",
    risk: "medium",
    confidence: "high",
    basePriority: 220,
    impacts: { lcpMs: 0.15, fcpMs: 0.2 }
  },
  "optimize-lcp-image": {
    category: "images",
    title: "Optimize the LCP image",
    problem: "The largest visible element depends on an image or media resource.",
    solution: "Preload/fetchpriority the LCP image, avoid lazy loading it, resize it, and serve AVIF/WebP.",
    risk: "low",
    confidence: "high",
    basePriority: 380,
    impacts: { lcpMs: 1 }
  },
  "optimize-images": {
    category: "images",
    title: "Compress and resize heavy images",
    problem: "Images add avoidable transfer weight.",
    solution: "Resize to display dimensions, convert to AVIF/WebP, and lazy-load below-the-fold images.",
    risk: "low",
    confidence: "high",
    basePriority: 210,
    impacts: { lcpMs: 0.25 }
  },
  "fix-image-layout": {
    category: "images",
    title: "Reserve image dimensions",
    problem: "Images without fixed dimensions can cause layout shifts.",
    solution: "Add width/height attributes or CSS aspect-ratio for listed images.",
    risk: "low",
    confidence: "high",
    basePriority: 180,
    impacts: { cls: 1 }
  },
  "optimize-font-loading": {
    category: "fonts",
    title: "Optimize font loading",
    problem: "Fonts delay text rendering or add unnecessary critical requests.",
    solution: "Use font-display: swap, preload only critical fonts, subset families, and replace icon fonts with SVG.",
    risk: "low",
    confidence: "high",
    basePriority: 190,
    impacts: { fcpMs: 0.4, lcpMs: 0.2 }
  },
  "improve-static-cache": {
    category: "cache",
    title: "Improve static asset caching",
    problem: "Static assets are re-downloaded instead of reused from browser cache.",
    solution: "Set long Cache-Control for versioned JS, CSS, images, and fonts.",
    risk: "low",
    confidence: "medium",
    basePriority: 130,
    impacts: {}
  },
  "reduce-server-response": {
    category: "server",
    title: "Reduce server response time",
    problem: "The first server response delays everything that follows.",
    solution: "Cache HTML, use CDN/page cache, reduce backend work, and inspect slow plugins/API calls.",
    risk: "medium",
    confidence: "medium",
    basePriority: 330,
    impacts: { lcpMs: 0.7, fcpMs: 0.7 }
  }
};

const AUDIT_RULES = {
  "render-blocking-resources": (item) => item.type === "css" ? "render-blocking-css" : "render-blocking-js",
  "render-blocking-insight": (item) => item.type === "css" ? "render-blocking-css" : "render-blocking-js",
  "network-dependency-tree-insight": (item) => item.type === "css" ? "render-blocking-css" : "render-blocking-js",
  "unused-javascript": () => "remove-unused-js",
  "bootup-time": (item) => item.thirdParty ? "delay-third-party-js" : "reduce-js-execution",
  "mainthread-work-breakdown": () => "reduce-js-execution",
  "third-party-summary": () => "delay-third-party-js",
  "unused-css-rules": () => "remove-unused-css",
  "largest-contentful-paint-element": () => "optimize-lcp-image",
  "prioritize-lcp-image": () => "optimize-lcp-image",
  "lcp-breakdown": () => "optimize-lcp-image",
  "uses-optimized-images": () => "optimize-images",
  "image-delivery-insight": () => "optimize-images",
  "uses-responsive-images": () => "optimize-images",
  "modern-image-formats": () => "optimize-images",
  "offscreen-images": () => "optimize-images",
  "unsized-images": () => "fix-image-layout",
  "font-display": () => "optimize-font-loading",
  "font-display-insight": () => "optimize-font-loading",
  "uses-long-cache-ttl": () => "improve-static-cache",
  "cache-insight": () => "improve-static-cache",
  "server-response-time": () => "reduce-server-response"
};

function toNumber(value, digits = 0) {
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

function emptyOptimizationReport(reportCount = 0) {
  return {
    summary: {
      reportCount,
      workItemCount: 0,
      topCategory: null,
      totalBlockingMs: 0,
      totalWastedKb: 0,
      totalTransferKb: 0
    },
    workItems: []
  };
}

function classifyResourceType(url = "", auditId = "") {
  const value = String(url || "").toLowerCase();
  if (/\.(png|jpe?g|webp|avif|gif|svg)(\?|$)/.test(value) || auditId.includes("image") || auditId.includes("lcp")) {
    return "image";
  }
  if (/\.css(\?|$)/.test(value) || auditId.includes("css")) {
    return "css";
  }
  if (/\.m?js(\?|$)/.test(value) || auditId.includes("javascript") || auditId.includes("bootup") || auditId.includes("third-party")) {
    return "js";
  }
  if (/\.(woff2?|ttf|otf)(\?|$)/.test(value) || auditId.includes("font")) {
    return "font";
  }
  return "other";
}

function getUrl(item = {}) {
  return item.url || item.source?.url || item.request?.url || item.node?.path || item.node?.selector || "";
}

function isThirdParty(url = "") {
  const value = String(url || "");
  if (!/^https?:\/\//i.test(value)) {
    return false;
  }

  return !/\/wp-content\/|\/wp-includes\/|localhost|127\.0\.0\.1/i.test(value);
}

function normalizeResource(item = {}, auditId = "", auditTitle = "") {
  const url = getUrl(item);
  const type = classifyResourceType(url, auditId);
  const wastedMs = typeof item.wastedMs === "number" ? item.wastedMs : 0;
  const wastedBytes = typeof item.wastedBytes === "number" ? item.wastedBytes : 0;
  const transferBytes = typeof item.totalBytes === "number"
    ? item.totalBytes
    : (typeof item.transferSize === "number" ? item.transferSize : wastedBytes);

  return {
    url: String(url || auditId),
    type,
    thirdParty: isThirdParty(url),
    wastedMs,
    wastedKb: wastedBytes / 1024,
    transferKb: transferBytes / 1024,
    auditId,
    auditTitle: auditTitle || auditId
  };
}

function inferResourcesFromAudit(auditId, audit = {}) {
  const items = Array.isArray(audit.details?.items) ? audit.details.items : [];
  if (items.length) {
    return items.map((item) => normalizeResource(item, auditId, audit.title));
  }

  return [normalizeResource({
    url: auditId,
    wastedMs: typeof audit.numericValue === "number" ? audit.numericValue : 0
  }, auditId, audit.title)];
}

function mergeResource(existing, next) {
  return {
    ...existing,
    wastedMs: Math.max(existing.wastedMs || 0, next.wastedMs || 0),
    wastedKb: Math.max(existing.wastedKb || 0, next.wastedKb || 0),
    transferKb: Math.max(existing.transferKb || 0, next.transferKb || 0),
    occurrences: (existing.occurrences || 0) + 1,
    audits: [...new Set([...(existing.audits || []), next.auditTitle])].slice(0, 5)
  };
}

function ensureWorkItem(workItems, id) {
  const definition = WORK_ITEM_DEFINITIONS[id];
  if (!definition) {
    return null;
  }

  if (!workItems.has(id)) {
    workItems.set(id, {
      id,
      category: definition.category,
      categoryLabel: CATEGORY_LABELS[definition.category] || definition.category,
      title: definition.title,
      problem: definition.problem,
      solution: definition.solution,
      risk: definition.risk,
      confidence: definition.confidence,
      priority: definition.basePriority,
      impact: {
        lcpMs: 0,
        fcpMs: 0,
        tbtMs: 0,
        renderBlockingMs: 0,
        wastedKb: 0,
        transferKb: 0,
        cls: 0
      },
      resources: new Map(),
      audits: new Set()
    });
  }

  return workItems.get(id);
}

function addResourceToWorkItem(workItem, resource, totalReports) {
  const definition = WORK_ITEM_DEFINITIONS[workItem.id];
  const existing = workItem.resources.get(resource.url);
  const merged = existing ? mergeResource(existing, resource) : {
    url: resource.url,
    type: resource.type,
    thirdParty: resource.thirdParty,
    wastedMs: resource.wastedMs,
    wastedKb: resource.wastedKb,
    transferKb: resource.transferKb,
    occurrences: 1,
    audits: [resource.auditTitle]
  };

  workItem.resources.set(resource.url, merged);
  workItem.audits.add(resource.auditTitle);

  const repeatedBoost = totalReports > 1 ? Math.min(merged.occurrences, totalReports) * 35 : 0;
  const firstPartyBoost = resource.url && !resource.thirdParty ? 25 : 0;
  const riskPenalty = definition.risk === "high" ? 80 : (definition.risk === "medium" ? 35 : 0);
  const blockingMs = resource.wastedMs || 0;
  const wastedKb = resource.wastedKb || 0;
  const transferKb = resource.transferKb || 0;
  const byteWeightByCategory = {
    cache: 0.08,
    images: 0.35,
    js: 0.45,
    css: 0.3,
    fonts: 0.2,
    thirdParty: 0.35,
    server: 0.1
  };
  const byteWeight = byteWeightByCategory[definition.category] ?? 0.2;

  workItem.impact.renderBlockingMs += definition.impacts.renderBlockingMs ? blockingMs : 0;
  workItem.impact.lcpMs += definition.impacts.lcpMs ? blockingMs * definition.impacts.lcpMs : 0;
  workItem.impact.fcpMs += definition.impacts.fcpMs ? blockingMs * definition.impacts.fcpMs : 0;
  workItem.impact.tbtMs += definition.impacts.tbtMs ? blockingMs * definition.impacts.tbtMs : 0;
  workItem.impact.cls += definition.impacts.cls ? 0.05 : 0;
  workItem.impact.wastedKb += wastedKb;
  workItem.impact.transferKb += transferKb;

  workItem.priority +=
    (workItem.impact.lcpMs * 0.6) +
    (workItem.impact.fcpMs * 0.45) +
    (workItem.impact.tbtMs * 0.75) +
    (workItem.impact.renderBlockingMs * 0.5) +
    (wastedKb * byteWeight) +
    (transferKb * byteWeight * 0.15) +
    repeatedBoost +
    firstPartyBoost -
    riskPenalty;
}

function buildOptimizationReportFromAudits(auditSets = []) {
  const normalizedAuditSets = (Array.isArray(auditSets) ? auditSets : [auditSets])
    .filter(Boolean);
  const report = emptyOptimizationReport(normalizedAuditSets.length);
  const workItems = new Map();

  normalizedAuditSets.forEach((audits) => {
    Object.entries(audits || {}).forEach(([auditId, audit]) => {
      const rule = AUDIT_RULES[auditId];
      if (!rule || audit?.score === 1) {
        return;
      }

      inferResourcesFromAudit(auditId, audit).forEach((resource) => {
        const workItemId = rule(resource, audit);
        const workItem = ensureWorkItem(workItems, workItemId);
        if (!workItem) {
          return;
        }

        addResourceToWorkItem(workItem, resource, normalizedAuditSets.length);
      });
    });
  });

  report.workItems = [...workItems.values()]
    .map((item) => ({
      ...item,
      priority: Math.max(0, toNumber(item.priority, 0) || 0),
      impact: {
        lcpMs: toNumber(item.impact.lcpMs, 0) || 0,
        fcpMs: toNumber(item.impact.fcpMs, 0) || 0,
        tbtMs: toNumber(item.impact.tbtMs, 0) || 0,
        renderBlockingMs: toNumber(item.impact.renderBlockingMs, 0) || 0,
        wastedKb: toNumber(item.impact.wastedKb, 1) || 0,
        transferKb: toNumber(item.impact.transferKb, 1) || 0,
        cls: toNumber(item.impact.cls, 3) || 0
      },
      resources: [...item.resources.values()]
        .map((resource) => ({
          ...resource,
          wastedMs: toNumber(resource.wastedMs, 0) || 0,
          wastedKb: toNumber(resource.wastedKb, 1) || 0,
          transferKb: toNumber(resource.transferKb, 1) || 0
        }))
        .sort((left, right) =>
          (right.wastedMs - left.wastedMs) ||
          (right.wastedKb - left.wastedKb) ||
          (right.transferKb - left.transferKb)
        )
        .slice(0, 12),
      audits: [...item.audits].slice(0, 6)
    }))
    .sort((left, right) => right.priority - left.priority)
    .slice(0, 12);

  report.summary.workItemCount = report.workItems.length;
  report.summary.topCategory = report.workItems[0]?.category || null;
  report.summary.totalBlockingMs = report.workItems.reduce((sum, item) => sum + item.impact.renderBlockingMs, 0);
  report.summary.totalWastedKb = toNumber(report.workItems.reduce((sum, item) => sum + item.impact.wastedKb, 0), 1) || 0;
  report.summary.totalTransferKb = toNumber(report.workItems.reduce((sum, item) => sum + item.impact.transferKb, 0), 1) || 0;

  return report;
}

function readReport(reportPath) {
  if (!reportPath) {
    return null;
  }

  const absolutePath = runtimePaths.resolvePublicAssetPath(reportPath);
  if (!fs.existsSync(absolutePath)) {
    return null;
  }

  return unwrapLhr(JSON.parse(fs.readFileSync(absolutePath, "utf8")));
}

function buildOptimizationReportFromReports(reportPaths = []) {
  const auditSets = reportPaths
    .map((reportPath) => readReport(reportPath)?.audits || null)
    .filter(Boolean);

  return buildOptimizationReportFromAudits(auditSets);
}

module.exports = {
  buildOptimizationReportFromAudits,
  buildOptimizationReportFromReports,
  emptyOptimizationReport
};
