// Builds an evidence-instrumented runtime bundle: tape.ts and the hint probe
// of findEdge.ts report every evidence decision to globalThis.__ev(kind,
// consumer, stamp). Generated from the current sources, so it never drifts.
//   node perf/pathology/oracle/instrument.mjs --out <dir>
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const argv = process.argv;
const opt = (n, f) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : f);
// --root: the runtime package to build from (default: this checkout).
const root = path.resolve(opt("--root", path.join(import.meta.dirname, "../../..")));
const out = opt("--out");
const TAPE = "src/kernel/shape/graph/tape.ts";
const FIND = "src/kernel/shape/graph/findEdge.ts";

function replaceOnce(source, search, replace) {
  const at = source.indexOf(search);
  if (at < 0 || source.indexOf(search, at + 1) >= 0)
    throw new Error(`not exactly one match: ${search}`);
  return source.slice(0, at) + replace + source.slice(at + search.length);
}

let tape = readFileSync(path.join(root, TAPE), "utf8");
const edits = [
  [
    `import { trackingStamp } from "@runtime/kernel/state";\n`,
    `import { trackingStamp } from "@runtime/kernel/state";\n` +
      `const ev = (k: string, c: ReactiveNode, s: number): void => (globalThis as any).__ev?.(k, c, s);\n`,
  ],
  [
    `export function releaseLease(owner: ReactiveNode): void {\n`,
    `export function releaseLease(owner: ReactiveNode): void {\n  ev("release", owner, preparedPassStamp);\n`,
  ],
  [
    `  if (isLeaseLive(consumer) === false) {\n    releaseLease(consumer);`,
    `  if (isLeaseLive(consumer) === false) {\n    ev("lease-dead", consumer, preparedPassStamp);\n    releaseLease(consumer);`,
  ],
  [
    `  return (\n    hasFullTapeCoverage &&\n    (producer.state & (Computing | Watcher | Leased)) === 0 &&\n    producer !== consumer\n  );`,
    `  const r =\n    hasFullTapeCoverage &&\n    (producer.state & (Computing | Watcher | Leased)) === 0 &&\n    producer !== consumer;\n` +
      `  ev(r ? "cert-absent" : !hasFullTapeCoverage ? "uncovered-fallback" : (producer.state & Leased) !== 0 ? "exact-fallback" : "busy-fallback", consumer, preparedPassStamp);\n` +
      `  return r;`,
  ],
  [
    `    slotEdge.from === producer\n  ) {\n    return slotEdge;`,
    `    slotEdge.from === producer\n  ) {\n    ev("cell-hit", consumer, preparedPassStamp);\n    return slotEdge;`,
  ],
  [
    `  const passStamp = getTrackingPassStamp(consumer);\n\n  if (lastStrikeConsumer !== consumer || lastStrikePassStamp !== passStamp) {\n`,
    `  const passStamp = getTrackingPassStamp(consumer);\n  ev("strike", consumer, passStamp);\n\n  if (lastStrikeConsumer !== consumer || lastStrikePassStamp !== passStamp) {\n` +
      `    const prev = lastStrikeConsumer;\n` +
      `    if (prev !== null && prev !== consumer && (prev.state & Computing) !== 0 && getTrackingPassStamp(prev) === lastStrikePassStamp) ev("register-stolen", prev, lastStrikePassStamp);\n`,
  ],
  [
    `    if (isLeaseLive(currentOwner) === true) return false;`,
    `    if (isLeaseLive(currentOwner) === true) {\n      ev("lease-denied", consumer, passStamp);\n      return false;\n    }`,
  ],
  [
    `  preparedOwner = consumer;\n  preparedPassStamp = passStamp;`,
    `  ev(allProducersCovered ? "prepare" : "prepare-uncovered", consumer, passStamp);\n  preparedOwner = consumer;\n  preparedPassStamp = passStamp;`,
  ],
  [
    `  } else {\n    hasFullTapeCoverage = false;\n  }\n}`,
    `  } else {\n    if (hasFullTapeCoverage) ev("coverage-drop", preparedOwner as ReactiveNode, preparedPassStamp);\n    hasFullTapeCoverage = false;\n  }\n}`,
  ],
];
for (const [a, b] of edits) tape = replaceOnce(tape, a, b);

const find = replaceOnce(
  readFileSync(path.join(root, FIND), "utf8"),
  `    return hint;\n`,
  `    (globalThis as any).__ev?.("hint-hit", consumer, -1);\n    return hint;\n`,
);

const dir = mkdtempSync(path.join(tmpdir(), "reflex-evidence-"));
writeFileSync(path.join(dir, "tape.ts"), tape);
writeFileSync(path.join(dir, "findEdge.ts"), find);
execFileSync(
  process.execPath,
  [
    "scripts/build-baseline-oracle.mjs",
    "--source",
    "--production",
    "--overlay",
    `${TAPE}=${path.join(dir, "tape.ts")}`,
    "--overlay",
    `${FIND}=${path.join(dir, "findEdge.ts")}`,
    "--out",
    path.resolve(out),
  ],
  { cwd: root, stdio: "inherit" },
);
