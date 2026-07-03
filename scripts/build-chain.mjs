import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packages = process.argv.slice(2);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
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
      phases: [
        ["clean", cleanPackage],
        ["typescript", runTsc("tsconfig.build.json")],
        ["aliases", runPackageNodeScript("scripts/rewrite-build-aliases.mjs", [])],
        ["globals", runNodeScript("scripts/write-globals-dts.mjs", ["."])],
        ["bundle", runRollup("rollup.config.ts")],
      ],
    },
  ],
  [
    "@volynets/reflex",
    {
      cwd: resolve(repoRoot, "packages/reflex"),
      phases: [
        ["clean", cleanPackage],
        ["typescript", runTsc("tsconfig.build.json")],
        ["types", runRollup("rollup.dts.config.ts")],
        ["globals", runNodeScript("scripts/write-globals-dts.mjs", ["."])],
        ["subpaths", runPackageNodeScript("scripts/write-subpath-dts.mjs", ["."])],
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
};

function paint(code, value) {
  if (!supportsColor) return value;
  return `\x1b[${code}m${value}\x1b[0m`;
}

function elapsedMs(startedAt) {
  return `${Math.round(Number(process.hrtime.bigint() - startedAt) / 1_000_000)} ms`;
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
  return (cwd) => {
    return spawnSync(process.execPath, [tscBin, "-p", project], {
      cwd,
      env: process.env,
      shell: false,
      stdio: "inherit",
    });
  };
}

function runRollup(config) {
  return (cwd) => {
    return spawnSync(
      process.execPath,
      [rollupBin, "--silent", "-c", config, "--configPlugin", "@rollup/plugin-swc"],
      {
        cwd,
        env: process.env,
        shell: false,
        stdio: "inherit",
      },
    );
  };
}

function runNodeScript(script, args) {
  return (cwd) => {
    return spawnSync(process.execPath, [resolve(repoRoot, script), ...args], {
      cwd,
      env: process.env,
      shell: false,
      stdio: "inherit",
    });
  };
}

function runPackageNodeScript(script, args) {
  return (cwd) => {
    return spawnSync(process.execPath, [resolve(cwd, script), ...args], {
      cwd,
      env: process.env,
      shell: false,
      stdio: "inherit",
    });
  };
}

function printHeader() {
  console.log("");
  console.log(`${color.cyan("|")} ${color.bold("Reflex build")}`);
  console.log(`${color.cyan("|")} packages ${color.green(String(packages.length))}`);
  console.log(`${color.cyan("L")} mode     ${color.dim(process.env.NODE_ENV ?? "production")}`);
}

function runPhase(packageName, cwd, phaseName, phase) {
  const startedAt = process.hrtime.bigint();

  console.log(`${color.cyan("|")} ${phaseName}`);

  let result;
  try {
    result = phase(cwd);
  } catch (error) {
    console.log(`${color.red("L")} ${phaseName} failed ${color.dim(elapsedMs(startedAt))}`);
    console.error(`${color.red("|")} ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
    return false;
  }

  if (result.status !== 0) {
    console.log(`${color.red("L")} ${phaseName} failed ${color.dim(elapsedMs(startedAt))}`);
    if (result.error) {
      console.error(`${color.red("|")} ${result.error.message}`);
    }

    process.exitCode = result.status ?? 1;
    return false;
  }

  console.log(`${color.cyan("L")} ${phaseName} ok ${color.dim(elapsedMs(startedAt))}`);
  return true;
}

function runPackage(packageName, index) {
  const startedAt = process.hrtime.bigint();
  const config = packageConfigs.get(packageName);

  if (!config) {
    console.error(`${color.red("|")} Unknown package in build chain: ${packageName}`);
    process.exitCode = 1;
    return false;
  }

  console.log("");
  console.log(
    `${color.cyan("|")} step ${color.green(`${index + 1}/${packages.length}`)} ${color.bold(packageName)}`,
  );

  for (const [phaseName, phase] of config.phases) {
    if (!runPhase(packageName, config.cwd, phaseName, phase)) {
      console.log(`${color.red("L")} failed  ${color.dim(elapsedMs(startedAt))}`);
      return false;
    }
  }

  console.log(`${color.cyan("L")} ok      ${color.dim(elapsedMs(startedAt))}`);
  return true;
}

if (packages.length === 0) {
  console.error("Expected at least one package name.");
  process.exit(1);
}

const startedAt = process.hrtime.bigint();
printHeader();

for (let index = 0; index < packages.length; index += 1) {
  if (!runPackage(packages[index], index)) {
    process.exit(process.exitCode);
  }
}

console.log("");
console.log(`${color.green("L")} complete ${color.dim(elapsedMs(startedAt))}`);
