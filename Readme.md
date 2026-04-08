# Reflex

Reflex is a deterministic reactive runtime for building systems with explicit dataflow, scheduling, and ownership.

It is not a UI framework first. The runtime can power UI, simulation, orchestration, server workflows, and other reactive systems where control over execution matters.

## Packages

### `@reflex/core`

Low-level reactive primitives and graph/ownership mechanics.

- ownership model
- reactive graph operations
- scheduling-independent core logic

### `@reflex/runtime`

Runtime layer built on top of `@reflex/core`.

- connected runtime behavior
- reactive execution helpers
- scheduler-oriented runtime APIs

### `@volynets/reflex`

Public application-facing facade.

- `signal`
- `computed`
- `memo`
- `effect`
- `createRuntime`
- `map` / `filter` / `merge`
- `scan` / `hold` / `subscribeOnce`

## Recommended Entry Point

For application code, start with `@volynets/reflex`.

```ts
import { signal, computed, effect, createRuntime } from "@volynets/reflex";

const rt = createRuntime();

const [count, setCount] = signal(0);
const double = computed(() => count() * 2);

effect(() => {
  console.log(count(), double());
});

setCount(5);
rt.flush();
```

## Architecture

The repository is currently organized around three active layers:

1. `@reflex/core`
2. `@reflex/runtime`
3. `@volynets/reflex`

There is also a DOM adapter in the repository as `reflex-dom`.

### `reflex-dom`

`reflex-dom` is the deterministic DOM renderer built on top of the Reflex
runtime. Its architecture, render pipeline, ownership model, and lifecycle are
documented here:

- `packages/reflex-dom/README.md`
- `packages/reflex-dom/docs/ONBOARDING.ru.md`

## Philosophy

- explicit runtime behavior over hidden scheduling
- deterministic execution over convenience magic
- clear layering between core logic and application-facing API

## License

MIT
