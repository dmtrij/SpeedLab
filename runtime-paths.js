const fs = require("fs");
const path = require("path");

const projectDir = __dirname;
const envFilePath = path.join(projectDir, ".env.local");
const publicDir = path.join(projectDir, "public");
const appDataDir = process.env.SPEEDLAB_DATA_DIR
  ? path.resolve(process.env.SPEEDLAB_DATA_DIR)
  : path.join(projectDir, "app-data");
const resultsDir = path.join(appDataDir, "results");
const chromeDataDir = path.join(appDataDir, "chrome-data");
const dbPath = path.join(appDataDir, "speedlab.db");
const dbWalPath = `${dbPath}-wal`;
const dbShmPath = `${dbPath}-shm`;
const stdoutLogPath = path.join(appDataDir, "server.stdout.log");
const stderrLogPath = path.join(appDataDir, "server.stderr.log");
const pidFilePath = path.join(appDataDir, ".speedlab.pid");

const legacyArtifacts = [
  { from: path.join(projectDir, "speedlab.db"), to: dbPath },
  { from: path.join(projectDir, "speedlab.db-wal"), to: dbWalPath },
  { from: path.join(projectDir, "speedlab.db-shm"), to: dbShmPath },
  { from: path.join(projectDir, "results"), to: resultsDir },
  { from: path.join(projectDir, "chrome-data"), to: chromeDataDir },
  { from: path.join(projectDir, "server.stdout.log"), to: stdoutLogPath },
  { from: path.join(projectDir, "server.stderr.log"), to: stderrLogPath },
  { from: path.join(projectDir, ".speedlab.pid"), to: pidFilePath }
];

let prepared = false;

function moveIfNeeded(sourcePath, targetPath) {
  if (!fs.existsSync(sourcePath) || fs.existsSync(targetPath)) {
    return;
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  try {
    fs.renameSync(sourcePath, targetPath);
  } catch {
    // If a legacy artifact is locked, continue with the new layout.
  }
}

function migrateLegacyArtifacts() {
  if (process.env.SPEEDLAB_DATA_DIR) {
    return;
  }

  legacyArtifacts.forEach(({ from, to }) => {
    moveIfNeeded(from, to);
  });
}

function prepareRuntimePaths() {
  if (prepared) {
    return;
  }

  fs.mkdirSync(appDataDir, { recursive: true });
  migrateLegacyArtifacts();
  fs.mkdirSync(resultsDir, { recursive: true });
  fs.mkdirSync(chromeDataDir, { recursive: true });
  prepared = true;
}

function resolveTestResultsDir(testId) {
  return path.join(resultsDir, `test-${testId}`);
}

function resolveChromeProfileDir(testId) {
  return path.join(chromeDataDir, `test-${testId}`);
}

function createPublicReportPath(testId, fileName) {
  return `/results/test-${testId}/${fileName}`;
}

function resolvePublicAssetPath(publicPath) {
  if (!publicPath) {
    return "";
  }

  return path.join(appDataDir, String(publicPath).replace(/^\/+/, ""));
}

module.exports = {
  projectDir,
  envFilePath,
  publicDir,
  appDataDir,
  resultsDir,
  chromeDataDir,
  dbPath,
  dbWalPath,
  dbShmPath,
  stdoutLogPath,
  stderrLogPath,
  pidFilePath,
  prepareRuntimePaths,
  resolveTestResultsDir,
  resolveChromeProfileDir,
  createPublicReportPath,
  resolvePublicAssetPath
};
