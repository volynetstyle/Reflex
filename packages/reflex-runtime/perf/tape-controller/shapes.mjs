// Runtime-only replicas of the ReactivePerformanceLab long x long and sustained
// dependency-churn shapes: patterns[phase][consumer] = source indices read.
export const range = (n) => Array.from({ length: n }, (_, i) => i);
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const shuffle = (xs, r) => {
  const o = [...xs];
  for (let i = o.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [o[i], o[j]] = [o[j], o[i]];
  }
  return o;
};
const P = 8;
export const shapes = {
  "replace-half": (d, k) => {
    const h = d >> 1;
    const a = range(d);
    const b = [...range(h), ...range(d - h).map((i) => d + i)];
    return [a, b].map((p) => range(k).map(() => p));
  },
  "window-slide": (d, k) => {
    const pool = d * 2, stride = Math.max(1, Math.floor(d / P));
    return range(P).map((ph) =>
      range(k).map((c) => {
        const s = (ph * stride + (c % P) * stride) % pool;
        const w = range(d).map((i) => (s + i) % pool);
        const h = d >> 1, head = w.slice(0, h), tail = w.slice(h).reverse();
        const out = [];
        for (let i = 0; i < h; i++) out.push(tail[i], head[i]);
        if (tail.length > h) out.push(tail[h]);
        return out;
      }),
    );
  },
  shuffle: (d, k) => {
    const r = prng(0x5eed + d * 31 + k);
    const perms = range(P + 3).map(() => shuffle(range(d), r));
    return range(P).map((ph) => range(k).map((c) => perms[(ph + c) % perms.length]));
  },
  "shared-shuffle": (d, k) => {
    const r = prng(0x5ead + d * 31 + k);
    return range(P).map(() => {
      const o = shuffle(range(d), r);
      return range(k).map(() => o);
    });
  },
  "hub-duplicate": (d, k) =>
    range(P).map((ph) =>
      range(k).map((c) => {
        const off = (ph * 7 + c * 3) % d;
        const p = [];
        for (let i = 0; i < d; i++) p.push((i + off) % d, d);
        return p;
      }),
    ),
  "value-sort": (d, k) => {
    const r = prng(0x50e7 + d * 31 + k);
    const orders = [range(d)];
    for (let ph = 1; ph < P; ph++) {
      const o = [...orders[ph - 1]];
      for (let e = 0; e < 2; e++) {
        const [it] = o.splice(Math.floor(r() * o.length), 1);
        o.splice(Math.floor(r() * o.length), 0, it);
      }
      orders.push(o);
    }
    return orders.map((o) => range(k).map(() => o));
  },
  stable: (d, k) => range(P).map(() => range(k).map(() => range(d))),
};


/** Builds the graph (selector + sources + consumers + one summing consumer) on a runtime bundle. */
export function buildGraph(rt, shape, d, k) {
  const patterns = shapes[shape](d, k);
  const period = patterns.length;
  const poolSize = patterns.flat(2).reduce((m, i) => Math.max(m, i + 1), 0);
  const sel = rt.createProducer(0);
  const src = range(poolSize).map((i) => rt.createProducer(i));
  const cons = patterns[0].map((_, c) => {
    const byPhase = patterns.map((p) => p[c]);
    return rt.createConsumer(() => {
      const pat = byPhase[rt.readProducer(sel) % period];
      let t = 0;
      for (let i = 0; i < pat.length; i++) t += rt.readProducer(src[pat[i]]);
      return t;
    });
  });
  const sum = rt.createConsumer(() => {
    let t = 0;
    for (let i = 0; i < cons.length; i++) t += rt.readConsumer(cons[i]);
    return t;
  });
  rt.readConsumer(sum);
  const expected = patterns.map((ph) => ph.reduce((t, pat) => t + pat.reduce((u, i) => u + i, 0), 0));
  let step = 0;
  return {
    period,
    /** One transition; returns the sum. */
    next: () => { rt.writeProducer(sel, ++step); return rt.readConsumer(sum); },
    /** One checked period. */
    verify: () => {
      for (let t = 0; t < period; t++) {
        rt.writeProducer(sel, ++step);
        const got = rt.readConsumer(sum);
        if (got !== expected[step % period]) throw new Error(`wrong sum ${got} at step ${step}`);
      }
    },
  };
}
