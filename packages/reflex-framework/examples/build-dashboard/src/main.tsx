import { clearInterval, setInterval } from "node:timers";
import {
  buildCounts,
  buildProgress,
  createBuildState,
  elapsedMilliseconds,
  force,
  formatDuration,
  outputsExist,
  packageConfigs,
  packageFingerprint,
  readCache,
  requestedPackages,
  type BuildCache,
  type BuildState,
  type PackageStatus,
  type PhaseStatus,
  type CommandResult,
  writeCache,
} from "./model";
import { supportsDashboard, paint } from "./terminal";
import { renderTerminal } from "./terminal";
import { Dashboard } from "./view";

function createRenderer(state: BuildState) {
  let renderedLines = 0;
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;

  function render() {
    if (!supportsDashboard || stopped) return;
    const output = renderTerminal(<Dashboard state={state} />);
    const lines = output.split("\n");
    if (renderedLines > 0) process.stdout.write(`\x1b[${renderedLines}A\r`);
    process.stdout.write(`${lines.map((line) => `\x1b[2K${line}`).join("\n")}\n\x1b[0J`);
    renderedLines = lines.length;
  }

  return {
    start() {
      if (supportsDashboard) {
        process.stdout.write("\x1b[?25l");
        render();
        timer = setInterval(render, 100);
      } else {
        process.stdout.write(`@reflex-build [${state.packages.length} packages]\n`);
      }
    },
    update(message: string) {
      if (supportsDashboard) render();
      else process.stdout.write(`${message}\n`);
    },
    stop() {
      if (stopped) return;
      if (timer !== undefined) clearInterval(timer);
      if (supportsDashboard) {
        render();
        process.stdout.write("\x1b[?25h");
      } else {
        const counts = buildCounts(state);
        const failureSummary = counts.failed > 0 ? ` В· ${counts.failed} failed` : "";
        process.stdout.write("\n");
        process.stdout.write(`${buildProgress(state)}% complete В· ${counts.built} built В· ${counts.cached} cached В· ${counts.pending} pending${failureSummary}\n`);
        process.stdout.write(`Total: ${formatDuration(elapsedMilliseconds(state.startedAt))}\n`);
      }
      stopped = true;
    },
  };
}

type Renderer = ReturnType<typeof createRenderer>;

async function runPhase(packageState: PackageStatus, phase: PhaseStatus, renderer: Renderer): Promise<CommandResult | undefined> {
  phase.state = "running";
  phase.startedAt = process.hrtime.bigint();
  renderer.update(`в–¶ ${packageState.label} вЂє ${phase.name}`);

  let result: CommandResult;
  try {
    result = await phase.run(packageState.config.cwd);
  } catch (error) {
    result = { status: 1, error, output: Buffer.alloc(0) };
  }

  phase.duration = elapsedMilliseconds(phase.startedAt);
  if (result.status !== 0) {
    phase.state = "failed";
    renderer.update(`вњ– ${packageState.label} вЂє ${phase.name}`);
    return result;
  }

  phase.state = "completed";
  renderer.update(`вњ“ ${packageState.label} вЂє ${phase.name} ${formatDuration(phase.duration)}`);
  return undefined;
}

async function runPackage(packageState: PackageStatus, cache: BuildCache, fingerprints: Map<string, string>, renderer: Renderer) {
  const fingerprint = packageFingerprint(packageState.name, packageState.config, fingerprints);
  fingerprints.set(packageState.name, fingerprint);

  if (!force && cache.packages[packageState.name]?.fingerprint === fingerprint && outputsExist(packageState.config)) {
    packageState.state = "cached";
    renderer.update(`вљЎ ${packageState.label} cached`);
    return undefined;
  }

  packageState.state = "building";
  packageState.startedAt = process.hrtime.bigint();
  renderer.update(`в–¶ ${packageState.label}`);

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
  renderer.update(`вњ“ ${packageState.label} ${formatDuration(packageState.duration)}`);
  return undefined;
}

function printFailure(failure: Awaited<ReturnType<typeof runPackage>>): void {
  if (failure === undefined) return;
  const { packageState, phase, result } = failure;
  console.error("");
  console.error(`${paint("red", "вњ–")} ${paint("bold", phase.name)} failed`);
  console.error(paint("dim", packageState.name));

  if (result.error) {
    console.error("");
    console.error(result.error instanceof Error ? result.error.message : String(result.error));
  }
  const output = result.output?.toString("utf8").trimEnd();
  if (output) {
    console.error("");
    process.stderr.write(`${output}\n`);
  }
  if (result.signal) console.error(`Process terminated by ${result.signal}.`);
}

if (requestedPackages.length === 0) {
  console.error("Expected at least one package name.");
  process.exit(1);
}

const unknown = requestedPackages.filter((packageName) => !packageConfigs.has(packageName));
if (unknown.length > 0) {
  console.error(`Unknown package in build chain: ${unknown.join(", ")}`);
  process.exit(1);
}

const positions = new Map(requestedPackages.map((packageName, index) => [packageName, index]));
for (const packageName of requestedPackages) {
  for (const dependency of packageConfigs.get(packageName)?.dependencies ?? []) {
    if (positions.has(dependency) && (positions.get(dependency) ?? 0) > (positions.get(packageName) ?? 0)) {
      console.error(`${dependency} must be listed before ${packageName}.`);
      process.exit(1);
    }
  }
}

const cache = readCache();
const fingerprints = new Map<string, string>();
const state = createBuildState(requestedPackages);
const renderer = createRenderer(state);

process.on("exit", () => {
  if (supportsDashboard) process.stdout.write("\x1b[?25h");
});

renderer.start();
let failure: Awaited<ReturnType<typeof runPackage>>;
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
