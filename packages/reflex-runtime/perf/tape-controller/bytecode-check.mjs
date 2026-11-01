// Asserts that findEdgeInLockstep compiles to the same V8 bytecode (size and
// opcode sequence; operands vary with module slot layout) in every readable
// bundle as in the first one. Not a timing tool.
//   node bytecode-check.mjs <readable bundle dir>...
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

const fn = "findEdgeInLockstep";
if (process.argv[2] === "--drive") {
  const rt = await import(pathToFileURL(process.argv[3]).href);
  // Wide shared producers read in a shifting order: lookups reach findEdgeInLockstep.
  const sel = rt.createProducer(0);
  const src = Array.from({ length: 64 }, (_, i) => rt.createProducer(i));
  const cons = Array.from({ length: 8 }, (_, c) =>
    rt.createConsumer(() => {
      const s = rt.readProducer(sel);
      let t = 0;
      for (let i = 0; i < 64; i++)
        t += rt.readProducer(src[(i * 7 + s * 13 + c) % 64]);
      return t;
    }),
  );
  for (let s = 1; s < 4; s++) {
    rt.writeProducer(sel, s);
    for (const c of cons) rt.readConsumer(c);
  }
  process.exit(0);
}
const shape = (dir) => {
  const r = spawnSync(
    process.execPath,
    [
      "--print-bytecode",
      `--print-bytecode-filter=${fn}`,
      import.meta.filename,
      "--drive",
      path.join(dir, "runtime.mjs"),
    ],
    { encoding: "utf8", maxBuffer: 1 << 26 },
  );
  const text = r.stdout;
  const size = /Bytecode length: (\d+)/.exec(text)?.[1];
  const ops = [
    ...text.matchAll(
      /^\s*\S+ @\s+\d+ : (?:[0-9a-f]{2} )+\s*([A-Z][A-Za-z.]+)/gm,
    ),
  ].map((m) => m[1]);
  if (!size || ops.length === 0)
    throw new Error(`no bytecode for ${fn} in ${dir}`);
  return { size: +size, ops: ops.join(" ") };
};
const [ref, ...rest] = process.argv.slice(2);
const want = shape(ref);
console.log(
  `${path.basename(ref)}: ${fn} ${want.size} bytes, ${want.ops.split(" ").length} ops`,
);
let bad = 0;
for (const dir of rest) {
  const got = shape(dir);
  const same = got.size === want.size && got.ops === want.ops;
  if (!same) bad++;
  console.log(
    `${path.basename(dir)}: ${got.size} bytes ${same ? "identical" : "DIFFERENT"}`,
  );
}
process.exit(bad === 0 ? 0 : 1);
