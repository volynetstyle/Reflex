# @volynets/reflex-framework

## 0.2.1

### Patch Changes

- 03f4f9b: Internal peer dependencies now follow the released versions: the published floor is the workspace version at release time (`@volynets/reflex-runtime@^1.1.0`).

## 0.2.0

### Minor Changes

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

- 1593ec2: Add lazy owner lifetime AbortSignals through getLifetimeSignal, useAbortSignal,
  LifecycleScope.signal, and ModelContext.signal. Add live DOMRangeHandle refs to
  DOM Show and For, including hydration, focus, geometry, scrolling and automatic
  observer membership cleanup.
