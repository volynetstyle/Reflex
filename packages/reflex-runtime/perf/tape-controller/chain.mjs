// Call boundaries on the read-miss chain, per workload (shape, not timing).
// Runs `time.mjs --measure <bundle> <shape> <d> <k>` under --trace-turbo-inlining
// with serial recompilation, keeps the last TurboFan compilation of each
// function, and walks the static chain from every optimized function that
// calls readProducer: a callee inlined into the current unit costs nothing,
// otherwise the walk crosses a call into the callee's own optimized code
// (or `interp` if it has none).
//   node chain.mjs <bundle> <shape> <d> <k> [-- extra node flags]
import { spawnSync } from "node:child_process";

const [bundle, shape, d, k, ...rest] = process.argv.slice(2);
const flags = rest[0] === "--" ? rest.slice(1) : [];
const r = spawnSync(process.execPath, ["--no-concurrent-recompilation", "--trace-opt", "--trace-turbo-inlining", ...flags, `${import.meta.dirname}/time.mjs`, "--measure", bundle, shape, d, k, "300", "60"], { encoding: "utf8", maxBuffer: 1 << 28 });
if (r.status !== 0) throw new Error(r.stderr.slice(0, 600));
const clean = (s) => s.replace(/0x[0-9a-f]+ ?|[0-9A-F]{16} ?/g, "");
const units = new Map();
let unit = null;
for (const raw of (r.stdout + r.stderr).split("\n")) {
  const line = clean(raw);
  const compiling = /\[compiling method .*<JSFunction ([^ >]*)/.exec(line);
  if (compiling && /TURBOFAN/.test(line)) { unit = { root: compiling[1] || "(anon)", inlined: new Set(), sizes: new Map() }; units.set(unit.root, unit); continue; }
  if (!unit) continue;
  const target = /- target: \{?\s*<SharedFunctionInfo ([^>]*)>\}?, bytecode size: (\d+)/.exec(line);
  if (target) { unit.sizes.set(target[1], +target[2]); continue; }
  const inl = /^Inlining .*?<SharedFunctionInfo ([^>]*)>.* into /.exec(line);
  if (inl) unit.inlined.add(inl[1]);
}
const chain = {
  readProducer: ["resolveTrackedRead"],
  resolveTrackedRead: ["resolveCursorTrackedReadMiss", "resolveTailTrackedReadMiss", "resolveInitialTrackedReadMiss"],
  resolveCursorTrackedReadMiss: ["locateReorderedEdge", "isEdgeInTrackedPrefix", "reconcileLocatedRead", "moveTrackedIncomingEdgeAfterCursorUnchecked"],
  resolveTailTrackedReadMiss: ["locateTrackedEdge", "appendTrackedEdgeAfterCursorUnchecked"],
  resolveInitialTrackedReadMiss: ["locateTrackedEdge", "reconcileLocatedRead", "moveTrackedIncomingEdgeToFrontUnchecked"],
  locateReorderedEdge: ["findEdgeInLockstep"],
  locateTrackedEdge: ["findEdgeInLockstep"],
  findEdgeInLockstep: ["findEdgeInLockstepFromFinger", "findEdgeInLockstepPastHeadStart"],
  reconcileLocatedRead: ["linkEdge", "moveTrackedIncomingEdgeAfterCursorUnchecked", "moveTrackedIncomingEdgeToFrontUnchecked"],
};
const short = (f) => f.replace("TrackedReadMiss", "Miss").replace("findEdgeInLockstep", "fEIL").replace("TrackedIncomingEdge", "").replace("Unchecked", "").replace("resolveTrackedRead", "rTR");
// Calls reachable from each unit that calls readProducer, with the unit they land in.
const out = [];
const walk = (fn, u, depth, seen) => {
  for (const g of chain[fn] ?? []) {
    if (seen.has(g)) continue;
    if (u.inlined.has(g)) { walk(g, u, depth, new Set([...seen, g])); continue; }
    const target = units.get(g);
    if (!u.sizes.has(g) && !target) continue; // never reached here
    out.push(`${"  ".repeat(depth + 1)}${short(u.root)} -> CALL ${short(g)}${target ? ` [${target.inlined.size} inlined]` : " [interp]"}`);
    if (target) walk(g, target, depth + 1, new Set([...seen, g]));
  }
};
for (const u of units.values()) {
  if (!(u.inlined.has("readProducer") || u.sizes.has("readProducer"))) continue;
  if (u.root === "readProducer") continue;
  const head = u.inlined.has("readProducer") ? "readProducer(inlined)" : "CALL readProducer";
  out.push(`${short(u.root)}: ${head}`);
  const start = u.inlined.has("readProducer") ? u : units.get("readProducer");
  if (start) { if (start !== u) out.push(`  ${short(u.root)} -> CALL readProducer [${start.inlined.size} inlined]`); walk("readProducer", start, start === u ? 0 : 1, new Set(["readProducer"])); }
}
console.log(out.join("\n"));
