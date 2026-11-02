// Consequences of the prepared tape (INV-P) beyond the shapes it was built
// for. Same interface as cases.mjs; `sizes` is the swept parameter.

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

function subscribe(rt, producers, count) {
  for (let c = 0; c < count; c++) {
    const node = rt.createConsumer(() => {
      let t = 0;
      for (const p of producers) t += rt.readProducer(p);
      return t;
    });
    rt.readConsumer(node);
  }
}

export const cases = {
  // A. Mount and unmount a list of 1000 rows that each read the same n
  // shared stores (theme, locale, filters...). Rows mount one after another,
  // so store i's subscriber list grows with every row: without a certificate
  // each first read proves absence against a growing list.
  "list-mount": {
    sizes: [4, 16, 64, 256],
    build(rt, n) {
      const ROWS = 1000;
      const stores = range(n).map((i) => rt.createProducer(i));
      return {
        op() {
          const rows = [];
          let t = 0;
          for (let r = 0; r < ROWS; r++) {
            const row = rt.createConsumer(() => {
              let s = r;
              for (let i = 0; i < n; i++) s += rt.readProducer(stores[i]);
              return s;
            });
            t += rt.readConsumer(row);
            rows.push(row);
          }
          for (const row of rows) rt.disposeNode(row);
          return t;
        },
        reads: ROWS * n,
      };
    },
  },

  // B. One consumer mounts over 4096 producers that each have n other
  // subscribers, then is disposed.
  "mount-fanout": {
    sizes: [1, 4, 16, 64, 256],
    build(rt, n) {
      const D = 4096;
      const ps = range(D).map((i) => rt.createProducer(i));
      subscribe(rt, ps, n);
      return {
        op() {
          const c = rt.createConsumer(() => {
            let t = 0;
            for (let i = 0; i < D; i++) t += rt.readProducer(ps[i]);
            return t;
          });
          const v = rt.readConsumer(c);
          rt.disposeNode(c);
          return v;
        },
        reads: D,
      };
    },
  },

  // C. Like mount-fanout (fan-out 64), but the consumer reads n computeds,
  // each recomputed during the mount (dirty) and itself striking: every
  // nested pass that strikes restarts the outer pass's strike count.
  "mount-over-dirty": {
    sizes: [256, 1024, 4096],
    build(rt, n) {
      const tick = rt.createProducer(0);
      const shared = range(4).map((i) => rt.createProducer(i));
      subscribe(rt, shared, 8);
      const cs = range(n).map((i) =>
        rt.createConsumer(
          () =>
            rt.readProducer(tick) +
            rt.readProducer(shared[i & 3]) +
            rt.readProducer(shared[(i + 1) & 3]) +
            i,
        ),
      );
      for (const c of cs) rt.readConsumer(c);
      subscribe(rt, cs, 64);
      let step = 0;
      return {
        op() {
          rt.writeProducer(tick, ++step);
          const m = rt.createConsumer(() => {
            let t = 0;
            for (let i = 0; i < n; i++) t += rt.readConsumer(cs[i]);
            return t;
          });
          const v = rt.readConsumer(m);
          rt.disposeNode(m);
          return v;
        },
        reads: 2 * n,
      };
    },
  },

  // C'. Control for C: the same mount over clean computeds.
  "mount-over-clean": {
    sizes: [256, 1024, 4096],
    build(rt, n) {
      const tick = rt.createProducer(0);
      const shared = range(4).map((i) => rt.createProducer(i));
      subscribe(rt, shared, 8);
      const cs = range(n).map((i) =>
        rt.createConsumer(
          () =>
            rt.readProducer(tick) +
            rt.readProducer(shared[i & 3]) +
            rt.readProducer(shared[(i + 1) & 3]) +
            i,
        ),
      );
      for (const c of cs) rt.readConsumer(c);
      subscribe(rt, cs, 64);
      return {
        op() {
          const m = rt.createConsumer(() => {
            let t = 0;
            for (let i = 0; i < n; i++) t += rt.readConsumer(cs[i]);
            return t;
          });
          const v = rt.readConsumer(m);
          rt.disposeNode(m);
          return v;
        },
        reads: n,
      };
    },
  },

  // D. An outer consumer mounts over n shared producers (fan-out 64) and,
  // half way, reads an inner computed that mounts over n other shared
  // producers. One lease at a time: the outer lease is live, so the inner
  // mount cannot prepare.
  "nested-mount": {
    sizes: [1024, 4096, 16384],
    build(rt, n) {
      const outerPs = range(n).map((i) => rt.createProducer(i));
      const innerPs = range(n).map((i) => rt.createProducer(i));
      subscribe(rt, outerPs, 64);
      subscribe(rt, innerPs, 64);
      return {
        op() {
          const inner = rt.createConsumer(() => {
            let t = 0;
            for (let i = 0; i < n; i++) t += rt.readProducer(innerPs[i]);
            return t;
          });
          const outer = rt.createConsumer(() => {
            let t = 0;
            for (let i = 0; i < n; i++) {
              t += rt.readProducer(outerPs[i]);
              if (i === n >> 1) t += rt.readConsumer(inner);
            }
            return t;
          });
          const v = rt.readConsumer(outer);
          rt.disposeNode(outer);
          rt.disposeNode(inner);
          return v;
        },
        reads: 2 * n,
      };
    },
  },

  // D'. Control for D: the same two mounts, one after the other.
  "sequential-mount": {
    sizes: [1024, 4096, 16384],
    build(rt, n) {
      const outerPs = range(n).map((i) => rt.createProducer(i));
      const innerPs = range(n).map((i) => rt.createProducer(i));
      subscribe(rt, outerPs, 64);
      subscribe(rt, innerPs, 64);
      return {
        op() {
          const inner = rt.createConsumer(() => {
            let t = 0;
            for (let i = 0; i < n; i++) t += rt.readProducer(innerPs[i]);
            return t;
          });
          let v = rt.readConsumer(inner);
          const outer = rt.createConsumer(() => {
            let t = 0;
            for (let i = 0; i < n; i++) t += rt.readProducer(outerPs[i]);
            return t;
          });
          v += rt.readConsumer(outer);
          rt.disposeNode(outer);
          rt.disposeNode(inner);
          return v;
        },
        reads: 2 * n,
      };
    },
  },

  // E. A hub consumer re-reads one broad producer after each of its 4096
  // items (it lives on the hub's hint). Each step a wide consumer that also
  // reads the hub mounts and is disposed, and its prepare rewrites the hub's
  // slot. n = the hub's other subscribers.
  "hint-eviction": {
    sizes: [16, 256, 1024],
    build(rt, n) {
      const D = 4096;
      const hub = rt.createProducer(1);
      const items = range(D).map((i) => rt.createProducer(i));
      const tick = rt.createProducer(0);
      subscribe(rt, [hub], n >> 1);
      const h = rt.createConsumer(() => {
        rt.readProducer(tick);
        let t = 0;
        for (let i = 0; i < D; i++)
          t += rt.readProducer(items[i]) * rt.readProducer(hub);
        return t;
      });
      rt.readConsumer(h);
      subscribe(rt, [hub], n >> 1);
      const wide = range(D).map((i) => rt.createProducer(i));
      subscribe(rt, wide, 8);
      let step = 0;
      return {
        op() {
          const m = rt.createConsumer(() => {
            let t = rt.readProducer(hub);
            for (let i = 0; i < D; i++) t += rt.readProducer(wide[i]);
            return t;
          });
          let v = rt.readConsumer(m);
          rt.disposeNode(m);
          rt.writeProducer(tick, ++step);
          v += rt.readConsumer(h);
          return v;
        },
        reads: 3 * D + 2,
      };
    },
  },

  // F. Every pass reads n stable items in order plus one of two pairs of
  // shared signals (each with 8 other subscribers): two strikes per pass,
  // so a prepare over n edges every pass, to save two short lookups.
  "two-new-per-pass": {
    sizes: [1024, 4096, 16384, 65536],
    build(rt, n) {
      const items = range(n).map((i) => rt.createProducer(i));
      const pairs = range(2).map(() => [rt.createProducer(1), rt.createProducer(2)]);
      subscribe(rt, pairs.flat(), 8);
      const tick = rt.createProducer(0);
      const at = n >> 1;
      const c = rt.createConsumer(() => {
        const [a, b] = pairs[rt.readProducer(tick) & 1];
        let t = 0;
        for (let i = 0; i < n; i++) {
          if (i === at) t += rt.readProducer(a) + rt.readProducer(b);
          t += rt.readProducer(items[i]);
        }
        return t;
      });
      rt.readConsumer(c);
      let step = 0;
      return {
        op() {
          rt.writeProducer(tick, ++step);
          return rt.readConsumer(c);
        },
        reads: n + 3,
      };
    },
  },

  // G. A wide consumer whose read order is a fresh permutation every pass
  // over producers it alone reads (fan-out 1): L1 answers every lookup by
  // the sole-edge probe, so the tape should never matter.
  "shuffle-private": {
    sizes: [1024, 4096, 16384],
    build(rt, n) {
      const ps = range(n).map((i) => rt.createProducer(i));
      const perms = range(8).map((k) => permutation(n, 7 + k));
      const tick = rt.createProducer(0);
      const c = rt.createConsumer(() => {
        const order = perms[rt.readProducer(tick) & 7];
        let t = 0;
        for (let i = 0; i < n; i++) t += rt.readProducer(ps[order[i]]);
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
};
