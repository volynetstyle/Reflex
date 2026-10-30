---
"@volynets/reflex-runtime": patch
---

Computations whose dependencies come back in a very different order on every run, while many other computations share the same dependencies, re-track much faster. When a computation's own dependency lookups show that order gives no hint where an edge is, the runtime marks each of its dependencies with the position of that dependency in the computation's list (in a slot every node already has) and finds every dependency for the rest of that run in one comparison; a new dependency of such a run is recognized without a search. About 2.5× faster on a benchmark of 64 computations over 64 shared signals in shuffled order, with every dependency edge kept rather than recreated. Behavior, dependency order and memory use are unchanged; computations whose dependencies keep their order never take this path.
