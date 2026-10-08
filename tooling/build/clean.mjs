import { rmSync, existsSync } from "node:fs";
import { resolve, relative, isAbsolute, sep } from "node:path";

const packageRoot = resolve(process.argv[2] ?? ".");
if (!existsSync(resolve(packageRoot, "package.json"))) throw new Error("Clean target must be a package directory.");
const outputs = process.argv.slice(3);
for (const output of outputs.length ? outputs : ["build", "dist"]) {
  const target = resolve(packageRoot, output);
  const local = relative(packageRoot, target);
  if (!local || local === ".." || local.startsWith(".." + sep) || isAbsolute(local)) throw new Error("Refusing to clean outside package: " + target);
  rmSync(target, { recursive: true, force: true });
}
