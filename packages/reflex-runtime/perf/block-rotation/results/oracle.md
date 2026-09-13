# Offline oracle: explicit pointer-write objective

This is an exact oracle within the action model in oracle.json, not a wall-time or general tracking optimum. A and W are minimized independently. Immediate eager detach is counterfactual, not the historical 32-edge policy. Preserving old edges can minimize W while still losing wall time on replacement: S and branch costs are absent from this objective.

Cases: 162; independent brute-force cross-checks: 33.

| Trace | Oracle min W | Preserve/move W regret | Preserve/rotate W regret | Eager/move W regret | Eager/rotate W regret |
| --- | ---: | ---: | ---: | ---: | ---: |
| alternating | 34 | 36 | 0 | 107 | 107 |
| insert-front | 21 | 0 | 0 | 131 | 131 |
| local-swap | 16 | 0 | 6 | 0 | 6 |
| omit-first | 23 | 36 | 0 | 36 | 0 |
| cyclic-left1 | 16 | 36 | 0 | 36 | 0 |
| cyclic-left2 | 16 | 30 | 0 | 30 | 0 |
| cyclic-right1 | 16 | 0 | 0 | 0 | 0 |
| replacement | 140 | 0 | 0 | 1 | 1 |
| new-burst-then-reuse | 54 | 0 | 0 | 131 | 131 |

The local-swap and omit-first pair starts from the same old order and requests the same first mismatching source; only future reads differ. A gap-only policy cannot select the W-optimal action for both. A single action count is not used as a substitute for pointer writes.
