# Compiled Store Transform Contract

The [package specification](../../SPECIFICATION.md) is normative. This document
describes the current compiler frontend and lowering.

## Recognition and shape

- Direct top-level variable declarations initialized by named createStore imports,
  including aliases, from supported store modules.
- Low-level compileStore accepts bare calls; Vite gates them with
  compileBareCreateStore.
- Binding identity is the SWC resolved identifier/context pair. A shadowed name
  is not the imported factory or the outer store.
- Literal closed shape with unique static data properties and nested branches.
  Initializers evaluate once in source order; empty branches survive.
- Spread, shorthand, methods/accessors, duplicate/computed keys, **proto** and
  reserved root lifecycle keys are errors.
- Nested/export-wrapped declarations and factory escapes are phase-1 errors.

Internal path keys preserve segment boundaries. Generated identifiers are
allocated against source identifiers and previously allocated names. Colliding
path spellings or multiple stores cannot share cells accidentally.

## Default lowering

The compiler imports createModel from @volynets/reflex and createStoreCell from
@volynets/reflex-store. A cell retains raw state without a producer until a
tracked read. Writes to cold cells remain cold.

Each leaf has a cell reader and an action writer. The writer commits a value and
returns the assignment result. The default model owns cell disposal through
ctx.onDispose. Its validated namespace is separate from the public getter/setter
façade, so dev validation does not evaluate plain leaf values as model members.
The façade exposes dispose().

Supported top-level expressions lower directly to cell reads/actions, with no
Proxy or runtime path lookup. The façade preserves compatible accesses inside
functions/control flow that are not directly lowered. It has not been eliminated
through escape analysis.

Custom lowering targets can override model/signal exports, imports, action method
and generated identifiers. signal.runtimeModule optionally separates the signal
import from the model import. Custom runtime targets retain their original
signal export defaults; they own their materialization/lifecycle semantics.

## Operators and order

Supported operations are static dot reads, =, +=, -=, ++ and --.

Compound assignment reads the old value BEFORE evaluating the RHS:

```ts
const previous = read();
const rhs = evaluateRhs();
const next = previous + rhs;
write(next);
return next;
```

This order matters when the RHS writes the same leaf or throws. RHS executes
once, and the outer write occurs only on successful evaluation.

Updates apply a native operator to a local temporary:

```ts
let value = read();
const result = value++; // or ++value / value-- / --value
write(value);
return result;
```

This preserves ToNumeric, strings, BigInt, NaN and coercion exceptions.
Replacing ++ with + 1 is incorrect.

Suspending compound assignments (await/yield in RHS) are diagnosed because the
synchronous IIFE lowering cannot preserve their continuation semantics.

## Diagnostics

Dynamic/computed access, branch alias declarations, store-root escapes,
reflection/destructuring, deletion, branch/root/unknown-member writes,
unsupported assignment operators and optional chains on store values are errors.
Unrelated optional chains and shadowed bindings are unaffected.

With onDiagnostic: "collect", code is returned unchanged together with
diagnostics. This is not a runtime fallback and must not erase imports or
partially lower a rejected program.

## Conformance

compiler.differential.test.ts compares transformed code with ordinary
JavaScript, including generated operation sequences, RHS side effects, coercion,
errors, collisions and aliases. vite-user-dx.test.ts exercises actual plugin
loading. Both production-style and **DEV** runtime configurations are tested.
