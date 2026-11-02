// Hot-path shape of two readable bundles under one driver workload (not
// timing): Ignition bytecode (length and opcode sequence) of every listed
// function, and the TurboFan inlining of every optimized unit that inlines
// or calls a listed function. A difference outside the expected set fails.
//   node perf/pathology/oracle/shape.mjs <base dir> <candidate dir> [--expect fn,fn]
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
  "preparedMissIsAbsent",
  "settleOnPreparedTape",
  "strikeOnFarFingerHit",
  "notePreparedLink",
  "releaseLease",
  "recordStrikeAndMaybePrepareTape",
  "acquireTape",
];

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

function bytecode(dir, fn) {
  const r = spawnSync(
    process.execPath,
    [
      "--print-bytecode",
      `--print-bytecode-filter=${fn}`,
      import.meta.filename,
      "--drive",
      path.join(dir, "runtime.mjs"),
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

/** Per optimized unit: the set of inlined listed functions. */
function inlining(dir) {
  const r = spawnSync(
    process.execPath,
    [
      "--no-concurrent-recompilation",
      "--trace-turbo-inlining",
      "--trace-opt",
      import.meta.filename,
      "--drive",
      path.join(dir, "runtime.mjs"),
    ],
    { encoding: "utf8", maxBuffer: 1 << 28 },
  );
  const units = new Map();
  let unit = null;
  const listed = new RegExp(`\\b(${FUNCTIONS.join("|")})\\b`);
  for (const line of r.stdout.split("\n")) {
    if (/compiling method/.test(line) && !/target TURBOFAN/.test(line)) {
      unit = null;
      continue;
    }
    const start = /compiling method .*?<JSFunction (\w+)/.exec(line);
    if (start) {
      unit = start[1];
      if (!units.has(unit)) units.set(unit, new Set());
      continue;
    }
    if (unit === null) continue;
    const inl = /Inlining .*?<SharedFunctionInfo (\w+)>/.exec(line);
    if (inl && listed.test(inl[1])) units.get(unit).add(inl[1]);
  }
  const out = new Map();
  for (const [name, set] of units)
    if (listed.test(name) || set.size > 0)
      out.set(name, [...set].sort().join(","));
  return out;
}

const [base, candidate] = process.argv.slice(2, 4).map((d) => path.resolve(d));
const args = process.argv.slice(4);
const expected = new Set(
  (args.includes("--expect") ? args[args.indexOf("--expect") + 1] : "").split(
    ",",
  ),
);
let failures = 0;
console.log(`Node ${process.version}`);
console.log("\n| function | bytecode | verdict |\n|---|---|---|");
for (const fn of FUNCTIONS) {
  const a = bytecode(base, fn);
  const b = bytecode(candidate, fn);
  const same = a === b;
  const verdict = same
    ? "identical"
    : expected.has(fn)
      ? "changed (expected)"
      : "**CHANGED**";
  if (!same && !expected.has(fn)) failures++;
  const size = (s) => s.split(":")[0];
  console.log(`| ${fn} | ${size(a)} → ${size(b)} | ${verdict} |`);
}
const ia = inlining(base);
const ib = inlining(candidate);
console.log(
  "\n| optimized unit | inlined (base) | inlined (candidate) | verdict |\n|---|---|---|---|",
);
for (const name of new Set([...ia.keys(), ...ib.keys()])) {
  const a = ia.get(name) ?? "(not optimized)";
  const b = ib.get(name) ?? "(not optimized)";
  if (a !== b) failures++;
  console.log(
    `| ${name} | ${a || "—"} | ${b || "—"} | ${a === b ? "same" : "**DIFFERENT**"} |`,
  );
}
process.exitCode = failures === 0 ? 0 : 1;
