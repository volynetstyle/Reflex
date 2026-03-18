# `@volynetstyle/reflex`

Public reactive facade for Reflex.

This package gives you a small, ready-to-use API on top of:

- `@reflex/runtime` for runtime behavior
- `@reflex/core` for low-level primitives

## Install

```bash
npm install @volynetstyle/reflex
```

## Usage

```ts
import { signal, computed, effect, flush } from "@volynetstyle/reflex";

const count = signal(1);
const doubled = computed(() => count.read() * 2);

effect(() => {
  console.log(doubled());
});

count.write(2);
flush();
```

## Exports

- `signal`
- `computed`
- `memo`
- `effect`
- `flush`
- `batchWrite`
- `createRuntime`
- `runtime`

## License

MIT
