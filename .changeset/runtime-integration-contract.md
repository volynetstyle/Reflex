---
"@volynets/reflex-runtime": minor
"@volynets/reflex-store": major
"@volynets/reflex-framework": minor
"@volynets/reflex-scheduler": patch
"@volynets/reflex-async": patch
"@volynets/reflex": patch
"@volynets/reflex-dom": patch
---

Runtime integration contract. `@volynets/reflex-runtime/internal` adds semantic operations for sibling packages: `isTracking`, `isContextSettled`, `hasObservers`, `disposeNodeIfUnobserved`, `suspendConsumerIfUnobserved`, `hasPendingValidation`, `isWatcherDisposed`, `shouldRetryWatcherAfterFailure` and `invalidateWatcher`. Scheduler, Store, Framework, DOM, Async and Reflex use them instead of reading kernel registers, flags and edges.

Breaking: `@volynets/reflex-store/runtime/internal` no longer re-exports `@volynets/reflex-runtime/internal`; it exports only `createStoreCell`. Import kernel operations from `@volynets/reflex-runtime/internal`. `DomainPort` no longer exposes `local`; use `port.peek()` for an untracked read of the delivered value.
