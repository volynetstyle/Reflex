// Child processes of the testkit: every external check runs as its own
// process with inherited stdio, so its output is the tool's own output.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { packageRoot, repoRoot } from "./paths.mjs";

const require = createRequire(path.join(packageRoot, "package.json"));

/** Absolute path of the vitest CLI the package resolves. */
export function vitestCli() {
  const manifest = require.resolve("vitest/package.json");
  const bin = require(manifest).bin;
  return path.join(
    path.dirname(manifest),
    typeof bin === "string" ? bin : bin.vitest,
  );
}

let pnpmCli;
/** Absolute path of the pnpm CLI script (tooling/build/pnpm.mjs). */
export async function pnpmCliPath() {
  if (pnpmCli === undefined) {
    const { resolvePnpmCli } = await import(
      pathToFileURL(path.join(repoRoot, "tooling/build/pnpm.mjs")).href
    );
    pnpmCli = await resolvePnpmCli();
  }
  return pnpmCli;
}

/**
 * Runs a command to completion with inherited stdio. Resolves with the exit
 * code (never rejects on a non-zero exit) and the wall time.
 */
export function run(command, args, { cwd = packageRoot, env } = {}) {
  const began = performance.now();
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: env === undefined ? process.env : { ...process.env, ...env },
      stdio: "inherit",
      windowsHide: true,
    });
    child.on("error", (error) => {
      console.error(`testkit: cannot start ${command}: ${error.message}`);
      resolve({ code: -1, ms: performance.now() - began });
    });
    child.on("close", (code, signal) =>
      resolve({
        code: code ?? (signal === null ? -1 : 128),
        ms: performance.now() - began,
      }),
    );
  });
}

/** The package's single vitest entry point (config/vitest.ts owns the profiles). */
export const VITEST_CONFIG = "config/vitest.config.ts";

/**
 * The `--config` and `--mode` arguments of a vitest runner of the catalog:
 * `{ profile }` selects a profile of this package, `{ config }` names another
 * package's config file (cwd relative).
 */
export function vitestArgs(runner) {
  return runner.profile === undefined
    ? ["--config", runner.config]
    : ["--config", VITEST_CONFIG, "--mode", runner.profile];
}

/** Renders a command for logs and `--dry-run`. */
export function render(command, args, env) {
  const quote = (text) => (/[\s"']/.test(text) ? JSON.stringify(text) : text);
  // A tool inside node_modules shows as its package name, a path inside the
  // package as a relative path.
  const shorten = (arg) => {
    const text = String(arg);
    if (!path.isAbsolute(text)) return text;
    const parts = text.split(/[\\/]/);
    const at = parts.lastIndexOf("node_modules");
    if (at !== -1)
      return parts[at + 1]?.startsWith("@")
        ? `${parts[at + 1]}/${parts[at + 2]}`
        : parts[at + 1];
    const relative = path.relative(packageRoot, text);
    return relative.startsWith("..") ? text : relative.replaceAll("\\", "/");
  };
  const prefix = Object.entries(env ?? {})
    .map(([key, value]) => `${key}=${quote(String(value))}`)
    .join(" ");
  const exe =
    command === process.execPath
      ? "node"
      : path.basename(command).replace(/\.exe$/, "");
  return [prefix, exe, ...args.map((arg) => quote(shorten(arg)))]
    .filter(Boolean)
    .join(" ");
}
