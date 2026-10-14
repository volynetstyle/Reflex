# Execution domains: qualification record (PR-10)

Local qualification of Release A (PR-00…PR-08) and Release B (PR-09) on
`premain-refactor`. Baseline: `3399c51`
([baseline record](./execution-domains.baseline.json)).
Environment: Node v25.2.0, win32-x64, pnpm 9.0.0.

## Structural gates (strict)

| Gate                                                                     | Result                         |
| ------------------------------------------------------------------------ | ------------------------------ |
| `ReactiveNode` / `ReactiveEdge` field sets unchanged                     | Pass (`check:architecture`)    |
| No domain/owner/WeakMap references on kernel hot paths                   | Pass (`check:architecture`)    |
| Kernel never imports the domain layer                                    | Pass (`check:architecture`)    |
| Hot-path sources byte-identical to baseline                              | Pass (`check:domain-baseline`) |
| Production projection erasure                                            | Pass                           |
| One kernel and domain registry across public/internal, ESM/CJS, prod/dev | Pass (`check:identity`)        |

## Semantic suites

| Suite                                                     | Result                                                                                         |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Root `typecheck` (product scope)                          | Pass                                                                                           |
| `build:product`                                           | Pass                                                                                           |
| runtime source / dev / projection                         | 334 (+1 skipped) / 39 / 24 pass                                                                |
| Observational equivalence, 150 seeds × 80 interleaved ops | Pass; a mutant routing A's writes through B is caught at seed 1                                |
| scheduler                                                 | 38 pass                                                                                        |
| framework source / dev                                    | 79 / 21 pass                                                                                   |
| reflex                                                    | 272 pass                                                                                       |
| reflex-dom                                                | 241 (+1 skipped) pass                                                                          |
| reflex-store                                              | 148 pass (one Vite DX test timed out at 5.03 s under parallel load; passes alone in 2.5 s)     |
| reflex-async                                              | 153 pass, 1 fail — pre-existing, see below                                                     |
| async semantics lab (bounded B3 models), waiter memory    | Pass                                                                                           |
| Domain retention audit (`check:domain-retention`)         | Pass: 1200/1200 objects from 200 closed domains collected (prod and dev); leak mutant detected |

### Known failure not caused by this work

`reflex.async.frontier.test.ts › keeps one frozen node layout…` asserts
frozen frontiers, but `3399c51` removed `Object.freeze` from
`src/async/frontier.ts`. One of the two must change; this is an owner
decision outside the execution-domain program.

## Performance (screening only)

`runtime-taxonomy`, B1/H1/H2/B2 process pairs against the baseline worktree:

- Pair 1 (B1/H1): median delta +1.0% over 15 scenarios.
- Pair 2 is **invalid**: base-vs-base drift reached +110% (machine state
  changed between runs).
- The only repeated outlier (`dispose-churn`, +37% / +106%) was re-measured
  in four alternating pairs: timings are bimodal (~14 ms / ~22 ms) by machine
  state; within one state the delta is −5.2%…+1.0%.
- `domain-boundary` cohort: nested same-domain run, domain switch and batch
  per op are within ±5% of the raw baseline loop.

No confidence claim is made. A release decision on performance needs the
20-pair independent series (`--pair-design independent --require-inference`)
on a quiet runner.

## Installed-package qualification

`tooling/testing/qualify.mjs` (the consumer half of `release:qualify`):
10 packages packed, installed into an isolated fixture from tarballs, then:

| Check                                                                      | Result |
| -------------------------------------------------------------------------- | ------ |
| identity: ESM, ESM-dev, CJS, CJS-dev                                       | Pass   |
| composition: production, development                                       | Pass   |
| **domains** (`consumers/domains.mjs`): production, development             | Pass   |
| SSR                                                                        | Pass   |
| types / CJS types / standalone types: NodeNext, ESNext; mixed declarations | Pass   |
| MCP graph and bin, browser, active divergences                             | Pass   |

`domains.mjs` proves on installed packages: one domain registry across
entries, per-domain scheduler queues, bound writes across domains, a port
without reactive edges, async commit revocation on close, managed root
disposal, and the facade runtime's domain.

`quality:check` (the first half of `release:qualify`, PR phase): every
package job passes except `async`, which fails only on the pre-existing
frozen-frontier test above. Not run here: a controlled 20-pair benchmark
series.
