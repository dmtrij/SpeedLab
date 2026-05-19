const Database = require("better-sqlite3");
const runtimePaths = require("./runtime-paths");

runtimePaths.prepareRuntimePaths();

const db = new Database(runtimePaths.dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function nowIso() {
  return new Date().toISOString();
}

function hasColumn(tableName, columnName) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return columns.some((column) => column.name === columnName);
}

function ensureColumn(tableName, columnName, definition) {
  if (!hasColumn(tableName, columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tests (
      id INTEGER PRIMARY KEY,
      url TEXT NOT NULL,
      device TEXT NOT NULL,
      runner TEXT NOT NULL DEFAULT 'local',
      runs_requested INTEGER NOT NULL,
      runs_completed INTEGER DEFAULT 0,
      warmup INTEGER DEFAULT 1,
      note TEXT,
      status TEXT NOT NULL,
      progress_current INTEGER DEFAULT 0,
      progress_total INTEGER DEFAULT 0,
      log TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT,
      median_score REAL,
      median_fcp REAL,
      median_lcp REAL,
      median_si REAL,
      median_tbt REAL,
      median_cls REAL,
      median_ttfb REAL
    );

    CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY,
      test_id INTEGER NOT NULL,
      run_index INTEGER NOT NULL,
      score REAL,
      fcp REAL,
      lcp REAL,
      si REAL,
      tbt REAL,
      cls REAL,
      ttfb REAL,
      json_path TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE
    );
  `);

  ensureColumn("tests", "runner", "TEXT NOT NULL DEFAULT 'local'");
  ensureColumn("tests", "pinned", "INTEGER DEFAULT 0");

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tests_url_device_created
      ON tests(url, device, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_tests_url_device_runner_created
      ON tests(url, device, runner, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_runs_test_id_run_index
      ON runs(test_id, run_index);
  `);

  const interruptedAt = nowIso();
  const entry = `[${interruptedAt}] Предыдущий процесс завершился во время активного теста. Тест помечен как failed при старте сервера.`;
  db.prepare(`
    UPDATE tests
    SET status = 'failed',
        completed_at = COALESCE(completed_at, @completedAt),
        error_message = COALESCE(error_message, 'Сервер был перезапущен во время выполнения теста'),
        log = CASE
          WHEN COALESCE(log, '') = '' THEN @entry
          ELSE log || char(10) || @entry
        END
    WHERE status NOT IN ('completed', 'failed', 'cancelled', 'pending')
  `).run({ completedAt: interruptedAt, entry });
}

function appendLog(testId, message) {
  const entry = `[${nowIso()}] ${message}`;
  db.prepare(`
    UPDATE tests
    SET log = CASE
      WHEN COALESCE(log, '') = '' THEN @entry
      ELSE log || char(10) || @entry
    END
    WHERE id = @testId
  `).run({ testId, entry });
}

function createTest({ url, device, runner, runs, warmup, note }) {
  const createdAt = nowIso();
  const stmt = db.prepare(`
    INSERT INTO tests (
      url,
      device,
      runner,
      runs_requested,
      runs_completed,
      warmup,
      note,
      status,
      progress_current,
      progress_total,
      log,
      created_at
    )
    VALUES (
      @url,
      @device,
      @runner,
      @runsRequested,
      0,
      @warmup,
      @note,
      'pending',
      0,
      @progressTotal,
      '',
      @createdAt
    )
  `);

  const info = stmt.run({
    url,
    device,
    runner,
    runsRequested: runs,
    warmup: warmup ? 1 : 0,
    note: note || null,
    progressTotal: runs + (warmup ? 1 : 0),
    createdAt
  });

  return Number(info.lastInsertRowid);
}

function updateTest(testId, fields) {
  const entries = Object.entries(fields).filter(([, value]) => value !== undefined);
  if (!entries.length) {
    return;
  }

  const columns = entries.map(([key]) => `${key} = @${key}`).join(", ");
  const params = Object.fromEntries(entries);
  params.testId = testId;

  db.prepare(`UPDATE tests SET ${columns} WHERE id = @testId`).run(params);
}

function completeTest(testId, medians) {
  updateTest(testId, {
    status: "completed",
    completed_at: nowIso(),
    median_score: medians.score ?? null,
    median_fcp: medians.fcp ?? null,
    median_lcp: medians.lcp ?? null,
    median_si: medians.si ?? null,
    median_tbt: medians.tbt ?? null,
    median_cls: medians.cls ?? null,
    median_ttfb: medians.ttfb ?? null
  });
}

function failTest(testId, message) {
  updateTest(testId, {
    status: "failed",
    completed_at: nowIso(),
    error_message: message
  });
}

function cancelTest(testId, message) {
  updateTest(testId, {
    status: "cancelled",
    completed_at: nowIso(),
    error_message: message || null
  });
}

function insertRun({ testId, runIndex, score, fcp, lcp, si, tbt, cls, ttfb, jsonPath }) {
  db.prepare(`
    INSERT INTO runs (
      test_id,
      run_index,
      score,
      fcp,
      lcp,
      si,
      tbt,
      cls,
      ttfb,
      json_path,
      created_at
    )
    VALUES (
      @testId,
      @runIndex,
      @score,
      @fcp,
      @lcp,
      @si,
      @tbt,
      @cls,
      @ttfb,
      @jsonPath,
      @createdAt
    )
  `).run({
    testId,
    runIndex,
    score,
    fcp,
    lcp,
    si,
    tbt,
    cls,
    ttfb,
    jsonPath,
    createdAt: nowIso()
  });
}

function getTestById(testId) {
  return db.prepare("SELECT * FROM tests WHERE id = ?").get(testId) || null;
}

function deleteTest(testId) {
  return db.prepare("DELETE FROM tests WHERE id = ?").run(testId).changes > 0;
}

function deleteAllTests() {
  db.prepare("DELETE FROM tests").run();
}

function setPinned(testId, pinned) {
  return db.prepare("UPDATE tests SET pinned = @pinned WHERE id = @testId")
    .run({ testId, pinned: pinned ? 1 : 0 }).changes > 0;
}

function getRunsByTestId(testId) {
  return db.prepare(`
    SELECT *
    FROM runs
    WHERE test_id = ?
    ORDER BY run_index ASC
  `).all(testId);
}

function listTests(urlFilter = "") {
  if (urlFilter.trim()) {
    return db.prepare(`
      SELECT *
      FROM tests
      WHERE url LIKE @pattern
      ORDER BY pinned DESC, datetime(created_at) DESC, id DESC
    `).all({ pattern: `%${urlFilter.trim()}%` });
  }

  return db.prepare(`
    SELECT *
    FROM tests
    ORDER BY pinned DESC, datetime(created_at) DESC, id DESC
  `).all();
}

function listCompletedTestsFor(url, device, runner, excludeTestId = null) {
  return db.prepare(`
    SELECT *
    FROM tests
    WHERE url = @url
      AND device = @device
      AND runner = @runner
      AND status = 'completed'
      AND (@excludeTestId IS NULL OR id <> @excludeTestId)
    ORDER BY pinned DESC, datetime(completed_at) DESC, id DESC
  `).all({ url, device, runner, excludeTestId });
}

function listCompletedTestsGroup(url, device, runner) {
  return db.prepare(`
    SELECT *
    FROM tests
    WHERE url = @url
      AND device = @device
      AND runner = @runner
      AND status = 'completed'
    ORDER BY datetime(completed_at) DESC, id DESC
  `).all({ url, device, runner });
}

function getNextPendingTest() {
  return db.prepare(`
    SELECT *
    FROM tests
    WHERE status = 'pending'
    ORDER BY id ASC
    LIMIT 1
  `).get() || null;
}

function countPendingTests() {
  return db.prepare(`
    SELECT COUNT(*) AS count
    FROM tests
    WHERE status = 'pending'
  `).get().count;
}

function getPendingPosition(testId) {
  const test = getTestById(testId);
  if (!test || test.status !== "pending") {
    return null;
  }

  return db.prepare(`
    SELECT COUNT(*) AS count
    FROM tests
    WHERE status = 'pending'
      AND id <= ?
  `).get(testId).count;
}

function getActiveTest() {
  return db.prepare(`
    SELECT *
    FROM tests
    WHERE status NOT IN ('completed', 'failed', 'cancelled')
    ORDER BY id DESC
    LIMIT 1
  `).get() || null;
}

function getPreviousCompletedTest(url, device, runner, currentTestId) {
  return db.prepare(`
    SELECT *
    FROM tests
    WHERE url = @url
      AND device = @device
      AND runner = @runner
      AND status = 'completed'
      AND id <> @currentTestId
    ORDER BY datetime(completed_at) DESC, id DESC
    LIMIT 1
  `).get({ url, device, runner, currentTestId }) || null;
}

function closeDatabase() {
  db.close();
}

module.exports = {
  initializeDatabase,
  appendLog,
  createTest,
  updateTest,
  completeTest,
  failTest,
  cancelTest,
  insertRun,
  getTestById,
  deleteTest,
  deleteAllTests,
  setPinned,
  getRunsByTestId,
  listTests,
  listCompletedTestsFor,
  listCompletedTestsGroup,
  getNextPendingTest,
  countPendingTests,
  getPendingPosition,
  getActiveTest,
  getPreviousCompletedTest,
  closeDatabase
};
