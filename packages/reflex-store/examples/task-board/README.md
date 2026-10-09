# Task board example

The example uses reactiveMap for dynamic task IDs, createStore for closed UI
state, selector for selection observations, derive for summary fields and action
for coherent mutations. The Vite plugin enables compilation.

The implementation is [src/task-board.ts](./src/task-board.ts). Run its contracts:

```sh
pnpm --filter @volynets/reflex-store test:integration
```

The tests cover summary-field precision, keyed map reads, selection locality,
batching, pull freshness, ownership and no-op moves. The package also includes
production contracts for compiled methods/getters and snapshot/hydration.
