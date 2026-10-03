---
"@volynets/reflex-async": patch
---

Separate async source lifecycle, attempt authority, evaluation generations and
frontier collection. Validate copied, deduplicated attempt frontiers before
publication and recheck authority after upstream validation. Add an internal
evaluated-computed adapter for cached transitive frontiers, blocked generations
and source failures while preserving ordinary synchronous exception semantics.
Qualify the production implementation with the async semantics corpus, bounded
explorers and isolated mutants.
