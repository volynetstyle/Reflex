# CI/CD

| Workflow | Runs on | Blocks merge | Purpose |
| --- | --- | --- | --- |
| [CI](workflows/ci.yml) | pull request, merge queue, push to main, nightly | yes, through `fast checks` | Every registered quality check, config parity, workflow lint, installed-package qualification |
| [Release](workflows/release.yml) | push to main | no | Version pull request; qualification and npm publication of new versions |
| [Benchmark gate](workflows/benchmark-gate.yml) | pull request, push to main (bench-relevant paths) | no | Vitest bench suites, base against head; screening verdicts as warnings |
| [Runtime paired benchmarks](workflows/runtime-paired-benchmarks.yml) | pull request, push to main (runtime paths), dispatch | no | Paired production-bundle comparison in balanced shards; A/A calibration on dispatch |

## Merging

`fast checks` is the single required status. It aggregates every CI job and
fails when any job failed or any registered check produced no evidence, so
adding a package to `tooling/configs/quality-checks.json` needs no branch
protection change. Checks whose inputs did not change reuse evidence from an
earlier successful run (`tooling/configs/ci-fingerprints.mjs`).

The nightly run uses the `deep` phase and a Windows consumer; when it fails it
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

- **Branch protection on `main`:** require pull requests and the `fast checks`
  status; optionally enable the merge queue (CI handles `merge_group`).
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
