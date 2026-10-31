# CI/CD

Changes flow `feature -> dev -> main`; main is the release line. Every check
runs where its answer is new and nowhere else: a second run on the same inputs
repeats the first answer at full price.

## What runs where

| Event | CI (`fast checks`) | Benchmark gate | Runtime paired | Benchmark trend | CodeQL |
| --- | --- | --- | --- | --- | --- |
| PR into dev | `pr` phase | suites whose subjects changed | if the production bundle changed | – | yes |
| push to dev | `pr` phase; adopted when the PR was up to date | – | – | – | – |
| PR dev -> main | `deep` phase | suites whose subjects changed | if the bundle changed | – | yes |
| push to main | `deep` phase; adopted from the PR | – | – | point, if subjects changed | yes |
| nightly, Mon-Sat | `deep` on dev; adopted when dev is unchanged | – | – | – | – |
| weekly, Sunday | `deep` on dev, fresh, plus the Windows consumer | – | – | – | Monday |
| PR into other branches | `pr` phase | – | – (dispatch it) | – | – |
| dispatch | chosen phase, optionally fresh | given base | compare or calibrate | all suites | – |

- **Phases.** `pr` runs every registered package check; `deep` adds the
  deep-only packages and checks (`deepChecks` in
  `tooling/configs/quality-checks.json`). Deep runs before main, not before dev.
- **Reuse.** Package checks, the consumer qualification and whole-run verdicts
  are keyed by their inputs and reused across branches and pull requests
  (`tooling/configs/CI-INCREMENTAL.md`). Only the Sunday run and a `fresh`
  dispatch execute everything regardless.
- **Benchmarks** run where a change enters dev or main and never again on the
  push that merges it. A comparison of identical subjects is skipped: the gate
  and the trend compare source trees per suite (`tooling/benchmarks/suites.json`),
  the paired run compares production bundles. Every verdict is a screening
  verdict; none blocks.
- **Runtime bundle identity** is judged where a change enters: a PR into dev, or
  straight into main, needs the `runtime-bundle-change` label when the bundle
  changes. The dev -> main PR, pushes and the nightly carry changes already
  judged there.

| Workflow | Purpose |
| --- | --- |
| [CI](workflows/ci.yml) | Every registered quality check, config parity, workflow lint, installed-package qualification, runtime bundle identity |
| [Release](workflows/release.yml) | Version pull request; qualification and npm publication of new versions |
| [Benchmark gate](workflows/benchmark-gate.yml) | Vitest bench suites, base against head; screening verdicts as warnings |
| [Runtime paired benchmarks](workflows/runtime-paired-benchmarks.yml) | Paired production-bundle comparison in balanced shards; A/A calibration on dispatch |
| [Benchmark trend](workflows/benchmark-trend.yml) | Main history against a fixed anchor, published to Pages |
| [CodeQL](workflows/codeql.yml), [Scorecard](workflows/scorecard.yml) | Security analysis |
| [krausest ranking](workflows/krausest-ranking.yml) | reflex-dom in the js-framework-benchmark tables, on dispatch |

## Merging

`fast checks` is the single required status. It aggregates every CI job and
fails when any job failed or any registered check produced no evidence, so
adding a package to `tooling/configs/quality-checks.json` needs no branch
protection change.

The nightly verifies dev (the scheduled workflow file still comes from main, so
a change to the schedule takes effect once it reaches main). When it fails it
opens or comments on a "Nightly CI is failing" issue.

## Delivery

1. A pull request adds a changeset (`pnpm changeset`).
2. On merge, Release opens or updates `chore(release): version packages` and
   dispatches CI for it (pushes by `GITHUB_TOKEN` start no workflows).
3. Merging the version pull request puts new versions on main. Release sees
   versions npm does not have, qualifies the exact tarballs on Linux and
   Windows, then waits for approval in the `npm` environment.
4. On approval it publishes those archives byte for byte with provenance and
   tags `name@version`. Versions already on npm are skipped, so rerunning a
   failed publish job resumes the release.

To skip a release, reject the deployment; the next push to main asks again.

## Repository settings

These live outside the repository and must be set once:

- **Branch protection on `dev` and `main`:** require pull requests and the
  `fast checks` status; optionally enable the merge queue (CI handles
  `merge_group`). Squash-merge pull requests into dev after updating them
  with dev, so the push adopts their verdict instead of running again.
- **Actions → General → Workflow permissions:** allow GitHub Actions to create
  and approve pull requests (for the version pull request).
- **Environment `npm`:** required reviewers; deployment branches limited to
  `main`; secret `NPM_TOKEN` (an npm automation or granular token with
  publish rights on `@volynets`).

## Conventions

- Third-party actions are pinned to commit SHAs; Dependabot keeps the pins
  and their version comments current.
- Shared setup (pnpm from `packageManager`, Node, frozen install, cached
  Chromium) is the [setup-workspace](actions/setup-workspace/action.yml)
  composite action.
- Workflow changes are linted by actionlint with shellcheck in CI.
