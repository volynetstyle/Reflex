// Mechanism ablation: remove one mechanism of the quant runtime at a time and
// record which tests fail. A mechanism no test needs is a candidate for
// deletion; the failing test is its smallest known counterexample.
//
//   node research/mutants.mjs [id ...]      results -> research/mutants.json
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const cache = path.join(root, ".cache/mutants");

/** id, mechanism removed, file, [find, replace]... (each find must be unique). */
export const mutants = [
  ["direct-dirty-running", "a running direct subscriber is left to versions (no DIRTY)", "kernel.ts",
    ["if ((sub.flags & RUNNING) === 0) sub.flags |= DIRTY;", "sub.flags |= DIRTY;"]],
  ["no-direct-dirty", "O2: direct subscribers marked DIRTY on write (optimization)", "kernel.ts",
    ["if ((sub.flags & RUNNING) === 0) sub.flags |= DIRTY;", ""]],
  ["no-skip", "O1: one-step lookahead before indexing (optimization)", "kernel.ts",
    ["if (skipped !== null && skipped.from === source) {", "if (false) {"]],
  ["no-absence-scan", "O1: bounded subscriber-side absence proof (optimization)", "kernel.ts",
    ["if (unsubscribed(source, c)) {", "if (false) {"]],
  ["no-displaced", "save/restore of an enclosing pass's slot cells", "kernel.ts",
    ["const source = e.from;\n    if (source.slot !== null) displaced.push(source, source.slot);", "const source = e.from;"],
    ["if (indexed) {\n    if (source.slot !== null) displaced.push(source, source.slot);", "if (indexed) {"]],
  ["no-unread", "UNREAD marking of the suffix while indexing", "kernel.ts",
    ["if (unread) e.version = UNREAD;", ""]],
  ["validate-tentative", "tentative relations excluded from watcher validation", "kernel.ts",
    ["if (e.gen === tentative) continue;", ""]],
  ["keep-tentative", "removal of earlier failed attempts' unread relations", "kernel.ts",
    ["if (e.gen === tentative) {\n      const before", "if (false) {\n      const before"]],
  ["cut-on-failure", "committed relations kept after a failure (wake set)", "kernel.ts",
    ["n.flags |= DIRTY;\n  const tentative", "n.flags |= DIRTY;\n  cut(n, n.cursor);\n  return;\n  const tentative"]],
  ["clear-after", "STALE cleared before the pass, so pushes during it survive", "kernel.ts",
    ["n.flags = (n.flags & ~(STALE | DIRTY)) | RUNNING;", "n.flags = (n.flags & ~DIRTY) | RUNNING;"],
    ["n.flags &= ~(RUNNING | INDEXED);", "n.flags &= ~(RUNNING | INDEXED | STALE);"]],
  ["validation-stale", "a failed validation leaves DIRTY (push passes) rather than STALE", "kernel.ts",
    ["  } catch (error) {\n    n.flags |= DIRTY;", "  } catch (error) {\n    n.flags |= STALE;"]],
  ["deliver-once", "watchers re-delivered on every push", "kernel.ts",
    ["if ((flags & WATCH) !== 0) {", "if ((flags & WATCH) !== 0) {\n    if ((flags & STALE) !== 0) return;"]],
  ["idle-after-failure", "a failed watcher keeps its execution obligation (R2)", "kernel.ts",
    ["  n.flags |= DIRTY;\n  const tentative", "  if ((n.flags & WATCH) === 0) n.flags |= DIRTY;\n  const tentative"]],
  ["existential-watcher", "watcher validation covers every committed source (V3)", "kernel.ts",
    ["if (source.version !== e.version) n.flags |= DIRTY;", "if (source.version !== e.version) { n.flags |= DIRTY; return; }"]],
  ["eager-dispose", "disposal deferred to the end of the node's own pass", "kernel.ts",
    ["  n.fn = null;\n  if ((n.flags & RUNNING) !== 0) return;", "  n.fn = null;"]],
  ["no-cycle-check", "RUNNING checked on read (cycle detection)", "kernel.ts",
    ["if ((n.flags & (STALE | DIRTY | RUNNING)) !== 0) refresh(n);", "if ((n.flags & (STALE | DIRTY)) !== 0) refresh(n);"]],
  ["no-repeat-check", "immediate repeat recognised before indexing", "kernel.ts",
    ["if (cursor !== null && cursor.from === source) {\n    if (__QUANT_STATS__) stats.repeats++;", "if (false) {\n    if (__QUANT_STATS__) stats.repeats++;"]],
  ["run-direct", "effects run inside the host's drain loop", "index.ts",
    ["  schedule(w);\n  flush();", "  run(w);"],
    ["import { flush, schedule, stop, watcher } from \"./host\";", "import { flush, run, stop, watcher } from \"./host\";"]],
  ["prepend-subs", "subscribers kept in birth order (subsTail append)", "kernel.ts",
    ["prevSub: tail,\n    nextSub: null,", "prevSub: null,\n    nextSub: source.subs,"],
    ["if (tail !== null) tail.nextSub = e;\n  else source.subs = e;\n  source.subsTail = e;",
      "if (source.subs !== null) source.subs.prevSub = e;\n  else source.subsTail = e;\n  source.subs = e;"]],
];

function build(id, file, edits) {
  const dir = path.join(cache, id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  cpSync(path.join(root, "src"), dir, { recursive: true });
  const target = path.join(dir, file);
  let text = readFileSync(target, "utf8");
  for (const [find, replace] of edits) {
    const at = text.indexOf(find);
    if (at < 0 || text.indexOf(find, at + 1) >= 0) throw new Error(`${id}: edit not unique: ${find.slice(0, 60)}`);
    text = text.slice(0, at) + replace + text.slice(at + find.length);
  }
  writeFileSync(target, text);
  return dir;
}

function runSuite(dir, id) {
  const out = path.join(cache, `${id}.json`);
  const result = spawnSync(
    process.execPath,
    [path.join(root, "../../node_modules/vitest/vitest.mjs"), "run", "--config", "vitest.config.ts", "--reporter=json", `--outputFile=${out}`],
    { cwd: root, env: { ...process.env, QUANT_SRC: dir, QUANT_RUNS: "3000" }, encoding: "utf8", timeout: 600_000 },
  );
  try {
    const report = JSON.parse(readFileSync(out, "utf8"));
    const failed = report.testResults.flatMap((file) =>
      file.assertionResults.filter((t) => t.status === "failed").map((t) => `${path.basename(file.name)} > ${t.title}`),
    );
    const suiteErrors = report.testResults.filter((f) => f.status === "failed" && f.assertionResults.length === 0).map((f) => `${path.basename(f.name)}: ${f.message.split("\n")[0]}`);
    return { failed: [...failed, ...suiteErrors], total: report.numTotalTests };
  } catch {
    return { failed: [`suite crashed: ${(result.stderr || result.stdout).split("\n").slice(0, 3).join(" ")}`], total: 0 };
  }
}

const only = new Set(process.argv.slice(2));
const results = [];
for (const [id, mechanism, file, ...edits] of mutants) {
  if (only.size && !only.has(id)) continue;
  const dir = build(id, file, edits);
  const { failed, total } = runSuite(dir, id);
  results.push({ id, mechanism, killed: failed.length > 0, failed });
  console.log(`${failed.length ? "KILLED  " : "SURVIVED"} ${id.padEnd(20)} ${failed.length}/${total}  ${failed.slice(0, 3).join(" | ")}`);
}
if (!only.size) writeFileSync(path.join(root, "research/mutants.json"), JSON.stringify(results, null, 2) + "\n");
