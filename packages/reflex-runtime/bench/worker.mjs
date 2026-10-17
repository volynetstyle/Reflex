// One measurement process.
//
//   node --expose-gc bench/worker.mjs <bundle.mjs> <workload-id> <verify|memory|time>
//        [--samples 25] [--sample-ms 2] [--warmup-ms 300] [--cycles 2000]
//   node --expose-gc bench/worker.mjs <bundleX.mjs> <workload-id> pair <bundleY.mjs>
//        [--samples 25] [--sample-ms 2] [--warmup-ms 300]
//
// Prints one JSON line.
//
// `pair` is the comparison mode. Clock frequency on laptop and shared
// runners moves by tens of percent between processes, so timing two builds
// in separate processes measures the machine, not the code. Here both builds
// run in one process, alternating sample batches in an X Y Y X pattern, and
// each X/Y pair yields one log ratio: drift that is slow relative to a pair
// cancels. Each side gets its own instance of the runtime bundle and of the
// workload module (distinct module URLs), so no closure, feedback vector or
// hidden class is shared between the sides; only the heap and the CPU are.
import { PerformanceObserver } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

const [bundle, id, mode = "time", ...rest] = process.argv.slice(2);
const option = (name, fallback) => {
  const index = rest.indexOf(name);
  return index === -1 ? fallback : Number(rest[index + 1]);
};

if (typeof globalThis.gc !== "function")
  throw new Error("Run with --expose-gc.");

/**
 * Layout randomization (--layout-seed). Under --predictable a given build
 * gets the same code and heap placement in every process, so a placement
 * effect of a build (alignment of a hot loop, cache-set conflicts) is a fixed
 * bias that replication narrows instead of averaging: two builds with
 * identical machine code measured 4-5% apart on the CI runner. Before each
 * side loads, the worker therefore compiles a random amount of throwaway
 * optimized code and retains a random amount of heap, both drawn from a
 * per-process seed, so the side's code and data land at independent random
 * offsets and placement effects become variance of the replicates.
 */
const layoutSeed = option("--layout-seed", 0) >>> 0;
let layoutState = layoutSeed || 1;
const layoutRandom = () => {
  layoutState ^= layoutState << 13;
  layoutState ^= layoutState >>> 17;
  layoutState ^= layoutState << 5;
  return (layoutState >>> 0) / 0x100000000;
};
const layoutBallast = [];
let layoutSink = 0;

function shiftLayout(side) {
  if (layoutSeed === 0) return;
  // Code space: optimized throwaway functions of random size and count.
  const functions = 1 + Math.floor(layoutRandom() * 6);
  for (let f = 0; f < functions; f++) {
    const terms = 1 + Math.floor(layoutRandom() * 160);
    let body = "let a = x | 0;";
    for (let t = 0; t < terms; t++)
      body += `a = (a * ${(t % 7) + 3} + ${t}) ^ (a >>> ${(t % 5) + 1});`;
    // The tag defeats V8's compilation cache across sides and processes.
    const fn = new Function("x", `// layout ${side} ${layoutSeed} ${f}\n${body} return a;`);
    for (let i = 0; i < 20_000; i++) layoutSink = (layoutSink + fn(i)) | 0;
  }
  // Heap: retained ballast of random size (0-512 KiB of small objects).
  const objects = Math.floor(layoutRandom() * 16_384);
  const ballast = new Array(objects);
  for (let i = 0; i < objects; i++) ballast[i] = { a: i, b: side };
  layoutBallast.push(ballast);
}

/** Load a runtime bundle and a private workload module instance for one side. */
async function loadSide(bundlePath, side) {
  shiftLayout(side);
  const rt = await import(`${pathToFileURL(bundlePath).href}?side=${side}`);
  const { findWorkload } = await import(
    new URL(`./workloads.mjs?side=${side}`, import.meta.url).href
  );
  return { rt, workload: findWorkload(id) };
}

function fold(n, step) {
  let acc = 0;
  for (let i = 0; i < n; i++) acc = (acc * 31 + (step(i) | 0)) | 0;
  return String(acc);
}

function fullGC() {
  for (let i = 0; i < 3; i++) globalThis.gc();
}

let sink = 0;
const sinkBox = { value: 0 };

// The timing loop is compiled once per side: a loop shared by both sides
// would see two `step` targets, turn its call site polymorphic and stop
// inlining, which slows both sides alike and hides the kernel cost. The
// source carries a per-side tag because V8 caches compilation by source text.
const runnerSource = (tag) => `// runner ${tag}
  let i = 0;
  return (n) => {
    let acc = 0;
    const start = hrtime();
    for (let k = 0; k < n; k++) acc ^= step(i++) | 0;
    const elapsed = Number(hrtime() - start);
    box.value ^= acc;
    return elapsed;
  };`;

/** A timed runner over one prepared workload instance, with private code. */
function runner(workload, rt, tag) {
  const { step } = workload.setup(rt);
  return new Function("step", "hrtime", "box", runnerSource(tag))(
    step,
    process.hrtime.bigint,
    sinkBox,
  );
}

/** Smallest power-of-two batch whose duration reaches `sampleNs`. */
function calibrate(batch, sampleNs) {
  let n = 1;
  while (batch(n) < sampleNs && n < 1 << 26) n *= 2;
  return n;
}

function observeGC() {
  const stats = { gcCount: 0, gcMs: 0 };
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      stats.gcCount++;
      stats.gcMs += entry.duration;
    }
  });
  observer.observe({ entryTypes: ["gc"] });
  return {
    async stop() {
      await new Promise((resolve) => setImmediate(resolve));
      observer.disconnect();
      return stats;
    },
  };
}

const samples = option("--samples", 25);
const sampleNs = option("--sample-ms", 2) * 1e6;
const warmupNs = option("--warmup-ms", 300) * 1e6;
let result;

if (mode === "pair") {
  const other = rest[0];
  const x = await loadSide(bundle, "x");
  const y = await loadSide(other, "y");
  const batchX = runner(x.workload, x.rt, "x");
  const batchY = runner(y.workload, y.rt, "y");
  if (layoutSeed !== 0) {
    // Hot code is compiled during warm-up, where the sides alternate: a shift
    // applied only at load would move both sides together and keep their
    // relative placement fixed. Tier each side up alone, behind its own
    // independent random shift, before the joint warm-up below.
    for (const [batch, side] of [
      [batchX, "x"],
      [batchY, "y"],
    ]) {
      shiftLayout(`${side}-code`);
      const start = process.hrtime.bigint();
      while (Number(process.hrtime.bigint() - start) < warmupNs) batch(64);
    }
  }
  // One batch size for both sides keeps each pair's halves equally long.
  const n = Math.max(calibrate(batchX, sampleNs), calibrate(batchY, sampleNs));

  // Each side gets the full warm-up budget.
  const warmStart = process.hrtime.bigint();
  while (Number(process.hrtime.bigint() - warmStart) < 2 * warmupNs) {
    batchX(n);
    batchY(n);
  }

  fullGC();
  const gc = observeGC();
  const nsX = [];
  const nsY = [];
  const logRatios = [];
  for (let s = 0; s < samples; s++) {
    let tx;
    let ty;
    if (s % 2 === 0) {
      tx = batchX(n);
      ty = batchY(n);
    } else {
      ty = batchY(n);
      tx = batchX(n);
    }
    nsX.push(tx / n);
    nsY.push(ty / n);
    logRatios.push(Math.log(ty / tx));
  }
  result = {
    mode,
    stepsPerSample: n,
    nsX,
    nsY,
    logRatios,
    ...(await gc.stop()),
    sink: sinkBox.value,
  };
} else {
  const { rt, workload } = await loadSide(bundle, "x");
  if (mode === "verify") {
    result = {
      mode,
      value: workload.verify
        ? workload.verify(rt)
        : fold(32, workload.setup(rt).step),
    };
  } else if (mode === "memory") {
    const { step } = workload.setup(rt);
    for (let i = 0; i < 200; i++) sink ^= step(i) | 0;
    fullGC();
    const before = process.memoryUsage().heapUsed;
    const cycles = option("--cycles", 2000);
    for (let i = 0; i < cycles; i++) sink ^= step(i) | 0;
    fullGC();
    const after = process.memoryUsage().heapUsed;
    result = { mode, bytesPerStep: (after - before) / cycles, cycles, sink };
  } else {
    const batch = runner(workload, rt, "x");
    const n = calibrate(batch, sampleNs);
    const warmStart = process.hrtime.bigint();
    while (Number(process.hrtime.bigint() - warmStart) < warmupNs) batch(n);
    fullGC();
    const gc = observeGC();
    const nsPerStep = [];
    for (let s = 0; s < samples; s++) nsPerStep.push(batch(n) / n);
    result = {
      mode,
      stepsPerSample: n,
      opsPerStep: workload.opsPerStep,
      nsPerStep,
      ...(await gc.stop()),
      sink: sinkBox.value,
    };
  }
}

process.stdout.write(`${JSON.stringify(result)}\n`);
