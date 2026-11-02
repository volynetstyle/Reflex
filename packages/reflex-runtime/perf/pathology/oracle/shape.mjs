// Hot-path shape of two bundles (not timing). Build both sides with
// `--production --readable`: the code that ships, names kept (`--readable`
// alone is the unminified test build, whose constants are loads).
//  1. Ignition bytecode (length and opcode sequence) of every listed function
//     under the driver below. A difference outside --expect fails.
//  2. Per workload of bench/workloads.mjs (--workloads) and the driver: every
//     TurboFan unit, all its inlined functions and its machine code size. A
//     difference fails, unless the workload is listed in --report (its tape
//     runs, so its tape units differ by design).
//   node perf/pathology/oracle/shape.mjs <base dir> <candidate dir>
//     [--expect fn,fn] [--pair candidateFn=baseFn,...]
//     [--workloads id,id] [--report id,id]
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

const FUNCTIONS = [
  "readProducer",
  "readConsumer",
  "resolveTrackedRead",
  "resolveCursorTrackedReadMiss",
  "resolveInitialTrackedReadMiss",
  "resolveTailTrackedReadMiss",
  "reconcileLocatedRead",
  "locateTrackedEdge",
  "locateReorderedEdge",
  "findEdgeInLockstep",
  "findEdgeInLockstepFromFinger",
  "findEdgeInLockstepFarFinger",
  "findEdgeInLockstepPastHeadStart",
  "linkEdge",
  "linkFirstTrackedEdgeUnchecked",
  "appendTrackedEdgeAfterCursorUnchecked",
  "moveTrackedIncomingEdgeAfterCursorUnchecked",
  "moveTrackedIncomingEdgeToFrontUnchecked",
  "isEdgeInTrackedPrefix",
  "advanceCore",
  "executeComputation",
  "runWatcherCore",
  "cleanupUnvisitedSources",
  "unlinkAllSources",
  "pushIteratorCore",
  "pull_iterator",
  "shouldRecomputeCore",
  "getTrackingPassStamp",
  "isLeaseLive",
  "preparedMissIsAbsent",
  "settleOnPreparedTape",
  "strikeOnFarFingerHit",
  "notePreparedLink",
  "releaseLease",
  "recordStrikeAndMaybePrepareTape",
  "prepareTape",
  "forgetStrikeConsumer",
];

if (process.argv[2] === "--drive-workload") {
  const rt = await import(pathToFileURL(process.argv[3]).href);
  const { findWorkload } = await import(
    pathToFileURL(path.join(import.meta.dirname, "../../../bench/workloads.mjs"))
      .href
  );
  const { step } = findWorkload(process.argv[4]).setup(rt);
  let sink = 0;
  for (let i = 0; i < 40_000; i++) sink ^= step(i) | 0;
  process.stdout.write(`sink ${sink}\n`);
  process.exit(0);
}

if (process.argv[2] === "--drive") {
  const rt = await import(pathToFileURL(process.argv[3]).href);
  const range = (k) => Array.from({ length: k }, (_, i) => i);
  const subscribe = (ps, count) => {
    for (let c = 0; c < count; c++)
      rt.readConsumer(
        rt.createConsumer(() => ps.reduce((t, p) => t + rt.readProducer(p), 0)),
      );
  };
  // Stable reads, shuffled shared reads (finger, tape), mounts with
  // certificates, nested mounts, cleanup, watchers and push/pull.
  const P = range(256).map((i) => rt.createProducer(i));
  subscribe(P, 16);
  const tick = rt.createProducer(0);
  const shuffled = range(8).map((c) =>
    rt.createConsumer(() => {
      const s = rt.readProducer(tick);
      let t = 0;
      for (let i = 0; i < 256; i++)
        t += rt.readProducer(P[(i * 37 + s * 13 + c) % 256]);
      return t;
    }),
  );
  const stable = rt.createConsumer(() =>
    P.reduce((t, p) => t + rt.readProducer(p), 0),
  );
  const toggle = rt.createConsumer(() =>
    (rt.readProducer(tick) & 1) === 0
      ? P.slice(0, 128).reduce((t, p) => t + rt.readProducer(p), 0)
      : P.slice(128).reduce((t, p) => t + rt.readProducer(p), 0),
  );
  let sink = 0;
  const w = rt.createWatcher(() => {
    sink += rt.readConsumer(stable) + rt.readConsumer(toggle);
  });
  for (let s = 1; s < 400; s++) {
    rt.writeProducer(tick, s);
    for (const c of shuffled) sink += rt.readConsumer(c);
    rt.writeProducer(P[s % 256], s);
    rt.runWatcher(w);
    const inner = () => {
      const m = rt.createConsumer(() =>
        P.reduce((t, p) => t + rt.readProducer(p), 0),
      );
      const v = rt.readConsumer(m);
      rt.disposeNode(m);
      return v;
    };
    const outer = rt.createConsumer(() => {
      let t = 0;
      for (let i = 0; i < 256; i++) {
        t += rt.readProducer(P[255 - i]);
        if (i === 128) t += inner();
      }
      return t;
    });
    sink += rt.readConsumer(outer);
    rt.disposeNode(outer);
  }
  process.stdout.write(`sink ${sink % 7}\n`);
  process.exit(0);
}

const args = process.argv.slice(4);
const list = (name) =>
  (args.includes(name) ? args[args.indexOf(name) + 1] : "")
    .split(",")
    .filter(Boolean);
const expected = new Set(list("--expect"));
/** Candidate function -> the base function it stands for. */
const pairs = new Map(list("--pair").map((p) => p.split("=")));
const workloads = list("--workloads");
const reportOnly = new Set(list("--report"));
const canonical = (side, name) =>
  side === "candidate" ? (pairs.get(name) ?? name) : name;

const driverArgs = (dir, workload) =>
  workload === "driver"
    ? [import.meta.filename, "--drive", path.join(dir, "runtime.mjs")]
    : [
        import.meta.filename,
        "--drive-workload",
        path.join(dir, "runtime.mjs"),
        workload,
      ];

function bytecode(dir, fn) {
  const r = spawnSync(
    process.execPath,
    [
      "--print-bytecode",
      `--print-bytecode-filter=${fn}`,
      ...driverArgs(dir, "driver"),
    ],
    { encoding: "utf8", maxBuffer: 1 << 28 },
  );
  const size = /Bytecode length: (\d+)/.exec(r.stdout)?.[1];
  const ops = [
    ...r.stdout.matchAll(
      /^\s*\S+ @\s+\d+ : (?:[0-9a-f]{2} )+\s*([A-Z][A-Za-z.]+)/gm,
    ),
  ].map((m) => m[1]);
  return size ? `${size}:${ops.join(" ")}` : "not compiled";
}

/** Per TurboFan unit under one workload: inlined functions and code size. */
function units(dir, workload, side) {
  const r = spawnSync(
    process.execPath,
    [
      "--no-concurrent-recompilation",
      "--trace-turbo-inlining",
      "--trace-opt",
      "--print-opt-code",
      ...driverArgs(dir, workload),
    ],
    { encoding: "utf8", maxBuffer: 1 << 30 },
  );
  const out = new Map();
  let unit = null;
  let code = null;
  for (const line of r.stdout.split("\n")) {
    if (/compiling method/.test(line) && !/target TURBOFAN/.test(line)) {
      unit = null;
      continue;
    }
    const start = /compiling method .*?<JSFunction (\w+)/.exec(line);
    if (start) {
      unit = canonical(side, start[1]);
      out.set(unit, { inlined: new Set(), size: "?" });
      continue;
    }
    const name = /^name = (\w+)/.exec(line);
    if (name) code = canonical(side, name[1]);
    const size = /^Instructions \(size = (\d+)\)/.exec(line);
    if (size && code !== null && out.has(code)) out.get(code).size = size[1];
    if (unit === null) continue;
    const inl = /Inlining .*?<SharedFunctionInfo (\w+)>/.exec(line);
    if (inl) out.get(unit).inlined.add(canonical(side, inl[1]));
  }
  return out;
}

const [base, candidate] = process.argv.slice(2, 4).map((d) => path.resolve(d));
let failures = 0;
console.log(`Node ${process.version}`);
console.log("\n| function | bytecode | verdict |\n|---|---|---|");
const rows = [
  ...FUNCTIONS.map((fn) => [fn, fn]),
  ...[...pairs].map(([c, b]) => [c, b]),
];
for (const [cand, fn] of rows) {
  const a = bytecode(base, fn);
  const b = bytecode(candidate, cand);
  const same = a === b;
  const verdict = same
    ? "identical"
    : expected.has(cand)
      ? "changed (declared)"
      : "**CHANGED**";
  if (!same && !expected.has(cand)) failures++;
  const size = (s) => s.split(":")[0];
  const label = cand === fn ? fn : `${cand} ≙ ${fn}`;
  console.log(`| ${label} | ${size(a)} → ${size(b)} | ${verdict} |`);
}

for (const workload of ["driver", ...workloads]) {
  const gate = workload !== "driver" && !reportOnly.has(workload);
  const ua = units(base, workload, "base");
  const ub = units(candidate, workload, "candidate");
  let differing = 0;
  let declared = 0;
  const lines = [];
  for (const name of [...new Set([...ua.keys(), ...ub.keys()])].sort()) {
    const fmt = (u) =>
      u === undefined
        ? "(not optimized)"
        : `${[...u.inlined].sort().join(",") || "—"} [${u.size} B]`;
    const x = ua.get(name);
    const y = ub.get(name);
    const a = fmt(x);
    const b = fmt(y);
    // The same inlining, a different code size, and a declared bytecode
    // change inlined: the difference is that change's, not the layout's.
    const tree = (u) => [...u.inlined].sort().join(",");
    const explained =
      a !== b &&
      x !== undefined &&
      y !== undefined &&
      tree(x) === tree(y) &&
      [name, ...x.inlined].some((fn) => expected.has(fn));
    if (explained) declared++;
    else if (a !== b) differing++;
    const mark = a === b ? name : explained ? `${name} (declared)` : `**${name}**`;
    lines.push(`| ${mark} | ${a} | ${a === b ? "same" : b} |`);
  }
  if (gate && differing > 0) failures++;
  const extra = declared > 0 ? `, ${declared} by a declared change` : "";
  const verdict =
    differing === 0
      ? `identical${extra}`
      : gate
        ? `**${differing} units differ**${extra}`
        : `${differing} units differ (tape runs: reported)${extra}`;
  console.log(`\n### ${workload}: ${verdict}\n`);
  console.log("| unit | base: inlined [code] | candidate |\n|---|---|---|");
  for (const line of lines) console.log(line);
}
process.exitCode = failures === 0 ? 0 : 1;
