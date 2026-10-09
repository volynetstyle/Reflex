# @volynets/reflex-dom

DOM renderer for Reflex.

The default entrypoints are library builds. They keep the runtime, framework and
scheduler as external imports, so DOM, Store and Async share the application's
kernel module identity. Install compatible peers alongside the renderer:

```sh
pnpm add @volynets/reflex-dom @volynets/reflex-runtime @volynets/reflex-framework @volynets/reflex-scheduler
```

For an isolated application or CDN module, use
`@volynets/reflex-dom/standalone`. It includes the runtime, framework, scheduler
and renderer in one closed module graph. Use
`jsxImportSource: "@volynets/reflex-dom/standalone"` and the corresponding
`/standalone/jsx-runtime` or `/standalone/jsx-dev-runtime` entrypoint.
The emitted `dist/standalone` directory has no external JavaScript or type imports
and can be served directly. The npm manifest still declares peers for the library
entrypoints. Use the library build when composing with separately installed
Store, Async or framework packages; mixing them with standalone creates a second
kernel and ownership graph.

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

The `useSignal()` exported by this package binds writes to the DOM runtime
active when the signal is created. A setter captured by a timer or promise can
be called directly:

```ts
const count = useSignal(0);

setTimeout(() => count((value) => value + 1));
```

The accessor is mutable: call it with no argument to read, or pass a value or
updater to write. `undefined` means a read; to store `undefined`, use an updater
such as `count(() => undefined)`. Writes enter the captured runtime through
`run()` without opening a batch. Delivery follows `effectStrategy`: `flush`
coalesces writes into a microtask, `eager` settles synchronously, and `sab`
waits for a settled batch boundary. Use `renderer.batch()` when several writes
must form one transaction, or `renderer.flush()` when pending DOM work must be
committed synchronously.
Reactive reads of a DOM signal must run in the renderer that created it.
Calling its setter while another renderer is active still routes the write to
its owner; reading it inside another renderer's reactive computation throws,
because that would attach a dependency to a different scheduler.

The framework's `useSignal()` and raw runtime primitives leave execution
boundaries to their caller. Outside a DOM context, including server rendering,
this package's `useSignal()` delegates to the framework hook directly.

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
- `useAbortSignal` and `getLifetimeSignal`
- ownership context helpers

Reusable models:

- `defineModel`, `ModelContext`, `Model`, and model capability helpers

Within each build mode, the JSX entrypoints share the same framework and runtime
module graph as the corresponding renderer entrypoint.

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

## Lifetime cancellation

`useAbortSignal()` returns the native cancellation signal of the current owner.
Capture it during component setup for component lifetime, or inside `useEffect`
for one effect execution. Effect reruns abort the preceding execution's signal;
unmounting cancels all owned work. Calling the hook without an owner throws.
Capture it before crossing an `await` boundary.

```ts
useEffect(() => {
  const url = endpoint();
  const signal = useAbortSignal();
  void fetch(url, { signal })
    .then(async (response) => {
      const value = await response.json();
      if (!signal.aborted) publish(value);
    })
    .catch((error) => {
      if (!signal.aborted) reportError(error);
    });
});
```

For explicit ownership, `getLifetimeSignal(node)` returns the same lazily allocated
signal on every call. A closed owner returns an aborted signal. Models expose the
same mechanism as `ctx.signal`; it follows the model's lifetime, so repeated
actions do not replace it. Cancellation is cooperative: guard publication when an
operation may ignore its signal. See the framework's
[lifetime signal contract](../reflex-framework/docs/lifetime-signals.md).

## Structural DOM refs

DOM `Show` and `For` accept a `Ref<DOMRangeHandle>` without adding a wrapper element.
The handle stays the same while the branch changes or keyed rows move. Its methods
read the current physical siblings between the structural anchors. Server rendering
does not invoke refs; hydration attaches them to the adopted range.

```tsx
import { Show, useRef, type DOMRangeHandle } from "@volynets/reflex-dom";

function Details() {
  const range = useRef<DOMRangeHandle | null>(null);
  return (
    <Show when={true} ref={range}>
      <button onClick={() => range.current?.focus()}>Focus this group</button>
      <input />
    </Show>
  );
}
```

| Method                     | Behavior                                                                                                  |
| -------------------------- | --------------------------------------------------------------------------------------------------------- |
| `nodes()`                  | Snapshot of current top-level nodes, excluding the two boundary anchors. Internal anchors may be present. |
| `focus(options?)`          | Focus the first focusable element in DOM order, including descendants.                                    |
| `blur()`                   | Blur the active element only if it belongs to the range.                                                  |
| `rects()`                  | Collect client rects for top-level elements and nonempty text nodes.                                      |
| `scrollIntoView(options?)` | Scroll the first top-level element into view.                                                             |
| `observe(observer)`        | Observe top-level elements with a `ResizeObserver` or `IntersectionObserver`; return idempotent cleanup.  |
| `dispose()`                | Stop observations and empty the handle without removing its DOM.                                          |

Observation membership updates asynchronously at `MutationObserver` checkpoints,
including when nested content replaces top-level elements. Subscriptions to a handle
share one mutation observer watching only its common parent's child list, so
descendant and unrelated document mutations do not trigger membership scans. If
the anchors lose their common parent, tracking temporarily watches their documents
and detached or shadow roots to recover after reattachment. Moving both anchors
to a new parent rebinds tracking at the next checkpoint. This tracking is allocated
only when `observe()` is called. Cleanup unobserves this handle's targets without
disconnecting the supplied observer. Multiple subscriptions to the same or
overlapping handles and observer share targets. Reserve those targets for the
handles while subscribed; independently observing the same target with that
observer does not create a separate browser subscription.

Run `pnpm --filter @volynets/reflex-dom bench:range` to measure snapshots, early
focus and scroll target lookup, handle creation, and membership updates across
100 observed ranges. These benchmarks use jsdom; scroll calls are stubbed to
measure target lookup independently of browser scrolling and layout.

Disposal clears object refs, invokes callback-ref cleanup, and calls the callback
with `null`. A captured disposed handle returns no nodes or rects, and its other
operations do nothing. The handle represents physical DOM membership; it does not
include content mounted into a portal elsewhere.

`createDOMRangeHandle(start, end)` creates the same view over explicit text or
comment anchors. The caller must dispose this standalone handle. Detached or
reversed boundary anchors produce an empty view. Observation requires a document
with a browsing context providing `MutationObserver`.

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

## Library and standalone builds

From the repository root:

```powershell
pnpm --filter @volynets/reflex-dom build
```

The pipeline:

1. builds `reflex-runtime`, `reflex-scheduler`, and `reflex-framework`;
2. emits intermediate DOM modules and declarations into `build/esm`;
3. bundles the root and JSX entrypoints together for each build mode;
4. minifies production JavaScript and bundles declarations, preserving peer
   imports in the library build and embedding dependencies in standalone;
5. creates a publishable `dist` package with peer metadata, README, and license;
6. verifies the standalone module closure, behavior and JSX types outside the workspace.

The published `dist` directory contains:

```text
dist/
  index.js
  index.d.ts
  jsx-runtime.js
  jsx-runtime.d.ts
  jsx-dev-runtime.js
  jsx-dev-runtime.d.ts
  chunks/
  standalone/
    index.js
    index.d.ts
    jsx-runtime.js
    jsx-runtime.d.ts
    jsx-dev-runtime.js
    jsx-dev-runtime.d.ts
    chunks/
  package.json
  README.md
  LICENSE
```

Library JavaScript and declarations preserve framework, scheduler and runtime
package imports. Every standalone import resolves within `dist/standalone`;
the build fails if standalone JavaScript or declarations leave an external dependency.

Within each mode, the main and JSX entrypoints share one module graph.
`test:library` checks the published library together with Store and shared peers,
including reactive DOM updates, disposal and strict consumer JSX declarations.
`test:standalone` copies only the published package to an isolated temporary
consumer. It checks events, reactive delivery, effects, lifetime cancellation,
range refs, disposal, SSR, and hydration in all three strategies. It also checks
the production and development JSX types under both TypeScript `NodeNext` and
`Bundler` resolution, with `skipLibCheck: false`.

Pack from the repository root:

```powershell
pnpm --dir packages/reflex-dom pack
```

`prepack` runs the complete build and verification before packing or publishing.
pnpm publishes from `dist` through `publishConfig.directory`; workspace source
conditions and development dependencies stay in the local manifest. For npm,
build first and run `npm pack ./packages/reflex-dom/dist` from the repository root.

## Development commands

```powershell
# Unit and integration tests
pnpm --filter @volynets/reflex-dom test

# Differential reconciliation tests in Chromium
pnpm --filter @volynets/reflex-dom test:browser

# Type checking
pnpm --filter @volynets/reflex-dom typecheck

# Library and standalone production builds
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
