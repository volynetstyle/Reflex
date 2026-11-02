// Ablation of the tape, in counts that do not depend on how a tape is kept
// (not timing). Every commit is built with the same generic probes:
//   search-step   one link compared by the exact search (findEdge.ts, the
//                 same file at every point): the work a tape exists to save
//   visit:<fn>    one incoming edge walked by the tape itself, per function
//   call:<fn>     one entry into a tape function (its control-plane calls)
//   cert          a certificate request answered "absent"
//   hint          a pair answered by the hint probe (a cell)
//   node perf/pathology/oracle/ablation.mjs <commit>... [--out dir]
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.join(import.meta.dirname, "../../..");
const TAPE = "src/kernel/shape/graph/tape.ts";
const FIND = "src/kernel/shape/graph/findEdge.ts";
const EV = `const ev = (k: string, v = 1): void => (globalThis as any).__ev?.(k, v);\n`;

/** Probes every tape function's entry, every walk over incoming edges, and the certificate. */
function probeTape(source) {
  let out = "";
  let at = 0;
  const fn = /^(export )?function (\w+)\(/gm;
  const starts = [...source.matchAll(fn)];
  out += source.slice(0, starts[0].index);
  for (let i = 0; i < starts.length; i++) {
    const name = starts[i][2];
    const end = i + 1 < starts.length ? starts[i + 1].index : source.length;
    let body = source.slice(starts[i].index, end);
    // Entry: the first `{` after the parameter list's `)`.
    const open = body.indexOf("{", body.indexOf(")"));
    body = `${body.slice(0, open + 1)}\n  ev("call:${name}");${body.slice(open + 1)}`;
    // Walks: a loop whose header names an incoming edge.
    body = body.replace(
      /((?:for|while) \((?:[^()]|\([^()]*\))*incomingEdge(?:[^()]|\([^()]*\))*\)\s*\{)/g,
      `$1\n    ev("visit:${name}");`,
    );
    if (name === "preparedMissIsAbsent")
      body = body.replace("function preparedMissIsAbsent(", "function preparedMissIsAbsentProbed(");
    out += body;
    at = end;
  }
  void at;
  out = out.replace(/(import[^;]+;\n)(?![\s\S]*import[^;]+;\n)/, `$1${EV}`);
  out += `
export function preparedMissIsAbsent(producer: ReactiveNode, consumer: ReactiveNode): boolean {
  const r = preparedMissIsAbsentProbed(producer, consumer);
  ev(r ? "cert" : "no-cert");
  return r;
}
`;
  return out;
}

function probeFind(source) {
  const probed = source.replace(
    /if \(__PROFILE__\)\s*observeRuntimeProjection\?\.\("projection\.semantic\.tracking\.locate\.step"\);/g,
    `(globalThis as any).__ev?.("search-step", 1);`,
  );
  return probed.replace(
    "    return hint;\n",
    `    (globalThis as any).__ev?.("hint", 1);\n    return hint;\n`,
  );
}

const git = (...a) => execFileSync("git", a, { cwd: root, encoding: "utf8", maxBuffer: 1 << 26 });

export function build(commit, out) {
  const dir = mkdtempSync(path.join(tmpdir(), `reflex-ablation-${commit}-`));
  const tape = probeTape(git("show", `${commit}:packages/reflex-runtime/${TAPE}`));
  const find = probeFind(git("show", `${commit}:packages/reflex-runtime/${FIND}`));
  if (!find.includes("search-step")) throw new Error(`${commit}: no search probe`);
  writeFileSync(path.join(dir, "tape.ts"), tape);
  writeFileSync(path.join(dir, "findEdge.ts"), find);
  execFileSync(
    process.execPath,
    [
      "scripts/build-baseline-oracle.mjs", "--commit", commit,
      "--overlay", `${TAPE}=${path.join(dir, "tape.ts")}`,
      "--overlay", `${FIND}=${path.join(dir, "findEdge.ts")}`,
      "--out", out,
    ],
    { cwd: root, stdio: ["ignore", "ignore", "inherit"] },
  );
}

const ENTRIES = new Set([
  "preparedMissIsAbsent", "preparedMissIsAbsentProbed", "settleOnPreparedTape",
  "strikeOnFarFingerHit", "notePreparedLink", "getTrackingPassStamp", "isLeaseLive",
  "forgetStrikeConsumer",
]);

/** One bundle under the plan; one line per workload. */
async function measure(bundle) {
  const rt = await import(pathToFileURL(path.join(bundle, "runtime.mjs")).href);
  const { cases: clinical } = await import("../cases.mjs");
  const { cases: consequences } = await import("../consequences.mjs");
  const { cases: discovery } = await import("../discovery.mjs");
  const plan = [
    ["mount over popular producers", consequences["mount-fanout"], 256],
    ["list-mount, 16 stores", consequences["list-mount"], 16],
    ["list-mount, 256 stores", consequences["list-mount"], 256],
    ["mount-dispose-wide", clinical["mount-dispose-wide"], 4096],
    ["nested mount", consequences["nested-mount"], 4096],
    ["sequential mount", consequences["sequential-mount"], 4096],
    ["suspend and resume", discovery["suspend-resume"], 4096],
    ["branch toggle", discovery["branch-toggle-wide"], 4096],
    ["wide -> narrow -> wide", clinical["wide-narrow"], 16384],
    ["replace half", clinical["replace-half"], 16384],
    ["shared thrash", clinical["shared-thrash"], 1024],
    ["shuffle over clean", discovery["shuffle-over-clean"], 1024],
    ["shuffle over dirty", discovery["shuffle-over-dirty"], 1024],
    ["nested shuffle", discovery["nested-shuffle"], 4096],
    ["sequential shuffle", discovery["sequential-shuffle"], 4096],
  ];
  const tally = new Map();
  let on = false;
  globalThis.__ev = (k, v = 1) => {
    if (on) tally.set(k, (tally.get(k) ?? 0) + v);
  };
  const rows = [];
  for (const [label, spec, n] of plan) {
    const { op, reads } = spec.build(rt, n);
    op();
    op();
    tally.clear();
    on = true;
    const STEPS = 3;
    let value = 0;
    for (let i = 0; i < STEPS; i++) value = op();
    on = false;
    const per = (x) => x / STEPS / reads;
    let visits = 0, calls = 0, inner = 0;
    for (const [k, v] of tally) {
      if (k.startsWith("visit:")) visits += v;
      if (k.startsWith("call:")) {
        calls += v;
        if (!ENTRIES.has(k.slice(5))) inner += v;
      }
    }
    rows.push({
      label, n, value: String(value),
      search: per(tally.get("search-step") ?? 0),
      visits: per(visits),
      inner: per(inner),
      cert: per(tally.get("cert") ?? 0),
      hint: per(tally.get("hint") ?? 0),
    });
  }
  return rows;
}

if (process.argv[2] === "--measure") {
  process.stdout.write(JSON.stringify(await measure(process.argv[3])));
  process.exit(0);
}

const args = process.argv.slice(2);
const outDir = path.resolve(args.includes("--out") ? args[args.indexOf("--out") + 1] : path.join(tmpdir(), "reflex-ablation"));
const commits = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--out");
const results = [];
for (const c of commits) {
  const dir = path.join(outDir, c);
  mkdirSync(dir, { recursive: true });
  build(c, dir);
  const json = execFileSync(process.execPath, [import.meta.filename, "--measure", dir], { encoding: "utf8", maxBuffer: 1 << 26 });
  results.push([c, JSON.parse(json)]);
}
const fmt = (x) => (x === 0 ? "0" : x >= 10 ? x.toFixed(0) : x >= 0.1 ? x.toFixed(2) : x.toFixed(3));
for (const [metric, title] of [
  ["search", "exact-search steps per read"],
  ["visits", "edges walked by the tape per read"],
  ["inner", "tape control-plane calls per read (entries excluded)"],
  ["cert", "certified absences per read"],
]) {
  console.log(`\n### ${title}\n`);
  console.log(`| workload | n | ${commits.join(" | ")} |`);
  console.log(`|---|---:|${commits.map(() => "---:").join("|")}|`);
  for (let w = 0; w < results[0][1].length; w++) {
    const row = results.map(([, rows]) => rows[w]);
    console.log(`| ${row[0].label} | ${row[0].n} | ${row.map((r) => fmt(r[metric])).join(" | ")} |`);
  }
}
const mismatch = results[0][1].filter((r, w) => results.some(([, rows]) => rows[w].value !== r.value));
console.log(`\nresults equal across commits: ${mismatch.length === 0 ? "yes" : mismatch.map((r) => r.label).join(", ")}`);
