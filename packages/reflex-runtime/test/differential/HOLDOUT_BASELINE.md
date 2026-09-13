# Holdout qualification baseline

Recorded 2026-09-13 before the qualification corpus was changed in response to
any holdout result.

## Cohort policy

- Development mutants may guide corpus and generator work.
- Existing holdout mutants must not be rewritten to improve the score.
- Holdout results may guide general generator improvements, but no dedicated
  witness may be added to the development corpus solely to kill one survivor.
- New holdout mutants may be appended, with the pre-change result preserved.
- Historical faults are reported separately because their counterexamples are
  known after discovery.

## Initial result

| Metric                    | Value |
| ------------------------- | ----: |
| Holdout mutants           |     6 |
| Killed                    |     4 |
| Survived                  |     2 |
| Mutation score            | 66.7% |
| Median programs to kill   |     2 |
| p95 programs to kill      |     4 |
| Median operations to kill |    11 |
| p95 operations to kill    |    25 |

Killed without holdout-specific fixtures:

- producer-write-skips-version
- computed-change-keeps-version
- computed-validation-trusts-cache
- watcher-cleanup-runs-after-computation

Unexplained or uncovered survivors:

- watcher-dispose-skips-cleanup: unreached and uninfected. The development corpus
  does not dispose a watcher with an installed cleanup.
- failed-computed-increments-version: reached and infected, but the corrupted
  version does not reach an observation in the development corpus.

These survivors are retained intentionally. They identify a reachability gap and
a propagation/reveal gap for the next generator iteration.
