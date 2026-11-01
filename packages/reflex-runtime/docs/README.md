# Documentation map

Every fact has one owner; other documents link to it. Git history is the
archive: documents describe the current state, not how it was reached.

| Document                                                    | Kind        | Owns                                                                                  |
| ----------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------- |
| [../README.md](../README.md)                                | tutorial    | concepts, first example, host scheduling, domains (published to npm)                  |
| [RUNTIME.md](./RUNTIME.md)                                  | reference   | public operations and behavior, hooks, disposal, retention, contexts, integration API |
| [SEMANTIC_CONTRACT.md](./SEMANTIC_CONTRACT.md)              | reference   | observable rules C, W, V, R, L, M; equivalence classes; open regions                  |
| [INVARIANTS.md](./INVARIANTS.md)                            | reference   | state bits, push, pull, tracking (INV-T, INV-H, INV-P), stacks, contexts              |
| [RULES.md](./RULES.md)                                      | reference   | rule → code → test → contract, checked by `check:rules`                               |
| [DIAGNOSTICS.md](./DIAGNOSTICS.md)                          | reference   | debug entry point, protocol, diagnostics, MCP                                         |
| [GUIDE.md](./GUIDE.md)                                      | how-to      | source map, layering, checks per change kind, tools, pitfalls                         |
| [PERFORMANCE.md](./PERFORMANCE.md)                          | how-to      | hot-path rules, JIT facts and source contracts, benchmark protocol                    |
| [MODEL.md](./MODEL.md)                                      | explanation | why the runtime is shaped this way; findings F1–F18; experiments and their verdicts   |
| [tracking/README.md](../src/kernel/stages/tracking/README.md) | how-to      | code map of tracking and graph files, where each tier's code lives                    |
| [testkit/README.md](../testkit/README.md)                   | how-to      | test catalog, tiers, oracles, verdict policies, corpus                                |
| [perf/README.md](../perf/README.md)                         | how-to      | experiment tools and how to run them                                                  |

Agents start at [AGENTS.md](../AGENTS.md). Repository-level documents
(execution domains, runtime integration) live in [../../../docs](../../../docs).

## Keeping it true

- A semantic change updates its owner document and, for load-bearing rules,
  RULES.md in the same commit.
- A finding gets the next free F-number in MODEL.md §9.
- An experiment's verdict goes into MODEL.md §7.2 as one row; raw results stay
  in the CI run or the research branch, not in the tree.
- Documentation changes keep the production bundle byte-identical
  (`check:bundle-identity`) and pass `pnpm format`.
