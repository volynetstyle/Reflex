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
- `useEffect`, `useEffectOnce`, and `useMountedEffect`
- `useMount`, `useUnmount`, `useOwned`, and `useRef`
- ownership context helpers

Reusable models:

- `defineModel`, `ModelContext`, `Model`, and model capability helpers

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
| DOM-settled owned work                               | `useMountedEffect()` runs from a dedicated queue after watcher-driven DOM mutations settle and is disposed with its owner.                                                              | Layout and passive effects are commit phases of component rendering.                                                                                                                                       | `useLayoutEffect` and `useEffect` are commit phases of component rendering.                                                                            |

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

### Reusable models

`defineModel()` packages a reusable namespace of tracked reads, synchronous
actions, child models, and owned resources. Each call to the returned factory
creates an independent model instance.

```tsx
import { defineModel, readModelValue, useSignal } from "@volynets/reflex-dom";

const createCounter = defineModel((ctx, initial: number) => {
  const count = useSignal(initial);

  return {
    count: ctx.read(() => count()),
    increment: ctx.action((step = 1) => count((current) => current + step)),
  };
});

function Counter() {
  const counter = createCounter(0);

  return <button onClick={() => counter.increment()}>{counter.count}</button>;
}

const counter = createCounter(10);
const currentValue: number = readModelValue(counter.count);
counter.dispose();
```

`ctx.read(read)` returns a branded callable accessor. It evaluates `read` when
called, and dependencies are recorded by the active reactive computation. Use
`readModelValue(value)` when an API expects the underlying value: it calls only
model read accessors and returns ordinary values and ordinary functions
unchanged. `ModelValue<T>` describes the same unwrapping at the type level.

`ctx.action(fn)` returns a branded synchronous callback. An action runs in a
batch, untracked, with the model's ownership and DOM context restored. An
action that returns a promise-like value is rejected at runtime. This is a
synchronous mutation boundary, not state rollback. Actions can return a
synchronous result and preserve their argument and `this` types through
`ModelAction`.

The factory setup must return a plain namespace object. Its members can be
`ctx.read()` accessors, `ctx.action()` callbacks, child models, or nested plain
namespaces. Put constant values behind `ctx.read(() => value)` as well. Arrays,
class instances, getters/setters, and unwrapped functions are not valid model
members. Reserved lifecycle names (`dispose`, `disposed`, and
`Symbol.dispose`) belong to the model itself.

| API                                                     | Purpose                                                                            |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `defineModel(setup, options?)`                          | Define a factory. The setup receives `ModelContext` first, then factory arguments. |
| `ctx.own(resource)`                                     | Attach a disposable resource or child model to the model's lifetime.               |
| `ctx.handle(resource)`                                  | Create a reusable handle; adopting that same handle again is idempotent.           |
| `ctx.onDispose(cleanup)`                                | Register a synchronous cleanup for model disposal.                                 |
| `model.dispose()` / `model[Symbol.dispose]()`           | Dispose the model and its owned child models and resources.                        |
| `model.disposed` / `ctx.disposed`                       | Check whether the model is closing or has been disposed.                           |
| `isModel`, `isModelReadableValue`, `isModelActionValue` | Narrow unknown values to their corresponding model capability.                     |
| `own(ctx, resource)`                                    | Compatibility helper; prefer `ctx.own(resource)`.                                  |

Models created while a component or another model is active join that owner's
tree, including models created by model actions. Disposal closes child scopes
and resources before the model's own cleanup. If a model is created without an
active owner, dispose it explicitly. If setup throws or returns an invalid
shape, acquired resources are cleaned up and the original setup error is
rethrown.

| Type                              | Meaning                                                                                |
| --------------------------------- | -------------------------------------------------------------------------------------- |
| `Model<Shape>`                    | The validated namespace combined with its lifecycle handle.                            |
| `ModelAction<Args, Result, This>` | A branded synchronous action with its argument, result, and `this` types.              |
| `ModelContext`                    | The API for creating reads/actions, adopting resources, and registering cleanup.       |
| `ModelFactory<Args, Shape>`       | The callable factory returned by `defineModel()`.                                      |
| `ModelHandle`                     | The `dispose()`, `disposed`, and `[Symbol.dispose]` lifetime API.                      |
| `ModelOptions`                    | Factory options; `batch` overrides the batch boundary for setup, actions, and cleanup. |
| `ModelReadable<T>`                | A branded accessor that reads a value of type `T`.                                     |
| `ModelSetup<Args, Shape>`         | The setup callback receiving context and factory arguments.                            |
| `ModelValue<T>`                   | The unwrapped value type for a readable; other types pass through unchanged.           |

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

The renderer manages DOM regions with explicit resource ownership. Three structures
remain independent: the reactive dependency graph determines invalidation, the
framework ownership tree determines disposal, and the DOM tree determines placement.
Roots, portals, shadow content and complex dynamic branches share an owned range.

- `client/`: one root registration, replacement, rollback and disposal path.
- `runtime/`: synchronous DOM context, framework ownership bridge and delivery.
- `mount/` and `hydrate/`: create JSX content or adopt existing nodes.
- `structure/`: owned ranges and replaceable content slots, independent of mounting.
- `host/`: document-aware DOM operations, properties, events, forms and namespaces.
- `reconcile/`: independent keyed and unkeyed list algorithms.
- `renderable/`: shared value classification and server/client marker format.
- `server/`: HTML serialization with scoped ownership.

The target container's document supplies new nodes. Detached documents, iframe
realms and cross-document portals do not depend on the global window's constructors.
A root record stored on the container lets different renderers agree on ownership;
a stale cleanup cannot remove a replacement's anchors. Foreign DOM outside the
managed range survives rendering and disposal.

The [architecture research and decisions](docs/ARCHITECTURE.ru.md) explain the
removed abstractions, dependency rules, breaking changes and remaining limitations.
A source architecture test enforces the lower-layer import boundaries.

## Scheduling and effects

Choose `effectStrategy` in `createApp()` or `createDOMRenderer()`:

| Strategy          | Delivery                                                   |
| ----------------- | ---------------------------------------------------------- |
| `eager` (default) | Synchronous delivery at a runtime or outer batch boundary. |
| `sab`             | Delivery at a settled outer batch boundary.                |
| `flush`           | Automatic delivery through a coalesced Promise microtask.  |

Use `renderer.run(fn)`, `renderer.batch(fn)` and `renderer.flush()` to enter the
reactive runtime, group writes, or explicitly drain pending work. Native event
handlers enter the mounting renderer's batch automatically. Nested renderer calls
restore their previous synchronous context even when a callback throws.

`reflex-runtime` propagates changes; `reflex-scheduler` owns the watcher queue.
The DOM coordinator connects that queue to host delivery and mounted effects.
Posting a continuation and executing it are separate operations: a token identifies
an outstanding host request, repeated writes share it, and stale callbacks do no work.
Microtask batching does not imply a frame, a paint, a priority or cooperative yielding.

`useEffect()` creates an ownership-bound reactive effect. Previous cleanup runs
before a rerun, and disposal closes nested effect scopes inside-out.

`useMountedEffect()` defers its **first** reactive run until mounting and pending
reactive DOM work settle. Subsequent runs use ordinary watcher FIFO delivery; this
is not a promise that every rerun follows all DOM writes or browser paint. Pending
first runs are cancelled when their owner closes. Mount tasks use a single FIFO
queue, including reentrant scheduling and cancellation during a drain. If a first
run creates deferred reactive work, the remaining first runs wait for it to settle.
Task failures do not discard the other runnable tasks; the first error is rethrown.

## Dynamic content, SSR and hydration

Replacing a complex dynamic branch disposes its owner, clears its range, and mounts
new content under a fresh owner. Text values update in place. Keyed moves preserve
row identity and ownership; removed rows release effects, listeners and refs.

`renderToString()` emits HTML with dynamic slot markers. `hydrate()` adopts matching
DOM and remounts mismatches. `resume()` takes ownership of existing content without
attaching JSX behavior. A portal belongs to its source component even when its DOM
is in another document.

Dynamic hydration currently adopts a marked slot as a whole; it does not provide
full per-component activation inside every server-rendered dynamic branch.

## Migration

- `useEffectRender` became `useMountedEffect`.
- `renderer.renderEffectScheduler` became `renderer.mountEffects`.
- Render effect phases and phase-based scheduler types were removed; the queue
  contract is `MountEffects`, with FIFO scheduling and no browser-phase claim.
- The unused `policy` options were removed; use `effectStrategy`.
- Internal file paths changed; no compatibility aliases are provided.

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

Both runtime entrypoints are bundled from one shared module graph, so framework
effects and the DOM scheduler use the same runtime state. The build finishes with
`test:standalone`, which checks events, reactive delivery, effects, disposal, SSR
and hydration against the actual published module in all three strategies.

## Development commands

```powershell
# Unit and integration tests
pnpm --filter @volynets/reflex-dom test

# Differential reconciliation tests in Chromium
pnpm --filter @volynets/reflex-dom test:browser

# Type checking
pnpm --filter @volynets/reflex-dom typecheck

# Standalone production build
pnpm --filter @volynets/reflex-dom build

# Real-browser DOM mutation benchmark
pnpm --filter @volynets/reflex-dom bench:mutations

# Runtime / scheduler / DOM boundary microbenchmarks
pnpm --filter @volynets/reflex-dom bench:boundary
```

The mutation benchmark runs in a local Chromium-based browser and writes
`bench/mutations.results.html`.

The seeded stress suites exercise long keyed-list edit histories, compare delta
and snapshot reconciliation against a plain list model, compare renderer output
against plain DOM across all effect strategies, and check scheduler batching and
reentrant drains. Their seeds and failing step numbers are reported on failure.
The ownership differential suite compares framework scope cleanup, context
inheritance, nested effect reruns, keyed row lifetimes, and failed mounts with
the DOM renderer in both jsdom and Chromium.

See [developer onboarding](docs/ONBOARDING.ru.md) and the [architecture contract](docs/ARCHITECTURE.ru.md).
