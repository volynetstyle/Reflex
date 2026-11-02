// Operations whose cost includes rediscovering structure the runtime once
// knew: relinking after suspension or a branch toggle, re-tracking around
// dirty or nested computations, revisiting already-dirty subscribers,
// validating a frontier to find one change. Same interface as cases.mjs.

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

function subscribe(rt, nodes, count, read = rt.readProducer) {
  for (let c = 0; c < count; c++) {
    const node = rt.createConsumer(() => {
      let t = 0;
      for (const p of nodes) t += read(p);
      return t;
    });
    rt.readConsumer(node);
  }
}

/** n computeds over a tick and two of four shared producers, 64 extra readers each. */
function sharedComputeds(rt, n, tick) {
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
  subscribe(rt, cs, 64, rt.readConsumer);
  return cs;
}

export const cases = {
  // Suspension (the integration API's unobserved-consumer path) drops every
  // source edge; the next read rediscovers all of them against producers
  // with 64 other subscribers each.
  "suspend-resume": {
    sizes: [1024, 4096, 16384],
    build(rt, n) {
      const ps = range(n).map((i) => rt.createProducer(i));
      subscribe(rt, ps, 64);
      const c = rt.createConsumer(() => {
        let t = 0;
        for (let i = 0; i < n; i++) t += rt.readProducer(ps[i]);
        return t;
      });
      rt.readConsumer(c);
      return {
        op() {
          rt.suspendConsumerIfUnobserved(c);
          return rt.readConsumer(c);
        },
        reads: n,
      };
    },
  },

  // A consumer alternates between two disjoint sets of n shared producers
  // (64 other subscribers each): each pass drops n edges and links n new.
  "branch-toggle-wide": {
    sizes: [1024, 4096, 16384],
    build(rt, n) {
      const A = range(n).map((i) => rt.createProducer(i));
      const B = range(n).map((i) => rt.createProducer(i));
      subscribe(rt, A, 64);
      subscribe(rt, B, 64);
      const flag = rt.createProducer(0);
      const c = rt.createConsumer(() => {
        const set = (rt.readProducer(flag) & 1) === 0 ? A : B;
        let t = 0;
        for (let i = 0; i < n; i++) t += rt.readProducer(set[i]);
        return t;
      });
      rt.readConsumer(c);
      let step = 0;
      return {
        op() {
          rt.writeProducer(flag, ++step);
          return rt.readConsumer(c);
        },
        reads: n + 1,
      };
    },
  },

  // 1000 rows each read a flag and then n stores from set A or set B; one
  // write toggles every row.
  "branch-toggle-rows": {
    sizes: [4, 16, 64, 256],
    build(rt, n) {
      const ROWS = 1000;
      const A = range(n).map((i) => rt.createProducer(i));
      const B = range(n).map((i) => rt.createProducer(i));
      const flag = rt.createProducer(0);
      const rows = range(ROWS).map((r) =>
        rt.createConsumer(() => {
          const set = (rt.readProducer(flag) & 1) === 0 ? A : B;
          let t = r;
          for (let i = 0; i < n; i++) t += rt.readProducer(set[i]);
          return t;
        }),
      );
      for (const row of rows) rt.readConsumer(row);
      let step = 0;
      return {
        op() {
          rt.writeProducer(flag, ++step);
          let t = 0;
          for (const row of rows) t += rt.readConsumer(row);
          return t;
        },
        reads: ROWS * (n + 1),
      };
    },
  },

  // Eight consumers re-read n shared computeds in a fresh order each pass;
  // the write dirties every computed, so each read recomputes it inside the
  // reader's tracking pass.
  "shuffle-over-dirty": {
    sizes: [256, 1024, 4096],
    build(rt, n) {
      const tick = rt.createProducer(0);
      const cs = sharedComputeds(rt, n, tick);
      const perms = range(8).map((k) => permutation(n, 11 + k));
      const readers = range(8).map((j) =>
        rt.createConsumer(() => {
          const order = perms[(rt.readProducer(tick) + j) & 7];
          let t = 0;
          for (let i = 0; i < n; i++) t += rt.readConsumer(cs[order[i]]);
          return t;
        }),
      );
      for (const r of readers) rt.readConsumer(r);
      let step = 0;
      return {
        op() {
          rt.writeProducer(tick, ++step);
          let t = 0;
          for (const r of readers) t += rt.readConsumer(r);
          return t;
        },
        reads: 8 * n,
      };
    },
  },

  // Control: the same readers and order changes, the computeds stay clean.
  "shuffle-over-clean": {
    sizes: [256, 1024, 4096],
    build(rt, n) {
      const tick = rt.createProducer(0);
      const order0 = rt.createProducer(0);
      const cs = sharedComputeds(rt, n, tick);
      const perms = range(8).map((k) => permutation(n, 11 + k));
      const readers = range(8).map((j) =>
        rt.createConsumer(() => {
          const order = perms[(rt.readProducer(order0) + j) & 7];
          let t = 0;
          for (let i = 0; i < n; i++) t += rt.readConsumer(cs[order[i]]);
          return t;
        }),
      );
      for (const r of readers) rt.readConsumer(r);
      let step = 0;
      return {
        op() {
          rt.writeProducer(order0, ++step);
          let t = 0;
          for (const r of readers) t += rt.readConsumer(r);
          return t;
        },
        reads: 8 * n,
      };
    },
  },

  // An outer consumer re-reads n shared producers in a fresh order and, half
  // way, an inner consumer that does the same over n other shared producers.
  "nested-shuffle": {
    sizes: [1024, 4096, 16384],
    build(rt, n) {
      const P = range(n).map((i) => rt.createProducer(i));
      const Q = range(n).map((i) => rt.createProducer(i));
      subscribe(rt, P, 16);
      subscribe(rt, Q, 16);
      const perms = range(8).map((k) => permutation(n, 3 + k));
      const tick = rt.createProducer(0);
      const inner = rt.createConsumer(() => {
        const order = perms[(rt.readProducer(tick) + 3) & 7];
        let t = 0;
        for (let i = 0; i < n; i++) t += rt.readProducer(Q[order[i]]);
        return t;
      });
      const outer = rt.createConsumer(() => {
        const order = perms[rt.readProducer(tick) & 7];
        let t = 0;
        for (let i = 0; i < n; i++) {
          t += rt.readProducer(P[order[i]]);
          if (i === n >> 1) t += rt.readConsumer(inner);
        }
        return t;
      });
      rt.readConsumer(outer);
      let step = 0;
      return {
        op() {
          rt.writeProducer(tick, ++step);
          return rt.readConsumer(outer);
        },
        reads: 2 * n + 3,
      };
    },
  },

  // Control: the same two re-tracking consumers, read one after the other.
  "sequential-shuffle": {
    sizes: [1024, 4096, 16384],
    build(rt, n) {
      const P = range(n).map((i) => rt.createProducer(i));
      const Q = range(n).map((i) => rt.createProducer(i));
      subscribe(rt, P, 16);
      subscribe(rt, Q, 16);
      const perms = range(8).map((k) => permutation(n, 3 + k));
      const tick = rt.createProducer(0);
      const inner = rt.createConsumer(() => {
        const order = perms[(rt.readProducer(tick) + 3) & 7];
        let t = 0;
        for (let i = 0; i < n; i++) t += rt.readProducer(Q[order[i]]);
        return t;
      });
      const outer = rt.createConsumer(() => {
        const order = perms[rt.readProducer(tick) & 7];
        let t = 0;
        for (let i = 0; i < n; i++) t += rt.readProducer(P[order[i]]);
        return t;
      });
      rt.readConsumer(inner);
      rt.readConsumer(outer);
      let step = 0;
      return {
        op() {
          rt.writeProducer(tick, ++step);
          return rt.readConsumer(inner) + rt.readConsumer(outer);
        },
        reads: 2 * n + 2,
      };
    },
  },

  // A producer with n computed subscribers is written ten times before one
  // of them is read: every write revisits n subscribers that are already
  // dirty. Per write, for O(1) user work.
  "rewrite-dirty-fanout": {
    sizes: [1024, 4096, 16384, 65536],
    build(rt, n) {
      const p = rt.createProducer(0);
      const subs = range(n).map((i) =>
        rt.createConsumer(() => rt.readProducer(p) + i),
      );
      for (const s of subs) rt.readConsumer(s);
      let step = 0;
      return {
        op() {
          for (let w = 0; w < 10; w++) rt.writeProducer(p, ++step);
          return rt.readConsumer(subs[0]);
        },
        reads: 10,
      };
    },
  },

  // A consumer over n computeds; a write changes the source of the last one
  // to an equal computed value, so the consumer validates its whole list to
  // find no change. Per write, for O(1) user work.
  "validate-to-find-nothing": {
    sizes: [1024, 4096, 16384, 65536],
    build(rt, n) {
      const ps = range(n).map((i) => rt.createProducer(i));
      const xs = range(n).map((i) =>
        rt.createConsumer(() => (rt.readProducer(ps[i]) & 0) + i),
      );
      const c = rt.createConsumer(() => {
        let t = 0;
        for (let i = 0; i < n; i++) t += rt.readConsumer(xs[i]);
        return t;
      });
      rt.readConsumer(c);
      let step = 0;
      return {
        op() {
          rt.writeProducer(ps[n - 1], ++step);
          return rt.readConsumer(c);
        },
        reads: 1,
      };
    },
  },

  // A lattice of n nodes in layers of 64, each reading 4 nodes of the layer
  // before; write the root, read the whole last layer. Total work should be
  // linear in edges.
  "lattice-pull": {
    sizes: [1024, 4096, 16384, 65536],
    build(rt, n) {
      const W = 64;
      const root = rt.createProducer(0);
      let prev = range(W).map((i) =>
        rt.createConsumer(() => rt.readProducer(root) + i),
      );
      let s = 12345;
      const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) % W);
      for (let l = 1; l < n / W; l++) {
        const layer = prev;
        prev = range(W).map(() => {
          const pick = [rnd(), rnd(), rnd(), rnd()].map((k) => layer[k]);
          return rt.createConsumer(
            () =>
              rt.readConsumer(pick[0]) +
              rt.readConsumer(pick[1]) -
              rt.readConsumer(pick[2]) -
              rt.readConsumer(pick[3]),
          );
        });
      }
      const last = prev;
      for (const x of last) rt.readConsumer(x);
      let step = 0;
      return {
        op() {
          rt.writeProducer(root, ++step);
          let t = 0;
          for (const x of last) t += rt.readConsumer(x);
          return t;
        },
        reads: 4 * n,
      };
    },
  },
};
