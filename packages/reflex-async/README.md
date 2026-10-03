# @volynets/reflex-async

Reactive async derivations over the synchronous Reflex runtime. Sources keep
successful commits separate from cancelable attempts, validate dependency
freshness before publication, and ignore superseded results.

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

The package exports ESM, CommonJS and TypeScript declarations. Its only production
dependency is `@volynets/reflex-runtime`, kept external in both bundles so it
shares execution state with `@volynets/reflex`.

## Migration

Import async APIs and types from `@volynets/reflex-async` instead of
`@volynets/reflex/unstable`. `optimistic` and `transition` remain in
`@volynets/reflex/unstable`. The async API is experimental.

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
