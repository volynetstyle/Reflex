# Adversarial differential classification baseline

Recorded 2026-09-13 after extending failure recovery with causal action
permutations over dependency order, nested computeds, sibling watchers,
throwing cleanup, and throwing disposal.

## Result

| Metric                                              | Value |
| --------------------------------------------------- | ----: |
| Generated adversarial programs                      |   768 |
| Programs with a differential finding                |    22 |
| Unclassified findings                               |     0 |
| cleanup-before-validation-completes                 |     3 |
| lost-watcher-invalidation-after-validation-recovery |    19 |

## Active classes

### cleanup-before-validation-completes

Status: previously discovered active divergence.
Severity: high.
Boundary: watcher lifecycle / dependency validation.

A watcher cleanup runs although dependency validation throws before watcher
rerun should begin. This can prematurely release resources or execute other
irreversible teardown.

### lost-watcher-invalidation-after-validation-recovery

Status: newly discovered active divergence.
Severity: critical.
Boundary: watcher retry / cross-dependency invalidation.

A watcher has two computed dependencies. One dependency has already committed a
new version while validation of the other dependency throws. Once the throwing
dependency recovers, SpecRuntime preserves the pending sibling change and reruns
the watcher. Reflex performs no run. The external effect can remain stale
indefinitely until some unrelated future invalidation happens.

This is distinct from the historical validation-history-dependence regression:
that case retries while the failure remains active. This class loses a separate
pending change across a failure/recovery boundary.

Exact executable witnesses live in active-divergences.ts.

## Negative evidence

No additional divergence class was observed in this bound for:

- dual-failure error precedence;
- computed-only cross-dependency recovery;
- nested computed failure and value shielding;
- sibling watcher ordering;
- throwing cleanup retry;
- throwing cleanup during disposal.

These are bounded negative results, not proofs for arbitrary graphs or action
lengths.
