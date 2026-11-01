// Clinical workloads: what a user must build to hurt the runtime, and how the
// cost grows with size. Each case is `(rt, n) -> { op, reads, check }`:
// `op` is one user-visible step, `reads` the reactive reads the user's own
// code performs in it (the work the program asks for), `check` an optional
// sanity check run once after warm-up.

const range = (n) => Array.from({ length: n }, (_, i) => i);

function permutation(n, seed) {
  const order = range(n);
  let s = seed >>> 0 || 1;
  for (let i = n - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/** `count` consumers that read every producer once: other subscribers. */
function subscribe(rt, producers, count) {
  const out = [];
  for (let c = 0; c < count; c++) {
    const node = rt.createConsumer(() => {
      let t = 0;
      for (const p of producers) t += rt.readProducer(p);
      return t;
    });
    rt.readConsumer(node);
    out.push(node);
  }
  return out;
}

export const cases = {
  // 10.1: wide pass of n deps, then a narrow pass of two producers that
  // strike (each has other subscribers), so the second strike prepares a
  // tape over the n old edges right before cleanup drops them.
  "wide-narrow": {
    sizes: [1024, 4096, 16384, 65536],
    build(rt, n) {
      const ps = range(n).map((i) => rt.createProducer(i));
      const a = rt.createProducer(1);
      const b = rt.createProducer(2);
      subscribe(rt, [a, b], 8);
      const mode = rt.createProducer(0);
      const c = rt.createConsumer(() => {
        if ((rt.readProducer(mode) & 1) === 0) {
          let t = 0;
          for (let i = 0; i < ps.length; i++) t += rt.readProducer(ps[i]);
          return t;
        }
        return rt.readProducer(a) + rt.readProducer(b);
      });
      rt.readConsumer(c);
      let step = 0;
      return {
        op() {
          rt.writeProducer(mode, ++step);
          return rt.readConsumer(c);
        },
        reads: (n + 2) / 2 + 1,
      };
    },
  },

  // Control for wide-narrow: the narrow producers have no other subscribers,
  // so their lookups settle at L1 and nothing strikes.
  "wide-narrow-free": {
    sizes: [1024, 4096, 16384, 65536],
    build(rt, n) {
      const ps = range(n).map((i) => rt.createProducer(i));
      const a = rt.createProducer(1);
      const b = rt.createProducer(2);
      const mode = rt.createProducer(0);
      const c = rt.createConsumer(() => {
        if ((rt.readProducer(mode) & 1) === 0) {
          let t = 0;
          for (let i = 0; i < ps.length; i++) t += rt.readProducer(ps[i]);
          return t;
        }
        return rt.readProducer(a) + rt.readProducer(b);
      });
      rt.readConsumer(c);
      let step = 0;
      return {
        op() {
          rt.writeProducer(mode, ++step);
          return rt.readConsumer(c);
        },
        reads: (n + 2) / 2 + 1,
      };
    },
  },

  // 10.2: 32 consumers over the same n producers, each pass a fresh
  // permutation per consumer, run in an interleaved order (C0, C16, C1, C17,
  // ...) so neighbours in every out(P) never run back to back.
  "shared-thrash": {
    sizes: [512, 1024, 2048, 4096, 8192],
    build(rt, n) {
      const M = 32;
      const PERMS = 8;
      const ps = range(n).map((i) => rt.createProducer(i));
      const perms = range(PERMS).map((k) => permutation(n, 0x9e3779b9 + k));
      const tick = rt.createProducer(0);
      const cs = range(M).map((j) =>
        rt.createConsumer(() => {
          const order = perms[(rt.readProducer(tick) + j) % PERMS];
          let t = 0;
          for (let i = 0; i < order.length; i++)
            t += rt.readProducer(ps[order[i]]);
          return t;
        }),
      );
      const schedule = range(M / 2).flatMap((i) => [i, i + M / 2]);
      for (const j of schedule) rt.readConsumer(cs[j]);
      let step = 0;
      return {
        op() {
          rt.writeProducer(tick, ++step);
          let t = 0;
          for (const j of schedule) t += rt.readConsumer(cs[j]);
          return t;
        },
        reads: M * (n + 1),
      };
    },
  },

  // Same as shared-thrash, consumers run in link order: the outgoing finger's
  // home ground. Separates "shared + shuffled" from "shared + shuffled +
  // adversarial schedule".
  "shared-shuffle-ordered": {
    sizes: [512, 1024, 2048, 4096, 8192],
    build(rt, n) {
      const M = 32;
      const PERMS = 8;
      const ps = range(n).map((i) => rt.createProducer(i));
      const perms = range(PERMS).map((k) => permutation(n, 0x9e3779b9 + k));
      const tick = rt.createProducer(0);
      const cs = range(M).map((j) =>
        rt.createConsumer(() => {
          const order = perms[(rt.readProducer(tick) + j) % PERMS];
          let t = 0;
          for (let i = 0; i < order.length; i++)
            t += rt.readProducer(ps[order[i]]);
          return t;
        }),
      );
      for (const c of cs) rt.readConsumer(c);
      let step = 0;
      return {
        op() {
          rt.writeProducer(tick, ++step);
          let t = 0;
          for (const c of cs) t += rt.readConsumer(c);
          return t;
        },
        reads: M * (n + 1),
      };
    },
  },

  // Half the deps stay, half switch between two pools each pass; every pool
  // producer has 16 other subscribers, so each new dep needs a proof of
  // absence between two non-trivial lists (the old O(D^2) shape).
  "replace-half": {
    sizes: [1024, 4096, 16384, 65536],
    build(rt, n) {
      const h = n / 2;
      const keep = range(h).map((i) => rt.createProducer(i));
      const poolA = range(h).map((i) => rt.createProducer(i));
      const poolB = range(h).map((i) => rt.createProducer(i));
      subscribe(rt, poolA, 16);
      subscribe(rt, poolB, 16);
      const tick = rt.createProducer(0);
      const c = rt.createConsumer(() => {
        const pool = (rt.readProducer(tick) & 1) === 0 ? poolA : poolB;
        let t = 0;
        for (let i = 0; i < h; i++)
          t += rt.readProducer(keep[i]) + rt.readProducer(pool[i]);
        return t;
      });
      rt.readConsumer(c);
      let step = 0;
      return {
        op() {
          rt.writeProducer(tick, ++step);
          return rt.readConsumer(c);
        },
        reads: n + 1,
      };
    },
  },

  // A wide consumer re-reads one broad producer after every item; the hub
  // has 1024 subscribers and the consumer sits in the middle of them.
  "hub-duplicate": {
    sizes: [1024, 4096, 16384, 65536],
    build(rt, n) {
      const hub = rt.createProducer(1);
      const items = range(n).map((i) => rt.createProducer(i));
      subscribe(rt, [hub], 512);
      const tick = rt.createProducer(0);
      const c = rt.createConsumer(() => {
        rt.readProducer(tick);
        let t = 0;
        for (let i = 0; i < n; i++)
          t += rt.readProducer(items[i]) * rt.readProducer(hub);
        return t;
      });
      rt.readConsumer(c);
      subscribe(rt, [hub], 512);
      let step = 0;
      return {
        op() {
          rt.writeProducer(tick, ++step);
          return rt.readConsumer(c);
        },
        reads: 2 * n + 1,
      };
    },
  },

  // Eight consumers share n producers and alternate forward and reverse
  // order every pass: consumer-side locality is gone each pass.
  "reverse-shared": {
    sizes: [1024, 4096, 16384, 65536],
    build(rt, n) {
      const M = 8;
      const ps = range(n).map((i) => rt.createProducer(i));
      const tick = rt.createProducer(0);
      const cs = range(M).map(() =>
        rt.createConsumer(() => {
          const reverse = (rt.readProducer(tick) & 1) === 1;
          let t = 0;
          for (let i = 0; i < n; i++)
            t += rt.readProducer(ps[reverse ? n - 1 - i : i]);
          return t;
        }),
      );
      for (const c of cs) rt.readConsumer(c);
      let step = 0;
      return {
        op() {
          rt.writeProducer(tick, ++step);
          let t = 0;
          for (const c of cs) t += rt.readConsumer(c);
          return t;
        },
        reads: M * (n + 1),
      };
    },
  },

  // A watcher reading n producers; each step writes one of them and runs it.
  // V3 validates the whole frontier: per write O(n), by contract.
  "watcher-wide-write": {
    sizes: [1024, 4096, 16384, 65536],
    build(rt, n) {
      const ps = range(n).map((i) => rt.createProducer(i));
      let sink = 0;
      const w = rt.createWatcher(() => {
        let t = 0;
        for (let i = 0; i < n; i++) t += rt.readProducer(ps[i]);
        sink += t;
      });
      rt.runWatcher(w);
      let k = 0;
      return {
        op() {
          const i = k++ % n;
          rt.writeProducer(ps[i], k);
          rt.runWatcher(w);
          return sink;
        },
        reads: n,
      };
    },
  },

  // n computeds read one producer and are dropped without disposal (the raw
  // API's documented lifecycle obligation). Each step writes it and reads one
  // live computed: the user does O(1) work.
  "abandoned-computeds": {
    sizes: [1024, 4096, 16384, 65536],
    build(rt, n) {
      const p = rt.createProducer(0);
      for (let i = 0; i < n; i++)
        rt.readConsumer(rt.createConsumer(() => rt.readProducer(p) + i));
      const live = rt.createConsumer(() => rt.readProducer(p) * 2);
      rt.readConsumer(live);
      let step = 0;
      return {
        op() {
          rt.writeProducer(p, ++step);
          return rt.readConsumer(live);
        },
        reads: 1,
      };
    },
  },

  // A chain of n computeds; write the root, read the leaf.
  "deep-chain": {
    sizes: [1024, 4096, 16384, 65536],
    build(rt, n) {
      const root = rt.createProducer(0);
      let node = rt.createConsumer(() => rt.readProducer(root) + 1);
      for (let i = 1; i < n; i++) {
        const prev = node;
        node = rt.createConsumer(() => rt.readConsumer(prev) + 1);
      }
      const leaf = node;
      rt.readConsumer(leaf);
      let step = 0;
      return {
        op() {
          rt.writeProducer(root, ++step);
          return rt.readConsumer(leaf);
        },
        reads: n,
        check: (v) => v === step + n,
      };
    },
  },

  // A computed reads n producers then throws, alternating between two pools;
  // C3 says its incoming edges must not grow into the union of retries.
  "failing-retry": {
    sizes: [1024, 4096, 16384, 65536],
    build(rt, n) {
      const poolA = range(n).map((i) => rt.createProducer(i));
      const poolB = range(n).map((i) => rt.createProducer(i));
      const tick = rt.createProducer(0);
      const c = rt.createConsumer(() => {
        const pool = (rt.readProducer(tick) & 1) === 0 ? poolA : poolB;
        let t = 0;
        for (let i = 0; i < n; i++) t += rt.readProducer(pool[i]);
        throw new Error(String(t));
      });
      let step = 0;
      return {
        op() {
          rt.writeProducer(tick, ++step);
          try {
            rt.readConsumer(c);
          } catch (error) {
            return error.message.length;
          }
          return 0;
        },
        reads: n + 1,
      };
    },
  },

  // Create a consumer over n producers that each have 64 subscribers, then
  // dispose it: edge removal should cost O(1) per edge.
  "mount-dispose-wide": {
    sizes: [1024, 4096, 16384],
    build(rt, n) {
      const ps = range(n).map((i) => rt.createProducer(i));
      subscribe(rt, ps, 64);
      return {
        op() {
          const c = rt.createConsumer(() => {
            let t = 0;
            for (let i = 0; i < n; i++) t += rt.readProducer(ps[i]);
            return t;
          });
          const v = rt.readConsumer(c);
          rt.disposeNode(c);
          return v;
        },
        reads: n,
      };
    },
  },
};
