# Local js-framework-benchmark: reflex-dom vs. vanilla

A local reproduction of the keyed suite of
[js-framework-benchmark](https://github.com/krausest/js-framework-benchmark),
for comparing `reflex-dom` with the vanilla JS reference without adding Reflex
to the official repository.

```sh
pnpm --filter @volynets/reflex-dom build   # the app uses dist/standalone
pnpm --filter @volynets/reflex-dom bench:js-framework
```

Results are printed as a Markdown table and written to `results/<timestamp>.json`,
`results/<timestamp>.md` and `results/latest.md`. A full run (both suites,
diagnostics, memory and size) takes about 25 minutes.

| option | meaning |
| --- | --- |
| `--count=15` | CPU iterations per benchmark (official default: 15) |
| `--benchmarks=01,04` | run benchmarks whose id starts with these prefixes |
| `--frameworks=vanillajs,reflex-dom` | frameworks to compare; the first is the baseline for factors |
| `--mem-count=1` | memory iterations (official default: 1) |
| `--no-throttle` | disable CPU throttling |
| `--no-memory`, `--no-size` | skip memory or size benchmarks |
| `--headed` | visible browser window instead of new headless Chromium |
| `--skip-build` | reuse `.build/` |
| `--keep-traces` | write each Chrome trace to `results/traces/` |
| `--suite=all` | `krausest` (the nine official benchmarks), `extended` (below) or `all` |
| `--no-diagnose` | skip the untimed DOM mutation / allocation pass |

## Layout

```
apps/vanillajs/      reference implementation (keyed/vanillajs semantics)
apps/reflex-dom/     idiomatic reflex-dom implementation
shared/data.js       canonical row data generator (ids from 1, adjective/colour/noun)
shared/ops.js        data transformations of the extended scenarios
shared/buttons.json  ids and titles of the extended scenario buttons
shared/main.css      layout-relevant subset of the official stylesheet
build.mjs            Vite production build of every app into .build/
run.mjs              Playwright harness: benchmarks, tracing, throttling, reporting
timeline.mjs         port of webdriver-ts/src/timeline.ts
stats.mjs            mean / CI / t-test / weighted geometric mean
```

## Extended scenarios

The nine official benchmarks are operations a hand-written page knows exactly,
so vanilla does the minimum by construction. The extended suite adds
operations where that is not given, to find where reflex-dom's generic work
pays off and where it costs. Ids `10`–`19`, each with its own throttling:

| id | operation | kind | vanilla implementation |
| --- | --- | --- | --- |
| 10_refresh-one-1k | new objects for all rows, one label differs | snapshot | `applySnapshot` |
| 11_refresh-10th-1k | new objects, every 10th label differs | snapshot | `applySnapshot` |
| 12_move-forward-1k | row 999 moves to position 2 | snapshot | `applySnapshot` |
| 13_move-backward-1k | row 2 moves to position 999 | snapshot | `applySnapshot` |
| 14_reverse-1k | reversed order | snapshot | `applySnapshot` |
| 15_interleave-1k | even positions, then odd positions | snapshot | `applySnapshot` |
| 16_replace-half-1k | every second row is a new row | snapshot | `applySnapshot` |
| 17_update-all-1k | every label changes | direct | one text write per row |
| 18_prepend1k-to-1k | 1,000 rows before 1,000 rows | direct | one fragment insert |
| 19_remove-10th-1k | every 10th row removed | direct | 100 `remove()` calls |

- **Snapshot**: the handler receives a new array of new row objects, as data
  reloaded from a server, without a description of the change. Vanilla applies
  it with `applySnapshot` (`apps/vanillajs/main.js`), the reconciliation a
  hand-written page would use without a diff library: rows looked up by id,
  labels compared before writing, removed rows deleted, and the order restored
  by one cursor walk that moves every row it finds out of place. That walk is
  optimal for a row moved forward and moves almost every row for a row moved
  backward; reflex-dom's keyed reconciliation (longest increasing subsequence)
  moves one row in both cases.
- **Direct**: the handler knows the change and vanilla applies exactly it.
- reflex-dom implements every scenario the same way: `rows(op(current))`.
- An optimal hand-written implementation can always perform the same DOM
  operations as reflex-dom; these scenarios compare reflex-dom with the
  straightforward one.

The harness mirrors each operation on row ids (`modelOperations` in
`run.mjs`) and waits until probe rows, the row count and label markers match.
Each scenario warms up on its own table (five create/clear cycles, five runs
of the operation) and measures on a fresh table of 1,000 rows.

## Diagnostics

In addition to total / script / paint, every CPU result has:

- **Phases** from the same trace window: GC (`MinorGC`, `MajorGC`), style
  recalculation, layout, paint (pre-paint, paint, layerize), commit, and the
  number of layouts and style recalculations.
- **DOM work** from one extra, untimed page per benchmark and framework (a
  `MutationObserver` on the table slows the page): top-level nodes inserted,
  removed and moved, anchor comments inserted, text and attribute writes (and
  how many left the value unchanged), and JS heap growth without a forced GC.

The report adds a section per compared framework, "Where … is ahead of …",
with ratios in total and by phase and the lists of benchmarks where it is
faster, indistinguishable or slower (t-test on totals, p < 0.05).

## Methodology taken from js-framework-benchmark

- **Benchmarks.** The nine keyed CPU benchmarks with their current ids, warmup
  counts, extra runs and CPU slowdown factors from
  `webdriver-ts/src/benchmarksCommon.ts`:

  | id | operation | warmup | slowdown |
  | --- | --- | --- | --- |
  | 01_run1k | create 1,000 rows | 5 | 1× |
  | 02_replace1k | replace all 1,000 rows | 5 | 1× |
  | 03_update10th1k_x16 | update every 10th of 1,000 rows | 3 | 4× |
  | 04_select1k | highlight a row (+10 runs) | — | 4× |
  | 05_swap1k | swap rows 2 and 999 | 5 | 4× |
  | 06_remove-one-1k | remove one row | 5 | 2× |
  | 07_create10k | create 10,000 rows | 5 | 1× |
  | 08_create1k-after1k_x2 | append 1,000 rows to 1,000 | 5 | 1× |
  | 09_clear1k_x8 | clear 1,000 rows | 5 | 4× |

  Memory: `21_ready-memory`, `22_run-memory`, `25_run-clear-memory`. Size:
  uncompressed, gzip and brotli size of the shipped JavaScript.
- **Steps.** `init` (warmup) and `run` steps, selectors and DOM conditions are
  those of `webdriver-ts/src/benchmarksPlaywright.ts`. Each iteration loads a
  fresh page; CPU throttling (`Emulation.setCPUThrottlingRate`) is applied only
  around the measured step.
- **Duration.** From a Chrome trace, as in `timeline.ts`: from the start of the
  single `click` `EventDispatch` to the end of the first `Commit` after the
  last script, layout or frame event of the operation (falling back to the
  last `Commit`), with the same `requestAnimationFrame` delay correction.
  `script` and `paint` are the unions of the JS and style/layout/paint slices
  in that window.
- **Statistics.** Mean ± 95% confidence half-width (`1.959964·sd/√n`),
  Student's t-test with pooled variance (undecided above p = 0.05), factors
  relative to the fastest entry, and the overall score as the weighted
  geometric mean of CPU factors with the official weights.
- **Implementation rules.** The DOM matches the vanilla reference (same page
  skeleton, button ids, row markup and `danger` selection class). The Reflex
  app follows the rules for framework entries: no manual DOM manipulation, no
  explicit event delegation, no `requestAnimationFrame`, and the selection is
  a single id rather than a flag per row. Rows are immutable and rendered by a
  keyed `For`; `update` replaces every 10th row object.
- **Browser.** Chromium with the official runner's flags (`--expose-gc`,
  `--enable-precise-memory-info`, no background throttling, 1000×800 window).

## Deviations

- **Stylesheet.** `shared/main.css` reproduces the layout-relevant Bootstrap 3
  rules instead of shipping the official `currentStyle.css`. Both apps use it,
  so the comparison is fair, but absolute numbers are not comparable with the
  official result tables. Compare factors, not milliseconds.
- **Iteration order.** Frameworks are interleaved per iteration (A, B, then
  B, A) instead of benchmarked one after another, so machine drift (thermal
  throttling on laptops in particular) affects both equally.
- **Waiting.** Conditions are polled from Node through the DevTools protocol.
  Polling inside the page with timers or `requestAnimationFrame` would add
  `TimerFire`/`FireAnimationFrame` events that the timeline algorithm treats as
  part of the operation, moving the measured end to a later commit.
- **Trace events.** `script`/`paint` slices are restricted to the renderer
  process of the click; the original filters by time only.
- **Memory.** JS heap used size (`Runtime.getHeapUsage`) after three forced
  garbage collections, not the official memory-infra measurement.
- **Not reproduced.** Startup and Lighthouse metrics (`30_startup`) and the
  non-keyed suite.
- **Headless.** New headless Chromium by default. It produces paint and commit
  events; use `--headed` to cross-check on a visible window, which the official
  runner requires.

## Reading the results

- Run on a quiet machine on AC power; close other applications. Laptop CPUs
  boost and throttle, so prefer the factor column and its p-value over absolute
  times.
- Treat a factor as a real difference only when p < 0.05; otherwise increase
  `--count` or rerun.
- `script` shows framework work; `paint` (style, layout, paint, commit) shows
  the cost of the DOM the framework produced. A higher `paint` with the same
  markup means more or differently ordered DOM mutations, for example extra
  nodes or moves.
