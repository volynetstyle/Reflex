# Async derivations over the synchronous core

This experiment is exported from `@volynets/reflex/unstable`. It separates
committed truth, tentative execution, attempt lifetime and presentation. The
runtime continues to operate on ordinary synchronous producers, consumers and
watchers; there are no async flags or pending states in the runtime kernel.

The implementation is split into source lifecycle, attempt authority, frontier
capture and evaluated generations. See [the architecture](async-architecture.md)
for ownership, publication validation and the internal computed adapter.

```ts
import { createRuntime, signal } from "@volynets/reflex";
import {
  asyncDerived, read, currentOrUndefined, pending, isLoading, isUpdating, until,
} from "@volynets/reflex/unstable";

const runtime = createRuntime();
const id = signal(1);

const user = asyncDerived(({ signal }) => fetchUser(id(), { signal }));
const company = asyncDerived(({ read, signal }) => {
  const companyId = read(user).companyId;
  return fetchCompany(companyId, { signal });
});

id.set(2);
runtime.flush();

currentOrUndefined(user);              // last committed user, or undefined
pending(() => read(user));  // whether this expression lacks a fresh result
isLoading(user);           // no commit + an active attempt
isUpdating(user);          // a commit + an active attempt
await until(company);      // follows superseding attempts, including upstream work
await company.resolve();   // the same waiting contract
```

## The records and their contracts

| Record | Responsibility |
| --- | --- |
| `AsyncCommit<T>` | Published value, commit version and producing attempt token |
| Synchronous execution | Captures reactive inputs and async dependencies before `await` |
| `AsyncAttempt` | Token, per-attempt signal, liveness and an optional upstream blocker |
| `AsyncBlocker` | Identifies a fresh read that cannot complete, with a change notification promise |
| Optimistic view | Selects an owned override or authoritative committed truth |

`commit()` returns `undefined` only when no successful result has been published.
A successful value of `undefined` still produces a commit record. A new attempt
and a failed attempt retain the previous commit. Disposing a derivation also
retains committed truth for `currentOrUndefined()`; fresh reads throw `AsyncDisposedError`.

`currentOrUndefined()` depends on committed values, independently of attempt lifecycle.
`read()` validates upstream executions and its own watcher, then either returns
the fresh commit, throws `AsyncBlocker`, or throws the latest error. The caller
can distinguish initial loading from revalidation without a lifecycle enum.
`pending(expression)` catches only blockers; ordinary errors propagate.

`currentOrUndefined()` is intentionally a convenience projection: absence and
a committed value of `undefined` have the same result. Use `commit()` for
semantic decisions. The synchronous execution handle provides `commit(source)`
instead of the previous ambiguous `current(source)` method:

```ts
const label = asyncDerived((execution) => {
  const snapshot = execution.commit(user);
  return snapshot === undefined ? "never committed" : "has committed truth";
});
```

This is an unstable API rename: source and standalone `current()` became
`currentOrUndefined()`, and `execution.current()` became `execution.commit()`
with a commit-record return type. Committed reads never add fresh-result edges
to the async wait/ensure graph; their reactive dependencies remain in the sync
runtime.

`refresh()` immediately starts another attempt. Multiple calls create distinct
attempts; every newer attempt revokes the older attempt's commit authority and
aborts its signal. Dependency changes normally restart work through the runtime
scheduler. A fresh read or promise settlement also pulls validation before a
scheduled flush, preventing a result computed from obsolete inputs from landing.
`until()` can follow a blocked chain without manually flushing the scheduler.

All inputs must be captured synchronously before the first `await`:

```ts
const company = asyncDerived(async (execution) => {
  const companyId = execution.read(user).companyId;
  const response = await fetch(`/companies/${companyId}`, {
    signal: execution.signal,
  });
  return response.json();
});
```

The captured `execution.read/commit` handles reject calls from async
continuations. Ordinary signal reads and standalone `read(source)` after `await`
are not tracked as execution inputs. Async dependency graphs must be acyclic.
A blocker interrupts the synchronous loader; it will run again after its
upstream changes. Put dependent I/O after the blocking reads, since code before
a blocker can execute again. Application side effects must also check
`execution.attempt.alive()` when they cannot honor cancellation.

Calling an execution handle after its synchronous capture window throws
`AsyncProtocolError`. Fresh reads, `pending()` and `resolve()/until()` propagate
that fault. `source.error()` also throws protocol faults instead of returning
them as ordinary data failures, so a data-error view cannot silently mistake a
programming bug for a network error. The existing unsuccessful-settlement slot
retains the reason to support deterministic rethrows; there is no new lifecycle
variant. Correcting the job and refreshing can recover without discarding the
last commit.

Activation is currently eager: construction starts the job. Sequential fresh
reads discover the first blocker and stop; later reads in that execution have
not yet been visited. Independent eager sources can still run concurrently.
There is no lazy activation or `readAll` combinator in this experiment. Those
policies need an explicit parallel-readiness contract before adding them.

Pending probes reuse an attempt's cached blocker and change promise within one
source revision. A nested blocker also reuses its combined wake promise. A
revision change invalidates that cache; refresh/disposal and upstream progress
still wake existing observers. `AsyncBlocker` retains its Error shape for now;
the cache changes allocation behavior without changing control-flow semantics.

## Ownership

Use an owner signal to close the whole derivation, and its execution signal for
each request. This keeps framework ownership outside the reactive core:

```ts
import { useAbortSignal } from "@volynets/reflex-framework";
import { asyncDerived, type AsyncJob } from "@volynets/reflex/unstable";

// An application-level adapter, not an exported framework hook.
function useAsync<T>(job: AsyncJob<T>) {
  return asyncDerived(job, { signal: useAbortSignal() });
}
```

The source also implements `dispose()` and `[Symbol.dispose]()`. Closing it
disposes its watcher, aborts the active attempt and wakes waiters. Late promise
resolutions and failures cannot publish. `until(source, { signal })` cancels
that waiter only; it does not cancel shared source work. Settlement and
invalidation run in the runtime context captured when the source was created.

## Optimistic presentation

Use `optimistic(() => currentOrUndefined(source))` to derive presentation from committed
truth. It retains one override owned by a transition. Newer writes replace the
previous override; completing an older transition cannot remove a newer one.
This is a single-owner replacement policy, not a stack of mutation patches.

After `await`, explicitly bind the setter or enter the transition scope:

```ts
const [displayUser, setDisplayUser] = optimistic(() => currentOrUndefined(user));

await transition(async (scope) => {
  const display = scope.bind(setDisplayUser);
  display({ id: 2, name: "Bob" });
  await saveUser();
  scope.run(() => setDisplayUser({ id: 3, name: "Carol" }));
  user.refresh();
  await user.resolve();
});
```

Scope entry captures ownership synchronously. A bound setter works in later
continuations until its transition settles; using it after settlement throws.
Unbound writes outside synchronous scope entry retain the existing microtask
lifetime. Resolution, rejection and synchronous failure finalize transition
ownership. A stable computed view reconnects its base dependency when an override
clears, even if the authoritative value equals the optimistic value; equal
presentation values can still suppress downstream effect execution.

## Publication and remaining experiments

A source publishes its commit and terminal activity inside one existing
reactive batch. Observers do not see a new commit paired with its old active
attempt. This is a per-source guarantee. The experiment does not coordinate
atomic publication of an entire async graph or DOM frame, and `transition()` is
an optimistic lifetime scope rather than a render publication barrier.

UI boundaries such as `<Await>`, SSR/hydration, streaming/AsyncIterable,
multi-owner optimistic patch rebasing and action queue/exhaust policies are not
implemented here. A boundary can use `pending(() => read(source))` and choose
`currentOrUndefined(source)` during revalidation, but a renderer must decide how to hold and
publish a whole view. These are the next places to test whether the framework
needs a temporal coordination primitive from the scheduler.

The contract tests exercise late results, stale failures, dependency changes
before flush, three-source composition, downstream supersession, ownership,
waiter cancellation, error/retry, malformed thenables, undefined commits,
runtime isolation and overlapping optimistic writes.

## Bounded verification

`pnpm test:async:bounded` runs 15,936 deterministic bounded scenarios:

| Scenario family | Bounds | Scenarios |
| --- | --- | ---: |
| Source reference model | 3 schedulers × 3 initial commit forms × all 12³ three-event traces | 15,552 |
| Nested blocker chain | 3 schedulers × all 2⁶ switching/refresh/disposal/late-settlement combinations | 192 |
| Optimistic ownership | 3 schedulers × all 2⁶ ownership/equality/failure/continuation combinations | 192 |

The source oracle uses plain records and no Reflex nodes or state flags. Every
trace checks committed value and presence, version/token, active attempt,
failure, obsolete attempt liveness, input capture and observer histories.
Events include dependency switching, changes to selected and unselected inputs,
refresh, old/new success or failure, equal commits, explicit disposal, owner
abort, and switching before a late settlement. Both an absent commit and an
actual committed `undefined` are tested. Nested chains also resume without a
manual scheduler flush; optimistic cases verify that equal-value cleanup
reconnects the base and that completing an older owner cannot clear a newer
override.

These are finite bounds, not a proof over arbitrary schedules. There is no
random seed or timer-based ordering in the suite. The sidecar graph remains
limited to fresh async execution dependencies; this verification adds no
frames, render states or general reactive graph machinery.

## Longer histories and async graphs

`pnpm test:async:properties` adds new dimensions rather than increasing the
three-event enumeration. The same independent oracle runs 160 property cases
per scheduler/initial-commit combination with histories of 4–6 events.
Fast-check shrinks failing histories within those bounds. The default seed is
`0x4153594e`; `REFLEX_ASYNC_PROPERTY_SEED` and `REFLEX_ASYNC_PROPERTY_PATH` allow
replaying a reported failure with Vitest's test-name filter selecting one
property. Mutation reports preserve the replay seed and path.

The graph tests add a diamond, `A → B/C → D`. They refresh or switch B while B
and C are blocked on A, and while both branches have requests in flight. Both
branch settlement orders are checked, including a late failure from obsolete B.
C's attempt must remain unchanged when only B changes. D publishes only after
its sequential fresh reads can return both branch values; this still does not
add a graph-wide publication barrier.

Three independent eager sources are tested under all six settlement orders.
They each start once, and the sequential reader eventually discovers all of
them and publishes one complete result. This qualifies the current first-blocker
semantics for these eager scenarios, not lazy activation or parallel readiness
discovery. No `readAll` primitive has been added.

Dependency-removal cases switch a blocked child from A to committed B, then
settle, fail, refresh and dispose A. They check the child's loader-call count,
commit object identity/version and publication history, not just its value.
Once B has been selected, late activity on removed A must have no meaningful
effect on the child.

`pnpm typecheck:async-tests` checks the actual test harnesses and mutation config,
in addition to public API type fixtures. This caught the optimistic function
overload being inferred as a function-valued signal; function derivations and
their options now take precedence in overload selection.

## Mutation qualification

`pnpm test:async:mutations` first runs an unmodified control, then applies each
mutation in a fresh Vitest process through a Vite transform. Neither production
source files nor the oracle file are edited. The transform requires the expected
number of exact anchors (both validation paths for dependency pull);
import/compile failures do not count as a killed mutant.

All seven qualification mutants are detected by assertion failures:

| Mutation | Witness |
| --- | --- |
| Remove input validation before publication | Differential history publishes an obsolete value |
| Remove the publication-time liveness check | Validation supersedes the attempt, but the old value still lands |
| Remove the settlement-entry liveness check | Obsolete settlement activates newly invalidated work |
| Remove supersession abort | The obsolete request's signal stays live |
| Remove the oracle's identity check after validation | Correct production behavior disagrees with the damaged oracle |
| Remove upstream execution pull in ensure | A downstream result lands before its changed dependency is validated |
| Remove terminal notify | A cached pending expression stays pending after a commit |

The differential mutants shrink to
`["switch-and-late-settle", "refresh", "refresh", "refresh"]` under the current
minimum length of four. The first event is already sufficient to expose the
fault; the remaining entries are required by the generator's bound. A replay
path is kept in the report, so this is not described as a globally minimal
counterexample.

The runner writes `.cache/async-mutations/report.json` with control/mutant
results, witnesses, counterexamples, replay metadata and source hashes. These
seven targeted mutations qualify the listed invariants; they do not measure
an unrestricted mutation score or prove the entire oracle correct.

The allocation optimizations and production comparison procedure are described
in [Async validation allocation work](./async-performance.md).
