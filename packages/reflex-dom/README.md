# @volynets/reflex-dom

Standalone DOM renderer for Reflex.

The published package contains the reactive runtime, framework ownership model,
JSX runtime, DOM renderer, hydration, and host scheduler in one tree-shakeable
ES module. Consumers do not need to install compatible versions of
`@volynets/reflex-runtime` or `@volynets/reflex-framework`.

## Setup

Configure TypeScript to use the package JSX runtime:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@volynets/reflex-dom"
  }
}
```

Create an application and render a component:

```tsx
import { createApp, useSignal } from "@volynets/reflex-dom";

function Counter() {
  const count = useSignal(0);

  return (
    <button onClick={() => count((value) => value + 1)}>
      count: {count}
    </button>
  );
}

const app = createApp();
app.render(<Counter />, document.getElementById("app")!);
```

For the singleton-style API:

```tsx
import { render, setupDOM } from "@volynets/reflex-dom";

setupDOM();
render(<main>Hello</main>, document.getElementById("app")!);
```

Use `createApp()` when multiple isolated renderers may coexist. DOM event
handlers are restored into the runtime and ownership context of the renderer
that mounted them, so updates from separate applications do not share queues.

## Public entry points

Client rendering:

- `createApp()` and `setupDOM()`
- `createDOMRenderer()` and `createDOMRuntime()`
- `render()` / `mount()`
- `hydrate()` and `resume()`

Server rendering and structure:

- `renderToString()`
- `For`, `Show`, `Switch`, and `Portal`

Framework hooks:

- `useSignal`, `useComputed`, and `useMemo`
- `useEffect`, `useEffectOnce`, and `useEffectRender`
- `useMount`, `useUnmount`, `useOwned`, and `useRef`
- ownership context helpers

The `jsx-runtime` and `jsx-dev-runtime` package subpaths resolve to the same
standalone module.

## Architecture

The renderer builds two related trees:

1. The browser DOM tree.
2. An ownership tree that records components, effects, dynamic branches, event
   listeners, refs, and cleanups.

```text
JSX
  -> framework renderables and ownership scopes
  -> DOM mount dispatcher
  -> elements / components / dynamic slots / structural operators
  -> managed DOM ranges
```

Ownership is platform-agnostic and lives in `reflex-framework`. DOM mounting
selects the active owner and registers host resources against it. Disposing a
branch walks its ownership subtree inside-out, runs cleanups, and removes only
the DOM range owned by that branch.

Mounted roots are stored on their host container under a private symbol. This
allows one renderer to replace a root created by another renderer without a
renderer-local `WeakMap`, while preserving unrelated foreign DOM.

## Runtime and host boundary

`reflex-runtime` owns graph propagation and execution state. It does not own an
effect policy or an asynchronous scheduler.

When a source changes, runtime marks dependent watcher nodes dirty and calls
host hooks. `reflex-dom` is the host and owns:

- the watcher queue;
- effect deduplication;
- batching and flush policy;
- error isolation;
- coordination with DOM render effects.

The host scheduler is implemented in `src/runtime/scheduler/` and follows the
same scheduler model used by the `reflex` facade.

### Scheduler guarantees

- A power-of-two ring queue avoids repeated array shifting.
- Runtime's `Scheduled` state bit prevents duplicate queue entries.
- Scheduler phases are explicit: `Idle`, `Batching`, and `Flushing`.
- Nested batches flush only after the outer boundary closes.
- The scheduled bit is cleared before execution, allowing a watcher to enqueue
  itself during a run.
- Reentrant entries are drained in the same flush cycle.
- If a watcher throws, the remaining queue is still drained and the first error
  is rethrown afterward.
- Abort and reset paths clear scheduled bits from unexecuted nodes.

### Effect strategies

Configure scheduling through `createApp()` or `createDOMRenderer()`:

```tsx
const app = createApp({ effectStrategy: "eager" });
```

Available strategies:

| Strategy | Behaviour |
| --- | --- |
| `eager` | Flushes pending watchers when the host becomes inactive or the outer batch exits. |
| `sab` | Flushes at a settled outer batch boundary. |
| `flush` | Defers automatic delivery to a microtask and also supports explicit `runtime.flush()`. |

The default policy resolves to `eager`.

## Effect ordering

Reactive effects and DOM render effects use separate queues:

```text
source write
  -> runtime propagation
  -> host nodeInvalidated hook
  -> reactive watcher queue
  -> watcher execution and DOM mutations
  -> runtime settled notification
  -> DOM render-effect queue
```

`useEffect()` creates an ownership-bound watcher. Its previous cleanup runs
before a rerun and again when the owner is disposed.

`useEffectRender()` is scheduled separately and runs only after reactive DOM
work stabilizes. Render tasks are ordered by phase:

1. `BeforeRender`
2. `Render`
3. `AfterRender`

Tasks scheduled reentrantly for the active phase are drained without shifting
the underlying queue.

## Dynamic regions and disposal

Accessors and structural operators mount into managed ranges bounded by
anchors. Replacing a dynamic branch:

1. disposes its current ownership scope;
2. clears DOM between its anchors;
3. creates a fresh branch scope;
4. mounts the replacement into that scope.

This prevents effects belonging to removed `Show`, `Switch`, or `For` branches
from continuing to observe reactive sources.

## SSR and hydration

- `renderToString()` creates baseline HTML and dynamic slot markers.
- `hydrate()` adopts matching server DOM and falls back to remounting mismatches.
- `resume()` adopts existing DOM under renderer ownership without rebuilding it.
- `Portal` mounts into another target while cleanup remains owned by the source
  component tree.

All paths share the same ownership, managed-range, and scheduling model.

## Standalone build

From the repository root:

```powershell
pnpm --filter @volynets/reflex-dom build
```

The pipeline:

1. builds `reflex-runtime`;
2. builds `reflex-framework`;
3. emits DOM modules and declarations;
4. bundles runtime, framework, and DOM with Rollup;
5. minifies the production module with Terser;
6. bundles declarations and removes intermediate JavaScript files.

The published `dist` directory contains:

```text
dist/
  index.js
  index.d.ts
```

Neither file contains external `@volynets/*` imports.

## Development commands

```powershell
# Unit and integration tests
pnpm --filter @volynets/reflex-dom test

# Type checking
pnpm --filter @volynets/reflex-dom typecheck

# Standalone production build
pnpm --filter @volynets/reflex-dom build

# Real-browser DOM mutation benchmark
pnpm --filter @volynets/reflex-dom bench:mutations
```

The mutation benchmark runs in a local Chromium-based browser and writes
`bench/mutations.results.html`.

## Source map

| Area | Location |
| --- | --- |
| Runtime host and policies | `src/runtime/options.ts`, `src/runtime/policies.ts` |
| Reactive effect scheduler | `src/runtime/scheduler/` |
| DOM render-effect scheduler | `src/runtime/render-effect-scheduler.ts` |
| Runtime/DOM context bridge | `src/runtime/execution/` |
| Ownership and hooks | `packages/reflex-framework/src/ownership/`, `src/hooks/` |
| Mount dispatch | `src/mount/` |
| DOM writes and bindings | `src/host/`, `src/bindings/` |
| Dynamic ranges | `src/structure/` |
| Reconciliation | `src/reconcile/` |
| Hydration and SSR | `src/hydrate/`, `src/server/` |

Russian developer onboarding is available in `docs/ONBOARDING.ru.md`.
