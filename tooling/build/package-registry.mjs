import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
// Publication eligibility is explicit. Workspace dependencies still define task ordering.
export const packageRegistry = Object.freeze([
  { name: "@volynets/reflex-runtime", path: "packages/reflex-runtime", role: "product", publish: true },
  { name: "@volynets/reflex-scheduler", path: "packages/reflex-scheduler", role: "product", publish: true },
  { name: "@volynets/reflex", path: "packages/reflex", role: "product", publish: true },
  { name: "@volynets/reflex-async", path: "packages/reflex-async", role: "product", publish: true },
  { name: "@volynets/reflex-framework", path: "packages/reflex-framework", role: "product", publish: true },
  { name: "@volynets/reflex-dom", path: "packages/reflex-dom", role: "product", publish: true },
  { name: "@volynets/reflex-store", path: "packages/reflex-store", role: "product", publish: true },
  { name: "@volynets/reflex-runtime-mcp", path: "packages/reflex-runtime-mcp", role: "product", publish: true },
  { name: "@volynets/reflex-vite-plugin", path: "plugins/@vite/reflex-vite-plugin", role: "tool", publish: true },
  { name: "@volynets/algorithm-projection", path: "third-party/algorithm-projection", role: "tool", publish: true },
  { name: "@reflex-examples/mini-app", path: "packages/reflex/examples/mini-app", role: "app", publish: false },
  { name: "reflex-devtools", path: "packages/reflex-devtools", role: "app", publish: false },
  { name: "@reflex-lab/reactivity-bench", path: "lab/reactivity-bench", role: "research", publish: false },
]);

export function packagesInScope(scope) {
  if (scope === "all") return [...packageRegistry];
  if (scope === "publish") return packageRegistry.filter((entry) => entry.publish);
  const role = { product: "product", tools: "tool", apps: "app", research: "research" }[scope];
  if (!role) throw new Error("Unknown package scope: " + scope);
  return packageRegistry.filter((entry) => entry.role === role);
}

export async function readPackage(entry) {
  return JSON.parse(await readFile(resolve(repoRoot, entry.path, "package.json"), "utf8"));
}
