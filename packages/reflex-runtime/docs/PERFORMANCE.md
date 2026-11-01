# Performance

How hot-path work is proposed, measured and accepted. Priorities:
correctness, then graph invariants, then hot-path predictability, then tail
latency. A trade of a higher priority for a lower one is rejected.

## Rules

**Evidence first.** A performance change names the function, the workload
that reproduces the cost, and one mechanism: shape churn, polymorphic access,
polymorphic call site, deopt, branch-heavy loop or traversal length. No
profile, no change. Timing experiments run on CI, never as local claims.

**Hot paths stay boring.** One dominant case, one or two cheap guards, then
linear work; rare cases go to a separate function. No debug work, no
universal dispatcher, no `try/catch` without a reason.

**Shapes stay stable.** Hot objects get every field at creation, in the same
order; no `delete`, no late fields, a deliberate choice of `null` or
`undefined`. One access site reads one layout; `node.compute()` is not shared
across unrelated semantics.

**Fast paths need a cheap miss.** A guess must be cheap when right, cheap when
wrong, and must not delay the general proof (MODEL.md, principle 7).

**Mean is not enough.** Report the distribution; a mean win with a worse tail
is suspect. Stop when the effect is inside noise.

**Small patches.** State the hypothesis before the change and the trade-off
after it; document a non-obvious invariant next to the code.

## JIT facts (Node 24, the CI runner)

- All inline caches of the runtime are monomorphic.
- TurboFan inlines against a cumulative budget of about 920 bytecode bytes per
  root. A cold tier merged into a hot function makes it un-inlinable, so
  tracking keeps its miss handlers in separate functions and its helpers
  without parameter defaults (`src/kernel/stages/tracking/README.md`).
- Terser turns `(x & bit) !== 0` next to a boolean into a generic ToBoolean;
  compare with `=== true` where it matters.
- Inspect shape with `perf/v8-shape/analyze.mjs` on the runner's Node version;
  results from another major version do not transfer.

## JIT source contracts

A `// @jit <contract>` directive placed immediately before a statement turns
an assumption into a check over the TypeScript program (`pnpm lint:tsslint`,
rule `config/tsslint/jit-contracts.ts`). Unknown or misplaced directives are
errors; code without a directive is not checked.

| Contract                    | Requires                                                                                                                                                                                                                       |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `int32-provenance(base)`    | one function-local `let` initialized from `base`, a `const` that is an int32 literal or `expr \| 0` with a number type; the `let` is written only by `++`/`--`; no direct `eval` or `with` in the function |
| `canonical-boolean`         | an `if`/`while` whose whole condition is a call compared `=== true`, whose return type is only `boolean` or boolean literals (`strictNullChecks` on)                                                                          |

The checks prove source-level premises only: not a range after the first
update, not engine representation, inlining or absence of deopts. There is no
`monomorphic`, `stable-shape`, `no-allocation` or `no-escape` contract; a new
one needs a stated proof boundary and positive and negative tests.
`pnpm check:jit-shape` is the optional engine probe: it builds a readable
production bundle and reports code size and deopts of the annotated
functions. It is a diagnostic, not a gate.

## Benchmark protocol

Code: `bench/workloads.mjs` (workloads), `bench/worker.mjs` (one process),
`bench/compare.mjs` (paired comparison).

1. **Mechanisms, not scenarios.** Each workload names the mechanism it
   isolates, its preconditions, setup and the measured step.
2. **Same work.** A deterministic `verify` replay must match on both sides;
   otherwise the verdict is `invalid`.
3. **Production bundles only**, both built by the same toolchain.
4. **Paired in one process.** Both builds run in the same process in
   alternating batches, so clock drift hits both; the process is the unit of
   replication.
5. **Nothing shared.** Each side has its own bundle, workload module and
   compiled timing loop; a shared loop goes polymorphic.
6. **Both orientations.** The build loaded first runs 1–3% differently; every
   comparison runs both ways and averages.
7. **`--predictable`.** Synchronous compilation removes code-shape modes
   (local A/A spread ±13% → ±1.8%).
8. **Randomized placement.** `--layout-seed` shifts code and heap per side so
   alignment effects become variance instead of bias.
9. **Negative control.** Every replicate also runs A against A'; if the
   control detects a difference, that workload is `invalid`.
10. **No single score.** Results are per workload; B-level families are read
    as slopes.

Levels: **A** primitives on a prepared graph, **B** scaling with shape, **C**
interaction of mechanisms, **D** application-like mixes, **E** retention
(slope of heap between N = 2000 and 8000 cycles, median of 5).

Each replicate contributes the mean of its two orientations; the report gives
the median ratio with an exact order-statistic 95% interval, Bonferroni over
the family (`tooling/benchmarks/statistics.mjs`). Qualification uses 24
replicates.

| Verdict        | Condition                                                        |
| -------------- | ---------------------------------------------------------------- |
| `invalid`      | verification differs, or the A/A' interval excludes zero         |
| `screening`    | too few replicates for a finite interval (< 11 for 25 workloads) |
| `faster`       | the whole interval below `−t`                                    |
| `slower`       | the whole interval above `+t`                                    |
| `equivalent`   | the whole interval inside `[−t, +t]`                             |
| `inconclusive` | the interval crosses `±t`                                        |

`t` (default 3%) is declared before the run. A speedup claim needs `faster`;
`screening` and `inconclusive` support nothing.

### CI

`.github/workflows/runtime-paired-benchmarks.yml` runs the comparison on
GitHub runners: a PR's base against its merge result, a push to main against
the previous head, or a chosen `baseline` against HEAD (`compare` mode), or
one commit against itself (`calibrate` mode). It reports `slower`, `invalid`
and `error` as warnings and fails only when no report is produced. Runners
differ between runs: compare within one run, never against a stored number.
Locally, `compare.mjs` exits 1 on `slower`, `invalid` or `error`.
