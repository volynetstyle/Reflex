import { transformSync } from "@swc/core";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const cache = new URL("../../.cache/frontier-walker/", import.meta.url);
const source = new URL("../../src/async/frontier.ts", import.meta.url);
const baselineName = process.env.REFLEX_WALKER_BASELINE ?? "baseline";
if (!/^[a-z0-9-]+$/.test(baselineName))
  throw new Error("Invalid baseline name");
const baseline = new URL(`${baselineName}.ts`, cache);
const median = (values) =>
  [...values].sort((a, b) => a - b)[values.length >> 1];
const hash = (text) => createHash("sha256").update(text).digest("hex");

function compile(text, name) {
  const { code } = transformSync(text, {
    jsc: { parser: { syntax: "typescript" }, target: "es2022" },
    module: { type: "es6" },
  });
  writeFileSync(
    new URL(name, cache),
    code.replace('"./errors"', '"./errors.mjs"'),
  );
}

if (process.argv.includes("--worker")) {
  const name = process.argv.at(-1);
  const api = await import(new URL(`${name}.mjs`, cache));
  const { FrontierBuilder, materializeFrontier, forEachDependency } = api;
  const leaf = () =>
    Object.freeze({
      ...(api.FRONTIER_STATE === undefined
        ? {}
        : {
            [api.FRONTIER_STATE]: api.createFreshnessState(),
          }),
      ensure() {},
      validate() {},
    });
  const build = (entries, direct = false) => {
    const builder = new FrontierBuilder();
    for (const entry of entries) {
      if (direct) builder.add(entry);
      else builder.merge(entry);
    }
    return builder.snapshot();
  };
  const leaves = Array.from({ length: 256 }, leaf);
  const direct = build(leaves, true);
  const sharedLeaves = leaves.filter((_, i) => i < 32 && i % 2 === 0);
  const shared = build(sharedLeaves, true);
  const diamond = build(
    Array.from({ length: 64 }, (_, i) => build([shared, leaves[i]])),
  );
  let deep = shared;
  for (let i = 0; i < 2048; ++i) deep = build([deep, shared]);
  const wide = build(
    Array.from({ length: 4096 }, (_, i) => leaves[i % leaves.length]),
  );
  const absent = leaf();
  for (const [proof, expected] of [
    [direct, leaves],
    [diamond, [...new Set([...sharedLeaves, ...leaves.slice(0, 64)])]],
    [deep, sharedLeaves],
    [wide, leaves],
  ]) {
    assert.deepEqual(materializeFrontier(proof), expected);
    const visited = [];
    forEachDependency(proof, (dep) => visited.push(dep));
    assert.deepEqual(visited, expected);
  }
  let sink = 0;
  const visit = () => ++sink;
  const scenarios = [
    [
      "direct materialize / 256 leaves",
      () => {
        sink += materializeFrontier(direct).length;
      },
    ],
    [
      "shared diamond materialize",
      () => {
        sink += materializeFrontier(diamond).length;
      },
    ],
    ["shared diamond callbacks", () => forEachDependency(diamond, visit)],
    [
      "deep materialize / 2048 nodes",
      () => {
        sink += materializeFrontier(deep).length;
      },
    ],
    [
      "wide materialize / 4096 entries",
      () => {
        sink += materializeFrontier(wide).length;
      },
    ],
    [
      "owner absent / deep graph",
      () => {
        const builder = new FrontierBuilder(absent);
        builder.merge(deep);
        sink += builder.snapshot() === deep;
      },
    ],
    [
      "owner absent inside range / deep graph",
      () => {
        const builder = new FrontierBuilder(leaves[1]);
        builder.merge(deep);
        sink += builder.snapshot() === deep;
      },
    ],
    [
      "capture owner-checked chain / 256",
      () => {
        let proof = api.EMPTY_FRONTIER;
        let parent = leaves[0];
        for (let i = 1; i < leaves.length; ++i) {
          const owner = leaves[i];
          const builder = new FrontierBuilder(owner);
          builder.merge(proof);
          builder.add(parent);
          proof = builder.snapshot();
          parent = owner;
        }
        sink += materializeFrontier(proof).length;
      },
    ],
    [
      "nested overlapping callbacks",
      () =>
        forEachDependency(diamond, (dep) => {
          ++sink;
          if (dep === leaves[0]) forEachDependency(diamond, visit);
        }),
    ],
    [
      "capture + materialize / 16 leaves",
      () => {
        sink += materializeFrontier(build(leaves.slice(0, 16), true)).length;
      },
    ],
    [
      "capture + materialize / 64 leaves",
      () => {
        sink += materializeFrontier(build(leaves.slice(0, 64), true)).length;
      },
    ],
  ];
  const results = [];
  for (const [scenario, run] of scenarios) {
    // Calibrate after warmup; each sample performs the same observable work.
    for (let i = 0; i < 1000; ++i) run();
    let iterations = 1;
    while (true) {
      const start = performance.now();
      for (let i = 0; i < iterations; ++i) run();
      if (performance.now() - start >= 20) break;
      iterations *= 2;
    }
    const samples = [];
    for (let sample = 0; sample < 7; ++sample) {
      global.gc?.();
      const start = performance.now();
      for (let i = 0; i < iterations; ++i) run();
      samples.push(((performance.now() - start) * 1e6) / iterations);
    }
    results.push({ name: scenario, iterations, samples });
  }
  console.log(JSON.stringify({ results, sink }));
} else {
  mkdirSync(cache, { recursive: true });
  if (process.argv.includes("--capture-baseline")) {
    if (existsSync(baseline))
      throw new Error("Preserve the existing walker baseline.");
    writeFileSync(baseline, readFileSync(source));
    console.log(`Captured ${fileURLToPath(baseline)}`);
  } else {
    const before = readFileSync(baseline, "utf8");
    const after = readFileSync(source, "utf8");
    compile(before, "baseline.mjs");
    compile(after, "candidate.mjs");
    compile(
      readFileSync(
        new URL("../../src/async/errors.ts", import.meta.url),
        "utf8",
      ),
      "errors.mjs",
    );
    const runs = { baseline: [], candidate: [] };
    const execute = promisify(execFile);
    for (let round = 0; round < 3; ++round) {
      for (const name of round % 2
        ? ["candidate", "baseline"]
        : ["baseline", "candidate"]) {
        const { stdout } = await execute(
          process.execPath,
          ["--expose-gc", fileURLToPath(import.meta.url), "--worker", name],
          { windowsHide: true, timeout: 120_000 },
        );
        runs[name].push(JSON.parse(stdout));
        console.log(`${name}: round ${round + 1}/3`);
      }
    }
    const scenarios = runs.baseline[0].results.map(({ name }, index) => {
      const baselineNs = median(
        runs.baseline.flatMap((run) => run.results[index].samples),
      );
      const candidateNs = median(
        runs.candidate.flatMap((run) => run.results[index].samples),
      );
      return {
        name,
        baselineNs,
        candidateNs,
        speedup: baselineNs / candidateNs,
      };
    });
    writeFileSync(
      new URL(
        baselineName === "baseline"
          ? "report.json"
          : `report-${baselineName}.json`,
        cache,
      ),
      JSON.stringify(
        {
          node: process.version,
          cpu: cpus()[0]?.model,
          platform: process.platform,
          baselineHash: hash(before),
          candidateHash: hash(after),
          scenarios,
          runs,
        },
        null,
        2,
      ),
    );
    console.table(
      scenarios.map(({ name, baselineNs, candidateNs, speedup }) => ({
        scenario: name,
        "before ns/op": Math.round(baselineNs),
        "after ns/op": Math.round(candidateNs),
        speedup: `${speedup.toFixed(2)}x`,
      })),
    );
  }
}
