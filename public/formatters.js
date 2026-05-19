(function exposeSpeedLabFormatters() {
  function createFormatters({ UI, METRIC_CONFIG } = {}) {
    if (!UI || !METRIC_CONFIG) {
      throw new Error("SpeedLab formatters require UI and METRIC_CONFIG.");
    }

    function formatScore(value) {
      if (value == null) {
        return "-";
      }
      return Number.isInteger(value) ? String(value) : Number(value).toFixed(1);
    }

    function formatSecondsFromMs(value) {
      if (value == null) {
        return "-";
      }
      return `${(Number(value) / 1000).toFixed(2)} \u0441`;
    }

    function formatMs(value) {
      if (value == null) {
        return "-";
      }
      return `${Math.round(Number(value))} \u043c\u0441`;
    }

    function formatCls(value) {
      if (value == null) {
        return "-";
      }
      return Number(value).toFixed(3);
    }

    function formatMetric(metric, value) {
      switch (metric) {
        case "score":
          return formatScore(value);
        case "fcp":
        case "lcp":
        case "si":
        case "ttfb":
          return formatSecondsFromMs(value);
        case "tbt":
          return formatMs(value);
        case "cls":
          return formatCls(value);
        default:
          return value == null ? "-" : String(value);
      }
    }

    function formatDelta(metric, value) {
      if (value == null) {
        return "-";
      }
      const sign = value > 0 ? "+" : "";
      if (metric === "score") {
        return `${sign}${formatScore(value)}`;
      }
      if (metric === "cls") {
        return `${sign}${Number(value).toFixed(3)}`;
      }
      if (metric === "tbt") {
        return `${sign}${Math.round(Number(value))} \u043c\u0441`;
      }
      return `${sign}${(Number(value) / 1000).toFixed(2)} \u0441`;
    }

    function formatDevice(device) {
      return device === "desktop" ? UI.desktop : UI.mobile;
    }

    function runnerLabel(runner) {
      return runner === "psi" ? "PSI API Google" : "\u041b\u043e\u043a\u0430\u043b\u044c\u043d\u044b\u0439 Lighthouse";
    }

    function runnerShortLabel(runner) {
      return runner === "psi" ? "PSI" : "Local";
    }

    function runnerModeLabel(mode) {
      if (mode === "psi-series" || mode === "psi-fresh") {
        return "PSI API: \u0441\u0435\u0440\u0438\u044f";
      }
      if (mode === "psi") {
        return "PSI API: 1 \u043f\u0440\u043e\u0433\u043e\u043d";
      }
      return "\u041b\u043e\u043a\u0430\u043b\u044c\u043d\u044b\u0439 Lighthouse";
    }

    function diagnosticGroup(id) {
      const value = String(id || "");
      if (value.includes("image") || value.includes("lcp")) return "\u0418\u0437\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u044f / LCP";
      if (value.includes("css") || value.includes("render-blocking")) return "CSS";
      if (value.includes("javascript") || value.includes("bootup") || value.includes("mainthread") || value.includes("reflow")) return "JS";
      if (value.includes("font")) return "\u0428\u0440\u0438\u0444\u0442\u044b";
      if (value.includes("cache")) return "\u041a\u0435\u0448";
      if (value.includes("server")) return "\u0421\u0435\u0440\u0432\u0435\u0440";
      if (value.includes("layout") || value.includes("cls") || value.includes("unsized")) return "\u0420\u0430\u0437\u043c\u0435\u0442\u043a\u0430 / CLS";
      return "\u0414\u0440\u0443\u0433\u043e\u0435";
    }

    function runnerClass(runner) {
      return runner === "psi" ? "runner-psi" : "runner-local";
    }

    function verdictLabel(verdict) {
      switch ((verdict || "").toLowerCase()) {
        case "improved":
          return UI.improved;
        case "worse":
          return UI.worse;
        case "nochange":
        case "noise":
          return UI.noise;
        case "no previous test":
          return UI.noPrevious;
        default:
          return verdict || UI.noData;
      }
    }

    function verdictClass(verdict) {
      switch ((verdict || "").toLowerCase()) {
        case "improved":
          return "improved";
        case "worse":
          return "worse";
        case "nochange":
        case "noise":
          return "noise";
        default:
          return "neutral";
      }
    }

    function statusLabel(status) {
      if (!status) {
        return UI.noData;
      }

      const normalized = String(status).toLowerCase();
      if (normalized === "pending") return UI.pending;
      if (normalized === "warming up") return UI.warming;
      if (normalized === "cancelling") return UI.cancelling;
      if (normalized === "completed") return UI.completed;
      if (normalized === "cancelled") return UI.cancelled;
      if (normalized === "failed") return UI.failed;

      const runMatch = normalized.match(/^run\s+(\d+)\s+of\s+(\d+)$/);
      if (runMatch) {
        return `\u041f\u0440\u043e\u0433\u043e\u043d ${runMatch[1]} \u0438\u0437 ${runMatch[2]}`;
      }

      return status;
    }

    function statusClass(status) {
      if (!status) {
        return "neutral";
      }
      const normalized = String(status).toLowerCase();
      if (normalized === "completed") return "status-completed";
      if (normalized === "cancelled") return "status-cancelled";
      if (normalized === "failed") return "status-failed";
      if (normalized === "pending") return "status-pending";
      return "status-running";
    }

    function isTerminalStatus(status) {
      const normalized = String(status || "").toLowerCase();
      return normalized === "completed" || normalized === "failed" || normalized === "cancelled";
    }

    function isExecutionActive(status) {
      const normalized = String(status || "").toLowerCase();
      return normalized === "warming up" || normalized === "cancelling" || /^run\s+\d+\s+of\s+\d+$/.test(normalized);
    }

    function getTestMetric(test, metric) {
      switch (metric) {
        case "score":
          return test.medianScore;
        case "fcp":
          return test.medianFcp;
        case "lcp":
          return test.medianLcp;
        case "si":
          return test.medianSi;
        case "tbt":
          return test.medianTbt;
        case "cls":
          return test.medianCls;
        case "ttfb":
          return test.medianTtfb;
        default:
          return null;
      }
    }

    function metricTone(metric, value) {
      if (value == null) {
        return "neutral";
      }
      const config = METRIC_CONFIG[metric];
      if (!config) {
        return "neutral";
      }
      if (config.reverse) {
        if (value >= config.good) return "good";
        if (value >= config.warning) return "warn";
        return "bad";
      }
      if (value <= config.good) return "good";
      if (value <= config.warning) return "warn";
      return "bad";
    }

    function metricPercent(metric, value) {
      if (value == null) {
        return 0;
      }
      const config = METRIC_CONFIG[metric];
      if (!config) {
        return 0;
      }
      return Math.max(0, Math.min(100, (Number(value) / config.max) * 100));
    }

    function comparisonTone(metric, diff) {
      if (diff == null || diff === 0) {
        return "neutral";
      }
      if (metric === "score") {
        return diff > 0 ? "good" : "bad";
      }
      return diff < 0 ? "good" : "bad";
    }

    return Object.freeze({
      comparisonTone,
      diagnosticGroup,
      formatCls,
      formatDelta,
      formatDevice,
      formatMetric,
      formatMs,
      formatScore,
      formatSecondsFromMs,
      getTestMetric,
      isExecutionActive,
      isTerminalStatus,
      metricPercent,
      metricTone,
      runnerClass,
      runnerLabel,
      runnerModeLabel,
      runnerShortLabel,
      statusClass,
      statusLabel,
      verdictClass,
      verdictLabel
    });
  }

  window.SpeedLabFormatters = Object.freeze({
    createFormatters
  });
})();
