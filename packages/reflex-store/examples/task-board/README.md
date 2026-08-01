# Task board example

This example models a small task board and demonstrates the intended split:

- immutable domain collections live in regular Reflex signals;
- hot UI state lives in a compiled store;
- `createSelector` provides row-level selection invalidation;
- keyed `createProjection` exposes the selected entity;
- store `createProjection` builds a stable, property-granular dashboard model;
- application actions own all mutations and scheduling.

The main implementation is [`src/task-board.ts`](./src/task-board.ts). The
included Vite config enables the required compile-time store transform.

From the repository root, run its integration test with:

```sh
pnpm --filter @volynets/reflex-store test
```

`runTaskBoardScenario()` is exported as a compact executable scenario for SSR,
tests, or a UI entry point.

## Verified contracts

The test suite treats correctness, invalidation precision, and execution cost as
separate concerns. It fixes these observable contracts:

- effects run immediately once, while later writes wait for `flush()`;
- multiple filter writes produce one render;
- identical select/filter/move actions are allocation and notification no-ops;
- selector transitions notify only the previous and next keys;
- keyed projection represents the currently materialized source key, not an
  arbitrary collection lookup;
- summary subscribers run only for properties whose values changed;
- projection reads remain scheduler-driven and are stale until `flush()`;
- disposal is idempotent and prevents subsequent effect work;
- real task moves preserve references for unaffected tasks.

Operation-specific benchmarks live in
[`../../bench/task-board.bench.ts`](../../bench/task-board.bench.ts). Run them
separately from correctness tests:

```sh
pnpm --filter @volynets/reflex-store exec vitest bench bench/task-board.bench.ts
```
