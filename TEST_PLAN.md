# SpeedLab Test Plan

Updated: 2026-05-19

## Goal

Collect a clean and comparable set of SpeedLab reports that can be analyzed later for:

- current bottlenecks
- stable vs noisy metrics
- local vs PSI differences
- before/after comparisons after changes

This plan is written for manual execution first. After the reports exist, analysis should be done from:

- test IDs in SpeedLab history
- Markdown exports
- raw JSON reports in `app-data/results/`

## Preconditions

Before running the plan:

1. Start the app:

```bash
npm start
```

2. Open:

```text
http://localhost:3000
```

3. Verify local environment:

- Node.js 20+
- Chrome or Chromium installed
- stable network
- no heavy local CPU load
- close extra tabs and large background tasks

4. For PSI runs, prepare one of:

- UI field with a temporary API key
- `.env.local` with `PSI_API_KEY=...`

5. Keep page state consistent:

- same public URL each time
- same cache/CDN state if you are comparing before vs after
- same cookie/banner state where possible
- no manual query params unless they are part of the real production URL

## Resource inventory

Fill this table with real URLs before running the full plan.

| Resource ID | Page type | URL | Why this page matters | Pack |
|---|---|---|---|---|
| R1 | Home page | `[fill]` | Main entry point, hero, global CSS/JS | Full |
| R2 | Main service or landing page | `[fill]` | Primary conversion path | Full |
| R3 | Media-heavy page | `[fill]` | Largest images, embeds, sliders, galleries | Full |
| R4 | Content/article page | `[fill]` | Real text page, fonts, content layout | Core |
| R5 | Contact or lead form page | `[fill]` | Conversion form, scripts, validation, maps | Core |
| R6 | Listing/archive/catalog page | `[fill]` | Card grids, repeated images, pagination | Core |
| R7 | Product/case page | `[fill]` | Deep content and real user intent page | Core |
| R8 | Private/staging/auth-only page | `[fill or skip]` | Local-only validation if PSI is impossible | Local only |

Pack meaning:

- `Full` = all baseline run packs
- `Core` = local mobile, local desktop, PSI mobile single
- `Local only` = only local packs

If you only want the minimum useful dataset, run:

- R1
- R2
- R3
- R5

## Run packs

These are the standard launch presets to use for each resource.

### Pack A: Local Mobile Baseline

Use this as the main decision-making dataset.

- runner: `Local Lighthouse`
- device: `mobile`
- runs: `5`
- warmup: `on`
- note pattern: `baseline | <resource_id> | local | mobile | <date>`

### Pack B: Local Desktop Baseline

Use this to catch desktop-only regressions and wide-layout issues.

- runner: `Local Lighthouse`
- device: `desktop`
- runs: `5`
- warmup: `on`
- note pattern: `baseline | <resource_id> | local | desktop | <date>`

### Pack C: PSI Mobile Single

Use this as an external reference snapshot.

- runner: `Google PSI API`
- device: `mobile`
- runs: `1`
- warmup: `not used`
- note pattern: `baseline | <resource_id> | psi | mobile | <date>`

### Pack D: PSI Mobile Series

Use this only when you want to check PSI consistency or compare repeated public snapshots.

- runner: `Google PSI API`
- device: `mobile`
- runs: `3`
- warmup: `not used`
- note pattern: `consistency | <resource_id> | psi | mobile | <date>`

## Recommended execution order

Run in this order for each resource:

1. Pack A: local mobile
2. Pack B: local desktop
3. Pack C: PSI mobile single
4. Pack D: PSI mobile series only for important pages

Recommended first wave:

1. R1 home page
2. R2 main service or landing
3. R3 media-heavy page
4. R5 contact or lead form page

Recommended second wave:

1. R4 article/content page
2. R6 listing/archive/catalog
3. R7 product/case page
4. R8 local-only private page if needed

## How to run from the UI

For each run:

1. Open `/`.
2. Paste the real URL.
3. Select the correct preset:
   `Local: stable median`, `PSI: fast check`, or `PSI: series`.
4. Confirm the runner, device, runs, and warmup values.
5. Add a structured note using the note pattern from the pack.
6. Click `Start test`.
7. Wait until the test is completed.
8. Record the test ID from the detail page or history.
9. Optionally open `Report MD` and keep the export.

## How to run from the CLI

Local mobile example:

```bash
npm run test:single -- --url=https://example.com --runs=5 --device=mobile --runner=local --warmup=true --note="baseline | R1 | local | mobile | 2026-05-19"
```

Local desktop example:

```bash
npm run test:single -- --url=https://example.com --runs=5 --device=desktop --runner=local --warmup=true --note="baseline | R1 | local | desktop | 2026-05-19"
```

PSI mobile single example:

```bash
npm run test:single -- --url=https://example.com --runs=1 --device=mobile --runner=psi --psiApiKey=YOUR_KEY --note="baseline | R1 | psi | mobile | 2026-05-19"
```

PSI mobile series example:

```bash
npm run test:single -- --url=https://example.com --runs=3 --device=mobile --runner=psi --psiApiKey=YOUR_KEY --note="consistency | R1 | psi | mobile | 2026-05-19"
```

Use CLI when you want a reproducible one-off run or when the browser UI is not convenient.
Use the UI when you want to inspect progress, queue state, history, and follow-up actions.

## Minimal dataset

If time is limited, collect only this:

| Resource | Pack A | Pack B | Pack C | Pack D |
|---|---:|---:|---:|---:|
| R1 Home | Yes | Yes | Yes | Yes |
| R2 Main landing | Yes | Yes | Yes | No |
| R3 Media-heavy | Yes | Yes | Yes | Yes |
| R5 Contact/form | Yes | No | Yes | No |

This already gives enough data for a meaningful first analysis.

## Full dataset

If you want a broader baseline, collect this:

| Resource | Pack A | Pack B | Pack C | Pack D |
|---|---:|---:|---:|---:|
| R1 Home | Yes | Yes | Yes | Yes |
| R2 Main landing | Yes | Yes | Yes | No |
| R3 Media-heavy | Yes | Yes | Yes | Yes |
| R4 Article/content | Yes | Yes | Yes | No |
| R5 Contact/form | Yes | Yes | Yes | No |
| R6 Listing/archive | Yes | Yes | Yes | No |
| R7 Product/case | Yes | Yes | Yes | No |
| R8 Private/staging | Yes | Yes | No | No |

## Result log template

Record completed tests here or in a separate note:

| Resource ID | URL | Pack | Test ID | Status | Note | Export kept |
|---|---|---|---:|---|---|---|
| R1 | `[fill]` | A | `[fill]` | completed | `[fill]` | yes/no |
| R1 | `[fill]` | B | `[fill]` | completed | `[fill]` | yes/no |
| R1 | `[fill]` | C | `[fill]` | completed | `[fill]` | yes/no |

At minimum, keep:

- resource ID
- exact URL
- runner
- device
- run count
- test ID
- note text

## What to send for analysis later

After execution, send one of these:

1. A list of SpeedLab test IDs
2. The filled result log table
3. Markdown exports for the important runs
4. A zipped subset of `app-data/results/` if deep raw analysis is needed

Best input for analysis:

- all `Full` resources
- test IDs for Pack A and Pack C
- Pack D only for pages where PSI consistency is questionable

## Notes for comparison rounds

When re-running after changes, keep the same:

- URL
- pack
- device
- runner
- note structure

Only change the phase marker in the note, for example:

- `baseline | R1 | local | mobile | 2026-05-19`
- `after-fonts | R1 | local | mobile | 2026-05-20`
- `after-cache | R1 | psi | mobile | 2026-05-20`

This keeps history easy to compare from `/history` and `/test/:id`.
