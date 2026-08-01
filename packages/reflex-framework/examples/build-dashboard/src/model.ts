import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const args = process.argv.slice(2);
export const force = args.includes("--force");
export const requestedPackages = args.filter((arg) => arg !== "--force");
export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
export const cachePath = resolve(repoRoot, ".cache/build-chain.json");
const tscBin = resolve(repoRoot, "node_modules/typescript/bin/tsc");
const rollupBin = resolve(repoRoot, "node_modules/rollup/dist/bin/rollup");

export type PhaseState = "pending" | "running" | "completed" | "failed";
export type PackageStateName = "pending" | "building" | "completed" | "cached" | "failed";

export interface CommandResult {
  status: number;
  signal?: NodeJS.Signals | null;
  error?: unknown;
  output?: Buffer;
}

export interface PhaseConfig {
  name: string;
  run: (cwd: string) => CommandResult | Promise<CommandResult>;
}

export interface PackageConfig {
  cwd: string;
  dependencies: string[];
  outputs: string[];
  phases: PhaseConfig[];
}

export interface PhaseStatus extends PhaseConfig {
  state: PhaseState;
  startedAt?: bigint;
  duration?: number;
}

export interface PackageStatus {
  name: string;
  label: string;
  config: PackageConfig;
  state: PackageStateName;
  startedAt?: bigint;
  duration?: number;
  phases: PhaseStatus[];
}

export interface BuildState {
  startedAt: bigint;
  packages: PackageStatus[];
}

export interface BuildCache {
  version: 1;
  packages: Record<string, { fingerprint: string }>;
}

function cleanPackage(cwd: string): CommandResult {
  for (const directory of ["build", "dist"]) {
    const target = resolve(cwd, directory);
    if (!target.startsWith(`${cwd}\\`) && target !== cwd) {
      throw new Error(`Refusing to clean outside package: ${target}`);
    }
    rmSync(target, { recursive: true, force: true });
  }
  return { status: 0 };
}

function runCommand(command: string, commandArgs: string[], cwd: string): Promise<CommandResult> {
  return new Promise((resolveCommand) => {
    const output: Buffer[] = [];
    let settled = false;
    const child = spawn(command, commandArgs, {
      cwd,
      env: process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    const capture = (chunk: Buffer) => output.push(chunk);
    child.stdout.on("data", capture);
    child.stderr.on("data", capture);
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      resolveCommand({ status: 1, error, output: Buffer.concat(output) });
    });
    child.on("close", (status, signal) => {
      if (settled) return;
      settled = true;
      resolveCommand({ status: status ?? 1, signal, output: Buffer.concat(output) });
    });
  });
}

function runTsc(project: string) {
  return (cwd: string) => runCommand(process.execPath, [tscBin, "-p", project], cwd);
}

function runRollup(config: string) {
  return (cwd: string) =>
    runCommand(process.execPath, [rollupBin, "--silent", "-c", config, "--configPlugin", "@rollup/plugin-swc"], cwd);
}

function runNodeScript(script: string, scriptArgs: string[]) {
  return (cwd: string) => runCommand(process.execPath, [resolve(repoRoot, script), ...scriptArgs], cwd);
}

function runPackageNodeScript(script: string, scriptArgs: string[]) {
  return (cwd: string) => runCommand(process.execPath, [resolve(cwd, script), ...scriptArgs], cwd);
}

export const packageConfigs = new Map<string, PackageConfig>([
  [
    "@volynets/reflex-runtime",
    {
      cwd: resolve(repoRoot, "packages/reflex-runtime"),
      dependencies: [],
      outputs: ["build/esm", "dist/esm", "dist/cjs"],
      phases: [
        { name: "clean", run: cleanPackage },
        { name: "typescript", run: runTsc("tsconfig.build.json") },
        { name: "aliases", run: runPackageNodeScript("scripts/rewrite-build-aliases.mjs", []) },
        { name: "globals", run: runNodeScript("scripts/write-globals-dts.mjs", ["."]) },
        { name: "bundle", run: runRollup("rollup.config.ts") },
      ],
    },
  ],
  [
    "@volynets/reflex-scheduler",
    {
      cwd: resolve(repoRoot, "packages/reflex-scheduler"),
      dependencies: ["@volynets/reflex-runtime"],
      outputs: ["dist"],
      phases: [
        { name: "clean", run: cleanPackage },
        { name: "typescript", run: runTsc("tsconfig.build.json") },
        { name: "specifiers", run: runNodeScript("scripts/fix-esm-specifiers.mjs", ["dist"]) },
      ],
    },
  ],
  [
    "@volynets/reflex",
    {
      cwd: resolve(repoRoot, "packages/reflex"),
      dependencies: ["@volynets/reflex-runtime", "@volynets/reflex-scheduler"],
      outputs: ["build/esm", "build/types-bundle", "dist/esm", "dist/cjs"],
      phases: [
        { name: "clean", run: cleanPackage },
        { name: "typescript", run: runTsc("tsconfig.build.json") },
        { name: "types", run: runRollup("rollup.dts.config.ts") },
        { name: "globals", run: runNodeScript("scripts/write-globals-dts.mjs", ["."]) },
        { name: "subpaths", run: runPackageNodeScript("scripts/write-subpath-dts.mjs", ["."]) },
        { name: "bundle", run: runRollup("rollup.config.ts") },
      ],
    },
  ],
]);

export function elapsedMilliseconds(startedAt: bigint): number {
  return Number(process.hrtime.bigint() - startedAt) / 1_000_000;
}

export function formatDuration(milliseconds: number): string {
  if (milliseconds < 1_000) return `${Math.round(milliseconds)}ms`;
  if (milliseconds < 10_000) return `${(milliseconds / 1_000).toFixed(1)}s`;
  return `${(milliseconds / 1_000).toFixed(0)}s`;
}

export function readCache(): BuildCache {
  try {
    const parsed = JSON.parse(readFileSync(cachePath, "utf8")) as BuildCache;
    return parsed.version === 1 && parsed.packages ? parsed : { version: 1, packages: {} };
  } catch {
    return { version: 1, packages: {} };
  }
}

export function writeCache(cache: BuildCache): void {
  mkdirSync(dirname(cachePath), { recursive: true });
  writeFileSync(cachePath, `${JSON.stringify(cache, null, 2)}\n`);
}

function collectFiles(directory: string, files: string[] = []): string[] {
  if (!existsSync(directory)) return files;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (["build", "dist", "node_modules", ".cache"].includes(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) collectFiles(path, files);
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

export function packageFingerprint(packageName: string, config: PackageConfig, fingerprints: Map<string, string>): string {
  const hash = createHash("sha256");
  const sharedInputs = [
    fileURLToPath(import.meta.url),
    resolve(repoRoot, "package.json"),
    resolve(repoRoot, "pnpm-lock.yaml"),
    resolve(repoRoot, "scripts/write-globals-dts.mjs"),
    resolve(repoRoot, "scripts/fix-esm-specifiers.mjs"),
    resolve(repoRoot, "scripts/rollup-build-reporter.ts"),
  ];
  const files = [...collectFiles(config.cwd), ...sharedInputs]
    .filter((path) => existsSync(path) && statSync(path).isFile())
    .sort();

  hash.update(`package:${packageName}\n`);
  hash.update(`node:${process.versions.node}\n`);
  hash.update(`mode:${process.env.NODE_ENV ?? "production"}\n`);
  for (const dependency of config.dependencies) {
    hash.update(`dependency:${dependency}:${fingerprints.get(dependency) ?? "missing"}\n`);
  }
  for (const path of files) {
    hash.update(`file:${relative(repoRoot, path).replaceAll("\\", "/")}\n`);
    hash.update(readFileSync(path));
  }
  return hash.digest("hex");
}

export function outputsExist(config: PackageConfig): boolean {
  return config.outputs.every((output) => {
    const path = resolve(config.cwd, output);
    return existsSync(path) && statSync(path).isDirectory() && readdirSync(path).length > 0;
  });
}

export function displayName(packageName: string): string {
  const prefix = "@volynets/reflex-";
  if (packageName.startsWith(prefix)) return packageName.slice(prefix.length);
  return packageName.split("/").at(-1) ?? packageName;
}

export function createBuildState(names: string[]): BuildState {
  return {
    startedAt: process.hrtime.bigint(),
    packages: names.map((packageName) => {
      const config = packageConfigs.get(packageName);
      if (config === undefined) throw new Error(`Unknown package in build chain: ${packageName}`);
      return {
        name: packageName,
        label: displayName(packageName),
        config,
        state: "pending",
        phases: config.phases.map((phase) => ({ ...phase, state: "pending" })),
      };
    }),
  };
}

export function buildProgress(state: BuildState): number {
  const total = state.packages.reduce((count, packageState) => count + packageState.phases.length, 0);
  const completed = state.packages.reduce((count, packageState) => {
    if (packageState.state === "completed" || packageState.state === "cached") return count + packageState.phases.length;
    return count + packageState.phases.filter((phase) => phase.state === "completed").length;
  }, 0);
  return total === 0 ? 100 : Math.round((completed / total) * 100);
}

export function buildCounts(state: BuildState) {
  const count = (status: PackageStateName) => state.packages.filter((packageState) => packageState.state === status).length;
  return {
    built: count("completed"),
    building: count("building"),
    cached: count("cached"),
    failed: count("failed"),
    pending: count("pending"),
  };
}

export function currentDuration(item: { duration?: number; startedAt?: bigint }): number | undefined {
  if (item.duration !== undefined) return item.duration;
  if (item.startedAt !== undefined) return elapsedMilliseconds(item.startedAt);
  return undefined;
}
