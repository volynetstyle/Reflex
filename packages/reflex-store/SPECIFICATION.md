# Reflex Store Specification

**Status:** Reviewed draft; phase-1 conformance contract  
**Package:** @volynets/reflex-store  
**Revision:** 2026-10-07  
**Scope:** framework-independent structured state over Reflex

This revision separates requirements implemented by the current package from
future extensions. MUST describes the phase-1 contract unless a section is
explicitly labelled **Future**. SHOULD describes a design target, not an
unmeasured performance guarantee. Examples labelled conceptual are not exports.

## 1. Architecture and responsibility

Store owns structural locations, collections, equality boundaries, projections,
snapshots, compiler lowering and retention policy. Runtime owns nodes, links,
dirty state, pull validation and graph disposal primitives. Effect delivery
belongs to the Reflex host/scheduler; a runtime batch boundary alone does not
choose a scheduler.

Runtime store entry points MUST depend only on framework-independent reactive
primitives. They MUST NOT import reflex-dom or access window/document.
Compiler/Vite entry points may depend on SWC/Vite; generated default code uses
createModel from @volynets/reflex and createStoreCell from this package.

**Kernel constraint:** store lifecycle MUST NOT add hooks, metadata, counters,
allocation, polling or conditional checks to runtime read/write/link/unlink hot
paths. This implementation makes no runtime changes. Reclamation is explicit
owner work, described in section 8.

The existing headless createModel API in @volynets/reflex can own store resources
through ctx.onDispose and group writes with ctx.action.

**Future:** moving the richer defineModel / ctx.read API out of reflex-dom.
The current package does not export defineModel or claim that the existing DOM
model has already been migrated. It must eventually use a host adapter rather
than importing DOM context into store.

## 2. State families and implemented API

| Family                   | API                                                   | Contract                                                                          |
| ------------------------ | ----------------------------------------------------- | --------------------------------------------------------------------------------- |
| Closed static state      | createStore + compiler/Vite transform                 | Fixed literal shape; direct leaf addresses and accessor façade                    |
| Dynamic keyed state      | createReactiveMap                                     | Runtime keys; separate value, membership, key iteration, value iteration and size |
| Semantic selection       | createSelector                                        | Boolean observations per semantic key; routes old/new keys                        |
| Keyed derived value      | createKeyedProjection / createProjection overload     | One active source key, not arbitrary entity lookup                                |
| Structured derived state | createStoreProjection / createProjection overload     | Read-only path view of a lazy derivation                                          |
| Mutation boundary        | transaction                                           | Synchronous nested runtime batching; no rollback                                  |
| Extraction               | raw / snapshot                                        | Untracked backing representation / point-in-time copy                             |
| Ownership                | collectStore / disposeStore; accessor.collect/dispose | Explicit collection and terminal disposal                                         |
| Depth                    | deep / shallow / ref / opaque                         | Explicit boundaries for projection values                                         |
| Compiler primitive       | createStoreCell                                       | Callable leaf with set/collect/dispose; no producer before tracked read           |

createStore is compile-only. Executing its source stub MUST throw.
createReactiveMap is a separate runtime abstraction; dynamic keys MUST NOT be
silently accepted by the closed-shape compiler.

**Future:** ReactiveSet, hydration, general lazyState, sparse draft write sets,
host-independent defineModel, configurable cache retention and façade erasure.
These are not required for phase-1 conformance.

## 3. Semantic locations and granularity

A location is (owner, path or key, access class). Required distinctions:

| Observation          | Meaning                        | Relevant changes                                |
| -------------------- | ------------------------------ | ----------------------------------------------- |
| Value(path)          | Primitive/reference leaf value | Unequal leaf value                              |
| Exists(path)         | JavaScript "key in object"     | Membership, including inherited membership      |
| Keys(path)           | Own keys/order                 | Own key insertion, removal, reordering          |
| Enumerable(path,key) | Descriptor enumerability       | Appearance/disappearance/enumerability change   |
| Length(array)        | Array length                   | Length change                                   |
| Key(map,key)         | map.get(key)                   | Unequal value at that key                       |
| Has(map,key)         | map.has(key)                   | Membership at that key                          |
| Keys(map)            | Key iteration/order            | Insertion, deletion, clear                      |
| Iterate(map)         | Values/entries/forEach         | Unequal replacement, insertion, deletion, clear |
| Size(map)            | Number of entries              | Cardinality change                              |

Object.keys also observes enumerability. Replacing a value at an existing
enumerable key MUST NOT rerun an Object.keys consumer. Adding a missing key
whose value is undefined changes membership/keys but need not change a value
read that was already undefined.

A read of projection.user.name observes the leaf. Navigating projection.user
alone is a path-view operation, not an observation of raw object identity.
A retained branch view follows subsequent values at that path. To observe a
whole object by reference, use a ref/shallow boundary or an explicit derived
accessor.

For projections, upstream invalidation can conservatively reach path validators.
Unchanged path outputs MUST stop **consumer execution**. This is different from
promising zero dirty flags, queue entries, edge visits or validation work.

For directly addressed static leaves and map keys, unrelated writes MUST NOT
invalidate unrelated value/membership nodes.

Array iteration uses the length and indices actually read by JavaScript's
array methods/iterator. Array.isArray, sparse indices, length and standard
read-only methods MUST work. Arrays are not mutation APIs in projections.

## 4. Laziness and memoization

The four independent kinds of laziness are:

1. Initialization: ReactiveMap accepts an initializer function, invoked on the
   first operation requiring data, once after successful initialization.
   Projection callbacks and seed cloning begin at the first read.
2. Node materialization: static cells and Map locations allocate producers only
   for tracked reads. Untracked random-key lookups MUST NOT accumulate key nodes.
   Projection primitive path validators materialize only for tracked reads.
   A shared derivation may allocate its one memo when explicitly pulled.
3. Recomputation: dirty keyed/structured projections run on demand. Source writes
   alone MUST NOT execute an unobserved projection callback.
4. Suspension: owners call collect after removing consumers. Unobserved
   derivations release upstream links; later reads resume against current input.

A successful clean repeated derived read MUST reuse its memo. A failed
computation does not establish a successful cache entry. Collection may drop a
memo and cause the next read to recompute.

createSelector is an intentional exception to fully lazy derivation: while
observed, one router watcher follows its source and updates only old/new
materialized key nodes. It does not project arbitrary expensive values. No
router is created for construction or cold untracked key reads.

All derivation callbacks MUST be synchronous. They SHOULD be pure except for
mutating the supplied projection draft. Skipped intermediate input generations
are not replayed. A draft starts from the last successfully committed projected
state. Per-event side effects belong in actions/effects, not a projection.

## 5. Equality and key semantics

Default value equality is Object.is. Comparators run untracked and MUST be pure
equivalence relations. When an equality boundary reports equivalence, the
previous published representative is retained.

- createSelector.options.equals compares semantic keys. Signed zero and NaN
  follow Object.is by default.
- createKeyedProjection.options.keyEquals compares source/query keys.
- createKeyedProjection.options.equals compares defined projected values.
  undefined represents absence; undefined transitions use Object.is.
- createStoreProjection.options.equals compares entire successfully produced
  states before publication. Default is Object.is.
- ReactiveMap.options.equals compares values of an existing key.
- ReactiveMap keys intentionally use native Map SameValueZero: +0 and -0 are
  the same key, NaN equals itself, and object keys use reference identity.

Custom selector key equality has linear lookup over retained key classes.
Identity lookup is expected O(1). These contracts MUST NOT be conflated.

Map values are reference boundaries. Mutating map.get(id).field in place is not
a reactive map write; replace the entry through set. Large immutable values and
foreign objects therefore do not acquire a deep graph accidentally.

## 6. Consistency, transactions and scheduling

After a write, direct reads MUST see current data. Dirty projections MUST
validate on read without requiring flush. flush controls effect delivery,
not freshness of state reads.

transaction(action) nests runtime batch boundaries. Individual Map mutations
are also batched so value/membership/iteration observers see coherent data.
The configured host must respect runtime batching for effect delivery.

- Observers run after an outer action under eager/batch-aware delivery, or at
  a later explicit/host flush.
- Explicit reads inside an action see writes made so far (read-your-writes).
  Transactionality is not snapshot isolation.
- On throw, completed writes remain committed, the boundary is closed in
  finally, and the exception is rethrown. There is no rollback.
- transaction is synchronous: a Promise does not extend the boundary beyond
  its synchronous call. Await-separated mutations require separate actions.
- Returning to an earlier value inside one batch may still require validation;
  a batch does not promise net-zero graph work.

Derived diamond graphs MUST not execute observers with mixed old/new inputs.
Dynamic branch changes MUST replace dependencies using the runtime's tracking
protocol. Exception/retry paths MUST preserve recovery.

Supported tested scheduler modes are flush, eager and sab. Timing can differ;
settled values and semantic observer traces must agree.

## 7. Identity, depth and extraction

Projection views are cached by semantic path and container kind. Repeated
access while a view is retained MUST return the same proxy. Replacing an object
with an array may create a different view. Different paths to the same raw
object may have different proxies; raw graph identity and path identity differ.
A retained view of a missing branch returns undefined for its missing leaves
and resumes when the branch reappears.

Only plain objects and arrays are structural by default. Date, typed arrays,
Map, class instances and other foreign values are reference boundaries.

Depth markers return the original object and record storage policy. Set policy
before publication; changing a marker on already published data is unsupported.

| Policy                    | Reactive view                                         | Projection draft copy       |
| ------------------------- | ----------------------------------------------------- | --------------------------- |
| deep (default plain data) | Descend into compatible children                      | Copy structural graph       |
| shallow                   | Observe immediate properties; children are references | Copy current container only |
| ref                       | Observe replacement by identity                       | Retain object reference     |
| opaque                    | External reference, never instrument recursively      | Retain object reference     |

Projection options.depth = "shallow" applies shallow viewing to the entire
projection. Mutating reference/opaque/foreign values inside a draft is not an
isolated draft mutation.

raw(value) MUST be untracked. For a projection it returns the current backing
subtree; for ReactiveMap it returns the backing native Map. Mutating raw bypasses
publication and is unsupported. raw is not a snapshot.

snapshot(value) MUST be untracked and create an independent, frozen copy of
plain structural data, including ref/shallow plain data. It preserves cycles,
shared plain references, symbols, enumerable flags and sparse arrays. Native
Maps are copied with key identity preserved, values copied, and public mutators
disabled. Snapshot types expose readonly containers.

Opaque values and foreign objects remain external references. Snapshot does not
promise JSON or structured-clone compatibility for arbitrary input. Cycles,
BigInt, symbols, functions, Map key identity and external resources need an
application serialization policy. The caller must supply host-resource
exclusion/encoding for persistence, SSR or worker transfer.

raw/snapshot apply to runtime projections/collections or ordinary data. The
phase-1 compiler rejects arbitrary store-root reflection/escape; extraction of
compiled state is expressed as an explicit object of leaf reads. A generated
façade is not claimed to be a raw backing object.

## 8. Ownership and reclamation without kernel hooks

The retention policy is **explicit owner collection**:

1. Stop effects/dispose owned computeds that no longer use a store.
2. Call selector.collect(), keyedProjection.collect(), map.collect(), or
   collectStore(projection).
3. Collect owned derived layers from downstream to upstream.
4. At terminal model disposal, call dispose/disposeStore for all owned resources.

Collection MUST preserve nodes that still have outgoing consumer links.
A memoized computed still linked to a store counts as a consumer even when no
terminal effect observes that computed. Dispose that computed before collection
if its owner no longer needs it. Store does not infer transitive application
liveness.

Collection removes dead location nodes, then suspends shared derivations.
No tracking pass, effect callback or comparator may collect/dispose the graph
currently being evaluated. Use a settled owner boundary.

Between collection boundaries, storage can reflect observations since the last
collection. After collection, retained reactive locations reflect live direct
consumers plus shared derivations. This is **not** automatic final-observer
notification or a claim of zero retention immediately after every detach.

Disposal is idempotent, detaches all owned links and is terminal. Future public
reads/mutations throw. Owners must stop downstream effects before disposing
their sources. A disposed source does not actively rerun downstream callbacks.

Compiled cells have a finite closed shape and no upstream subscriptions.
The default compiler registers their disposal with the generated model's
ctx.onDispose. Standalone createStoreCell also supports collect. Retaining a
compiled model may retain its previously observed cells until model disposal.

## 9. Compiled store contract

Compilation accepts direct top-level variable declarations initialized by a
named createStore import (including aliases) from supported store modules.
The low-level compiler also accepts bare declarations; Vite requires
compileBareCreateStore opt-in without an import.

Recognition MUST use SWC resolved binding identity (identifier plus syntax
context), not spelling. Shadowed local variables/functions are independent.
Factory escapes and nested/export-wrapped factory declarations are rejected in
phase 1 rather than erased incorrectly.

Shapes contain unique static data properties and nested literal branches.
Spread, shorthand, getters, setters, duplicate keys, computed keys, **proto**
and reserved root lifecycle members are diagnosed. Empty branches survive.
Initializer expressions evaluate once in source property order.

Supported leaf operations:

- reads through static dot paths;
- =, += and -=;
- prefix/postfix ++ and --.

The façade preserves compatible operations inside functions/control flow not
directly lowered. Directly lowered reads/writes use cell accessors/actions with
no Proxy or runtime path lookup. Custom lowering targets retain their declared
signal/model contracts; cold materialization is guaranteed by the default
createStoreCell target.

Unsupported dynamic/computed access, branch alias declarations, reflection,
destructuring, deletion, branch/root writes, unknown-member writes, optional
chaining on a store and unsupported assignment operators MUST be diagnosed.
Unrelated optional chains/reflection MUST NOT be rejected.
Compound assignments containing await/yield are rejected.

Diagnostic collection MUST return original code, without partial import
erasure or partially transformed stores. This is a diagnostic mode, not a
compatible runtime fallback.

## 10. Compiler equivalence and names

A store binding and a leaf path identify a location. Internal path keys must be
unambiguous (a property containing "." must not equal a nested path). Generated
names are allocated against all source identifiers and already generated names,
including multiple stores, imports, custom names and temporary variables.
Path mangling alone is insufficient.

Assignment/update lowering MUST preserve JavaScript semantics:

- read the old LHS value **before** evaluating compound-assignment RHS;
- evaluate RHS exactly once, including nested/reentrant writes;
- perform one outer write only after successful evaluation/coercion;
- return the assignment result;
- perform native ToNumeric for ++/--, including strings, BigInt, NaN and errors;
- preserve prefix/postfix result differences and exception ordering.

Using "old + 1" is not equivalent to JavaScript ++. A correct lowering applies a
native update operator to a local temporary, writes it back, and returns the
proper result.

**Future:** richer Store IR, broader lexical declaration support, proof-based
façade removal, source-level devtools identities and sparse projection writes.
Current conformance does not claim unrestricted JavaScript optimization.

## 11. Cost model and performance evidence

The target is necessary work, not a mathematically smallest graph:

| Operation                                | Phase-1 cost model                                         |
| ---------------------------------------- | ---------------------------------------------------------- |
| Direct static cell / identity Map lookup | Expected O(1) plus tracking                                |
| Map set/delete                           | Expected O(1) plus affected graph propagation              |
| Map clear                                | O(entries) plus affected propagation                       |
| Identity selector transition             | Expected O(1) routing plus old/new consumers               |
| Custom key equality                      | O(retained semantic keys) lookup                           |
| Clean projection path read               | O(path depth) navigation/validation; no derivation rerun   |
| Dirty projection                         | User derivation + structural cloning + demanded validators |
| Collection                               | O(retained observation nodes), explicit cold operation     |

A monolithic derivation can invalidate all its observed path validators.
Fully lazy projected equality may invalidate/schedule a wider frontier than
the previous eager watcher implementation. Equality cuts off user computation
during pull; it cannot promise to prevent a push before its output is known.
Metrics MUST report this tradeoff instead of presenting "zero effect runs" as
"zero reactive work".

Measure source writes, derivation and consumer executions, equality work,
dirty/scheduled nodes, visited edges, depth and semantic output changes
separately. If no outputs change, report absolute work rather than dividing
execution amplification by zero.

## 12. Conformance and reproducibility

Tests use real runtime primitives and schedulers. Differential oracles use
native Map, from-scratch plain derivations and untransformed JavaScript;
they MUST NOT reuse the implementation under test as their oracle.

| Suite                                | Coverage                                                                                     |
| ------------------------------------ | -------------------------------------------------------------------------------------------- |
| store-contract.test.ts               | Lazy reads, leaf/structural granularity, identity, depth, snapshots, ownership, transactions |
| store.integration.test.ts            | Headless model ownership, composed derivations, exception/retry and static cells             |
| compiler.differential.test.ts        | JS evaluation order/coercion, aliases, shadowing, names, diagnostics; 200 generated programs |
| runtime.differential.test.ts         | Native Map and pure projection/selector traces in flush/eager/sab; 1,050 generated scenarios |
| vite-user-dx.test.ts / task-board.\* | Actual Vite transformation and application behavior                                          |
| semantic-workloads.metrics.test.ts   | Lazy invalidation versus execution; bounded selector routing                                 |

The property suites use fixed seeds printed in source; fast-check reports seed,
path and minimized counterexample on failure. Tests compare state and observer
traces after every operation, not just final state.

Required commands from the repository root:

    pnpm --filter @volynets/reflex-store test
    pnpm --filter @volynets/reflex-store test:differential
    pnpm --filter @volynets/reflex-store test:integration
    pnpm --filter @volynets/reflex-store bench:metrics
    pnpm --filter @volynets/reflex-store typecheck
    pnpm --filter @volynets/reflex-store lint
    pnpm --filter @volynets/reflex-store build

## 13. Review of the original 44-section draft

The original direction is retained with these clarifications:

- Sections 3/6/9/36/37: minimum-graph and amplification statements are targets;
  invalidation, validation, recomputation and effect execution are distinct.
- Sections 7/19/29/32: suspension/reclamation is explicit owner policy, with no
  runtime lifecycle hook or hot-path overhead; batching does not own scheduling.
- Sections 10/15: Map key equality is SameValueZero, while semantic selectors
  default to Object.is. Map values are explicit reference boundaries.
- Sections 12/13/33: transaction visibility is defined for observers, direct
  reads and errors; no rollback or async transaction is implied.
- Sections 16–18/34: depth, proxy-path identity, raw and snapshot have concrete
  contracts; arbitrary snapshots are not promised to be serializable.
- Sections 20/39/40: defineModel migration and ReactiveSet remain future API
  work, distinct from currently usable headless createModel composition.
- Sections 22–27/38: resolved bindings, collision-free names and JS-equivalent
  operators are mandatory now; IR expansion and façade erasure remain future.
- Sections 30/31/35: full structural cloning, conservative derived invalidation,
  deferred sparse writes and deferred devtools metadata are stated explicitly.

No conformance claim includes the future features listed above.
