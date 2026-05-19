const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const projectRoot = path.resolve(__dirname, "..");

const ignoredDirs = new Set([".git", "app-data", "node_modules"]);
const ignoredFiles = new Set(["package-lock.json"]);
const textExtensions = new Set([
  ".bat",
  ".css",
  ".html",
  ".js",
  ".json",
  ".md",
  ".ps1",
  ".svg",
  ".vbs",
]);

const mojibakeMarkers = [
  "\u0420\u0401",
  "\u0420\u0453",
  "\u0420\u0406",
  "\u0420\u2018",
  "\u0420\u2019",
  "\u0420\u201c",
  "\u0420\u201d",
  "\u0420\u2022",
  "\u0420\u2013",
  "\u0420\u2014",
  "\u0420\u0458",
  "\u0420\u2122",
  "\u0420\u045a",
  "\u0420\u203a",
  "\u0420\u040a",
  "\u0420\u040c",
  "\u0420\u040b",
  "\u0420\u040f",
  "\u0420\u0452",
  "\u0420\u0455",
  "\u0420\u0456",
  "\u0420\u0457",
  "\u0420\u0459",
  "\u0420\u045b",
  "\u0420\u045c",
  "\u0420\u045e",
  "\u0420\u045f",
  "\u0421\u2013",
  "\u0421\u2014",
  "\u0421\u02dc",
  "\u0421\u2122",
  "\u0421\u0161",
  "\u0421\u203a",
  "\u0421\u0153",
  "\u0421\u0453",
  "\u0421\u0455",
  "\u0421\u0458",
  "\u0421\u045a",
  "\u0421\u045c",
  "\u0421\u045e",
  "\u0421\u0403",
  "\u00d0\u201f",
  "\u00d0\u00ae",
  "\u00d0\u00af",
  "\u00d0\u00a1",
  "\u00d0\u00a2",
  "\u00d0\u00a3",
  "\u00d0\u00a4",
  "\u00d0\u00a5",
  "\u00d0\u00a6",
  "\u00d0\u00a7",
  "\u00d0\u00a8",
  "\u00d0\u00a9",
  "\u00d0\u00ac",
  "\u00d0\u00ad",
  "\u00d0\u2019",
  "\u00d0\u201c",
  "\u00d0\u201d",
  "\u00d0\u2013",
  "\u00d0\u2014",
  "\u00d0\u02dc",
  "\u00d0\u2122",
  "\u00d0\u0161",
  "\u00d0\u203a",
  "\u00d0\u0153",
  "\u00d0\u009d",
  "\u00d0\u017e",
  "\u00d0\u00a0",
  "\u00d0\u00b0",
  "\u00d0\u00b1",
  "\u00d0\u00b2",
  "\u00d0\u00b5",
  "\u00d0\u00b8",
  "\u00d0\u00ba",
  "\u00d0\u00bd",
  "\u00d0\u00be",
  "\u00d1\u0081",
  "\u00d1\u0082",
  "\u00d1\u0083",
  "\u00d1\u0087",
  "\u00d1\u0088",
  "\u00d1\u008c",
  "\u00d1\u008b",
  "\u00d1\u008f",
  "\u00e2\u20ac",
  "\u0432\u0402",
  "\u0432\u0402\u045e",
  "\u0420\u0406\u0420\u201a",
  "\u0420\u0406\u0420\u201a\u0421\u045b",
];

function shouldCheckFile(filePath) {
  const basename = path.basename(filePath);

  if (basename.startsWith(".env") || ignoredFiles.has(basename)) {
    return false;
  }

  return textExtensions.has(path.extname(filePath).toLowerCase());
}

function collectTextFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) {
        files.push(...collectTextFiles(fullPath));
      }

      continue;
    }

    if (entry.isFile() && shouldCheckFile(fullPath)) {
      files.push(fullPath);
    }
  }

  return files;
}

test("first-party text files do not contain mojibake markers", () => {
  const failures = [];

  for (const filePath of collectTextFiles(projectRoot)) {
    const contents = fs.readFileSync(filePath, "utf8");
    const relativePath = path.relative(projectRoot, filePath);

    for (const marker of mojibakeMarkers) {
      const index = contents.indexOf(marker);

      if (index === -1) {
        continue;
      }

      const lineNumber = contents.slice(0, index).split(/\r?\n/).length;
      failures.push(`${relativePath}:${lineNumber} contains ${JSON.stringify(marker)}`);
    }
  }

  assert.deepEqual(failures, []);
});
