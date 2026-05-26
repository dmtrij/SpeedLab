const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { once } = require("node:events");

process.env.SPEEDLAB_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "speedlab-visual-"));
process.env.SPEEDLAB_DISABLE_WORKER = "1";
process.env.HOST = "127.0.0.1";
process.env.PORT = "0";

const chromeLauncher = require("chrome-launcher");
const puppeteer = require("puppeteer-core");
const db = require("../db");
const runtimePaths = require("../runtime-paths");
const { createApp } = require("../server");

function seedCompletedTest({ score = 83, lcp = 4060 } = {}) {
  const testId = db.createTest({
    url: "https://example.com/",
    device: "mobile",
    runner: "psi",
    runs: 3,
    warmup: false,
    note: "visual smoke"
  });

  const reportDir = path.join(runtimePaths.resultsDir, `test-${testId}`);
  fs.mkdirSync(reportDir, { recursive: true });

  const rawReport = {
    finalUrl: "https://example.com/",
    audits: {
      "network-requests": {
        details: {
          items: [
            {
              url: "https://example.com/wp-content/plugins/demo/frontend.css?ver=1",
              transferSize: 52000,
              resourceSize: 180000,
              resourceType: "Stylesheet",
              mimeType: "text/css",
              priority: "VeryHigh",
              networkRequestTime: 20,
              networkEndTime: 280
            },
            {
              url: "https://example.com/wp-content/plugins/demo/frontend.js?ver=1",
              transferSize: 78000,
              resourceSize: 220000,
              resourceType: "Script",
              mimeType: "application/javascript",
              priority: "High",
              networkRequestTime: 30,
              networkEndTime: 420
            },
            {
              url: "https://example.com/wp-content/uploads/hero.png",
              transferSize: 420000,
              resourceSize: 420000,
              resourceType: "Image",
              mimeType: "image/png",
              priority: "High",
              networkRequestTime: 60,
              networkEndTime: 900
            }
          ]
        }
      },
      "render-blocking-insight": {
        score: 0,
        details: {
          items: [
            {
              url: "https://example.com/wp-content/plugins/demo/frontend.css?ver=1",
              totalBytes: 52000,
              wastedMs: 700
            }
          ]
        }
      },
      "unused-javascript": {
        score: 0,
        details: {
          items: [
            {
              url: "https://example.com/wp-content/plugins/demo/frontend.js?ver=1",
              totalBytes: 220000,
              wastedBytes: 90000,
              wastedPercent: 41
            }
          ]
        }
      }
    }
  };

  [
    { runIndex: 1, score: 86, fcp: 2410, lcp: 3530, si: 3790, tbt: 0, cls: 0.026, ttfb: 100 },
    { runIndex: 2, score, fcp: 2410, lcp, si: 3820, tbt: 0, cls: 0.026, ttfb: 100 },
    { runIndex: 3, score, fcp: 2410, lcp, si: 3820, tbt: 0, cls: 0.026, ttfb: 100 }
  ].forEach((run) => {
    const reportPath = path.join(reportDir, `run-${run.runIndex}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(rawReport), "utf8");
    db.insertRun({
      testId,
      jsonPath: `/results/test-${testId}/run-${run.runIndex}.json`,
      ...run
    });
  });
  db.updateTest(testId, {
    runs_completed: 3,
    progress_current: 3,
    progress_total: 3
  });
  db.completeTest(testId, {
    score,
    fcp: 2410,
    lcp,
    si: 3820,
    tbt: 0,
    cls: 0.026,
    ttfb: 100
  });

  return testId;
}

test("visual smoke renders report layout, resource inventory, and score gear", async (t) => {
  const chromePath = chromeLauncher.getChromePath();
  if (!chromePath) {
    t.skip("Chrome executable is not available for visual smoke.");
    return;
  }

  seedCompletedTest({ score: 80, lcp: 4360 });
  const currentTestId = seedCompletedTest({ score: 83, lcp: 4060 });
  const app = createApp();
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  let browser = null;

  try {
    browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: "new",
      args: ["--disable-gpu", "--no-sandbox"]
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });

    await page.goto(baseUrl, { waitUntil: "networkidle0" });
    await page.waitForSelector(".form-custom-select .custom-select-button");
    const launchSelects = await page.$$eval(".form-custom-select .custom-select-button", (buttons) =>
      buttons.map((button) => ({
        background: getComputedStyle(button).backgroundColor,
        text: button.textContent.trim()
      }))
    );
    assert.equal(launchSelects.length, 2);
    assert.ok(launchSelects.every((item) => item.background !== "rgb(255, 255, 255)"));
    assert.ok(launchSelects.some((item) => item.text.includes("Lighthouse")));

    await page.goto(`${baseUrl}/test/${currentTestId}`, { waitUntil: "networkidle0" });
    await page.waitForSelector(".score-hero-gear-tooth");
    const detailState = await page.evaluate(() => ({
      duplicateLabels: Array.from(document.querySelectorAll(".run-duplicate-label")).map((item) => item.textContent.trim()),
      gearTeeth: document.querySelectorAll(".score-hero-gear-tooth").length,
      hasProgress: Boolean(document.querySelector(".progress-luxury")),
      hasStatusGrid: Boolean(document.querySelector(".status-overview-grid")),
      hasRunQualitySummary: Boolean(document.querySelector(".run-quality-summary")),
      hasComparisonQuality: Boolean(document.querySelector(".comparison-quality-note")),
      hasPayloadReport: Boolean(document.querySelector(".payload-report")),
      resourceShortcutCount: document.querySelectorAll(".resource-shortcut").length,
      resourceShortcutHasLongText: Array.from(document.querySelectorAll(".resource-shortcut")).some((item) => Boolean(item.querySelector("small"))),
      assetInventoryItems: document.querySelectorAll("[data-asset-item]").length,
      assetInventoryListOverflow: getComputedStyle(document.querySelector(".asset-inventory-list")).overflowY,
      criticalItems: document.querySelectorAll(".asset-action-plan .asset-inventory-item").length,
      criticalUsesInventoryPattern: Boolean(document.querySelector(".asset-action-plan .asset-inventory-section")),
      legacyActionRows: document.querySelectorAll(".asset-action-row").length,
      oldActionCards: document.querySelectorAll(".asset-action-card").length,
      resourceAccordionCount: document.querySelectorAll(".accordion summary").length,
      screenshotAreaText: document.querySelector(".stage-card")?.textContent || ""
    }));

    assert.equal(detailState.gearTeeth, 20);
    assert.equal(detailState.hasProgress, true);
    assert.equal(detailState.hasStatusGrid, true);
    assert.equal(detailState.hasRunQualitySummary, true);
    assert.equal(detailState.hasComparisonQuality, true);
    assert.equal(detailState.hasPayloadReport, true);
    assert.ok(detailState.resourceShortcutCount >= 2);
    assert.equal(detailState.resourceShortcutHasLongText, false);
    assert.ok(detailState.assetInventoryItems >= 3);
    assert.equal(detailState.assetInventoryListOverflow, "auto");
    assert.ok(detailState.criticalItems >= 2);
    assert.equal(detailState.criticalUsesInventoryPattern, true);
    assert.equal(detailState.legacyActionRows, 0);
    assert.equal(detailState.oldActionCards, 0);
    assert.equal(detailState.resourceAccordionCount, 0);
    assert.ok(detailState.duplicateLabels.includes("дубликат #2"));
    assert.match(detailState.screenshotAreaText, /Уникальных результатов: 2 \/ 3/);

    const screenshot = await page.screenshot({ encoding: "base64" });
    assert.ok(screenshot.length > 1000);

    for (const viewport of [
      { width: 390, height: 920 },
      { width: 768, height: 920 },
      { width: 1365, height: 920 }
    ]) {
      await page.setViewport({ ...viewport, deviceScaleFactor: 1 });
      await page.goto(`${baseUrl}/test/${currentTestId}`, { waitUntil: "networkidle0" });
      await page.waitForSelector(".status-overview-grid");

      const viewportState = await page.evaluate(() => {
        const shell = document.querySelector(".result-shell");
        return {
          hasStatusGrid: Boolean(document.querySelector(".status-overview-grid")),
          hasRunQualitySummary: Boolean(document.querySelector(".run-quality-summary")),
          hasComparisonQuality: Boolean(document.querySelector(".comparison-quality-note")),
          hasPayloadReport: Boolean(document.querySelector(".payload-report")),
          shellWidth: shell ? Math.ceil(shell.getBoundingClientRect().width) : 0,
          viewportWidth: window.innerWidth
        };
      });

      assert.equal(viewportState.hasStatusGrid, true);
      assert.equal(viewportState.hasRunQualitySummary, true);
      assert.equal(viewportState.hasComparisonQuality, true);
      assert.equal(viewportState.hasPayloadReport, true);
      assert.ok(viewportState.shellWidth <= viewportState.viewportWidth);
      assert.ok((await page.screenshot({ encoding: "base64" })).length > 1000);
    }
  } finally {
    if (browser) {
      await browser.close();
    }
    await new Promise((resolve) => server.close(resolve));
    db.closeDatabase();
  }
});
