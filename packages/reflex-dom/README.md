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
    <button onClick={() => count((value) => value + 1)}>count: {count}</button>
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

## Practical hook patterns

Reflex hooks sit at the intersection of two independent runtime structures:

```text
                         Reflex
                            |
             +--------------+--------------+
             |                             |
      Dependency graph                Ownership tree
             |                             |
     actual reactive reads            actual lifetime
             |                             |
      computed / effects       effects / resources / branches
             |                             |
             +--------------+--------------+
                            |
                    renderer / scheduler
```

The dependency graph determines _what depends on what_. The ownership tree
determines _what lives and dies with what_. Owning a reactive node does not make
the owner its subscriber, and reading a value does not by itself make the value
an owned resource. Most of the patterns below follow from keeping those two
relationships separate.

| Runtime primitive                                 | Practical consequence                                                                                     |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Dependencies recorded from reads during execution | Effects and computed values have branch-sensitive subscriptions.                                          |
| Stable signal accessor                            | Calling the accessor reads current state at invocation time instead of capturing a render-snapshot value. |
| Reactive nodes independent of components          | A derived value can update its consumers without rerunning the component that created it.                 |
| Hierarchical ownership                            | Effects, resources, and scopes can be created conditionally inside one run and destroyed as one subtree.  |
| Generic owned resources                           | A resource can have a lifetime without pretending to be a reactive effect.                                |
| One ownership tree shared with the renderer       | DOM ranges, branches, components, listeners, refs, effects, and resources have one disposal order.        |
| Separate render-effect scheduler                  | DOM-dependent work can run after fine-grained DOM updates have settled.                                   |

### Comparison with render-cycle hooks

The useful distinction is architectural, not that Reflex merely provides more
hook names:

| Pattern                                              | Reflex                                                                                                                                                                                  | Octane                                                                                                                                                                                                     | React                                                                                                                                                  |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Branch-sensitive effect dependencies                 | `useEffect(() => selected() && details())` subscribes to `details` only on runs that actually read it. The dependency set is an execution result.                                       | An omitted dependency array is inferred from lexical captures. In the pinned implementation, captured reactive values describe the component effect slot even if one read is skipped by a callback branch. | Every reactive value referenced by the effect must appear in a constant-length dependency list. A conditional read does not make the list conditional. |
| Dynamic structured lifetime                          | An effect may create child effects, child scopes, and owned resources. Invalidating the parent disposes that run's children, runs the parent cleanup, and then constructs the next run. | Effects occupy compiler-assigned component hook slots. Conditional hooks are supported, but runtime-created hooks inside an executing effect are not an equivalent ownership primitive.                    | Hooks cannot be called inside effect callbacks. Separate component boundaries or manual subscription composition are required.                         |
| Optional subscription that ceases to exist           | A parent effect creates its child watcher only while a condition is true. When false, the watcher and its dependency edges are removed rather than kept dormant behind an early return. | A hook call site may be conditional, but its lifetime is still expressed through component renders and hook slots.                                                                                         | Usually represented by a permanently declared guarded effect or a conditionally rendered child component.                                              |
| Non-reactive resource lifetime                       | `useOwned(() => acquire(), release)` attaches a worker, observer, socket, controller, or third-party instance directly to the current owner.                                            | Resource acquisition and cleanup are normally represented with an effect.                                                                                                                                  | Resource acquisition and cleanup are normally represented with an effect, often with an additional ref.                                                |
| Derived state independent of its declaring component | A component owns the `useComputed()`/`useMemo()` node; consumers subscribe to that node. A change invalidates those consumers, not the component merely because it is the owner.        | `useMemo` caches a derived value across component renders using inferred or explicit dependencies.                                                                                                         | `useMemo` caches a derived value across component renders using an explicit dependency list.                                                           |
| Current state in delayed work                        | A closure captures the stable signal accessor. `count()` performs the read when the timer, event, or promise callback runs.                                                             | `useState` provides an Octane-specific third current-state getter in addition to its snapshot value and setter.                                                                                            | Captured state is a render snapshot; current reads generally require a ref or an Effect Event.                                                         |
| DOM-settled owned work                               | `useEffectRender()` runs from a dedicated queue after watcher-driven DOM mutations settle and is disposed with its owner.                                                               | Layout and passive effects are commit phases of component rendering.                                                                                                                                       | `useLayoutEffect` and `useEffect` are commit phases of component rendering.                                                                            |

For example, nested effects form a lifetime tree rather than a flat list of
callbacks:

```tsx
useEffect(() => {
  const id = selected();

  useEffect(() => {
    const connection = connect(id, details());
    return () => connection.close();
  });

  useOwned(
    () => new Worker("./worker.js"),
    (worker) => worker.terminate(),
  );

  return () => log("parent cleanup");
});
```

On a parent invalidation, Reflex disposes the child effect and worker first,
then runs `parent cleanup`, and only then executes the parent again. A child can
also rerun independently when only one of its own dependencies changes.

The Octane statements above are pinned to
[`octanejs/octane@8c29020`](https://github.com/octanejs/octane/tree/8c290206e923dc4283c7e0f019bfc117c4de8904),
specifically its documented
[call-site hook slots and dependency inference](https://github.com/octanejs/octane/blob/8c290206e923dc4283c7e0f019bfc117c4de8904/docs/differences-from-react.md).
Octane is alpha, so later compiler semantics may differ. The React column
follows the documented
[Rules of Hooks](https://react.dev/reference/rules/rules-of-hooks),
[`useEffect` dependency model](https://react.dev/reference/react/useEffect), and
[state-as-a-snapshot model](https://react.dev/learn/state-as-a-snapshot).

## Architecture

Three structures cooperate without being collapsed into one another:

1. The reactive dependency graph connects producers to the computed values,
   effects, and DOM bindings that read them.
2. The ownership tree records components, effect executions, dynamic branches,
   event listeners, refs, resources, and cleanups.
3. The browser DOM tree contains the nodes and managed ranges produced by the
   renderer.

```text
JSX
  -> framework renderables and ownership scopes
  -> DOM mount dispatcher
  -> elements / components / dynamic slots / structural operators
  -> managed DOM ranges
```

Reactivity determines invalidation; ownership determines disposal. A component
can own a computed node without subscribing itself to that node, while DOM text,
attributes, or effects subscribe independently. Component execution establishes
the owned setup scope; fine-grained bindings update without rerunning that setup
function.

Ownership is platform-agnostic and lives in `reflex-framework`. DOM mounting
selects the active owner and registers host resources against it. Every effect
run creates a child ownership node, so resources and further effects created
during that run inherit its lifetime. Disposing a branch or effect run walks its
ownership subtree inside-out, runs cleanups, and removes only the DOM range
owned by that scope.

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

| Strategy | Behaviour                                                                              |
| -------- | -------------------------------------------------------------------------------------- |
| `eager`  | Flushes pending watchers when the host becomes inactive or the outer batch exits.      |
| `sab`    | Flushes at a settled outer batch boundary.                                             |
| `flush`  | Defers automatic delivery to a microtask and also supports explicit `runtime.flush()`. |

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
before a rerun and again when the owner is disposed. Effects created during its
callback are children of that particular run. They may rerun independently, but
they are disposed before the parent cleanup when the parent reruns or is
disposed.

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

This removes the branch's reactive dependency edges and prevents its effects
from continuing to observe sources. Components, nested effects, listeners,
refs, and `useOwned` resources inside the branch follow the same disposal walk.

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

| Area                        | Location                                                 |
| --------------------------- | -------------------------------------------------------- |
| Runtime host and policies   | `src/runtime/options.ts`, `src/runtime/policies.ts`      |
| Reactive effect scheduler   | `src/runtime/scheduler/`                                 |
| DOM render-effect scheduler | `src/runtime/render-effect-scheduler.ts`                 |
| Runtime/DOM context bridge  | `src/runtime/execution/`                                 |
| Ownership and hooks         | `packages/reflex-framework/src/ownership/`, `src/hooks/` |
| Mount dispatch              | `src/mount/`                                             |
| DOM writes and bindings     | `src/host/`, `src/bindings/`                             |
| Dynamic ranges              | `src/structure/`                                         |
| Reconciliation              | `src/reconcile/`                                         |
| Hydration and SSR           | `src/hydrate/`, `src/server/`                            |

Russian developer onboarding is available in `docs/ONBOARDING.ru.md`.
