# Benchmark tooling and retained research

Production checks use the stable suites beside their packages. The implementations
of collection, comparison, quality gates, history and protocol migration live here.
The four original TypeScript scripts remain compatibility entry points.

## Commands

```sh
node tooling/benchmarks/collect.mjs
node tooling/benchmarks/compare.mjs --base base.json --head head.json --fail
node tooling/benchmarks/adapt.mjs --input historical.json --suite experiment-id --output .cache/adapted-report.json
node --test tooling/benchmarks/benchmarks.test.mjs
node tooling/benchmarks/verify-research.mjs --manifest experiments/artifacts.manifest.json
```

Collection creates a new `.cache/benchmarks/<timestamp-uuid>/` with raw bytes,
normalized data, envelope and transitive protocol manifest. Explicit `--run-dir`
must also be a fresh directory. `--out` writes an additional immutable envelope.
Existing result files are never overwritten. To adapt an existing raw Vitest file,
use `collect.mjs --skip-run --raw file.json`; original environment/source remain
unknown instead of being attributed to the machine performing the adaptation.

The runtime validator in `schema.mjs` additionally validates raw/normalized data
and duplicate IDs; `envelope.schema.json` describes the transport envelope.
Legacy adapters preserve original JSON bytes by checksum and mark provenance
partial. Schema validity does not establish observable-result correctness.

Strict comparison requires matching suite, symmetric scenario sets, environment,
work counters, available tail metrics and, for envelopes, protocol/build/sample
definitions. Missing baselines fail. `--summary-only` explicitly requests no
comparison; `--diagnostic` explicitly allows non-gating work/environment diagnosis.
Neither mode can be combined with `--fail`. Single-run comparison is descriptive,
not a confidence claim.

## Process-pair gate

The existing gate flags are retained. A B1/H1/H2/B2 run is **screening-only**:
the paired median and RME/MAD detect coarse shifts but two pairs cannot establish
a confidence interval. Millions of in-process samples do not increase independent
replications.

An independently collected, fixed-budget series can use `--pair-design independent
--min-replicates 20 --require-inference`. Independence and balanced AB/BA order
must be established by the runner before supplying that declaration; this command
cannot infer independence from raw Vitest JSON. The estimator is the median
paired process log-ratio. Exact binomial order-statistic intervals and Bonferroni
tails provide simultaneous coverage for the fixed scenario family, assuming
independent, exchangeable pairs. No normality assumption or bootstrap precision
is manufactured from correlated iterations. If a finite interval is unavailable
or crosses the regression budget, required inference fails as inconclusive.

A large unexplained speedup requires semantic/work validation. Failed schema,
changed workloads, unstable measurement, suspicious shift and regression remain
separate reasons. No automatic retry-until-green or outlier removal is provided.
The current production refactor does not run a new controlled 20-pair campaign.

Repeated measurements and effect-size intervals should respect variance at the
build, process and iteration levels; see [Kalibera and Jones, Rigorous Benchmarking
in Reasonable Time](https://kar.kent.ac.uk/33611/).

## Protocol closure and deliberate migration

```sh
node tooling/benchmarks/protocol.mjs --root . --entries packages/reflex-runtime/test/perf/runtime-taxonomy.bench.ts,packages/reflex-runtime/vite.config.ts --json .cache/protocol.json
node tooling/benchmarks/protocol.mjs --base-root base --head-root head --entries entry.ts,config.ts
node tooling/benchmarks/migrate-protocol.mjs --base-root base --head-root head --entries entry.ts,config.ts --config-evidence config-equivalence.json --json protocol-migration.json
```

Install both isolated checkouts first. The TypeScript compiler resolves static
relative imports, aliases and tsconfig chains. Dynamic imports need explicit
pinning and unresolved local imports fail. `packages/*/{src,build,dist}/` are
subject implementations, excluded from the workload hash and never copied.
External package specifiers are recorded; provider versions are independently
checked by the CI runner. Unknown boundaries require migration work.

For a shared-config reorganization, the migration helper requires a resolved
config-equivalence report:

```json
{
  "schemaVersion": 1,
  "equivalent": true,
  "baseRoot": "/absolute/isolated/base",
  "headRoot": "/absolute/isolated/head",
  "checks": [{"name": "resolved flags and aliases", "passed": true}]
}
```

The helper transplants only the head workload/config/helper closure into the base
checkout. It records original manifests, original and copied hashes, config
evidence hash and a migration cohort hash, then verifies the resulting protocol.
The subject stays the original base implementation. It must never run against the
shared development checkout. Pass the resulting JSON as `--migration-manifest`
to the gate; migration provenance is retained in the summary and history.

## History

Legacy schema-3 gate summaries are accepted in separate descriptive cohorts;
new summaries use schema 4. The default `--mode edge-delta` shows local
head/measured-base ratios. It is explicitly **not cumulative performance**.
All distinct attempts are retained; history does not choose the last green
rerun or aggregate ratios measured against different baselines.

Cohorts include protocol, full recorded environment, scenario set, inference
method and migration identity. For a direct fixed-reference trend use
`--mode fixed-anchor --anchor-commit SHA`; every input must have been directly
measured against that same base and declare `anchorCommit`. Arbitrary edge ratios
are never multiplied into a purported fixed-anchor trend.

## Retention and metric definitions

`experiments/artifacts.manifest.json` retains the existing 207 tracked research
files in place, with exact sizes and SHA-256. It excludes ignored/untracked local
work. Its inventory commit identifies the inspected repository snapshot, not the
original commit of every measurement.

Suffix preservation's complete-replacement regression, block rotation's
pre-recorded invariants and oracle, and factorial specialization tradeoffs are
retained. `results-first.json` and `results.json` in rotation/suffix research
represent independent runs, not deduplicatable copies. Existing experiment
recipes can overwrite historical result paths; reproduce them in an isolated
checkout and retain generated data as a new run, never rerun them in the shared
development tree to refresh an old report.

Batch-average p99 in rotation/suffix reports is distinct from individual
operation p99. Retained heap, allocation bytes and RSS are distinct metrics.
Instrumentation belongs in separate structural/profile builds; production
timings must not include diagnostic counters or observer hooks.
