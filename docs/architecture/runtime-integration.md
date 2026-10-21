# ADR: Runtime integration contract

**Status:** accepted
**Scope:** `reflex-runtime`, `reflex-scheduler`, `reflex-store`,
`reflex-framework`, `reflex-dom`, `reflex-async`, `reflex`

## Context

Sibling packages implemented runtime semantics by reading kernel
representation from `@volynets/reflex-runtime/internal`:

- Store saved and restored `currentConsumer` by hand instead of `untracked`,
  tested `currentConsumer === null` to skip producer allocation, and
  implemented consumer collection itself (`firstOut`, `unlinkAllSources`,
  writing `state` and `payload`).
- Scheduler re-derived the watcher failure state machine from `Both` and
  `Scheduled`, tested disposal through `compute === undefined`, pre-checked
  `runtimeState & IdlePending`, and read `RuntimeContext` register fields for
  inactive contexts.
- Framework, DOM and Store read `currentConsumer` to ask "is a computation
  tracking now".
- Async and Store tested `state & Both`; the Reflex resource wrote `Changed`
  and fired the invalidation hook by hand.
- Reflex and Async built nodes with `new ReactiveNode(…, *_INITIAL_STATE)`,
  bypassing the factories and their development node records.
- Store's `/runtime/internal` re-exported the whole kernel by wildcard, and
  `DomainPort.local` exposed the mirror producer.

Each of these is one fact with two owners: the runtime decides the state, and
a sibling reinterprets it.

## Decision

1. **Runtime owns** tracking registers, graph topology, node flags, watcher
   recovery and idle settlement. **Scheduler owns** queue order and delivery
   time. **Framework owns** scopes, leases and domain ownership. **Store owns**
   when to collect. **Async owns** attempt semantics.
2. Siblings state intents through named runtime operations. Where an intent
   had no operation, the runtime gained one
   (`packages/reflex-runtime/src/protocol/integration.ts`, documented in
   [RUNTIME.md](../../packages/reflex-runtime/docs/RUNTIME.md#integration-contract)):
   `isTracking`, `isContextSettled`, `hasObservers`,
   `disposeNodeIfUnobserved`, `suspendConsumerIfUnobserved`,
   `hasPendingValidation`, `takeScheduledWatcher`,
   `shouldRetryWatcherAfterFailure`, `invalidateWatcher`.
   Checking for observers and changing topology is one operation.
3. The permitted surface is an allowlist in
   [`scripts/check-package-boundaries.mjs`](../../scripts/check-package-boundaries.mjs)
   (`pnpm check:package-boundaries`). It rejects, in every sibling `src/`:
   names outside the allowlist, wildcard imports or re-exports of runtime
   internals, `new …ReactiveNode`, and reads of edge fields and
   `RuntimeContext` register fields.
4. Reflex packages are not privileged. They use the same surface an external
   integrator would; the raw kernel stays available through `/internal` as an
   unstable low-level interface.
5. Store `/runtime/internal` exports only the compiled-store lowering target
   (`createStoreCell`). `DomainPort` no longer exposes `local`; `peek()` reads
   the delivered value untracked.

## Consequences

- **Performance.** No node field, kernel branch or lookup is added (H1 in
  [execution-domains.md](./execution-domains.md)). The new operations are
  monomorphic one-line functions over existing fields. A boundary call costs
  a module cell load and a call-target check even when V8 inlines it, and
  inside the large scheduler drain loop small helpers were not inlined at
  all. Local paired measurements (Node v25.2.0, win32 x64, against `main`):
  - Scheduler: per-watcher `isWatcherDisposed` cost +45% on the disposed
    drain; it was replaced by `takeScheduledWatcher`, which folds the liveness
    answer into the release call the drain already made. An unconditional
    `flushPendingRuntimeIdle` cost about 4% per flush; `settleRuntimeIdle`
    keeps the pending test inline. Afterwards every scheduler hot-path
    effect is within two run-to-run standard deviations of the baseline.
  - Store: `isTracking()` costs about 0.2 ns per read: `cell/read` +12% and
    `keyed/materialized-read` +14% (7 of 7 pairs slower); every other case is
    within noise. This cost is open.
  - Facade and Async factories compile to the same `new ReactiveNode` in
    production; the development node record is erased.
    The runtime kernel itself is unchanged; its paired CI comparison
    (`runtime-paired-benchmarks.yml`) covers placement effects of the new code.
- **Diagnostics.** Reflex and Async nodes now go through the runtime
  factories, so development builds record their creation like other nodes.
- **Not done here.** `RuntimeContext` still carries its register fields as
  public mutable properties; the boundary check forbids reading them outside
  the runtime, but a private register bank behind an opaque context handle is
  a separate change to the switch path. Tests and benchmarks outside
  `src/` may still inspect flags; the check covers shipped code only.

## Verification

`pnpm check:package-boundaries` reports 50 violations on `main` at `4e69b4c`
and none after this change. Runtime contract tests:
`packages/reflex-runtime/test/runtime/contracts/runtime.integration.test.ts`.
