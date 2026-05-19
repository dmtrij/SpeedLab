(function exposeSpeedLabTestView() {
  function ensureFunction(value, name) {
    if (typeof value !== "function") {
      throw new Error("SpeedLab test view requires " + name + ".");
    }
  }

  function createTestView(deps = {}) {
    const {
      UI,
      METRIC_CONFIG,
      METRIC_LABELS,
      bytesLabel,
      comparisonTone,
      diagnosticGroup,
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
    } = deps;

    if (!UI || !METRIC_CONFIG || !METRIC_LABELS) {
      throw new Error("SpeedLab test view requires UI, METRIC_CONFIG, and METRIC_LABELS.");
    }

    [
      [bytesLabel, "bytesLabel"],
      [comparisonTone, "comparisonTone"],
      [diagnosticGroup, "diagnosticGroup"],
      [escapeHtml, "escapeHtml"],
      [formatDate, "formatDate"],
      [formatDelta, "formatDelta"],
      [formatDevice, "formatDevice"],
      [formatMetric, "formatMetric"],
      [formatScore, "formatScore"],
      [getProgressVisualState, "getProgressVisualState"],
      [getScoreGearAnimationState, "getScoreGearAnimationState"],
      [getTestMetric, "getTestMetric"],
      [isExecutionActive, "isExecutionActive"],
      [isTerminalStatus, "isTerminalStatus"],
      [metricPercent, "metricPercent"],
      [metricTone, "metricTone"],
      [runnerClass, "runnerClass"],
      [runnerLabel, "runnerLabel"],
      [splitProgressVisualState, "splitProgressVisualState"],
      [statusClass, "statusClass"],
      [statusLabel, "statusLabel"],
      [verdictClass, "verdictClass"],
      [verdictLabel, "verdictLabel"]
    ].forEach(([fn, name]) => ensureFunction(fn, name));

    function buildRunSignature(run) {
      return [
        run.score,
        run.fcp,
        run.lcp,
        run.si,
        run.tbt,
        run.cls,
        run.ttfb
      ].join("|");
    }

    function uniqueRunCount(runs) {
      return new Set(runs.map(buildRunSignature)).size;
    }

    function duplicateRunMap(runs) {
      const firstSeenBySignature = new Map();
      const duplicates = new Map();

      runs.forEach((run) => {
        const signature = buildRunSignature(run);
        const firstRun = firstSeenBySignature.get(signature);
        if (firstRun) {
          duplicates.set(run.runIndex, firstRun.runIndex);
          return;
        }

        firstSeenBySignature.set(signature, run);
      });

      return duplicates;
    }

    function getRequestedRunCount(test) {
      return Math.max(1, Number(test?.runsRequested || 1));
    }

    function areRunsUniform(runs) {
      return runs.length > 1 && uniqueRunCount(runs) === 1;
    }

    function buildInsight(test, runs, comparison) {
      if (test.runner === "psi" && test.runsRequested > 1 && areRunsUniform(runs)) {
        return {
          tone: "warning",
          title: UI.sameSnapshot,
          text: UI.sameSnapshotText
        };
      }
      if (test.runner === "psi" && test.runsRequested > 1 && uniqueRunCount(runs) < runs.length) {
        return {
          tone: "warning",
          title: UI.repeatedSnapshot,
          text: UI.repeatedSnapshotText
        };
      }
      if (test.runner === "psi") {
        return {
          tone: "info",
          title: UI.psiMode,
          text: UI.psiModeText
        };
      }
      if (!comparison.hasPrevious) {
        return {
          tone: "info",
          title: UI.firstPoint,
          text: UI.firstPointText
        };
      }
      return {
        tone: "success",
        title: UI.medianCompare,
        text: UI.medianCompareText
      };
    }

    function renderMetricScale(metric, value) {
      const config = METRIC_CONFIG[metric];
      const tone = metricTone(metric, value);
      const percent = metricPercent(metric, value);
      return `
        <article class="metric-compact ${tone}">
          <div class="metric-compact-top">
            <div>
              <strong>${escapeHtml(config.description)}</strong>
              <small>${METRIC_LABELS[metric]}</small>
            </div>
            <span>${escapeHtml(formatMetric(metric, value))}</span>
          </div>
          <div class="metric-scale">
            <span class="metric-scale-marker" style="left:${percent}%"></span>
          </div>
        </article>
      `;
    }

    function renderAverageComparisonCard(comparison, runs) {
      const metrics = ["score", "fcp", "lcp", "si", "tbt", "cls", "ttfb"];

      if (!comparison.hasPrevious) {
        return `
          <article class="compact-compare-card half">
            <div class="overview-head">
              <h3>\u041c\u0435\u0434\u0438\u0430\u043d\u0430 vs \u043f\u0440\u0435\u0434\u044b\u0434\u0443\u0449\u0438\u0439</h3>
              <small>${UI.noPrevious}</small>
            </div>
            <p>${UI.noPrevText}</p>
          </article>
        `;
      }

      return `
        <article class="compact-compare-card half">
          <div class="overview-head">
            <h3>\u041c\u0435\u0434\u0438\u0430\u043d\u0430 vs \u043f\u0440\u0435\u0434\u044b\u0434\u0443\u0449\u0438\u0439</h3>
            <small>${escapeHtml(verdictLabel(comparison.verdict))}</small>
          </div>
          <div class="comparison-list dense">
            ${metrics.map((metric) => {
              const previous = comparison.metrics[metric]?.previous;
              const currentValue = comparison.metrics[metric]?.current;
              const diff = currentValue == null || previous == null ? null : currentValue - previous;
              const tone = comparisonTone(metric, diff);
              return `
                <div class="comparison-list-row ${tone}">
                  <strong>${METRIC_LABELS[metric]}</strong>
                  <div class="comparison-value-pair">
                    <span>${escapeHtml(formatMetric(metric, previous))}</span>
                    <span class="comparison-arrow">\u2192</span>
                    <span>${escapeHtml(formatMetric(metric, currentValue))}</span>
                  </div>
                  <em>${escapeHtml(formatDelta(metric, diff))}</em>
                </div>
              `;
            }).join("")}
          </div>
        </article>
      `;
    }

    function renderScoreCard(test, comparison, runModeText, uniqueRuns, runCount) {
      const safeScore = Math.max(0, Math.min(100, Number(test.medianScore || 0)));
      const tone = metricTone("score", safeScore);
      const gaugeColor = tone === "good" ? "#2fd39f" : tone === "warn" ? "#ffb74f" : "#ff6e7d";
      const gaugeLoading = isExecutionActive(test.status);
      const scoreGearState = getScoreGearAnimationState(test.id, test.status);
      const scoreDelta = comparison.hasPrevious ? comparison.metrics.score?.diff : null;
      const scoreQuality = tone === "good" ? "\u0425\u043e\u0440\u043e\u0448\u043e" : tone === "warn" ? "\u0421\u0440\u0435\u0434\u043d\u0435" : "\u041f\u043b\u043e\u0445\u043e";
      const gaugeRadius = 49;
      const gaugeCircumference = 2 * Math.PI * gaugeRadius;
      const scoreOffset = gaugeCircumference - (gaugeCircumference * safeScore) / 100;
      const gaugeIdBase = `score-gauge-${String(test.id ?? "current").replace(/[^a-z0-9_-]+/gi, "-")}`;
      const shellGradientId = `${gaugeIdBase}-shell-gradient`;
      const coreGradientId = `${gaugeIdBase}-core-gradient`;
      const sheenGradientId = `${gaugeIdBase}-sheen-gradient`;
      const gearConfig = {
        center: 70,
        toothCount: 28,
        toothX: 66,
        toothY: -3,
        toothWidth: 8,
        toothHeight: 22,
        slotX: 67,
        slotY: 9,
        slotWidth: 6,
        slotHeight: 15
      };
      const gearStep = 360 / gearConfig.toothCount;
      const gearTeeth = Array.from({ length: gearConfig.toothCount }, (_, index) => `
                <rect class="score-hero-gear-tooth" x="${gearConfig.toothX}" y="${gearConfig.toothY}" width="${gearConfig.toothWidth}" height="${gearConfig.toothHeight}" transform="rotate(${index * gearStep} ${gearConfig.center} ${gearConfig.center})"></rect>
      `).join("");
      const gearSlots = Array.from({ length: gearConfig.toothCount }, (_, index) => `
                <rect class="score-hero-gear-slot" x="${gearConfig.slotX}" y="${gearConfig.slotY}" width="${gearConfig.slotWidth}" height="${gearConfig.slotHeight}" transform="rotate(${index * gearStep} ${gearConfig.center} ${gearConfig.center})"></rect>
      `).join("");
      const metricBadges = ["fcp", "lcp", "si", "tbt", "cls"].map((metric) => {
        const value = getTestMetric(test, metric);
        return `
          <div class="score-metric-pill ${metricTone(metric, value)}">
            <span>${METRIC_LABELS[metric]}</span>
            <strong>${escapeHtml(formatMetric(metric, value))}</strong>
          </div>
        `;
      }).join("");
      return `
        <article class="compact-score-card">
          <div class="score-hero ${gaugeLoading ? "is-loading" : ""}" data-score-hero data-test-id="${escapeHtml(test.id)}" style="--gauge-color:${gaugeColor}; --score-circumference:${gaugeCircumference.toFixed(2)}; --score-offset:${scoreOffset.toFixed(2)};">
            <svg class="score-hero-gauge" viewBox="0 0 140 140" role="img" aria-label="\u041e\u0446\u0435\u043d\u043a\u0430 ${escapeHtml(formatScore(test.medianScore))}">
              <defs>
                <radialGradient id="${shellGradientId}" cx="50%" cy="26%" r="78%">
                  <stop offset="0%" stop-color="#223a59"></stop>
                  <stop offset="58%" stop-color="#13263e"></stop>
                  <stop offset="100%" stop-color="#091322"></stop>
                </radialGradient>
                <radialGradient id="${coreGradientId}" cx="46%" cy="28%" r="84%">
                  <stop offset="0%" stop-color="#112746"></stop>
                  <stop offset="100%" stop-color="#060f1b"></stop>
                </radialGradient>
                <linearGradient id="${sheenGradientId}" x1="24%" y1="18%" x2="76%" y2="82%">
                  <stop offset="0%" stop-color="#ffffff" stop-opacity="0.22"></stop>
                  <stop offset="52%" stop-color="#ffffff" stop-opacity="0.05"></stop>
                  <stop offset="100%" stop-color="#ffffff" stop-opacity="0"></stop>
                </linearGradient>
              </defs>
              <g class="score-hero-gear" aria-hidden="true" style="transform: rotate(${scoreGearState.angle.toFixed(3)}deg);">
                ${gearTeeth}
                <circle class="score-hero-gear-ring" cx="70" cy="70" r="60"></circle>
                <circle class="score-hero-gear-metal-edge" cx="70" cy="70" r="60"></circle>
                ${gearSlots}
                <circle class="score-hero-gear-cut" cx="70" cy="70" r="47"></circle>
              </g>
              <g class="score-hero-dial">
                <circle class="score-hero-shell" cx="70" cy="70" r="55" fill="url(#${shellGradientId})"></circle>
                <circle class="score-hero-shell-edge" cx="70" cy="70" r="55"></circle>
                <circle class="score-hero-shell-inner-edge" cx="70" cy="70" r="51"></circle>
                <circle class="score-hero-track" cx="70" cy="70" r="${gaugeRadius}"></circle>
                <circle class="score-hero-progress" cx="70" cy="70" r="${gaugeRadius}"></circle>
                <circle class="score-hero-core" cx="70" cy="70" r="40" fill="url(#${coreGradientId})"></circle>
                <circle class="score-hero-core-edge" cx="70" cy="70" r="40"></circle>
                <ellipse class="score-hero-core-sheen" cx="60" cy="52" rx="20" ry="11" fill="url(#${sheenGradientId})" transform="rotate(-18 60 52)"></ellipse>
                <text class="score-hero-label" x="70" y="55">\u041e\u0446\u0435\u043d\u043a\u0430</text>
                <text class="score-hero-value" x="70" y="86">${escapeHtml(formatScore(test.medianScore))}</text>
              </g>
            </svg>
            <div class="score-metric-cloud">
              ${metricBadges}
            </div>
          </div>
          <div class="compact-score-copy">
            <div class="score-facts">
              <span class="status-chip ${verdictClass(comparison.verdict)}">${escapeHtml(verdictLabel(comparison.verdict))}</span>
              <strong>${escapeHtml(scoreQuality)}</strong>
              <em>${comparison.hasPrevious ? `\u041a \u0431\u0430\u0437\u0435: ${escapeHtml(formatDelta("score", scoreDelta))}` : "\u0411\u0435\u0437 \u0431\u0430\u0437\u044b"}</em>
            </div>
            <p>${escapeHtml(runModeText)}</p>
            <p>${UI.uniqueResults}: ${uniqueRuns} / ${runCount}</p>
            <p>${escapeHtml(test.note || "-")}</p>
          </div>
        </article>
      `;
    }

    function renderMedianCard(test) {
      const metrics = ["fcp", "lcp", "si", "tbt", "cls", "ttfb"];
      return `
        <article class="compact-metrics-card half">
          <div class="overview-head">
            <h3>${UI.currentMedian}</h3>
            <small>${UI.keyMetrics}</small>
          </div>
          <div class="metric-compact-list">
            ${metrics.map((metric) => renderMetricScale(metric, getTestMetric(test, metric))).join("")}
          </div>
        </article>
      `;
    }

    function renderPrevComparisonCard(comparison) {
      if (!comparison.hasPrevious) {
        return `
          <article class="compact-compare-card">
            <div class="overview-head">
              <h3>${UI.comparePrev}</h3>
              <small>${UI.noPrevious}</small>
            </div>
            <p>${UI.noPrevText}</p>
          </article>
        `;
      }

      const metrics = ["score", "fcp", "lcp", "si", "tbt", "cls", "ttfb"];
      return `
        <article class="compact-compare-card">
          <div class="overview-head">
            <h3>${UI.comparePrev}</h3>
            <small>${escapeHtml(verdictLabel(comparison.verdict))}</small>
          </div>
          <div class="comparison-list">
            ${metrics.map((metric) => {
              const item = comparison.metrics[metric];
              const tone = comparisonTone(metric, item.diff);
              return `
                <div class="comparison-list-row ${tone}">
                  <strong>${METRIC_LABELS[metric]}</strong>
                  <div class="comparison-value-pair">
                    <span>${escapeHtml(formatMetric(metric, item.previous))}</span>
                    <span class="comparison-arrow">\u2192</span>
                    <span>${escapeHtml(formatMetric(metric, item.current))}</span>
                  </div>
                  <em>${escapeHtml(formatDelta(metric, item.diff))}</em>
                </div>
              `;
            }).join("")}
          </div>
        </article>
      `;
    }

    function getRunDelta(currentRun, previousRun, metric) {
      if (!previousRun) {
        return null;
      }
      if (currentRun[metric] == null || previousRun[metric] == null) {
        return null;
      }
      return currentRun[metric] - previousRun[metric];
    }

    function renderStageCard(runs) {
      if (!runs.length) {
        return "";
      }

      const metrics = ["score", "fcp", "lcp", "si", "tbt", "cls", "ttfb"];
      const uniqueRuns = uniqueRunCount(runs);
      const duplicates = duplicateRunMap(runs);
      const hint = uniqueRuns === runs.length
        ? UI.eachRunUnique
        : `${UI.uniqueResults}: ${uniqueRuns} / ${runs.length}`;

      return `
        <section class="stage-card">
          <div class="overview-head">
            <h3>${UI.stageCompare}</h3>
            <small>${escapeHtml(hint)}</small>
          </div>
          <div class="table-wrap run-matrix-wrap">
            <table class="run-matrix">
              <thead>
                <tr>
                  <th>${UI.state}</th>
                  ${runs.map((run, index) => `
                    <th>
                      <strong>#${run.runIndex}</strong>
                      <small class="${duplicates.has(run.runIndex) ? "run-duplicate-label" : ""}">
                        ${duplicates.has(run.runIndex) ? `${UI.duplicateOf} #${duplicates.get(run.runIndex)}` : (index === 0 ? "\u0431\u0430\u0437\u0430" : `\u043a #${runs[index - 1].runIndex}`)}
                      </small>
                    </th>
                  `).join("")}
                </tr>
              </thead>
              <tbody>
                ${metrics.map((metric) => `
                  <tr>
                    <th>${METRIC_LABELS[metric]}</th>
                    ${runs.map((run, index) => {
                      const previousRun = index > 0 ? runs[index - 1] : null;
                      const diff = getRunDelta(run, previousRun, metric);
                      const tone = previousRun ? comparisonTone(metric, diff) : "neutral";
                      return `
                        <td class="run-matrix-cell ${tone}">
                          <strong>${escapeHtml(formatMetric(metric, run[metric]))}</strong>
                          <small>${previousRun ? escapeHtml(formatDelta(metric, diff)) : "\u0431\u0430\u0437\u0430"}</small>
                        </td>
                      `;
                    }).join("")}
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </section>
      `;
    }

    function buildRunPoints(values, width, height, padding) {
      if (!values.length) {
        return [];
      }
      const min = Math.min(...values);
      const max = Math.max(...values);
      const span = max - min || 1;
      return values.map((value, index) => ({
        x: padding + (index * (width - padding * 2)) / Math.max(1, values.length - 1),
        y: height - padding - ((value - min) / span) * (height - padding * 2)
      }));
    }

    function renderTrendChart(runs, metric, title) {
      const values = runs
        .map((run) => run[metric])
        .filter((value) => typeof value === "number" && !Number.isNaN(value));
      if (values.length < 2) {
        return "";
      }

      const width = 320;
      const height = 120;
      const padding = 18;
      const points = buildRunPoints(values, width, height, padding);
      const polyline = points.map((point) => `${point.x},${point.y}`).join(" ");
      const areaPath = `M ${points[0].x},${height - padding} L ${points.map((point) => `${point.x},${point.y}`).join(" L ")} L ${points[points.length - 1].x},${height - padding} Z`;
      const latest = values[values.length - 1];
      const first = values[0];
      const best = metric === "score" ? Math.max(...values) : Math.min(...values);
      const worst = metric === "score" ? Math.min(...values) : Math.max(...values);
      const change = latest - first;
      const tone = metric === "score"
        ? (change >= 0 ? "good" : "bad")
        : (change <= 0 ? "good" : "bad");
      const gridLines = [0.25, 0.5, 0.75].map((ratio) => {
        const y = padding + (height - padding * 2) * ratio;
        return `<line x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}" class="trend-grid-line"></line>`;
      }).join("");

      return `
        <article class="trend-card ${tone}">
          <div class="overview-head">
            <h3>${escapeHtml(title)}</h3>
            <small>${values.length} ${UI.runsWord} / \u0438\u0437\u043c. ${escapeHtml(formatDelta(metric, change))}</small>
          </div>
          <svg viewBox="0 0 ${width} ${height}" class="trend-svg" role="img" aria-label="${escapeHtml(title)}">
            ${gridLines}
            <path d="${areaPath}" class="trend-area"></path>
            <polyline points="${polyline}" class="trend-line"></polyline>
            ${points.map((point, index) => `<circle cx="${point.x}" cy="${point.y}" r="${index === points.length - 1 ? "3.6" : "2.4"}" class="trend-dot ${index === points.length - 1 ? "latest" : ""}"></circle>`).join("")}
          </svg>
          <div class="trend-foot">
            <span>\u041b\u0443\u0447\u0448\u0435: <strong>${escapeHtml(formatMetric(metric, best))}</strong></span>
            <span>\u0425\u0443\u0436\u0435: <strong>${escapeHtml(formatMetric(metric, worst))}</strong></span>
            <span>\u0421\u0435\u0439\u0447\u0430\u0441: <strong>${escapeHtml(formatMetric(metric, latest))}</strong></span>
          </div>
        </article>
      `;
    }

    function renderTrendGrid(runs) {
      const scoreChart = renderTrendChart(runs, "score", UI.scoreTrend);
      const lcpChart = renderTrendChart(runs, "lcp", UI.lcpTrend);

      if (!scoreChart && !lcpChart) {
        return "";
      }

      return `
        <section class="trend-grid compact">
          ${scoreChart}
          ${lcpChart}
        </section>
      `;
    }

    function renderCompactSummary(test, comparison, uniqueRuns, runCount) {
      const items = [
        [UI.finalVerdict, verdictLabel(comparison.verdict)],
        [UI.runsShort, `${test.runsCompleted} / ${test.runsRequested}`],
        [UI.uniqueResults, `${uniqueRuns} / ${runCount}`],
        [UI.comment, test.note || "-"],
        [UI.created, formatDate(test.createdAt)],
        [UI.finished, formatDate(test.completedAt)]
      ];

      return `
        <section class="info-section priority-summary">
          <div class="info-section-head">
            <h3>\u0418\u0442\u043e\u0433 \u0442\u0435\u0441\u0442\u0430</h3>
            <span>\u0433\u043b\u0430\u0432\u043d\u043e\u0435</span>
          </div>
          <div class="compact-summary-strip">
          ${items.map(([label, value]) => `
            <div>
              <span>${escapeHtml(label)}</span>
              <strong>${escapeHtml(value)}</strong>
            </div>
          `).join("")}
          </div>
        </section>
      `;
    }

    function renderCustomSelect({ label, value, options, action }) {
      const selected = options.find((option) => String(option.value) === String(value)) || options[0];
      const renderOptionLabel = (option) => {
        const parts = Array.isArray(option?.parts) && option.parts.length
          ? option.parts
          : [option?.label || "-"];

        return `
          <span class="custom-select-option-label">
            ${parts.map((part) => `<span>${escapeHtml(part)}</span>`).join("")}
          </span>
        `;
      };

      return `
        <div class="custom-select" data-custom-select data-select-action="${escapeHtml(action)}">
          <span class="custom-select-label">${escapeHtml(label)}</span>
          <button class="custom-select-button" type="button" data-custom-select-button aria-expanded="false">
            ${renderOptionLabel(selected)}
          </button>
          <div class="custom-select-menu is-hidden" data-custom-select-menu>
            ${options.map((option) => `
              <button
                type="button"
                class="custom-select-option ${String(option.value) === String(value) ? "is-selected" : ""}"
                data-custom-select-option
                data-value="${escapeHtml(option.value)}"
              >
                ${renderOptionLabel(option)}
              </button>
            `).join("")}
          </div>
        </div>
      `;
    }

    function renderTestActionBar(details) {
      const { test, relatedTests, baselineTests, baseline } = details;
      const buildTestOption = (item) => {
        const runner = item.runnerLabel || runnerLabel(item.runner);
        const runCount = Number(item.runsRequested) || Number(item.runsCompleted) || 1;
        const runLabel = item.runner === "psi"
          ? `${runCount} PSI`
          : `${runCount} Lighthouse`;
        const warmupLabel = item.runner === "local" && item.warmup ? " + warmup" : "";
        const parts = [
          `#${item.id}`,
          runner,
          formatDevice(item.device),
          `${runLabel}${warmupLabel}`,
          formatDate(item.completedAt || item.createdAt),
          `\u041e\u0446\u0435\u043d\u043a\u0430 ${formatMetric("score", item.medianScore)}`
        ];

        return {
          value: item.id,
          label: parts.join(" | "),
          parts
        };
      };
      const testOptions = (relatedTests?.length ? relatedTests : [test]).map((item) => buildTestOption(item));
      const baselineOptions = [
        { value: "", label: "\u041f\u0440\u0435\u0434\u044b\u0434\u0443\u0449\u0438\u0439 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u043d\u044b\u0439" },
        ...(baselineTests || []).map((item) => buildTestOption(item))
      ];

      return `
        <aside class="test-action-bar">
          <div class="test-control-grid">
            ${renderCustomSelect({
              label: "\u041e\u0442\u043a\u0440\u044b\u0442\u044b\u0439 \u0442\u0435\u0441\u0442",
              value: test.id,
              options: testOptions,
              action: "open-test"
            })}
            ${renderCustomSelect({
              label: "\u0421\u0440\u0430\u0432\u043d\u0438\u0442\u044c \u0441",
              value: baseline?.id || "",
              options: baselineOptions,
              action: "baseline"
            })}
          </div>
        </aside>
      `;
    }

    function renderTestButtonBar(details) {
      const { test } = details;
      const terminal = isTerminalStatus(test.status);
      const hasManualBaseline = new URLSearchParams(window.location.search).has("baseline");
      const newTestUrl = `/?url=${encodeURIComponent(test.url || "")}`;

      return `
        <div class="test-button-bar">
          <div class="test-control-actions">
            <button class="button-link ghost status-action-button" type="button" data-reset-baseline ${hasManualBaseline ? "" : "disabled"}>\u0421\u0431\u0440\u043e\u0441</button>
            <a class="button-link ghost status-action-button" href="${newTestUrl}" data-link>\u041d\u043e\u0432\u044b\u0439</a>
            ${terminal
              ? `<a class="button-link ghost status-action-button" href="/api/tests/${test.id}/export.md" target="_blank" rel="noreferrer">\u041e\u0442\u0447\u0435\u0442 MD</a>`
              : `<button class="button-link ghost status-action-button" type="button" data-cancel-test="${test.id}">${UI.cancel}</button>`}
            <button class="button-link ghost status-action-button" data-repeat-test="${test.id}">${UI.retry}</button>
          </div>
        </div>
      `;
    }

    function renderMetricStatsTable(metricStats) {
      const metrics = ["score", "fcp", "lcp", "si", "tbt", "cls", "ttfb"];
      return `
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>${UI.state}</th>
                <th>${UI.median}</th>
                <th>Min</th>
                <th>Max</th>
                <th>${UI.spread}</th>
              </tr>
            </thead>
            <tbody>
              ${metrics.map((metric) => `
                <tr>
                  <td>${METRIC_LABELS[metric]}</td>
                  <td>${escapeHtml(formatMetric(metric, metricStats[metric]?.median))}</td>
                  <td>${escapeHtml(formatMetric(metric, metricStats[metric]?.min))}</td>
                  <td>${escapeHtml(formatMetric(metric, metricStats[metric]?.max))}</td>
                  <td>${escapeHtml(formatMetric(metric, metricStats[metric]?.spread))}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `;
    }

    function renderComparisonTable(comparison) {
      if (!comparison.hasPrevious) {
        return `<p>${UI.noPrevText}</p>`;
      }
      const metrics = ["score", "fcp", "lcp", "si", "tbt", "cls", "ttfb"];
      return `
        <div class="verdict-strip ${verdictClass(comparison.verdict)}">
          ${UI.verdict}: ${escapeHtml(verdictLabel(comparison.verdict))}
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>${UI.state}</th>
                <th>\u0411\u044b\u043b\u043e</th>
                <th>\u0421\u0442\u0430\u043b\u043e</th>
                <th>\u0414\u0435\u043b\u044c\u0442\u0430</th>
              </tr>
            </thead>
            <tbody>
              ${metrics.map((metric) => `
                <tr>
                  <td>${METRIC_LABELS[metric]}</td>
                  <td>${escapeHtml(formatMetric(metric, comparison.metrics[metric].previous))}</td>
                  <td>${escapeHtml(formatMetric(metric, comparison.metrics[metric].current))}</td>
                  <td>${escapeHtml(formatDelta(metric, comparison.metrics[metric].diff))}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `;
    }

    function renderRunsTable(runs) {
      if (!runs.length) {
        return `<p>${UI.noRunsYet}</p>`;
      }
      return `
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>${UI.runsShort}</th>
                <th>\u041e\u0446\u0435\u043d\u043a\u0430</th>
                <th>FCP</th>
                <th>LCP</th>
                <th>SI</th>
                <th>TBT</th>
                <th>CLS</th>
                <th>TTFB</th>
                <th>JSON</th>
              </tr>
            </thead>
            <tbody>
              ${runs.map((run) => `
                <tr>
                  <td>${run.runIndex}</td>
                  <td>${escapeHtml(formatMetric("score", run.score))}</td>
                  <td>${escapeHtml(formatMetric("fcp", run.fcp))}</td>
                  <td>${escapeHtml(formatMetric("lcp", run.lcp))}</td>
                  <td>${escapeHtml(formatMetric("si", run.si))}</td>
                  <td>${escapeHtml(formatMetric("tbt", run.tbt))}</td>
                  <td>${escapeHtml(formatMetric("cls", run.cls))}</td>
                  <td>${escapeHtml(formatMetric("ttfb", run.ttfb))}</td>
                  <td><a href="${escapeHtml(run.jsonPath)}" target="_blank" rel="noreferrer">${UI.openJson}</a></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `;
    }

    function diagnosticBadgeLabel(item) {
      const parts = [];

      if (item?.totalReports > 1) {
        parts.push(`${item.occurrences}/${item.totalReports}`);
      }
      if (item?.displayValue) {
        parts.push(item.displayValue);
      } else if (item?.score != null) {
        parts.push(`score ${item.score}`);
      }

      return parts.join(" | ");
    }

    function offenderAuditLabel(item) {
      const parts = [];

      if (item?.totalReports > 1) {
        parts.push(`${item.occurrences}/${item.totalReports}`);
      }
      if (item?.audits?.length) {
        parts.push(item.audits.join(", "));
      }

      return parts.join(" | ") || "-";
    }

    function renderDiagnostics(diagnostics) {
      if (!diagnostics.length) {
        return `<p>${UI.diagnosticsEmpty}</p>`;
      }
      const groups = diagnostics.reduce((acc, item) => {
        const group = diagnosticGroup(item.id);
        acc[group] = acc[group] || [];
        acc[group].push(item);
        return acc;
      }, {});

      return `
        <div class="diagnostic-groups">
          ${Object.entries(groups).map(([group, items]) => `
            <section class="diagnostic-group">
              <h3>${escapeHtml(group)}</h3>
              <div class="diagnostic-list">
                ${items.map((item) => `
                  <article class="diagnostic-item">
                    <div class="diagnostic-head">
                      <strong>${escapeHtml(item.title)}</strong>
                      <span class="status-chip neutral">${escapeHtml(diagnosticBadgeLabel(item))}</span>
                    </div>
                    <div class="diagnostic-fix">
                      <span>\u0427\u0442\u043e \u043f\u043b\u043e\u0445\u043e</span>
                      <p>${escapeHtml(item.description || UI.noData)}</p>
                    </div>
                    <div class="diagnostic-fix">
                      <span>\u0427\u0442\u043e \u0441\u0434\u0435\u043b\u0430\u0442\u044c</span>
                      <p>${escapeHtml(item.fix || UI.noData)}</p>
                    </div>
                    ${item.targets?.length ? `
                      <div class="diagnostic-targets">
                        <span>\u041a\u043e\u043d\u043a\u0440\u0435\u0442\u043d\u044b\u0435 \u0440\u0435\u0441\u0443\u0440\u0441\u044b</span>
                        <ul>
                          ${item.targets.map((target) => `<li>${escapeHtml(target)}</li>`).join("")}
                        </ul>
                      </div>
                    ` : ""}
                  </article>
                `).join("")}
              </div>
            </section>
          `).join("")}
        </div>
      `;
    }

    function renderResourceOffenders(offenders) {
      if (!offenders?.length) {
        return `<p>${UI.noData}</p>`;
      }

      return `
        <div class="table-wrap">
          <table class="data-table offenders-table">
            <thead>
              <tr>
                <th>\u0422\u0438\u043f</th>
                <th>\u0424\u0430\u0439\u043b</th>
                <th>\u041f\u043b\u0430\u0433\u0438\u043d</th>
                <th>\u041f\u043e\u0442\u0435\u0440\u0438</th>
                <th>\u0420\u0430\u0437\u043c\u0435\u0440</th>
                <th>\u0413\u0434\u0435 \u0432\u0441\u043f\u043b\u044b\u043b</th>
              </tr>
            </thead>
            <tbody>
              ${offenders.map((item) => `
                <tr>
                  <td>${escapeHtml(item.type)}</td>
                  <td class="table-url">${escapeHtml(item.url)}</td>
                  <td>${escapeHtml(item.plugin || "-")}</td>
                  <td>${escapeHtml([item.wastedMs ? `${item.wastedMs} ms` : "", item.wastedBytes ? bytesLabel(item.wastedBytes) : ""].filter(Boolean).join(" / ") || "-")}</td>
                  <td>${escapeHtml(bytesLabel(item.totalBytes))}</td>
                  <td>${escapeHtml(offenderAuditLabel(item))}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `;
    }

    function assetSourceLabel(item = {}) {
      switch (item.sourceType) {
        case "plugin":
          return `Plugin: ${item.sourceName}`;
        case "theme":
          return `Theme: ${item.sourceName}`;
        case "elementor":
          return "Elementor generated";
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

    function renderAssetBadges(asset) {
      const badges = [
        asset.renderBlockingReports
          ? `<span class="asset-badge bad">render-blocking ${asset.renderBlockingReports}/${asset.totalReports}</span>`
          : "",
        asset.unusedBytes
          ? `<span class="asset-badge warn">unused ${escapeHtml(bytesLabel(asset.unusedBytes))}</span>`
          : "",
        asset.priority
          ? `<span class="asset-badge neutral">${escapeHtml(asset.priority)}</span>`
          : ""
      ].filter(Boolean);

      return badges.length ? `<div class="asset-payload-badges">${badges.join("")}</div>` : "";
    }

    function renderAssetList(title, assets) {
      if (!assets?.length) {
        return `
          <article class="asset-payload-card">
            <h4>${escapeHtml(title)}</h4>
            <p>${UI.noData}</p>
          </article>
        `;
      }

      return `
        <article class="asset-payload-card">
          <h4>${escapeHtml(title)}</h4>
          <ol class="asset-payload-list">
            ${assets.slice(0, 12).map((asset) => `
              <li class="asset-payload-item">
                <div class="asset-payload-main">
                  <strong title="${escapeHtml(asset.url)}">${escapeHtml(asset.fileName || asset.url)}</strong>
                  <span>${escapeHtml(assetSourceLabel(asset))}</span>
                  <small>${escapeHtml(asset.url)}</small>
                  ${renderAssetBadges(asset)}
                </div>
                <div class="asset-payload-size">
                  <strong>${escapeHtml(bytesLabel(asset.transferBytes))}</strong>
                  <span>raw ${escapeHtml(bytesLabel(asset.resourceBytes))}</span>
                  <span>${asset.reportsSeen}/${asset.totalReports}</span>
                </div>
              </li>
            `).join("")}
          </ol>
        </article>
      `;
    }

    function renderAssetPayloadReport(payloadReport) {
      const summary = payloadReport?.summary || {};
      const groups = payloadReport?.groups || [];

      if (!summary.assetCount) {
        return `
          <section class="info-section payload-report">
            <div class="info-section-head">
              <h3>CSS/JS payload</h3>
              <span>network-requests</span>
            </div>
            <p>${UI.noData}</p>
          </section>
        `;
      }

      return `
        <section class="info-section payload-report">
          <div class="info-section-head">
            <h3>CSS/JS payload</h3>
            <span>\u043f\u043e\u043b\u043d\u044b\u0439 \u0441\u0440\u0435\u0437 \u0441\u0442\u0438\u043b\u0435\u0439 \u0438 \u0441\u043a\u0440\u0438\u043f\u0442\u043e\u0432</span>
          </div>
          <div class="compact-summary-strip payload-summary-strip">
            <div><span>CSS transfer</span><strong>${escapeHtml(summary.css?.count || 0)} / ${escapeHtml(bytesLabel(summary.css?.transferBytes))}</strong></div>
            <div><span>JS transfer</span><strong>${escapeHtml(summary.js?.count || 0)} / ${escapeHtml(bytesLabel(summary.js?.transferBytes))}</strong></div>
            <div><span>Render-blocking</span><strong>${escapeHtml(summary.renderBlockingCount || 0)}</strong></div>
            <div><span>Unused known</span><strong>${escapeHtml(bytesLabel(summary.totalUnusedBytes))}</strong></div>
            <div><span>Third-party</span><strong>${escapeHtml(bytesLabel((summary.css?.thirdPartyBytes || 0) + (summary.js?.thirdPartyBytes || 0)))}</strong></div>
            <div><span>\u0424\u0430\u0439\u043b\u043e\u0432</span><strong>${escapeHtml(summary.assetCount)} / ${escapeHtml(summary.reportCount)} reports</strong></div>
          </div>
          <div class="table-wrap asset-group-wrap">
            <table class="data-table asset-group-table">
              <thead>
                <tr>
                  <th>\u0418\u0441\u0442\u043e\u0447\u043d\u0438\u043a</th>
                  <th>CSS</th>
                  <th>JS</th>
                  <th>Transfer</th>
                  <th>Raw</th>
                  <th>Unused</th>
                  <th>Blocking</th>
                </tr>
              </thead>
              <tbody>
                ${groups.slice(0, 16).map((group) => `
                  <tr>
                    <td class="table-url">${escapeHtml(assetSourceLabel(group))}</td>
                    <td>${escapeHtml(group.cssCount)} / ${escapeHtml(bytesLabel(group.cssTransferBytes))}</td>
                    <td>${escapeHtml(group.jsCount)} / ${escapeHtml(bytesLabel(group.jsTransferBytes))}</td>
                    <td>${escapeHtml(bytesLabel(group.totalTransferBytes))}</td>
                    <td>${escapeHtml(bytesLabel(group.totalResourceBytes))}</td>
                    <td>${escapeHtml(bytesLabel(group.unusedBytes))}</td>
                    <td>${escapeHtml(group.renderBlockingCount)}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
          <div class="asset-payload-grid">
            ${renderAssetList("\u0421\u0430\u043c\u044b\u0435 \u0442\u044f\u0436\u0435\u043b\u044b\u0435 CSS", payloadReport.css)}
            ${renderAssetList("\u0421\u0430\u043c\u044b\u0435 \u0442\u044f\u0436\u0435\u043b\u044b\u0435 JS", payloadReport.js)}
          </div>
        </section>
      `;
    }

    function renderStability(metricStats, runs) {
      const scoreSpread = metricStats.score?.spread;
      const lcpSpread = metricStats.lcp?.spread;
      const clsSpread = metricStats.cls?.spread;
      const scoreNoisy = scoreSpread != null && scoreSpread >= 5;
      const lcpNoisy = lcpSpread != null && lcpSpread >= 500;
      const clsNoisy = clsSpread != null && clsSpread >= 0.05;
      const verdict = runs.length < 3
        ? "\u041c\u0430\u043b\u043e \u0434\u0430\u043d\u043d\u044b\u0445"
        : (scoreNoisy || lcpNoisy || clsNoisy ? "\u0421\u0435\u0440\u0438\u044f \u0448\u0443\u043c\u043d\u0430\u044f" : "\u0421\u0435\u0440\u0438\u044f \u0441\u0442\u0430\u0431\u0438\u043b\u044c\u043d\u0430\u044f");

      return `
        <section class="info-section">
          <div class="info-section-head">
            <h3>\u0421\u0442\u0430\u0431\u0438\u043b\u044c\u043d\u043e\u0441\u0442\u044c \u0441\u0435\u0440\u0438\u0438</h3>
            <span>\u0440\u0430\u0437\u0431\u0440\u043e\u0441</span>
          </div>
          <div class="compact-summary-strip stability-strip">
            <div><span>\u0412\u044b\u0432\u043e\u0434</span><strong>${escapeHtml(verdict)}</strong></div>
            <div><span>\u0420\u0430\u0437\u0431\u0440\u043e\u0441 \u043e\u0446\u0435\u043d\u043a\u0438</span><strong>${escapeHtml(formatMetric("score", scoreSpread))}</strong></div>
            <div><span>\u0420\u0430\u0437\u0431\u0440\u043e\u0441 LCP</span><strong>${escapeHtml(formatMetric("lcp", lcpSpread))}</strong></div>
            <div><span>\u0420\u0430\u0437\u0431\u0440\u043e\u0441 CLS</span><strong>${escapeHtml(formatMetric("cls", clsSpread))}</strong></div>
          </div>
        </section>
      `;
    }

    function renderTechContext(context = {}, test) {
      const items = [
        [UI.source, test.runnerLabel || runnerLabel(test.runner)],
        [UI.deviceShort, formatDevice(test.device)],
        ["\u0424\u043e\u0440\u043c-\u0444\u0430\u043a\u0442\u043e\u0440", context.formFactor || test.device],
        ["Lighthouse", context.lighthouseVersion || "-"],
        ["\u0412\u0440\u0435\u043c\u044f \u0441\u043d\u0438\u043c\u043a\u0430", context.fetchTime ? formatDate(context.fetchTime) : "-"],
        ["\u042d\u043c\u0443\u043b\u044f\u0446\u0438\u044f", context.throttlingMethod || "-"],
        ["\u0424\u0438\u043d\u0430\u043b\u044c\u043d\u044b\u0439 URL", context.finalUrl || test.url]
      ];

      return `
        <section class="info-section">
          <div class="info-section-head">
            <h3>\u041a\u043e\u043d\u0442\u0435\u043a\u0441\u0442 \u0437\u0430\u043f\u0443\u0441\u043a\u0430</h3>
            <span>\u0441\u0440\u0435\u0434\u0430</span>
          </div>
          <div class="compact-summary-strip tech-strip">
            ${items.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}
          </div>
        </section>
      `;
    }

    function renderRawReports(rawReports) {
      if (!rawReports.length) {
        return `<p>${UI.reportsEmpty}</p>`;
      }
      return `
        <ul class="raw-report-list">
          ${rawReports.map((report) => `
            <li>
              <a href="${escapeHtml(report.jsonPath)}" target="_blank" rel="noreferrer">
                ${UI.runsShort} ${report.runIndex}: ${escapeHtml(report.jsonPath)}
              </a>
            </li>
          `).join("")}
        </ul>
      `;
    }

    function renderLog(logLines) {
      if (!logLines.length) {
        return `<p>${UI.logEmpty}</p>`;
      }
      return `<pre class="log-console">${escapeHtml(logLines.join("\n"))}</pre>`;
    }

    function renderInsightBanner(insight) {
      return `
        <div class="insight-banner ${escapeHtml(insight.tone)}">
          <strong>${escapeHtml(insight.title)}</strong>
          <p>${escapeHtml(insight.text)}</p>
        </div>
      `;
    }

    function renderOptimizationReport(optimizationReport) {
      const workItems = optimizationReport?.workItems || [];

      if (!workItems.length) {
        return `
          <section class="info-section">
            <div class="info-section-head">
              <h3>План оптимизации</h3>
              <span>нет явных групп работ</span>
            </div>
            <p>${UI.diagnosticsEmpty}</p>
          </section>
        `;
      }

      return `
        <section class="info-section optimization-plan">
          <div class="info-section-head">
            <h3>План оптимизации</h3>
            <span>сначала максимальный ожидаемый эффект</span>
          </div>
          <div class="diagnostic-list">
            ${workItems.slice(0, 8).map((item, index) => `
              <article class="diagnostic-card">
                <div class="diagnostic-card-top">
                  <span>${index + 1}. ${escapeHtml(item.categoryLabel || item.category)}</span>
                  <strong>${escapeHtml(item.title)}</strong>
                  <small>Priority ${escapeHtml(item.priority)} / ${escapeHtml(item.confidence)} confidence / ${escapeHtml(item.risk)} risk</small>
                </div>
                <p>${escapeHtml(item.problem)}</p>
                <div class="compact-summary-strip">
                  <div><span>LCP</span><strong>${escapeHtml(item.impact?.lcpMs || 0)} ms</strong></div>
                  <div><span>TBT</span><strong>${escapeHtml(item.impact?.tbtMs || 0)} ms</strong></div>
                  <div><span>Блокировка</span><strong>${escapeHtml(item.impact?.renderBlockingMs || 0)} ms</strong></div>
                  <div><span>Лишний вес</span><strong>${escapeHtml(item.impact?.wastedKb || 0)} KiB</strong></div>
                </div>
                <div class="diagnostic-fix">
                  <span>Что сделать</span>
                  <p>${escapeHtml(item.solution)}</p>
                </div>
                ${item.resources?.length ? `
                  <div class="diagnostic-targets">
                    <span>Ресурсы для этой группы</span>
                    <ul>
                      ${item.resources.slice(0, 6).map((resource) => `
                        <li>
                          ${escapeHtml(resource.url)}
                          ${resource.wastedMs || resource.wastedKb || resource.transferKb
                            ? ` (${[
                              resource.wastedMs ? `${resource.wastedMs} ms` : "",
                              resource.wastedKb ? `${resource.wastedKb} KiB wasted` : "",
                              resource.transferKb ? `${resource.transferKb} KiB transfer` : ""
                            ].filter(Boolean).join(", ")})`
                            : ""}
                        </li>
                      `).join("")}
                    </ul>
                  </div>
                ` : ""}
              </article>
            `).join("")}
          </div>
        </section>
      `;
    }

    function renderOverview(test, comparison, runs, runModeText) {
      const uniqueRuns = uniqueRunCount(runs);
      const runCount = getRequestedRunCount(test);
      return `
        <section class="result-overview">
          <div class="overview-grid compact">
            ${renderScoreCard(test, comparison, runModeText, uniqueRuns, runCount)}
            <div class="overview-half-grid">
              ${renderMedianCard(test)}
              ${renderAverageComparisonCard(comparison, runs)}
            </div>
          </div>
          ${renderStageCard(runs)}
          ${renderTrendGrid(runs)}
        </section>
      `;
    }

    function renderSegmentedProgress(test, progress, runs) {
      const progressVisual = getProgressVisualState(test, progress, runs);
      const progressParts = splitProgressVisualState(test, progressVisual);
      const active = isExecutionActive(test.status);
      const animationClockMs = Date.now();
      const stepsLabel = progressParts.includesWarmup ? "Основные прогоны" : UI.stepsDone;
      const svgWidth = 1000;
      const svgHeight = 18;
      const trackGlowDurationMs = 7600;
      const primaryWaveDurationMs = 8800;
      const secondaryWaveDurationMs = 12600;
      const warmupFlowDurationMs = 4000;
      const warmupGlowDurationMs = 5400;
      const slotGap = progressParts.mainTotal > 1 ? 3 : 0;
      const slotRadius = svgHeight / 2;
      const trackGlowDelayMs = -(animationClockMs % trackGlowDurationMs);
      const primaryWaveDelayMs = -(animationClockMs % primaryWaveDurationMs);
      const secondaryWaveDelayMs = -(animationClockMs % secondaryWaveDurationMs);
      const warmupFlowDelayMs = -(animationClockMs % warmupFlowDurationMs);
      const warmupGlowDelayMs = -(animationClockMs % warmupGlowDurationMs);
      const slotWidth = (svgWidth - slotGap * Math.max(0, progressParts.mainTotal - 1)) / progressParts.mainTotal;
      const progressIdBase = `progress-${String(test.id ?? "current").replace(/[^a-z0-9_-]+/gi, "-")}`;
      const slotsClipId = `${progressIdBase}-slots`;
      const fillClipId = `${progressIdBase}-fill`;
      const fillGradientId = `${progressIdBase}-gradient`;
      const sheenGradientId = `${progressIdBase}-sheen`;
      const fillWidth = svgWidth * progressParts.mainFill;
      const slotRects = Array.from({ length: progressParts.mainTotal }, (_, index) => {
        const x = index * (slotWidth + slotGap);
        return `<rect x="${x.toFixed(2)}" y="0" width="${slotWidth.toFixed(2)}" height="${svgHeight}" rx="${slotRadius}" ry="${slotRadius}"></rect>`;
      }).join("");
      const slotOutlines = Array.from({ length: progressParts.mainTotal }, (_, index) => {
        const x = index * (slotWidth + slotGap);
        return `<rect class="progress-slot-outline" x="${x.toFixed(2)}" y="0.5" width="${slotWidth.toFixed(2)}" height="${(svgHeight - 1).toFixed(2)}" rx="${(slotRadius - 0.5).toFixed(2)}" ry="${(slotRadius - 0.5).toFixed(2)}"></rect>`;
      }).join("");
      const primaryWaves = Array.from({ length: 8 }, (_, index) => `
                    <ellipse class="progress-track-wave-blob progress-track-wave-blob-primary" cx="${80 + index * 140}" cy="9" rx="92" ry="10"></ellipse>
      `).join("");
      const secondaryWaves = Array.from({ length: 7 }, (_, index) => `
                    <ellipse class="progress-track-wave-blob progress-track-wave-blob-secondary" cx="${130 + index * 150}" cy="9" rx="72" ry="8.5"></ellipse>
      `).join("");
      const mainPercentage = Math.round((progressParts.mainCompleted / progressParts.mainTotal) * 100);
      const warmupRow = progressParts.includesWarmup
        ? `
          <div class="progress-warmup-row">
            <span class="progress-warmup-label">${UI.warmupShort}</span>
            <div
              class="progress-warmup-track ${active && progressVisual.completed === 0 ? "is-active" : ""} ${progressParts.warmupCompleted ? "is-complete" : ""}"
              data-progress-warmup-track
              data-test-id="${test.id}"
              role="progressbar"
              aria-label="${UI.warmupShort}: ${progressParts.warmupCompleted} / 1"
              aria-valuemin="0"
              aria-valuemax="1"
              aria-valuenow="${progressParts.warmupCompleted}"
            >
              <div
                class="progress-warmup-fill"
                data-progress-warmup-fill
                data-test-id="${test.id}"
                style="width:${(progressParts.warmupFill * 100).toFixed(2)}%;${active && progressVisual.completed === 0 ? `animation-delay:${warmupFlowDelayMs}ms, ${warmupGlowDelayMs}ms;` : ""}"
              ></div>
            </div>
            <strong>${progressParts.warmupCompleted} / 1</strong>
          </div>
        `
        : "";

      return `
        <div class="progress-luxury ${active ? "is-active" : ""}">
          ${warmupRow}
          <div class="progress-luxury-head">
            <span>${stepsLabel}</span>
            <strong>${progressParts.mainCompleted} / ${progressParts.mainTotal} (${mainPercentage}%)</strong>
          </div>
          <div
            class="progress-segment-track"
            data-progress-track
            data-test-id="${test.id}"
            data-main-total="${progressParts.mainTotal}"
            data-includes-warmup="${progressParts.includesWarmup ? "true" : "false"}"
            role="progressbar"
            aria-label="${stepsLabel}: ${progressParts.mainCompleted} / ${progressParts.mainTotal}"
            aria-valuemin="0"
            aria-valuemax="${progressParts.mainTotal}"
            aria-valuenow="${progressParts.mainCompleted}"
          >
            <svg class="progress-segment-svg" viewBox="0 0 ${svgWidth} ${svgHeight}" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <clipPath id="${slotsClipId}">
                  ${slotRects}
                </clipPath>
                <clipPath id="${fillClipId}">
                  <rect data-progress-main-fill x="0" y="0" width="${fillWidth.toFixed(2)}" height="${svgHeight}"></rect>
                </clipPath>
                <linearGradient id="${fillGradientId}" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stop-color="#19c684"></stop>
                  <stop offset="24%" stop-color="#30d79a"></stop>
                  <stop offset="50%" stop-color="#59e8bf"></stop>
                  <stop offset="74%" stop-color="#74f0cf"></stop>
                  <stop offset="100%" stop-color="#89dcff"></stop>
                </linearGradient>
                <linearGradient id="${sheenGradientId}" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stop-color="#ffffff" stop-opacity="0.22"></stop>
                  <stop offset="36%" stop-color="#ffffff" stop-opacity="0.06"></stop>
                  <stop offset="100%" stop-color="#000000" stop-opacity="0.14"></stop>
                </linearGradient>
              </defs>
              <g clip-path="url(#${slotsClipId})">
                <rect class="progress-track-base-rect" x="0" y="0" width="${svgWidth}" height="${svgHeight}"></rect>
                <g class="progress-track-fill-group" clip-path="url(#${fillClipId})">
                  <rect class="progress-track-fill-rect" x="0" y="0" width="${svgWidth}" height="${svgHeight}" fill="url(#${fillGradientId})" style="animation-delay:${trackGlowDelayMs}ms"></rect>
                  <g class="progress-track-wave-group progress-track-wave-group-primary" style="animation-delay:${primaryWaveDelayMs}ms">
                    ${primaryWaves}
                  </g>
                  <g class="progress-track-wave-group progress-track-wave-group-secondary" style="animation-delay:${secondaryWaveDelayMs}ms">
                    ${secondaryWaves}
                  </g>
                  <rect class="progress-track-sheen-rect" x="0" y="0" width="${svgWidth}" height="${svgHeight}" fill="url(#${sheenGradientId})"></rect>
                </g>
              </g>
              <g class="progress-slot-outline-group">
                ${slotOutlines}
              </g>
            </svg>
          </div>
        </div>
      `;
    }

    function renderTestDetail(details, runs) {
      const { test, progress, metricStats, comparison, diagnostics, resourceOffenders, assetPayloadReport, optimizationReport, reportContext, queue } = details;
      const insight = buildInsight(test, runs, comparison);
      const uniqueRuns = uniqueRunCount(runs);
      const runCount = getRequestedRunCount(test);
      const queuedText = test.status === "pending" && queue?.position
        ? `${UI.queuePosition}: ${queue.position}${queue.total ? ` / ${queue.total}` : ""}`
        : "";
      const savedRunsText = test.runner === "local"
        ? `${test.runsCompleted} / ${test.runsRequested} основных прогонов сохранено`
        : `${test.runsCompleted} / ${test.runsRequested} запросов сохранено`;
      const statusMetaText = [savedRunsText, queuedText, `${UI.uniqueResults}: ${uniqueRuns} / ${runCount}`]
        .filter(Boolean)
        .join(". ");
      const errorBanner = test.errorMessage
        ? `<p class="error-banner">${escapeHtml(test.errorMessage)}</p>`
        : "";
      const runModeText = test.runner === "local"
        ? `${formatDevice(test.device)}, ${test.runsRequested} \u043e\u0441\u043d\u043e\u0432\u043d\u044b\u0445 \u043f\u0440\u043e\u0433\u043e\u043d\u043e\u0432${test.warmup ? ", \u043f\u0440\u043e\u0433\u0440\u0435\u0432 \u0432\u043a\u043b\u044e\u0447\u0435\u043d" : ""}`
        : `${formatDevice(test.device)}, ${test.runsRequested} PSI-\u0437\u0430\u043f\u0440\u043e\u0441\u043e\u0432`;

      setTopbarMeta({
        subtitle: `\u0422\u0435\u0441\u0442 #${test.id}`,
        context: test.url
      });

      return `
        <section class="panel result-shell compact">
          <div class="status-overview-grid">
            <div class="status-main">
              <div class="status-copy">
                <span class="eyebrow">${UI.state}</span>
                <h2>${escapeHtml(statusLabel(test.status))}</h2>
                <p>${statusMetaText}.</p>
              </div>
              <div class="status-pills">
                <span class="status-chip ${runnerClass(test.runner)}">${escapeHtml(test.runnerLabel || runnerLabel(test.runner))}</span>
                <span class="status-chip neutral">${escapeHtml(formatDevice(test.device))}</span>
                <span class="status-chip ${statusClass(test.status)}">${escapeHtml(statusLabel(test.status))}</span>
                <span class="status-chip ${verdictClass(comparison.verdict)}">${escapeHtml(verdictLabel(comparison.verdict))}</span>
              </div>
            </div>
            <div class="test-control-stack">
              ${renderTestActionBar(details)}
              ${renderTestButtonBar(details)}
            </div>
          </div>
          ${renderSegmentedProgress(test, progress, runs)}
          ${errorBanner}
          ${renderOverview(test, comparison, runs, runModeText)}
          ${renderCompactSummary(test, comparison, uniqueRuns, runCount)}
          ${renderStability(metricStats, runs)}
          ${renderTechContext(reportContext, test)}
          ${renderInsightBanner(insight)}
        </section>
        <section class="accordion-group">
          <details open class="panel accordion">
            <summary>План оптимизации</summary>
            <div class="accordion-body">
              ${renderOptimizationReport(optimizationReport)}
            </div>
          </details>
          <details open class="panel accordion">
            <summary>CSS/JS payload</summary>
            <div class="accordion-body">
              ${renderAssetPayloadReport(assetPayloadReport)}
            </div>
          </details>
          <details open class="panel accordion">
            <summary>${UI.diagnostics}</summary>
            <div class="accordion-body">
              ${renderDiagnostics(diagnostics)}
            </div>
          </details>
          <details class="panel accordion">
            <summary>\u0422\u044f\u0436\u0435\u043b\u044b\u0435 \u0440\u0435\u0441\u0443\u0440\u0441\u044b</summary>
            <div class="accordion-body">
              ${renderResourceOffenders(resourceOffenders)}
            </div>
          </details>
          <details class="panel accordion">
            <summary>${UI.medianMetrics}</summary>
            <div class="accordion-body">
              ${renderMetricStatsTable(metricStats)}
            </div>
          </details>
          <details class="panel accordion">
            <summary>${UI.comparePrev}</summary>
            <div class="accordion-body">
              ${renderComparisonTable(comparison)}
            </div>
          </details>
          <details class="panel accordion">
            <summary>${UI.individualRuns}</summary>
            <div class="accordion-body">
              ${renderRunsTable(runs)}
            </div>
          </details>
        </section>
      `;
    }

    return Object.freeze({
      renderTestDetail
    });
  }

  window.SpeedLabTestView = Object.freeze({
    createTestView
  });
})();
