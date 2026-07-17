import { spawnSync } from "node:child_process";
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

const args = process.argv.slice(2);
const force = args.includes("--force");
const packages = args.filter((arg) => arg !== "--force");
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cachePath = resolve(repoRoot, ".cache/build-chain.json");
const tscBin = resolve(repoRoot, "node_modules/typescript/bin/tsc");
const rollupBin = resolve(repoRoot, "node_modules/rollup/dist/bin/rollup");
const supportsColor =
  process.env.NO_COLOR === undefined &&
  process.env.TERM !== "dumb" &&
  process.stdout.isTTY === true;

const packageConfigs = new Map([
  [
    "@volynets/reflex-runtime",
    {
      cwd: resolve(repoRoot, "packages/reflex-runtime"),
      dependencies: [],
      outputs: ["build/esm", "dist/esm", "dist/cjs"],
      phases: [
        ["clean", cleanPackage],
        ["typescript", runTsc("tsconfig.build.json")],
        [
          "aliases",
          runPackageNodeScript("scripts/rewrite-build-aliases.mjs", []),
        ],
        ["globals", runNodeScript("scripts/write-globals-dts.mjs", ["."])],
        ["bundle", runRollup("rollup.config.ts")],
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
        ["clean", cleanPackage],
        ["typescript", runTsc("tsconfig.build.json")],
        [
          "specifiers",
          runNodeScript("scripts/fix-esm-specifiers.mjs", ["dist"]),
        ],
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
        ["clean", cleanPackage],
        ["typescript", runTsc("tsconfig.build.json")],
        ["types", runRollup("rollup.dts.config.ts")],
        ["globals", runNodeScript("scripts/write-globals-dts.mjs", ["."])],
        [
          "subpaths",
          runPackageNodeScript("scripts/write-subpath-dts.mjs", ["."]),
        ],
        ["bundle", runRollup("rollup.config.ts")],
      ],
    },
  ],
]);

const color = {
  bold: (value) => paint("1", value),
  cyan: (value) => paint("36", value),
  dim: (value) => paint("2", value),
  green: (value) => paint("32", value),
  red: (value) => paint("31", value),
  yellow: (value) => paint("33", value),
};

function paint(code, value) {
  if (!supportsColor) return value;
  return `\x1b[${code}m${value}\x1b[0m`;
}

function elapsedMs(startedAt) {
  return `${Math.round(Number(process.hrtime.bigint() - startedAt) / 1_000_000)} ms`;
}

function readCache() {
  try {
    const parsed = JSON.parse(readFileSync(cachePath, "utf8"));
    return parsed.version === 1 && parsed.packages
      ? parsed
      : { version: 1, packages: {} };
  } catch {
    return { version: 1, packages: {} };
  }
}

function writeCache(cache) {
  mkdirSync(dirname(cachePath), { recursive: true });
  writeFileSync(cachePath, `${JSON.stringify(cache, null, 2)}\n`);
}

function collectFiles(directory, files = []) {
  if (!existsSync(directory)) return files;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (["build", "dist", "node_modules", ".cache"].includes(entry.name))
      continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) collectFiles(path, files);
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function packageFingerprint(packageName, config, fingerprints) {
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
    hash.update(
      `dependency:${dependency}:${fingerprints.get(dependency) ?? "missing"}\n`,
    );
  }
  for (const path of files) {
    hash.update(`file:${relative(repoRoot, path).replaceAll("\\", "/")}\n`);
    hash.update(readFileSync(path));
  }
  return hash.digest("hex");
}

function outputsExist(config) {
  return config.outputs.every((output) => {
    const path = resolve(config.cwd, output);
    return (
      existsSync(path) &&
      statSync(path).isDirectory() &&
      readdirSync(path).length > 0
    );
  });
}

function cleanPackage(cwd) {
  for (const directory of ["build", "dist"]) {
    const target = resolve(cwd, directory);
    if (!target.startsWith(`${cwd}\\`) && target !== cwd) {
      throw new Error(`Refusing to clean outside package: ${target}`);
    }
    rmSync(target, { recursive: true, force: true });
  }
  return { status: 0 };
}

function runTsc(project) {
  return (cwd) =>
    spawnSync(process.execPath, [tscBin, "-p", project], {
      cwd,
      env: process.env,
      shell: false,
      stdio: "inherit",
    });
}

function runRollup(config) {
  return (cwd) =>
    spawnSync(
      process.execPath,
      [
        rollupBin,
        "--silent",
        "-c",
        config,
        "--configPlugin",
        "@rollup/plugin-swc",
      ],
      { cwd, env: process.env, shell: false, stdio: "inherit" },
    );
}

function runNodeScript(script, scriptArgs) {
  return (cwd) =>
    spawnSync(process.execPath, [resolve(repoRoot, script), ...scriptArgs], {
      cwd,
      env: process.env,
      shell: false,
      stdio: "inherit",
    });
}

function runPackageNodeScript(script, scriptArgs) {
  return (cwd) =>
    spawnSync(process.execPath, [resolve(cwd, script), ...scriptArgs], {
      cwd,
      env: process.env,
      shell: false,
      stdio: "inherit",
    });
}

function printHeader() {
  console.log("");
  console.log(`${color.cyan("|")} ${color.bold("Reflex build")}`);
  console.log(
    `${color.cyan("|")} packages ${color.green(String(packages.length))}`,
  );
  console.log(
    `${color.cyan("L")} mode     ${color.dim(force ? "force" : "incremental")}`,
  );
}

function runPhase(cwd, phaseName, phase) {
  const startedAt = process.hrtime.bigint();
  console.log(`${color.cyan("|")} ${phaseName}`);
  let result;
  try {
    result = phase(cwd);
  } catch (error) {
    console.log(
      `${color.red("L")} ${phaseName} failed ${color.dim(elapsedMs(startedAt))}`,
    );
    console.error(
      `${color.red("|")} ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
    return false;
  }
  if (result.status !== 0) {
    console.log(
      `${color.red("L")} ${phaseName} failed ${color.dim(elapsedMs(startedAt))}`,
    );
    if (result.error)
      console.error(`${color.red("|")} ${result.error.message}`);
    process.exitCode = result.status ?? 1;
    return false;
  }
  console.log(
    `${color.cyan("L")} ${phaseName} ok ${color.dim(elapsedMs(startedAt))}`,
  );
  return true;
}

function runPackage(packageName, index, cache, fingerprints) {
  const startedAt = process.hrtime.bigint();
  const config = packageConfigs.get(packageName);
  if (!config) {
    console.error(
      `${color.red("|")} Unknown package in build chain: ${packageName}`,
    );
    process.exitCode = 1;
    return false;
  }

  const fingerprint = packageFingerprint(packageName, config, fingerprints);
  fingerprints.set(packageName, fingerprint);
  console.log("");
  console.log(
    `${color.cyan("|")} step ${color.green(`${index + 1}/${packages.length}`)} ${color.bold(packageName)}`,
  );

  if (
    !force &&
    cache.packages[packageName]?.fingerprint === fingerprint &&
    outputsExist(config)
  ) {
    console.log(
      `${color.yellow("L")} cached  ${color.dim(fingerprint.slice(0, 12))}`,
    );
    return true;
  }

  for (const [phaseName, phase] of config.phases) {
    if (!runPhase(config.cwd, phaseName, phase)) {
      console.log(
        `${color.red("L")} failed  ${color.dim(elapsedMs(startedAt))}`,
      );
      return false;
    }
  }

  cache.packages[packageName] = { fingerprint };
  writeCache(cache);
  console.log(`${color.cyan("L")} built   ${color.dim(elapsedMs(startedAt))}`);
  return true;
}

if (packages.length === 0) {
  console.error("Expected at least one package name.");
  process.exit(1);
}

const unknown = packages.filter(
  (packageName) => !packageConfigs.has(packageName),
);
if (unknown.length > 0) {
  console.error(`Unknown package in build chain: ${unknown.join(", ")}`);
  process.exit(1);
}

const positions = new Map(
  packages.map((packageName, index) => [packageName, index]),
);
for (const packageName of packages) {
  for (const dependency of packageConfigs.get(packageName).dependencies) {
    if (
      positions.has(dependency) &&
      positions.get(dependency) > positions.get(packageName)
    ) {
      console.error(`${dependency} must be listed before ${packageName}.`);
      process.exit(1);
    }
  }
}

const startedAt = process.hrtime.bigint();
const cache = readCache();
const fingerprints = new Map();
printHeader();
for (let index = 0; index < packages.length; index += 1) {
  if (!runPackage(packages[index], index, cache, fingerprints))
    process.exit(process.exitCode);
}
console.log("");
console.log(`${color.green("L")} complete ${color.dim(elapsedMs(startedAt))}`);
