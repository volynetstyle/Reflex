# Cross-runtime semantic contracts

Generated: 2026-09-22T09:44:42.034Z

| Contract | Reflex working tree | Reflex e87bb66 | alien-signals 3.2.1 | @solidjs/signals 2.0.0-rc.9 | @vue/reactivity 3.5.43 |
|---|---|---|---|---|---|
| same-value-suppression | pass | pass | pass | pass | pass |
| dynamic-dependency-cleanup | pass | pass | pass | pass | pass |
| diamond-single-settle | pass | pass | pass | pass | pass |
| public-batch-snapshot | pass | pass | pass | pass | unsupported |
| disposal-unlinks | pass | pass | pass | pass | pass |
| failure-retry | pass | pass | pass | pass | pass |
| bounded-reentrancy | pass | pass | unsupported | unsupported | unsupported |
| observer-order-determinism | pass | pass | pass | pass | pass |
| stale-branch-after-failure | pass | pass | pass | pass | pass |

`unsupported` is a capability result, not a benchmark failure. Inspect the JSON report for expected and observed traces.
