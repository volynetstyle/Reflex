# Rigidify

**Rigidify** is a high-performance, immutable state management library for JavaScript and TypeScript.  
It provides a simple, predictable API for working with nested state trees, inspired by persistent data structures and V8-friendly optimizations.  

Think of it as *path-copy immutable state* without proxies, designed for both UI and larger data structures.

---

## Features

- Immutable state updates with **minimal copies**: only the path to the modified node is copied.
- **V8-optimized**: predictable object shapes, inline caching friendly, avoids `structuredClone`.
- **Batch updates**: mutate multiple paths in one operation efficiently.
- **Draft-like mutation API**: mutate nested paths naturally with callback syntax.
- **High-level API** that can easily swap the backend to a more advanced structure like **MSPG (Matrix-Sharded Persistent Grid)**.
- Fully TypeScript-typed for developer ergonomics.

---

## Installation

```bash
npm install rigidify
# or
yarn add rigidify
```

---

## Usage

### Basic `set` / `get`

```ts
import { create, get, set } from 'rigidify';

let state = create({ user: { profile: { name: 'Alice' } } });

console.log(get(state, ['user', 'profile', 'name'])); // Alice

state = set(state, ['user', 'profile', 'name'], 'Bob');

console.log(get(state, ['user', 'profile', 'name'])); // Bob
```

### Batch updates

```ts
import { batch } from 'rigidify';

state = batch(state, [
  { path: ['user', 'profile', 'age'], value: 30 },
  { path: ['settings', 'theme'], value: 'dark' },
]);
```

### Draft-like mutation

```ts
import { mutate } from 'rigidify';

state = mutate(state, ['user', 'profile'], draft => {
  draft.active = true;
  draft.name = 'Charlie';
});
```

---

## API

* `create(initialState)` — initialize a snapshot
* `get(state, path)` — retrieve a value at a nested path
* `set(state, path, value)` — immutable update at a single path
* `batch(state, updates)` — immutable updates at multiple paths
* `mutate(state, path, callback)` — draft-like mutation for easier updates
* `toPlainObject(state)` — get a plain JS object copy for debugging

---

## Why Rigidify?

Rigidify is designed for:

* Large, deeply nested state trees
* Predictable performance on V8 engines
* Codebases where immutability is required but Proxy-based solutions (like Immer) are too much
* Projects that may later adopt low-level memory-efficient backends (MSPG)

---

## Contributing

Contributions are welcome! Please open issues or pull requests on GitHub.

---

## License

MIT

