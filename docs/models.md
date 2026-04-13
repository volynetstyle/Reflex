# Models (Facade Contract)

This document defines the public contract for `createModel()` in
`@volynets/reflex`. It is intentionally strict: models provide an ownership
boundary and predictable lifecycle semantics, not a "maybe reactive" container.

## Overview

`createModel(factory)` returns a factory that produces disposable model
instances. Each instance:

- groups reactive accessors and mutation actions
- defines a strict lifecycle boundary
- owns resources registered through `ctx.onDispose()` or `own(ctx, value)`

## Model Shape Rules

The object returned from the model factory may contain only:

- readable reactive values (`signal()`, `computed()`, `memo()`, etc.)
- actions created with `ctx.action(...)`
- nested plain objects following the same rules

`effect()` values are forbidden inside model shapes. If a model needs effects,
create them outside the returned object and wire their disposal through
`ctx.onDispose()` or `own(ctx, value)`.

## Lifecycle

- Created when you call the factory returned by `createModel(...)`.
- Disposed via `model[Symbol.dispose]()`; disposal is idempotent.
- After the first disposal the model is permanently dead.
- Dead models are not reusable. Construct a new instance instead.

## Ownership Contract

- `own(ctx, value)` registers exactly one disposal callback under the model.
- Sharing the same resource across multiple models will dispose it multiple times.
- Passing an already-disposed resource is allowed but discouraged.
- Disposal order is LIFO (last registered cleanup runs first).
- Nested models can be owned: `own(ctx, createChildModel())` is valid.

## Action Semantics

- Actions can be nested.
- Actions participate in the current batch scope.
- If no batch is active, the outermost action opens one; nested actions reuse it.
- Actions run untracked.
- If an action throws, the error is rethrown and tracking/batch state is restored.
- Return values pass through unchanged.
- Actions are synchronous for reactive correctness. Async work runs outside the
  action's batch/untracked scope.

## Post-Dispose Behavior

- Actions always throw after disposal.
- During disposal, the model is already marked dead; actions invoked from cleanups
  throw the same as after disposal.
- Reads from previously returned accessors are outside the model contract: they
  may appear to work, but are not guaranteed to be valid or stable.

## Error Policy for Dispose

- All cleanups run in LIFO order.
- Cleanup errors are logged and do not prevent remaining cleanups from running.

## Visibility

- Anything returned from the model is public API.
- `own(ctx, value)` and `ctx.onDispose(...)` are lifecycle primitives, not public
  surface.
- Keep internal details private by not returning them, or document them explicitly.
