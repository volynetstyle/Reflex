# Retained experimental evidence

This production reorganization retains the research at its existing tracked
paths. The checksum inventory records bytes, roles and SHA-256 for 207 tracked
files from `bench-results/`, `lab/`, `theory/` and runtime `perf/`. No ignored
or untracked local material is classified for removal.

```sh
node tooling/benchmarks/verify-research.mjs --manifest experiments/artifacts.manifest.json
```

| Evidence | Current location | Reason for retention |
| --- | --- | --- |
| Suffix preservation | `packages/reflex-runtime/perf/suffix-preservation/` | Stable edges retained, but physical mutations are D+2 and complete replacement regressed in both runs |
| Block rotation | `packages/reflex-runtime/perf/block-rotation/` | Seven invariants, isolated overlay, separate oracle and independent timing runs |
| Tracking factorial | `bench-results/tracking-tier-factorial/` and original scripts/configs | Main/interaction effects and mixed-churn specialization tradeoffs |
| Competitor comparisons | `packages/reflex/bench/competitors/`, tracked reports in `bench-results/` | Pinned public contracts, capability differences and negative outcomes |
| Literal/corrected Vue workloads | `lab/reactivity-bench/` | Pinned workload semantics and separate structural builds |
| Theory | `theory/` | Authored models; no demonstrated obsolete status |

The manifest's `inventoryCommit` is the starting repository snapshot. Original
measurement provenance may be incomplete; adapters mark unknown fields rather
than inventing source versions or hardware. Historical raw bytes and frozen
differential cohorts are unchanged. Further grammar/holdout research and the
Stellune case study are outside this implementation.

Future artifact removal requires executable-caller/public-contract/research-role
evidence and a verified restoration path. Age, file size or absence of an import
alone does not establish dead code. Heavy archival storage and Git history
rewrites are not prerequisites for the current few-MiB evidence set.
