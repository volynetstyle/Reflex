---
"@volynets/reflex-runtime": patch
"@volynets/reflex-store": patch
---

Release the current runtime internal API with the `Both`, `Unknown`, and `Changed`
evidence flags required by store selectors. Require runtime `^1.0.1` in the store
peer contract because the published runtime `1.0.0` lacks `Both` and `Unknown` in
both production and development entrypoints.

Check evidence flag values alongside runtime module identity in production and
development ESM/CJS builds. Run the packed runtime/store consumer in both Node
export conditions with explicit named imports and evidence flag assertions.
