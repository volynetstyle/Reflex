# Production monorepo implementation

Implemented on 8 October 2026 against baseline `f572742fc0cdcc8291fa0af53736af5e92472def`. The work remains in the working tree for review; no commit, publication or deployment was performed. Serena was not used for implementation.

The user excluded Stellune and new late-stage research/holdout expansion. Existing semantic cohorts, curated research and supported package contracts are preserved.

## Changes

- Explicit product/tool/app/research registry. pnpm 9 owns dependency ordering; package builds own local phases. Nested rebuilds and the custom cache/duplicate graph are removed.
- Shared flags, aliases, TypeScript base options and named test projects preserve resolved modes. CI uses explicit coverage and an always-running aggregate.
- Reflex archives include development debug chunks. Runtime/Reflex/Async CJS declarations match module format; ambient types are shared between ESM and CJS.
- Runtime CJS development/debug entrypoints share their graph. Production identity and DOM standalone closure remain checked.
- The MCP SDK boundary correctly adapts readonly diagnostic data, and the installed CLI is qualified.
- Async extracted `read/commit` callbacks capture the execution handle lexically. Stale attempt, abort, nested execution and after-await guards remain enforced.
- Devtools uses current hooks/signals and releases HMR resources. Mini-app has a private workspace and uses the supported Store selectors subpath.
- Actual tarballs are installed outside the repository and checked without source aliases. Peer ranges stay intact through scoped dependency overrides.
- Publication verifies exact archive and log hashes before any explicit publish action.
- Benchmark tools validate schemas and symmetric scenario sets, separate historical cohorts and label screening evidence honestly. Protocol migration requires config parity and excludes subject source from copied harness data.
- Confirmed unused templates were removed with evidence. Ignored user labs, drafts and Store benchmark files were preserved.

## Executed validation

| Check | Result |
| --- | --- |
| Frozen pnpm 9 installation | PASS |
| Maintained-source lint | PASS |
| Required package/application aggregate | 12 entries, 61 required checks, PASS |
| Tooling regression suites | 29/29 PASS |
| Resolved configuration and discovery parity | 33/33 PASS |
| Actual public archives | 10 verified |
| External consumer qualification | 29/29 PASS |
| ESM/CJS production/development identity | PASS |
| Strict NodeNext/Bundler declarations and mixed type program | PASS |
| Store/Async/Framework/DOM composition and standalone | PASS |
| SSR to Chromium hydration, compiler transform, update and disposal | PASS |
| Nonempty read-only MCP graph and installed bin | PASS |
| Async unit tests / production corpus | 128/128 and 84/84 PASS |
| Async bounded explorers | All nine complete |
| Curated research data | 207 files, 7,500,602 bytes checksum-identical |
| Protocol migration and publication verification guard | PASS |
| Workflow YAML and job dependencies | PASS |
| Git whitespace check | PASS |

Detailed facts and archive digests are in [production-validation.json](production-validation.json). Raw logs and tarballs remain under `.tmp/quality-approved`, `.tmp/qualification-approved` and the separate attempt directories. Failed attempts were retained; corrected cases were rerun explicitly rather than retried until a random pass.

## Scope of the evidence

The local environment was Windows, Node 25.2.0 and pnpm 9.0.0. GitHub-hosted Linux/Windows jobs are configured; they were not remotely executed in this session. No numerical performance improvement or controlled twenty-pair campaign is claimed.

The complete existing PR protection is preserved. Additional research and scheduled qualification use separate commands and workflows; product builds do not require running a laboratory.

## Normal commands

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test:tooling
pnpm lint
pnpm quality:check --output-dir artifacts/checks/<fresh-run>
pnpm qualify --output-dir artifacts/qualification
```

Chromium setup and per-package commands are documented in [quickstart.md](quickstart.md). Publication is separate and requires qualified artifacts; see [release.md](release.md).

## Review points

The public fixes have a Changeset. Build-contract and source-semantic changes are documented separately so reviewers can assess the Async callback correction independently from infrastructure relocation.

Historical architecture is retained under `docs/architecture/history`. The original reorganization plan remains a specification; this report records the implemented and tested scope.
