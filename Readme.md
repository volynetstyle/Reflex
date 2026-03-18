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

### `@reflex/reactive`

Public application-facing facade.

- `signal`
- `computed`
- `memo`
- `effect`
- `flush`
- `batchWrite`
- `createRuntime`

## Recommended Entry Point

For application code, start with `@reflex/reactive`.

```ts
import { signal, computed, effect, flush } from "@reflex/reactive";

const count = signal(0);
const double = computed(() => count.read() * 2);

effect(() => {
  console.log(count.read(), double());
});

count.write(5);
flush();
```

## Architecture

The repository is currently organized around three active layers:

1. `@reflex/core`
2. `@reflex/runtime`
3. `@reflex/reactive`

There is also a DOM adapter in the repository as `reflex-dom`.

## Philosophy

- explicit runtime behavior over hidden scheduling
- deterministic execution over convenience magic
- clear layering between core logic and application-facing API

## License

MIT
