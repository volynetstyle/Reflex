# @volynets/reflex-async

## 0.2.1

### Patch Changes

- 03f4f9b: Internal peer dependencies now follow the released versions: the published floor is the workspace version at release time (`@volynets/reflex-runtime@^1.1.0`).

## 0.2.0

### Minor Changes

- f43782b: Add an unstable async derivation experiment with separate commits and cancelable
  attempts, fresh and committed reads, dependency blocking, latest-attempt
  publication, ownership signals and awaitable resolution. Add explicit optimistic
  transition scopes for async continuations and restore base dependencies after
  equal-value optimistic cleanup. Build package entries together so the root and
  unstable subpaths share runtime state.

  Name the lossy committed-value projection `currentOrUndefined`, use commit
  records for execution decisions, surface protocol violations separately from
  data errors, and cache pending blockers per source revision. Validate the
  existing state model with exhaustive bounded scenarios.

  Add shrinking differential histories, diamond and dependency-removal contracts,
  and isolated mutation qualification for the async implementation and reference
  oracle. Correct inference for optimistic function derivations and their options.

- 39587e9: Add isolated execution domains (Release A) and opt-in domain ports
  (Release B).
  - Runtime: `createExecutionDomain` with `run`, `batch`, `flush`,
    safe-point `teardown` and two-phase `close`. `configureRuntimeContext` no
    longer clobbers live execution registers, the tracking epoch is one
    kernel-wide clock, and DEV diagnostic phases are kept per context. Node
    and edge shapes and kernel hot paths are unchanged.
  - Scheduler: `createSchedulerDomain` binds one scheduler to one domain.
  - Framework: owner trees bind to a domain (`OwnerContext.domain`);
    `runManaged`, `bindManaged` and `createManagedRoot`; owned effects run and
    clean up in their owner's domain with two-phase disposal; owned values
    with borrow, `lease` and `transfer` rules; versioned snapshot ports
    (`createPort`).
  - DOM: every renderer runtime is an execution domain; closing it cancels
    pending microtask work.
  - Async: sources capture their domain; closing it revokes commit authority.
  - Reflex: `createRuntime()` is backed by a scheduler domain and exposes it as
    `runtime.domain`. The global `batch` now enters that runtime's domain.

  Migration: existing raw APIs keep their signatures. Code that called
  `configureRuntimeContext` inside a computation now keeps its tracking (this
  was a bug). Code that relied on the global `batch` running under another
  runtime's context now runs in the latest created runtime's domain.

- dac1ed3: Extract reactive async derivations into `@volynets/reflex-async`, including ESM
  and CommonJS builds, declarations, contract and property tests, mutation
  qualification, benchmarks and semantics labs. Import async APIs from the new
  package; `optimistic` and `transition` remain in `@volynets/reflex/unstable`.
  Keep the runtime external so async sources share the facade's reactive graph.

### Patch Changes

- f43782b: Separate async source lifecycle, attempt authority, evaluation generations and
  frontier collection. Validate copied, deduplicated attempt frontiers before
  publication and recheck authority after upstream validation. Add an internal
  evaluated-computed adapter for cached transitive frontiers, blocked generations
  and source failures while preserving ordinary synchronous exception semantics.
  Qualify the production implementation with the async semantics corpus, bounded
  explorers and isolated mutants.
- f43782b: Reduce async derivation validation allocations without changing the fresh-read,
  cancellation, publication or execution-capture contracts. Reuse callbacks and
  avoid a redundant context wrapper for clean committed reads in their owning
  runtime, while preserving upstream pulls and watcher/batch checkpoints.

  Add production ESM before/after benchmarks and regression checks for upstream
  capture order, upstream invalidation before cached reads and stale execution
  handles. Preserve all seven mutation witnesses.

- 082d4e3: Preserve supported package formats and shared runtime identity in clean workspace builds. Include development debug chunks, provide matching CJS declarations with shared ambient types, erase scheduler production flags, and finalize the portable MCP CLI. Fix extracted synchronous AsyncExecution read/commit callbacks while retaining stale-attempt and after-await protection.
- a26438b: Keep `@volynets/reflex-runtime` external in the facade bundles and declare it as
  a peer dependency again. The 2.0.x facade inlined its own runtime, so async,
  store and DOM packages, which import the runtime directly, ran on a second
  kernel: async sources did not observe signals created through the facade.
  Install `@volynets/reflex-runtime` alongside `@volynets/reflex`.

  Async proofs keep one obligation per source in direct capture and inherited
  proofs alike, and the documented failure-witness contract now matches
  validation: a caught failure's witness accepts that failure or a ready source,
  and rejects pending, another failure or an unobserved disposal.
