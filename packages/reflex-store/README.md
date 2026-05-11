# @reflex/store

State management primitives for Reflex.

## Runtime selectors

```ts
import { createSelector, createProjection } from "@reflex/store";

const isSelected = createSelector(selectedId);
const labels = createProjection(
  activeEntity,
  (entity) => entity.id,
  (entity) => entity.label,
);
```

## Store projections

```ts
import { createStoreProjection } from "@reflex/store";

const user = createStoreProjection(
  (draft) => {
    draft.fullName = `${first()} ${last()}`;
  },
  { fullName: "" },
);
```

## Compiled stores

```ts
import { createStore } from "@reflex/store";
import { compileStore, transformCompiledStore } from "@reflex/store/store";
```

## Vite

```ts
import { defineConfig } from "vite";
import reflexStore from "@reflex/store/vite";

export default defineConfig({
  plugins: [reflexStore()],
});
```
