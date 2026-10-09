# Ownership cancellation

`getLifetimeSignal(node)` returns one native `AbortSignal` for an ownership node.
The controller is allocated on the first call. Repeated calls return the same
signal, including after disposal. Disposal aborts the signal once. A signal first
requested while the node is closing or already disposed is immediately aborted.
Nested owners have independent signals; disposing a parent also cancels its
descendants through the existing ownership cleanup traversal.

```ts
import { LifecycleScope } from "@volynets/reflex-framework";

const scope = new LifecycleScope();
const request = fetch("/api/items", { signal: scope.signal });
// Later, including while the request is pending:
scope.dispose();
```

`useAbortSignal()` obtains the signal of the currently active ownership node.
Calling it without an owner throws in both development and production. Capture
the signal synchronously before `await`; ownership context does not follow an
asynchronous continuation.

The call site determines the lifetime. In component setup, the signal lives until
that component is disposed. Inside `useEffect`, it belongs to the effect's current
execution node: rerunning the effect disposes the previous execution and aborts
its signal. A new execution receives a new signal. Capture the component signal
outside the effect if the work should survive effect reruns.

```ts
useEffect(() => {
  const url = endpoint();
  const signal = useAbortSignal();
  void fetch(url, { signal })
    .then(async (response) => {
      const value = await response.json();
      if (!signal.aborted) publish(value);
    })
    .catch((error) => {
      if (!signal.aborted) reportError(error);
    });
});
```

Cancellation is cooperative. Operations that ignore the signal may still settle;
check the signal or the application's execution identity before publishing their
result. Merely obtaining a signal does not add a reactive dependency, change
scheduling, or introduce a frame/commit protocol.

This API requires a host with native `AbortController` (including supported Node
versions). TypeScript declares these shared web-platform types in `lib.dom`; the
signal declaration preserves that library reference for consumers. The mechanism
does not access a document or import a renderer.
