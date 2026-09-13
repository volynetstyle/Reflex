# @volynets/reflex-store

State management primitives for Reflex.

## Runtime selectors

```ts
import { createSelector, createProjection } from "@volynets/reflex-store";

const isSelected = createSelector(selectedId);
const labels = createProjection(
  activeEntity,
  (entity) => entity.id,
  (entity) => entity.label,
);
```

Signals keep the runtime's `Object.is` change detection. A projection can opt
into domain-specific equality at its semantic boundary:

```ts
const permissions = createProjection(
  activeUser,
  (user) => user.id,
  (user) => user.permissions,
  { equals: shallowEqual },
);
```

Use `keyEquals` only when projection keys themselves have domain-specific
identity. `createSelector` continues to call its key comparator `equals`.

## Store projections

```ts
import { createStoreProjection } from "@volynets/reflex-store";

const user = createStoreProjection(
  (draft) => {
    draft.fullName = `${first()} ${last()}`;
  },
  { fullName: "" },
);
```

## Semantic workload benchmarks

`pnpm bench` runs the small wall-time matrix. `pnpm bench:full` expands object
size, fan-out, equivalence probability, downstream work, keyed locality, and
dependency churn. `pnpm bench:metrics` runs the same graph scenarios with
runtime profiling enabled and checks graph work independently of ops/sec.

The harness reports source writes, producer and consumer executions, equality
calls and fields visited, equivalent outputs, semantically affected nodes, and
execution amplification. Runtime profiling additionally observes push/pull
edges, dirty/scheduled nodes, watcher executions, and maximum propagation
depth. Allocation and GC measurements remain a separate Node `--expose-gc`
suite so instrumentation does not contaminate wall-time cases.

## Compiled stores

```ts
import { createStore } from "@volynets/reflex-store";
import { compileStore, transformCompiledStore } from "@volynets/reflex-store/store";
```

## Vite

```ts
import { defineConfig } from "vite";
import reflexStore from "@volynets/reflex-store/vite";

export default defineConfig({
  plugins: [reflexStore()],
});
```

## Example

See the runnable [task-board example](./examples/task-board/README.md) for an
application-oriented implementation combining a compiled UI store, immutable
domain state, keyed selectors, entity projections, derived store projections,
and explicit application actions.
