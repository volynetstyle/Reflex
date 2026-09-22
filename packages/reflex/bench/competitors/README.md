# Reflex competitor evidence suite

This suite compares the production Reflex facade with a pinned historical
Reflex facade, `alien-signals`, Solid 2's `@solidjs/signals`, and Vue's
standalone `@vue/reactivity` package. It is designed to make claims
falsifiable, not to manufacture a single flattering ops/s number.

Pinned versions:

- `@volynets/reflex` 1.0.0 (the local working-tree production build)
- `@volynets/reflex` at [`e87bb66`](https://github.com/volynetstyle/Reflex/commit/e87bb662be4e1bc4fb9885360d214017e8ba3a5c), checked out in the linked `benchmark/reflex-e87bb66` worktree
- `alien-signals` 3.2.1
- `@solidjs/signals` 2.0.0-rc.9
- `@vue/reactivity` 3.5.43

Solid 2 is an RC in this comparison. A report must retain that qualifier.

## Commands

Run a wiring check across every workload and framework:

```powershell
pnpm --filter @volynets/reflex bench:competitors:smoke
```

The command prepares the historical facade once: it creates the ignored linked
worktree at `.bench-worktrees/reflex-e87bb66` on branch
`benchmark/reflex-e87bb66`, installs that commit's locked dependencies, and
builds its production artifact. To prepare it without running a measurement:

```powershell
pnpm --filter @volynets/reflex bench:competitors:prepare-e87bb66
```

Run the full matrix (five fresh-process trials by default):

```powershell
pnpm --filter @volynets/reflex bench:competitors
```

Useful filters and controls:

```powershell
node --expose-gc bench/competitors/run.mjs `
  --scenario changed-chain,dynamic-branch,task-board `
  --framework reflex,reflex-e87bb66,alien,solid2,vue `
  --size 16,256 `
  --trials 5 `
  --warmup 500 `
  --min-warmup-ms 100 `
  --iterations 5000 `
  --min-throughput-ms 250 `
  --latency-samples 5000 `
  --memory-iterations 5000 `
  --output ../../bench-results/reflex-competitors/selected.json
```

Use `--group common-path|scaling|selectivity|topology|scheduler|lifecycle|failure|product`,
`--jitless`, and `--timeout <milliseconds>` as needed. The runner writes JSON
(raw evidence), CSV (scaling curves), and Markdown (human-readable summary).

Run cross-runtime semantic contracts and validate the 30-item evidence map:

```powershell
pnpm --filter @volynets/reflex bench:competitors:contracts -- `
  --output ../../bench-results/reflex-competitors/contracts.json
pnpm --filter @volynets/reflex bench:competitors:claims
```

## What is measured

Each `(framework, scenario, size, trial)` runs in a fresh Node process. Framework
order rotates deterministically between scenarios and trials. Setup is outside
the timed region. Every worker performs warmup, throughput timing, individual
operation latency sampling, heap/GC measurement, and an observable-result
validation.

The normal runner warms each process for at least 100 ms and measures throughput
for at least 250 ms, even when the requested minimum iteration count finishes
earlier. This prevents very fast paths from being ranked by a one- or two-
millisecond timing window. Smoke mode deliberately disables those minimums and
is marked as non-performance evidence in every report.

Minimum-duration runs can execute different operation counts in different
runtimes. Each worker validates its final state against the scenario's local
model. A cross-runtime final-checksum comparison is performed only when warmup
and measurement trace lengths are identical; otherwise the skipped comparison
and every framework's trace lengths are recorded explicitly in JSON.

The workload matrix covers:

- common paths: changed leaf; same-value producer writes with and without the
  transaction/settle boundary (`equal-leaf`, `equal-write-direct`);
  topology-matched equal-result and changed-result computed paths; a cached
  read from an already materialized chain; and a deep stable/unknown chain;
- scaling: linear depth; fan-out into independently observed sinks; converging
  fan-in/diamond; and a layered shared DAG whose complete final layer is
  observed;
- selectivity: one dirty node, 75% dirty nodes, and a wide semantically-stable
  frontier after a changed source;
- topology churn: single-branch switching, rotating dependency windows, and
  dependency reordering;
- scheduler: one derived value delivered to a growing fan-out of observers;
- lifecycle: create → update → dispose → verify-unlinked observer churn;
- failure: a failed derived frontier followed by an in-place recovery and retry;
- a product-shaped task-board projection graph.

Deep chains are materialized one node at a time during untimed setup. Their
timed phase therefore measures update propagation and stabilization through an
already materialized graph. Recursive first evaluation of a wholly lazy chain
is a different operation and is not claimed to be stack-safe by this suite.

Reports retain actual signal reads/writes, computed runs, effect runs, checksums,
GC observations, failures, and adapter capabilities. Work counters are separated
into throughput, latency, and memory phases, normalized per operation, and
captured before validation reads. A worker failure (including stack overflow at
a large depth) invalidates that aggregate row, appears in Markdown, and makes
the runner exit non-zero; survivor-only medians are never published.

`vs Reflex` is the median of ratios paired by scenario, size, and trial. It is
not a ratio of two unrelated medians. The report includes median absolute
deviation (MAD) so noisy results are visible rather than collapsed into a single
rank.

Latency percentiles are per-operation `hrtime` samples without subtracting a
timer baseline. The report withholds p99 below 100 samples and p999 below 10,000
samples; the smoke command is strictly a wiring test and its report suppresses
relative performance ratios.

Node exposes heap deltas here, not allocation bytes. `retained heap Δ B/op` may
be negative because V8 can compact or collect memory allocated before the
memory phase. It is a GC diagnostic only, never evidence that a runtime
"allocates negative bytes". Allocation claims require a separate controlled
heap/allocation experiment, long runs, and its own confidence bounds.

## Fairness boundary

All adapters expose the same minimal observable task: scalar signal, memoized
derivation, tracked observer, public transaction/settle operation, and disposal.
They import published production entry points. There are no benchmark-only
internal APIs.

Vue's standalone reactivity package has no public batching primitive. Its
adapter therefore performs multiple writes using public behavior and records
`publicBatch: false`; the semantic contract retains the intermediate snapshot
as `unsupported`. Scenarios which require batching for equal observable work
mark Vue as `not comparable` and withhold `vs Reflex`. Its absolute public-API
throughput and additional computed/effect work remain visible, but do not enter
the ranking. This is not a claim that Vue's renderer scheduler cannot batch
component work.

Solid 2 uses its public `flush(fn)` transaction and `createTrackedEffect`, the
single-phase public observer matching this harness's effect contract. Its
generic post-batch `flush` is a no-op because `flush(fn)` already drains; this
avoids charging an extra empty drain. Alien uses `startBatch`/`endBatch`.
Reflex uses `batch` followed by `flush`. Single-write cases are the cleanest
algorithmic comparison; multi-write cases must always be read with capability
and work-counter fields.

## Semantic evidence versus benchmark evidence

`contracts.mjs` compares observable semantics: equality suppression, dynamic
dependency cleanup, diamond stabilization, public batching, disposal,
failure/retry, reentrancy, deterministic observer order, and partial-frontier
recovery. A failed competitor contract describes a semantic difference; it
does not by itself label the competitor incorrect under its own contract.

The wider Reflex differential/model suites remain the source of evidence for
bounded exhaustive traces, lifecycle behavior, historical faults, and mutant
qualification. `claims.mjs` maps all 30 requested qualities to those tests,
benchmarks, contracts, instrumentation, or documentation and gives each an
explicit falsifying observation.

For the four next mechanism-level investigations — equal recomputation,
diamond fan-in, dynamic topology maintenance, and effect fan-out — see
[COST_ATTRIBUTION.md](./COST_ATTRIBUTION.md). Those counters belong to a
separate profile build, never to the production throughput comparison.

## Explicit non-guarantees

This suite does **not** establish a universal statement that Reflex is faster
on every CPU, Node/V8 version, graph, or framework integration. It does not
model DOM rendering, network/IO, cross-thread concurrency, arbitrary async
interleaving, corrupted internal graphs, or undocumented scheduler ordering.
It does not guarantee stack safety for first evaluation of an unmaterialized
lazy chain, and it does not equate source-line count or bundle size with
semantic simplicity.

The supported model is synchronous single-threaded reactive graph mutation
through each library's public API, with explicit transaction/flush boundaries
where the library exposes them. Stronger claims require a new contract or
workload that can fail, followed by measurements on the target environment.
