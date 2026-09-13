# Reflex

[![npm](https://img.shields.io/npm/v/%40volynets%2Freflex?logo=npm)](https://www.npmjs.com/package/@volynets/reflex)
[![CI](https://img.shields.io/github/actions/workflow/status/volynetstyle/Reflex/ci.yml?branch=main&label=CI&logo=githubactions)](https://github.com/volynetstyle/Reflex/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-green.svg)](https://github.com/volynetstyle/Reflex/blob/main/LICENSE)

Fine-grained reactivity for TypeScript with explicit effect scheduling.

`@volynets/reflex` is the application-facing Reflex package: signals, lazy
derived state, effects, events, and disposable models in a small,
framework-independent API.

State writes are synchronous. Computed values update lazily on read. You choose
when invalidated effects run: explicitly with `flush()`, after a batch, or
immediately.

## Install

```bash
npm install @volynets/reflex
```

## Quick start

```ts
import { computed, createRuntime, effect, signal } from "@volynets/reflex";

const runtime = createRuntime();
const count = signal(0);
const doubled = computed(() => count() * 2);

const stop = effect(() => {
  console.log(doubled());
});

count.set(1);
runtime.flush(); // logs 2

stop();
```

`effect()` runs once when created. With the default `"flush"` strategy, later
runs wait for `runtime.flush()`. Signals and computed values always return their
latest value without flushing.

## Scheduling

```ts
const runtime = createRuntime({ effectStrategy: "flush" });
```

| Strategy  | Invalidated effects run                            |
| --------- | -------------------------------------------------- |
| `"flush"` | when `runtime.flush()` is called                   |
| `"sab"`   | after the outermost batch settles                  |
| `"eager"` | synchronously at the next runtime-settled boundary |

Use `runtime.batch(fn)` or the exported `batch(fn)` to group related writes.
Writes and invalidations remain synchronous, and reads inside the batch observe
the latest values. A reactive batch only coalesces host-visible `settled`
notifications. Effect timing remains a scheduler policy selected by
`effectStrategy`.

The eager strategy does not run an effect from the invalidation callback itself.
It queues the effect during propagation and drains that queue once the runtime is
settled; an effect that writes state produces another settled checkpoint.

## API

- State: `signal`, `computed`, `memo`, `effect`, `reaction`, `watch`
- Control: `createRuntime`, `batch`, `flush`, `untracked`
- Events: `event`, `map`, `filter`, `merge`, `switchMap`, `flatten`, `scan`, `hold`
- Models: `createModel`, `own`, `isModel`

Most application code should depend on `@volynets/reflex`. The lower-level
`@volynets/reflex-runtime` package is intended for renderer, scheduler, and
tooling integrations.

The shared implementation guide, topology taxonomy, counters, and benchmark
results for conditional computations live in the
[dynamic dependencies guide](../../docs/dynamic-dependencies/README.md).

## License

[MIT](https://github.com/volynetstyle/Reflex/blob/main/LICENSE)
