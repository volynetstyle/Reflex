# Maintainer guide

How the runtime is laid out, how a write travels through it, and what a change
must pass. Contracts are not repeated here; see the [map](./README.md).

## Source map

Dependencies point down.

| Layer     | Location                                                                  | Owns                                                                      |
| --------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| API       | `src/index.ts`, `src/internal/`, `src/subtle.ts`, `src/debug.ts`          | public, internal and debug entry points                                   |
| Domains   | `src/domain/`                                                             | execution domains: scheduler, register bank, safe-point teardown          |
| Protocol  | `src/protocol/`                                                           | read, write and create operations, `untracked`, read modes                |
| Engine    | `src/kernel/engine/`                                                      | watcher lifecycle: validation, cleanup, execution, recovery, delivery     |
| Stages    | `src/kernel/stages/propagation/`                                          | push: `push_iterator` (writes), `push_iterator_once` (after a recompute)  |
|           | `src/kernel/stages/stabilization/`                                        | pull: `pull_frontier`, `pull_dependency`, `pull_iterator`, `advance`      |
|           | `src/kernel/stages/tracking/`                                             | read tracking ([README](../src/kernel/stages/tracking/README.md))         |
| Shape     | `src/kernel/shape/`                                                       | node and edge layout, state bits (`meta.ts`), graph mutation              |
| Registers | `src/kernel/state.ts`, `config.ts`, `context*.ts`, `batch.ts`             | active consumer, depths, clock, hooks, contexts, batches                  |
| Dev/probe | `src/kernel/dev.ts`, `execution.ts`, `projection*.ts`, `src/profiling.ts` | DEV policy, debug events, PROFILE counters; erased from production builds |

## Layering and the debug boundary

Debugging and MCP are access layers around the runtime:
runtime core → debug primitives → diagnostics → `@volynets/reflex-runtime-mcp`.

- Production behavior does not depend on diagnostics, MCP or the MCP SDK.
- Debug instrumentation is off in production and adds no significant hot-path
  work when off. The only core-to-debug dependency is the no-op hook bridge
  `debug/debug.runtime.ts`.
- Debug registries do not strongly retain nodes.
- Debugging does not change semantics, scheduling, propagation or GC
  ownership.
- The core makes no runtime import of `diagnostics`, `tool-catalog`,
  `mcp/server`, `mcp/stdio`, `@modelcontextprotocol/*` or tool-publication
  Zod schemas. Type-only re-exports from `subtle` are allowed.

`pnpm check:architecture` checks the built artifacts and the source boundary;
it is part of `prepublishOnly`. An exception documents its bundle and GC cost
and why it cannot live in the debug layer.

## One write, end to end

1. `writeProducer` (`protocol/write.producer.ts`) compares with `Object.is`,
   commits and opens a propagation scope.
2. `push_iterator` marks direct subscribers `Changed`, transitive ones
   `Unknown`, stops at dirty nodes and calls `onNodeInvalidated` for each newly
   dirty watcher. A running watcher records `Visited` or `Revalidate` instead.
3. The host calls `runWatcher` (`engine/watcher.ts`). An `Unknown` watcher
   validates its committed frontier with `pull_frontier`, which pulls dirty
   computeds and recomputes them with `advance`.
4. If a change is confirmed or `Changed` is pending, the old cleanup runs
   untracked, then the callback runs tracked and tracking reconciles the
   dependency list.
5. A watcher invalidated during 3–4 keeps its obligation and is handed to the
   host again.

## Checks by change kind

| Change                                    | Required before commit                                                                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Documentation, comments, types, renames   | `check:bundle-identity` (production bundle byte-identical), `check:rules`, `format`                                                                    |
| Refactor meant to keep behavior and shape | `check:bundle-identity`; if the bundle changes, one of the rows below                                                                                  |
| Semantic change                           | `test`, `test:dev`, `test:projection`, `typecheck`, `check:rules`, the `reflex` package tests (liveness oracle), and the owner document + RULES updated |
| Hot-path performance change               | all semantic checks, `perf/v8-shape/analyze.mjs` before and after on the CI Node version, and the paired CI comparison against the base commit         |
| Build pipeline (`config/rollup/`)         | `build`, `test:e2e`, `check:artifacts`, the `config/rollup/` contract tests, and the paired CI comparison                                              |
| Benchmark harness (`bench/`)              | a paired run that reproduces a known result, and [PERFORMANCE.md](./PERFORMANCE.md) updated                                                            |

`pnpm rt gate <kind>` (`docs`, `refactor`, `semantic`, `hot-path`, `build`,
`bench-harness`) runs the automatable checks of a row and prints the rest as
obligations. The paired comparison is the `runtime-paired-benchmarks`
workflow (`workflow_dispatch`, `baseline=<commit>`); it builds both sides
with the candidate's toolchain.

## Stage and tracking tools

Run from the repository root.

```sh
# Stage semantics: frozen trace digests of push, pull and advance
pnpm --filter @volynets/reflex-runtime build:ts
node scripts/snapshot-stages.mjs <name>
node scripts/check-stages-semantics.mjs diff baseline candidate
node scripts/check-stages-semantics.mjs verify candidate   # against test/fixtures/stages-semantics.json

# Tracking exactness: graph after every operation, INV-H, seeded mutants
node scripts/fuzz-tracking-graph.mjs --baseline <commit> [--qualify]
```

Do not regenerate `test/fixtures/stages-semantics.json` to accept a change.
Experiment tools are listed in [perf/README.md](../perf/README.md).

## Pitfalls

- **One-sided edge updates.** Use the helpers in `shape/graph/`;
  `subtle.graphIntegrity` checks the result.
- **`Unknown` is not `Changed`.** Promoting one to the other defeats equality
  cutoff; dropping `Changed` loses a confirmed change.
- **Recording is not delivering.** A dirty watcher without `Scheduled` and
  without a pending delivery never runs again (L1).
- **Failure keeps topology.** Throws undo no tracking; recovery restores bits.
- **A hint never outlives its edge.** A new unlink path must clear `tailIn`
  hints (INV-H).
- **Constants are build-time.** Top-level `const` primitives are inlined as
  literals (`config/rollup/inline-constants.ts`); the build fails if one is
  shadowed or written. Mutable kernel state is `let` or `var`.
- **Disposal is not liveness.** There is no terminal bit.
