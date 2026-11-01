// TurboFan inlining trees of the finger path, per optimized function (a
// shape measurement, not timing). Runs one child of schedule.mjs or
// frozen.mjs under --trace-opt --trace-turbo-inlining with serial
// recompilation, splits the trace into compilation units and prints, for
// every unit that inlines or considers a function of interest, what was
// inlined and which candidates were left as calls.
//
//   node inlining.mjs <log file> [--focus re]       parse an existing log
//   node inlining.mjs --run <out.log> -- <child args...>
//        (run node with the trace flags on the child, then parse)
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const focus = new RegExp(args.includes("--focus") ? args[args.indexOf("--focus") + 1] : "findEdgeInLockstep|race[A-Z]\\w*|FromFinger|Quiet|Untaped|PastHeadStart|FarFinger");
let logFile = args[0];
if (args[0] === "--run") {
  logFile = args[1];
  const child = args.slice(args.indexOf("--") + 1);
  const r = spawnSync(process.execPath, ["--no-concurrent-recompilation", "--trace-opt", "--trace-turbo-inlining", ...child], { encoding: "utf8", maxBuffer: 1 << 28 });
  writeFileSync(logFile, r.stdout + r.stderr);
  if (r.status !== 0) throw new Error(r.stderr.slice(0, 800));
}

const clean = (s) => s.replace(/0x[0-9a-f]+ ?|[0-9A-F]{16} ?/g, "");
const sfi = (s) => /<SharedFunctionInfo ([^>]*)>/.exec(s)?.[1] ?? /<JSFunction ([^ >]*)/.exec(s)?.[1];
const units = [];
let unit = null;
let lastTarget = null;
for (const raw of readFileSync(logFile, "utf8").split("\n")) {
  const line = clean(raw);
  const compiling = /\[compiling method .*<JSFunction ([^ >]*)/.exec(line);
  if (compiling && /TURBOFAN/.test(line)) {
    unit = { root: compiling[1], inlined: [], candidates: new Map() };
    units.push(unit);
    continue;
  }
  if (!unit) continue;
  const target = /- target: \{?\s*<SharedFunctionInfo ([^>]*)>\}?, bytecode size: (\d+)/.exec(line);
  if (target) {
    lastTarget = target[1];
    unit.candidates.set(target[1], +target[2]);
    continue;
  }
  const inl = /^Inlining .*?<SharedFunctionInfo ([^>]*)>.* into .*?<SharedFunctionInfo ([^>]*)>/.exec(line);
  if (inl) unit.inlined.push(inl[1]);
}

// The last compilation of each root is the code that runs in steady state.
const last = new Map();
for (const u of units) last.set(u.root, u);
let printed = 0;
for (const u of last.values()) {
  const inlinedFocus = u.inlined.filter((f) => focus.test(f));
  const leftFocus = [...u.candidates.entries()].filter(([f]) => focus.test(f) && !u.inlined.includes(f));
  if (!focus.test(u.root) && inlinedFocus.length === 0 && leftFocus.length === 0) continue;
  printed++;
  const total = u.inlined.reduce((sum, f) => sum + (u.candidates.get(f) ?? 0), 0);
  console.log(`${u.root}  (compilations: ${units.filter((x) => x.root === u.root).length}, inlined bytecode ~${total})`);
  console.log(`  inlined: ${[...new Set(u.inlined)].map((f) => `${f}${u.candidates.has(f) ? `(${u.candidates.get(f)})` : ""}`).join(", ") || "-"}`);
  if (leftFocus.length) console.log(`  left as call: ${leftFocus.map(([f, size]) => `${f}(${size})`).join(", ")}`);
}
if (printed === 0) console.log("no unit touches the focus functions");
