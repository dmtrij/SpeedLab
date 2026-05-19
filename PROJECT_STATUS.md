# SpeedLab: Status

Updated: 2026-05-19

## Current state

SpeedLab is a local web app for repeatable Lighthouse performance checks with two execution sources:

- `Local Lighthouse`
- `Google PSI API`

Current operating documents:

- `PROJECT_STATUS.md`
- `TEST_PLAN.md`

The current project already covers the main workflow:

- start a new test from the browser UI
- queue tests instead of failing on concurrent launches
- run repeated measurements and compute medians
- keep local and PSI history separate
- compare a completed test with a previous baseline
- save raw JSON reports for each run
- export a completed test as Markdown
- cancel, retry, pin, delete, and browse tests from history
- render an optimization plan from Lighthouse/PSI audits

Main routes:

- `/` - launch screen
- `/history` - saved tests
- `/test/:id` - detailed report

Main storage:

- SQLite: `app-data/speedlab.db`
- raw reports: `app-data/results/test-{id}/run-{n}.json`

## What was completed recently

The latest completed checkpoint was the reporting and analysis layer:

- `report-service.js` now builds a full API response for test details
- `optimization-analyzer.js` groups raw audits into prioritized work items
- `public/test-view.js` renders the optimization plan and baseline selector
- `server.js` exposes Markdown export at `/api/tests/:id/export.md`
- frontend SPA routing for `/`, `/history`, and `/test/:id` is wired
- regression tests cover API flow, frontend script load order, text encoding, and optimization analyzer logic

As of 2026-05-19, `npm test` passes: `25/25`.

## Current architecture

Backend:

- `server.js` - Express app and API routes
- `db.js` - SQLite access
- `lighthouse-runner.js` - local Lighthouse execution
- `psi-runner.js` - PSI execution
- `report-service.js` - test detail payload and Markdown export
- `optimization-analyzer.js` - audit grouping and prioritization
- `stats.js` - metrics, comparisons, diagnostics

Frontend:

- `public/index.html` - shell
- `public/app.js` - route orchestration
- `public/*-view.js` - route rendering
- `public/*-actions.js` - UI actions
- `public/launcher.js` - launch form logic

Tests:

- `test/api.test.js`
- `test/frontend-smoke.test.js`
- `test/optimization-analyzer.test.js`
- `test/text-encoding.test.js`
- plus unit tests for env, runtime paths, stats, cancellation, and test-domain logic

## Known constraints

- The folder is currently not a Git repository, so project history is reconstructed from file timestamps only.
- There is no automated end-to-end test that performs a real Lighthouse or PSI run.
- Optimization work items are covered by unit tests, but still need validation on more real-world reports.
- Browser QA remains necessary after UI changes.

## Next planned steps

Priority 1:

- run manual end-to-end QA for all core flows:
  - local test launch
  - PSI single run
  - PSI repeated series
  - cancel queued test
  - retry completed test
  - baseline switching on `/test/:id`
  - Markdown export from history and detail page

Priority 2:

- add fixture-based tests for `optimization-analyzer.js` using real Lighthouse/PSI report fragments
- verify that top-ranked work items are useful on actual customer URLs and not just synthetic cases

Priority 3:

- add a higher-level integration test for queue execution and state transitions
- document a release/startup checklist for local usage and tray launch

Priority 4:

- if the project continues to evolve actively, initialize Git and start keeping real change history

## Working note

This file should be updated after each meaningful checkpoint:

- what was finished
- what changed in architecture or UX
- what is blocked
- what is planned next
