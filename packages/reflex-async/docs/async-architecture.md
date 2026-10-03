# Async evaluation and publication

The async facade applies the B3 results from [the semantics lab](../lab/async-semantics/README.md)
above the existing synchronous runtime. The public `AsyncSource`, `AsyncExecution`,
commit records and helper functions retain their contracts.

| Module                              | Ownership                                                               |
| ----------------------------------- | ----------------------------------------------------------------------- |
| `index.ts`                         | Public facade and presentation/waiting helpers                          |
| `async/types.ts`, `async/errors.ts` | Public contracts and control errors                                     |
| `async/frontier.ts`                 | Shared evaluation proof graphs and lazy distinct publication vectors    |
| `async/evaluation.ts`               | Computed generations pairing an evaluation with its proof graph         |
| `async/failure.ts`                  | Identify source failures without changing the error seen by user code   |
| `async/attempt.ts`                  | Attempt authority, cancellation, handle lifetime and vector memoization |
| `async/source.ts`                   | Source lifecycle, freshness pulls, validation and publication           |
| `async/wait.ts`                     | Abortable change notifications                                          |

## Ownership and capture

An evaluation frontier is an immutable proof graph of freshness handles for async
sources. It does not contain ordinary runtime nodes. Composition stores references
to inherited frontiers; empty and singleton frontiers need no wrapper. A source
read records its handle in the current collector; the execution context separately
enforces `read`/`commit` lifetime before `await`. Nested source executions install
their own collector and restore the parent on exit.

`createEvaluatedComputed` is an internal adapter. It caches one
`EvaluatedGeneration<T>` containing both an evaluation and an evaluation frontier.
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

`execution.commit(source)` reads the latest published snapshot and registers its
ordinary reactive edge, so a later publication can rerun the consumer. It does not
enter the async freshness frontier or wait for an active attempt; the returned
commit can be older than current inputs. Use `execution.read(source)` when a
derivation needs fresh truth. `undefined` means no commit, while a committed value
of `undefined` is represented by an `AsyncCommit` record.

The internal evaluated-computed adapter accepts optional `EvaluationMetrics` for
profiling. It compares evaluation values, errors and blockers, plus the local
frontier shape, only when a probe is supplied. `sameFrontierShape` compares direct
handles or immediate inherited references in order without traversing child graphs.
Different shapes with the same leaves conservatively count as changed. These
counters do not suppress computed generations. A changed frontier remains a changed
generation when the computed value is equal. Tests use a stable-value probe to
count downstream recomputes caused by a new generation identity.

The synchronous body of an async job captures its proof graph in the attempt. The
source uses that graph to pull freshness while the attempt is active; cached graph
traversal deduplicates locally without creating a retained vector. Later computed
generations cannot rewrite an existing attempt's proof obligations. A new attempt
replaces the current graph, and disposal releases it.

## Publication

Asynchronous completion first rejects obsolete attempts, enters the owning runtime
and its batch, pulls upstream freshness and checkpoints the source watcher. After
the attempt survives that freshness checkpoint, its proof graph is materialized
once into a readonly, distinct publication vector in capture order. Materialization
is a pure traversal; its result is cached by the attempt, with no global table or
cache on dependency handles. Independent attempts own independent vectors. Validation
probes each source in that vector once for pending, failure or disposal. These
probes run untracked and use already-pulled source state. A final watcher
checkpoint detects invalidation caused during validation. Authority is checked
before and after validation and immediately before publication.

Synchronous results validate the captured proof graph without reentering their
currently running watcher. Validation outcomes are explicit: valid, superseded,
blocked or error. A blocker retains the candidate and its materialized vector,
then resumes validation by iterating that same vector after notification.
Superseded attempts that do not reach a live publication checkpoint do not
materialize it. A terminal publication drops the proof graph while retaining the
flat vector needed for future freshness pulls. A failure preserves the previous
commit. A superseded attempt cannot publish or activate newer work through a late
settlement.

Frontier nodes carry a private symbol brand, so a dependency's own `kind` property
cannot be confused with a proof node. The representation laws are:

- Materialization returns distinct leaves in their first capture order.
- A captured proof's leaves stay stable throughout its lifetime; each attempt
  retains the same publication vector across retries.
- Effectful validation changes neither the captured proof nor its vector.

Inherited owner cycles are rejected during capture, before the async job can
continue past the offending read. Deferring that check changes the timing of a
protocol failure and requires separate qualification.

The adapter is intentionally internal; ordinary `computed` and framework hooks
continue to use their existing contracts. Composing cached synchronous consumers
with async sources requires the evaluated adapter until a separate facade change
integrates it. No runtime node layout, graph protocol or scheduler changes are needed.

## Reproduction

From `packages/reflex-async`:

```powershell
pnpm test:async:production
pnpm test:async:production:mutations
pnpm test:async:mutations
pnpm typecheck
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
