---
"@volynets/reflex-dom": major
"@volynets/reflex-framework": major
---

Application facade, first step. `@volynets/reflex-dom` re-exports `untracked`, `onCleanup` and the application types `Accessor`, `MaybeAccessor`, `SignalAccessor`, `SetInput`, `Setter`, `Computed`, `Memo`, `Cleanup`, `EffectCallback`, `EffectCleanup`, `OwnershipContext`, `DisposableResource`, `Component`, `ComponentProps` and `ComponentRenderable`. `@volynets/reflex-framework` adds `onCleanup(fn)`, which registers a cleanup on the current ownership node.

Breaking: in `@volynets/reflex-dom`, `useContext(Token)` and `provideContext(Token, value)` resolve the current owner themselves, and `<Provider context={Token} value={value}>` provides a value to its children. `hasOwnContext` is no longer exported. Code that holds an explicit owner or node imports `useContext(target, Token)`, `provideContext(target, Token, value)` and `hasOwnContext` from `@volynets/reflex-framework`.

Callback scopes: DOM event handlers now run under the ownership node that owns the listener, so `useOwned`, `onCleanup` and `useContext` inside a handler attach to its component and close with it. `useCallbackContext(fn)` binds timers, observers and continuations after `await` to the current component the same way; calls after disposal are ignored and return `undefined`.

Lifetimes and applications: `useOwnedSignal`, `useOwnedComputed`, `useLease` and `useTransfer` use the current owner; `isReleased`, `BorrowError` and `ReleasedResourceError` are re-exported. `createPort`, its errors and types are re-exported, and `usePortEndpoint()` describes the current component as a port endpoint. `app.dispose()` and `renderer.dispose()` dispose every root of the application, close its execution domain and clear it as the default renderer; `disposed` reports the state.

Breaking: `For` rows receive accessors, `children(item: Accessor<T>, index: Accessor<number>)`. A row is created once per key under its own ownership node: a new item object with the same key or a move updates `item()` and `index()` without recreating DOM, components or row state, and hooks called in the row callback close with the row. Read changing fields reactively, for example `{() => item().label}`.

Hydration activates the content of dynamic slots (accessors, `Show`, `Switch`, `For`), so handlers and components inside them work after `hydrate`. `renderToString` wraps each `For` row and the fallback in slot markers, and hydration adopts rows as keyed records; markup from earlier versions falls back to a client mount. An empty `For` mounts its fallback once instead of remounting it on every empty update. Event listener objects forward `signal` to `addEventListener`.

Boundaries: root disposers kept after `app.dispose()` do nothing instead of throwing; a listener object with an already aborted `signal` never attaches; a hydrated text slot keeps the server text node and updates it in place, and an empty server text slot hydrates; `onCleanup` on a node that is already closing runs the cleanup immediately; `useOwnedSignal` and `useOwnedComputed` outside a component throw a named error.
