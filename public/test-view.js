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
            <strong class="metric-compact-title">
              <span>${METRIC_LABELS[metric]}</span>
              <small>${escapeHtml(config.description)}</small>
            </strong>
            <span>${escapeHtml(formatMetric(metric, value))}</span>
          </div>
          <div class="metric-scale">
            <span class="metric-scale-marker" style="left:${percent}%"></span>
          </div>
        </article>
      `;
    }

    function getSerializedMedianMetric(test, metric) {
      if (!test) {
        return null;
      }

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

    function renderComparisonQualityNote(comparisonQuality) {
      if (!comparisonQuality) {
        return "";
      }

      const tone = ["success", "info", "neutral", "warning", "muted"].includes(comparisonQuality.tone)
        ? comparisonQuality.tone
        : "neutral";

      return `
        <div class="comparison-quality-note tone-${escapeHtml(tone)}">
          <div class="comparison-quality-note-head">
            <strong>${escapeHtml(comparisonQuality.label || "-")}</strong>
            <em>${escapeHtml(`${comparisonQuality.score || 0}/100`)}</em>
          </div>
          <span>${escapeHtml(comparisonQuality.summary || "")}</span>
        </div>
      `;
    }

    function renderAverageComparisonCard(comparison, runs, test, baselineTests = [], comparisonQuality = null) {
      const metrics = ["score", "fcp", "lcp", "si", "tbt", "cls", "ttfb"];
      const historyTests = baselineTests.slice(0, 3).reverse();
      const latestPrevious = baselineTests[0] || null;
      const columnTests = [...historyTests, test];

      if (!comparison.hasPrevious && !historyTests.length) {
        return `
          <article class="compact-compare-card half">
            <div class="overview-head">
              <h3>\u041c\u0435\u0434\u0438\u0430\u043d\u0430 vs \u043f\u0440\u0435\u0434\u044b\u0434\u0443\u0449\u0438\u0439</h3>
              <small>${UI.noPrevious}</small>
            </div>
            ${renderComparisonQualityNote(comparisonQuality)}
            <p>${UI.noPrevText}</p>
          </article>
        `;
      }

      if (historyTests.length) {
        return `
          <article class="compact-compare-card half median-history-card">
            <div class="overview-head">
              <h3>${historyTests.length > 1 ? "Медианы vs предыдущие" : "Медиана vs предыдущий"}</h3>
              <small>${escapeHtml(verdictLabel(comparison.verdict))}</small>
            </div>
            ${renderComparisonQualityNote(comparisonQuality)}
            <div class="median-history-head" style="--median-history-count:${columnTests.length};">
              <span></span>
              ${columnTests.map((item, index) => `
                <strong class="${index > 0 ? "with-divider" : ""}" title="${escapeHtml(formatDate(item.completedAt || item.createdAt))}">
                  ${item.id === test.id ? "Сейчас" : `#${escapeHtml(item.id)}`}
                </strong>
              `).join("")}
              <em>Δ</em>
            </div>
            <div class="comparison-list dense median-history-list">
              ${metrics.map((metric) => {
                const currentValue = getSerializedMedianMetric(test, metric);
                const previousValue = getSerializedMedianMetric(latestPrevious, metric);
                const diff = currentValue == null || previousValue == null ? null : currentValue - previousValue;
                const tone = comparisonTone(metric, diff);
                return `
                  <div class="comparison-list-row median-history-row ${tone}" style="--median-history-count:${columnTests.length};">
                    <strong>${METRIC_LABELS[metric]}</strong>
                    ${columnTests.map((item, index) => `
                      <span class="median-history-value ${index > 0 ? "with-divider" : ""}">
                        ${escapeHtml(formatMetric(metric, getSerializedMedianMetric(item, metric)))}
                      </span>
                    `).join("")}
                    <em>${escapeHtml(formatDelta(metric, diff))}</em>
                  </div>
                `;
              }).join("")}
            </div>
          </article>
        `;
      }

      return `
        <article class="compact-compare-card half">
          <div class="overview-head">
            <h3>\u041c\u0435\u0434\u0438\u0430\u043d\u0430 vs \u043f\u0440\u0435\u0434\u044b\u0434\u0443\u0449\u0438\u0439</h3>
            <small>${escapeHtml(verdictLabel(comparison.verdict))}</small>
          </div>
          ${renderComparisonQualityNote(comparisonQuality)}
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

    function renderScoreCard(test, comparison) {
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
        toothCount: 20,
        toothX: 65,
        toothY: 3,
        toothWidth: 10,
        toothHeight: 10,
        slotX: 66.5,
        slotY: 13,
        slotWidth: 7,
        slotHeight: 6
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
              <span class="${verdictClass(comparison.verdict)}">${escapeHtml(verdictLabel(comparison.verdict))}</span>
              <strong>${escapeHtml(scoreQuality)}</strong>
              <em>${comparison.hasPrevious ? `\u041a \u0431\u0430\u0437\u0435: ${escapeHtml(formatDelta("score", scoreDelta))}` : "\u0411\u0435\u0437 \u0431\u0430\u0437\u044b"}</em>
            </div>
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

    function stabilityState(metricStats, runs) {
      const scoreSpread = metricStats.score?.spread;
      const lcpSpread = metricStats.lcp?.spread;
      const clsSpread = metricStats.cls?.spread;
      const noisy = [
        scoreSpread != null && scoreSpread >= 5,
        lcpSpread != null && lcpSpread >= 500,
        clsSpread != null && clsSpread >= 0.05
      ].some(Boolean);

      return {
        verdict: runs.length < 3
          ? "Мало данных"
          : (noisy ? "Серия шумная" : "Серия стабильная"),
        tone: runs.length < 3 ? "neutral" : (noisy ? "warning" : "success"),
        spread: [
          scoreSpread != null ? `Оценка ${formatMetric("score", scoreSpread)}` : "",
          lcpSpread != null ? `LCP ${formatMetric("lcp", lcpSpread)}` : "",
          clsSpread != null ? `CLS ${formatMetric("cls", clsSpread)}` : ""
        ].filter(Boolean).join(" / ")
      };
    }

    function isUsefulNote(note = "", test) {
      const value = String(note || "").trim();
      const normalized = value.toLowerCase();
      const runner = String(test.runnerLabel || runnerLabel(test.runner)).toLowerCase();

      if (!value) {
        return false;
      }

      return ![
        "psi api: серия",
        "psi api",
        "локальный lighthouse",
        runner
      ].includes(normalized);
    }

    function renderContextItems(items) {
      const visibleItems = items.filter(([, value]) => value != null && value !== "");

      if (!visibleItems.length) {
        return "";
      }

      return `
        <dl class="run-context-list">
          ${visibleItems.map(([label, value]) => `
            <div>
              <dt>${escapeHtml(label)}</dt>
              <dd>${escapeHtml(value)}</dd>
            </div>
          `).join("")}
        </dl>
      `;
    }

    function renderRunQualitySummary(test, runQuality, uniqueRuns, runCount) {
      if (!runQuality) {
        return "";
      }

      const tone = ["high", "medium", "low", "muted"].includes(runQuality.reliabilityTone)
        ? runQuality.reliabilityTone
        : "medium";
      const totalRuns = runQuality.totalRuns ?? runCount ?? 0;
      const qualityScore = runQuality.reliabilityScore ?? 0;
      const duplicateMap = Array.isArray(runQuality.duplicates) && runQuality.duplicates.length
        ? runQuality.duplicates.slice(0, 4).map((item) => `#${item.runIndex} -> #${item.duplicateOf}`).join(", ")
        : "нет";
      const hiddenDuplicates = Math.max(0, (runQuality.duplicates?.length || 0) - 4);
      const mitigation = runQuality.mitigation || {};
      const mitigationParts = [
        mitigation.cacheBustCount ? `cache-bust: ${mitigation.cacheBustCount}` : "",
        mitigation.decoyCount ? `decoy: ${mitigation.decoyCount}` : "",
        mitigation.retryCount ? `повторных попыток: ${mitigation.retryCount}` : ""
      ].filter(Boolean);
      const mitigationDetail = test.runner === "psi"
        ? (mitigationParts.length ? mitigationParts.join(" / ") : "дополнительная защита не потребовалась")
        : "локальные прогоны без PSI-кеша";
      const mitigationTitle = test.runner === "psi" ? "Защита PSI" : "Среда запуска";
      const mitigationLabel = test.runner === "psi" ? (mitigation.label || "-") : "Локально";

      return `
        <div class="run-quality-summary tone-${escapeHtml(tone)}">
          <article class="run-quality-card">
            <span>Надежность</span>
            <strong>${escapeHtml(runQuality.reliabilityLabel || "-")}</strong>
            <small>${escapeHtml(`оценка ${qualityScore}/100`)}</small>
          </article>
          <article class="run-quality-card">
            <span>Уникальные снимки</span>
            <strong>${escapeHtml(runQuality.uniqueRuns || 0)} / ${escapeHtml(totalRuns)}</strong>
            <small>${escapeHtml(`${runQuality.uniquePercent || 0}% серии`)}</small>
          </article>
          <article class="run-quality-card">
            <span>Повторы</span>
            <strong>${escapeHtml(runQuality.duplicateCount || 0)}</strong>
            <small>${escapeHtml(hiddenDuplicates ? `${duplicateMap}, еще ${hiddenDuplicates}` : duplicateMap)}</small>
          </article>
          <article class="run-quality-card">
            <span>${escapeHtml(mitigationTitle)}</span>
            <strong>${escapeHtml(mitigationLabel)}</strong>
            <small>${escapeHtml(mitigationDetail)}</small>
          </article>
        </div>
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

    function assetSourceLabel(item = {}) {
      switch (item.sourceType) {
        case "plugin":
          return `Плагин: ${item.sourceName}`;
        case "theme":
          return `Тема: ${item.sourceName}`;
        case "elementor":
          return "Elementor";
        case "wordpress-core":
          return "WordPress";
        case "uploads":
          return "Медиа";
        case "third-party":
          return `Сторонний: ${item.sourceName}`;
        default:
          return item.sourceName || item.sourceType || "-";
      }
    }

    function renderAssetBadges(asset) {
      const badges = [
        asset.renderBlockingReports
          ? `<span class="asset-badge bad">блокирует ${asset.renderBlockingReports}/${asset.totalReports}</span>`
          : "",
        asset.unusedBytes
          ? `<span class="asset-badge warn">лишнее ${escapeHtml(bytesLabel(asset.unusedBytes))}</span>`
          : "",
        asset.priority
          ? `<span class="asset-badge neutral">${escapeHtml(asset.priority)}</span>`
          : ""
      ].filter(Boolean);

      return badges.length ? `<div class="asset-payload-badges">${badges.join("")}</div>` : "";
    }

    function allPayloadAssets(payloadReport = {}) {
      return [
        ...(payloadReport.js || []),
        ...(payloadReport.css || []),
        ...(payloadReport.media || []),
        ...(payloadReport.fonts || []),
        ...(payloadReport.other || [])
      ];
    }

    function renderAssetInventoryFilters(payloadReport = {}) {
      const recommendationOptions = new Map();
      recommendationOptions.set("all", "Все рекомендации");
      allPayloadAssets(payloadReport).forEach((asset) => {
        const recommendation = asset.recommendation || {};
        if (recommendation.id && recommendation.label) {
          recommendationOptions.set(recommendation.id, recommendation.label);
        }
      });

      return `
        <div
          class="asset-filter-bar"
          data-asset-inventory-filter
          data-asset-sort-value="transfer"
          data-asset-min-weight-value="0"
          data-asset-recommendation-value="all"
        >
          ${renderCustomSelect({
            label: "Сортировка",
            value: "transfer",
            action: "asset-sort",
            options: [
              { value: "transfer", label: "Тяжелые сверху" },
              { value: "blocking", label: "Сначала блокирующие" },
              { value: "unused", label: "Сначала лишний код" },
              { value: "early", label: "Ранние запросы" },
              { value: "late-heavy", label: "Поздние тяжелые" },
              { value: "source", label: "По источнику" }
            ]
          })}
          ${renderCustomSelect({
            label: "Мин. вес",
            value: "0",
            action: "asset-min-weight",
            options: [
              { value: "0", label: "Любой вес" },
              { value: "10", label: "от 10 KiB" },
              { value: "25", label: "от 25 KiB" },
              { value: "50", label: "от 50 KiB" },
              { value: "100", label: "от 100 KiB" },
              { value: "250", label: "от 250 KiB" }
            ]
          })}
          ${renderCustomSelect({
            label: "Рекомендация",
            value: "all",
            action: "asset-recommendation",
            options: [...recommendationOptions.entries()].map(([value, label]) => ({ value, label }))
          })}
          <strong data-asset-filter-count></strong>
        </div>
      `;
    }

    function sumAssetBytes(assets = [], key) {
      return assets.reduce((sum, asset) => sum + Number(asset?.[key] || 0), 0);
    }

    function renderResourceShortlist(payloadReport = {}) {
      const assets = allPayloadAssets(payloadReport);
      const blocking = assets.filter((asset) => asset.renderBlockingReports > 0);
      const unused = assets.filter((asset) => asset.unusedBytes > 0);
      const heavyJsCss = assets.filter((asset) =>
        (asset.type === "js" || asset.type === "css") &&
        Number(asset.transferBytes || 0) >= 50 * 1024
      );
      const media = payloadReport.media || [];
      const fonts = payloadReport.fonts || [];
      const cards = [
        {
          title: "Блокируют первый рендер",
          meta: `${blocking.length} файлов / ${bytesLabel(sumAssetBytes(blocking, "transferBytes"))}`,
          sort: "blocking",
          min: "0",
          recommendation: "all"
        },
        {
          title: "Лишний код",
          meta: `${unused.length} файлов / ${bytesLabel(sumAssetBytes(unused, "unusedBytes"))} лишнего`,
          sort: "unused",
          min: "0",
          recommendation: "all"
        },
        {
          title: "Тяжелые JS/CSS",
          meta: `${heavyJsCss.length} файлов / ${bytesLabel(sumAssetBytes(heavyJsCss, "transferBytes"))}`,
          sort: "transfer",
          min: "50",
          recommendation: "all"
        },
        {
          title: "Медиа",
          meta: `${media.length} файлов / ${bytesLabel(sumAssetBytes(media, "transferBytes"))}`,
          sort: "transfer",
          min: "25",
          recommendation: "all"
        },
        {
          title: "Шрифты и иконки",
          meta: `${fonts.length} файлов / ${bytesLabel(sumAssetBytes(fonts, "transferBytes"))}`,
          sort: "transfer",
          min: "0",
          recommendation: "optimize-font"
        }
      ].filter((card) => !card.meta.startsWith("0 файлов"));

      if (!cards.length) {
        return "";
      }

      return `
        <div class="resource-shortlist">
          <div class="resource-shortlist-head">
            <h4>Фокус инвентаря</h4>
            <span>быстрые фильтры полного списка</span>
          </div>
          <div class="resource-shortlist-grid">
            ${cards.map((card) => `
              <button
                type="button"
                class="resource-shortcut"
                data-asset-shortcut
                data-shortcut-sort="${escapeHtml(card.sort)}"
                data-shortcut-min="${escapeHtml(card.min)}"
                data-shortcut-recommendation="${escapeHtml(card.recommendation)}"
                aria-label="${escapeHtml(`Показать: ${card.title}, ${card.meta}`)}"
              >
                <strong>${escapeHtml(card.title)}</strong>
                <span>${escapeHtml(card.meta)}</span>
              </button>
            `).join("")}
          </div>
        </div>
      `;
    }

    function riskClassName(risk = {}) {
      return ["safe", "verify", "fragile"].includes(risk.level) ? risk.level : "verify";
    }

    function renderRiskBadge(risk = {}) {
      const level = riskClassName(risk);
      const label = risk.label || "Проверить вручную";
      return `<b class="asset-risk-badge risk-${escapeHtml(level)}">${escapeHtml(label)}</b>`;
    }

    function renderAssetActionPlan(payloadReport = {}) {
      const actions = (payloadReport.actions || []).slice(0, 4);

      if (!actions.length) {
        return "";
      }

      const severityLabel = {
        high: "Высокий",
        medium: "Средний",
        low: "Низкий"
      };
      const actionCopy = {
        "elementor-payload": {
          title: "Elementor CSS/JS на критическом пути",
          fix: "Проверить эти Elementor-файлы первыми: что реально нужно первому экрану оставить, остальное дробить или грузить позже."
        },
        "render-blocking-css": {
          title: "CSS блокирует первый рендер",
          fix: "Для файлов ниже: критичный минимум встроить в HTML, остальное отложить. CSS меню/попапа не трогать без проверки."
        },
        "render-blocking-js": {
          title: "JS блокирует старт страницы",
          fix: "Отложить только те скрипты ниже, которые не нужны для первого экрана, меню, попапа и форм."
        },
        "unused-css-js": {
          title: "Lighthouse видит лишний CSS/JS",
          fix: "Начать с файлов ниже: отключить лишний виджет/модуль, потом дробить или грузить после взаимодействия."
        },
        "royal-addons-payload": {
          title: "Royal Addons добавляет лишний вес",
          fix: "Сверить файлы ниже с реальными виджетами страницы. Не отключать WPR popup/menu, если на них держится мобильное меню."
        },
        "icon-fonts": {
          title: "Иконки/шрифты дорогие для мобильной версии",
          fix: "Проверить файлы ниже: заменить иконки на SVG/sprite или грузить шрифт позже после проверки UI."
        },
        "heavy-plugin-js": {
          title: "Тяжелый JS плагина",
          fix: "Найти виджет, который требует эти файлы. Если его нет на первом экране, отложить или выгрузить по странице."
        },
        "third-party-js": {
          title: "Сторонний JS в загрузке",
          fix: "Файлы ниже грузить после согласия, простоя браузера или взаимодействия, если они не обязательны на старте."
        }
      };

      function renderActionResource(resource = {}) {
        const flags = [
          resource.renderBlockingReports ? `${resource.renderBlockingReports}/${resource.totalReports} блокирует` : "",
          resource.unusedBytes ? `${bytesLabel(resource.unusedBytes)} лишнее` : "",
          resource.transferBytes ? `${bytesLabel(resource.transferBytes)} передача` : "",
          resource.resourceBytes ? `${bytesLabel(resource.resourceBytes)} исходный` : ""
        ].filter(Boolean);
        const source = assetSourceLabel(resource);
        const fileName = resource.fileName || resource.url || "resource";

        return `
          <li class="asset-action-resource">
            <a href="${escapeHtml(resource.url || "#")}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(resource.url || "")}">
              ${escapeHtml(fileName)}
            </a>
            <span>${escapeHtml(source)}</span>
            <small>
              ${flags.map((flag) => `<b>${escapeHtml(flag)}</b>`).join("")}
            </small>
          </li>
        `;
      }

      return `
        <div class="asset-action-plan">
          <div class="asset-action-plan-head">
            <h4>Приоритетные задачи оптимизации</h4>
            <span>конкретные ресурсы и безопасные действия</span>
          </div>
          <div class="asset-action-list">
            ${actions.map((action, index) => {
              const copy = actionCopy[action.id] || {};
              const resources = (action.resources || []).slice(0, 3);
              const hiddenCount = Math.max(0, (action.resources || []).length - resources.length);
              const severity = action.severity || "medium";

              const resourceSummary = resources[0]
                ? `${resources.length} из ${(action.resources || []).length} файлов · ${resources[0].fileName || resources[0].url || "resource"}`
                : "Файлы не найдены";

              return `
                <article class="asset-action-row severity-${escapeHtml(severity)}">
                  <div class="asset-action-copy">
                    <div class="asset-action-main">
                    <div class="asset-action-title">
                      <span>${escapeHtml(`#${index + 1}`)}</span>
                      <strong>${escapeHtml(copy.title || action.title)}</strong>
                      <div class="asset-action-title-badges">
                        <em>${escapeHtml(severityLabel[severity] || severity)}</em>
                        ${action.risk ? renderRiskBadge(action.risk) : ""}
                      </div>
                    </div>
                    <p>${escapeHtml(copy.fix || action.fix)}</p>
                    </div>
                    <div class="asset-action-impact">
                      <span>${escapeHtml(action.impact?.affectedCount || 0)} файлов</span>
                      <span>${escapeHtml(bytesLabel(action.impact?.transferBytes || 0))}</span>
                      ${action.impact?.renderBlockingMs ? `<span>${escapeHtml(Math.round(action.impact.renderBlockingMs))} ms блокировка</span>` : ""}
                      ${action.impact?.unusedBytes ? `<span>${escapeHtml(bytesLabel(action.impact.unusedBytes))} лишнее</span>` : ""}
                    </div>
                  </div>
                  <details class="asset-action-resource-box">
                    <summary>
                      <span>Ресурсы</span>
                      <strong>${escapeHtml(resourceSummary)}</strong>
                    </summary>
                    ${resources.length ? `
                      <ol class="asset-action-resources">
                        ${resources.map(renderActionResource).join("")}
                      </ol>
                      ${hiddenCount ? `<div class="asset-action-more">+${escapeHtml(hiddenCount)} файлов в полном списке</div>` : ""}
                    ` : `<div class="asset-action-more">Нет конкретных файлов в данных Lighthouse</div>`}
                  </details>
                </article>
              `;
            }).join("")}
          </div>
        </div>
      `;
    }

    function renderAssetInventoryMeta(asset = {}) {
      const meta = [
        ["Передача", bytesLabel(asset.transferBytes)],
        ["Исходный", bytesLabel(asset.resourceBytes)],
        ["Лишнее", asset.unusedBytes ? `${bytesLabel(asset.unusedBytes)} / ${asset.unusedPercent || 0}%` : "-"],
        ["Блокировка", asset.renderBlockingReports ? `${asset.renderBlockingReports}/${asset.totalReports}, ${Math.round(asset.renderBlockingMs || 0)} ms` : "-"],
        ["Приоритет", asset.priority || "-"],
        ["Встречается", `${asset.reportsSeen}/${asset.totalReports}`],
        ["Старт", asset.firstRequestTimeMs == null ? "-" : `${asset.firstRequestTimeMs} ms`],
        ["Конец", asset.lastEndTimeMs == null ? "-" : `${asset.lastEndTimeMs} ms`]
      ];

      return `
        <dl class="asset-inventory-meta">
          ${meta.map(([label, value]) => `
            <div>
              <dt>${escapeHtml(label)}</dt>
              <dd>${escapeHtml(value)}</dd>
            </div>
          `).join("")}
        </dl>
      `;
    }

    function renderAssetInventoryItem(asset = {}) {
      const recommendation = asset.recommendation || {
        id: "review",
        label: "Проверить вручную",
        detail: "Нет рекомендации.",
        risk: {
          level: "verify",
          label: "Проверить вручную",
          detail: "Сверить назначение ресурса вручную."
        }
      };
      const risk = recommendation.risk || {
        level: "verify",
        label: "Проверить вручную",
        detail: "Сверить назначение ресурса вручную."
      };
      const transferKib = Math.round((asset.transferBytes || 0) / 1024);

      return `
        <li
          class="asset-inventory-item"
          data-asset-item
          data-asset-kib="${escapeHtml(transferKib)}"
          data-asset-recommendation="${escapeHtml(recommendation.id)}"
          data-asset-transfer="${escapeHtml(asset.transferBytes || 0)}"
          data-asset-raw="${escapeHtml(asset.resourceBytes || 0)}"
          data-asset-unused="${escapeHtml(asset.unusedBytes || 0)}"
          data-asset-blocking="${escapeHtml(asset.renderBlockingMs || 0)}"
          data-asset-blocking-reports="${escapeHtml(asset.renderBlockingReports || 0)}"
          data-asset-start="${escapeHtml(asset.firstRequestTimeMs == null ? 999999999 : asset.firstRequestTimeMs)}"
          data-asset-end="${escapeHtml(asset.lastEndTimeMs == null ? 0 : asset.lastEndTimeMs)}"
          data-asset-source="${escapeHtml(assetSourceLabel(asset))}"
          data-asset-file="${escapeHtml(asset.fileName || asset.url)}"
        >
          <div class="asset-inventory-main">
            <div>
              <strong title="${escapeHtml(asset.url)}">${escapeHtml(asset.fileName || asset.url)}</strong>
              <span>${escapeHtml(assetSourceLabel(asset))}</span>
            </div>
            <small>${escapeHtml(asset.url)}</small>
            ${renderAssetBadges(asset)}
          </div>
          ${renderAssetInventoryMeta(asset)}
          <div class="asset-inventory-recommendation risk-${escapeHtml(riskClassName(risk))}">
            <div class="asset-recommendation-head">
              <span>${escapeHtml(recommendation.label)}</span>
              ${renderRiskBadge(risk)}
            </div>
            <p>${escapeHtml(recommendation.detail)}</p>
            <small>${escapeHtml(risk.detail || "")}</small>
          </div>
        </li>
      `;
    }

    function renderAssetInventorySection(title, summaryBucket = {}, assets = []) {
      return `
        <article class="asset-inventory-section" data-asset-section>
          <div class="asset-inventory-head">
            <div>
              <h4>${escapeHtml(title)}</h4>
              <span>${escapeHtml(summaryBucket.count || 0)} файлов / ${escapeHtml(bytesLabel(summaryBucket.transferBytes))} передача / ${escapeHtml(bytesLabel(summaryBucket.resourceBytes))} исходный</span>
            </div>
            <strong data-asset-section-count>${escapeHtml(assets.length)} показано</strong>
          </div>
          ${assets.length ? `
            <ol class="asset-inventory-list">
              ${assets.map(renderAssetInventoryItem).join("")}
            </ol>
          ` : `<p>${UI.noData}</p>`}
        </article>
      `;
    }

    function renderPayloadExportLinks(test) {
      if (!test?.id || !isTerminalStatus(test.status)) {
        return "";
      }

      return `
        <div class="payload-export-actions">
          <a class="payload-export-link" href="/api/tests/${escapeHtml(test.id)}/assets.csv" target="_blank" rel="noreferrer">CSV ресурсов</a>
          <a class="payload-export-link" href="/api/tests/${escapeHtml(test.id)}/assets.json" target="_blank" rel="noreferrer">JSON ресурсов</a>
        </div>
      `;
    }

    function renderAssetPayloadReport(payloadReport, test = null) {
      const summary = payloadReport?.summary || {};

      if (!summary.assetCount) {
        return `
          <section class="panel payload-report">
            <div class="info-section-head">
              <div>
                <h3>Ресурсы и приоритеты</h3>
                <span>нет данных сетевого инвентаря</span>
              </div>
            </div>
            <p>${UI.noData}</p>
          </section>
        `;
      }

      return `
        <section class="panel payload-report">
          <div class="info-section-head">
            <div>
              <h3>Ресурсы и приоритеты</h3>
              <span>задачи, быстрые срезы и полный список сетевых ресурсов</span>
            </div>
            ${renderPayloadExportLinks(test)}
          </div>
          <div class="compact-summary-strip payload-summary-strip">
            <div><span>JS</span><strong>${escapeHtml(summary.js?.count || 0)} / ${escapeHtml(bytesLabel(summary.js?.transferBytes))}</strong></div>
            <div><span>CSS</span><strong>${escapeHtml(summary.css?.count || 0)} / ${escapeHtml(bytesLabel(summary.css?.transferBytes))}</strong></div>
            <div><span>Медиа</span><strong>${escapeHtml(summary.media?.count || 0)} / ${escapeHtml(bytesLabel(summary.media?.transferBytes))}</strong></div>
            <div><span>Шрифты</span><strong>${escapeHtml(summary.font?.count || 0)} / ${escapeHtml(bytesLabel(summary.font?.transferBytes))}</strong></div>
            <div><span>Прочее</span><strong>${escapeHtml(summary.other?.count || 0)} / ${escapeHtml(bytesLabel(summary.other?.transferBytes))}</strong></div>
            <div><span>Блокируют</span><strong>${escapeHtml(summary.renderBlockingCount || 0)}</strong></div>
            <div><span>Лишнее</span><strong>${escapeHtml(bytesLabel(summary.totalUnusedBytes))}</strong></div>
            <div><span>Сторонние</span><strong>${escapeHtml(bytesLabel(summary.totalThirdPartyBytes || 0))}</strong></div>
            <div><span>Всего</span><strong>${escapeHtml(summary.assetCount)} / ${escapeHtml(bytesLabel(summary.totalTransferBytes))}</strong></div>
          </div>
          ${renderAssetActionPlan(payloadReport)}
          ${renderResourceShortlist(payloadReport)}
          ${renderAssetInventoryFilters(payloadReport)}
          <div class="asset-inventory" data-asset-inventory>
            ${renderAssetInventorySection("JS-скрипты", summary.js, payloadReport.js || [])}
            ${renderAssetInventorySection("CSS-стили", summary.css, payloadReport.css || [])}
            ${renderAssetInventorySection("Медиа", summary.media, payloadReport.media || [])}
            ${renderAssetInventorySection("Шрифты", summary.font, payloadReport.fonts || [])}
            ${renderAssetInventorySection("Прочее", summary.other, payloadReport.other || [])}
          </div>
        </section>
      `;
    }

    function renderRunContextPanel(test, comparison, metricStats, runs, context = {}, uniqueRuns, runCount, runQuality = null) {
      const stability = stabilityState(metricStats, runs);
      const duplicateCount = runQuality?.duplicateCount ?? Math.max(0, runCount - uniqueRuns);
      const runner = test.runnerLabel || runnerLabel(test.runner);
      const runLabel = test.runner === "psi"
        ? `${test.runsRequested} PSI`
        : `${test.runsRequested} Lighthouse${test.warmup ? " + warmup" : ""}`;
      const finalUrl = context.finalUrl && context.finalUrl !== test.url
        ? context.finalUrl
        : "";
      const warningInsight = buildInsight(test, runs, comparison);
      const shouldShowInsight = warningInsight && warningInsight.tone === "warning";
      const seriesItems = [
        ["Режим", `${runner} / ${formatDevice(test.device)} / ${runLabel}`],
        ["Разброс", stability.spread],
        runQuality?.label ? ["Вердикт", runQuality.label] : null,
        duplicateCount ? ["Дубликаты", `${duplicateCount} из ${runCount}`] : null,
        isUsefulNote(test.note, test) ? ["Заметка", test.note] : null
      ].filter(Boolean);
      const snapshotItems = [
        context.lighthouseVersion ? ["Lighthouse", context.lighthouseVersion] : null,
        context.throttlingMethod ? ["Эмуляция", context.throttlingMethod] : null,
        finalUrl ? ["Финальный URL", finalUrl] : null
      ].filter(Boolean);

      return `
        <section class="run-context-panel">
          <div class="run-context-head">
            <div>
              <h3>Надежность серии</h3>
              <p>Уникальность снимков, повторы и пригодность медианы для выводов.</p>
            </div>
          </div>
          ${renderRunQualitySummary(test, runQuality, uniqueRuns, runCount)}
          <div class="run-context-grid">
            <article class="run-context-card">
              <div class="run-context-card-head">
                <span>Серия</span>
                <strong>${escapeHtml(stability.verdict)}</strong>
              </div>
              ${renderContextItems(seriesItems)}
            </article>
            <article class="run-context-card">
              <div class="run-context-card-head">
                <span>Снимок</span>
                <strong>${escapeHtml(context.fetchTime ? formatDate(context.fetchTime) : formatDate(test.completedAt))}</strong>
              </div>
              ${renderContextItems(snapshotItems)}
            </article>
          </div>
          ${shouldShowInsight ? `
            <div class="run-context-note ${escapeHtml(warningInsight.tone)}">
              <strong>${escapeHtml(warningInsight.title)}</strong>
              <span>${escapeHtml(warningInsight.text)}</span>
            </div>
          ` : ""}
        </section>
      `;
    }

    function renderOverview(test, comparison, runs, baselineTests = [], comparisonQuality = null) {
      return `
        <section class="result-overview">
          <div class="overview-grid compact">
            ${renderScoreCard(test, comparison)}
            <div class="overview-half-grid">
              ${renderMedianCard(test)}
              ${renderAverageComparisonCard(comparison, runs, test, baselineTests, comparisonQuality)}
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
      const tuning = String(test.status || "").toLowerCase() === "tuning";
      const animationClockMs = Date.now();
      const stepsLabel = tuning
        ? "Наладка PSI"
        : (progressParts.includesWarmup ? "Основные прогоны" : UI.stepsDone);
      const mainPercentage = Math.round((progressParts.mainCompleted / progressParts.mainTotal) * 100);
      const progressCounterText = tuning
        ? "скрытый прогон"
        : `${progressParts.mainCompleted} / ${progressParts.mainTotal} (${mainPercentage}%)`;
      const svgWidth = 1000;
      const svgHeight = 18;
      const trackGlowDurationMs = 7600;
      const primaryWaveDurationMs = 8800;
      const secondaryWaveDurationMs = 12600;
      const slotGap = progressParts.mainTotal > 1 ? 3 : 0;
      const slotRadius = svgHeight / 2;
      const trackGlowDelayMs = -(animationClockMs % trackGlowDurationMs);
      const primaryWaveDelayMs = -(animationClockMs % primaryWaveDurationMs);
      const secondaryWaveDelayMs = -(animationClockMs % secondaryWaveDurationMs);
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
                style="width:${(progressParts.warmupFill * 100).toFixed(2)}%;"
              ></div>
            </div>
            <strong>${progressParts.warmupCompleted} / 1</strong>
          </div>
        `
        : "";

      return `
        <div class="progress-luxury ${active ? "is-active" : ""} ${tuning ? "is-tuning" : ""}">
          ${warmupRow}
          <div class="progress-luxury-head">
            <span>${stepsLabel}</span>
            <strong>${progressCounterText}</strong>
          </div>
          ${tuning ? `<p class="progress-tuning-note">Скрытый PSI-прогон сбивает кеш Google. После него SpeedLab повторит целевой URL.</p>` : ""}
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
      const { test, progress, metricStats, comparison, comparisonQuality, assetPayloadReport, reportContext, queue, baselineTests, runQuality } = details;
      const uniqueRuns = uniqueRunCount(runs);
      const runCount = getRequestedRunCount(test);
      const queuedText = test.status === "pending" && queue?.position
        ? `${UI.queuePosition}: ${queue.position}${queue.total ? ` / ${queue.total}` : ""}`
        : "";
      const statusDetailText = test.runner === "local"
        ? `${formatDevice(test.device)}, ${test.runsCompleted} / ${test.runsRequested} основных прогонов${test.warmup ? ", прогрев включен" : ""}`
        : `${formatDevice(test.device)}, ${test.runsCompleted} / ${test.runsRequested} PSI-запросов`;
      const usefulNoteText = isUsefulNote(test.note, test) ? `Комментарий: ${test.note}` : "";
      const statusMetaText = [statusDetailText, `${UI.uniqueResults}: ${uniqueRuns} / ${runCount}`, usefulNoteText, queuedText]
        .filter(Boolean)
        .join(". ");
      const errorBanner = test.errorMessage
        ? `<p class="error-banner">${escapeHtml(test.errorMessage)}</p>`
        : "";
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
          ${renderRunContextPanel(test, comparison, metricStats, runs, reportContext, uniqueRuns, runCount, runQuality)}
          ${renderOverview(test, comparison, runs, baselineTests, comparisonQuality)}
        </section>
        ${renderAssetPayloadReport(assetPayloadReport, test)}
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
