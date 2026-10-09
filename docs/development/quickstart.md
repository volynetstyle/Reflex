# Development quickstart

## Prerequisites

Use the Node version in `.nvmrc` and `pnpm@9.0.0`. Install the pinned package manager through your normal setup before running repository commands. Tooling rejects a mismatched package manager instead of downloading a replacement implicitly.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm build:tools
pnpm --filter @volynets/reflex-dom exec playwright install chromium
```

On Linux, browser dependencies can be installed with `playwright install --with-deps chromium`. The test toolchain version is separate from package consumer support; qualification evaluates published artifacts, not source aliases.

## Normal validation

```sh
pnpm test:tooling
pnpm lint
pnpm quality:check --output-dir artifacts/checks/my-run
pnpm qualify --output-dir artifacts/qualification
```

`quality:check` executes the explicit PR coverage registry, including prerequisite builds, and fails on missing scripts, failures or incomplete evidence. Each package can be checked independently:

```sh
pnpm quality:check --package runtime --output-dir artifacts/checks/runtime-run
pnpm quality:registry
```

Reports are immutable per output directory. Use a fresh directory for retries. `qualify` creates a unique run directory, packs the publish registry, verifies archives, installs a consumer outside the monorepo, checks identity and types, and exercises composition and browser hydration. Install scripts are disabled. `--offline` requires cached package metadata and tarballs.

```sh
pnpm qualify --offline --skip-build --output-dir artifacts/qualification
```

Use `--skip-build` only for artifacts already built by the current validation. `--pack-only` is an archive check and cannot qualify a release.

## Build scopes

| Command | Scope |
| --- | --- |
| `pnpm build` / `build:product` | Product packages and their declared dependency closure |
| `pnpm build:tools` | Public development tools |
| `pnpm build:apps` | Private applications (Devtools and mini-app) |
| `pnpm build:research` | Private research workspace |
| `pnpm build:workspace` | All maintained scopes |
| `pnpm test:projects` | Explicit source test projects |
| `pnpm quality:check --phase release --output-dir …` | Extended release coverage |

A local package `build` does not rebuild neighbours. For a package plus dependencies, use `pnpm --filter '@volynets/reflex-dom...' build`. Source tests with `__TEST__=true` and `__PROD__=false` are not production artifact tests.

## Configuration parity

For a configuration migration, provide a baseline checkout with compatible dependencies available:

```sh
pnpm check:configs --baseline-root /path/to/baseline --output artifacts/config-equivalence.json
```

The checker compares resolved mode settings, test discovery and TypeScript options. It permits the documented DOM browser-wrapper partition and explicitly added tests, and rejects missing existing suites.

## Research

```sh
pnpm check:research
pnpm test:bench-tools
pnpm bench:quality-gate --help
```

Curated raw results are unchanged. New generated measurements belong in unique output directories or CI artifacts. Read [benchmark tooling](../../tooling/benchmarks/README.md) before interpreting a comparison; screening results are not confidence guarantees.

See the [release guide](release.md) for the publication process.
