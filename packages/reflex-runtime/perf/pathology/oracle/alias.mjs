// Generation aliasing by reuse distance (instrument-only, counts): owner A
// mounts over S (its lane's tags land on S), then k mounts over a disjoint T
// arm lanes without touching S, then a fresh owner mounts over S. A tag of
// A that equals the fresh owner's generation is a false "maybe": an exact
// search on a producer without an edge to the owner ("stale").
//   node perf/pathology/oracle/alias.mjs <instrumented bundle dir>
import path from "node:path";
import { pathToFileURL } from "node:url";

const rt = await import(
  pathToFileURL(path.resolve(process.argv[2], "runtime.mjs")).href
);

let recording = false;
let stale = 0;
let exact = 0;
let certified = 0;
globalThis.__ev = (kind, consumer, value, producer) => {
  if (!recording) return;
  if (kind === "cert-absent" || (kind === "certify-after-cover" && value === 1))
    certified++;
  if (kind !== "exact-fallback" || producer === undefined) return;
  exact++;
  for (let e = producer.firstOut; e !== null; e = e.nextOut)
    if (e.to === consumer) return;
  stale++;
};

const range = (k) => Array.from({ length: k }, (_, i) => i);
function subscribe(ps, count) {
  for (let c = 0; c < count; c++)
    rt.readConsumer(
      rt.createConsumer(() => ps.reduce((t, p) => t + rt.readProducer(p), 0)),
    );
}
const mount = (ps) => {
  const c = rt.createConsumer(() =>
    ps.reduce((t, p) => t + rt.readProducer(p), 0),
  );
  rt.readConsumer(c);
  return c;
};

const N = 256;
console.log("| k (mounts between) | stale searches on the fresh mount | certified | of N |");
console.log("|---:|---:|---:|---:|");
const hits = [];
for (let k = 1; k <= 64; k++) {
  const S = range(N).map((i) => rt.createProducer(i));
  const T = range(N).map((i) => rt.createProducer(i));
  subscribe(S, 16);
  subscribe(T, 16);
  mount(S);
  for (let i = 0; i < k; i++) mount(T);
  stale = exact = certified = 0;
  recording = true;
  mount(S);
  recording = false;
  if (stale > 0) hits.push(k);
  console.log(`| ${k} | ${stale} | ${certified} | ${N} |`);
}
console.log(`\naliasing distances: ${hits.length === 0 ? "none" : hits.join(", ")}`);
