# reflex-dom

`reflex-dom` is the DOM renderer for Reflex.

It turns JSX and renderable values into real DOM, but the important detail is
that it does so with an explicit ownership tree. DOM nodes, reactive effects,
event listeners, refs, and dynamic branch cleanups are all tied to lifecycle
scopes, so mount, update, replace, and dispose stay deterministic.

## What This Package Is Responsible For

| Area | Files | Responsibility |
| --- | --- | --- |
| Public runtime API | `src/runtime.ts`, `src/render.ts` | Create renderers, mount roots, replace previous roots, expose `render()` / `mount()` / JSX runtime |
| Render dispatch | `src/mount/append.ts` | Walk renderable values and route them to element, component, operator, or text mounting |
| Mount architecture | `src/mount/*` | Keep element binding, renderable classification, and slot primitives as explicit seams instead of burying them inside tree walkers |
| DOM host writes | `src/host/*`, `src/bindings/*` | Apply props, styles, events, refs, namespaces, and reactive prop bindings |
| Dynamic regions | `src/structure/content-slot.ts`, `src/mount/reactive-slot.ts` | Keep slots replaceable without leaking nested effects |
| Structural operators | `src/mount/show.ts`, `src/mount/switch.ts`, `src/mount/for.ts` | Mount conditional and keyed-list branches |
| List reconciliation | `src/reconcile/*` | Hold keyed and unkeyed diff logic outside operator mounting so list behavior is easier to reason about and extend |
| Execution policies | `src/runtime/policies.ts` | Describe renderer scheduling intent and map it onto the current Reflex runtime options |
| Ownership and cleanup | `reflex-framework/ownership` + DOM mount sites | Track who owns which subtree and dispose it in a predictable order |

## Mental Model

Think of `reflex-dom` as building two trees at the same time:

1. The DOM tree that the browser sees.
2. The ownership tree that Reflex uses for lifecycle and cleanup.

The DOM tree answers:

- What is currently mounted?
- Where should nodes be inserted or moved?

The ownership tree answers:

- Who owns this effect?
- Which cleanups belong to this component?
- What should be disposed when a branch is replaced?

That second tree is what keeps dynamic rendering safe.

## Visual Architecture

```text
JSX / renderable value
        |
        v
runtime.ts
  - createDOMRenderer()
  - jsx / jsxs / Fragment
        |
        v
render.ts
  - resolve previous root on container
  - dispose old root if present
  - create new root scope
        |
        v
runInOwnershipScope(root)
        |
        v
mount/append.ts
  |- element -> mount/element.ts -> mount/element-binder.ts -> host/*
  |- component -> mount/component.ts
  |- accessor -> mount/reactive-slot.ts
  |- Show/Switch/For -> mount/show.ts / switch.ts / for.ts
  |                    \-> reconcile/keyed.ts
  \- primitives -> text nodes
        |
        v
reflex-framework/ownership/*
  - scopes
  - context
  - cleanup registration
  - subtree disposal
  - reactive bridge used by DOM mounts
```

## End-to-End Lifecycle

### 1. Root render

`render(input, container)` eventually calls `renderWithRenderer()`.

The root transaction is:

1. Ensure the underlying Reflex runtime exists.
2. Read the mounted root scope from the container.
3. Dispose the previous root scope if the container is already mounted.
4. Create a fresh root scope.
5. Clear the container.
6. Mount the new tree inside `runInOwnershipScope(rootScope, ...)`.
7. Store the new root scope on the container.
8. Return an idempotent dispose function.

This makes every root render a clean ownership boundary.

### 2. Mounting a subtree

Inside the root scope, `mount/append.ts` dispatches by value shape:

- Element renderables create real DOM elements and bind props/children.
- Component renderables allocate a child ownership scope and mount the component
  output inside it.
- Accessors become dynamic ranges backed by a slot.
- `Show`, `Switch`, and `For` allocate replaceable branch regions.
- Strings, numbers, and `Node` instances are mounted directly.

### 3. Reactive updates

Reactive bindings are registered through `useEffect()`.

That effect helper does two important things:

- Captures the owner scope that was active during mount.
- Restores that same owner during later reruns.

As a result, updates still know which scope owns any nested work they trigger.

Plain Reflex effects created during mount are captured by the current ownership
scope because DOM mounts enter the tree through `runInOwnershipScope()`.

`onEffectStart()` is used to skip DOM writes on the first effect pass when the
initial DOM was already produced during mount. Later reruns are allowed to patch
the DOM.

### 4. Branch replacement

Dynamic regions are isolated through `ContentSlot` and child scopes.

When a branch changes:

1. The current slot state is disposed.
2. DOM between the slot markers is cleared.
3. A new subtree is mounted into a fresh scope.
4. That new scope becomes the active state for the slot.

This lets a branch be replaced without touching unrelated siblings.

### 5. Disposal

Disposal is always subtree-based and inside-out:

1. Walk to the deepest mounted child scope.
2. Run that node's cleanups in reverse registration order.
3. Detach the node from the ownership tree.
4. Continue with its next sibling or parent.
5. Finish at the original root.

The result:

- children clean up before parents
- repeated `dispose()` calls are safe
- cleanup failures are isolated and logged without aborting the rest

## Why Ownership Exists

Without ownership, a renderer eventually loses track of which effects and
subscriptions belong to which DOM branch.

Typical failures look like this:

- A conditional branch disappears, but its effect keeps running.
- A component is replaced, but its event listener cleanup is forgotten.
- A root render is replaced, but stale reactive bindings still observe signals.

Ownership solves all three by making lifecycle explicit.

## Why There Is No WeakMap For Mounted Roots

Mounted root state is stored directly on the container through a private
`Symbol`, not in a renderer-local `WeakMap`.

That matters for two reasons:

1. The container itself is the source of truth for what is mounted there.
2. Different renderer instances can still see and dispose the previous root on
   the same container.

This is especially important for handoffs such as:

```text
rendererA.render(...) -> container owns root scope A
rendererB.render(...) -> rendererB sees scope A on container and disposes it
```

With a renderer-local `WeakMap`, that cross-renderer handoff would be much
harder to reason about.

## Ownership Deep Dive

`reflex-dom` now consumes ownership from `reflex-framework`.

The renderer is responsible for choosing where DOM mounts enter ownership
scopes, but the ownership tree itself belongs to the platform-agnostic core.

## Example Trace

For the render below:

```tsx
render(
  <App>
    {() => show() ? <Panel value={count} /> : null}
  </App>,
  container,
);
```

The lifecycle looks like this:

```text
root scope
\- App component scope
   \- dynamic slot scope
      \- Panel component scope
         |- reactive prop effect
         \- reactive text/range effect
```

When `show()` becomes `false`, only the slot branch is disposed:

```text
dispose(slot scope)
  -> dispose(Panel component scope)
     -> cleanup reactive text/range effect
     -> cleanup reactive prop effect
  -> remove DOM between slot markers
```

The rest of the app remains mounted.

## Extension Guidelines

If you add a new renderer feature, ask two questions first:

1. Does this feature create work that must stop when a subtree disappears?
2. Can this feature mount a nested subtree that should be independently
   replaceable?

If the answer is yes:

- register cleanup in the current owner scope
- create a child scope for independently replaceable subtrees

If the answer is no:

- prefer plain DOM work with no extra scope allocation

That is why `content-slot` allocates scopes for fallback subtrees, but not for
plain text or borrowed DOM nodes.

## Recent Architecture Lift

The experimental `dom/` folder introduced a more explicit layered design. The
working `src/` implementation now carries the portable parts of that design:

- `src/mount/renderable.ts` centralizes renderable classification.
- `src/mount/element-binder.ts` separates element setup from child mounting.
- `src/reconcile/keyed.ts` owns keyed list diffing instead of keeping it inside `For`.
- `src/runtime/policies.ts` gives renderer scheduling a named policy surface.

That keeps the stable renderer behavior intact while making future features
like alternate hosts, richer list strategies, or batched scheduling easier to
add in one place.

## Status

The current implementation is covered by package tests for:

- root replacement
- nested component disposal order
- effect cleanup on branch removal
- dynamic operator behavior
- renderer handoff on the same container

For concrete lifecycle cases, see `test/render.lifecycle.test.tsx`.
