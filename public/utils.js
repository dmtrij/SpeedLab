(function exposeSpeedLabUtils() {
  function extractErrorMessage(error) {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    if (typeof error === "string" && error.trim()) {
      return error;
    }
    return "\u0418\u043d\u0442\u0435\u0440\u0444\u0435\u0439\u0441 \u0434\u0430\u043b \u0441\u0431\u043e\u0439. \u041e\u0431\u043d\u043e\u0432\u0438 \u0441\u0442\u0440\u0430\u043d\u0438\u0446\u0443.";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatDate(value) {
    if (!value) {
      return "-";
    }

    return new Intl.DateTimeFormat("ru-RU", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  }

  function formatShortDate(value) {
    if (!value) {
      return "-";
    }

    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(value));
  }

  function bytesLabel(value) {
    if (value == null) {
      return "-";
    }
    if (value >= 1024 * 1024) {
      return `${(value / 1024 / 1024).toFixed(2)} MB`;
    }
    return `${Math.round(value / 1024)} KiB`;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function normalizeRunCountValue(value, fallback = 5) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return clamp(Math.trunc(parsed), 1, 20);
  }

  window.SpeedLabUtils = Object.freeze({
    bytesLabel,
    clamp,
    escapeHtml,
    extractErrorMessage,
    formatDate,
    formatShortDate,
    normalizeRunCountValue
  });
})();
