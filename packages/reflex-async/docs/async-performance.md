# Async validation allocation work

The optimization keeps the async source API and its execution/publication
contracts. Each fresh read still pulls upstream executions before validating its
own watcher. Settlement still checks liveness at entry, validates before
publication, and checks liveness again before publishing. Batches and captured
runtime contexts retain their existing boundaries.

The fast path applies when the source has no active attempt, its ordinary sync
watcher is clean, and the source's runtime is already active. The generic `Both`
watcher mask only selects a validation implementation; it does not add async
state to a reactive node or establish async freshness by itself.

- Cached validation and dependency-pull callbacks avoid per-read closures.
- Direct batch entry/exit avoids a same-context wrapper for these clean reads.
- An empty dependency Set avoids an untracked callback with an empty traversal.

Upstream executions are still pulled before `runWatcher`, even when the child's
own watcher was clean at entry. This is necessary because an invalidated async
parent may not have notified the child yet. Dirty/pending/cross-runtime sources
retain the ordinary context-wrapped validation path. Attempts, execution
handles, outcome records and dependency Sets retain their existing form.

The initial broader allocation rewrite regressed the Node abort-heavy workload.
The retained optimization is deliberately scoped to committed reads; the
before/after runner includes supersession and a native AbortController control
to keep this tradeoff observable.

This does not memoize validation across reads or add a temporal epoch. A joined
graph can still revisit a shared upstream execution along multiple paths.

## Reproduce the comparison

Build the pre-change production ESM output, then capture it before editing:

```sh
pnpm --filter @volynets/reflex-async bench:async:baseline
```

After building the candidate, run:

```sh
pnpm --filter @volynets/reflex-async bench:async
```

The baseline command refuses to overwrite an existing snapshot. The snapshot
and reports live in the ignored package directory `.cache/async-performance`.
The runner measures production ESM with no diagnostic instrumentation. It runs
baseline/candidate in separate Node processes, reverses their order on alternate
rounds, warms and calibrates each workload, then uses the same iteration count
for both builds, including burst cancellation workloads. It collects seven
samples per round with GC outside the measured interval. The default is three
rounds per build.
Reports preserve raw samples, ranges, source/bundle/benchmark hashes and host
details. They are microbenchmarks, not browser or request-latency measurements.

`REFLEX_ASYNC_BENCH_ROUNDS` selects 1–10 rounds.
`REFLEX_ASYNC_BENCH_CASE` filters by scenario-name substring; focused runs write
separate reports, so they do not replace the full comparison.

## Contract verification

The bounded differential suite, longer history properties, graph scenarios and
seven mutation witnesses remain active. New regressions check upstream capture
order against a different scheduler registration order in all three scheduler
modes, including repeated reads, and reject a previous execution handle while a
newer attempt of the same source is running.

The full suite has 364 passing tests and the same three pre-existing upstream
`#211` adapter failures. Type checks, mutation qualification (7/7 detected) and
production ESM/CJS/dev package smoke checks pass.
