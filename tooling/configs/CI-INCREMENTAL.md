# Incremental CI evidence

The registry job computes SHA-256 keys from tracked input bytes and executable
permissions. Each package includes its workspace dependency closure, including
peer, development and optional dependencies and source references to maintained
packages. Inputs outside maintained package directories are shared, so changes
to workflows, tooling, scripts, root configs or the lockfile invalidate all keys.
Nested apps own their own inputs. Markdown documentation is excluded except
AGENTS.md; generated outputs and untracked files are not CI inputs. The phase
(`pr` or `deep`) is part of every key; the workflow derives it from where the
change goes (`QUALITY_PHASE`, see `.github/README.md`).

## Package evidence

A successful package job uploads its reports and logs as an artifact named
`evidence-<version>-<platform>-<package>-<phase>-<fingerprint>`; the installed
consumer qualification uses `evidence-<version>-<platform>-consumer-<fingerprint>`.
Before running, a job looks that name up across the repository
(`.github/actions/restore-evidence`) and, on a hit, downloads it instead of
installing, building and testing. Artifacts are repository-wide, unlike caches,
which a run can only read from its own branch, its base and the default branch:
evidence produced by a pull request into dev is therefore visible to the push
that merges it, to the dev -> main pull request and to the nightly. Only runs of
this repository count, never runs from forks. Names are exact; there is no
fallback. A miss, an expired artifact or a failed download runs the full checks;
failed jobs upload nothing. Evidence is kept for 90 days.

The required aggregate checks log hashes, the complete registry, successful jobs
and each package report's input fingerprint against the current registry plan,
so reused evidence passes only if it was produced for exactly these inputs. A
reused result retains its original execution timestamps.

## Run verdicts

Static contracts (config parity, active divergences) and dependency review also
depend on the base the change is compared with. A whole run is therefore keyed
by `(version, phase, tree, base tree)`. When `fast checks` passes, it uploads
its summary as `ci-verified-<key>`. A later run with the same key (the push of
a squash-merged pull request that was up to date with dev, the push to main
after the dev -> main pull request, a nightly on an unchanged dev) adopts that
verdict: every job except the runtime bundle identity is skipped, and
`fast checks` downloads and checks the adopted summary. The runtime bundle
verdict also depends on labels, so it is never adopted.

## Fresh runs

The Sunday schedule and a dispatch with `fresh` set read no evidence and adopt
no verdict; they execute everything and still publish their evidence. That is
where environment rot (runner images, registries, browsers) and flaky tests
surface. OS, architecture, Node major and pnpm version are part of every
evidence name; bump `EVIDENCE_VERSION` in `ci.yml` to invalidate all of it.
Benchmark measurements are never reused; benchmark workflows instead skip
comparisons whose subjects are identical (`tooling/benchmarks/README.md`).
