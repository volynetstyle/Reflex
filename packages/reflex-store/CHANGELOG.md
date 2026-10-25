# @volynets/reflex-store

## 2.0.0

### Major Changes

- 72a60ca: Runtime integration contract. `@volynets/reflex-runtime/internal` adds semantic operations for sibling packages: `isTracking`, `isContextSettled`, `hasObservers`, `disposeNodeIfUnobserved`, `suspendConsumerIfUnobserved`, `hasPendingValidation`, `isWatcherDisposed`, `shouldRetryWatcherAfterFailure` and `invalidateWatcher`. Scheduler, Store, Framework, DOM, Async and Reflex use them instead of reading kernel registers, flags and edges.

  Breaking: `@volynets/reflex-store/runtime/internal` no longer re-exports `@volynets/reflex-runtime/internal`; it exports only `createStoreCell`. Import kernel operations from `@volynets/reflex-runtime/internal`. `DomainPort` no longer exposes `local`; use `port.peek()` for an untracked read of the delivered value.

### Patch Changes

- Updated dependencies [72a60ca]
- Updated dependencies [72a60ca]
  - @volynets/reflex-framework@1.0.0

## 1.0.1

### Patch Changes

- 03f4f9b: Internal peer dependencies now follow the released versions: the published floor is the workspace version at release time (`@volynets/reflex-runtime@^1.1.0`).

## 1.0.0

### Minor Changes

- 4a78437: Extract selector, projection, and compiled-store APIs into the new
  `@volynets/reflex-store` package. `@volynets/reflex/unstable` now keeps only the
  non-store experimental APIs.

  Add the phase-1 compiled-store compiler: `createStore({ ... })` now lowers to
  runtime-backed model state with generated signal readers, model-action writers,
  and diagnostics for unsupported phase-1 syntax. Add `@volynets/reflex-store/vite` for
  using the compiler as a Vite transform plugin.

- c867d76: Remove the host facade dependency and re-exports from Reflex Store. The runtime
  entrypoint now exposes only store cells, scopes and owned computed getters used
  by the compiler. Remove the unused runtime type facade. Use kernel batch
  boundaries directly, and keep application scheduling in consumer code.

  Validate the packed store with production and development runtime exports in a
  consumer that does not install the host facade package.

### Patch Changes

- c867d76: Release the current runtime internal API with the `Both`, `Unknown`, and `Changed`
  evidence flags required by store selectors. Require runtime `^1.0.1` in the store
  peer contract because the published runtime `1.0.0` lacks `Both` and `Unknown` in
  both production and development entrypoints.

  Check evidence flag values alongside runtime module identity in production and
  development ESM/CJS builds. Run the packed runtime/store consumer in both Node
  export conditions with explicit named imports and evidence flag assertions.

- Updated dependencies [6096f73]
- Updated dependencies [39587e9]
- Updated dependencies [1593ec2]
  - @volynets/reflex-framework@0.2.0
