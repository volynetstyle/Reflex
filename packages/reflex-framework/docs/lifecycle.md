# Lifecycle scopes and resource handles

`LifecycleScope` uses the framework's `OwnershipNode` tree. It has no global
resource registry and no parallel ownership tree. A scope can own another scope
or a `LifecycleHandle`; the node's `parent` is the ownership record.

```ts
import { LifecycleScope } from "@volynets/reflex-framework";

const parent = new LifecycleScope();
const child = new LifecycleScope();
parent.own(child);
child.defer(() => closeConnection());

parent.dispose(); // child first, then parent; repeated disposal is inert
```

For a raw object with `Symbol.dispose`, create one handle and pass that handle
between scopes.

```ts
import { LifecycleHandle } from "@volynets/reflex-framework";

const handle = new LifecycleHandle(resource);
child.own(handle);
```

Exclusive ownership is guaranteed for **the handle**, because it has one node.
Wrapping the same raw object twice creates two different handles and may call
its disposer twice. Callers must create the handle once when the resource is
created and share that handle. This explicit identity replaces the proposed
global `WeakMap` registry and also works with frozen resources.

When an external model already disposes its own `LifecycleScope`, bind its
public value to that **same node** before adopting it. The binding is the
explicit replacement for the old registry entry:

```ts
import { registerLifecycle } from "@volynets/reflex-framework";

const modelHandle = registerLifecycle(model, modelScope);
parent.own(modelHandle);
```

`registerLifecycle` returns a binding; it does not store an association keyed
by `model`. Disposal runs the scope's cleanups, and the binding does not call
the model's disposer a second time. Pass the returned binding when transferring
ownership.

The `node` getter exposes the exact node for integration with an existing
component or renderer owner. Attaching a scope to that owner still leaves one
tree. Repeatedly creating an effect in an event callback creates repeated
effects even when each one is owned; a dynamic event effect should replace or
dispose its prior scope when only one active effect is intended.

Cleanup errors follow `disposeOwnershipNode`: they are logged, and remaining
cleanups continue in reverse registration order. `rollback(cause)` closes the
scope and rethrows the original construction cause. DEV builds report closed
scope use, foreign ownership, cycles, invalid disposal protocols, and
Promise-like cleanup results. Production retains structural guards against
cycles and foreign reparenting without descriptive exceptions.
