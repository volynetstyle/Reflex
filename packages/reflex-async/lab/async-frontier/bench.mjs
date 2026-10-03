import { createHash } from "node:crypto";
import { cpus } from "node:os";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const root = fileURLToPath(new URL("../../", import.meta.url));
const outDir = resolve(root, ".cache/async-frontier");
const rounds = Number(process.env.REFLEX_FRONTIER_ROUNDS ?? 3);
const samples = Number(process.env.REFLEX_FRONTIER_SAMPLES ?? 5);
if (!Number.isInteger(rounds) || rounds < 1 || rounds > 10)
  throw new Error("Rounds must be 1–10");
if (!Number.isInteger(samples) || samples < 3 || samples > 15)
  throw new Error("Samples must be 3–15");

const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const range = (xs) => [Math.min(...xs), Math.max(...xs)];
const variants = ["set", "flat", "dag-set", "dag-epoch", "dag-flat"];

function dependency(id, stats) {
  return {
    id,
    validationEpoch: 0,
    validate() {
      ++stats.validationCalls;
    },
  };
}

function makeVariant(name, stats) {
  if (name === "set") {
    const empty = new Set();
    return {
      empty,
      builder(owner) {
        ++stats.allocations;
        const deps = new Set();
        return {
          add(dep) {
            if (dep === owner) throw new Error("Cyclic frontier in benchmark");
            deps.add(dep);
          },
          merge(frontier) {
            for (const dep of frontier) this.add(dep);
          },
          snapshot() {
            if (deps.size === 0) return empty;
            ++stats.allocations;
            return new Set(deps);
          },
        };
      },
      validate(frontier) {
        for (const dep of frontier) dep.validate();
      },
      makeValidator(frontier) {
        return () => {
          for (const dep of frontier) dep.validate();
        };
      },
      entries(frontier) {
        return [...frontier];
      },
    };
  }

  if (name === "flat") {
    const empty = [];
    return {
      empty,
      builder(owner) {
        ++stats.allocations;
        const deps = [];
        return {
          add(dep) {
            if (dep === owner) throw new Error("Cyclic frontier in benchmark");
            if (!deps.includes(dep)) deps.push(dep);
          },
          merge(frontier) {
            for (const dep of frontier) this.add(dep);
          },
          snapshot() {
            if (deps.length === 0) return empty;
            ++stats.allocations;
            return deps.slice();
          },
        };
      },
      validate(frontier) {
        for (const dep of frontier) dep.validate();
      },
      makeValidator(frontier) {
        return () => {
          for (const dep of frontier) dep.validate();
        };
      },
      entries(frontier) {
        return frontier;
      },
    };
  }

  const empty = { kind: 0 };
  const isDependency = (frontier) => frontier?.validate !== undefined;
  const containsDependency = (frontier, target) => {
    if (frontier === target) return true;
    ++stats.allocations;
    const stack = [frontier];
    ++stats.allocations;
    const visited = new Set();
    while (stack.length > 0) {
      const current = stack.pop();
      if (current === empty) continue;
      if (isDependency(current)) {
        if (current === target) return true;
      } else if (!visited.has(current)) {
        visited.add(current);
        if (current.kind === 1) {
          if (current.deps.includes(target)) return true;
        } else {
          for (let i = current.parts.length - 1; i >= 0; --i)
            stack.push(current.parts[i]);
        }
      }
    }
    return false;
  };
  const builder = (owner) => {
    ++stats.allocations;
    const direct = [];
    let directSet;
    let parts;
    let inheritedCount = 0;
    return {
      add(dep) {
        if (dep === owner) throw new Error("Cyclic frontier in benchmark");
        if (directSet !== undefined) {
          if (directSet.has(dep)) return;
          directSet.add(dep);
          direct.push(dep);
        } else {
          if (direct.includes(dep)) return;
          if (direct.length >= 4) {
            ++stats.allocations;
            directSet = new Set(direct);
            directSet.add(dep);
          }
          direct.push(dep);
        }
        parts?.push(dep);
      },
      merge(frontier) {
        if (frontier === empty) return;
        if (owner !== undefined && containsDependency(frontier, owner))
          throw new Error("Cyclic frontier in benchmark");
        if (parts === undefined) {
          ++stats.allocations;
          parts = direct.slice();
        }
        parts.push(frontier);
        ++inheritedCount;
      },
      snapshot() {
        if (parts === undefined) {
          if (direct.length === 0) return empty;
          if (direct.length === 1) return direct[0];
          ++stats.allocations;
          return { kind: 1, deps: direct.slice() };
        }
        if (direct.length === 0 && inheritedCount === 1) return parts[0];
        ++stats.allocations;
        return { kind: 2, parts: parts.slice() };
      },
    };
  };
  const entries = (frontier) => {
    ++stats.allocations;
    const deps = [];
    ++stats.allocations;
    const seenNodes = new Set();
    ++stats.allocations;
    const stack = [frontier];
    while (stack.length) {
      const current = stack.pop();
      if (current === empty) continue;
      if (isDependency(current)) {
        deps.push(current);
      } else if (current.kind === 1) {
        if (seenNodes.has(current)) continue;
        seenNodes.add(current);
        for (const dep of current.deps) deps.push(dep);
      } else {
        if (seenNodes.has(current)) continue;
        seenNodes.add(current);
        for (let i = current.parts.length - 1; i >= 0; --i)
          stack.push(current.parts[i]);
      }
    }
    return deps;
  };
  const materialize = (frontier) => {
    if (frontier === empty) return [];
    if (isDependency(frontier)) {
      ++stats.allocations;
      return [frontier];
    }
    if (frontier.kind === 1) {
      ++stats.allocations;
      return frontier.deps.slice();
    }
    const deps = entries(frontier);
    ++stats.allocations;
    const seen = new Set();
    let size = 0;
    for (const dep of deps) {
      if (seen.has(dep)) continue;
      seen.add(dep);
      deps[size++] = dep;
    }
    deps.length = size;
    return deps;
  };
  const variant = {
    empty,
    builder,
    entries,
    validate(frontier) {
      if (name === "dag-flat") {
        for (const dep of materialize(frontier)) dep.validate();
        return;
      }
      ++stats.allocations;
      const seenNodes = new Set();
      ++stats.allocations;
      const stack = [frontier];
      if (name === "dag-set") {
        ++stats.allocations;
        const seenDeps = new Set();
        while (stack.length) {
          const current = stack.pop();
          if (current === empty) continue;
          if (isDependency(current)) {
            if (!seenDeps.has(current)) {
              seenDeps.add(current);
              current.validate();
            }
          } else if (!seenNodes.has(current)) {
            seenNodes.add(current);
            if (current.kind === 1) stack.push(...current.deps);
            else {
              for (let i = current.parts.length - 1; i >= 0; --i)
                stack.push(current.parts[i]);
            }
          }
        }
        return;
      }
      const epoch = ++stats.epoch;
      while (stack.length) {
        const current = stack.pop();
        if (current === empty) continue;
        if (isDependency(current)) {
          if (current.validationEpoch !== epoch) {
            current.validationEpoch = epoch;
            current.validate();
          }
        } else if (!seenNodes.has(current)) {
          seenNodes.add(current);
          if (current.kind === 1) stack.push(...current.deps);
          else {
            for (let i = current.parts.length - 1; i >= 0; --i)
              stack.push(current.parts[i]);
          }
        }
      }
    },
    makeValidator(frontier) {
      if (name === "dag-flat") {
        let publicationFrontier;
        return () => {
          publicationFrontier ??= materialize(frontier);
          for (const dep of publicationFrontier) dep.validate();
        };
      }
      return () => variant.validate(frontier);
    },
  };
  return variant;
}

function builderFrom(variant, deps, children = [], owner) {
  const builder = variant.builder(owner);
  for (const dep of deps) builder.add(dep);
  for (const child of children) builder.merge(child);
  return builder.snapshot();
}

function scenarios(variant, stats) {
  const all = [];
  const addCapture = (name, iterations, make) =>
    all.push({ name, phase: "capture", iterations, make });
  const addPublication = (name, iterations, make) =>
    all.push({ name, phase: "publication", iterations, make });

  for (const depth of [1, 4, 16, 64, 256]) {
    const iterations = Math.max(24, Math.floor(8192 / depth));
    addCapture(`chain d${depth}`, iterations, () => {
      const deps = Array.from({ length: depth }, (_, i) =>
        dependency(i, stats),
      );
      return () => {
        let current = variant.empty;
        for (const dep of deps)
          current = builderFrom(variant, [dep], [current]);
        return current;
      };
    });
    addPublication(`chain d${depth}`, iterations, () => {
      const deps = Array.from({ length: depth }, (_, i) =>
        dependency(i, stats),
      );
      let current = variant.empty;
      for (const dep of deps) current = builderFrom(variant, [dep], [current]);
      const validate = variant.makeValidator(current);
      return () => validate();
    });
  }

  addCapture("attempt capture over chain d64", 128, () => {
    const deps = Array.from({ length: 64 }, (_, i) => dependency(i, stats));
    let base = variant.empty;
    for (const dep of deps) base = builderFrom(variant, [dep], [base]);
    const candidates = Array.from({ length: 130 }, (_, i) =>
      dependency(`candidate ${i}`, stats),
    );
    const owners = Array.from({ length: 130 }, (_, i) =>
      dependency(`owner ${i}`, stats),
    );
    let index = 0;
    return () => {
      const current = index++;
      return builderFrom(
        variant,
        [candidates[current]],
        [base],
        owners[current],
      );
    };
  });

  for (const validations of [1, 4]) {
    addPublication(`cold publication ${validations}x chain d64`, 128, () => {
      const deps = Array.from({ length: 64 }, (_, i) => dependency(i, stats));
      let base = variant.empty;
      for (const dep of deps) base = builderFrom(variant, [dep], [base]);
      const validators = Array.from({ length: 130 }, (_, i) => {
        const candidate = builderFrom(
          variant,
          [dependency(`candidate ${i}`, stats)],
          [base],
        );
        return variant.makeValidator(candidate);
      });
      let index = 0;
      return () => {
        const validate = validators[index++];
        for (let i = 0; i < validations; ++i) validate();
      };
    });
  }

  for (const depth of [1, 4, 16]) {
    const iterations = Math.max(32, Math.floor(4096 / depth));
    addCapture(`diamond d${depth}`, iterations, () => {
      const deps = Array.from({ length: depth * 2 }, (_, i) =>
        dependency(i, stats),
      );
      return () => {
        let current = variant.empty;
        for (let i = 0; i < depth; ++i) {
          const left = builderFrom(variant, [deps[i * 2]], [current]);
          const right = builderFrom(variant, [deps[i * 2 + 1]], [current]);
          current = builderFrom(variant, [], [left, right]);
        }
        return current;
      };
    });
    addPublication(`diamond d${depth}`, iterations, () => {
      const deps = Array.from({ length: depth * 2 }, (_, i) =>
        dependency(i, stats),
      );
      let current = variant.empty;
      for (let i = 0; i < depth; ++i) {
        const left = builderFrom(variant, [deps[i * 2]], [current]);
        const right = builderFrom(variant, [deps[i * 2 + 1]], [current]);
        current = builderFrom(variant, [], [left, right]);
      }
      const validate = variant.makeValidator(current);
      return () => validate();
    });
  }

  for (const width of [2, 4, 8, 16, 64]) {
    const iterations = Math.max(32, Math.floor(8192 / width));
    addCapture(`fan-in ${width}`, iterations, () => {
      const deps = Array.from({ length: width }, (_, i) =>
        dependency(i, stats),
      );
      return () => builderFrom(variant, deps);
    });
    addPublication(`fan-in ${width}`, iterations, () => {
      const deps = Array.from({ length: width }, (_, i) =>
        dependency(i, stats),
      );
      const snapshot = builderFrom(variant, deps);
      const validate = variant.makeValidator(snapshot);
      return () => validate();
    });
  }

  for (const reads of [1, 8, 64]) {
    const iterations = Math.max(32, Math.floor(8192 / reads));
    addCapture(`cached child reads ${reads}x`, iterations, () => {
      const dep = dependency(0, stats);
      const child = builderFrom(variant, [dep]);
      return () => {
        const builder = variant.builder();
        for (let i = 0; i < reads; ++i) builder.merge(child);
        return builder.snapshot();
      };
    });
  }

  addCapture("alternating branch", 4096, () => {
    const children = [0, 1].map((i) =>
      builderFrom(variant, [dependency(i, stats)]),
    );
    let branch = 0;
    return () => builderFrom(variant, [], [children[(branch ^= 1)]]);
  });

  addCapture("90% frontier drop (10 -> 1)", 256, () => {
    const deps = Array.from({ length: 10 }, (_, i) => dependency(i, stats));
    let wide = true;
    return () => {
      const snapshot = builderFrom(variant, wide ? deps : deps.slice(0, 1));
      wide = !wide;
      return snapshot;
    };
  });

  for (const retries of [1, 4]) {
    const iterations = Math.max(24, Math.floor(1024 / retries));
    addPublication(`warm blocked retry ${retries}x`, iterations, () => {
      const deps = Array.from({ length: 16 }, (_, i) => dependency(i, stats));
      const snapshot = builderFrom(variant, deps);
      const validate = variant.makeValidator(snapshot);
      return () => {
        for (let i = 0; i < retries; ++i) validate();
      };
    });
  }

  return all;
}

function checkCorrectness(variant, stats) {
  const expected = [0, 1, 2, 3, 4];
  const deps = expected.map((id) => dependency(id, stats));
  const shared = builderFrom(variant, deps.slice(0, 3));
  const root = builderFrom(variant, [deps[3]], [shared, shared]);
  const final = builderFrom(variant, [deps[4]], [root, shared]);
  if (
    variant
      .entries(final)
      .map((dep) => dep.id)
      .sort()
      .join() !== expected.join()
  )
    throw new Error("Frontier union produced the wrong dependency set");
  stats.validationCalls = 0;
  variant.validate(final);
  if (stats.validationCalls !== expected.length)
    throw new Error(
      `Expected ${expected.length} distinct validations, got ${stats.validationCalls}`,
    );

  // Reentrant validation uses the same frontier. Epoch markers can be overwritten by
  // the nested traversal, causing a duplicate in the outer pass; record this explicitly.
  const nestedStats = { allocations: 0, validationCalls: 0, epoch: 0 };
  const nestedVariant = makeVariant(variant.name, nestedStats);
  let nested = false;
  const b = dependency("b", nestedStats);
  const a = dependency("a", nestedStats);
  const originalValidate = a.validate;
  a.validate = () => {
    ++nestedStats.validationCalls;
    if (!nested) {
      nested = true;
      nestedVariant.validate(reentrantFrontier);
    }
  };
  const bLeaf = builderFrom(nestedVariant, [b]);
  const aLeaf = builderFrom(nestedVariant, [a]);
  const reentrantFrontier = builderFrom(
    nestedVariant,
    [],
    [bLeaf, aLeaf, bLeaf],
  );
  nestedStats.validationCalls = 0;
  nestedVariant.validate(reentrantFrontier);
  const nestedCounts = nestedStats.validationCalls;
  if (nestedCounts < 4)
    throw new Error("Reentrant validation was not exercised");
  a.validate = originalValidate;
  return {
    distinctDependencies: expected.length,
    reentrantValidationCalls: nestedCounts,
  };
}

function runScenario(scenario, iterations, rounds, samples) {
  const values = [];
  const allocations = [];
  let validationCount = 0;
  for (let round = 0; round < rounds; ++round) {
    for (let sample = 0; sample < samples; ++sample) {
      const work = scenario.make();
      for (let i = 0; i < 2; ++i) work();
      const beforeAllocations = scenario.stats.allocations;
      const beforeCalls = scenario.stats.validationCalls;
      const start = performance.now();
      for (let i = 0; i < iterations; ++i) work();
      values.push(((performance.now() - start) * 1e6) / iterations);
      allocations.push(
        (scenario.stats.allocations - beforeAllocations) / iterations,
      );
      validationCount += scenario.stats.validationCalls - beforeCalls;
    }
  }
  return {
    medianNs: med(values),
    rangeNs: range(values),
    allocationsPerOp: med(allocations),
    validationCalls: validationCount,
    sampleNs: values,
    sampleAllocations: allocations,
  };
}

function buildRetainedGraph(variant, stats, shape, depth) {
  const deps = Array.from(
    { length: shape === "diamond" ? depth * 2 : depth },
    (_, i) => dependency(i, stats),
  );
  const retained = [];
  let current = variant.empty;
  for (let i = 0; i < depth; ++i) {
    if (shape === "chain") {
      current = builderFrom(variant, [deps[i]], [current]);
      retained.push(current);
    } else {
      const left = builderFrom(variant, [deps[i * 2]], [current]);
      const right = builderFrom(variant, [deps[i * 2 + 1]], [current]);
      retained.push(left, right);
      current = builderFrom(variant, [], [left, right]);
      retained.push(current);
    }
  }
  return retained;
}

function collectGarbage() {
  globalThis.gc();
  globalThis.gc();
}

function measureRetainedGraph(variantName, shape, depth = 64) {
  if (globalThis.gc === undefined)
    throw new Error("Run with --expose-gc to measure retained heap");
  const stats = { allocations: 0, validationCalls: 0, epoch: 0 };
  const variant = makeVariant(variantName, stats);
  const graphCount = 24;
  const warmup = Array.from({ length: 4 }, () =>
    buildRetainedGraph(variant, stats, shape, depth),
  );
  warmup.length = 0;
  collectGarbage();
  const samples = [];
  for (let repeat = 0; repeat < 3; ++repeat) {
    collectGarbage();
    const before = process.memoryUsage().heapUsed;
    const graphs = Array.from({ length: graphCount }, () =>
      buildRetainedGraph(variant, stats, shape, depth),
    );
    collectGarbage();
    samples.push(process.memoryUsage().heapUsed - before);
    graphs.length = 0;
  }
  const frontiersPerGraph = shape === "chain" ? depth : depth * 3;
  const retainedFrontiers = graphCount * frontiersPerGraph;
  const retainedHeapBytes = med(samples) / graphCount;
  return {
    retainedGraphs: graphCount,
    retainedFrontiersPerGraph: frontiersPerGraph,
    retainedHeapBytesPerGraph: retainedHeapBytes,
    retainedHeapBytes: med(samples),
    heapSampleRangeBytes: range(samples),
    bytesPerFrontier: med(samples) / retainedFrontiers,
  };
}

function runVariant(name, isolatedRound = false) {
  const stats = { allocations: 0, validationCalls: 0, epoch: 0 };
  const variant = makeVariant(name, stats);
  variant.name = name;
  const qualification = checkCorrectness(variant, stats);
  const result = {
    qualification,
    retainedHeap: {
      chain: measureRetainedGraph(name, "chain"),
      diamond: measureRetainedGraph(name, "diamond"),
    },
    scenarios: {},
  };
  for (const scenario of scenarios(variant, stats)) {
    scenario.stats = stats;
    const scenarioResult = runScenario(
      scenario,
      scenario.iterations,
      isolatedRound ? 1 : rounds,
      samples,
    );
    const key = `${scenario.phase}: ${scenario.name}`;
    result.scenarios[key] = scenarioResult;
  }
  return result;
}

if (process.argv.includes("--worker")) {
  const name = process.argv[process.argv.indexOf("--worker") + 1];
  if (!variants.includes(name)) throw new Error(`Unknown variant: ${name}`);
  console.log(JSON.stringify(runVariant(name, true)));
} else {
  const child = promisify(execFile);
  const runs = Object.fromEntries(variants.map((name) => [name, []]));
  for (let round = 0; round < rounds; ++round) {
    const order = [...variants];
    order.push(...order.splice(0, round % variants.length));
    for (const name of order) {
      const { stdout } = await child(
        process.execPath,
        ["--expose-gc", fileURLToPath(import.meta.url), "--worker", name],
        { windowsHide: true, timeout: 120_000, maxBuffer: 8 * 1024 * 1024 },
      );
      runs[name].push(JSON.parse(stdout));
      console.log(`${name}: isolated round ${round + 1}/${rounds} complete`);
    }
  }

  const report = {
    recordedAt: new Date().toISOString(),
    node: process.version,
    platform: process.platform,
    cpu: cpus()[0]?.model,
    rounds,
    samplesPerRound: samples,
    methodology:
      "isolated Node process per variant/round; frontier data-structure kernels; explicit object allocation counts; validation calls checked; no async source or scheduler work",
    sourceHash: createHash("sha256")
      .update(readFileSync(fileURLToPath(import.meta.url)))
      .digest("hex"),
    results: {},
  };

  for (const name of variants) {
    const series = runs[name];
    const first = series[0];
    const scenarios = {};
    for (const key of Object.keys(first.scenarios)) {
      const observations = series.map((run) => run.scenarios[key]);
      const timeSamples = observations.flatMap((entry) => entry.sampleNs);
      const allocationSamples = observations.flatMap(
        (entry) => entry.sampleAllocations,
      );
      scenarios[key] = {
        medianNs: med(timeSamples),
        rangeNs: range(timeSamples),
        allocationsPerOp: med(allocationSamples),
        validationCalls: observations.reduce(
          (total, entry) => total + entry.validationCalls,
          0,
        ),
      };
    }
    const retainedHeap = Object.fromEntries(
      ["chain", "diamond"].map((shape) => {
        const values = series.map(
          (run) => run.retainedHeap[shape].retainedHeapBytesPerGraph,
        );
        const ranges = series.flatMap((run) =>
          run.retainedHeap[shape].heapSampleRangeBytes.map(
            (n) => n / run.retainedHeap[shape].retainedGraphs,
          ),
        );
        const retainedGraphs = first.retainedHeap[shape].retainedGraphs;
        const retainedFrontiersPerGraph =
          first.retainedHeap[shape].retainedFrontiersPerGraph;
        const retainedHeapBytesPerGraph = med(values);
        return [
          shape,
          {
            retainedGraphs,
            retainedFrontiersPerGraph,
            retainedHeapBytesPerGraph,
            heapSampleRangeBytesPerGraph: range(ranges),
            bytesPerFrontier:
              retainedHeapBytesPerGraph / retainedFrontiersPerGraph,
          },
        ];
      }),
    );
    report.results[name] = {
      qualification: first.qualification,
      retainedHeap,
      scenarios,
    };
  }

  mkdirSync(outDir, { recursive: true });
  const reportPath = resolve(outDir, "report.json");
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  for (const name of variants) {
    console.log(`\n${name}`);
    for (const [key, result] of Object.entries(report.results[name].scenarios))
      console.log(
        `${key}: ${result.medianNs.toFixed(1)} ns/op [${result.rangeNs.map((n) => n.toFixed(1)).join(", ")}] · ${result.allocationsPerOp} alloc/op · ${result.validationCalls} validations`,
      );
    console.log(
      `retained bytes/frontier: chain ${report.results[name].retainedHeap.chain.bytesPerFrontier.toFixed(1)}, diamond ${report.results[name].retainedHeap.diamond.bytesPerFrontier.toFixed(1)}`,
    );
    console.log(
      `reentrant validations: ${report.results[name].qualification.reentrantValidationCalls}`,
    );
  }
  console.log(`Report: ${reportPath}`);
}
