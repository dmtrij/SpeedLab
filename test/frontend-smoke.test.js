const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");
const publicDir = path.join(projectRoot, "public");

function readDeferredScripts() {
  const html = fs.readFileSync(path.join(publicDir, "index.html"), "utf8");
  const scripts = [];
  const scriptPattern = /<script\s+[^>]*src="([^"]+)"[^>]*\sdefer[^>]*><\/script>/g;

  for (const match of html.matchAll(scriptPattern)) {
    const pathname = new URL(match[1], "http://localhost").pathname;
    scripts.push(path.join(publicDir, pathname));
  }

  return scripts;
}

function createMockElement() {
  return {
    classList: {
      add() {},
      remove() {},
      toggle() {
        return true;
      },
    },
    dataset: {},
    hidden: false,
    innerHTML: "",
    style: {},
    textContent: "",
    title: "",
    addEventListener() {},
    getAttribute() {
      return "";
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    setAttribute() {},
  };
}

test("frontend scripts load in index.html order", () => {
  const listeners = [];
  const scripts = readDeferredScripts();
  const document = {
    title: "",
    addEventListener(type) {
      listeners.push(["document", type]);
    },
    getElementById() {
      return createMockElement();
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
  const window = {
    document,
    location: {
      href: "http://localhost:3000/",
      pathname: "/",
      protocol: "http:",
      search: "",
    },
    addEventListener(type) {
      listeners.push(["window", type]);
    },
    alert() {},
    cancelAnimationFrame() {},
    clearTimeout() {},
    confirm() {
      return true;
    },
    requestAnimationFrame() {
      return 1;
    },
    setTimeout() {
      return 1;
    },
  };
  const context = {
    Event: function Event() {},
    FormData: function FormData() {},
    URL,
    URLSearchParams,
    console,
    document,
    fetch: async () => ({
      headers: { get: () => "application/json" },
      json: async () => ({}),
      ok: true,
      text: async () => "",
    }),
    history: {
      pushState() {},
      replaceState() {},
    },
    sessionStorage: {
      getItem() {
        return null;
      },
      removeItem() {},
    },
    window,
  };

  vm.createContext(context);

  for (const scriptPath of scripts) {
    vm.runInContext(fs.readFileSync(scriptPath, "utf8"), context, {
      filename: path.relative(projectRoot, scriptPath),
    });
  }

  assert.deepEqual(
    [
      "SpeedLabConstants",
      "SpeedLabUtils",
      "SpeedLabFormatters",
      "SpeedLabApi",
      "SpeedLabRouter",
      "SpeedLabAnimations",
      "SpeedLabCustomSelect",
      "SpeedLabLauncher",
      "SpeedLabHistoryActions",
      "SpeedLabTestActions",
      "SpeedLabHistoryView",
      "SpeedLabTestView",
    ].filter((globalName) => !window[globalName]),
    []
  );
  assert.equal(scripts.at(-1), path.join(publicDir, "app.js"));
  assert.ok(listeners.length >= 3);
});
