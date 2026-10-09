import { packagesInScope } from "../build/package-registry.mjs";
import { runPnpm } from "../build/pnpm.mjs";
// Lint maintained product/tool/app sources and infrastructure, never ignored local labs.
const packages=[...packagesInScope("product"),...packagesInScope("tools"),...packagesInScope("apps")];
await runPnpm(["exec","eslint",...packages.map(({path})=>path),"tooling","config","scripts","eslint.config.mjs","vitest.config.ts",...process.argv.slice(2).filter(arg=>arg!=="--")]);
