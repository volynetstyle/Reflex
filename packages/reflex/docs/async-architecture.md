# Async evaluation and publication

The async facade applies the B3 results from [the semantics lab](../lab/async-semantics/README.md)
above the existing synchronous runtime. The public `AsyncSource`, `AsyncExecution`,
commit records and helper functions retain their contracts.

| Module                              | Ownership                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------- |
| `unstable/async.ts`                 | Public facade and presentation/waiting helpers                            |
| `async/types.ts`, `async/errors.ts` | Public contracts and control errors                                       |
| `async/frontier.ts`                 | Synchronous collection, transitive inheritance and copied snapshots       |
| `async/evaluation.ts`               | Computed generations pairing an evaluation with its frontier              |
| `async/failure.ts`                  | Identify source failures without changing the error seen by user code     |
| `async/attempt.ts`                  | Attempt authority, cancellation and synchronous execution-handle lifetime |
| `async/source.ts`                   | Source lifecycle, freshness pulls, validation and publication             |
| `async/wait.ts`                     | Abortable change notifications                                            |

## Ownership and capture

A frontier contains freshness handles for async sources. It does not contain
ordinary runtime nodes. A source read records its handle in the current collector;
the execution context separately enforces `read`/`commit` lifetime before `await`.
Nested source executions install their own collector and restore the parent on exit.

`createEvaluatedComputed` is an internal adapter. It caches one
`EvaluatedGeneration<T>` containing both an evaluation and a frontier snapshot.
Every recomputation uses a new collector. Its accessor establishes the normal
reactive edge, inherits the cached frontier, then unwraps the evaluation. A
blocked evaluation can therefore wake a consumer that has never received a value.
Cached children contribute their frontier while their parent recomputes, including
recomputation outside an async job. This preserves transitively hidden sources in
warm chains and diamonds.

Ordinary exceptions still escape the compute callback without committing a new
generation. Only a blocker or an observed source failure becomes a cached control
evaluation. Source failures retain their original identity, including primitive
errors and `undefined`, even in catch blocks inside user expressions. Protocol
errors remain ordinary computation failures. A nested evaluated accessor forwards
the source-failure identity into its parent's capture scope.

The synchronous body of an async job copies its collected frontier into the
attempt. The source's current validation frontier references that snapshot,
independently of the previous successful commit. Later computed generations cannot
rewrite an existing attempt's proof obligations. A new attempt replaces the
source frontier; disposal releases it.

## Publication

Asynchronous completion first rejects obsolete attempts, enters the owning runtime
and its batch, pulls upstream freshness and checkpoints the source watcher. It
then probes every distinct source in the attempt snapshot once for pending,
failure or disposal. These probes run untracked and use already-pulled source
state. A final watcher checkpoint detects invalidation caused during validation.
Authority is checked before and after validation and immediately before publication.

Synchronous results validate the captured snapshot without reentering their
currently running watcher. Validation outcomes are explicit: valid, superseded,
blocked or error. A blocker retains the candidate and resumes validation after its
notification. A failure preserves the previous commit. A superseded attempt cannot
publish or activate newer work through a late settlement.

The adapter is intentionally internal; ordinary `computed` and framework hooks
continue to use their existing contracts. Composing cached synchronous consumers
with async sources requires the evaluated adapter until a separate facade change
integrates it. No runtime node layout, graph protocol or scheduler changes are needed.

## Reproduction

From `packages/reflex`:

```powershell
pnpm test:async:production
pnpm test:async:production:mutations
pnpm test:async:mutations
pnpm typecheck:async-tests
pnpm typecheck:async:semantics
```

The production build runs the same 84-case corpus and bounded direct, cached and
pending-capture explorers as B3, across `flush`, `sab` and `eager`. Validation hooks
and counters are injected only into disposable lab bundles. Nine production
mutants cover snapshot ownership, authority, diamond deduplication, blocked
publication, dependency removal, obsolete settlement, hidden frontiers, edge
establishment and publication validation.

Production reports include source hashes and are written under
`.cache/async-semantics/production-correctness.json` and `production-mutations.json`.
Historical A/B1/B2/B/B3/C comparisons use `lab/async-semantics/baseline.ts`, the
pre-refactor source with its factory import relocated. Historical timing reports
remain measurements of those experimental implementations; they do not measure
the new production modules.
