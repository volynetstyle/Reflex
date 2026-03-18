import { spawn } from "node:child_process";
import path from "node:path";

const args = process.argv.slice(2);

function readArg(flag, fallback) {
  const index = args.indexOf(flag);
  if (index === -1) return fallback;
  return args[index + 1] ?? fallback;
}

const distArg = readArg("--dist", "../dist/esm/index.js");
const label = readArg("--label", path.basename(path.dirname(distArg)));
const mode = readArg("--mode", "dynamic");
const rounds = readArg("--rounds", "18");

const benchScript = path.resolve(import.meta.dirname, "young_gen_churn_bench.mjs");

function emptyStats() {
  return {
    count: 0,
    totalPause: 0,
    maxPause: 0,
    timestamps: [],
  };
}

const gcStats = new Map([
  ["Scavenge", emptyStats()],
  ["Mark-Compact", emptyStats()],
]);

function recordGc(kind, timestampMs, pauseMs) {
  const stats = gcStats.get(kind);
  if (!stats) return;
  stats.count += 1;
  stats.totalPause += pauseMs;
  stats.maxPause = Math.max(stats.maxPause, pauseMs);
  stats.timestamps.push(timestampMs);
}

function summarizeIntervals(timestamps) {
  if (timestamps.length < 2) {
    return { avg: 0, min: 0, max: 0 };
  }

  let total = 0;
  let min = Infinity;
  let max = 0;

  for (let i = 1; i < timestamps.length; ++i) {
    const delta = timestamps[i] - timestamps[i - 1];
    total += delta;
    min = Math.min(min, delta);
    max = Math.max(max, delta);
  }

  return {
    avg: total / (timestamps.length - 1),
    min,
    max,
  };
}

function formatMs(value) {
  return `${value.toFixed(3)} ms`;
}

function consumeLines(chunk, plainCollector) {
  const lines = chunk.split(/\r?\n/);
  for (const line of lines) {
    if (!line) continue;
    const match = line.match(
      /\]\s+([\d.]+)\s+ms:\s+(Scavenge|Mark-Compact).*?,\s+([\d.]+)\s*\/\s*0.00 ms/,
    );
    if (match) {
      recordGc(match[2], Number(match[1]), Number(match[3]));
    } else {
      plainCollector.push(line);
    }
  }
}

const child = spawn(
  process.execPath,
  [
    "--trace-gc",
    benchScript,
    "--dist",
    distArg,
    "--label",
    label,
    "--mode",
    mode,
    "--rounds",
    rounds,
  ],
  {
    cwd: path.resolve(import.meta.dirname),
    stdio: ["ignore", "pipe", "pipe"],
  },
);

const plainOutput = [];
let gcTrace = "";

child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  consumeLines(chunk, plainOutput);
});

child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => {
  gcTrace += chunk;
  consumeLines(chunk, plainOutput);
});

const exitCode = await new Promise((resolve) => {
  child.on("close", resolve);
});

if (plainOutput.length > 0) {
  console.log(plainOutput.join("\n"));
}

console.log(`gc profile [${label}]`);
console.log(`mode ${mode}, rounds ${rounds}`);

for (const [kind, stats] of gcStats) {
  const avgPause = stats.count ? stats.totalPause / stats.count : 0;
  const intervals = summarizeIntervals(stats.timestamps);
  console.table([
    {
      kind,
      count: stats.count,
      avg_pause: formatMs(avgPause),
      max_pause: formatMs(stats.maxPause),
      avg_interval: formatMs(intervals.avg),
      min_interval: formatMs(intervals.min),
      max_interval: formatMs(intervals.max),
    },
  ]);
}

if (exitCode !== 0) {
  process.stderr.write(gcTrace);
  process.exit(exitCode ?? 1);
}
