import { access, readFile } from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { repoRoot } from "./package-registry.mjs";

const exec = promisify(execFile);
export async function resolvePnpmCli() {
  const cli = process.env.REFLEX_PNPM_CLI ?? process.env.npm_execpath;
  if (!cli || !/pnpm[^/\\]*\.(?:c?js)$/i.test(cli)) {
    throw new Error("Run through pinned pnpm, or set REFLEX_PNPM_CLI to the pnpm 9 CLI file. No package manager is downloaded by this tool.");
  }
  const absolute = resolve(cli);
  await access(absolute);
  const manifest = JSON.parse(await readFile(resolve(repoRoot, "package.json"), "utf8"));
  const expected = manifest.packageManager.replace(/^pnpm@/, "").split("+")[0];
  const { stdout } = await exec(process.execPath, [absolute, "--version"], { cwd: repoRoot, windowsHide: true });
  if (stdout.trim() !== expected) throw new Error("Expected pnpm " + expected + ", received " + stdout.trim());
  return absolute;
}

export async function runPnpm(args, { cwd = repoRoot, env = process.env } = {}) {
  const cli = await resolvePnpmCli();
  return await new Promise((done, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd, env, shell: false, windowsHide: true, stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code, signal) => code === 0 ? done() : reject(new Error("pnpm failed (" + (signal ?? code) + "): " + args.join(" "))));
  });
}
