# ADR: Reflex execution domains

**Status:** accepted, implemented incrementally (PR-00 … PR-10)
**Scope:** `reflex-runtime`, `reflex-scheduler`, `reflex-framework`,
`reflex-dom`, `reflex-async`, `reflex-store`, `reflex`

## Decision

Reflex supports several independent reactive applications in one JS realm as
**isolated execution domains** plus **nested ownership scopes**:

- A **domain** decides _where_ reactive work executes: its register bank, host
  hooks, scheduler queue and entry depth.
- A **scope** (`reflex-framework` `OwnershipNode`) decides _how long_ things
  live and which environment (context providers) they see.
- A **port** is the only sanctioned way independent domains exchange values.

The raw graph kernel stays context-unaware. Domains are an execution boundary
around it, never a property of nodes or edges.

## Layers

| Layer             | Authority                                                  | Implementation                                       |
| ----------------- | ---------------------------------------------------------- | ---------------------------------------------------- |
| Reactive kernel   | Node value, flags, dependency graph, push/pull             | `reflex-runtime/src/kernel`, `src/protocol`          |
| Execution domain  | Register bank, hooks, scheduler identity, entry, safe points | `reflex-runtime/src/domain`, `src/kernel/context*` |
| Scheduler policy  | Per-domain enqueue, flush, settlement                      | `reflex-scheduler` (`createSchedulerDomain`)         |
| Owner/environment | Provider chain, nested ownership, per-run effect ownership | `reflex-framework/src/ownership`                     |
| Lifetime          | Resource handles, cleanup, abort signals                   | `reflex-framework/src/ownership/lifecycle.ts`        |
| Managed boundary  | Domain + owner entry, borrow rules, graph teardown         | `reflex-framework/src/domain`                        |
| Communication     | Versioned snapshot ports                                   | `reflex-framework/src/domain/port.ts`                |
| Async             | Attempt identity, commit authority, completion entry      | `reflex-async/src/async`                             |

`reflex-runtime` never depends on `reflex-framework`.

## Formal model

For each domain `d`: `D_d = (G_d, Σ_d, Q_d)` — local graph `G_d = (V_d, E_d)`,
saved register bank `Σ_d`, scheduler state `Q_d`. All domains share the
compiled kernel `K` within one module format. Module-level registers are the
active bank. ESM and CJS module instances are not promised to share a
singleton.

### Invariants

| Id  | Invariant                                                                                                                                 | Enforced by                                                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| G1  | Independent domains have disjoint node sets.                                                                                              | Managed API discipline; DEV cross-domain read guard            |
| G2  | Managed operations only create edges inside one domain.                                                                                   | Managed API; ports never link                                  |
| G3  | Push/pull from `V_d` never reaches another domain (follows from G2).                                                                      | G2                                                             |
| E1  | At every supported boundary the module registers reflect the active domain; inactive banks hold their last saved state.                    | `context.switch.ts`                                            |
| E2  | Nested A→B→A and every throw restore register banks, host hooks and diagnostic phase state.                                               | `runWithRuntimeContext` `finally`, execution-state save/load   |
| E3  | Active push/pull continuation slices survive nested entries.                                                                              | Shared reentrant stacks with invocation slices                 |
| S1  | A watcher is enqueued and executed by its own domain's scheduler, including microtask resume.                                             | Per-domain hooks; `domain.run` around every flush              |
| O1  | Managed lifetime uses the existing `OwnershipNode` tree only.                                                                             | No ownership types in runtime                                  |
| O2  | Absent an explicit lease, a producer's owner outlives every scope that keeps a live dependency on it.                                     | `borrow()` / `lease()` in the managed boundary                 |
| L1  | A closing scope rejects new owned work; each resource is disposed at most once; stale async completions cannot commit after closure.      | `OwnershipNode` meta, domain `closed`, async attempt authority |
| L2  | Graph unlinking never invalidates an active walker continuation; teardown requested inside managed execution is deferred to a safe point. | `domain.teardown()` safe-point queue                           |
| A1  | Dependency tracking only spans synchronous segments; async continuations restore domain/environment only by explicit binding.             | `AsyncCore` captured domain                                    |
| P1  | Inter-domain transfers never create reactive edges.                                                                                       | Ports write a local mirror producer                            |
| P2  | Per-port order, cancellation and snapshot coherence are specified by the port, not inferred from batching.                                | `port.ts` contract                                             |
| H1  | No domain lookup, branch, WeakMap operation or shape change on the kernel read/write/resolve/push/pull path.                              | `check-architecture-contract.mjs`                              |

## Threat model

Strict separation is a contract for managed operations and trusted raw code.
Arbitrary JS holding raw `ReactiveNode` references and low-level operations can
violate G1/G2; with an unchanged raw kernel this cannot be prevented. This is
not a heap-isolation or security boundary. DEV builds add boundary checks at
managed entry points only.

## Domain state machine

```
          run()/batch()/flush()           close()
  Open ───────────────────────────► Open ─────────► Closing ──(safe point)──► Closed
   ▲            (depth++ / depth--)                     │
   └──────────────── teardown queue drains at depth 0 ──┘
```

- `Open`: accepts managed entry. `depth` counts managed entries.
- `Closing`: `close()` called while `depth > 0`. New `run/batch/flush` entries
  are rejected; the outer continuation keeps running to its natural exit.
- `Closed`: teardown drained, `signal` aborted, scheduler queue released.

## Support matrix

| Scenario                                         | Status                         |
| ------------------------------------------------ | ------------------------------ |
| Several domains, one module format               | Supported                      |
| Nested A→B→A entry, including throws             | Supported                      |
| Owner changes inside one domain                  | Supported, no register reload  |
| Async completion into captured domain            | Supported (explicit capture)   |
| Implicit context propagation across `await`      | Not supported (A1)             |
| Domains split across ESM and CJS module instances | Not supported                  |
| Cross-domain reactive edge via managed API       | Rejected (DEV) / unsupported   |
| Cross-domain value transfer                      | Ports only                     |

## Ownership integration (PR-04)

- `OwnerContext.domain` associates an existing owner tree with its domain.
  This is the only link; `OwnershipNode` is unchanged and runtime knows
  nothing about owners.
- `runManaged(owner, node, fn)` = `domain.run(() => runWithOwner(owner, node,
  fn))`. Owner changes inside one domain never reload the register bank, and
  `runWithOwner` never resets tracking.
- Owned effects run, re-run and clean up in their owner's domain, with the
  run's owner/environment restored, wherever creation or disposal starts.
  `registerCleanup` callbacks also run in the owner's domain.
- `bindManaged(fn)` captures domain + owner + node for callbacks invoked later
  from outside (events, timers, async continuations). Plain reactive
  callbacks are not wrapped and keep their cost.
- Raw writes are attributed to the *active* domain: writing another domain's
  node from a foreign context uses the foreign scheduler. Write through the
  owning domain's managed entry or a bound writer.

### Provider semantics

Context providers are setup-time values. `provideContext` mutates the
provider layer for later lookups only; it notifies nobody, and consumers that
already looked a value up keep it. A value that must change observably is
provided as an accessor (signal) and read reactively.

## Lifetime and borrowing (PR-05)

Managed values (`createOwnedSignal`, `createOwnedComputed`) record their
owner `OwnershipNode` on the handle, never on the reactive node.

| Reader scope vs owner             | Without agreement | With `lease()` / `transfer()` |
| --------------------------------- | ----------------- | ----------------------------- |
| Same scope or descendant          | Allowed           | —                             |
| Sibling                           | `BorrowError`     | Allowed                       |
| Ancestor (longer-lived) of owner  | `BorrowError`     | Allowed                       |
| Other execution domain            | Use a port        | `transfer()` rejected         |

- When the owner closes with no lease, the handle is released: reads and
  writes throw `ReleasedResourceError`, and the graph node is unlinked at the
  owner domain's next safe point.
- With leases outstanding the value stays live until the last lease ends
  (explicit `end()` or the borrower closing).
- `transfer()` moves ownership inside one domain; the old owner's closure no
  longer releases it.
- Managed writes run in the owner's domain.
- Only tracked reads (inside a computation) keep a live dependency, so only
  they are checked; an untracked snapshot read is always allowed. A tracked
  read of a value owned by another domain is rejected (G1/G2).
- The borrow check runs in development builds only, at the handle's read.
  Release checks run in every build. Type brands and handles cannot stop code
  that holds raw nodes; this is a correctness aid, not isolation.

## Two-phase disposal (PR-06)

Disposal of a managed effect has two phases:

1. **Logical close, synchronous.** The effect is marked closed (a queued or
   re-validated run becomes inert) and its current run's ownership cleanups
   run immediately, in their established LIFO order and in the owner's
   domain/environment.
2. **Physical unlink, at a safe point.** `disposeWatcher` is handed to
   `domain.teardown()`: it runs now when no managed entry of the domain is on
   the stack, otherwise at the outermost managed exit, so no active push/pull
   continuation loses its edges.

Safe points are defined by the domain's managed entry depth only, not by
`currentConsumer === null` (a pull walk may be active with no consumer).
Teardown errors are reported (default `console.error`, as ownership cleanup
does) and draining continues. Owners without a domain keep the previous
eager teardown.

## Async authority (PR-07)

- `AsyncCore` captures the active runtime context and, when it belongs to
  one, its execution domain. Attempt tokens and `attempt.alive()` remain the
  commit authority.
- The domain's `signal` is a lifetime: closing the domain disposes the
  source synchronously (before user abort listeners of the attempt run), so a
  completion that settles later, or in the same turn, cannot publish (L1).
  A source created in a closed domain starts disposed.
- Every completion/publish/dispose enters the captured domain through
  `domain.run`, so invalidations reach that domain's scheduler only and
  teardown waits for its safe point. A closed domain is entered by register
  bank only.
- Tracking never spans `await` (A1); there is no implicit async context.
  Explicit binding (`bindManaged`) is the portable way to restore a domain
  and owner in a continuation.

## Forbidden operations

- Adding `owner`/`realm`/domain fields to `ReactiveNode`, or changing
  `ReactiveEdge`.
- Encoding domain or lifetime in `state`.
- Domain lookups, WeakMap operations or owner dispatch in kernel hot paths.
- A second ownership tree beside `reflex-framework/ownership`.
- Silent cross-domain edges.
- Automatic context propagation across `await`.

## Related

- [Observational equivalence](./observational-equivalence.md)
- [Execution domain baseline](./execution-domains.baseline.json)
- `packages/reflex-runtime/docs/INVARIANTS.md` §9 (register bank, epoch clock)
