# `@volynetstyle/reflex`

Public reactive facade for Reflex.

This package provides a small API built on top of:

- `@reflex/runtime` for reactive execution
- `@reflex/core` for lower-level primitives

## Install

```bash
npm install @volynetstyle/reflex
```

## Usage

```ts
import { computed, createRuntime, effect, signal } from "@volynetstyle/reflex";

const rt = createRuntime();

const [count, setCount] = signal(1);
const doubled = computed(() => count() * 2);

effect(() => {
  console.log(doubled());
});

setCount(2);
rt.flush();
```

## Events

```ts
import { createRuntime, hold, scan } from "@volynetstyle/reflex";

const rt = createRuntime();
const updates = rt.event<number>();

const [total] = scan(updates, 0, (acc, value) => acc + value);
const [latest] = hold(updates, 0);

updates.emit(1);
updates.emit(2);

console.log(total()); // 3
console.log(latest()); // 2
```

## Exports

- `signal`
- `computed`
- `memo`
- `effect`
- `scan`
- `hold`
- `createRuntime`

## Runtime API

`createRuntime()` returns an object with:

- `event()`
- `flush()`
- `ctx`

## License

MIT
