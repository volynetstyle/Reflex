# `@volynets/reflex`

[![npm version](https://img.shields.io/npm/v/%40volynets%2Freflex?logo=npm)](https://www.npmjs.com/package/@volynets/reflex)
[![npm downloads](https://img.shields.io/npm/dm/%40volynets%2Freflex?logo=npm)](https://www.npmjs.com/package/@volynets/reflex)
[![license: MIT](https://img.shields.io/badge/license-MIT-green.svg)](https://github.com/volynetstyle/Reflex/blob/main/packages/reflex/LICENSE)
[![typed with TypeScript](https://img.shields.io/badge/typed-TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![runtime: Reflex](https://img.shields.io/badge/runtime-Reflex-111827)](https://github.com/volynetstyle/Reflex)
[![CI](https://img.shields.io/github/actions/workflow/status/volynetstyle/Reflex/ci.yml?branch=main&label=CI&logo=githubactions)](https://github.com/volynetstyle/Reflex/actions/workflows/ci.yml)
[![tested with Vitest](https://img.shields.io/badge/tested%20with-Vitest-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev/)
[![module formats: ESM+CJS](https://img.shields.io/badge/modules-ESM%20%2B%20CJS-0f172a)](https://github.com/volynetstyle/Reflex/blob/main/packages/reflex/package.json)
[![scheduler: explicit](https://img.shields.io/badge/scheduler-explicit-7c3aed)](https://github.com/volynetstyle/Reflex/tree/main/packages/reflex)

Small signal-style reactivity on top of the Reflex runtime.

`@volynets/reflex` is the product-facing API for building reactive state, derived values, effects, and event-driven state without dropping down to the lower-level runtime primitives.

It gives you:

- a compact signal-style API
- runtime-backed execution with explicit effect flushing
- event sources plus composition helpers like `map()`, `filter()`, `merge()`, `scan()`, and `hold()`
- predictable semantics for lazy derived values and scheduled effects

Under the hood it is built on:

- [`@reflex/runtime`](https://github.com/volynetstyle/Reflex/tree/main/packages/%40reflex/runtime) for reactive execution

## Install

```bash
npm install @volynets/reflex
```

## Quick Start

```ts
import { computed, createRuntime, effect, signal } from "@volynets/reflex";

const rt = createRuntime();

const [count, setCount] = signal(1);
const doubled = computed(() => count() * 2);

effect(() => {
  console.log("doubled =", doubled());
});

setCount(2);
rt.flush();
```

What is happening here:

- `createRuntime()` configures the active Reflex runtime and returns runtime controls
- `signal()`, `computed()`, and `effect()` use that active runtime
- `effect()` runs once immediately when created
- later effect re-runs are scheduled, so with the default runtime you call `rt.flush()` to run them
- `computed()` stays lazy and does not need `flush()` just to produce the latest value on read

## Mental Model

Think of the package as one connected model:

1. Call `createRuntime()` once during setup.
2. Build state with `signal()`, `computed()`, `memo()`, and `effect()`.
3. Create event sources with `rt.event()`.
4. Compose event sources with `map()`, `filter()`, `merge()`, and use `scan()` / `hold()` to turn events into readable state.
5. Call `rt.flush()` when you want scheduled effects to run in the default `"flush"` mode.

The top-level primitives are not methods on `rt`, but they are still runtime-backed. `createRuntime()` is not only for `event()` and `flush()`: it configures the runtime that the public primitives run against.

## Design Goals

- Keep the public API small and easy to teach.
- Preserve explicit runtime control instead of hiding scheduling.
- Make derived state cheap to read through lazy cached computeds.
- Support both state-style and event-style reactive flows.
- Expose low-level escape hatches only when needed, without forcing them into normal usage.

## Core Primitives

### Signals and derived values

```ts
import { computed, createRuntime, memo, signal } from "@volynets/reflex";

createRuntime();

const [price, setPrice] = signal(100);
const [tax, setTax] = signal(20);

const total = computed(() => price() + tax());
const warmed = memo(() => total() * 2);

console.log(total());  // 120
console.log(warmed()); // 240

setPrice(120);
setTax(25);

console.log(total());  // 145
console.log(warmed()); // 290
```

### Events and accumulated state

```ts
import { computed, createRuntime, effect, hold, scan } from "@volynets/reflex";

const rt = createRuntime();
const updates = rt.event<number>();

const [total, disposeTotal] = scan(updates, 0, (acc, value) => acc + value);
const [latest, disposeLatest] = hold(updates, 0);
const summary = computed(() => `${latest()} / ${total()}`);

effect(() => {
  console.log(summary());
});

updates.emit(1);
updates.emit(2);
rt.flush();

disposeTotal();
disposeLatest();
```

`scan()` and `hold()` return tuples on purpose:

- the first item is the accessor you read from
- the second item is a disposer that unsubscribes from the event source and releases the internal node

### Event composition

```ts
import {
  createRuntime,
  filter,
  map,
  merge,
  subscribeOnce,
} from "@volynets/reflex";

const rt = createRuntime();
const clicks = rt.event<number>();
const submits = rt.event<string>();

const importantClicks = filter(clicks, (value) => value > 0);
const labels = merge(
  map(importantClicks, (value) => `click:${value}`),
  map(submits, (value) => `submit:${value}`),
);

subscribeOnce(labels, (value) => {
  console.log("first label =", value);
});
```

## Guarantees

- `computed(fn)` is lazy. It does not run until the first read.
- `computed(fn)` is cached. Repeated clean reads reuse the last value.
- `memo(fn)` is `computed(fn)` plus one eager warm-up read.
- `effect(fn)` runs once immediately on creation.
- If an effect returns cleanup, that cleanup runs before the next effect run and on dispose.
- With the default runtime, invalidated effects run on `rt.flush()`.
- With `createRuntime({ effectStrategy: "sab" })`, invalidated effects stay lazy during a batch and auto-deliver when the outermost batch exits.
- With `createRuntime({ effectStrategy: "eager" })`, invalidated effects flush automatically.
- Pure signal and computed reads do not require `flush()`.
- Same-value signal writes do not force recomputation.
- Derived events created with `map()`, `filter()`, and `merge()` are lazy and subscribe upstream only while observed.
- `scan()` and `hold()` update only from event deliveries.
- Nested event emits are delivered after the current delivery finishes, preserving order.

## Runtime

`createRuntime()` returns an object with the runtime-facing pieces of the model:

```ts
const rt = createRuntime({
  effectStrategy: "flush", // or "sab" / "eager"
  hooks: {
    onEffectInvalidated(node) {
      // low-level integration hook
    },
  },
});
```

Options:

- `effectStrategy: "flush" | "sab" | "eager"` controls whether invalidated effects wait for `rt.flush()`, stabilize after `batch()`, or run automatically
- `hooks.onEffectInvalidated(node)` is a low-level hook for integrations that want to observe effect invalidation

Returned API:

- `rt.event<T>()` creates an event source with `emit(value)` and `subscribe(fn)`
- `rt.flush()` runs queued effects
- `rt.ctx` exposes the underlying runtime context for low-level integration, debugging, or tests

Important notes:

- For normal app code, create one runtime near startup and keep using the top-level primitives.
- `ctx` is low-level. Most users should not need it.
- Creating a new runtime resets the shared runtime state. It is best treated as app setup or test isolation, not as something you create repeatedly inside feature code.

## API Reference

### `signal(initialValue)`

Creates writable reactive state.

```ts
const [value, setValue] = signal(0);
```

- `value()` reads the current value
- `setValue(next)` writes a new value
- `setValue((prev) => next)` supports updater functions

### `computed(fn)`

Creates a lazy derived accessor.

```ts
const doubled = computed(() => count() * 2);
```

- tracks dependencies dynamically while `fn` runs
- caches the last computed value
- recomputes on demand when dirty and read again

### `memo(fn)`

Creates a computed accessor and warms it once immediately.

```ts
const total = memo(() => price() + tax());
```

Use it when you want computed semantics with an eager first read.

### `effect(fn)`

Creates a reactive effect.

```ts
const stop = effect(() => {
  console.log(count());
});
```

- runs immediately once
- tracks reactive reads
- may return a cleanup function
- cleanup runs before the next execution and on dispose
- returns a callable disposer with `.dispose()`

### `rt.event<T>()`

Creates an event source.

```ts
const clicks = rt.event<number>();
```

- `clicks.emit(value)` delivers an event
- `clicks.subscribe(fn)` subscribes to events

### `subscribeOnce(source, fn)`

Subscribes to the next value from `source`, then unsubscribes automatically.

```ts
subscribeOnce(clicks, (value) => {
  console.log("first click =", value);
});
```

### `map(source, project)`

Projects each event value into a new event stream.

```ts
const labels = map(clicks, (value) => `click:${value}`);
```

### `filter(source, predicate)`

Forwards only the values that satisfy `predicate`.

```ts
const positive = filter(clicks, (value) => value > 0);
```

### `merge(...sources)`

Combines multiple event sources into one event stream.

```ts
const all = merge(clicks, submits);
```

### `scan(source, seed, reducer)`

Accumulates event values over time and returns `[read, dispose]`.

```ts
const [total, dispose] = scan(clicks, 0, (acc, value) => acc + value);
```

`reducer` should be a pure event reducer. If you want to combine the accumulated value with reactive state, do that outside the reducer via `computed()`.

### `hold(source, initial)`

Stores the latest event payload and returns `[read, dispose]`.

```ts
const [latest, dispose] = hold(updates, "idle");
```

Equivalent in behavior to:

```ts
scan(updates, "idle", (_, value) => value);
```

## FAQ

### Are `signal()`, `computed()`, and `effect()` global, or tied to `rt`?

They are exported as top-level functions, but they run against the currently configured Reflex runtime. `createRuntime()` sets up that runtime and gives you the runtime controls such as `event()`, `flush()`, and `ctx`.

### Do I always need to call `flush()`?

No. You need `flush()` for scheduled effects when using the default `effectStrategy: "flush"`. In `effectStrategy: "sab"`, effects auto-deliver after the outermost `batch()`. You do not need `flush()` just to read up-to-date `signal()` or `computed()` values.

### Is `computed()` lazy or eager?

Lazy. It does not run until the first read. After that it behaves like a cached derived value that recomputes only when dirty and read again.

### What is the difference between `computed()` and `memo()`?

`memo()` is a warmed `computed()`. It performs one eager read immediately after creation, then keeps the same accessor semantics.

### Does `effect()` run immediately?

Yes. It runs once on creation. Future re-runs happen after invalidation, either on `rt.flush()`, at the end of an outermost batch in `sab`, or automatically when using the eager effect strategy.

### Why do `scan()` and `hold()` return tuples instead of only an accessor?

Because they own an event subscription. The accessor lets you read the current accumulated state, and the disposer lets you unsubscribe and clean up explicitly.

### Should I use `rt.ctx`?

Usually no. `ctx` is a low-level escape hatch for integration code, tests, and runtime debugging.

### Can I create multiple runtimes?

Treat `createRuntime()` as creating the active runtime for an app instance or test. Creating a new runtime resets shared runtime state, so this is not intended as a pool of concurrently active runtimes inside one reactive graph.

## License

[MIT](https://github.com/volynetstyle/Reflex/blob/main/packages/reflex/LICENSE)
