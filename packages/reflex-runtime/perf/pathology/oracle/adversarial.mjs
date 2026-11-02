// Adversarial cases for a compositional tape (MODEL §10.1), fixed before
// any implementation. Every case checks, on the evidence-instrumented
// bundle (instrument.mjs):
//   semantics  the values equal a plain-JS reference
//   integrity  every consumer's incoming list is reciprocal, pairs unique
//   target     the property a compositional tape must have, stated on
//              evidence counts; the current runtime may fail it (baseline)
//   node perf/pathology/oracle/adversarial.mjs <instrumented bundle dir>
import path from "node:path";
import { pathToFileURL } from "node:url";

const rt = await import(
  pathToFileURL(path.resolve(process.argv[2], "runtime.mjs")).href
);

const K = 4; // lanes assumed by the targets
const Q = 2; // uncovered exact fallbacks allowed before full coverage
const C = 32; // first suffix-coverage chunk

let recording = false;
const events = [];
const inLength = (c) => {
  let n = 0;
  for (let e = c.firstIn; e !== null; e = e.nextIn) n++;
  return n;
};
globalThis.__ev = (kind, consumer, stamp) => {
  if (!recording) return;
  const walked =
    kind === "prepare" || kind === "prepare-uncovered" ? inLength(consumer) : 0;
  events.push({ kind, consumer, stamp, walked });
};
function record(fn) {
  events.length = 0;
  recording = true;
  try {
    return fn();
  } finally {
    recording = false;
  }
}
const of = (node) => events.filter((e) => e.consumer === node);
const n = (node, kind) => of(node).filter((e) => e.kind === kind).length;
const walkedBy = (node) => of(node).reduce((t, e) => t + e.walked, 0);

const range = (k) => Array.from({ length: k }, (_, i) => i);
function permutation(k, seed) {
  const order = range(k);
  let s = seed >>> 0 || 1;
  for (let i = k - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}
const producers = (k, base = 0) =>
  range(k).map((i) => rt.createProducer(base + i));
const sumOf = (ps, ids = range(ps.length)) =>
  ids.reduce((t, i) => t + rt.untracked(() => rt.readProducer(ps[i])), 0);
function subscribe(nodes, count) {
  const out = [];
  for (let c = 0; c < count; c++) {
    const node = rt.createConsumer(() => {
      let t = 0;
      for (const p of nodes) t += rt.readProducer(p);
      return t;
    });
    rt.readConsumer(node);
    out.push(node);
  }
  return out;
}
/** A consumer reading `ps` in `order`, calling `at[i]()` after read i. */
function reader(ps, order = range(ps.length), at = {}) {
  return rt.createConsumer(() => {
    let t = 0;
    for (let i = 0; i < order.length; i++) {
      t += rt.readProducer(ps[order[i]]);
      if (at[i] !== undefined) t += at[i]();
    }
    return t;
  });
}

function integrity(consumers) {
  const problems = new Set();
  for (const c of consumers) {
    const seen = new Set();
    let prev = null;
    for (let e = c.firstIn; e !== null; e = e.nextIn) {
      if (e.to !== c) problems.add("edge.to");
      if (e.prevIn !== prev) problems.add("prevIn");
      if (seen.has(e.from)) problems.add("duplicate pair");
      seen.add(e.from);
      let found = false;
      for (let o = e.from.firstOut; o !== null; o = o.nextOut)
        if (o === e) found = true;
      if (!found) problems.add("missing from out(P)");
      prev = e;
    }
    if (c.lastIn !== prev) problems.add("lastIn");
  }
  return [...problems];
}

const N = 256;
const cases = [];
const add = (name, target, run) => cases.push({ name, target, run });

// 1. More simultaneously striking nested passes than lanes.
add(
  "overflow-nested",
  `levels < K=${K}: prepare, no denial; all: no live strike history overwritten`,
  () => {
    const DEPTH = K + 2;
    const sets = range(DEPTH).map((l) => producers(N, l * 1000));
    for (const s of sets) subscribe(s, 16);
    const levels = [];
    const make = (l) => {
      const at =
        l + 1 < DEPTH ? { [N >> 1]: () => rt.readConsumer(make(l + 1)) } : {};
      const c = reader(sets[l], range(N), at);
      levels[l] = c;
      return c;
    };
    const value = record(() => rt.readConsumer(make(0)));
    const expected = sets.reduce((t, s) => t + sumOf(s), 0);
    const per = levels.map((c) => ({
      prepare: n(c, "prepare"),
      denied: n(c, "lease-denied"),
      stolen: n(c, "register-stolen"),
    }));
    const ok =
      per.every((p) => p.stolen === 0) &&
      per.slice(0, K).every((p) => p.prepare >= 1 && p.denied === 0);
    const detail = per
      .map((p, l) => `L${l} prep ${p.prepare} den ${p.denied} stol ${p.stolen}`)
      .join("; ");
    return { ok, value, expected, nodes: levels, detail };
  },
);

// 2. Lane reuse across many consumers mounting over the same producers.
add(
  "lane-reuse-saturation",
  "the 64th mount over shared producers is certified like the 1st",
  () => {
    const P = producers(N);
    subscribe(P, 16);
    const mounts = [];
    const certs = [];
    let value = 0;
    for (let i = 0; i < 64; i++) {
      const c = reader(P, permutation(N, 5 + i));
      mounts.push(c);
      value += record(() => rt.readConsumer(c));
      certs.push(n(c, "cert-absent"));
    }
    const ok = certs[63] >= 0.9 * certs[0] && certs[0] > 0;
    return {
      ok,
      value,
      expected: 64 * sumOf(P),
      nodes: mounts,
      detail: `certified: 1st ${certs[0]}, 32nd ${certs[31]}, 64th ${certs[63]}`,
    };
  },
);

// 3. A suspended owner drops half its list in cleanup; a later mount over
// exactly the dropped producers pays stale bits at most once.
add(
  "suspended-cleanup-reuse",
  `first mount over the dropped half: exact fallbacks <= ${N >> 1}; a second: 0`,
  () => {
    const S = producers(N);
    const T = producers(N, 1000);
    subscribe(S, 16);
    subscribe(T, 16);
    const half = rt.createProducer(0);
    const outer = rt.createConsumer(() => {
      const k = rt.readProducer(half) === 0 ? N : N >> 1;
      let t = 0;
      for (let i = 0; i < k; i++) {
        t += rt.readProducer(S[i]);
        if (i === N >> 2) t += rt.readConsumer(reader(T));
      }
      return t;
    });
    rt.readConsumer(outer);
    rt.writeProducer(half, 1);
    let value = record(() => rt.readConsumer(outer));
    const dropped = S.slice(N >> 1);
    const m1 = reader(dropped);
    const v1 = record(() => rt.readConsumer(m1));
    const f1 = n(m1, "exact-fallback");
    const m2 = reader(dropped);
    const v2 = record(() => rt.readConsumer(m2));
    const f2 = n(m2, "exact-fallback");
    value += v1 + v2;
    const expected = sumOf(S, range(N >> 1)) + sumOf(T) + 2 * sumOf(dropped);
    return {
      ok: f1 <= N >> 1 && f2 === 0,
      value,
      expected,
      nodes: [outer, m1, m2],
      detail: `exact fallbacks: 1st mount ${f1}, 2nd mount ${f2}`,
    };
  },
);

// 4. Outer and inner mount over the same producers: one physical cell per
// producer, so the goal is bounded, not transparent; the inner pass must
// still get a tape.
add(
  "shared-nested",
  "inner mount over the outer's producers prepares; no denial",
  () => {
    const S = producers(N);
    subscribe(S, 16);
    let inner = null;
    const outer = reader(S, range(N), {
      [N >> 1]: () => rt.readConsumer((inner = reader(S, permutation(N, 9)))),
    });
    const value = record(() => rt.readConsumer(outer));
    return {
      ok: n(inner, "prepare") >= 1 && n(inner, "lease-denied") === 0,
      value,
      expected: 2 * sumOf(S),
      nodes: [outer, inner],
      detail: `inner: prepare ${n(inner, "prepare")}, denied ${n(inner, "lease-denied")}, strikes ${n(inner, "strike")}`,
    };
  },
);

// 5. Throws at every phase of a lane's life: right after the second strike,
// mid-pass, inside a nested pass after the lane switch, in the outer pass
// right after the nested one returned. Retried passes stay exact.
for (const [name, where] of [
  ["throw-after-arm", "outer@3"],
  ["throw-mid-pass", `outer@${N >> 1}`],
  ["throw-inner-after-switch", `inner@${N >> 1}`],
  ["throw-outer-after-inner", `outer@${(N >> 1) + 1}`],
]) {
  add(name, "retry is exact and the graph stays sound", () => {
    const S = producers(N);
    const T = producers(N, 1000);
    subscribe(S, 16);
    subscribe(T, 16);
    const fail = rt.createProducer(1);
    const [who, at] = where.split("@");
    const inner = rt.createConsumer(() => {
      let t = 0;
      for (let i = 0; i < N; i++) {
        t += rt.readProducer(T[i]);
        if (who === "inner" && i === +at && rt.readProducer(fail) === 1)
          throw new Error("inner");
      }
      return t;
    });
    const outer = rt.createConsumer(() => {
      let t = 0;
      for (let i = 0; i < N; i++) {
        t += rt.readProducer(S[i]);
        if (i === N >> 1) {
          try {
            t += rt.readConsumer(inner);
          } catch {
            t += 0;
          }
        }
        if (who === "outer" && i === +at && rt.readProducer(fail) === 1)
          throw new Error("outer");
      }
      return t;
    });
    let threw = false;
    record(() => {
      try {
        rt.readConsumer(outer);
      } catch {
        threw = true;
      }
    });
    rt.writeProducer(fail, 0);
    // C4: a read that threw is no observation, so after an inner failure the
    // outer consumer keeps its value; the inner one is read on its own.
    const value = record(
      () =>
        rt.readConsumer(outer) + (who === "inner" ? rt.readConsumer(inner) : 0),
    );
    return {
      ok: true,
      value,
      expected: sumOf(S) + sumOf(T),
      nodes: [outer, inner],
      detail: `first attempt threw: ${threw}; retry prepares ${n(outer, "prepare")}`,
    };
  });
}

// 6. Wide -> narrow: a pass that strikes twice over a long old list must not
// cover it whole (target from MODEL §10.1, part 4).
add(
  "wide-narrow-walk",
  `narrow pass over 4096 old edges walks <= ${4 * C}`,
  () => {
    const D = 4096;
    const P = producers(D);
    const ab = producers(2, 1e6);
    subscribe(ab, 8);
    const mode = rt.createProducer(0);
    const c = rt.createConsumer(() => {
      if (rt.readProducer(mode) === 0) {
        let t = 0;
        for (let i = 0; i < D; i++) t += rt.readProducer(P[i]);
        return t;
      }
      return rt.readProducer(ab[0]) + rt.readProducer(ab[1]);
    });
    rt.readConsumer(c);
    rt.writeProducer(mode, 1);
    const value = record(() => rt.readConsumer(c));
    const walked = walkedBy(c);
    return {
      ok: walked <= 4 * C,
      value,
      expected: sumOf(ab),
      nodes: [c],
      detail: `walked ${walked} of ${D}`,
    };
  },
);

// 7. The suffix coverage boundary is read on every miss (chunk boundaries
// c, 3c, 7c, ... from lastIn) while new striking producers keep arriving.
add(
  "boundary-adversary",
  `walked <= 2D; exact fallbacks from uncovered suffix <= ${Q}`,
  () => {
    const D = 2048;
    const P = producers(D);
    subscribe(P, 16);
    const fresh = producers(16, 1e6);
    subscribe(fresh, 16);
    const pass = rt.createProducer(0);
    const boundary = range(7).map((k) => D - 1 - ((1 << k) - 1) * C);
    const c = rt.createConsumer(() => {
      if (rt.readProducer(pass) === 0) {
        let t = 0;
        for (let i = 0; i < D; i++) t += rt.readProducer(P[i]);
        return t;
      }
      let t = 0;
      for (let k = 0; k < boundary.length; k++)
        t += rt.readProducer(fresh[k]) + rt.readProducer(P[boundary[k]]);
      return t;
    });
    rt.readConsumer(c);
    rt.writeProducer(pass, 1);
    const value = record(() => rt.readConsumer(c));
    const walked = walkedBy(c);
    const uncovered = n(c, "uncovered-fallback");
    return {
      ok: walked <= 2 * D && uncovered <= Q,
      value,
      expected: sumOf(fresh, range(7)) + sumOf(P, boundary),
      nodes: [c],
      detail: `walked ${walked}, uncovered fallbacks ${uncovered}, prepares ${n(c, "prepare")}`,
    };
  },
);

// 8. Domain X: a producer is Computing while it sits in the owner's prefix
// (the owner reads the computation that is evaluating it). Coverage must
// stop there, never certify past it.
add(
  "busy-producer-in-prefix",
  "sound: no duplicate pair, no certificate past a busy producer",
  () => {
    const S = producers(N);
    subscribe(S, 16);
    let a = null;
    const x = rt.createConsumer(() => {
      a = reader(S, range(N), { [N >> 2]: () => rt.readConsumer(x) ?? 0 });
      return rt.readConsumer(a);
    });
    let value;
    let threw = false;
    record(() => {
      try {
        value = rt.readConsumer(x);
      } catch {
        threw = true;
      }
    });
    return {
      ok: true,
      value: threw ? "threw" : typeof value,
      expected: threw ? "threw" : typeof value,
      nodes: [a],
      detail: `threw ${threw} (production rejects the read: case not reached); coverage drops ${n(a, "coverage-drop") + n(a, "prepare-uncovered")}, certified ${n(a, "cert-absent")}`,
    };
  },
);

// 9. The same consumer starts a new pass while preparedOwner still names its
// previous, now dead, pass (nothing else prepared in between): its first
// lookups must not use the old certificate.
add(
  "same-consumer-new-stamp",
  "every certificate of a pass follows that pass's own prepare",
  () => {
    const S = producers(N);
    const F = range(4).map((k) => producers(4, 1e6 + 10 * k));
    subscribe(S, 16);
    for (const f of F) subscribe(f, 16);
    const tick = rt.createProducer(0);
    const perms = range(4).map((k) => permutation(N, 31 + k));
    const c = rt.createConsumer(() => {
      const k = rt.readProducer(tick);
      let t = 0;
      // Pass k reads the fresh sets 1..k first, so no pass drops an edge
      // (no cleanup releases the lease) and each starts with absent pairs
      // whose lookups reach the tape while preparedOwner names the last pass.
      for (let j = 1; j <= k; j++)
        for (const f of F[j]) t += rt.readProducer(f);
      for (const i of perms[k & 3]) t += rt.readProducer(S[i]);
      return t;
    });
    rt.readConsumer(c);
    subscribe(S, 16);
    let value = 0;
    let early = 0;
    let dead = 0;
    for (let k = 1; k <= 3; k++) {
      rt.writeProducer(tick, k);
      value += record(() => rt.readConsumer(c));
      let prepared = false;
      for (const e of of(c)) {
        if (e.kind === "prepare" || e.kind === "prepare-uncovered")
          prepared = true;
        if (e.kind === "lease-dead") dead++;
        if (e.kind === "cert-absent" && !prepared) early++;
      }
    }
    return {
      ok: early === 0,
      value,
      expected: 3 * sumOf(S) + 3 * sumOf(F[1]) + 2 * sumOf(F[2]) + sumOf(F[3]),
      nodes: [c],
      detail: `certificates before the pass's prepare: ${early}; lease-dead ${dead}`,
    };
  },
);

console.log("| case | target | semantics | integrity | target | detail |");
console.log("|---|---|---|---|---|---|");
let failures = 0;
for (const { name, target, run } of cases) {
  let r;
  try {
    r = run();
  } catch (error) {
    console.log(`| ${name} | ${target} | CRASH ${error.message} | | | |`);
    failures++;
    continue;
  }
  const semantic =
    r.value === r.expected ? "ok" : `FAIL ${r.value} ≠ ${r.expected}`;
  const problems = integrity(r.nodes.filter(Boolean));
  const sound = problems.length === 0 ? "ok" : `FAIL ${problems.join(", ")}`;
  if (semantic !== "ok" || sound !== "ok") failures++;
  console.log(
    `| ${name} | ${target} | ${semantic} | ${sound} | ${r.ok ? "pass" : "**fail**"} | ${r.detail} |`,
  );
}
process.exitCode = failures === 0 ? 0 : 1;
