# Architecture

This document describes the repository architecture as it exists now and the
direction it is intentionally moving toward.

It is written with two goals:

1. Record what is already true in code.
2. Prevent architectural drift while the UI stack is being split into a
   platform-agnostic core and host-specific renderers.

When this document uses the words:

- `Verified now`: the statement is directly backed by the current codebase.
- `Direction`: the statement describes the intended migration path, not a fully
  completed implementation.

## Executive Summary

Reflex is organized as a layered system:

1. `@reflex/core`
2. `@reflex/runtime`
3. `@volynets/reflex`
4. `reflex-framework`
5. `reflex-dom`

The first three layers already form a reactive substrate:

- `@reflex/core` contains low-level graph and ownership mechanisms.
- `@reflex/runtime` contains host-driven reactive execution.
- `@volynets/reflex` provides ergonomic application-facing APIs like `signal`
  and `effect`.

The UI stack is now being separated into:

- `reflex-framework`: platform-agnostic UI core
- `reflex-dom`: first host implementation and DOM renderer

The central architectural decision is:

> Core owns meaning. Renderers own materialization.

In practice, that means:

- component/renderable meaning should be platform-agnostic
- lifecycle should be anchored in ownership, not in the DOM itself
- DOM packages should provide DOM-specific typing and DOM-specific host work
- host objects must not leak upward into the platform-agnostic UI core

## Status Snapshot

### Verified now

- `@reflex/core`, `@reflex/runtime`, and `@volynets/reflex` already exist as
  real layers.
- `reflex-framework` now owns the JSX runtime and platform-agnostic renderable
  primitives.
- `reflex-dom` consumes those framework primitives and supplies DOM-specific
  JSX typing, DOM rendering, DOM props/events/refs, and ownership-based DOM
  lifecycle.
- `reflex-dom` stores mounted root state on the DOM container and disposes
  subtrees deterministically via an ownership tree.

### Direction

- More host-agnostic UI primitives may move from `reflex-dom` into
  `reflex-framework`.
- A renderer contract may become explicit as its own package or module once the
  boundaries are stable.
- DOM is the first host implementation, not the only possible host.

## Layers

### 1. `@reflex/core`

Purpose:

- fundamental ownership structures
- graph primitives
- low-level data structures
- no UI assumptions
- no DOM assumptions

Verified now:

- `packages/@reflex/core/src/index.ts` exports `heap`, `ownership`, `graph`,
  and `bucket`
- `packages/@reflex/core/src/README.md` explicitly describes core as pure
  mechanism, independent of runtime or adapters

Architectural rule:

- `@reflex/core` must stay free of renderer concepts, JSX concepts, and host
  object types

### 2. `@reflex/runtime`

Purpose:

- deterministic reactive execution
- execution contexts
- watcher/producer/consumer traversal
- host-controlled scheduling

Verified now:

- `packages/@reflex/runtime/README.md` describes the runtime as a
  general-purpose computation substrate, not a UI framework
- `packages/@reflex/runtime/src/index.ts` exports reactive graph operations and
  execution-context primitives
- scheduling remains host-driven rather than renderer-driven

Architectural rule:

- runtime owns reactive execution semantics
- runtime does not own rendering semantics

### 3. `@volynets/reflex`

Purpose:

- public ergonomic facade for application code
- `signal`, `computed`, `memo`, `effect`, `createRuntime`, and event helpers

Verified now:

- `packages/reflex/src/index.ts` exports the application-facing API
- `packages/reflex/package.json` positions this package as the public facade

Architectural rule:

- this package is the stable user-facing convenience layer
- it should remain a facade over lower-level layers rather than becoming a
  second runtime

### 4. `reflex-framework`

Purpose:

- platform-agnostic UI core
- JSX runtime
- renderable model
- component/element renderable construction

Verified now:

- `packages/reflex-framework/src/runtime/jsx.ts` owns `Fragment`, `jsx`,
  `jsxs`, and `jsxDEV`
- `packages/reflex-framework/src/types/core.ts` owns platform-agnostic
  attributes/accessors/cleanup typing
- `packages/reflex-framework/src/types/renderable.ts` owns the host-parameterized
  renderable model
- `packages/reflex-framework/src/operators/component.ts` and
  `packages/reflex-framework/src/operators/element.ts` own platform-agnostic
  renderable constructors

Important limitation:

- `reflex-framework` is not yet a full "application framework" in the product
  sense
- it is currently best described as a platform-agnostic UI core

Architectural rule:

- `reflex-framework` must not import `Node`, `Element`, `Document`, or any
  other host object types

### 5. `reflex-dom`

Purpose:

- first host implementation
- DOM renderer
- DOM-specific intrinsic typing
- DOM props/events/refs/styles
- DOM mount/reconcile logic
- ownership-based lifecycle for DOM subtrees

Verified now:

- `packages/reflex-dom/src/jsx-runtime.ts` supplies DOM-specific
  `JSX.IntrinsicElements`
- `packages/reflex-dom/src/types/intrinsics.ts` defines DOM-specific props and
  intrinsic tag typing
- `packages/reflex-dom/src/runtime/renderer.ts` creates DOM renderers
- `packages/reflex-dom/src/render.ts` mounts roots and owns root disposal
- `packages/reflex-dom/src/mount/*` translates renderables into DOM operations
- `packages/reflex-dom/src/ownership/*` owns subtree lifecycle and cleanup

Architectural rule:

- `reflex-dom` is the first host implementation
- it must not become the hidden center of the whole UI model

## Package Map

| Layer | Package | Current Role |
| --- | --- | --- |
| Core | `@reflex/core` | graph ownership and primitive mechanisms |
| Runtime | `@reflex/runtime` | deterministic reactive execution engine |
| Facade | `@volynets/reflex` | public application-facing reactive API |
| UI core | `reflex-framework` | platform-agnostic JSX runtime and renderable model |
| Host | `reflex-dom` | DOM renderer, DOM typing, DOM lifecycle/materialization |

## The Main Architectural Boundary

The most important boundary in the repository is not between runtime and DOM.
It is between:

- platform-agnostic UI meaning
- host-specific materialization

That boundary determines:

- where JSX runtime lives
- where lifecycle primitives belong
- where typing belongs
- whether new hosts can be added later without rewriting the UI model

This boundary is currently enforced by the following split.

### Platform-agnostic UI meaning belongs in `reflex-framework`

This includes:

- `Fragment`
- `jsx`, `jsxs`, `jsxDEV`
- abstract element renderables
- abstract component renderables
- host-parameterized `JSXRenderable`
- host-agnostic attribute and cleanup primitives

### DOM materialization belongs in `reflex-dom`

This includes:

- `HTMLElement` and `SVGElement` typing
- intrinsic DOM tags and props
- event listener attachment
- namespace resolution
- DOM node creation and insertion
- style and attribute application
- DOM-specific refs
- DOM subtree reconciliation

## JSX and Typing Boundary

This is one of the most sensitive parts of the system.

### Verified now

The runtime and typing halves of JSX are intentionally split:

- runtime lives in `reflex-framework`
- DOM-specific intrinsic typing lives in `reflex-dom`

Concretely:

- `packages/reflex-framework/src/runtime/jsx.ts` implements the runtime
- `packages/reflex-dom/src/jsx-runtime.ts` re-exports runtime symbols from
  `reflex-framework/jsx-runtime`
- `packages/reflex-dom/src/jsx-runtime.ts` also declares DOM-specific
  `JSX.IntrinsicElements`

This gives the repository the desired package-level strategy:

- the JSX factory is platform-agnostic
- the intrinsic typing is host-scoped

### Why this matters

If the JSX runtime lives in the DOM package, the entire UI model becomes
implicitly DOM-shaped.

If intrinsic typing lives in the framework package, the framework starts
accumulating host knowledge that should remain outside it.

The current split is intentionally designed to avoid both failures.

### Rule

`JSX.IntrinsicElements` belongs to the host package.

The JSX factory does not.

## Renderable Model

### Verified now

`packages/reflex-framework/src/types/renderable.ts` defines a host-parameterized
renderable model:

- primitives
- iterable children
- accessors
- renderable records
- host nodes via generic parameter

`packages/reflex-dom/src/types/renderable.ts` then specializes that model for
DOM by setting the host type to `Node`.

This means the framework layer understands "renderable", but does not define
that a renderable host object must be a DOM node.

### Rule

Renderable semantics belong to the UI core.

Host-node identity belongs to the renderer.

## DOM Render Pipeline

### Verified now

The DOM render path is:

1. `render()` or `mount()` in `packages/reflex-dom/src/runtime/singleton.ts`
2. renderer creation in `packages/reflex-dom/src/runtime/renderer.ts`
3. root replacement and scope creation in `packages/reflex-dom/src/render.ts`
4. renderable dispatch in `packages/reflex-dom/src/mount/append.ts`
5. host-specific materialization in `packages/reflex-dom/src/mount/*` and
   `packages/reflex-dom/src/host/*`

### Dispatch responsibilities

`packages/reflex-dom/src/mount/append.ts` routes values by shape:

- arrays and iterables are flattened
- raw DOM `Node` values are appended directly
- accessors become dynamic slots
- abstract element renderables become DOM elements
- abstract component renderables mount through a child scope
- `Show`, `Switch`, and `For` become structural dynamic regions
- text values become text nodes

### Why this matters

The DOM renderer consumes an abstract renderable tree and turns it into a DOM
tree.

That is the exact separation the repository wants to preserve when other hosts
eventually appear.

## Ownership and Lifecycle

### Verified now

`reflex-dom` does not treat lifecycle as an emergent side effect of DOM
mounting.

Instead, it uses an explicit ownership tree documented in:

- `packages/reflex-dom/src/ownership/Readme.md`

And implemented in:

- `packages/reflex-dom/src/ownership/*`

The key properties are:

- deterministic subtree disposal
- child-before-parent cleanup
- owned effects bound to scopes
- replaceable branches backed by scopes
- cleanup registration for events, refs, and dynamic slots

### Root lifecycle

`packages/reflex-dom/src/render.ts` does the following for each root render:

1. ensure the reactive runtime exists
2. find an existing mounted root scope on the container
3. dispose the previous scope if one exists
4. create a new scope
5. clear the container
6. mount the new tree inside that scope
7. store the new scope on the container

### Subtree lifecycle

Component mounting allocates child scopes in
`packages/reflex-dom/src/mount/component.ts`.

Dynamic regions allocate slot-backed subtree scopes in
`packages/reflex-dom/src/structure/content-slot.ts` and
`packages/reflex-dom/src/mount/reactive-slot.ts`.

### Rule

Lifecycle belongs to ownership, not to the host tree itself.

The DOM tree answers "what is mounted".

The ownership tree answers "what must be cleaned up if this subtree disappears".

## Context Boundary

### Verified now

UI context currently lives in `reflex-dom` ownership code:

- `packages/reflex-dom/src/ownership/ownership.context.ts`

This means context is still coupled to the DOM-side ownership subsystem today.

### Direction

Whether context should stay there or move upward depends on how universal the
component lifecycle and ownership APIs become.

The rule is simple:

- if a context primitive does not require host objects, it belongs in the UI
  core
- if it depends on a host-specific lifecycle surface, it belongs in the host

At the moment, this remains an area of active architectural movement rather
than a finished boundary.

## Hooks Policy

This repository should treat hooks and primitives as the main leak channel
through which host knowledge can accidentally infect the UI core.

### Hard rule

Any primitive that does not require host objects belongs to core.

### In practice

Belongs in core:

- signal-like state primitives
- derived/computed primitives
- effect primitives that only require ownership/reactivity
- platform-agnostic context lookups
- cleanup registration primitives that do not require host objects

Belongs in a host package:

- element refs
- DOM event helpers
- layout measurement helpers
- focus helpers
- resize/mutation observers
- anything that requires `Node`, `Element`, or `Document`

### Verified now

The repository is not fully migrated to this rule yet.

However, the rule is the intended architectural guardrail and should be used to
evaluate every new primitive.

## Renderer Contract

### Verified now

There is not yet a single formal standalone "renderer contract" package.

The current effective contract is embodied by:

- framework renderables
- renderer consumption of those renderables
- host-specific mount and patch operations inside `reflex-dom`

### Direction

When formalized, the renderer contract should satisfy three constraints:

1. It must be implementable by `reflex-dom`.
2. It must not import DOM types.
3. It must not overfit hypothetical future hosts.

### Anti-goals

The contract must not become:

- a renamed DOM API
- an over-generalized academic abstraction that slows down actual renderer work

### Working principle

It should be:

- abstract enough to decouple
- concrete enough to implement

## Architectural Invariants

These invariants should remain true as the repository evolves.

1. `@reflex/core` contains no renderer or host concepts.
2. `@reflex/runtime` owns execution semantics, not rendering semantics.
3. `@volynets/reflex` remains a public facade, not a second hidden runtime.
4. `reflex-framework` must not import host object types.
5. `reflex-dom` may depend on `reflex-framework`, but not the other way around.
6. JSX runtime is platform-agnostic.
7. Intrinsic element typing is host-specific.
8. Lifecycle is anchored in ownership, not raw host mount state.
9. Any primitive that does not require host objects belongs to core.
10. DOM is the first host implementation, not the center of the whole model.

## Current Migration State

### Already completed

- JSX runtime moved to `reflex-framework`
- platform-agnostic renderable primitives moved to `reflex-framework`
- `reflex-dom` now re-exports framework JSX runtime while keeping DOM intrinsic
  typing
- `reflex-dom` consumes framework renderable symbols and types

### Still host-local today

- ownership subsystem for UI lifecycle
- UI context implementation
- DOM renderer implementation
- structural operators as used by the DOM renderer
- dynamic slot and DOM subtree replacement

### Not yet formalized

- a dedicated standalone renderer-contract layer
- a second non-DOM host
- final placement of all UI lifecycle and context primitives

## How To Decide Where New Code Goes

When adding a new abstraction, ask these questions in order.

### 1. Does it require host objects?

If yes:

- it does not belong in `reflex-framework`

If no:

- it is a candidate for `reflex-framework` or a lower layer

### 2. Does it define execution semantics or rendering semantics?

If execution semantics:

- it belongs lower, usually in `@reflex/runtime` or facade APIs built on top of
  it

If rendering semantics:

- it belongs in the UI stack

### 3. Is it host-agnostic UI meaning or host-specific materialization?

If host-agnostic:

- it belongs in `reflex-framework`

If host-specific:

- it belongs in `reflex-dom` or a future host package

### 4. Does it need intrinsic typing for a host language surface?

If yes:

- keep that typing in the host package

## Repository Positioning

This repository should be described carefully.

### Good description

Reflex is a deterministic reactive substrate with an emerging layered UI
architecture:

- reactive core
- reactive runtime
- public facade
- platform-agnostic UI core
- DOM host renderer

### Bad description

"A finished batteries-included framework"

That phrasing would create product expectations that the current repository does
not yet claim to satisfy.

The right framing is:

- strong runtime foundation
- explicit UI architecture
- first host implementation already working
- framework-like direction without pretending every expected framework concern
  is complete today

## Verification Notes

This document was verified against the current repository structure and the
following concrete code paths:

- `packages/@reflex/core/src/index.ts`
- `packages/@reflex/runtime/src/index.ts`
- `packages/reflex/src/index.ts`
- `packages/reflex-framework/src/index.ts`
- `packages/reflex-framework/src/runtime/jsx.ts`
- `packages/reflex-dom/src/jsx-runtime.ts`
- `packages/reflex-dom/src/runtime/renderer.ts`
- `packages/reflex-dom/src/render.ts`
- `packages/reflex-dom/src/mount/append.ts`
- `packages/reflex-dom/src/ownership/Readme.md`

It intentionally distinguishes implemented architecture from migration
direction, because both matter and confusing them would make the document less
useful.
