const appRoot = document.getElementById("app");
const topbarSubtitle = document.getElementById("topbar-subtitle");
const topbarContext = document.getElementById("topbar-context");

let routePollTimer = null;
let historyFilterTimer = null;
let routeRequestVersion = 0;
const TEST_POLL_INTERVAL_MS = 1200;

const {
  UI,
  METRIC_LABELS,
  METRIC_CONFIG
} = window.SpeedLabConstants || {};

const {
  bytesLabel,
  clamp,
  escapeHtml,
  extractErrorMessage,
  formatDate,
  formatShortDate,
  normalizeRunCountValue
} = window.SpeedLabUtils || {};

const { requestJson } = window.SpeedLabApi.createApiClient({
  requestFailedMessage: UI.requestFailed
});

const {
  comparisonTone,
  formatDelta,
  formatDevice,
  formatMetric,
  formatScore,
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
} = window.SpeedLabFormatters.createFormatters({
  UI,
  METRIC_CONFIG
});

const {
  clearProgressAnimation,
  clearScoreGearAnimation,
  getProgressVisualState,
  getScoreGearAnimationState,
  paintProgressBar,
  splitProgressVisualState,
  startProgressAnimation,
  syncScoreGearAnimation
} = window.SpeedLabAnimations.createAnimationController({
  clamp,
  isExecutionActive
});

const router = window.SpeedLabRouter.createRouter({
  render: safeRenderRoute,
  beforeNavigate: clearRouteRuntimeState
});

const { bindLaunchForm } = window.SpeedLabLauncher.createLauncher({
  UI,
  navigate,
  normalizeRunCountValue,
  requestJson,
  runnerModeLabel
});

const { bindHistoryActions } = window.SpeedLabHistoryActions.createHistoryActions({
  navigate,
  requestJson
});

const { bindTestDetailActions } = window.SpeedLabTestActions.createTestActions({
  loadTestPage,
  navigate,
  requestJson
});

const {
  renderHistoryCards,
  renderHistorySummary
} = window.SpeedLabHistoryView.createHistoryView({
  UI,
  escapeHtml,
  formatDate,
  formatDelta,
  formatDevice,
  formatMetric,
  formatShortDate,
  isTerminalStatus,
  runnerShortLabel,
  statusClass,
  statusLabel
});

const { renderTestDetail } = window.SpeedLabTestView.createTestView({
  UI,
  METRIC_CONFIG,
  METRIC_LABELS,
  bytesLabel,
  comparisonTone,
  escapeHtml,
  formatDate,
  formatDelta,
  formatDevice,
  formatMetric,
  formatScore,
  getProgressVisualState,
  getScoreGearAnimationState,
  getTestMetric,
  isExecutionActive,
  isTerminalStatus,
  metricPercent,
  metricTone,
  runnerClass,
  runnerLabel,
  splitProgressVisualState,
  statusClass,
  statusLabel,
  verdictClass,
  verdictLabel
});

window.addEventListener("error", (event) => {
  if (!appRoot) {
    return;
  }
  renderFatalState(extractErrorMessage(event.error || event.message));
});

window.addEventListener("unhandledrejection", (event) => {
  if (!appRoot) {
    return;
  }
  renderFatalState(extractErrorMessage(event.reason));
});

function setDocumentTitle(title) {
  document.title = title ? `SpeedLab | ${title}` : "SpeedLab";
}

function setTopbarMeta({ subtitle = UI.topbarDefault, context = "" } = {}) {
  if (topbarSubtitle) {
    topbarSubtitle.textContent = subtitle;
    topbarSubtitle.title = subtitle;
  }

  if (topbarContext) {
    const hasContext = Boolean(context);
    topbarContext.hidden = !hasContext;
    topbarContext.textContent = context;
    topbarContext.title = context;
  }
}

function clearPoller() {
  if (routePollTimer) {
    window.clearTimeout(routePollTimer);
    routePollTimer = null;
  }
}

function beginRouteRequest() {
  routeRequestVersion += 1;
  return routeRequestVersion;
}

function isCurrentRouteRequest(requestVersion, expectedPath = "") {
  if (requestVersion !== routeRequestVersion) {
    return false;
  }

  return !expectedPath || window.location.pathname === expectedPath;
}

function clearRouteRuntimeState() {
  clearPoller();
  clearProgressAnimation();
  clearScoreGearAnimation();
  beginRouteRequest();
}

function navigate(path) {
  router.navigate(path);
}

function renderFatalState(message) {
  clearPoller();
  clearScoreGearAnimation();
  setDocumentTitle(UI.failed);
  setTopbarMeta();
  appRoot.innerHTML = `
    <section class="panel">
      <p class="error-banner">${escapeHtml(message)}</p>
      <div class="action-row">
        <a href="/" class="button-link" data-link>${UI.backHome}</a>
      </div>
    </section>
  `;
}

function safeRenderRoute() {
  try {
    renderRoute();
  } catch (error) {
    console.error(error);
    renderFatalState(extractErrorMessage(error));
  }
}

function renderRoute() {
  clearProgressAnimation();
  clearScoreGearAnimation();

  const path = window.location.pathname;
  if (path === "/") {
    renderHomePage();
    return;
  }
  if (path === "/history") {
    renderHistoryPage();
    return;
  }
  const testMatch = path.match(/^\/test\/(\d+)$/);
  if (testMatch) {
    renderTestPage(Number(testMatch[1]));
    return;
  }

  setDocumentTitle(UI.routeNotFound);
  setTopbarMeta();
  appRoot.innerHTML = `
    <section class="panel hero compact">
      <span class="eyebrow">${UI.routeNotFound}</span>
      <h1>${UI.pageMissing}</h1>
      <div class="action-row">
        <a href="/" class="button-link" data-link>${UI.backHome}</a>
      </div>
    </section>
  `;
}

function renderHomePage() {
  clearPoller();
  setDocumentTitle();
  setTopbarMeta();
  const initialUrl = new URLSearchParams(window.location.search).get("url") || "";
  appRoot.innerHTML = `
    <section class="launcher-grid single">
      <section class="panel">
        <div class="section-head">
          <div>
            <span class="eyebrow">${UI.launch}</span>
            <h2>${UI.launchTitle}</h2>
          </div>
        </div>
        <form id="test-form" class="form-grid">
          <div class="wide preset-row">
            <button type="button" class="table-open" data-preset="psi">PSI: \u0431\u044b\u0441\u0442\u0440\u0430\u044f \u0441\u0432\u0435\u0440\u043a\u0430</button>
            <button type="button" class="table-open" data-preset="psi-series">PSI: \u0441\u0435\u0440\u0438\u044f</button>
            <button type="button" class="table-open" data-preset="local">Local: \u0441\u0442\u0430\u0431\u0438\u043b\u044c\u043d\u0430\u044f \u043c\u0435\u0434\u0438\u0430\u043d\u0430</button>
          </div>
          <label class="wide">
            <span>${UI.url}</span>
            <input type="url" name="url" placeholder="https://example.com" value="${escapeHtml(initialUrl)}" required />
          </label>
          <label>
            <span>${UI.runs}</span>
            <input type="number" name="runs" min="1" max="20" value="5" required />
          </label>
          <label>
            <span>${UI.device}</span>
            <select name="device">
              <option value="mobile">${UI.mobile}</option>
              <option value="desktop">${UI.desktop}</option>
            </select>
          </label>
          <label>
            <span>${UI.runWith}</span>
            <select name="runner">
              <option value="local">\u041b\u043e\u043a\u0430\u043b\u044c\u043d\u044b\u0439 Lighthouse</option>
              <option value="psi">PSI API: 1 \u043f\u0440\u043e\u0433\u043e\u043d</option>
              <option value="psi-series">PSI API: \u0441\u0435\u0440\u0438\u044f</option>
            </select>
          </label>
          <label class="checkbox" data-warmup-label>
            <input type="checkbox" name="warmup" checked />
            <span>${UI.warmup}</span>
          </label>
          <label class="wide" data-psi-key-wrap hidden>
            <span>${UI.psiKey}</span>
            <input type="password" name="psiApiKey" placeholder="\u041d\u0435\u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u043e. \u0412 SQLite \u043d\u0435 \u0441\u043e\u0445\u0440\u0430\u043d\u044f\u0435\u0442\u0441\u044f." />
          </label>
          <p class="wide input-note" data-runner-help></p>
          <p class="wide input-note subtle" data-runs-help></p>
          <p class="wide input-note subtle" data-repeat-note hidden></p>
          <label class="wide">
            <span>${UI.note}</span>
            <textarea name="note" rows="3" placeholder="${UI.notePlaceholder}"></textarea>
          </label>
          <div class="wide action-row">
            <button type="submit" class="button-primary">${UI.start}</button>
            <a href="/history" class="button-link ghost" data-link>${UI.openHistory}</a>
          </div>
          <p class="form-error" id="form-error" hidden></p>
        </form>
      </section>
    </section>
  `;

  const form = document.getElementById("test-form");
  bindLaunchForm(form);
}

function renderHistoryPage() {
  clearPoller();
  setDocumentTitle(UI.history);
  setTopbarMeta({ subtitle: UI.historyTitle });
  const initialFilter = new URLSearchParams(window.location.search).get("url") || "";

  appRoot.innerHTML = `
    <section class="panel hero compact">
      <span class="eyebrow">${UI.history}</span>
      <h1>${UI.historyTitle}</h1>
      <p>${UI.historyText}</p>
    </section>
    <section class="panel">
      <div class="toolbar">
        <label class="toolbar-search">
          <span>${UI.filterUrl}</span>
          <input id="history-filter" type="search" placeholder="example.com" value="${escapeHtml(initialFilter)}" />
        </label>
        <div class="toolbar-actions">
          <button class="button-link ghost" id="clear-history-button">\u041e\u0447\u0438\u0441\u0442\u0438\u0442\u044c \u0438\u0441\u0442\u043e\u0440\u0438\u044e</button>
        </div>
      </div>
      <div id="history-summary" class="history-stats loading-state">${UI.loadingSummary}</div>
      <div id="history-table-container" class="table-wrap history-table-wrap loading-state">${UI.loadingHistory}</div>
    </section>
  `;

  const filterInput = document.getElementById("history-filter");
  const summaryContainer = document.getElementById("history-summary");
  const tableContainer = document.getElementById("history-table-container");
  const clearHistoryButton = document.getElementById("clear-history-button");

  async function loadHistory(filterValue = "") {
    summaryContainer.textContent = UI.loadingSummary;
    tableContainer.textContent = UI.loadingHistory;
    try {
      const query = filterValue ? `?url=${encodeURIComponent(filterValue)}` : "";
      const { tests } = await requestJson(`/api/tests${query}`);
      summaryContainer.innerHTML = renderHistorySummary(tests);
      tableContainer.innerHTML = renderHistoryCards(tests);
      bindHistoryActions(loadHistory, filterValue);
    } catch (error) {
      const errorMarkup = `<p class="error-banner">${escapeHtml(error.message)}</p>`;
      summaryContainer.innerHTML = errorMarkup;
      tableContainer.innerHTML = errorMarkup;
    }
  }

  filterInput.addEventListener("input", () => {
    const filterValue = filterInput.value.trim();
    window.clearTimeout(historyFilterTimer);
    historyFilterTimer = window.setTimeout(() => {
      const url = new URL(window.location.href);
      if (filterValue) {
        url.searchParams.set("url", filterValue);
      } else {
        url.searchParams.delete("url");
      }
      history.replaceState({}, "", `${url.pathname}${url.search}`);
      loadHistory(filterValue);
    }, 250);
  });

  clearHistoryButton.addEventListener("click", async () => {
    if (!window.confirm("\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u0432\u0441\u044e \u0438\u0441\u0442\u043e\u0440\u0438\u044e \u0438 raw JSON?")) {
      return;
    }
    await requestJson("/api/tests", { method: "DELETE" });
    loadHistory(filterInput.value.trim());
  });

  loadHistory(initialFilter);
}

function renderTestPage(testId) {
  clearPoller();
  setDocumentTitle(`\u0422\u0435\u0441\u0442 #${testId}`);
  setTopbarMeta({ subtitle: `\u0422\u0435\u0441\u0442 #${testId}` });
  appRoot.innerHTML = `<section class="panel loading-state">${UI.loadingTest} #${testId}...</section>`;
  loadTestPage(testId);
}

async function loadTestPage(testId) {
  const requestVersion = beginRouteRequest();
  const expectedPath = `/test/${testId}`;

  try {
    const baseline = new URLSearchParams(window.location.search).get("baseline");
    const baselineQuery = baseline ? `?baseline=${encodeURIComponent(baseline)}` : "";
    const [details, runsResponse] = await Promise.all([
      requestJson(`/api/tests/${testId}${baselineQuery}`),
      requestJson(`/api/tests/${testId}/runs`)
    ]);

    if (!isCurrentRouteRequest(requestVersion, expectedPath)) {
      return;
    }

    setDocumentTitle(`\u0422\u0435\u0441\u0442 #${details.test.id}`);
    clearProgressAnimation();
    appRoot.innerHTML = renderTestDetail(details, runsResponse.runs);
    syncScoreGearAnimation(details.test);
    const status = String(details.test.status || "").toLowerCase();
    if (!isTerminalStatus(status)) {
      paintProgressBar(testId);
      if (isExecutionActive(status)) {
        startProgressAnimation(testId);
      }
      routePollTimer = window.setTimeout(() => {
        if (!isCurrentRouteRequest(requestVersion, expectedPath)) {
          return;
        }

        loadTestPage(testId);
      }, TEST_POLL_INTERVAL_MS);
    }
    bindTestDetailActions(testId);
  } catch (error) {
    if (!isCurrentRouteRequest(requestVersion, expectedPath)) {
      return;
    }

    setTopbarMeta();
    appRoot.innerHTML = `
      <section class="panel">
        <p class="error-banner">${escapeHtml(error.message)}</p>
        <div class="action-row">
          <a href="/" class="button-link" data-link>${UI.backHome}</a>
        </div>
      </section>
    `;
  }
}

router.start();

