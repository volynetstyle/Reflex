---
"@volynets/reflex": major
"@volynets/reflex-async": patch
---

Keep `@volynets/reflex-runtime` external in the facade bundles and declare it as
a peer dependency again. The 2.0.x facade inlined its own runtime, so async,
store and DOM packages, which import the runtime directly, ran on a second
kernel: async sources did not observe signals created through the facade.
Install `@volynets/reflex-runtime` alongside `@volynets/reflex`.

Async proofs keep one obligation per source in direct capture and inherited
proofs alike, and the documented failure-witness contract now matches
validation: a caught failure's witness accepts that failure or a ready source,
and rejects pending, another failure or an unobserved disposal.
