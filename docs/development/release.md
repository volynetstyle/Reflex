# Release qualification and publication

No repository command publishes as a side effect of `pnpm release`. That command qualifies. Publication is a separate explicit action.

## Prepare

1. Add a Changeset for public artifact or behaviour changes.
2. Run `pnpm release:version` to prepare a version commit.
3. Update the lockfile if necessary, then use `pnpm install --frozen-lockfile`.
4. Run the release coverage registry and full consumer qualification.

```sh
pnpm quality:check --phase release --output-dir artifacts/release-checks
pnpm qualify --output-dir artifacts/qualification
```

Choose the successful unique `qualification.json` and preserve its tarballs, logs, consumer lock and checksums. Pack-only evidence is insufficient.

In CI this is automated by `.github/workflows/release.yml`: changesets on main keep a version pull request up to date; once its versions are on main and missing from npm, the workflow qualifies the tarballs on Linux and Windows and waits for approval in the `npm` environment before publishing. See `.github/README.md`.

## Verify the exact archives

```sh
node tooling/configs/publish-qualified.mjs \
  --qualification artifacts/qualification/<run>/qualification.json \
  --quality-summary artifacts/release-checks/summary.json
```

Verification rejects missing or failed consumer checks, incomplete package sets, changed archive bytes, changed log hashes and implicit access policy.

## Publish

An explicitly authorized operator may pass `--publish` to the qualified-publication tool. It submits those verified tarballs with install/publish lifecycle scripts disabled, avoiding an unobserved rebuild or repack. It records attempts before moving to the next package. Registry authentication is configured outside the repository.

The convenience `release:publish` command should use the same verification tool; ordinary Changesets publishing must not silently substitute newly repacked files for qualified archives.

## Failure recovery

A partial publication remains recorded. Publication is idempotent: versions npm already has are skipped (`already-published` when the archive is byte-identical, `version-taken` when it differs), so rerunning the publish job resumes the release. Published versions are immutable; restoration requires a new corrective version rather than replacing a previous archive. Do not discard a failed attempt or rerun until a random green result appears.

Access, versioning and supported peer ranges are explicit package contracts. Private Devtools and research workspaces are excluded.
