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

  [
    { runIndex: 1, score: 86, fcp: 2410, lcp: 3530, si: 3790, tbt: 0, cls: 0.026, ttfb: 100 },
    { runIndex: 2, score, fcp: 2410, lcp, si: 3820, tbt: 0, cls: 0.026, ttfb: 100 },
    { runIndex: 3, score, fcp: 2410, lcp, si: 3820, tbt: 0, cls: 0.026, ttfb: 100 }
  ].forEach((run) => {
    db.insertRun({
      testId,
      jsonPath: "",
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

test("visual smoke renders custom selects, run duplicates, and score gear", async (t) => {
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
      screenshotAreaText: document.querySelector(".stage-card")?.textContent || ""
    }));

    assert.equal(detailState.gearTeeth, 28);
    assert.equal(detailState.hasProgress, true);
    assert.equal(detailState.hasStatusGrid, true);
    assert.ok(detailState.duplicateLabels.includes("дубликат #2"));
    assert.match(detailState.screenshotAreaText, /Уникальных результатов: 2 \/ 3/);

    const screenshot = await page.screenshot({ encoding: "base64" });
    assert.ok(screenshot.length > 1000);
  } finally {
    if (browser) {
      await browser.close();
    }
    await new Promise((resolve) => server.close(resolve));
    db.closeDatabase();
  }
});
