const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const runtimePaths = require("../runtime-paths");

test("runtime paths expose stable public-to-disk mapping", () => {
  assert.equal(
    runtimePaths.createPublicReportPath(12, "run-3.json"),
    "/results/test-12/run-3.json"
  );

  assert.ok(
    runtimePaths.resolvePublicAssetPath("/results/test-12/run-3.json")
      .endsWith(path.join("app-data", "results", "test-12", "run-3.json"))
  );
});
