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
