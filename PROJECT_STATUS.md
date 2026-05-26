# SpeedLab: Status

Updated: 2026-05-26

## Current State

SpeedLab is a local web app for repeatable Lighthouse and PageSpeed Insights checks.

Current local status:

- Local API is reachable at `http://127.0.0.1:3000`.
- Automated tests pass: `npm test` -> `34/34`.
- Working branch: `main`.
- Working tree is dirty and not committed yet.
- Latest checked target was a disposable sample URL used only to verify SpeedLab behavior.

Execution sources:

- `Local Lighthouse`
- `Google PSI API`

Main routes:

- `/` - launch screen
- `/history` - saved tests
- `/test/:id` - detailed report

Main storage:

- SQLite: `app-data/speedlab.db`
- raw reports: `app-data/results/test-{id}/run-{n}.json`

## What Works Now

- Tests are queued instead of failing on concurrent launches.
- Repeated runs are saved and compared by median.
- Local and PSI history are kept separate.
- PSI duplicate snapshots are detected and retried with cache-busting URLs.
- Single PSI runs can use a hidden decoy run when Google returns the same lab snapshot too quickly.
- Retryable transient PSI errors are retried with a cache-busting URL; quota/key errors are not hidden.
- Completed tests can be compared with a previous baseline.
- Tests can be cancelled, retried, pinned, deleted, and exported to Markdown.
- The detail report shows run quality: saved runs, unique snapshots, duplicates, mitigation, and reliability.
- The detail report has a full resource inventory for JS, CSS, media, fonts, and other resources.
- Resource inventory supports sorting, transfer-size filtering, recommendation filtering, and CSV/JSON exports.
- Reports include concrete optimization priorities based on actual found resources.
- Markdown export includes run quality, comparison quality, resource action plan, risk labels, and real resource URLs.
- Old raw/debug accordions were removed from the visible UI.
- Resource inventory is now a direct report section, not a duplicated accordion wrapper.
- UI has been tightened visually: status/comparison panels, chips, custom selects, score gear, compact tables, resource cards.
- `Контроль серии` was renamed to `Надежность серии`; local runs no longer show PSI-specific wording.
- Resource quick slices were compacted into `Фокус инвентаря` preset pills instead of bulky explanatory cards.
- `Приоритетные задачи оптимизации` were compacted from large cards into dense rows with impact and top resources.
- Removed stale report UI code: old comparison card renderer, legacy progress bar CSS, accordion/log styles, and obsolete comparison-inline styles.
- Manual browser QA covered report pages `#8` and `#9` at desktop, tablet, and mobile widths.
- Mobile overview now collapses correctly to one column.
- Full resource lists remain complete but are capped with internal scrolling, so large reports no longer stretch the page to extreme height.
- Removed additional unused legacy CSS for old metric cards, verdict strips, card grids, and overview cards.

## Latest SpeedLab Verification Runs

Latest saved runs at this checkpoint were made against a sample URL. They are not a customer-site optimization target; they only verify SpeedLab's PSI/local execution, reporting, exports, and reliability logic.

- `#9` - Local Lighthouse, mobile, `5/5` plus warmup, score `51`, FCP `10.62s`, LCP `28.52s`, SI `11.65s`, TBT `235ms`, CLS `0.016`, reliability high.
- `#8` - PSI API Google, mobile, `5/5`, score `37`, FCP `4.43s`, LCP `21.45s`, SI `11.54s`, TBT `841ms`, CLS `0.013`, reliability high.
- `#7` - PSI API Google, desktop, `1/1`, score `39`, LCP `4.38s`, TBT `744ms`, reliability low.
- `#6` - PSI API Google, mobile, `1/1`, score `33`, LCP `20.70s`, TBT `1233ms`, reliability low.
- `#5` - Local Lighthouse, desktop, `5/5`, score `52`, LCP `5.89s`, TBT `0ms`, reliability high.

PSI mobile series `#8` details:

- Unique snapshots: `5/5`.
- Duplicate count: `0`.
- Cache-busting requests used: `9`.
- Hidden decoy runs used: `2`.
- Retry attempts: `4`.
- Resource payload: about `10.90 MiB` transfer, about `15.38 MiB` raw.
- Media payload: about `9.25 MiB` transfer.
- JS payload: about `1.34 MiB` transfer, about `623 KiB` unused.
- CSS payload: about `125 KiB` transfer, `30` render-blocking CSS files.

Local mobile series `#9` details:

- Unique snapshots: `5/5`.
- Resource payload: about `12.23 MiB` transfer.
- Media payload: about `9.29 MiB` transfer.
- JS payload: about `1.66 MiB` transfer.
- CSS payload: about `939 KiB` transfer, `30` render-blocking CSS files.
- Main local confirmation: the site is not only noisy in PSI; local mobile also has very high LCP.

Interpretation for SpeedLab:

- SpeedLab itself is operational.
- Single PSI runs are useful as quick checks only; they are not reliable enough for final decisions.
- PSI series `#8` and local mobile series `#9` both completed and produced high-reliability unique runs.
- Export endpoints work for completed PSI and local series.
- Resource inventory correctly exposes concrete JS, CSS, media, font, and other resources.
- Visual smoke now verifies that the resource report renders as a standalone section with real inventory items and compact preset controls.
- Visual smoke also verifies the dense optimization action rows and concrete resource links.
- JS syntax checks pass for active report scripts after cleanup.
- Browser QA confirms no document-level horizontal overflow after the latest layout fixes.
- API tests assert the report payload contract for run quality, resource summary, action resources, and exports.
- The sample URL findings must not be treated as a real optimization plan.

## Current Architecture

Backend:

- `server.js` - Express app and API routes.
- `db.js` - SQLite access.
- `lighthouse-runner.js` - local Lighthouse execution.
- `psi-runner.js` - PSI execution, cache-busting, duplicate retry, decoy mitigation.
- `report-service.js` - test detail payload, comparison quality, Markdown export, asset exports.
- `optimization-analyzer.js` - audit grouping and prioritization for Markdown/API.
- `stats.js` - metrics, comparisons, diagnostics, resource inventory, recommendations, risk labels.

Frontend:

- `public/index.html` - shell and script load order.
- `public/app.js` - route orchestration.
- `public/launcher.js` - launch form logic.
- `public/history-view.js` / `public/history-actions.js` - history UI.
- `public/test-view.js` / `public/test-actions.js` - detail report UI and resource controls.
- `public/custom-select.js` - shared dark custom dropdowns.
- `public/animations.js` - score gear and progress animation state.
- `public/style.css` - current visual system.

## Known Constraints

- Real Lighthouse/PSI runs are still manual QA, not part of automated tests.
- PSI lab data can still be noisy because Google controls the execution environment and caching behavior.
- Optimization recommendations are SpeedLab output, not automatic patch instructions. Any site-specific implementation must be validated outside SpeedLab.
- The current working tree is not committed, so changes should be reviewed before pushing.

## Next Planned Steps

Priority 1:

- Treat `#8` and `#9` as SpeedLab verification fixtures, not as a site baseline.
- Continue report UI review against real completed tests and fix remaining UX/data issues.
- Decide which UI/report sections are production-ready and remove or simplify low-value sections.
- Add focused tests for any remaining high-value report sections before changing layout again.

Priority 2:

- Fix any remaining mojibake/user-facing broken Cyrillic strings found in first-party source files.
- Add fixture-based tests for full resource inventory from larger real Lighthouse/PSI JSON.
- Add API assertions for the cleaned detail payload shape and export endpoints.

Priority 3:

- Add a higher-level integration test for queue execution and state transitions.
- Commit a stable checkpoint after review.
- Keep this status file updated after meaningful checkpoints.
