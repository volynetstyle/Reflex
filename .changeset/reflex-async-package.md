---
"@volynets/reflex": major
"@volynets/reflex-async": minor
---

Extract reactive async derivations into `@volynets/reflex-async`, including ESM
and CommonJS builds, declarations, contract and property tests, mutation
qualification, benchmarks and semantics labs. Import async APIs from the new
package; `optimistic` and `transition` remain in `@volynets/reflex/unstable`.
Keep the runtime external so async sources share the facade's reactive graph.
