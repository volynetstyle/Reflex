# Bounded exhaustive baseline

Recorded 2026-09-13 from the first bounded language definition, before changing
the grammar in response to holdout results.

## Language

Every valid setup and action sequence is enumerated under these explicit bounds:

| Dimension           |       Bound |
| ------------------- | ----------: |
| Producers           |        1..2 |
| Computeds           |        0..1 |
| Watchers            |        0..1 |
| Actions after setup |        0..2 |
| Values              | false, true |
| Expression depth    |           2 |

Computed expressions include producer reads, canonical equality pairs, and
producer-read conditionals. Watchers read any available producer or computed and
may install no cleanup or a cleanup reading one producer. Actions include every
valid set, read, flush, and live-watcher dispose operation.

Node IDs are canonical by construction. For two-producer programs, alpha-renamed
p0/p1 variants are reduced to the lexicographically smaller serialization.
The runner does not claim reduction of every semantic equivalence or commuting
independent operation.

## Initial exhaustive result

| Metric                   |   Value |
| ------------------------ | ------: |
| Canonical programs       |  27,061 |
| Executed programs        |  27,061 |
| Executed operations      | 154,011 |
| Differential divergences |       0 |

This is exhaustive only for the language above. It is a bounded equivalence
result, not a proof for arbitrary Reflex programs.

## Holdout impact

Combining the unchanged development corpus with the bounded corpus changes the
holdout result from 4/6 to 5/6 without adding a survivor-specific witness.

The bounded corpus kills watcher-dispose-skips-cleanup. The remaining
failed-computed-increments-version mutant is reached and infects semantic state,
but the changed version is not propagated to an observation by this bounded
language. The survivor remains intentionally visible.
