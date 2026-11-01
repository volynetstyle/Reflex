# AGENTS.md: @volynets/reflex-runtime

Instructions for coding agents in this package. The documentation map is
[docs/README.md](./docs/README.md).

## Priorities

1. Correctness of the documented contract.
2. Graph and state invariants.
3. Hot-path predictability.
4. Tail latency.

A change that trades a higher priority for a lower one is rejected.

## Hard rules

- **No semantic change without its contract.** Update the owner document
  (below) and, for load-bearing rules, [docs/RULES.md](./docs/RULES.md) in the
  same commit.
- **Refactors keep the bundle.** A refactor, rename, comment or documentation
  change leaves the production bundle byte-identical
  (`pnpm check:bundle-identity`). If it does not, it is a code change.
- **Evidence before hot-path work.** Name the function, the workload and the
  mechanism; check shape on the CI Node version and time with the paired CI
  comparison ([docs/PERFORMANCE.md](./docs/PERFORMANCE.md)). Timing runs on
  CI, never as local claims.
- **Core stays independent of diagnostics.** No metadata, event history,
  WeakRef registries, Zod or MCP on a hot path; the only core-to-debug link
  is `debug/debug.runtime.ts` ([docs/GUIDE.md](./docs/GUIDE.md#layering-and-the-debug-boundary)).
- **Module constants are compile-time.** Top-level `const` primitives are
  inlined; mutable kernel state is `let` or `var`.
- **Open decision.** F1 (a computed invalidated during its own evaluation)
  belongs to the owner. Do not change computed reentrancy without one.
- **Documents describe the present.** One fact, one owner; history is in
  git. Findings take the next F-number in `docs/MODEL.md` §9; experiment
  verdicts are one row in §7.2. Run `pnpm format` on edited documents.

## Where facts live

| Fact                                                | Owner                                                    |
| --------------------------------------------------- | -------------------------------------------------------- |
| public API and behavior, hooks, disposal, retention | [docs/RUNTIME.md](./docs/RUNTIME.md)                     |
| observable rules C, W, V, R, L, M                   | [docs/SEMANTIC_CONTRACT.md](./docs/SEMANTIC_CONTRACT.md) |
| state bits, push, pull, tracking, stacks, contexts  | [docs/INVARIANTS.md](./docs/INVARIANTS.md)               |
| rule → code → test index                            | [docs/RULES.md](./docs/RULES.md)                         |
| source map, layering, checks per change kind        | [docs/GUIDE.md](./docs/GUIDE.md)                         |
| hot-path rules, JIT contracts, benchmark protocol   | [docs/PERFORMANCE.md](./docs/PERFORMANCE.md)             |
| rationale, findings F1–F18, experiment verdicts     | [docs/MODEL.md](./docs/MODEL.md)                         |
| test catalog, oracles, verdict policies, corpus     | [testkit/README.md](./testkit/README.md)                 |

## Commands

```bash
pnpm test                    # production configuration
pnpm test:dev                # development policy and debug events
pnpm test:projection         # structural projections of the stages
pnpm typecheck
pnpm lint                    # ESLint and TSSLint (JIT source contracts)
pnpm check:rules             # rule citations exist
pnpm check:architecture      # layering and debug boundary
pnpm check:bundle-identity   # production bundle unchanged vs HEAD
pnpm --filter @volynets/reflex test   # facade, includes the liveness oracle
pnpm rt run --tier smoke     # testkit at a budget (smoke | ci | deep)
pnpm rt gate <kind>          # the checks a change kind requires
pnpm rt doctor               # every test file owned by one suite
pnpm rt audit                # which suites detect which fault
```
