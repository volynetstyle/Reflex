import { hrtime } from "node:process";
import {
  CONSUMER_CHANGED,
  PRODUCER_INITIAL_STATE,
  ReactiveNodeState,
} from "../../build/esm/reactivity/shape/ReactiveMeta.js";
import ReactiveNode from "../../build/esm/reactivity/shape/ReactiveNode.js";
import { linkEdge } from "../../build/esm/reactivity/shape/methods/connect.js";

const FORWARD = 0;
const REVERSE = 1;
const INSPECT_NONE = 0;
const INSPECT_FIRST_IN = 1;
const INSPECT_LAST_IN = 2;
const INVALIDATE_MASK = ReactiveNodeState.Invalid;
const SCHEDULE_MASK = ReactiveNodeState.Watcher;

function createProducer(value = 0) {
  return new ReactiveNode(value, null, PRODUCER_INITIAL_STATE);
}

function createConsumer(value = 0, state = CONSUMER_CHANGED) {
  return new ReactiveNode(value, null, state);
}

function directionLabel(direction) {
  return direction === FORWARD
    ? "forward(firstOut->nextOut)"
    : "reverse(lastOut->prevOut)";
}

function inspectLabel(mode) {
  if (mode === INSPECT_FIRST_IN) return "scan+firstIn";
  if (mode === INSPECT_LAST_IN) return "scan+lastIn";
  return "scan-only";
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[(sorted.length / 2) | 0];
}

function quantile(values, ratio) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * ratio) - 1),
  );
  return sorted[index];
}

function formatNs(ns) {
  if (ns >= 1e6) return `${(ns / 1e6).toFixed(3)} ms`;
  if (ns >= 1e3) return `${(ns / 1e3).toFixed(3)} us`;
  return `${ns.toFixed(1)} ns`;
}

function formatOpsSec(opsSec) {
  if (opsSec >= 1e6) return `${(opsSec / 1e6).toFixed(2)} Mops/s`;
  if (opsSec >= 1e3) return `${(opsSec / 1e3).toFixed(2)} Kops/s`;
  return `${opsSec.toFixed(1)} ops/s`;
}

function formatBytes(bytes) {
  const abs = Math.abs(bytes);

  if (abs >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(3)} MiB`;
  if (abs >= 1024) return `${(bytes / 1024).toFixed(3)} KiB`;
  return `${bytes.toFixed(1)} B`;
}

function formatDelta(delta) {
  const sign = delta > 0 ? "+" : "";
  return `${sign}${(delta * 100).toFixed(1)}%`;
}

function nowNs() {
  return Number(hrtime.bigint());
}

function maybeGc() {
  if (globalThis.gc) globalThis.gc();
}

function rotateOutgoingHeadToTail(node) {
  const head = node.firstOut;
  if (head === null) return;

  const next = head.nextOut;
  if (next === null) return;

  const tail = node.lastOut;
  next.prevOut = null;
  node.firstOut = next;
  tail.nextOut = head;
  head.prevOut = tail;
  head.nextOut = null;
  node.lastOut = head;
}

function rotateOutgoingTailToHead(node) {
  const tail = node.lastOut;
  if (tail === null) return;

  const prev = tail.prevOut;
  if (prev === null) return;

  const head = node.firstOut;
  prev.nextOut = null;
  node.lastOut = prev;
  head.prevOut = tail;
  tail.prevOut = null;
  tail.nextOut = head;
  node.firstOut = tail;
}

function createFullTraversal(direction, inspectMode = INSPECT_NONE) {
  const stack = [];

  return function traverse(startEdge) {
    if (startEdge === null) return 0;

    const stackBase = stack.length;
    let edge = startEdge;
    let next = direction === FORWARD ? edge.nextOut : edge.prevOut;
    let sink = 0;

    top: while (true) {
      const node = edge.to;
      node.state |= INVALIDATE_MASK;
      sink ^= node.state;

      if (inspectMode === INSPECT_FIRST_IN) {
        const firstIn = node.firstIn;
        if (firstIn !== null) sink ^= firstIn.from.state;
      } else if (inspectMode === INSPECT_LAST_IN) {
        const lastIn = node.lastIn;
        if (lastIn !== null) sink ^= lastIn.from.state;
      }

      const child = direction === FORWARD ? node.firstOut : node.lastOut;
      if (child !== null) {
        if (next !== null) stack.push(next);
        edge = child;
        next = direction === FORWARD ? edge.nextOut : edge.prevOut;
        continue;
      }

      if (next !== null) {
        edge = next;
        next = direction === FORWARD ? edge.nextOut : edge.prevOut;
        continue;
      }

      while (stack.length > stackBase) {
        edge = stack.pop();
        next = direction === FORWARD ? edge.nextOut : edge.prevOut;
        continue top;
      }

      break;
    }

    stack.length = stackBase;
    return sink;
  };
}

function createEarlyExitTraversal(direction) {
  return function traverseUntilHit(startEdge) {
    let edge = startEdge;
    let steps = 0;

    while (edge !== null) {
      steps += 1;
      if ((edge.to.state & SCHEDULE_MASK) !== 0) return steps;
      edge = direction === FORWARD ? edge.nextOut : edge.prevOut;
    }

    return steps;
  };
}

function createOutScan(direction, inspectMode) {
  return function scan(startEdge) {
    let edge = startEdge;
    let sink = 0;

    while (edge !== null) {
      const node = edge.to;
      sink ^= node.state;

      if (inspectMode === INSPECT_FIRST_IN) {
        const firstIn = node.firstIn;
        if (firstIn !== null) sink ^= firstIn.from.state;
      } else if (inspectMode === INSPECT_LAST_IN) {
        const lastIn = node.lastIn;
        if (lastIn !== null) sink ^= lastIn.from.state;
      }

      edge = direction === FORWARD ? edge.nextOut : edge.prevOut;
    }

    return sink;
  };
}

function warm(prepare, run, iterations) {
  let sink = 0;

  for (let i = 0; i < iterations; i += 1) {
    prepare?.(i);
    sink ^= run(i) & 1;
  }

  return sink;
}

function profileRunner({
  prepare,
  run,
  iterations,
  warmup,
  sampleIterations,
  rounds = 5,
  metricName = null,
}) {
  warm(prepare, run, warmup);

  const opsSamples = [];
  const totalMsSamples = [];
  const heapSamples = [];
  const p99Samples = [];
  const maxSamples = [];
  const metricSamples = [];
  let sink = 0;

  for (let round = 0; round < rounds; round += 1) {
    maybeGc();
    const heapBefore = process.memoryUsage().heapUsed;
    const bulkStart = nowNs();

    let metricTotal = 0;
    for (let i = 0; i < iterations; i += 1) {
      prepare?.(i + round * iterations);
      const result = run(i);
      if (metricName !== null) metricTotal += result;
      sink ^= result & 1;
    }

    const bulkNs = nowNs() - bulkStart;
    maybeGc();
    const heapAfter = process.memoryUsage().heapUsed;

    opsSamples.push((iterations * 1e9) / bulkNs);
    totalMsSamples.push(bulkNs / 1e6);
    heapSamples.push((heapAfter - heapBefore) / iterations);

    const latencies = [];
    let sampleMetricTotal = 0;

    for (let i = 0; i < sampleIterations; i += 1) {
      prepare?.(i + round * sampleIterations + 0x100000);
      const start = nowNs();
      const result = run(i);
      latencies.push(nowNs() - start);
      if (metricName !== null) sampleMetricTotal += result;
      sink ^= result & 1;
    }

    p99Samples.push(quantile(latencies, 0.99));
    maxSamples.push(Math.max(...latencies));

    if (metricName !== null) {
      metricSamples.push(sampleMetricTotal / sampleIterations);
    }
  }

  return {
    opsSec: median(opsSamples),
    totalMs: median(totalMsSamples),
    heapBytesPerOp: median(heapSamples),
    p99Ns: median(p99Samples),
    maxNs: median(maxSamples),
    metricName,
    metricValue: metricName === null ? null : median(metricSamples),
    sink,
  };
}

function printFullMetrics(name, metrics) {
  const metricLine =
    metrics.metricName === null
      ? ""
      : ` | ${metrics.metricName}=${metrics.metricValue.toFixed(1)}`;

  console.log(
    `  ${name.padEnd(28)} ops/sec=${formatOpsSec(metrics.opsSec)} | total=${metrics.totalMs.toFixed(3)} ms | heap/op=${formatBytes(metrics.heapBytesPerOp)} | p99=${formatNs(metrics.p99Ns)} | max=${formatNs(metrics.maxNs)}${metricLine}`,
  );
}

function buildWideFanout(width) {
  const root = createProducer(0);

  for (let i = 0; i < width; i += 1) {
    linkEdge(root, createConsumer(i));
  }

  return {
    label: `wide_fanout_${width}`,
    prepare: null,
    forwardStart: root.firstOut,
    reverseStart: root.lastOut,
  };
}

function buildTree(branching, depth, churn = false) {
  const root = createProducer(0);
  const rotatable = [];

  function build(parent, level) {
    if (level === depth) return;

    for (let i = 0; i < branching; i += 1) {
      const child = createConsumer(level * branching + i);
      linkEdge(parent, child);
      build(child, level + 1);
    }

    if (parent.firstOut !== null && parent.firstOut !== parent.lastOut) {
      rotatable.push(parent);
    }
  }

  build(root, 0);

  return {
    label: `${churn ? "churn" : "stable"}_tree_${branching}x${depth}`,
    forwardStart: root.firstOut,
    reverseStart: root.lastOut,
    prepare: churn
      ? (iteration) => {
          const rotateForward = (iteration & 1) === 0;

          for (let i = 0; i < rotatable.length; i += 1) {
            if (rotateForward) rotateOutgoingHeadToTail(rotatable[i]);
            else rotateOutgoingTailToHead(rotatable[i]);
          }
        }
      : null,
  };
}

function buildEarlyExitFanout(width, hitIndex) {
  const root = createProducer(0);

  for (let i = 0; i < width; i += 1) {
    const state = i === hitIndex ? SCHEDULE_MASK : CONSUMER_CHANGED;
    linkEdge(root, createConsumer(i, state));
  }

  return {
    label: `hit@${hitIndex + 1}/${width}`,
    forwardStart: root.firstOut,
    reverseStart: root.lastOut,
  };
}

function buildCombinedFanout(width) {
  const root = createProducer(0);

  for (let i = 0; i < width; i += 1) {
    const child = createConsumer(i);
    const prefix = createProducer(-(i + 1));
    const suffix = createProducer(i + 1);

    linkEdge(prefix, child, null);
    linkEdge(root, child);
    linkEdge(suffix, child);
  }

  return {
    label: `fanout_${width}`,
    forwardStart: root.firstOut,
    reverseStart: root.lastOut,
  };
}

function runFullTraversalBench() {
  console.log("=== Full traversal ===");

  const scenarios = [
    { scenario: buildWideFanout(4096), iterations: 3000, warmup: 900, sampleIterations: 256 },
    { scenario: buildTree(4, 6, false), iterations: 2500, warmup: 750, sampleIterations: 192 },
    { scenario: buildTree(4, 6, true), iterations: 2500, warmup: 750, sampleIterations: 192 },
  ];

  const forward = createFullTraversal(FORWARD);
  const reverse = createFullTraversal(REVERSE);

  for (const entry of scenarios) {
    const { scenario, iterations, warmup, sampleIterations } = entry;
    const forwardMetrics = profileRunner({
      prepare: scenario.prepare,
      run: () => forward(scenario.forwardStart),
      iterations,
      warmup,
      sampleIterations,
    });
    const reverseMetrics = profileRunner({
      prepare: scenario.prepare,
      run: () => reverse(scenario.reverseStart),
      iterations,
      warmup,
      sampleIterations,
    });

    console.log(`\n${scenario.label}`);
    printFullMetrics(directionLabel(FORWARD), forwardMetrics);
    printFullMetrics(directionLabel(REVERSE), reverseMetrics);
  }
}

function runEarlyExitBench() {
  console.log("=== Early-exit traversal ===");

  const scenarios = [
    buildEarlyExitFanout(8192, 0),
    buildEarlyExitFanout(8192, 8191),
  ];
  const forward = createEarlyExitTraversal(FORWARD);
  const reverse = createEarlyExitTraversal(REVERSE);

  for (const scenario of scenarios) {
    const forwardMetrics = profileRunner({
      prepare: null,
      run: () => forward(scenario.forwardStart),
      iterations: 50000,
      warmup: 10000,
      sampleIterations: 512,
      metricName: "avg_steps",
    });
    const reverseMetrics = profileRunner({
      prepare: null,
      run: () => reverse(scenario.reverseStart),
      iterations: 50000,
      warmup: 10000,
      sampleIterations: 512,
      metricName: "avg_steps",
    });

    console.log(`\n${scenario.label}`);
    printFullMetrics(directionLabel(FORWARD), forwardMetrics);
    printFullMetrics(directionLabel(REVERSE), reverseMetrics);
  }
}

function estimateDegradeStart(
  rows,
  baselineKey,
  candidateKey,
  threshold = 0.1,
  consecutive = 2,
) {
  let streak = 0;

  for (const row of rows) {
    const baseline = row[baselineKey];
    const candidate = row[candidateKey];
    if (baseline === 0) continue;

    if ((candidate - baseline) / baseline >= threshold) {
      streak += 1;
      if (streak >= consecutive) {
        return rows[rows.indexOf(row) - consecutive + 1].width;
      }
    } else {
      streak = 0;
    }
  }

  return null;
}

function runCombinedBench() {
  console.log("=== Combined traversal ===");

  const widths = [32, 64, 128, 256, 512, 1024, 2048, 4096];

  for (const direction of [FORWARD, REVERSE]) {
    const modeResults = [];
    const scanOnly = createOutScan(direction, INSPECT_NONE);
    const scanFirstIn = createOutScan(direction, INSPECT_FIRST_IN);
    const scanLastIn = createOutScan(direction, INSPECT_LAST_IN);

    for (const width of widths) {
      const scenario = buildCombinedFanout(width);
      const startEdge =
        direction === FORWARD ? scenario.forwardStart : scenario.reverseStart;
      const iterations = Math.max(8000, (4_000_000 / width) | 0);
      const warmup = Math.max(1600, iterations >> 2);

      const scanOnlyMetrics = profileRunner({
        prepare: null,
        run: () => scanOnly(startEdge),
        iterations,
        warmup,
        sampleIterations: 192,
        rounds: 5,
      });
      const scanFirstInMetrics = profileRunner({
        prepare: null,
        run: () => scanFirstIn(startEdge),
        iterations,
        warmup,
        sampleIterations: 192,
        rounds: 5,
      });
      const scanLastInMetrics = profileRunner({
        prepare: null,
        run: () => scanLastIn(startEdge),
        iterations,
        warmup,
        sampleIterations: 192,
        rounds: 5,
      });

      modeResults.push({
        width,
        scanOnlyNs: (1e9 / scanOnlyMetrics.opsSec),
        scanFirstInNs: (1e9 / scanFirstInMetrics.opsSec),
        scanLastInNs: (1e9 / scanLastInMetrics.opsSec),
      });
    }

    console.log(`\n${directionLabel(direction)}`);
    for (const row of modeResults) {
      const firstDelta = (row.scanFirstInNs - row.scanOnlyNs) / row.scanOnlyNs;
      const lastDelta = (row.scanLastInNs - row.scanOnlyNs) / row.scanOnlyNs;

      console.log(
        `  width=${String(row.width).padEnd(4)} scan-only=${formatNs(row.scanOnlyNs).padEnd(12)} | scan+firstIn=${formatNs(row.scanFirstInNs).padEnd(12)} (${formatDelta(firstDelta)}) | scan+lastIn=${formatNs(row.scanLastInNs).padEnd(12)} (${formatDelta(lastDelta)})`,
      );
    }

    const firstInThreshold = estimateDegradeStart(
      modeResults,
      "scanOnlyNs",
      "scanFirstInNs",
    );
    const lastInThreshold = estimateDegradeStart(
      modeResults,
      "scanOnlyNs",
      "scanLastInNs",
    );

    console.log(
      `  degrade(scan+firstIn >= +10%): ${firstInThreshold === null ? "not reached" : `~width ${firstInThreshold}`}`,
    );
    console.log(
      `  degrade(scan+lastIn  >= +10%): ${lastInThreshold === null ? "not reached" : `~width ${lastInThreshold}`}`,
    );
  }
}

function main() {
  const mode = process.argv[2] ?? "all";

  if (mode === "all" || mode === "full") runFullTraversalBench();
  if (mode === "all" || mode === "early-exit") runEarlyExitBench();
  if (mode === "all" || mode === "combined") runCombinedBench();

  if (!["all", "full", "early-exit", "combined"].includes(mode)) {
    throw new Error(`Unknown mode: ${mode}`);
  }
}

main();
