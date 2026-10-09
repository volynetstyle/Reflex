import { pathToFileURL } from "node:url";
import { packageRegistry, packagesInScope } from "./package-registry.mjs";
import { runPnpm } from "./pnpm.mjs";

export async function runWorkspaceTask(names, task = "build", args = []) {
  if (names.length === 0) throw new Error("Select at least one workspace package.");
  for (const name of names) {
    if (!packageRegistry.some((entry) => entry.name === name)) throw new Error("Unknown registered package: " + name);
  }
  // pnpm expands dependency closures and orders packages; local scripts own their phases.
  await runPnpm(["--sort", "--fail-if-no-match", ...[...new Set(names)].flatMap((name) => ["--filter", name + "..."]), "run", task, ...args]);
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--scope") {
    const [, scope, task = "build", ...rest] = args;
    await runWorkspaceTask(packagesInScope(scope).map((entry) => entry.name), task, rest);
  } else {
    await runWorkspaceTask(args.filter((arg) => arg !== "--force"));
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
