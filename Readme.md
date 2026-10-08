# Reflex

Reflex is a layered reactive system for synchronous computation, scheduling, lifecycle ownership, stores, async work and DOM rendering.

Application code normally starts with `@volynets/reflex`:

```ts
import { createRuntime, signal, computed, effect } from "@volynets/reflex";

const runtime = createRuntime({ effectStrategy: "eager" });
const count = signal(0);
const doubled = computed(() => count() * 2);
const stop = effect(() => { console.log(doubled()); });

runtime.batch(() => {
  count.set(1);
  count.set(2);
});
runtime.flush();
stop();
```

## Packages

| Package | Responsibility |
| --- | --- |
| `@volynets/reflex-runtime` | Reactive kernel, execution contexts and separate diagnostics |
| `@volynets/reflex-scheduler` | Host scheduling and effect delivery |
| `@volynets/reflex` | Application-facing signals, computeds, effects, events and ownership |
| `@volynets/reflex-framework` | Host-independent lifecycle, hooks and JSX meaning |
| `@volynets/reflex-dom` | DOM rendering, SSR, hydration and a separate standalone composition |
| `@volynets/reflex-store` | Store semantics, compiler, portable compiler assets and Vite transform |
| `@volynets/reflex-async` | Attempts, pending state, commit authority and cancellation |
| `@volynets/reflex-runtime-mcp` | Read-only diagnostic tools through the official MCP protocol SDK |
| `@volynets/reflex-vite-plugin` | Application compilation tooling |
| `@volynets/algorithm-projection` | Development instrumentation and projection tooling |

Devtools and the mini-app example are private applications. The reactivity comparison lab is a private research workspace. Publication eligibility and build scopes are explicit in [the package registry](tooling/build/package-registry.mjs).

## Development

Use Node specified by `.nvmrc` and **pnpm 9.0.0**.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test:tooling
pnpm quality:check
pnpm qualify
```

Chromium is required for browser checks:

```sh
pnpm --filter @volynets/reflex-dom exec playwright install chromium
```

On Linux CI, use `playwright install --with-deps chromium`. See the [development quickstart](docs/development/quickstart.md), [architecture](ARCHITECTURE.md), [package contracts](docs/contracts/package-contracts.md) and [release process](docs/development/release.md).

Builds preserve a shared kernel within a supported module format and consistent conditions. DOM standalone contains a separate kernel. Mixed ESM/CJS state sharing is not promised; see the package contracts.

Research results and negative evidence are preserved through [checksum manifests](experiments/README.md). Research is excluded from the default product build.

## License

[MIT](LICENSE).
