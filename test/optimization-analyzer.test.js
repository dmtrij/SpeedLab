const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildOptimizationReportFromAudits,
  emptyOptimizationReport
} = require("../optimization-analyzer");

test("emptyOptimizationReport returns a stable shape", () => {
  assert.deepEqual(emptyOptimizationReport(), {
    summary: {
      reportCount: 0,
      workItemCount: 0,
      topCategory: null,
      totalBlockingMs: 0,
      totalWastedKb: 0,
      totalTransferKb: 0
    },
    workItems: []
  });
});

test("buildOptimizationReportFromAudits ranks render-blocking before smaller byte savings", () => {
  const report = buildOptimizationReportFromAudits([{
    "render-blocking-resources": {
      score: 0,
      title: "Render blocking",
      details: {
        items: [
          { url: "https://site.test/wp-content/themes/site/main.css", wastedMs: 900, totalBytes: 120000 },
          { url: "https://site.test/wp-content/plugins/slider/slider.js", wastedMs: 500, totalBytes: 90000 }
        ]
      }
    },
    "unused-javascript": {
      score: 0.4,
      title: "Unused JS",
      details: {
        items: [
          { url: "https://site.test/wp-content/plugins/gallery/gallery.js", wastedBytes: 180000, totalBytes: 260000 }
        ]
      }
    }
  }]);

  assert.equal(report.summary.reportCount, 1);
  assert.equal(report.summary.workItemCount, 3);
  assert.equal(report.workItems[0].id, "render-blocking-css");
  assert.equal(report.workItems[0].category, "css");
  assert.equal(report.workItems[0].impact.renderBlockingMs, 900);
  assert.match(report.workItems[0].resources[0].url, /main\.css/);
});

test("buildOptimizationReportFromAudits does not rank cache bytes above render-blocking impact", () => {
  const report = buildOptimizationReportFromAudits([{
    "render-blocking-resources": {
      score: 0,
      title: "Render blocking",
      details: {
        items: [
          { url: "https://site.test/app.css", wastedMs: 900, totalBytes: 12000 }
        ]
      }
    },
    "uses-long-cache-ttl": {
      score: 0,
      title: "Cache",
      details: {
        items: [
          { url: "https://cdn.example.com/large-vendor.js", wastedBytes: 2500000, totalBytes: 3000000 }
        ]
      }
    }
  }]);

  assert.equal(report.workItems[0].id, "render-blocking-css");
  assert.ok(
    report.workItems.findIndex((item) => item.id === "improve-static-cache") >
    report.workItems.findIndex((item) => item.id === "render-blocking-css")
  );
});

test("buildOptimizationReportFromAudits groups repeated third-party scripts", () => {
  const audit = {
    "third-party-summary": {
      score: 0,
      title: "Third-party",
      details: {
        items: [
          { url: "https://chat.example/widget.js", wastedMs: 350, totalBytes: 100000 }
        ]
      }
    }
  };

  const report = buildOptimizationReportFromAudits([audit, audit]);
  const thirdParty = report.workItems.find((item) => item.id === "delay-third-party-js");

  assert.ok(thirdParty);
  assert.equal(thirdParty.resources[0].occurrences, 2);
  assert.equal(thirdParty.resources[0].thirdParty, true);
  assert.ok(thirdParty.priority > 0);
});

test("buildOptimizationReportFromAudits creates image and font work items", () => {
  const report = buildOptimizationReportFromAudits([{
    "largest-contentful-paint-element": {
      score: 0,
      title: "LCP element",
      details: { items: [{ url: "https://site.test/uploads/hero.jpg", wastedMs: 700, totalBytes: 400000 }] }
    },
    "font-display": {
      score: 0,
      title: "Font display",
      details: { items: [{ url: "https://site.test/fonts/brand.woff2", wastedMs: 120, totalBytes: 32000 }] }
    }
  }]);

  assert.ok(report.workItems.some((item) => item.id === "optimize-lcp-image"));
  assert.ok(report.workItems.some((item) => item.id === "optimize-font-loading"));
});
