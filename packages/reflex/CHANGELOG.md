# @volynets/reflex

## 2.0.0

### Major Changes

- dac1ed3: Extract reactive async derivations into `@volynets/reflex-async`, including ESM
  and CommonJS builds, declarations, contract and property tests, mutation
  qualification, benchmarks and semantics labs. Import async APIs from the new
  package; `optimistic` and `transition` remain in `@volynets/reflex/unstable`.
  Keep the runtime external so async sources share the facade's reactive graph.

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

- 6096f73: Prepare the DOM renderer, framework ownership API, Reflex ranked effects, and
  the shared Vite plugin for publication.
  - expose ranked effects from the Reflex facade
  - add render-phase effects for layout-safe host updates
  - make ownership reactive helpers available from the main framework import
  - move DOM JSX reactive-props transform into the shared Vite plugin
  - simplify reflex-dom internals and remove the obsolete Vite peer dependency

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

- 4a78437: Extract selector, projection, and compiled-store APIs into the new
  `@volynets/reflex-store` package. `@volynets/reflex/unstable` now keeps only the
  non-store experimental APIs.

  Add the phase-1 compiled-store compiler: `createStore({ ... })` now lowers to
  runtime-backed model state with generated signal readers, model-action writers,
  and diagnostics for unsupported phase-1 syntax. Add `@volynets/reflex-store/vite` for
  using the compiler as a Vite transform plugin.

### Patch Changes

- 0eb3aa1: Align the Rollup output layout with published package exports, emit real `.cjs`
  entry points for CommonJS consumers, and make the public `reflex` type output
  self-contained so it no longer depends on `@reflex/runtime` declarations at
  install time.
- 082d4e3: Preserve supported package formats and shared runtime identity in clean workspace builds. Include development debug chunks, provide matching CJS declarations with shared ambient types, erase scheduler production flags, and finalize the portable MCP CLI. Fix extracted synchronous AsyncExecution read/commit callbacks while retaining stale-attempt and after-await protection.
- Updated dependencies [0eb3aa1]
- Updated dependencies [39587e9]
- Updated dependencies [082d4e3]
- Updated dependencies [c867d76]
  - @volynets/reflex-runtime@1.1.0
  - @volynets/reflex-scheduler@1.0.0
