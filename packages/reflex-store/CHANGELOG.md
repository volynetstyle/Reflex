# @volynets/reflex-store

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
