# Documentation map

Every fact about `@volynets/reflex-runtime` has one owner. Other documents
summarize and link to it. Documents are grouped by how binding they are.

## Entry points

| Document                  | For                      | Contains                                                           |
| ------------------------- | ------------------------ | ------------------------------------------------------------------ |
| [README.md](../README.md) | users (published to npm) | concepts, example, host scheduling, domains; links to the contract |
| [AGENTS.md](../AGENTS.md) | coding agents            | priorities, hard rules, fact owners, commands                      |
| [GUIDE.md](./GUIDE.md)    | maintainers              | source map, one write end to end, checks per change kind, pitfalls |

## Contract (normative)

A change that contradicts one of these documents is a semantic change and
updates the document in the same commit.

| Document                                                               | Owns                                                                                                        |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| [RUNTIME.md](./RUNTIME.md)                                             | public API, producer/computed/watcher behavior, host scheduling, DEV policy, contexts, dependency retention |
| [INVARIANTS.md](./INVARIANTS.md)                                       | state flags and transitions, failure recovery, tracking cursor and stamps, stacks, context registers        |
| [DISPOSE.md](./DISPOSE.md)                                             | teardown, cleanup ordering                                                                                  |
| [SEMANTIC_CONTRACT.md](../test/differential/docs/SEMANTIC_CONTRACT.md) | formal observable rules C1-C3, W1-W3, V1-V6, L1-L5, M1-M3; differential oracle boundary                     |
| [RULES.md](./RULES.md)                                                 | index of load-bearing rules with checked citations to code, tests and contract (`check:rules`)              |
| [architecture-contract.md](./architecture-contract.md)                 | layer direction and the debug/MCP boundary (`check:architecture`)                                           |

## Guides (normative for process)

| Document                                                     | Owns                                                      |
| ------------------------------------------------------------ | --------------------------------------------------------- |
| [GUIDE.md](./GUIDE.md)                                       | which checks a change kind requires                       |
| [PERFORMANCE_RULES.md](./PERFORMANCE_RULES.md)               | evidence and shape discipline for hot-path work           |
| [BENCHMARK_PROTOCOL.md](./performance/BENCHMARK_PROTOCOL.md) | paired benchmark method, verdicts, CI gate                |
| [DIAGNOSTICS.md](./DIAGNOSTICS.md)                           | debug entry point, protocol, diagnostics and MCP surfaces |

## Design notes next to the code

| Document                                                      | Describes                                               |
| ------------------------------------------------------------- | ------------------------------------------------------- |
| [stages](../src/kernel/stages/README.md)                      | propagation and stabilization stages, their projections |
| [stabilization](../src/kernel/stages/stabilization/README.md) | the layered pull machine                                |
| [tracking](../src/kernel/shape/tracking/README.md)            | dependency resolution and reconciliation strategies     |
| [differential testkit](../test/differential/README.md)        | spec/Reflex machines and test languages                 |

## Evidence (historical)

These record what was audited, measured or proven at a commit. They are not
the current contract; they are extended, not rewritten.

| Document                                                                                         | Records                                                                                       |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| [SEMANTIC_CHARACTERIZATION.md](./characterization/SEMANTIC_CHARACTERIZATION.md)                  | audited baseline, transition table, findings register (F-numbers)                             |
| [KERNEL_AUDIT.md](./characterization/KERNEL_AUDIT.md)                                            | per-invariant audit answers for the characterized commit                                      |
| [semantic-optimization-baseline.md](./semantic-optimization-baseline.md)                         | static analysis behind the tracking optimizations                                             |
| [performance/](./performance/)                                                                   | measured studies (callbacks, V3 frontier cost, lifetime vs liveness) and the experiment queue |
| `test/differential/docs/*_BASELINE.md`, `test/differential/watcher/WATCHER_EVIDENCE_BASELINE.md` | frozen oracle and mutation baselines                                                          |
| `perf/*/README.md`, `perf/*/results/`, `test/perf/*/README.md`                                   | isolated performance experiments and their results                                            |

Repository-level documents outside this package: execution domains, the
scheduler contract and dynamic dependencies live in [../../../docs](../../../docs).

## Keeping the documentation true

- State a fact once, in its owner; elsewhere, summarize in a sentence and link.
- Cite code by path and exported name; `check:rules` fails on a missing citation.
- A documentation-only change keeps the production bundle byte-identical
  (`check:bundle-identity`) and passes `format`.
- When a fact moves, update this map in the same commit.
