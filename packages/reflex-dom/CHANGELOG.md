# @volynets/reflex-dom

## 3.0.0

### Major Changes

- 72a60ca: Application facade, first step. `@volynets/reflex-dom` re-exports `untracked`, `onCleanup` and the application types `Accessor`, `MaybeAccessor`, `SignalAccessor`, `SetInput`, `Setter`, `Computed`, `Memo`, `Cleanup`, `EffectCallback`, `EffectCleanup`, `OwnershipContext`, `DisposableResource`, `Component`, `ComponentProps` and `ComponentRenderable`. `@volynets/reflex-framework` adds `onCleanup(fn)`, which registers a cleanup on the current ownership node.

  Breaking: in `@volynets/reflex-dom`, `useContext(Token)` and `provideContext(Token, value)` resolve the current owner themselves, and `<Provider context={Token} value={value}>` provides a value to its children. `hasOwnContext` is no longer exported. Code that holds an explicit owner or node imports `useContext(target, Token)`, `provideContext(target, Token, value)` and `hasOwnContext` from `@volynets/reflex-framework`.

  Callback scopes: DOM event handlers now run under the ownership node that owns the listener, so `useOwned`, `onCleanup` and `useContext` inside a handler attach to its component and close with it. `useCallbackContext(fn)` binds timers, observers and continuations after `await` to the current component the same way; calls after disposal are ignored and return `undefined`.

  Lifetimes and applications: `useOwnedSignal`, `useOwnedComputed`, `useLease` and `useTransfer` use the current owner; `isReleased`, `BorrowError` and `ReleasedResourceError` are re-exported. `createPort`, its errors and types are re-exported, and `usePortEndpoint()` describes the current component as a port endpoint. `app.dispose()` and `renderer.dispose()` dispose every root of the application, close its execution domain and clear it as the default renderer; `disposed` reports the state.

  Breaking: `For` rows receive accessors, `children(item: Accessor<T>, index: Accessor<number>)`. A row is created once per key under its own ownership node: a new item object with the same key or a move updates `item()` and `index()` without recreating DOM, components or row state, and hooks called in the row callback close with the row. Read changing fields reactively, for example `{() => item().label}`.

  Hydration activates the content of dynamic slots (accessors, `Show`, `Switch`, `For`), so handlers and components inside them work after `hydrate`. `renderToString` wraps each `For` row and the fallback in slot markers, and hydration adopts rows as keyed records; markup from earlier versions falls back to a client mount. An empty `For` mounts its fallback once instead of remounting it on every empty update. Event listener objects forward `signal` to `addEventListener`.

  Boundaries: root disposers kept after `app.dispose()` do nothing instead of throwing; a listener object with an already aborted `signal` never attaches; a hydrated text slot keeps the server text node and updates it in place, and an empty server text slot hydrates; `onCleanup` on a node that is already closing runs the cleanup immediately; `useOwnedSignal` and `useOwnedComputed` outside a component throw a named error.

### Patch Changes

- 72a60ca: Runtime integration contract. `@volynets/reflex-runtime/internal` adds semantic operations for sibling packages: `isTracking`, `isContextSettled`, `hasObservers`, `disposeNodeIfUnobserved`, `suspendConsumerIfUnobserved`, `hasPendingValidation`, `isWatcherDisposed`, `shouldRetryWatcherAfterFailure` and `invalidateWatcher`. Scheduler, Store, Framework, DOM, Async and Reflex use them instead of reading kernel registers, flags and edges.

  Breaking: `@volynets/reflex-store/runtime/internal` no longer re-exports `@volynets/reflex-runtime/internal`; it exports only `createStoreCell`. Import kernel operations from `@volynets/reflex-runtime/internal`. `DomainPort` no longer exposes `local`; use `port.peek()` for an untracked read of the delivered value.

- Updated dependencies [72a60ca]
- Updated dependencies [72a60ca]
  - @volynets/reflex-framework@1.0.0

## 2.0.1

### Patch Changes

- 03f4f9b: Internal peer dependencies now follow the released versions: the published floor is the workspace version at release time (`@volynets/reflex-runtime@^1.1.0`).

## 2.0.0

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

- 1593ec2: Add lazy owner lifetime AbortSignals through getLifetimeSignal, useAbortSignal,
  LifecycleScope.signal, and ModelContext.signal. Add live DOMRangeHandle refs to
  DOM Show and For, including hydration, focus, geometry, scrolling and automatic
  observer membership cleanup.

### Patch Changes

- 6096f73: Prepare the DOM renderer, framework ownership API, Reflex ranked effects, and
  the shared Vite plugin for publication.
  - expose ranked effects from the Reflex facade
  - add render-phase effects for layout-safe host updates
  - make ownership reactive helpers available from the main framework import
  - move DOM JSX reactive-props transform into the shared Vite plugin
  - simplify reflex-dom internals and remove the obsolete Vite peer dependency

- Updated dependencies [6096f73]
- Updated dependencies [39587e9]
- Updated dependencies [082d4e3]
- Updated dependencies [1593ec2]
  - @volynets/reflex-framework@0.2.0
  - @volynets/reflex-scheduler@0.2.0
