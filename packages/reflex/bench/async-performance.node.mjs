import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const outputDir = resolve(packageRoot, ".cache/async-performance");
const baselineDir = resolve(outputDir, "baseline");
const sourceFile = resolve(packageRoot, "src/unstable/async.ts");
const scenarioFilter = process.env.REFLEX_ASYNC_BENCH_CASE;
const digest = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

if (process.argv.includes("--capture-baseline")) {
  if (existsSync(baselineDir)) throw new Error("An async performance baseline already exists; preserve it for comparison.");
  mkdirSync(outputDir, { recursive: true });
  cpSync(resolve(packageRoot, "dist/esm"), baselineDir, { recursive: true });
  writeFileSync(resolve(outputDir, "baseline.json"), JSON.stringify({
    sourceHash: digest(sourceFile),
    bundleHash: digest(resolve(baselineDir, "unstable/index.js")),
    capturedAt: new Date().toISOString(),
  }, null, 2));
  console.log(`Captured production ESM baseline at ${baselineDir}`);
} else if (process.argv.includes("--worker")) {
  await worker(resolve(process.argv[process.argv.indexOf("--worker") + 1]));
} else {
  if (!existsSync(baselineDir)) throw new Error("Build first, then capture a baseline with --capture-baseline before editing async.ts.");
  const rounds = Number(process.env.REFLEX_ASYNC_BENCH_ROUNDS ?? 3);
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 10) throw new Error("REFLEX_ASYNC_BENCH_ROUNDS must be 1–10.");
  const runs = { baseline: [], candidate: [] };
  let sharedIterations;
  for (let round = 0; round < rounds; ++round) {
    // Reverse order on alternate rounds to reduce systematic warm-machine bias.
    for (const name of round % 2 ? ["candidate", "baseline"] : ["baseline", "candidate"]) {
      const child = spawnSync(process.execPath, ["--expose-gc", fileURLToPath(import.meta.url),
        "--worker", name === "baseline" ? baselineDir : resolve(packageRoot, "dist/esm")], {
        encoding: "utf8", windowsHide: true, timeout: 60_000, maxBuffer: 4 * 1024 * 1024,
        env: { ...process.env, ...(sharedIterations === undefined ? {} : {
          REFLEX_ASYNC_BENCH_ITERATIONS: JSON.stringify(sharedIterations),
        }) },
      });
      if (child.error || child.status !== 0) throw new Error(`${name} benchmark failed: ${child.error ?? child.stderr}`);
      runs[name].push(JSON.parse(child.stdout));
      sharedIterations ??= Object.fromEntries(runs[name].at(-1).map(({ name: scenario, iterations }) => [scenario, iterations]));
      console.log(`${name}: round ${round + 1}/${rounds} complete`);
    }
  }
  const scenarios = runs.baseline[0].map((entry, index) => {
    const before = runs.baseline.flatMap((run) => run[index].nsPerOp);
    const after = runs.candidate.flatMap((run) => run[index].nsPerOp);
    return {
      name: entry.name,
      baselineNs: median(before), candidateNs: median(after),
      speedup: median(before) / median(after),
      baselineRangeNs: [Math.min(...before), Math.max(...before)],
      candidateRangeNs: [Math.min(...after), Math.max(...after)],
    };
  });
  const report = {
    node: process.version, platform: process.platform, cpu: cpus()[0]?.model,
    recordedAt: new Date().toISOString(), rounds, samplesPerRound: 7,
    scenarioFilter: scenarioFilter ?? null,
    iterations: sharedIterations,
    benchmarkHash: digest(fileURLToPath(import.meta.url)),
    baseline: JSON.parse(readFileSync(resolve(outputDir, "baseline.json"), "utf8")),
    candidate: { sourceHash: digest(sourceFile), bundleHash: digest(resolve(packageRoot, "dist/esm/unstable/index.js")) },
    scenarios, runs,
  };
  const reportName = scenarioFilter === undefined ? "report.json" :
    `report.${scenarioFilter.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}.json`;
  writeFileSync(resolve(outputDir, reportName), `${JSON.stringify(report, null, 2)}\n`);
  console.table(scenarios.map(({ name, baselineNs, candidateNs, speedup }) => ({
    scenario: name, "before ns/op": Math.round(baselineNs), "after ns/op": Math.round(candidateNs),
    speedup: `${speedup.toFixed(2)}x`,
  })));
}

async function worker(buildDir) {
  const { createRuntime, signal } = await import(pathToFileURL(resolve(buildDir, "index.js")));
  const { asyncDerived, pending } = await import(pathToFileURL(resolve(buildDir, "unstable/index.js")));
  const scenarios = [];
  const add = (name, setup) => scenarios.push({ name, setup });

  add("create / sync commit / dispose", () => ({
    run(count) {
      let sink = 0;
      for (let i = 0; i < count; ++i) { const source = asyncDerived(() => 1); sink += source.read(); source.dispose(); }
      return sink;
    }, close() {},
  }));
  add("sync refresh / read", () => {
    let value = 0;
    const source = asyncDerived(() => ++value);
    return { run(count) { let sink = 0; for (let i = 0; i < count; ++i) { source.refresh(); sink += source.read(); } return sink; },
      close() { source.dispose(); } };
  });
  add("fulfilled read", () => readWorkload([asyncDerived(() => 1)]));
  add("current committed projection", () => {
    const source = asyncDerived(() => 1);
    return { run(count) { let sink = 0; for (let i = 0; i < count; ++i) sink += source.currentOrUndefined(); return sink; },
      close() { source.dispose(); } };
  });
  add("chain of 8 / fulfilled read", () => {
    const sources = [asyncDerived(() => 1)];
    for (let i = 1; i < 8; ++i) { const parent = sources.at(-1); sources.push(asyncDerived(({ read }) => read(parent) + 1)); }
    return readWorkload(sources);
  });
  add("5 joined diamonds / fulfilled read", () => {
    const sources = [asyncDerived(() => 1)];
    for (let i = 0; i < 5; ++i) {
      const parent = sources.at(-1);
      const b = asyncDerived(({ read }) => read(parent) + 1);
      const c = asyncDerived(({ read }) => read(parent) + 2);
      sources.push(b, c, asyncDerived(({ read }) => read(b) + read(c)));
    }
    return readWorkload(sources);
  });
  add("16 sources / fulfilled fan-in read", () => {
    const sources = Array.from({ length: 16 }, () => asyncDerived(() => 1));
    sources.push(asyncDerived(({ read }) => sources.slice(0, 16).reduce((sum, source) => sum + read(source), 0)));
    return readWorkload(sources);
  });
  add("cached pending probe", () => {
    const source = asyncDerived(() => new Promise(() => {}));
    const probe = () => source.read();
    pending(probe);
    return { run(count) { let sink = 0; for (let i = 0; i < count; ++i) sink += Number(pending(probe)); return sink; },
      close() { source.dispose(); } };
  });
  add("dynamic dependency / sync refresh", () => {
    const sources = [asyncDerived(() => 1), asyncDerived(() => 2)];
    const choose = signal(false);
    const child = asyncDerived(({ read }) => read(sources[Number(choose())]));
    let turn = false;
    return { run(count) { let sink = 0; for (let i = 0; i < count; ++i) { choose.set(turn = !turn); sink += child.read(); } return sink; },
      close() { child.dispose(); sources.forEach((source) => source.dispose()); } };
  });
  add("promise refresh / await fresh result", () => {
    let value = 0;
    const source = asyncDerived(() => Promise.resolve(++value));
    return { async run(count) { let sink = 0; for (let i = 0; i < count; ++i) { source.refresh(); sink += await source.resolve(); } return sink; },
      close() { source.dispose(); } };
  });
  add("supersede pending attempts / drain", () => {
    let value = 0;
    const source = asyncDerived(() => Promise.resolve(++value));
    return { async run(count) {
      for (let i = 0; i < count; ++i) source.refresh();
      const result = await source.resolve();
      if (result !== value) throw new Error("Supersession benchmark published an obsolete result.");
      return result;
    }, close() { source.dispose(); } };
  });
  add("AbortController abort control", () => ({
    run(count) { for (let i = 0; i < count; ++i) new AbortController().abort(); return count; },
    close() {},
  }));
  add("cross-runtime fulfilled read", () => {
    const source = asyncDerived(() => 1);
    createRuntime();
    return readWorkload([source]);
  });

  function readWorkload(sources) {
    const target = sources.at(-1);
    const expected = target.read();
    return {
      run(count) {
        let sink = 0;
        for (let i = 0; i < count; ++i) sink += target.read();
        if (sink !== expected * count) throw new Error("Read benchmark changed its committed value.");
        return sink;
      }, close() { [...sources].reverse().forEach((source) => source.dispose()); },
    };
  }

  const results = [];
  const fixedIterations = JSON.parse(process.env.REFLEX_ASYNC_BENCH_ITERATIONS ?? "{}");
  const selected = scenarios.filter(({ name }) => scenarioFilter === undefined || name.includes(scenarioFilter));
  if (selected.length === 0) throw new Error(`No async benchmark matches ${scenarioFilter}.`);
  for (const { name, setup } of selected) {
    const rt = createRuntime();
    const workload = setup();
    let iterations = fixedIterations[name] ?? 512;
    try {
      // Calibrate to at least 20ms, after a short warmup, outside reported samples.
      for (let i = 0; i < 3; ++i) await workload.run(iterations);
      while (fixedIterations[name] === undefined && iterations < 1_048_576) {
        const start = performance.now(); await workload.run(iterations);
        if (performance.now() - start >= 20) break;
        iterations *= 2;
      }
      // Match the final batch size and warmup on both builds, including burst workloads.
      for (let i = 0; i < 3; ++i) await workload.run(iterations);
      const nsPerOp = [];
      for (let i = 0; i < 7; ++i) {
        rt.flush(); globalThis.gc?.();
        const start = performance.now();
        const sink = await workload.run(iterations);
        const elapsed = performance.now() - start;
        if (!Number.isFinite(sink)) throw new Error(`${name}: non-finite benchmark sink`);
        nsPerOp.push(elapsed * 1e6 / iterations);
      }
      results.push({ name, iterations, nsPerOp });
    } finally { workload.close(); rt.flush(); }
  }
  console.log(JSON.stringify(results));
}
