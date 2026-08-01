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
import { clearInterval, setInterval } from "node:timers";
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
const supportsDashboard =
  process.env.CI === undefined &&
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
  blue: (value) => paint("34", value),
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

function elapsedMilliseconds(startedAt) {
  return Number(process.hrtime.bigint() - startedAt) / 1_000_000;
}

function formatDuration(milliseconds) {
  if (milliseconds < 1_000) return `${Math.round(milliseconds)}ms`;
  if (milliseconds < 10_000) return `${(milliseconds / 1_000).toFixed(1)}s`;
  return `${(milliseconds / 1_000).toFixed(0)}s`;
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

function runCommand(command, commandArgs, cwd) {
  return new Promise((resolveCommand) => {
    const output = [];
    let settled = false;
    const child = spawn(command, commandArgs, {
      cwd,
      env: process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    const capture = (chunk) => output.push(chunk);
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
      resolveCommand({
        status: status ?? 1,
        signal,
        output: Buffer.concat(output),
      });
    });
  });
}

function runTsc(project) {
  return (cwd) => runCommand(process.execPath, [tscBin, "-p", project], cwd);
}

function runRollup(config) {
  return (cwd) =>
    runCommand(
      process.execPath,
      [
        rollupBin,
        "--silent",
        "-c",
        config,
        "--configPlugin",
        "@rollup/plugin-swc",
      ],
      cwd,
    );
}

function runNodeScript(script, scriptArgs) {
  return (cwd) =>
    runCommand(
      process.execPath,
      [resolve(repoRoot, script), ...scriptArgs],
      cwd,
    );
}

function runPackageNodeScript(script, scriptArgs) {
  return (cwd) =>
    runCommand(process.execPath, [resolve(cwd, script), ...scriptArgs], cwd);
}

function displayName(packageName) {
  const prefix = "@volynets/reflex-";
  if (packageName.startsWith(prefix)) return packageName.slice(prefix.length);
  return packageName.split("/").at(-1);
}

function statusSymbol(status) {
  switch (status) {
    case "building":
    case "running":
      return color.blue("▶");
    case "completed":
      return color.green("✓");
    case "cached":
      return color.yellow("⚡");
    case "failed":
      return color.red("✖");
    default:
      return color.dim("□");
  }
}

function createBuildState() {
  return {
    startedAt: process.hrtime.bigint(),
    packages: packages.map((packageName) => {
      const config = packageConfigs.get(packageName);
      return {
        name: packageName,
        label: displayName(packageName),
        config,
        state: "pending",
        startedAt: undefined,
        duration: undefined,
        phases: config.phases.map(([name, run]) => ({
          name,
          run,
          state: "pending",
          startedAt: undefined,
          duration: undefined,
        })),
      };
    }),
  };
}

function buildProgress(state) {
  const total = state.packages.reduce(
    (count, packageState) => count + packageState.phases.length,
    0,
  );
  const completed = state.packages.reduce((count, packageState) => {
    if (["completed", "cached"].includes(packageState.state)) {
      return count + packageState.phases.length;
    }
    return (
      count +
      packageState.phases.filter((phase) => phase.state === "completed").length
    );
  }, 0);
  return total === 0 ? 100 : Math.round((completed / total) * 100);
}

function buildCounts(state) {
  const count = (status) =>
    state.packages.filter((packageState) => packageState.state === status)
      .length;
  return {
    built: count("completed"),
    building: count("building"),
    cached: count("cached"),
    failed: count("failed"),
    pending: count("pending"),
  };
}

function currentDuration(item) {
  if (item.duration !== undefined) return item.duration;
  if (item.startedAt !== undefined) return elapsedMilliseconds(item.startedAt);
  return undefined;
}

function renderProgressBar(percent) {
  const width = Math.max(12, Math.min(31, (process.stdout.columns ?? 80) - 10));
  const complete = Math.round((width * percent) / 100);
  return `${color.green("━".repeat(complete))}${color.dim("━".repeat(width - complete))} ${String(percent).padStart(3)}%`;
}

function renderDashboard(state) {
  const counts = buildCounts(state);
  const finished = counts.built + counts.cached;
  const labelWidth = Math.max(
    7,
    ...state.packages.map((packageState) => packageState.label.length),
  );
  const lines = [
    `${color.cyan(color.bold("@reflex-build"))} ${color.dim(`[${finished}/${state.packages.length}]`)}`,
    "",
  ];

  for (const packageState of state.packages) {
    const duration = currentDuration(packageState);
    const suffix =
      packageState.state === "cached"
        ? color.dim("cached")
        : duration === undefined
          ? ""
          : color.dim(formatDuration(duration));
    const packageLabel = packageState.label.padEnd(labelWidth);
    const styledLabel =
      packageState.state === "pending"
        ? color.dim(packageLabel)
        : packageState.state === "building"
          ? color.bold(packageLabel)
          : packageLabel;
    lines.push(
      `${statusSymbol(packageState.state)} ${styledLabel}${suffix ? `  ${suffix}` : ""}`,
    );

    if (["building", "failed"].includes(packageState.state)) {
      for (const phase of packageState.phases) {
        const phaseDuration = currentDuration(phase);
        const phaseSuffix =
          phaseDuration === undefined
            ? ""
            : ` ${color.dim(formatDuration(phaseDuration))}`;
        const phaseLabel =
          phase.state === "pending"
            ? color.dim(phase.name)
            : phase.state === "running"
              ? color.blue(phase.name)
              : phase.name;
        lines.push(
          `    ${statusSymbol(phase.state)} ${phaseLabel}${phaseSuffix}`,
        );
      }
    }
  }

  const percent = buildProgress(state);
  lines.push(
    "",
    renderProgressBar(percent),
    "",
    `Built:    ${counts.built}`,
    `Cached:   ${counts.cached}`,
    `Building: ${counts.building}`,
    `Pending:  ${counts.pending}`,
  );
  if (counts.failed > 0) lines.push(`Failed:   ${counts.failed}`);
  lines.push(
    "",
    `${color.dim("Total:")} ${formatDuration(elapsedMilliseconds(state.startedAt))}`,
  );
  return lines.join("\n");
}

function createRenderer(state) {
  let renderedLines = 0;
  let timer;
  let stopped = false;

  function render() {
    if (!supportsDashboard || stopped) return;
    const output = renderDashboard(state);
    const lines = output.split("\n");
    if (renderedLines > 0) {
      process.stdout.write(`\x1b[${renderedLines}A\r`);
    }
    process.stdout.write(
      `${lines.map((line) => `\x1b[2K${line}`).join("\n")}\n\x1b[0J`,
    );
    renderedLines = lines.length;
  }

  return {
    start() {
      if (supportsDashboard) {
        process.stdout.write("\x1b[?25l");
        render();
        timer = setInterval(render, 100);
      } else {
        console.log(`@reflex-build [${state.packages.length} packages]`);
      }
    },
    update(message) {
      if (supportsDashboard) render();
      else console.log(message);
    },
    stop() {
      if (stopped) return;
      if (timer !== undefined) clearInterval(timer);
      if (supportsDashboard) {
        render();
        process.stdout.write("\x1b[?25h");
      } else {
        const counts = buildCounts(state);
        const failureSummary =
          counts.failed > 0 ? ` · ${counts.failed} failed` : "";
        console.log("");
        console.log(
          `${buildProgress(state)}% complete · ${counts.built} built · ${counts.cached} cached · ${counts.pending} pending${failureSummary}`,
        );
        console.log(
          `Total: ${formatDuration(elapsedMilliseconds(state.startedAt))}`,
        );
      }
      stopped = true;
    },
  };
}

async function runPhase(packageState, phase, renderer) {
  phase.state = "running";
  phase.startedAt = process.hrtime.bigint();
  renderer.update(`▶ ${packageState.label} › ${phase.name}`);

  let result;
  try {
    result = await phase.run(packageState.config.cwd);
  } catch (error) {
    result = { status: 1, error, output: Buffer.alloc(0) };
  }

  phase.duration = elapsedMilliseconds(phase.startedAt);
  if (result.status !== 0) {
    phase.state = "failed";
    renderer.update(`✖ ${packageState.label} › ${phase.name}`);
    return result;
  }

  phase.state = "completed";
  renderer.update(
    `✓ ${packageState.label} › ${phase.name} ${formatDuration(phase.duration)}`,
  );
  return undefined;
}

async function runPackage(packageState, cache, fingerprints, renderer) {
  const fingerprint = packageFingerprint(
    packageState.name,
    packageState.config,
    fingerprints,
  );
  fingerprints.set(packageState.name, fingerprint);

  if (
    !force &&
    cache.packages[packageState.name]?.fingerprint === fingerprint &&
    outputsExist(packageState.config)
  ) {
    packageState.state = "cached";
    renderer.update(`⚡ ${packageState.label} cached`);
    return undefined;
  }

  packageState.state = "building";
  packageState.startedAt = process.hrtime.bigint();
  renderer.update(`▶ ${packageState.label}`);

  for (const phase of packageState.phases) {
    const failure = await runPhase(packageState, phase, renderer);
    if (failure !== undefined) {
      packageState.state = "failed";
      packageState.duration = elapsedMilliseconds(packageState.startedAt);
      return { packageState, phase, result: failure };
    }
  }

  packageState.state = "completed";
  packageState.duration = elapsedMilliseconds(packageState.startedAt);
  cache.packages[packageState.name] = { fingerprint };
  writeCache(cache);
  renderer.update(
    `✓ ${packageState.label} ${formatDuration(packageState.duration)}`,
  );
  return undefined;
}

function printFailure(failure) {
  const { packageState, phase, result } = failure;
  console.error("");
  console.error(`${color.red("✖")} ${color.bold(phase.name)} failed`);
  console.error(color.dim(packageState.name));

  if (result.error) {
    console.error("");
    console.error(
      result.error instanceof Error
        ? result.error.message
        : String(result.error),
    );
  }
  const output = result.output?.toString("utf8").trimEnd();
  if (output) {
    console.error("");
    process.stderr.write(`${output}\n`);
  }
  if (result.signal) console.error(`Process terminated by ${result.signal}.`);
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

const cache = readCache();
const fingerprints = new Map();
const state = createBuildState();
const renderer = createRenderer(state);

process.on("exit", () => {
  if (supportsDashboard) process.stdout.write("\x1b[?25h");
});

renderer.start();
let failure;
try {
  for (const packageState of state.packages) {
    failure = await runPackage(packageState, cache, fingerprints, renderer);
    if (failure !== undefined) break;
  }
} finally {
  renderer.stop();
}

if (failure !== undefined) {
  printFailure(failure);
  process.exitCode = failure.result.status ?? 1;
}
