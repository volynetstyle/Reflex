# @volynets/reflex-async

Reactive async derivations over the synchronous Reflex runtime. Sources keep
successful commits separate from cancelable attempts, validate dependency
freshness before publication, and ignore superseded results.

```bash
npm install @volynets/reflex-async @volynets/reflex @volynets/reflex-runtime
```

```ts
import { createRuntime, signal } from "@volynets/reflex";
import { asyncDerived, until } from "@volynets/reflex-async";

const runtime = createRuntime();
const id = signal(1);
const user = asyncDerived(({ signal }) =>
  fetch(`/api/users/${id()}`, { signal }).then(response => response.json()),
);

console.log(await until(user));
id.set(2);
runtime.flush();
console.log(await user.resolve());
user.dispose();
```

Dependencies are captured during the synchronous part of a job, before `await`.
Use `execution.read(source)` for fresh dependent values and
`execution.commit(source)` for presence-preserving committed snapshots.
`read()` throws `AsyncBlocker` while a fresh value is unavailable; `until()` and
`resolve()` follow replacement attempts. An owner `AbortSignal` or `dispose()`
ends the source lifetime.

Catch blocks can publish a fallback for an observed source failure. If that
source changes before async publication, the derivation is validated again.
A pending read still blocks publication. A blocking direct `source.read()` after
`await` without a captured dependency rejects with `AsyncProtocolError`.

Capture fresh sources directly in each async job. A warmed ordinary `computed`
does not forward hidden async freshness dependencies; the evaluated-computed
adapter is currently internal. Keep shared transformations as pure functions:

```ts
const project = (value: number) => value * 2;
const child = asyncDerived(({ read }) => project(read(root)));
```

The package exports ESM, CommonJS and TypeScript declarations.
`@volynets/reflex-runtime` is a peer dependency, kept external in both bundles
so Async shares the application's kernel module identity with the Reflex facade,
Store and DOM. Install a compatible runtime alongside this package.
Use the same module format for these packages in a reactive graph. Mixing an
ESM facade with CommonJS async (or the reverse) loads separate runtime instances
and is unsupported.

## Migration

Import async APIs and types from `@volynets/reflex-async` instead of
`@volynets/reflex/unstable`. `optimistic` and `transition` remain in
`@volynets/reflex/unstable`. Before 1.0, a minor release may change the async
API; patch releases keep it.

## Development

Run commands from the repository root:

```sh
pnpm --filter @volynets/reflex-async build:all
pnpm --filter @volynets/reflex-async test
pnpm --filter @volynets/reflex-async typecheck
pnpm --filter @volynets/reflex-async lint
pnpm --filter @volynets/reflex-async test:coverage
pnpm --filter @volynets/reflex-async bench
```

`test` includes lifecycle, evaluation, frontier, exhaustive bounded and shrinking
property contracts. `test:async:mutations` qualifies the contract witnesses;
`test:async:production` checks production semantics against independent oracles.
`test:async:semantics` and the lab mutation scripts compare isolated variants.
`test:async:wait-memory` verifies that cancelled waiter signals are collected
while their source remains pending, including `until()` and nested blockers.

After building `@volynets/reflex` and this package, run `test:async:package` to
check ESM and CommonJS exports and shared runtime behavior. `typecheck:package`
compiles a consumer against the published declarations using NodeNext resolution.

`bench` runs the source lifecycle and invalidation benchmarks once.
`bench:async:frontier`, `bench:async:consumption` and `bench:async:semantics` run
the existing lab workloads. For production bundle comparisons, build and run
`bench:async:baseline`, then `bench:async`; reports are written to `.cache`.
Record a new baseline for this package layout. Archived lab reports retain their
original input paths and hashes.

See [API contracts](docs/async-experiment.md),
[architecture](docs/async-architecture.md),
[performance methodology](docs/async-performance.md), and
[semantics lab](lab/async-semantics/README.md).
