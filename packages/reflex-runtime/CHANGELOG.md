# @volynets/reflex-runtime

## 1.2.1

### Patch Changes

- c6bd18c: Repeated reads of a broad signal or computed inside a wide computation are much cheaper. In a pattern like `items.map((item) => format(item, theme()))`, every re-read of `theme` searched the dependency lists again; the runtime now remembers the edge its last search found in a slot each node already has, so a re-read costs one comparison (about 3× faster on a 64-item benchmark whose hub has 64 other subscribers). Behavior, dependency order and memory use are unchanged. Unmounting large subtrees costs about 2% more, the price of keeping that slot exact.

## 1.2.0

### Minor Changes

- 72a60ca: Runtime integration contract. `@volynets/reflex-runtime/internal` adds semantic operations for sibling packages: `isTracking`, `isContextSettled`, `hasObservers`, `disposeNodeIfUnobserved`, `suspendConsumerIfUnobserved`, `hasPendingValidation`, `isWatcherDisposed`, `shouldRetryWatcherAfterFailure` and `invalidateWatcher`. Scheduler, Store, Framework, DOM, Async and Reflex use them instead of reading kernel registers, flags and edges.

  Breaking: `@volynets/reflex-store/runtime/internal` no longer re-exports `@volynets/reflex-runtime/internal`; it exports only `createStoreCell`. Import kernel operations from `@volynets/reflex-runtime/internal`. `DomainPort` no longer exposes `local`; use `port.peek()` for an untracked read of the delivered value.

### Patch Changes

- 72a60ca: Execution domain entry is cheaper. `domain.batch(fn)` and `domain.run(fn)` invoke the callback directly and inline into their caller, so a callback closure such as `batch(() => write())` is no longer allocated per call; a public `batch` around one write costs about half as much. Behavior is unchanged. The `state`, `closed`, `signal` and `depth` accessors now live on the domain's prototype, so `Object.keys(domain)` no longer lists them; the operations remain own properties and work detached.
- 72a60ca: A watcher is no longer handed to the host again while it validates itself. When a dependency recomputed during validation also feeds the watcher directly (for example, the watcher reads `fullName` before `firstName`), the watcher was queued a second time and ran an empty extra `runWatcher`; a validation failure in that pass failed twice per drain. The changed dependency is still recorded and consumed by the current run.

## 1.1.0

### Minor Changes

- 39587e9: Add isolated execution domains (Release A) and opt-in domain ports
  (Release B).
  - Runtime: `createExecutionDomain` with `run`, `batch`, `flush`,
    safe-point `teardown` and two-phase `close`. `configureRuntimeContext` no
    longer clobbers live execution registers, the tracking epoch is one
    kernel-wide clock, and DEV diagnostic phases are kept per context. Node
    and edge shapes and kernel hot paths are unchanged.
  - Scheduler: `createSchedulerDomain` binds one scheduler to one domain.
  - Framework: owner trees bind to a domain (`OwnerContext.domain`);
    `runManaged`, `bindManaged` and `createManagedRoot`; owned effects run and
    clean up in their owner's domain with two-phase disposal; owned values
    with borrow, `lease` and `transfer` rules; versioned snapshot ports
    (`createPort`).
  - DOM: every renderer runtime is an execution domain; closing it cancels
    pending microtask work.
  - Async: sources capture their domain; closing it revokes commit authority.
  - Reflex: `createRuntime()` is backed by a scheduler domain and exposes it as
    `runtime.domain`. The global `batch` now enters that runtime's domain.

  Migration: existing raw APIs keep their signatures. Code that called
  `configureRuntimeContext` inside a computation now keeps its tracking (this
  was a bug). Code that relied on the global `batch` running under another
  runtime's context now runs in the latest created runtime's domain.

### Patch Changes

- 0eb3aa1: Align the Rollup output layout with published package exports, emit real `.cjs`
  entry points for CommonJS consumers, and make the public `reflex` type output
  self-contained so it no longer depends on `@reflex/runtime` declarations at
  install time.
- 082d4e3: Preserve supported package formats and shared runtime identity in clean workspace builds. Include development debug chunks, provide matching CJS declarations with shared ambient types, erase scheduler production flags, and finalize the portable MCP CLI. Fix extracted synchronous AsyncExecution read/commit callbacks while retaining stale-attempt and after-await protection.
- c867d76: Release the current runtime internal API with the `Both`, `Unknown`, and `Changed`
  evidence flags required by store selectors. Require runtime `^1.0.1` in the store
  peer contract because the published runtime `1.0.0` lacks `Both` and `Unknown` in
  both production and development entrypoints.

  Check evidence flag values alongside runtime module identity in production and
  development ESM/CJS builds. Run the packed runtime/store consumer in both Node
  export conditions with explicit named imports and evidence flag assertions.
