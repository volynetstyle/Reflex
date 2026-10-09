import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { repoRoot } from "./package-registry.mjs";

const files = [];
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory() && !["node_modules", "artifacts", "results"].includes(entry.name)) await collect(path);
    else if (entry.isFile() && entry.name.endsWith(".test.mjs")) files.push(path);
  }
}
await collect(resolve(repoRoot, "tooling"));
if (files.length === 0) throw new Error("No tooling tests discovered");
await new Promise((done, reject) => {
  const child = spawn(process.execPath, ["--test", ...files.sort()], { cwd: repoRoot, windowsHide: true, shell: false, stdio: "inherit" });
  child.on("error", reject);
  child.on("close", (code) => code === 0 ? done() : reject(new Error("Tooling tests failed: " + code)));
});
