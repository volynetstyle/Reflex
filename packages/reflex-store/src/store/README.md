# Compiled static stores

The root createStore API requires the compiler. Import the plugin from
@volynets/reflex-store/vite or use compileStore from /store.

```ts
import {
  createStore,
  leaf,
  opaque,
  snapshot,
  hydrate,
} from "@volynets/reflex-store";

export function createCounter() {
  const state = createStore(
    {
      count: 0,
      history: leaf<readonly number[]>([]),
      engine: opaque(new Engine()),
      get doubled() {
        return this.count * 2;
      },
      increment() {
        this.count++;
        this.history = [...this.history, this.count];
      },
    },
    { name: "Counter" },
  );
  return state;
}
```

Factories allocate independent cells, computed getters and action methods.
Static data accesses lower to direct cell calls. Root methods are bound actions;
getters are owned lazy computeds. Snapshot extraction excludes methods/getters.
Hydration validates the complete data schema before batched restoration.

The compiler accepts data properties with unique static keys. Literal objects
form branches; leaf/opaque imports (including aliases) define single replaceable
locations. Arrays use replacement semantics.

Unsupported syntax is diagnosed: spreads, shorthand, **proto**, reserved lifecycle
names, setter properties, nested methods/getters, async/generator methods, dynamic
paths, branch aliases, delete, optional chaining, structural replacement and
arbitrary root reflection. Getters must not write store state.

Use eraseFacade to remove objects proven unnecessary for direct data-cell uses.
Returned stores, computed getters, action methods and lifecycle/data boundaries
retain their facade.

The default lowering imports createStoreScope from /runtime and cells from
/runtime/internal. The scope uses the shared Framework LifecycleScope for resource
ownership and rollback, and adds the Store action boundary. It has no model
shape validation or capability brands. Custom scope/signal lowering remains
available for data-only stores through loweringTarget; the legacy model option
is a compatibility alias for curried factory targets.
See [TRANSFORM_SPEC.md](./TRANSFORM_SPEC.md).
