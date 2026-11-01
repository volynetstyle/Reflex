// Deterministic controller counters per transition (not timing; may run locally):
// prepares and their scan, strikes, far finger hits, lookups, finger lookups,
// those on a recorded owner's cell, plain lockstep entries, and loop steps per
// function (the PROFILE step markers a readable build leaves as `if (false)`).
//   node count.mjs <dir of readable bundles> <shapes.mjs> <bundle>...
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const [dir, shapesPath, ...names] = process.argv.slice(2);
const { shapes, range } = await import(pathToFileURL(shapesPath).href);
const at = (src, fn, code) => {
  const re = new RegExp("^(function " + fn + "[(][^)]*[)] [{])$", "m");
  if (!re.test(src)) {
    if (fn === "prepareTape") return src; // tree-shaken where nothing prepares
    throw new Error("no " + fn);
  }
  return src.replace(re, `$1 ${code}`);
};
function instrument(src) {
  src = src.split(String.fromCharCode(13)).join("");
  src = at(
    src,
    "prepareTape",
    "__C.prep++; __C.prepScan += (() => { let n = 0; for (let e = consumer.firstIn; e; e = e.nextIn) n++; return n; })();",
  );
  src = at(src, "recordStrikeAndMaybePrepareTape", "__C.strike++;");
  src = at(src, "strikeOnFarFingerHit", "__C.farHit++;");
  src = at(src, "findEdgeInLockstep", "__C.lookup++;");
  src = at(
    src,
    "findEdgeInLockstepFromFinger",
    "__C.finger++; if (preparedOwner !== null && finger.to === preparedOwner) __C.foreignCell++;",
  );
  src = at(src, "findEdgeInLockstepPastHeadStart", "__C.plain++;");
  // per-function step counts from the PROFILE step markers left as `if (false)`
  let fn = "?";
  return src
    .split("\n")
    .map((line, i, all) => {
      const m = /^function (\w+)\(/.exec(line);
      if (m) fn = m[1];
      if (
        /^\s*if \(false\)\s*$/.test(line) &&
        /locate\.step/.test(all[i + 1] ?? "")
      )
        return line.replace(
          "if (false)",
          `__C["step:${fn}"] = (__C["step:${fn}"] ?? 0) + 1; if (false)`,
        );
      return line;
    })
    .join("\n");
}
const sizes = [
  [64, 16],
  [64, 128],
  [256, 16],
  [256, 128],
];
const out = {};
for (const name of names) {
  const src = instrument(
    readFileSync(path.join(dir, name, "runtime.mjs"), "utf8"),
  );
  const file = path.join(dir, "..", "ib", name, "runtime.mjs");
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `globalThis.__C ??= {};\n` + src);
  const rt = await import(pathToFileURL(file).href + `?${name}`);
  for (const s of Object.keys(shapes))
    for (const [d, k] of sizes) {
      const patterns = shapes[s](d, k),
        period = patterns.length;
      const pool = patterns.flat(2).reduce((m, i) => Math.max(m, i + 1), 0);
      const sel = rt.createProducer(0),
        src2 = range(pool).map((i) => rt.createProducer(i));
      const cons = patterns[0].map((_, c) => {
        const by = patterns.map((p) => p[c]);
        return rt.createConsumer(() => {
          const pat = by[rt.readProducer(sel) % period];
          let t = 0;
          for (let i = 0; i < pat.length; i++)
            t += rt.readProducer(src2[pat[i]]);
          return t;
        });
      });
      const sum = rt.createConsumer(() => {
        let t = 0;
        for (const c of cons) t += rt.readConsumer(c);
        return t;
      });
      rt.readConsumer(sum);
      let step = 0;
      const T = Math.max(8, 2 * period);
      for (let i = 0; i < T; i++) {
        rt.writeProducer(sel, ++step);
        rt.readConsumer(sum);
      }
      for (const key of Object.keys(globalThis.__C)) delete globalThis.__C[key];
      for (const key of [
        "prep",
        "prepScan",
        "strike",
        "farHit",
        "lookup",
        "finger",
        "foreignCell",
        "plain",
      ])
        globalThis.__C[key] = 0;
      for (let i = 0; i < T; i++) {
        rt.writeProducer(sel, ++step);
        rt.readConsumer(sum);
      }
      const per = Object.fromEntries(
        Object.entries(globalThis.__C).map(([k2, v]) => [
          k2,
          +(v / T).toFixed(2),
        ]),
      );
      (out[`${s} ${d}x${k}`] ??= {})[name] = per;
    }
}
console.log(JSON.stringify(out));
