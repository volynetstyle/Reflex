# Reflex Store

Structured state, derived views and keyed collections with a compiler for static
store shapes. The published package is self-contained: it has no dependencies,
peer dependencies or optional dependencies. Its distribution includes the Reflex
host, scheduler, one shared reactive kernel, SWC WebAssembly and the Vite plugin.
Development dependencies are used to build and test the package.

## Application API

Start with `createStore`, `derive`, `selector`, `reactiveMap`, `action` and
`snapshot`. Use `leaf`/`opaque` for reference boundaries and `hydrate` for
restoring compiled data.

```ts
import { createRuntime, effect } from "@volynets/reflex-store/runtime";
import {
  createStore,
  leaf,
  derive,
  selector,
  reactiveMap,
  action,
  snapshot,
  hydrate,
} from "@volynets/reflex-store";

createRuntime({ effectStrategy: "flush" });

export function createBoard() {
  const board = createStore(
    {
      filter: { status: "all", query: "" },
      selection: { taskId: "T-101" },
      pinned: leaf<readonly string[]>([]),

      get filterLabel() {
        const query = this.filter.query.trim().toLowerCase();
        return query ? this.filter.status + ":" + query : this.filter.status;
      },

      setFilter(status: string, query = "") {
        this.filter.status = status;
        this.filter.query = query;
      },
    },
    { name: "Board" },
  );

  return board;
}

const board = createBoard();
const tasks = reactiveMap<string, { title: string; done: boolean }>();
const isSelected = selector(() => board.selection.taskId);
const summary = derive(
  () => ({
    total: tasks.size,
    completed: [...tasks.values()].filter((task) => task.done).length,
  }),
  { name: "Summary" },
);

const addTasks = action(() => {
  tasks.set("T-101", { title: "Design checkout", done: false });
  tasks.set("T-102", { title: "Add audit log", done: true });
});

addTasks();
console.log(summary.completed); // 1; pulls current data immediately
const saved = snapshot(board); // frozen data; excludes methods and getters
hydrate(board, saved); // validates the entire shape, then writes in one action
```

Every factory call creates independent state. Root methods become bound,
synchronous actions; getters become owned lazy computeds. Static data reads and
writes lower to direct cell calls. Getters must be pure and synchronous.

`derive` accepts a pure callback returning a plain object. Its property views
are read-only. Dynamic entity IDs belong in `reactiveMap`; map values are
reference boundaries, so replace an entry to publish an entity change.

`action` preserves callback parameters, return value and receiver. Related
writes run untracked inside one scheduler/runtime batch. Direct reads see writes
so far. Exceptions keep completed writes and close the batch; there is no rollback.

## Compiler and Vite

`createStore` requires the transform. The runtime stub throws if it executes.

```ts
import { defineConfig } from "vite";
import reflexStore from "@volynets/reflex-store/vite";

export default defineConfig({
  plugins: [reflexStore({ eraseFacade: true })],
});
```

The plugin routes `@volynets/reflex` and low-level runtime imports to the package's
embedded host/kernel. This keeps existing Reflex imports on the same graph.
Node applications can import their host APIs directly from
`@volynets/reflex-store/runtime`.

The standalone compiler is exported from `@volynets/reflex-store/store`.
It includes its portable WASM asset; installing a platform-specific native SWC
package is unnecessary. `eraseFacade` removes the object only when every use
lowers to data cells. Factories, methods, getters, disposal and data extraction
retain the required facade.

See [compiler rules](./src/store/TRANSFORM_SPEC.md).

## Ownership

Use the embedded host's model ownership to dispose resources together:

```ts
import { createModel, own, signal } from "@volynets/reflex-store/runtime";
import { derive, reactiveMap, selector } from "@volynets/reflex-store";

const createPanel = createModel((ctx) => {
  const tasks = own(ctx, reactiveMap<string, { done: boolean }>());
  const selectedId = signal("");
  return {
    tasks,
    selected: own(ctx, selector(selectedId)),
    summary: own(
      ctx,
      derive(() => ({ total: tasks.size })),
    ),
  };
});
```

Maps, sets, selectors, keyed projections, structured views and compiled stores
implement `Symbol.dispose`. They also support explicit terminal disposal. Compiled reads, methods, writes and
restoration reject use after disposal.
`collect` is available in the advanced API for long-lived structures with many
previously observed keys.

## Reference and data boundaries

An object literal is a structural branch. `leaf(value)` is one replaceable
location. `opaque(resource)` retains an external reference.

```ts
const state = createStore({
  items: leaf<readonly Task[]>([]),
  engine: opaque(new Engine()),
});
state.items = [...state.items, task];
```

Compiled arrays use replacement semantics. Array mutation does not publish
fine-grained changes.

Snapshots copy and freeze plain structural data, preserving cycles and shared
references. Map/Set keys preserve identity. Opaque and foreign objects remain
external references. Applications define encoding/exclusion for JSON, SSR
persistence and external resources.

Compiled hydration requires the full exact data shape, including empty branches.
It rejects missing/extra fields and accessor properties before the first write,
clones structural leaf data, and restores all fields in one action. Schema
validation is structural; validate untrusted input value types in the application.

## Advanced API

`@volynets/reflex-store/advanced` preserves projection controls, depth markers,
`raw`, `transaction`, lifecycle helpers and `createStoreCell`. It also exports:

```ts
import { reactiveSet, getStoreName } from "@volynets/reflex-store/advanced";

const selectedIds = reactiveSet<string>([], { name: "Selected IDs" });
selectedIds.add("T-101");
console.log(getStoreName(selectedIds));
```

`ReactiveSet` follows native Set membership and iteration semantics.
Resource names are optional store metadata and do not add runtime kernel hooks.
The existing draft and keyed projection APIs remain available here.

The [task board](./examples/task-board/README.md) demonstrates the basic API.
The normative contract is in [SPECIFICATION.md](./SPECIFICATION.md).

## Checks

```sh
pnpm --filter @volynets/reflex-store test
pnpm --filter @volynets/reflex-store test:dev
pnpm --filter @volynets/reflex-store typecheck
pnpm --filter @volynets/reflex-store lint
pnpm --filter @volynets/reflex-store test:packed-runtime
```

The packed test installs only this tarball in an empty offline project. It
checks all published imports, WASM loading, one shared graph across entrypoints,
the Vite plugin, factory isolation, batching, snapshots/hydration and consumer
declarations with `skipLibCheck=false`.
