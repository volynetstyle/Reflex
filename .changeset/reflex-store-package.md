---
"@volynets/reflex-store": minor
"@volynets/reflex": minor
---

Extract selector, projection, and compiled-store APIs into the new
`@volynets/reflex-store` package. `@volynets/reflex/unstable` now keeps only the
non-store experimental APIs.

Add the phase-1 compiled-store compiler: `createStore({ ... })` now lowers to
runtime-backed model state with generated signal readers, model-action writers,
and diagnostics for unsupported phase-1 syntax. Add `@volynets/reflex-store/vite` for
using the compiler as a Vite transform plugin.
