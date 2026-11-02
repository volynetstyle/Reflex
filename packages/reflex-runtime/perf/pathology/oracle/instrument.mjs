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
const root = path.resolve(
  opt("--root", path.join(import.meta.dirname, "../../..")),
);
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
const IMPORT = [
  `import { trackingStamp } from "@runtime/kernel/state";
`,
  `import { trackingStamp } from "@runtime/kernel/state";
` +
    `const ev = (k: string, c: ReactiveNode, s: number, p?: ReactiveNode): void => (globalThis as any).__ev?.(k, c, s, p);
`,
];
const RELEASE = [
  `export function releaseLease(owner: ReactiveNode): void {
`,
  `export function releaseLease(owner: ReactiveNode): void {
  ev("release", owner, preparedPassStamp);
`,
];
const DEAD = [
  `  if (isLeaseLive(consumer) === false) {
    releaseLease(consumer);`,
  `  if (isLeaseLive(consumer) === false) {
    ev("lease-dead", consumer, preparedPassStamp);
    releaseLease(consumer);`,
];
const certify = (mask) => [
  `  return (
    hasFullTapeCoverage &&
    (producer.state & (Computing | Watcher | ${mask})) === 0 &&
    producer !== consumer
  );`,
  `  const r =
    hasFullTapeCoverage &&
    (producer.state & (Computing | Watcher | ${mask})) === 0 &&
    producer !== consumer;
` +
    `  ev(r ? "cert-absent" : !hasFullTapeCoverage ? "uncovered-fallback" : (producer.state & ${mask}) !== 0 ? "exact-fallback" : "busy-fallback", consumer, preparedPassStamp);
` +
    `  return r;`,
];
const CELL = [
  `    slotEdge.from === producer
  ) {
    return slotEdge;`,
  `    slotEdge.from === producer
  ) {
    ev("cell-hit", consumer, preparedPassStamp);
    return slotEdge;`,
];
const DROP = [
  `  } else {
    hasFullTapeCoverage = false;
  }
}`,
  `  } else {
    if (hasFullTapeCoverage) ev("coverage-drop", preparedOwner as ReactiveNode, preparedPassStamp);
    hasFullTapeCoverage = false;
  }
}`,
];
// A source with `/* @ev kind(consumer, value) */` markers (research/tape-lanes)
// gets one ev() call per marker; the single-lease tape of dev gets the edits
// below.
const marked = tape.includes("/* @ev ");
const edits = marked
  ? [IMPORT]
  : [
      IMPORT,
      RELEASE,
      DEAD,
      certify("Leased"),
      CELL,
      DROP,
      [
        `  const passStamp = getTrackingPassStamp(consumer);

  if (lastStrikeConsumer !== consumer || lastStrikePassStamp !== passStamp) {
`,
        `  const passStamp = getTrackingPassStamp(consumer);
  ev("strike", consumer, passStamp);

  if (lastStrikeConsumer !== consumer || lastStrikePassStamp !== passStamp) {
` +
          `    const prev = lastStrikeConsumer;
` +
          `    if (prev !== null && prev !== consumer && (prev.state & Computing) !== 0 && getTrackingPassStamp(prev) === lastStrikePassStamp) ev("register-stolen", prev, lastStrikePassStamp);
`,
      ],
      [
        `    if (isLeaseLive(currentOwner) === true) return false;`,
        `    if (isLeaseLive(currentOwner) === true) {
      ev("lease-denied", consumer, passStamp);
      return false;
    }`,
      ],
      [
        `  preparedOwner = consumer;
  preparedPassStamp = passStamp;`,
        `  ev(allProducersCovered ? "prepare" : "prepare-uncovered", consumer, passStamp);
  preparedOwner = consumer;
  preparedPassStamp = passStamp;`,
      ],
    ];
if (marked) {
  // Markers are statements of the lane directory; the certificate's outcome
  // is reported where the dev tape reports it.
  tape = tape.replace(
    /\/\* @ev ([a-z-]+)\((.+?)\) \*\//g,
    (_, kind, args) => `ev("${kind}", ${args});`,
  );
  edits.push([
    `  return (
    hasFullTapeCoverage &&
    (producer.state & preparedAbsenceMask) === 0 &&
    producer !== consumer
  );`,
    `  const state = producer.state;
  const r =
    hasFullTapeCoverage &&
    (state & preparedAbsenceMask) === 0 &&
    producer !== consumer;
` +
      `  ev(r ? "cert-absent" : !hasFullTapeCoverage ? "uncovered-fallback" : (state & (Computing | Watcher)) === 0 && (state & preparedLaneTag) !== 0 ? "exact-fallback" : "busy-fallback", consumer, preparedPassStamp, producer);
` +
      `  return r;`,
  ]);
  edits.push(DEAD);
}
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
