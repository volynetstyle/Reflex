# reflex-dom ownership

This directory contains the lifecycle backbone of `reflex-dom`.

The ownership subsystem is the reason a DOM subtree can be mounted, updated,
replaced, and disposed without leaking reactive effects, event listeners, refs,
or nested branch state.

## One-Sentence Definition

Ownership is the tree of lifecycle scopes that mirrors the render tree closely
enough to answer one question at any moment:

> If this subtree goes away right now, exactly what needs to be cleaned up?

## Design Goals

- deterministic subtree disposal
- child-before-parent cleanup order
- O(1) detach from sibling chains
- no recursion during deep disposal
- lazy allocation for cleanups and context
- correct owner restoration during reactive reruns
- no ownership scope for inert states that do not need cleanup

## File Map

| File | Responsibility |
| --- | --- |
| `ownership.node.ts` | Fixed-layout ownership node |
| `ownership.meta.ts` | Packed metadata helpers and disposed flag |
| `ownership.tree.ts` | Parent/child/sibling attach and detach operations |
| `ownership.cleanup.ts` | Cleanup registration and iterative subtree disposal |
| `ownership.scope.ts` | Owner context, scope creation, and `runWithScope()` |
| `ownership.effect.ts` | `ownedEffect()` and `onEffectStart()` |
| `ownership.context.ts` | Optional context layering and lookup helpers |
| `index.ts` | Public re-exports for the local subsystem |

## Core Types

### `OwnershipNode`

An ownership node is a scope.

It stores:

- `parent`
- `firstChild`
- `lastChild`
- `nextSibling`
- `prevSibling`
- `meta`
- `context`
- `cleanups`

This gives us a compact tree with O(1) sibling removal and predictable memory
layout.

### `OwnerContext`

`OwnerContext` is not the tree itself. It is the moving pointer to the current
owner while work is being mounted or rerun.

```ts
interface OwnerContext {
  currentOwner: Scope | null;
}
```

### `Scope`

`Scope` is simply an alias of `OwnershipNode`.

That keeps the renderer API readable while still using the same low-level node
implementation everywhere.

## Visual Model

```text
container
\- root scope
   |- component scope: <App />
   |  |- effect cleanup
   |  \- nested component scope: <Sidebar />
   |
   \- slot scope
      \- component scope: conditional branch
```

Every cleanup belongs to a scope.
Every replaceable subtree gets its own scope.
Disposing a scope disposes everything under it.

## How Scopes Are Created

### Root scope

Created in `render.ts` for each root mount.

### Component scope

Created in `mount/component.ts` before mounting the component output. The scope
is automatically attached to the current owner by `runWithScope()`.

### Dynamic branch scope

Created in `content-slot.ts` when a non-trivial branch is mounted into a slot.
This is what lets `Show`, `Switch`, dynamic accessors, and parts of `For`
replace only the affected subtree.

### No scope for inert states

Plain text and borrowed DOM nodes inside `content-slot.ts` do not allocate a
scope, because there is nothing to own or dispose besides the DOM node itself.

That keeps the hot path lean.

## Main API

### `createOwnerContext()`

Creates the mutable holder for the current owner pointer.

Use it once per renderer.

### `createScope()`

Creates a detached ownership node.

At this point it has no parent and no cleanups.

### `runWithScope(owner, scope, fn)`

The main entry point for mounting work into a scope.

It does three jobs:

1. Attaches `scope` to the current owner if there is one.
2. Temporarily makes `scope` the active owner.
3. Registers any plain Reflex `effect()` created inside `fn` as cleanups of
   that scope.

This is the bridge between Reflex reactivity and DOM lifecycle.

### `registerCleanup(owner, fn)`

Adds a cleanup to the current owner scope, if one exists.

Used for:

- event listener teardown
- ref cleanup
- slot destruction
- explicit disposer registration

### `ownedEffect(owner, fn)`

Creates an effect that is owned by the current scope at mount time.

Important behavior:

- the owning scope is captured once
- the scope is restored again on later reruns
- the effect disposer itself is registered into that same scope

Without this helper, reruns would happen outside the correct owner boundary.

### `onEffectStart(fn)`

Gates DOM writes so the first effect pass can read reactive values without
duplicating mount-time DOM mutations.

Typical pattern:

```ts
ownedEffect(owner, () => {
  const nextValue = read();

  onEffectStart(() => {
    patchDOM(nextValue);
  });
});
```

Meaning:

- first pass: read only
- later passes: patch DOM

### `disposeScope(scope)`

Disposes the entire subtree rooted at `scope`.

This is the operation that makes branch replacement safe.

## Lifecycle Walkthrough

### Mount phase

```text
render()
  -> create root scope
  -> runWithScope(root)
     -> mount component
        -> create child scope
        -> runWithScope(child)
           -> create effects / listeners / refs
           -> register cleanups into child
```

At the end of mount, every cleanup is reachable from the root scope.

### Reactive update phase

```text
signal changes
  -> ownedEffect reruns
  -> captured owner is restored
  -> branch/prop/text patch is applied
  -> any nested replaceable subtree gets a fresh child scope
```

The key property is that updates do not lose ownership context.

### Branch replacement phase

```text
slot.update(nextValue)
  -> dispose previous slot scope
  -> clear DOM between markers
  -> create new slot scope
  -> mount next subtree into new scope
```

Only the branch that changed is touched.

### Root replacement phase

```text
render(nextTree, sameContainer)
  -> read mounted root scope from container
  -> dispose previous root
  -> mount next root
```

The container itself is the authority for which root scope is currently mounted.

## Disposal Algorithm

Disposal is iterative, not recursive.

High-level traversal:

```text
while node exists:
  if node has child:
    descend to first child
  else:
    capture next sibling or parent
    run cleanups in reverse order
    mark disposed
    detach node
    continue with next sibling or parent
```

This gives us:

- safe disposal for deep trees
- no recursive call stack growth
- predictable inside-out teardown

## Cleanup Order

Within a single scope, cleanups run in reverse registration order.

That matters because the most recently created resource is often the most local
one and should be released first.

Example:

```text
mount component
  -> register effect disposer
  -> register slot destroy cleanup

dispose component scope
  -> slot destroy runs first
  -> effect disposer runs after
```

Across scopes, children always dispose before parents.

## Error Isolation

Cleanup failures are isolated per callback.

If one cleanup throws:

- the error is logged
- disposal continues
- sibling cleanups still run

This avoids partial teardown where one failure leaks the rest of the subtree.

## Why The Mounted Root Is Stored On The Container

The mounted root is not kept in a renderer-local `WeakMap`.

Instead, a private `Symbol` property on the container stores the current root
scope.

Benefits:

- the DOM container is the single source of truth
- different renderer instances can hand off the same container safely
- root replacement logic stays local to the actual mount target

This is also why the package now has a regression test for cross-renderer
handoff.

## Invariants

These invariants should stay true:

1. A scope may be disposed multiple times without throwing.
2. A disposed scope does not accept new children or cleanups.
3. If a subtree is independently replaceable, it must have its own scope.
4. If a value does not allocate cleanup-bearing resources, it should not create
   a scope.
5. `ownedEffect()` must always restore the owner captured during mount.
6. Root replacement must dispose the old root before mounting the new one.

## Extension Rules

When adding a new feature to `reflex-dom`:

### Create a new scope when

- a mounted subtree can be replaced independently
- nested effects/listeners/refs must die with that subtree
- lifecycle ownership would otherwise become ambiguous

### Reuse the current scope when

- you only register a cleanup for the current subtree
- you patch existing DOM in place
- no independent branch boundary is introduced

### Do not create a scope when

- you mount plain text
- you insert an external `Node` directly
- there is no owned cleanup or nested lifecycle

## Practical Reading Order

If you want to understand the subsystem quickly, read in this order:

1. `ownership.scope.ts`
2. `ownership.effect.ts`
3. `ownership.cleanup.ts`
4. `ownership.tree.ts`
5. `content-slot.ts`
6. `render.ts`

That path follows the real runtime story: who owns work, how effects are tied
to scopes, and how scopes disappear.
