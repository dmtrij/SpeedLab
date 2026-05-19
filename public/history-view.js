(function exposeSpeedLabHistoryView() {
  function createHistoryView({
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
  } = {}) {
    if (!UI || typeof escapeHtml !== "function") {
      throw new Error("SpeedLab history view requires UI and formatter helpers.");
    }

    function findPreviousHistoryTest(test, tests) {
      if (test.status !== "completed") {
        return null;
      }
      const currentTime = new Date(test.completedAt || test.createdAt).getTime();
      return tests
        .filter((candidate) =>
          candidate.id !== test.id &&
          candidate.status === "completed" &&
          candidate.url === test.url &&
          candidate.device === test.device &&
          candidate.runner === test.runner &&
          new Date(candidate.completedAt || candidate.createdAt).getTime() < currentTime
        )
        .sort((left, right) =>
          new Date(right.completedAt || right.createdAt).getTime() -
          new Date(left.completedAt || left.createdAt).getTime()
        )[0] || null;
    }

    function renderHistoryDiff(test, previous) {
      if (!previous) {
        return `<span class="history-diff neutral">-</span>`;
      }
      const scoreDiff = test.medianScore != null && previous.medianScore != null
        ? test.medianScore - previous.medianScore
        : null;
      const lcpDiff = test.medianLcp != null && previous.medianLcp != null
        ? test.medianLcp - previous.medianLcp
        : null;
      const tone = (scoreDiff != null && scoreDiff < -3) || (lcpDiff != null && lcpDiff > 300)
        ? "bad"
        : (scoreDiff != null && scoreDiff > 3 && (lcpDiff == null || lcpDiff <= 0) ? "good" : "neutral");

      return `
        <span class="history-diff ${tone}">
          \u041e\u0446\u0435\u043d\u043a\u0430 ${escapeHtml(formatDelta("score", scoreDiff))}<br>
          LCP ${escapeHtml(formatDelta("lcp", lcpDiff))}
        </span>
      `;
    }

    function renderHistorySummary(tests) {
      const total = tests.length;
      const completed = tests.filter((test) => test.status === "completed").length;
      const failed = tests.filter((test) => test.status === "failed").length;
      const local = tests.filter((test) => test.runner === "local").length;
      const psi = tests.filter((test) => test.runner === "psi").length;

      const cards = [
        { label: UI.totalTests, value: total, note: "\u0432 \u0442\u0435\u043a\u0443\u0449\u0435\u043c \u0444\u0438\u043b\u044c\u0442\u0440\u0435" },
        { label: UI.done, value: completed, note: failed ? `\u043e\u0448\u0438\u0431\u043e\u043a: ${failed}` : "\u0431\u0435\u0437 \u0441\u0431\u043e\u0435\u0432" },
        { label: "\u041b\u043e\u043a\u0430\u043b\u044c\u043d\u043e", value: local, note: UI.localSeries },
        { label: "PSI", value: psi, note: UI.googleCheck }
      ];

      return `
        <div class="quick-kpis">
          ${cards.map((card) => `
            <article class="mini-stat">
              <span>${escapeHtml(card.label)}</span>
              <strong>${escapeHtml(String(card.value))}</strong>
              <small>${escapeHtml(card.note)}</small>
            </article>
          `).join("")}
        </div>
      `;
    }

    function renderHistoryTable(tests) {
      if (!tests.length) {
        return `
          <div class="empty-state">
            <h3>${UI.emptyTests}</h3>
            <p>${UI.runFirst}</p>
          </div>
        `;
      }

      const rows = tests.map((test) => {
        const previous = findPreviousHistoryTest(test, tests);
        const detailsId = `history-details-${test.id}`;
        return `
        <tr>
          <td><button class="icon-action" title="\u0417\u0430\u043a\u0440\u0435\u043f\u0438\u0442\u044c" data-test-pin="${test.id}" data-pinned="${test.pinned ? "1" : "0"}">${test.pinned ? "\u2605" : "\u2606"}</button></td>
          <td title="${escapeHtml(formatDate(test.createdAt))}">${escapeHtml(formatShortDate(test.createdAt))}</td>
          <td class="table-url history-url" title="${escapeHtml(test.url)}">${escapeHtml(test.url)}</td>
          <td class="history-context"><strong>${escapeHtml(runnerShortLabel(test.runner))}</strong><small>${escapeHtml(formatDevice(test.device))} / ${test.runsRequested}</small></td>
          <td>${escapeHtml(formatMetric("score", test.medianScore))}</td>
          <td>${escapeHtml(formatMetric("lcp", test.medianLcp))}</td>
          <td>${renderHistoryDiff(test, previous)}</td>
          <td class="history-status"><span class="history-status-dot ${statusClass(test.status)}" title="${escapeHtml(statusLabel(test.status))}"></span>${escapeHtml(statusLabel(test.status))}</td>
          <td class="table-actions">
            <button class="table-open" data-test-open="${test.id}">${UI.open}</button>
            <button class="table-open subtle" type="button" data-history-toggle="${detailsId}">\u0415\u0449\u0435</button>
          </td>
        </tr>
        <tr id="${detailsId}" class="history-detail-row" hidden>
          <td colspan="9">
            <div class="history-detail-panel">
              <div><span>${UI.comment}</span><strong>${escapeHtml(test.note || "-")}</strong></div>
              <div><span>FCP</span><strong>${escapeHtml(formatMetric("fcp", test.medianFcp))}</strong></div>
              <div><span>SI</span><strong>${escapeHtml(formatMetric("si", test.medianSi))}</strong></div>
              <div><span>TBT</span><strong>${escapeHtml(formatMetric("tbt", test.medianTbt))}</strong></div>
              <div><span>CLS</span><strong>${escapeHtml(formatMetric("cls", test.medianCls))}</strong></div>
              <div class="history-detail-actions">
                ${isTerminalStatus(test.status)
                  ? `<a class="table-open" href="/api/tests/${test.id}/export.md" target="_blank" rel="noreferrer">\u041e\u0442\u0447\u0435\u0442</a>`
                  : ""}
                <button class="table-open" data-test-retry="${test.id}">${UI.retry}</button>
                ${isTerminalStatus(test.status)
                  ? `<button class="table-open danger" data-test-delete="${test.id}">\u0423\u0434\u0430\u043b\u0438\u0442\u044c</button>`
                  : `<button class="table-open danger" data-test-cancel="${test.id}">${UI.cancel}</button>`}
              </div>
            </div>
          </td>
        </tr>
      `;
      }).join("");

      return `
        <table class="data-table history-table">
          <thead>
            <tr>
              <th></th>
              <th>${UI.created}</th>
              <th>URL</th>
              <th>${UI.source}</th>
              <th>\u041e\u0446\u0435\u043d\u043a\u0430</th>
              <th>LCP</th>
              <th>\u0420\u0430\u0437\u043d\u0438\u0446\u0430</th>
              <th>${UI.state}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `;
    }

    function renderHistoryCards(tests) {
      if (!tests.length) {
        return `
          <div class="empty-state">
            <h3>${UI.emptyTests}</h3>
            <p>${UI.runFirst}</p>
          </div>
        `;
      }

      const rows = tests.map((test) => {
        const previous = findPreviousHistoryTest(test, tests);
        const detailsId = `history-details-${test.id}`;
        return `
          <article class="history-card">
            <div class="history-card-main">
              <div class="history-date" title="${escapeHtml(formatDate(test.createdAt))}">${escapeHtml(formatShortDate(test.createdAt))}</div>
              <div class="history-url" title="${escapeHtml(test.url)}">${escapeHtml(test.url)}</div>
              <div class="history-context"><strong>${escapeHtml(runnerShortLabel(test.runner))}</strong><small>${escapeHtml(formatDevice(test.device))} / ${test.runsRequested}</small></div>
              <div class="history-metric"><span>\u041e\u0446\u0435\u043d\u043a\u0430</span><strong>${escapeHtml(formatMetric("score", test.medianScore))}</strong></div>
              <div class="history-diff-cell">${renderHistoryDiff(test, previous)}</div>
              <div class="history-status"><span class="history-status-dot ${statusClass(test.status)}" title="${escapeHtml(statusLabel(test.status))}"></span>${escapeHtml(statusLabel(test.status))}</div>
              <div class="table-actions">
                <button class="table-open subtle" type="button" data-history-toggle="${detailsId}" aria-expanded="false">\u0415\u0449\u0435</button>
              </div>
            </div>
            <div id="${detailsId}" class="history-detail-panel is-hidden">
              <div><span>${UI.comment}</span><strong>${escapeHtml(test.note || "-")}</strong></div>
              <div><span>FCP</span><strong>${escapeHtml(formatMetric("fcp", test.medianFcp))}</strong></div>
              <div><span>LCP</span><strong>${escapeHtml(formatMetric("lcp", test.medianLcp))}</strong></div>
              <div><span>SI</span><strong>${escapeHtml(formatMetric("si", test.medianSi))}</strong></div>
              <div><span>TBT</span><strong>${escapeHtml(formatMetric("tbt", test.medianTbt))}</strong></div>
              <div><span>CLS</span><strong>${escapeHtml(formatMetric("cls", test.medianCls))}</strong></div>
              <div class="history-detail-actions">
                <button class="table-open" data-test-open="${test.id}">${UI.open}</button>
                ${isTerminalStatus(test.status)
                  ? `<a class="table-open" href="/api/tests/${test.id}/export.md" target="_blank" rel="noreferrer">\u041e\u0442\u0447\u0435\u0442</a>`
                  : ""}
                <button class="table-open" data-test-retry="${test.id}">${UI.retry}</button>
                ${isTerminalStatus(test.status)
                  ? `<button class="table-open danger" data-test-delete="${test.id}">\u0423\u0434\u0430\u043b\u0438\u0442\u044c</button>`
                  : `<button class="table-open danger" data-test-cancel="${test.id}">${UI.cancel}</button>`}
              </div>
            </div>
          </article>
        `;
      }).join("");

      return `<div class="history-list">${rows}</div>`;
    }

    return Object.freeze({
      renderHistoryCards,
      renderHistorySummary,
      renderHistoryTable
    });
  }

  window.SpeedLabHistoryView = Object.freeze({
    createHistoryView
  });
})();
