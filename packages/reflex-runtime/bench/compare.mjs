// Paired, randomized performance comparison of two runtime builds.
//
//   node bench/compare.mjs [--baseline <commit>] [--candidate source|<commit>]
//        [--workloads <regex>] [--replicates 24] [--threshold 0.03]
//        [--seed 1] [--samples 25] [--out <file.json>] [--quick]
//        [--family <n>]   multiplicity family size when running a shard
//
// Protocol (docs/performance/BENCHMARK_PROTOCOL.md):
//  1. Build both sides as production bundles with the same toolchain/flags.
//  2. Verify: each workload must produce identical deterministic results on
//     both sides, otherwise it is invalid (a semantic change, not a speedup).
//  3. For every workload and replicate run two fresh `pair` processes in
//     random order: A against B (candidate) and A against A' (baseline again,
//     the negative control). Inside a process the sides alternate, so clock
//     drift cancels; which side runs as X is randomized per process.
//     Workload/replicate blocks are shuffled.
//  4. Each process yields the median of its per-pair log ratios, oriented as
//     log(other/A). Across replicates the median gets an exact
//     order-statistic interval with a Bonferroni correction over the family.
//  5. Verdicts use a pre-declared practical threshold. A control interval
//     that excludes zero means the method itself sees a difference between
//     identical builds, and the workload's comparison is invalid.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { arch, cpus, platform, release } from "node:os";
import path from "node:path";
import {
  median,
  medianInterval,
} from "../../../tooling/benchmarks/statistics.mjs";
import { workloads } from "./workloads.mjs";

const packageRoot = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(packageRoot, "../..");
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};
const quick = args.includes("--quick");
const baselineRef =
  option("--baseline") ??
  readFileSync(
    path.join(packageRoot, "test/oracle/baseline-commit.txt"),
    "utf8",
  ).trim();
const candidateRef = option("--candidate", "source");
const pattern = new RegExp(option("--workloads", ".*"));
const replicates = Number(option("--replicates", quick ? 12 : 24));
const threshold = Number(option("--threshold", 0.03));
const samples = Number(option("--samples", quick ? 15 : 25));
let seed = Number(option("--seed", 1)) >>> 0 || 1;
const memoryRuns = Number(option("--memory-runs", 5));

const random = () => {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return (seed >>> 0) / 0x100000000;
};
const shuffle = (items) => {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
};

function build(ref) {
  const flags = ["--production"];
  if (ref === "source")
    flags.push(
      "--source",
      "--out",
      path.join(packageRoot, ".cache/bench/candidate"),
    );
  else flags.push("--commit", ref);
  const out = execFileSync(
    process.execPath,
    [path.join(packageRoot, "scripts/build-baseline-oracle.mjs"), ...flags],
    { cwd: packageRoot, encoding: "utf8" },
  ).trim();
  const dir = path.resolve(packageRoot, out);
  const bundle = path.join(dir, "runtime.mjs");
  return {
    ref,
    bundle,
    manifest: JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8")),
    sha256: createHash("sha256").update(readFileSync(bundle)).digest("hex"),
  };
}

function worker(bundle, id, mode, extra = []) {
  const result = spawnSync(
    process.execPath,
    [
      "--expose-gc",
      path.join(packageRoot, "bench/worker.mjs"),
      bundle,
      id,
      mode,
      ...extra,
    ],
    // A slow worker must never hang the run.
    { encoding: "utf8", windowsHide: true, timeout: 120_000 },
  );
  if (result.status !== 0) {
    throw new Error(`worker ${id} ${mode} failed:\n${result.stderr}`);
  }
  return JSON.parse(result.stdout.trim().split("\n").at(-1));
}

const selected = workloads.filter((w) => pattern.test(w.id));
const timed = selected.filter((w) => !w.memory);
const memory = selected.filter((w) => w.memory);

const sides = { A: build(baselineRef), B: build(candidateRef) };
process.stderr.write(
  `A ${sides.A.manifest.commit.slice(0, 12)}  B ${sides.B.manifest.commit.slice(0, 12)}  ` +
    `${timed.length} timed, ${memory.length} memory workloads, ${replicates} replicates\n`,
);

// 1. Semantic verification.
const verification = {};
for (const w of selected) {
  const a = worker(sides.A.bundle, w.id, "verify").value;
  const b = worker(sides.B.bundle, w.id, "verify").value;
  verification[w.id] = { baseline: a, candidate: b, equal: a === b };
}

// 2. Randomized schedule of paired processes: A vs B and A vs A'.
const blocks = [];
for (let r = 0; r < replicates; r++) {
  for (const w of timed) blocks.push({ workload: w.id, replicate: r });
}
shuffle(blocks);
const runs = {};
const started = Date.now();

/** One pair process of A against `other`; the ratio is oriented as other/A. */
function pair(workload, other, swapped) {
  const [x, y] = swapped ? [other, sides.A.bundle] : [sides.A.bundle, other];
  const result = worker(x, workload, "pair", [y, "--samples", String(samples)]);
  const logRatios = swapped
    ? result.logRatios.map((v) => -v)
    : result.logRatios;
  const center = median(logRatios);
  return {
    swapped,
    logRatio: center,
    pairMad: median(logRatios.map((v) => Math.abs(v - center))),
    baselineNs: median(swapped ? result.nsY : result.nsX),
    otherNs: median(swapped ? result.nsX : result.nsY),
    gcCount: result.gcCount,
  };
}

blocks.forEach((block, index) => {
  if (!verification[block.workload].equal) return;
  // The build loaded first into a process runs measurably faster or slower
  // than the second (1-3% on the CI calibration, sign depending on the
  // workload). Every comparison therefore runs in both orientations and the
  // replicate's estimate is their mean, which cancels the position effect
  // exactly instead of turning it into bimodal noise.
  const order = shuffle(["B+", "B-", "C+", "C-"]);
  const processes = {};
  for (const slot of order) {
    const other = slot[0] === "B" ? sides.B.bundle : sides.A.bundle;
    processes[slot] = pair(block.workload, other, slot[1] === "-");
  }
  const combine = (forward, reverse) => ({
    logRatio: (forward.logRatio + reverse.logRatio) / 2,
    positionEffect: (forward.logRatio - reverse.logRatio) / 2,
    pairMad: (forward.pairMad + reverse.pairMad) / 2,
    baselineNs: (forward.baselineNs + reverse.baselineNs) / 2,
    otherNs: (forward.otherNs + reverse.otherNs) / 2,
    gcCount: forward.gcCount + reverse.gcCount,
    processes: [forward, reverse],
  });
  (runs[block.workload] ??= []).push({
    replicate: block.replicate,
    order,
    B: combine(processes["B+"], processes["B-"]),
    C: combine(processes["C+"], processes["C-"]),
  });
  if ((index + 1) % 10 === 0) {
    const elapsed = (Date.now() - started) / 1000;
    process.stderr.write(
      `  ${index + 1}/${blocks.length} blocks, ${elapsed.toFixed(0)}s\n`,
    );
  }
});

// 3. Statistics and verdicts.
// A shard of a larger run passes the whole family size (--family) so its
// intervals carry the same multiplicity correction as an unsharded run.
const family = Number(option("--family", timed.length));
function summarize(logRatios) {
  const interval = medianInterval(logRatios, {
    confidence: 0.95,
    familySize: family,
  });
  const toDelta = (v) => (v == null ? null : Math.exp(v) - 1);
  return {
    medianDelta: Math.exp(median(logRatios)) - 1,
    lower: toDelta(interval.lower),
    upper: toDelta(interval.upper),
  };
}

const results = timed.map((w) => {
  const verified = verification[w.id];
  if (!verified.equal) {
    return {
      id: w.id,
      level: w.level,
      verdict: "invalid",
      reason: "semantic verification differs",
      verified,
    };
  }
  const list = runs[w.id];
  const candidate = summarize(list.map((r) => r.B.logRatio));
  const control = summarize(list.map((r) => r.C.logRatio));
  const noise = median(list.flatMap((r) => [r.B.pairMad, r.C.pairMad]));
  let verdict;
  let reason;
  const bounded = candidate.lower !== null;
  if (control.lower !== null && (control.lower > 0 || control.upper < 0)) {
    verdict = "invalid";
    reason = "negative control (baseline vs baseline) differs from zero";
  } else if (!bounded) {
    verdict = "screening";
    reason = "too few replicates for a simultaneous interval";
  } else if (candidate.upper < -threshold) verdict = "faster";
  else if (candidate.lower > threshold) verdict = "slower";
  else if (candidate.lower >= -threshold && candidate.upper <= threshold)
    verdict = "equivalent";
  else {
    verdict = "inconclusive";
    reason = "interval crosses the practical threshold";
  }
  return {
    id: w.id,
    level: w.level,
    mechanism: w.mechanism,
    baselineNsPerOp: median(list.map((r) => r.B.baselineNs)) / w.opsPerStep,
    candidateNsPerOp: median(list.map((r) => r.B.otherNs)) / w.opsPerStep,
    candidate,
    control,
    pairNoise: noise,
    positionEffect: Math.exp(median(list.map((r) => r.B.positionEffect))) - 1,
    verdict,
    reason,
    replicates: list.length,
  };
});

// Retention is the slope of heap growth over cycles: one-time costs (JIT
// metadata, cache growth) cancel between a short and a long run, and only
// memory that grows with the number of cycles remains.
const memoryCycles = [2000, 8000];
const memoryResults = memory.map((w) => {
  const measure = (bundle) => {
    const slopes = Array.from({ length: memoryRuns }, () => {
      const [short, long] = memoryCycles.map((cycles) =>
        worker(bundle, w.id, "memory", ["--cycles", String(cycles)]),
      );
      return (
        (long.bytesPerStep * long.cycles - short.bytesPerStep * short.cycles) /
        (long.cycles - short.cycles)
      );
    });
    return { median: median(slopes), slopes };
  };
  const baseline = measure(sides.A.bundle);
  const candidate = measure(sides.B.bundle);
  return {
    id: w.id,
    level: w.level,
    verified: verification[w.id].equal,
    cycles: memoryCycles,
    baselineBytesPerStep: baseline.median,
    candidateBytesPerStep: candidate.median,
    baselineSlopes: baseline.slopes,
    candidateSlopes: candidate.slopes,
  };
});

const report = {
  schemaVersion: 1,
  protocol:
    "reflex-runtime in-process paired A/B + A/A' (docs/performance/BENCHMARK_PROTOCOL.md)",
  measuredAt: new Date().toISOString(),
  environment: {
    node: process.version,
    v8: process.versions.v8,
    platform: `${platform()} ${release()} ${arch()}`,
    cpu: cpus()[0]?.model ?? "unknown",
    cpuCount: cpus().length,
  },
  sides: {
    baseline: {
      ref: sides.A.ref,
      commit: sides.A.manifest.commit,
      bundleSha256: sides.A.sha256,
    },
    candidate: {
      ref: sides.B.ref,
      commit: sides.B.manifest.commit,
      bundleSha256: sides.B.sha256,
    },
  },
  config: {
    replicates,
    samples,
    threshold,
    seed: Number(option("--seed", 1)),
    family,
  },
  verification,
  results,
  memory: memoryResults,
  runs,
};

const out =
  option("--out") ??
  path.join(
    packageRoot,
    ".cache/bench",
    `compare-${new Date().toISOString().replaceAll(":", "-")}.json`,
  );
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);

const pct = (v) =>
  v == null ? "  n/a " : `${(v * 100).toFixed(1).padStart(5)}%`;
const lines = [
  `| workload | baseline ns/op | Δ median | 95% interval | control Δ | position | pair noise | verdict |`,
  `| --- | ---: | ---: | --- | ---: | ---: | ---: | --- |`,
  ...results.map((r) =>
    r.verdict === "invalid" && r.candidate === undefined
      ? `| ${r.id} | | | | | | | invalid (${r.reason}) |`
      : `| ${r.id} | ${r.baselineNsPerOp.toFixed(2)} | ${pct(r.candidate.medianDelta)} | [${pct(r.candidate.lower)}, ${pct(r.candidate.upper)}] | ${pct(r.control.medianDelta)} | ${pct(r.positionEffect)} | ${(r.pairNoise * 100).toFixed(1)}% | ${r.verdict} |`,
  ),
  ...memoryResults.map(
    (m) =>
      `| ${m.id} (bytes/step) | ${m.baselineBytesPerStep.toFixed(1)} | ${m.candidateBytesPerStep.toFixed(1)} | | | | | memory |`,
  ),
];
process.stdout.write(
  `${lines.join("\n")}\n\nReport: ${path.relative(repoRoot, out)}\n`,
);
process.exitCode = results.some(
  (r) => r.verdict === "slower" || r.verdict === "invalid",
)
  ? 1
  : 0;
