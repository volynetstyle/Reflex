# Maintainer guide

How the runtime is organized, how one write travels through it, and which
checks a change must pass. Contracts are not repeated here; the
[documentation map](./README.md) names the owner of each fact.

## Reading order

1. [RUNTIME.md](./RUNTIME.md): what integrators rely on.
2. [INVARIANTS.md](./INVARIANTS.md): the state model the kernel maintains.
3. [SEMANTIC_CONTRACT.md](../test/differential/docs/SEMANTIC_CONTRACT.md):
   the formal watcher lifecycle (C, W, V, L, M rules).
4. This guide's source map, then the local design notes next to the code:
   [stages](../src/kernel/stages/README.md),
   [stabilization](../src/kernel/stages/stabilization/README.md),
   [tracking](../src/kernel/stages/tracking/README.md).

## Source map

Dependencies point downward; [architecture-contract.md](./architecture-contract.md)
enforces the direction and the debug boundary (`check:architecture`).

| Layer     | Location                                                                  | Owns                                                                                  |
| --------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| API       | `src/index.ts`, `src/internal/`, `src/subtle.ts`, `src/debug.ts`          | public, internal and debug entry points                                               |
| Domains   | `src/domain/`                                                             | execution domains: one scheduler, register bank and safe-point teardown per domain    |
| Protocol  | `src/protocol/`                                                           | read/write/create operations, `untracked`, read modes, the `Object.is` comparator     |
| Engine    | `src/kernel/engine/`                                                      | watcher lifecycle: validation, cleanup, execution, failure recovery, delivery         |
| Stages    | `src/kernel/stages/propagation/`                                          | push: `push_iterator` (write waves), `push_iterator_once` (after a changed recompute) |
|           | `src/kernel/stages/stabilization/`                                        | pull: `pull_frontier` (watchers), `pull_dependency` / `pull_iterator`, `advance`      |
| Shape     | `src/kernel/shape/`                                                       | node and edge layout, state flags (`meta.ts`), graph mutation, dependency tracking    |
| Registers | `src/kernel/state.ts`, `config.ts`, `context*.ts`, `batch.ts`             | active consumer, depths, epoch, hooks, contexts and batches                           |
| Dev/probe | `src/kernel/dev.ts`, `execution.ts`, `projection*.ts`, `src/profiling.ts` | DEV policy, debug events, PROFILE counters; erased from production builds             |

## One write, end to end

1. `writeProducer` (`protocol/write.producer.ts`) compares with `Object.is`,
   commits, and opens a propagation scope (`kernel/context.scope.ts`).
2. `push_iterator` marks direct subscribers `Changed` and transitive ones
   `Unknown`, stops at already-dirty nodes, and calls `onNodeInvalidated` for
   each newly dirty watcher. A watcher that is mid-run records `Visited` or
   `Revalidate` instead.
3. The host later calls `runWatcher` (`engine/watcher.ts`). An `Unknown`
   watcher validates its whole committed frontier with `pull_frontier`, which
   pulls dirty computeds through `pull_dependency`/`pull_iterator` and
   recomputes them with `advance`.
4. If validation confirms a change (or `Changed` is pending), the old cleanup
   runs untracked, then the callback runs with tracking; `advance` and tracking
   reconcile the dependency list.
5. A watcher invalidated during steps 3-4 keeps its obligation and is handed
   to the host again (`deliverRetainedValidation`, `retainAfterExecution`).

## Checks by change kind

| Change                                      | Required before commit                                                                                                                                                 |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Documentation, comments, types, renames     | `check:bundle-identity` (production bundle byte-identical), `check:rules`, `format`                                                                                    |
| Refactor meant to keep behavior and shape   | `check:bundle-identity`; if the bundle changes, treat it as one of the rows below                                                                                      |
| Semantic change                             | `test`, `test:dev`, `test:projection`, `typecheck`, `check:rules`, the `reflex` package tests including the liveness oracle, and a contract update (owner doc + RULES) |
| Hot-path performance change                 | all semantic checks, `perf/v8-shape/analyze.mjs` before/after on the CI Node version, and the paired CI comparison against the base commit                             |
| Build pipeline (`config/rollup/`, inlining) | `build`, `test:e2e`, `check:artifacts`, the `config/rollup/` contract tests, and the paired CI comparison                                                              |
| Benchmark harness (`bench/`)                | a paired run that reproduces a known result, and [BENCHMARK_PROTOCOL.md](./performance/BENCHMARK_PROTOCOL.md) updated                                                  |

`pnpm rt gate <kind>` (`docs`, `refactor`, `semantic`, `hot-path`, `build`,
`bench-harness`) runs the automatable checks of a row and prints the others as
obligations; the [testkit](../testkit/README.md) catalogs every suite.

The paired comparison is `.github/workflows/runtime-paired-benchmarks.yml`
(`workflow_dispatch`, `baseline=<commit>`). It builds both sides with the
candidate's toolchain, so it measures source changes, not build changes.

## Pitfalls

- **One-sided edge updates.** Every edge lives in two lists; a mutation that
  updates only the incoming or only the outgoing side leaves a dangling edge.
  Use the helpers in `shape/graph/`; `subtle.graphIntegrity` checks the result.
- **`Unknown` is not `Changed`.** `Unknown` means "validate", `Changed` means
  "recompute or execute". Promoting `Unknown` to `Changed` defeats equality
  cutoff; dropping `Changed` loses a confirmed change.
- **Recording is not delivering.** A dirty watcher without `Scheduled` and
  without a pending delivery never runs again: push merges into a retained
  `Unknown` silently (L1).
- **Failure keeps topology.** Throws do not undo tracking; recovery restores
  flags only (INVARIANTS §3).
- **Cleanup order.** The old payload is cleared before cleanup runs, and the
  watcher is re-checked after cleanup and after the callback, because both may
  dispose it.
- **Disposal is not liveness.** There is no terminal bit; post-disposal reads
  and writes are not guaranteed inert.
- **Constants are build-time.** Module-level `const` primitives are inlined as
  literals in production (`config/rollup/inline-constants.ts`); the build fails if an
  inlined name is shadowed or written. Mutable kernel state must be `let`.

## Evidence and research

[characterization/](./characterization/) records the audited baseline and the
finding register (F-numbers); [performance/](./performance/) holds the
benchmark protocol and measured studies;
[semantic-optimization-baseline.md](./semantic-optimization-baseline.md) is the
static analysis behind the tracking optimizations. These documents record what
was measured or proven at a commit; they are not the current contract.
