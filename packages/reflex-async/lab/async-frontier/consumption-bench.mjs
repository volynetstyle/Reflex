import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { cpus } from "node:os";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { build } from "vite";
import {
  buildProduction,
  packageRoot,
  outputRoot,
} from "../async-semantics/build.mjs";

const out = resolve(packageRoot, ".cache/async-frontier");
const baseline = resolve(out, "production-baseline.mjs");
const probePath = resolve(out, "probe.mjs");
const productionPath = resolve(outputRoot, "P.mjs");
const median = (values) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const digest = (path) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");

if (process.argv.includes("--worker")) {
  const variant = process.argv[process.argv.indexOf("--worker") + 1];
  if (!["previous", "current"].includes(variant))
    throw new Error("Unknown variant");
  const api = await import(
    pathToFileURL(variant === "previous" ? baseline : productionPath)
  );
  const fixed = JSON.parse(process.env.REFLEX_CONSUMPTION_ITERATIONS ?? "{}");
  const scenarios = lifecycleScenarios(api);
  let qualification;
  if (variant === "current") {
    const probe = await import(pathToFileURL(probePath));
    qualification = qualifyOwnerPolicies(probe);
    scenarios.push(...primitiveScenarios(probe));
  }
  const results = [];
  for (const scenario of scenarios)
    results.push(await measure(scenario, fixed[scenario.name]));
  console.log(JSON.stringify({ qualification, results }));
} else {
  mkdirSync(out, { recursive: true });
  await buildProduction();
  if (process.argv.includes("--capture-baseline")) {
    if (existsSync(baseline))
      throw new Error(
        "Preserve the existing consumption baseline; it will not be overwritten.",
      );
    cpSync(productionPath, baseline);
    writeFileSync(
      resolve(out, "production-baseline.json"),
      JSON.stringify(
        {
          recordedAt: new Date().toISOString(),
          bundleHash: digest(baseline),
        },
        null,
        2,
      ),
    );
    console.log(`Captured ${baseline}`);
    process.exit(0);
  }
  await buildProbe();
  const rounds = Number(process.env.REFLEX_CONSUMPTION_ROUNDS ?? 3);
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 10)
    throw new Error("Rounds must be 1–10");
  const variants = existsSync(baseline) ? ["previous", "current"] : ["current"];
  const runs = Object.fromEntries(variants.map((name) => [name, []]));
  const child = promisify(execFile);
  let fixed;
  for (let round = 0; round < rounds; ++round) {
    for (const variant of round % 2 ? [...variants].reverse() : variants) {
      const { stdout } = await child(
        process.execPath,
        ["--expose-gc", fileURLToPath(import.meta.url), "--worker", variant],
        {
          windowsHide: true,
          timeout: 180_000,
          maxBuffer: 8 * 1024 * 1024,
          env: {
            ...process.env,
            ...(fixed === undefined
              ? {}
              : { REFLEX_CONSUMPTION_ITERATIONS: JSON.stringify(fixed) }),
          },
        },
      );
      const run = JSON.parse(stdout);
      runs[variant].push(run);
      fixed = {
        ...fixed,
        ...Object.fromEntries(
          run.results.map((entry) => [entry.name, entry.iterations]),
        ),
      };
      console.log(
        `${variant}: consumption round ${round + 1}/${rounds} complete`,
      );
    }
  }
  const results = Object.fromEntries(
    variants.map((variant) => [
      variant,
      runs[variant][0].results.map((entry) => {
        const times = runs[variant].flatMap(
          (run) =>
            run.results.find((item) => item.name === entry.name).sampleNs,
        );
        return {
          name: entry.name,
          phase: entry.phase,
          iterations: entry.iterations,
          medianNs: median(times),
          rangeNs: [Math.min(...times), Math.max(...times)],
        };
      }),
    ]),
  );
  const report = {
    recordedAt: new Date().toISOString(),
    node: process.version,
    cpu: cpus()[0]?.model,
    platform: process.platform,
    rounds,
    samplesPerRound: 7,
    methodology:
      "isolated process per build/round, alternating order, identical calibrated iterations; lifecycle uses P bundles with the same publication-observer instrumentation; primitive uses actual frontier/Attempt code",
    benchmarkHash: digest(fileURLToPath(import.meta.url)),
    bundleHashes: {
      current: digest(productionPath),
      ...(existsSync(baseline) ? { previous: digest(baseline) } : {}),
      probe: digest(probePath),
    },
    sourceHashes: Object.fromEntries(
      ["frontier", "attempt", "evaluation", "source"].map((name) => [
        name,
        digest(resolve(packageRoot, `src/async/${name}.ts`)),
      ]),
    ),
    qualification: runs.current[0].qualification,
    results,
    runs,
  };
  const reportPath = resolve(out, "consumption-report.json");
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.table(
    results.current.map((entry) => {
      const before = results.previous?.find((item) => item.name === entry.name);
      return {
        scenario: entry.name,
        "previous ns/op": before && Math.round(before.medianNs),
        "current ns/op": Math.round(entry.medianNs),
        ratio: before && (before.medianNs / entry.medianNs).toFixed(2),
      };
    }),
  );
  console.log(JSON.stringify(report.qualification, null, 2));
  console.log(`Report: ${reportPath}`);
}

async function buildProbe() {
  const runtimeRoot = resolve(packageRoot, "../reflex-runtime/src");
  await build({
    configFile: false,
    root: packageRoot,
    logLevel: "error",
    resolve: {
      alias: [
        { find: "@runtime", replacement: runtimeRoot },
        {
          find: "@volynets/reflex-runtime/internal",
          replacement: resolve(runtimeRoot, "internal/index.ts"),
        },
        {
          find: "@volynets/reflex-scheduler",
          replacement: resolve(packageRoot, "../reflex-scheduler/src/index.ts"),
        },
      ],
    },
    define: {
      __DEV__: "false",
      __PROFILE__: "false",
      __TEST__: "false",
      __PROD__: "true",
      __TRACKING_ONE_HOP__: "true",
      __TRACKING_TWO_HOP__: "true",
      __TRACKING_LAST_EDGE__: "true",
    },
    esbuild: { platform: "node" },
    build: {
      target: "esnext",
      minify: false,
      emptyOutDir: false,
      outDir: out,
      lib: {
        entry: resolve(packageRoot, "lab/async-frontier/probe-entry.ts"),
        formats: ["es"],
        fileName: () => "probe.mjs",
      },
    },
  });
}

async function measure(scenario, fixed) {
  const work = await scenario.setup();
  let iterations = fixed ?? 32;
  try {
    for (let i = 0; i < 3; ++i) await work.run(iterations);
    while (fixed === undefined && iterations < 65_536) {
      const start = performance.now();
      await work.run(iterations);
      if (performance.now() - start >= 15) break;
      iterations *= 2;
    }
    for (let i = 0; i < 3; ++i) await work.run(iterations);
    const sampleNs = [];
    for (let i = 0; i < 7; ++i) {
      work.flush?.();
      globalThis.gc?.();
      const start = performance.now();
      const sink = await work.run(iterations);
      sampleNs.push(((performance.now() - start) * 1e6) / iterations);
      if (!Number.isFinite(sink))
        throw new Error(`${scenario.name}: invalid sink`);
    }
    return { name: scenario.name, phase: scenario.phase, iterations, sampleNs };
  } finally {
    await work.close?.();
    work.flush?.();
  }
}

function lifecycleScenarios(api) {
  const {
    asyncDerived,
    derive,
    computed,
    signal,
    createRuntime,
    AsyncBlocker,
  } = api;
  const cases = [];
  const add = (name, setup) =>
    cases.push({
      name,
      phase: "lifecycle",
      async setup() {
        const runtime = createRuntime({ effectStrategy: "flush" });
        const sources = [];
        const source = (job) => {
          const node = asyncDerived(job);
          sources.push(node);
          return node;
        };
        const run = await setup({ source, runtime });
        return {
          run,
          flush: () => runtime.flush(),
          close: () => sources.reverse().forEach((node) => node.dispose()),
        };
      },
    });
  const assertValue = (value, expected) => {
    if (value !== expected)
      throw new Error(`Expected ${expected}, got ${value}`);
  };
  const isPending = (target) => {
    try {
      target.read();
    } catch (error) {
      if (error instanceof AsyncBlocker) return;
      throw error;
    }
    throw new Error("Attempt unexpectedly published");
  };

  add("sync derived chain d16", () => {
    const input = signal(0);
    let tail = computed(input);
    for (let i = 0; i < 16; ++i) {
      const parent = tail;
      tail = computed(() => parent() + 1);
    }
    let tick = 0;
    return (count) => {
      let sum = 0;
      for (let i = 0; i < count; ++i) {
        input.set(++tick);
        const value = tail();
        assertValue(value, tick + 16);
        sum += value;
      }
      return sum;
    };
  });
  for (const promise of [false, true])
    add(
      `async ${promise ? "Promise" : "sync-result"} chain d8`,
      async ({ source }) => {
        const input = signal(0);
        let tail = source(promise ? () => Promise.resolve(input()) : input);
        await tail.resolve();
        for (let i = 0; i < 8; ++i) {
          const parent = tail;
          tail = source(({ read }) => {
            const value = read(parent) + 1;
            return promise ? Promise.resolve(value) : value;
          });
          await tail.resolve();
        }
        let tick = 0;
        return async (count) => {
          let sum = 0;
          for (let i = 0; i < count; ++i) {
            input.set(++tick);
            const value = promise ? await tail.resolve() : tail.read();
            assertValue(value, tick + 8);
            sum += value;
          }
          return sum;
        };
      },
    );
  add("cached sync bridge d64 / capture + publication", ({ source }) => {
    const roots = Array.from({ length: 64 }, (_, i) => source(() => i));
    let tail = derive(() => roots[0].read());
    for (let i = 1; i < roots.length; ++i) {
      const parent = tail;
      const root = roots[i];
      tail = derive(() => parent() + root.read());
    }
    tail();
    const target = source(tail);
    return (count) => {
      let sum = 0;
      for (let i = 0; i < count; ++i) {
        target.refresh();
        const value = target.read();
        assertValue(value, 2016);
        sum += value;
      }
      return sum;
    };
  });
  add("diamond / invalidation + publication", ({ source }) => {
    const input = signal(0);
    const root = source(input);
    const left = derive(() => root.read() + 1);
    const right = derive(() => root.read() + 2);
    const target = source(() => left() + right());
    let tick = 0;
    return (count) => {
      let sum = 0;
      for (let i = 0; i < count; ++i) {
        input.set(++tick);
        const value = target.read();
        assertValue(value, tick * 2 + 3);
        sum += value;
      }
      return sum;
    };
  });
  add("dynamic branch / invalidation + publication", ({ source }) => {
    const roots = [source(() => 1), source(() => 2)];
    const choose = signal(false);
    const bridge = derive(() => roots[Number(choose())].read());
    const target = source(bridge);
    let branch = false;
    return (count) => {
      let sum = 0;
      for (let i = 0; i < count; ++i) {
        choose.set((branch = !branch));
        const value = target.read();
        assertValue(value, branch ? 2 : 1);
        sum += value;
      }
      return sum;
    };
  });
  add("blocked candidate / publication retry", ({ source }) => {
    let settleRoot;
    let settleCandidate;
    let target;
    const root = source(() =>
      settleRoot === undefined
        ? 7
        : new Promise((resolve) => {
            settleRoot = resolve;
          }),
    );
    const bridge = derive(root.read);
    bridge();
    target = source(() => {
      const value = api.untracked(bridge);
      return new Promise((resolve) => {
        settleCandidate = () => resolve(value);
      });
    });
    return async (count) => {
      let sum = 0;
      for (let i = 0; i < count; ++i) {
        target.refresh();
        // Mark the root pending without changing the previously published read edge.
        settleRoot = () => {};
        root.refresh();
        settleCandidate();
        // Run the candidate's completion checkpoints and leave it blocked on root.
        for (let turn = 0; turn < 8; ++turn) await Promise.resolve();
        if (target.attempt() === undefined)
          throw new Error("Blocked candidate published early");
        isPending(target);
        const finishRoot = settleRoot;
        settleRoot = undefined;
        finishRoot(7);
        const value = await target.resolve();
        assertValue(value, 7);
        sum += value;
      }
      return sum;
    };
  });
  add("supersession / pending capture + drain", ({ source }) => {
    let tick = 0;
    const target = source(() => Promise.resolve(++tick));
    return async (count) => {
      for (let i = 0; i < count; ++i) {
        target.refresh();
        target.refresh();
      }
      const value = await target.resolve();
      assertValue(value, tick);
      return value;
    };
  });
  for (const pulls of [0, 1, 4, 16])
    add(`pending attempt / ${pulls} prepublication pulls d64`, ({ source }) => {
      const roots = Array.from({ length: 64 }, () => source(() => 1));
      let bridge = derive(roots[0].read);
      for (let i = 1; i < roots.length; ++i) {
        const parent = bridge;
        const root = roots[i];
        bridge = derive(() => parent() + root.read());
      }
      bridge();
      let settle;
      const target = source(() => {
        const value = bridge();
        return new Promise((resolve) => {
          settle = () => resolve(value);
        });
      });
      return async (count) => {
        let sum = 0;
        for (let i = 0; i < count; ++i) {
          target.refresh();
          for (let pull = 0; pull < pulls; ++pull) isPending(target);
          settle();
          const value = await target.resolve();
          assertValue(value, 64);
          sum += value;
        }
        return sum;
      };
    });
  return cases;
}

function proofChain(api, depth = 64, dependencies) {
  const deps =
    dependencies ??
    Array.from({ length: depth }, () => ({
      [api.FRONTIER_STATE]: api.createFreshnessState(),
      ensure() {},
      validate() {},
    }));
  let proof = api.EMPTY_FRONTIER;
  for (const dep of deps) {
    const builder = new api.FrontierBuilder();
    builder.merge(proof);
    builder.add(dep);
    proof = builder.snapshot();
  }
  return { proof, deps };
}

function primitiveScenarios(api) {
  const cases = [];
  const add = (name, setup) => cases.push({ name, phase: "primitive", setup });
  for (const attempts of [1, 2, 8, 64]) {
    for (const policy of ["attempt-local", "global-WeakMap"])
      add(`shared proof / ${attempts} attempts / ${policy}`, () => {
        const { proof } = proofChain(api);
        const cache = new WeakMap();
        return {
          run(count) {
            let sum = 0;
            for (let i = 0; i < count; ++i)
              for (let j = 0; j < attempts; ++j) {
                // All independent attempts intentionally inherit the identical proof root.
                const attempt = new api.Attempt(j, () => true);
                attempt.frontier = proof;
                let vector;
                if (policy === "attempt-local")
                  vector = attempt.publicationFrontier();
                else {
                  vector = cache.get(proof);
                  if (vector === undefined) {
                    vector = api.materializeFrontier(proof);
                    cache.set(proof, vector);
                  }
                }
                sum += vector.length;
              }
            return sum;
          },
        };
      });
  }
  for (const pulls of [1, 4, 16]) {
    for (const policy of ["walk", "second-pull-vector"])
      add(`pure freshness / ${pulls} pulls / ${policy}`, () => {
        let ensured = 0;
        const deps = Array.from({ length: 64 }, () => ({
          [api.FRONTIER_STATE]: api.createFreshnessState(),
          ensure() {
            ++ensured;
          },
          validate() {},
        }));
        const { proof } = proofChain(api, 64, deps);
        return {
          run(count) {
            ensured = 0;
            for (let i = 0; i < count; ++i) {
              let vector;
              for (let pull = 0; pull < pulls; ++pull) {
                if (policy === "second-pull-vector" && pull === 1)
                  vector = api.materializeFrontier(proof);
                if (vector === undefined)
                  api.forEachDependency(proof, (dep) => dep.ensure());
                else for (const dep of vector) dep.ensure();
              }
            }
            if (ensured !== count * pulls * 64)
              throw new Error("Freshness pull lost a dependency");
            return ensured;
          },
        };
      });
  }
  for (const policy of ["A traversal", "B deferred", "C cached-vector"]) {
    for (const phase of ["capture", "capture + publication"])
      add(`owner / ${policy} / ${phase}`, () => {
        const { proof } = proofChain(api);
        const owner = {
          [api.FRONTIER_STATE]: api.createFreshnessState(),
          ensure() {},
          validate() {},
        };
        const cached =
          policy === "C cached-vector"
            ? api.materializeFrontier(proof)
            : undefined;
        return {
          run(count) {
            let sum = 0;
            for (let i = 0; i < count; ++i) {
              const builder = new api.FrontierBuilder(
                policy === "A traversal" ? owner : undefined,
              );
              if (cached?.includes(owner))
                throw new api.AsyncProtocolError("cycle");
              builder.merge(proof);
              const captured = builder.snapshot();
              if (phase === "capture + publication") {
                const vector = api.materializeFrontier(captured);
                // B checks the owner at materialization, before effectful validation.
                if (policy === "B deferred" && vector.includes(owner))
                  throw new api.AsyncProtocolError("cycle");
                for (const dep of vector) dep.validate();
                sum += vector.length;
              } else ++sum;
            }
            return sum;
          },
        };
      });
  }
  return cases;
}

function qualifyOwnerPolicies(api) {
  const owner = {
    [api.FRONTIER_STATE]: api.createFreshnessState(),
    ensure() {},
    validate() {},
  };
  const { proof } = proofChain(api, 3, [
    {
      [api.FRONTIER_STATE]: api.createFreshnessState(),
      ensure() {},
      validate() {},
    },
    owner,
    {
      [api.FRONTIER_STATE]: api.createFreshnessState(),
      ensure() {},
      validate() {},
    },
  ]);
  const results = {};
  for (const policy of ["A traversal", "B deferred", "C cached-vector"]) {
    let continuedAfterMerge = false;
    let rejected = false;
    try {
      const builder = new api.FrontierBuilder(
        policy === "A traversal" ? owner : undefined,
      );
      if (
        policy === "C cached-vector" &&
        api.materializeFrontier(proof).includes(owner)
      )
        throw new api.AsyncProtocolError("cycle");
      builder.merge(proof);
      continuedAfterMerge = true;
      const vector = api.materializeFrontier(builder.snapshot());
      if (policy === "B deferred" && vector.includes(owner))
        throw new api.AsyncProtocolError("cycle");
    } catch (error) {
      if (!(error instanceof api.AsyncProtocolError)) throw error;
      rejected = true;
    }
    results[policy] = {
      rejectedHiddenOwner: rejected,
      continuedAfterMerge,
      preservesCaptureTimeFailure: rejected && !continuedAfterMerge,
    };
  }
  if (
    !results["A traversal"].preservesCaptureTimeFailure ||
    !results["C cached-vector"].preservesCaptureTimeFailure ||
    results["B deferred"].preservesCaptureTimeFailure
  )
    throw new Error(
      "Owner-policy qualification did not distinguish failure timing",
    );
  return results;
}
