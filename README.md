# SpeedLab

Current project snapshot and next-step plan:

- `PROJECT_STATUS.md`
- `TEST_PLAN.md`

SpeedLab is a local web app for repeatable Lighthouse performance checks. It opens on `http://localhost:3000`, saves raw JSON reports, computes medians across repeated runs, and compares each completed test with the previous completed test for the same URL, device, and execution source.

## Supported execution sources

- `Local Lighthouse`
  Runs Chrome headless on your machine with the local Lighthouse package.
- `Google PSI API`
  Calls the official PageSpeed Insights API and stores the full API response JSON for each run.

SpeedLab keeps local and PSI history separate for comparisons so the verdict is not polluted by mixing two different test environments.
For repeated PSI runs, SpeedLab starts with the original URL. If Google returns an identical lab snapshot, SpeedLab retries that run with a `speedlab_psi_run` cache-busting query parameter so the series is less likely to collapse into cached duplicates.

## Requirements

- Node.js 20+
- Google Chrome or Chromium installed locally for `Local Lighthouse`

## Install

```bash
npm install
```

## Run

```bash
npm start
```

For development with auto-restart:

```bash
npm run dev
```

Then open:

```text
http://localhost:3000
```

By default SpeedLab binds only to `127.0.0.1`. If you really need another interface, set `HOST` before start.
Runtime data is stored in `app-data/` by default. To place it elsewhere, set `SPEEDLAB_DATA_DIR` before start.

## Windows shortcut and tray icon

Create a desktop shortcut:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\install-shortcut.ps1
```

Then launch `SpeedLab` from the desktop. It starts hidden, opens `http://localhost:3000`, and keeps only a tray icon with actions: open, restart server, stop server, exit.

You can also launch the tray wrapper directly:

```powershell
.\SpeedLab Tray.bat
```

## Optional PSI API key

For `Google PSI API` runs you can:

- paste a key into the UI field for that launch only, or
- set `PSI_API_KEY` in the environment before starting the server

Why it matters:

- unauthenticated PSI requests can hit rate limits
- a key makes the PSI mode more reliable for repeated tests

The UI key is used only for the active request and is not stored in SQLite.

For a local persistent setup without touching shell environment variables, you can also create:

```text
.env.local
```

with:

```text
PSI_API_KEY=YOUR_KEY
```

Template:

```text
.env.local.example
```

Keep `.env.local` local to your machine and do not share it.

## How to use the panel

1. Enter a full URL starting with `http://` or `https://`.
2. Choose `1` to `20` runs.
3. Choose `mobile` or `desktop`.
4. Choose where to run the test:
   `Local Lighthouse` or `Google PSI API`.
5. If you use `Local Lighthouse`, optionally leave `Warmup run` enabled.
6. Add an optional note such as `before fonts` or `after cache`.
7. Click `Start test`.

The UI will show:

- progress bar
- current status
- live text log
- impact-first optimization plan
- summary cards after completion
- accordion sections with metrics, comparison, diagnostics, per-run rows, and raw JSON links

If another test is already running, the next launch is added to the queue instead of failing.
You can cancel queued or active tests from the UI, and retry a finished test with the same settings.
If you run PSI with more than one request, SpeedLab will still mark any duplicate snapshots, but it now retries exact duplicates with a cache-busting URL before saving the run.

## History and detail routes

- `/` - start a new test
- `/history` - table of saved tests
- `/test/:id` - full report for one test

## Frontend structure

The browser UI is plain JavaScript split into small global modules loaded from `public/index.html`:

- `constants.js` - UI strings and metric thresholds
- `utils.js` - generic escaping, dates, bytes, and small helpers
- `formatters.js` - domain labels, metric formatting, status/verdict classes
- `api.js` - JSON API client
- `router.js` - SPA link handling and history navigation
- `animations.js` - progress bar and score gear animation state
- `launcher.js` - new-test form behavior and submit flow
- `history-actions.js` - history card/table actions
- `test-actions.js` - test detail page actions
- `history-view.js` - history summary/cards/table markup
- `test-view.js` - test detail report markup
- `app.js` - page orchestration and route-level wiring

## Manual UI QA checklist

After frontend wiring changes, verify these flows in the browser:

1. Start a local test from `/` and confirm it navigates to `/test/:id`.
2. Switch runner presets between Local, PSI single, and PSI series; check runs/warmup/API key fields.
3. Open `/history`, filter by URL, expand a history card, pin/unpin a test, and open a test.
4. From a running or queued test, cancel it and confirm the detail page refreshes.
5. From a completed test, retry it and confirm the new test opens.
6. On a test detail page, switch the test selector and baseline selector.
7. Export a completed test as Markdown from history or detail page.

## Where reports are stored

SQLite database:

```text
app-data/speedlab.db
```

Raw JSON per measured run:

```text
app-data/results/test-{id}/run-{n}.json
```

- `Local Lighthouse` saves the Lighthouse JSON report
- `Google PSI API` saves the full PSI API response JSON
- transient Chrome profiles live in `app-data/chrome-data/`
- tray/server logs and PID file also live in `app-data/`

Warmup runs are excluded from saved run rows and statistics.

## Median first, not average

SpeedLab uses the **median** of repeated runs as the primary comparison value.

Why:

- Lighthouse has natural variability between runs.
- A single run is noisy and can be skewed by CPU contention, network jitter, and cache state.
- Median is more stable than average when one run spikes badly.

The app also shows:

- `min`
- `max`
- `spread = max - min`

## Verdict rules

The current completed test is compared with the previous completed test for the same:

- URL
- device
- runner

Rules:

- `Improved`: score increased by `3+` and LCP did not get worse
- `Worse`: score decreased by `3+` or LCP got worse by `0.3s+`
- `Noise`: changes stayed below those thresholds

## Optimization plan

SpeedLab builds an internal optimization model from raw Lighthouse/PSI audits before rendering the report.
The model groups resources into work items such as:

- defer render-blocking JavaScript
- remove render-blocking CSS from first paint
- delay third-party scripts
- reduce JavaScript execution cost
- optimize the LCP image
- compress and resize heavy images
- optimize font loading
- improve static asset caching

The UI and Markdown export sort these work items by expected impact, not by file count. LCP, TBT, FCP, render-blocking time, repeated occurrences across runs, transfer weight, confidence, and implementation risk all affect priority.

Existing diagnostics and heavy-resource tables remain available; the optimization plan is an additional layer that turns raw audits into an ordered work plan.

## CLI single run

Local Lighthouse example:

```bash
npm run test:single -- --url=https://example.com --runs=3 --device=mobile --runner=local --warmup=true --note="local batch"
```

Google PSI API example:

```bash
npm run test:single -- --url=https://example.com --runs=2 --device=mobile --runner=psi --psiApiKey=YOUR_KEY --note="psi batch"
```
