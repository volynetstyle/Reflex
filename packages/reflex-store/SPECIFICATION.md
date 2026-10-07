# Reflex Store Specification

**Revision:** 2026-10-07  
**Scope:** compiled static state and runtime structured views/collections.

## Package boundary

The published package MUST declare no dependencies, peer dependencies or optional
dependencies. Runtime, host, scheduler, compiler and WASM assets MUST be included.
All runtime entrypoints MUST share the same kernel and host bindings.

The basic root exports createStore, derive, selector, reactiveMap, action,
snapshot, leaf, opaque and hydrate. Advanced projections, Set, lifecycle controls,
names and compiler primitives belong to /advanced. Headless host APIs belong to
/runtime; compiler and Vite entrypoints belong to /store and /vite.

Kernel read/write/link/unlink code MUST remain independent from store ownership,
names and compiler metadata. This package makes no kernel source changes.

## Static stores

createStore is compile-only and MUST throw if its source stub executes.
Declarations may appear at module scope or inside lexical function/block bodies.
Binding identity MUST distinguish aliases, shadowing and separate factory calls.
Loop-header declarations and arbitrary inline factories remain unsupported.

A literal object property defines a structural branch. Other accepted initial
values define leaves. leaf(value) forces one replaceable leaf. opaque(value)
retains an external resource/reference boundary. Marker aliases MUST resolve by
import binding identity.

Root methods become synchronous bound actions. Their this references to the
store are lowered to the same static locations; nested ordinary functions
retain their own this. Async/generator store methods are rejected.
Root getters become lazy disposable computeds. They MUST be pure, synchronous,
memoize clean reads and validate dependencies on pull. Store writes in getters
are rejected. Setters and nested methods/getters remain unsupported.

Static leaf reads/writes lower to callable cells and action writers. Data cells
create their producer only on the first tracked read. Initializers MUST run once
per declaration execution. Compound assignment and update lowering MUST preserve
JavaScript evaluation order, single RHS evaluation, ToNumeric and exceptions.

Dynamic root paths, branch aliases, structural replacement, delete, optional
chaining and general root reflection are diagnosed. Returning a facade from a
factory and snapshot/hydrate data intrinsics are supported escape boundaries.

Optional static name options label the store and its cells. Optional eraseFacade
may remove a facade only when every use lowers directly to declared data leaves.
Escapes, methods, getters and lifecycle references MUST keep it.

## Collections

ReactiveMap uses native SameValueZero keys and Object.is value equality by
default. get, has, size, key iteration and value iteration observe different
semantic locations. Replacing an existing value MUST not invalidate key-only
consumers. Untracked lookups MUST not allocate key observation producers.

ReactiveSet follows native Set membership, insertion order, deletion, clear,
iteration and forEach semantics. It uses keyed membership observations.
No-op add/delete operations MUST not notify consumers.

Collection values are reference boundaries. In-place mutation of an entity or
array is not a reactive publication. Optional initializers materialize backing
data lazily. Reads after terminal disposal MUST fail.

## Derivations and selectors

derive accepts a pure-return callback producing a plain object. Structured
projections use lazy Demand and semantic path observations; compatible plain
objects and arrays are traversed by default. Foreign/ref/opaque values retain
reference semantics. Returned structured views are read-only.

Selectors route old/new semantic keys with configurable equality and preserve
Object.is behavior for signed zero/NaN. Keyed projections represent the active
source key; they are not arbitrary entity lookup. ReactiveMap provides that lookup.

Advanced draft projections, clone/equality/depth controls and keyed projections
remain available. Clean reads MUST memoize and dirty reads MUST pull fresh data
without waiting for an effect flush. Equal projected results MUST cut off
downstream user computation.

## Actions and delivery

action runs the synchronous callback untracked within one scheduler and reactive
batch. Nested actions compose. The callback receiver, arguments and return value
MUST be preserved. Reads inside an action see writes so far. Completed writes
survive exceptions; all batch boundaries MUST close.

The active host controls flush/eager/SAB delivery. Runtime and scheduler batching
MUST compose so one logical multi-write action never publishes an intermediate
state to eager effects.

## Extraction, hydration and SSR

snapshot is untracked. Compiled stores expose statically generated data extraction
callbacks, including nested/empty branches and excluding methods/getters.
Plain snapshots MUST be independent and frozen, preserving cycles, shared
references, symbols, enumerable descriptors and sparse array structure.
Map and Set representations preserve key identity and disable public mutators.

Opaque/foreign values remain external references. No arbitrary JSON or
structured-clone guarantee is made. Applications define serialization policies
for cycles, BigInt, symbols, functions, external resources and Map/Set keys.

hydrate requires a complete compiled data schema. It MUST validate all structural
fields before writing: exact branch keys, required fields and own data-property
descriptors. Structural values MUST be cloned with shared references preserved.
All writes MUST occur in one logical batch. Field value types are checked by
TypeScript/application validation, not inferred from initial primitive values.

Each SSR request creates its own store factory instance. Snapshot/restore operate
on those instances and never require module-global application state.

## Ownership and diagnostic names

Maps, Sets, selectors, keyed projections, structured projection views and compiled
stores MUST implement Symbol.dispose and work with own(ctx, resource).
Disposal is terminal and idempotent. Compiled data reads/writes, getters, methods,
extraction and hydration MUST reject use after disposal. Collecting unused observations MUST preserve
nodes that still have outgoing consumer links. Owners stop consumers before
collection and collect derived layers from downstream to upstream.

Names are optional resource metadata exposed through getStoreName. Looking up a
name MUST not compute a lazy projection or create reactive observations. Names
MUST not add metadata or hooks to runtime kernel hot paths.

## Conformance evidence

Tests cover native collection differential behavior, compiler/JavaScript
differential behavior, all scheduler strategies, getter caching, coherent methods
and hydration, factory isolation, ownership and erasure safety.

The packed-install check MUST install only the local tarball in a clean offline
project, reject external package imports in JS/declarations, load WASM, validate
shared graph behavior and Vite integration, and typecheck a consumer without
skipLibCheck. Build-only tooling belongs in devDependencies.
