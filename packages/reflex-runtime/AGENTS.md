# AGENTS.md: @volynets/reflex-runtime

Instructions for coding agents working in this package. Humans start at
[README.md](./README.md) and the [documentation map](./docs/README.md).

## Priorities

1. Correctness of the documented contract.
2. Graph and state invariants.
3. Hot-path predictability (machine-code shape).
4. Tail latency stability.

A change that trades a higher priority for a lower one is rejected.

## Hard rules

- **No semantic change without its contract.** Behavior is owned by one
  document (table below); change that document and, for load-bearing rules,
  [docs/RULES.md](./docs/RULES.md) in the same commit. `check:rules` verifies
  the citations.
- **Refactors keep the bundle.** A change described as a refactor, rename,
  comment or documentation change must leave the production bundle
  byte-identical: `pnpm check:bundle-identity`. If it does not, it is a code
  change and needs the semantic or performance checks.
- **Evidence before hot-path work.** Name the function, the workload and the
  mechanism; measure shape with `perf/v8-shape/analyze.mjs` on the Node version
  of the benchmark runner and time with the paired CI comparison. Details:
  [PERFORMANCE_RULES.md](./docs/PERFORMANCE_RULES.md).
- **Core stays independent of diagnostics.** No metadata allocation, event
  history, WeakRef registries, Zod schemas or MCP imports on a hot path. The
  only core-to-debug dependency is the no-op hook bridge in
  `debug/debug.runtime.ts`. Diagnostics stay read-only, protocol concerns stay
  in the separate `@volynets/reflex-runtime-mcp` package and the official MCP
  SDK, and debug registries must not strongly retain nodes. Changing these boundaries requires an update to
  [architecture-contract.md](./docs/architecture-contract.md) and its check.
- **Module constants are compile-time.** Top-level `const` primitives in `src`
  are inlined as literals in production builds; the build fails if one is
  shadowed or written. Mutable kernel state is `let`.
- **Evidence documents are history.** `docs/characterization/`,
  `docs/performance/` results and `test/differential/docs/*_BASELINE.md`
  record what was measured at a commit. Add to them; do not rewrite past
  results. New findings take the next free F-number in
  [SEMANTIC_CHARACTERIZATION.md](./docs/characterization/SEMANTIC_CHARACTERIZATION.md).
- **One fact, one owner.** Documentation states a fact once, in its owner, and
  links elsewhere. Run `pnpm format` on edited documents.

## Where facts live

| Fact                                                           | Owner                                                                                                      |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Public API and observable behavior, host scheduling contract   | [docs/RUNTIME.md](./docs/RUNTIME.md)                                                                       |
| State flags, transitions, failure recovery, tracking, contexts | [docs/INVARIANTS.md](./docs/INVARIANTS.md)                                                                 |
| Teardown and cleanup ordering                                  | [docs/DISPOSE.md](./docs/DISPOSE.md)                                                                       |
| Formal watcher lifecycle rules (C, W, V, L, M)                 | [test/differential/docs/SEMANTIC_CONTRACT.md](./test/differential/docs/SEMANTIC_CONTRACT.md)               |
| Rule-to-code-to-check index                                    | [docs/RULES.md](./docs/RULES.md)                                                                           |
| Layering and the debug boundary                                | [docs/architecture-contract.md](./docs/architecture-contract.md)                                           |
| Source map, change workflow, checks per change kind            | [docs/GUIDE.md](./docs/GUIDE.md)                                                                           |
| Benchmark method and gate                                      | [docs/performance/BENCHMARK_PROTOCOL.md](./docs/performance/BENCHMARK_PROTOCOL.md)                         |
| Findings register (F-numbers), open defects                    | [docs/characterization/SEMANTIC_CHARACTERIZATION.md](./docs/characterization/SEMANTIC_CHARACTERIZATION.md) |
| Test catalog, tiers, gates, verdict policies, testing method   | [testkit/README.md](./testkit/README.md)                                                                   |

Open: F1, a computed invalidated during its own evaluation, is an owner
decision. Do not change computed reentrancy semantics without one.

## Commands

```bash
pnpm test                    # production configuration
pnpm test:dev                # development policy and debug events
pnpm test:projection         # structural projections of the stages
pnpm typecheck
pnpm lint
pnpm check:rules             # rule citations exist
pnpm check:architecture      # layering and debug boundary
pnpm check:bundle-identity   # production bundle unchanged vs HEAD
pnpm --filter @volynets/reflex test   # facade, includes the liveness oracle
pnpm rt run --tier smoke     # testkit: the catalog at a budget (smoke | ci | deep)
pnpm rt gate <kind>          # the checks a change kind requires (docs/GUIDE.md)
pnpm rt doctor               # every test file owned by one suite
```

Shape analysis and paired timing: [docs/GUIDE.md](./docs/GUIDE.md#checks-by-change-kind).
