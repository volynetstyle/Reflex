# Reflex Store

Framework-independent structured state over the Reflex runtime. The normative
contract and implementation/future split are in [SPECIFICATION.md](./SPECIFICATION.md).

## Runtime collections

Dynamic keys use a separate collection API. Map values are reference boundaries;
replace an entry to publish a change to the entity.

```ts
import {
  createReactiveMap,
  createStoreProjection,
  transaction,
  snapshot,
  collectStore,
  disposeStore,
} from "@volynets/reflex-store";

const tasks = createReactiveMap<string, { title: string; done: boolean }>();
const summary = createStoreProjection(
  () => ({
    total: tasks.size,
    completed: [...tasks.values()].filter((task) => task.done).length,
  }),
  { total: 0, completed: 0 },
);

transaction(() => {
  tasks.set("T-101", { title: "Design checkout", done: false });
  tasks.set("T-102", { title: "Add audit log", done: true });
});

console.log(summary.completed); // 1; pulls fresh data without an effect flush
const saved = snapshot(summary); // untracked, frozen point-in-time plain data

// After stopping the panel's effects:
collectStore(summary);
tasks.collect();

// At terminal owner/model teardown:
disposeStore(summary);
tasks.dispose();
```

get, has, keys, values/entries and size observe distinct semantic locations.
Untracked lookups do not create key nodes. An optional initializer function delays
Map data construction until first use. Values default to Object.is; Map keys use
native SameValueZero.

## Projections and selectors

```ts
import {
  createSelector,
  createKeyedProjection,
  createProjection,
} from "@volynets/reflex-store";

const isSelected = createSelector(selectedId);
const activeTitle = createKeyedProjection(
  selectedTask,
  (task) => task.id,
  (task) => task.title,
);
```

A keyed projection represents the source's active key. It is not an arbitrary
entity lookup; use ReactiveMap for that. Key/value equality can be configured
separately.

Structured and keyed projections initialize lazily, memoize clean reads and
recompute on pull. Equal projected results cut off downstream user computation.
Structured projections provide read-only path views, including arrays, existence
and own-key observations. Source replacement can invalidate path validators
without rerunning unchanged leaf consumers.

createSelector uses one observed router to preserve old/new-key invalidation
locality. Both keyed APIs expose collect() and dispose().

Projection values support deep, shallow, ref and opaque markers. Only compatible
plain data is traversed by default. Date, typed arrays and class instances remain
references. raw() is an untracked backing view, not a supported mutation path.
snapshot() copies structural data but does not promise arbitrary JSON
serialization of external resources, cycles, BigInt or Map keys.

## Lifecycle and scheduling

There are no store hooks or extra checks in runtime hot paths. Owners explicitly
stop consumers and collect unused observations. Collect derived layers from
downstream to upstream; use disposal at terminal model teardown. A still-linked
computed counts as a live consumer.

Use the existing headless createModel / ctx.action / ctx.onDispose API from
@volynets/reflex to own these resources. Moving the richer defineModel API out
of reflex-dom remains separate future work.

transaction is synchronous batching, with no rollback. Direct reads inside an
action see writes so far; configured effect delivery happens after the outer
boundary or a later flush. An exception closes the batch and keeps completed
writes. Lazy projections no longer return stale values pending flush.

## Compiled static stores

```ts
import { createStore } from "@volynets/reflex-store";

const state = createStore({
  user: { name: "Ada" },
  count: 0,
});

state.count++;
```

This API requires the compiler/Vite plugin. Direct static paths lower to leaf
accessors and actions, without Proxy lookup. The default createStoreCell target
allocates a producer only on a tracked read, and its lifetime belongs to the
compiled model. Static shape, binding identity and supported syntax are checked.

```ts
import { defineConfig } from "vite";
import reflexStore from "@volynets/reflex-store/vite";

export default defineConfig({ plugins: [reflexStore()] });
```

See [compiler rules](./src/store/TRANSFORM_SPEC.md) and the
[task-board example](./examples/task-board/README.md).

## Verification and benchmarks

```sh
pnpm --filter @volynets/reflex-store test
pnpm --filter @volynets/reflex-store test:dev
pnpm --filter @volynets/reflex-store test:integration
pnpm --filter @volynets/reflex-store test:differential
pnpm --filter @volynets/reflex-store bench:metrics
pnpm --filter @volynets/reflex-store typecheck
pnpm --filter @volynets/reflex-store lint
pnpm --filter @volynets/reflex-store build
```

Differential suites compare native Map, from-scratch projections and ordinary
JavaScript against store behavior using fixed fast-check seeds. Integration
tests exercise real schedulers, headless model disposal and Vite SSR.

pnpm bench runs the semantic workload matrix; pnpm bench:full expands fields,
fan-out, equivalence probability, downstream work and key locality.
Metrics distinguish invalidation/validation from user execution. Lazy equality
can schedule more validation than an eager equality watcher while avoiding
downstream execution; it is not a claim of zero graph work. Allocation/GC timing
belongs in a separate Node --expose-gc run.
