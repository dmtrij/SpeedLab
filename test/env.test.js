const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { loadLocalEnvFile } = require("../env");

test("loadLocalEnvFile loads values, trims quotes, and keeps existing env values", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "speedlab-env-"));
  const envPath = path.join(tempDir, ".env.local");

  fs.writeFileSync(envPath, [
    "# comment",
    " PSI_API_KEY = \"abc123\" ",
    "HOST=0.0.0.0",
    "EMPTY=",
    "BROKEN_LINE",
    "EXISTING=from-file"
  ].join("\n"));

  const env = {
    EXISTING: "from-env"
  };

  loadLocalEnvFile(envPath, env);

  assert.equal(env.PSI_API_KEY, "abc123");
  assert.equal(env.HOST, "0.0.0.0");
  assert.equal(env.EMPTY, "");
  assert.equal(env.EXISTING, "from-env");
});
