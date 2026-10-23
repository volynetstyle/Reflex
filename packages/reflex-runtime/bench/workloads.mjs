// Reflex runtime benchmark workloads.
//
// Every workload states the mechanism it isolates, its semantic
// preconditions, how the graph is prepared, what the measured step contains,
// and what is excluded. `setup(rt)` prepares state outside the measured
// region and returns `step(i)`, whose return value is folded into a sink so
// the work cannot be eliminated. `verify(rt)` replays a fixed, small run and
// returns a string that must be identical for baseline and candidate.
//
// Levels:
//   A kernel primitives      B graph structure     C execution patterns
//   D application-like       E complexity & memory

const range = (n) => Array.from({ length: n }, (_, i) => i);

function hostQueue(rt) {
  const queue = [];
  rt.resetRuntimeContext();
  rt.configureRuntimeContext({
    hooks: { onNodeInvalidated: (node) => void queue.push(node) },
  });
  return {
    // FIFO drain by index: Array#shift is O(queue) and dominated the
    // 256-watcher wave profile. Watchers enqueued during the drain are
    // appended and still run in order.
    flush() {
      let runs = 0;
      for (; runs < queue.length; runs++) rt.runWatcher(queue[runs]);
      queue.length = 0;
      return runs;
    },
  };
}

function bare(rt) {
  rt.resetRuntimeContext();
}

/** Deterministic verification: run `fn(i)` for i < n and fold results. */
function fold(n, fn) {
  let acc = 0;
  for (let i = 0; i < n; i++) acc = (acc * 31 + (fn(i) | 0)) | 0;
  return String(acc);
}

export const workloads = [
  // ---------------------------------------------------------------- A
  {
    id: "A.read.producer.untracked",
    level: "A",
    mechanism: "readProducer with no active consumer (no tracking).",
    preconditions: "No active consumer.",
    measured: "One producer read.",
    excluded: "Graph creation.",
    opsPerStep: 1,
    setup(rt) {
      bare(rt);
      const p = rt.createProducer(7);
      return { step: () => rt.readProducer(p) };
    },
  },
  {
    id: "A.write.producer.no-subscribers",
    level: "A",
    mechanism:
      "writeProducer: comparator, payload store, empty-subscriber exit, settled check.",
    preconditions: "Producer without subscribers; value always differs.",
    measured: "One write.",
    excluded: "Propagation (no subscribers).",
    opsPerStep: 1,
    setup(rt) {
      bare(rt);
      const p = rt.createProducer(0);
      return { step: (i) => (rt.writeProducer(p, i), i) };
    },
  },
  {
    id: "A.write.producer.equal",
    level: "A",
    mechanism: "writeProducer equality short-circuit.",
    preconditions: "Value equal to the current payload.",
    measured: "One rejected write.",
    excluded: "Everything after the comparator.",
    opsPerStep: 1,
    setup(rt) {
      bare(rt);
      const p = rt.createProducer(1);
      const c = rt.createConsumer(() => rt.readProducer(p));
      rt.readConsumer(c);
      return { step: () => (rt.writeProducer(p, 1), 1) };
    },
  },
  {
    id: "A.read.consumer.clean",
    level: "A",
    mechanism: "readConsumer on a clean computed outside tracking (fast path).",
    preconditions: "Computed already stabilized; no active consumer.",
    measured: "One clean read.",
    excluded: "Recomputation.",
    opsPerStep: 1,
    setup(rt) {
      bare(rt);
      const p = rt.createProducer(3);
      const c = rt.createConsumer(() => rt.readProducer(p) * 2);
      rt.readConsumer(c);
      return { step: () => rt.readConsumer(c) };
    },
  },
  {
    id: "A.track.stable-8",
    level: "A",
    mechanism:
      "Tracking cursor hits: recompute re-reading the same 8 sources in order.",
    preconditions: "Stable dependency order; one source changes per step.",
    measured:
      "Write (direct push to 1 node) + read (Changed → advance with 8 tracked cursor hits).",
    excluded: "Reorder/slow tracking paths.",
    opsPerStep: 8,
    setup(rt) {
      bare(rt);
      const sources = range(8).map((i) => rt.createProducer(i));
      const c = rt.createConsumer(() => {
        let sum = 0;
        for (const s of sources) sum += rt.readProducer(s);
        return sum;
      });
      rt.readConsumer(c);
      return {
        step(i) {
          rt.writeProducer(sources[i & 7], i);
          return rt.readConsumer(c);
        },
      };
    },
    verify(rt) {
      const { step } = this.setup(rt);
      return fold(64, step);
    },
  },
  {
    id: "A.track.reorder-8",
    level: "A",
    mechanism:
      "Tracking reconciliation when 8 sources are read in alternating order.",
    preconditions: "Order flips every recompute.",
    measured:
      "Write + read with dynamic reorder (one-hop/two-hop/last-edge/slow paths).",
    excluded: "Stable cursor hits.",
    opsPerStep: 8,
    setup(rt) {
      bare(rt);
      const flip = rt.createProducer(0);
      const sources = range(8).map((i) => rt.createProducer(i));
      const c = rt.createConsumer(() => {
        let sum = 0;
        const order =
          rt.readProducer(flip) & 1 ? [...sources].reverse() : sources;
        for (const s of order) sum += rt.readProducer(s);
        return sum;
      });
      rt.readConsumer(c);
      return {
        step(i) {
          rt.writeProducer(flip, i);
          return rt.readConsumer(c);
        },
      };
    },
    verify(rt) {
      const { step } = this.setup(rt);
      return fold(64, step);
    },
  },
  {
    id: "A.watcher.rerun",
    level: "A",
    mechanism: "Watcher invalidation, host enqueue and rerun with cleanup.",
    preconditions: "One watcher on one producer; enqueue-only hook.",
    measured:
      "Write (push to watcher, hook) + flush (validate, cleanup, execute).",
    excluded: "Scheduler package policy.",
    opsPerStep: 1,
    setup(rt) {
      const host = hostQueue(rt);
      const p = rt.createProducer(0);
      let sink = 0;
      const w = rt.createWatcher(() => {
        sink += rt.readProducer(p);
        return () => {
          sink++;
        };
      });
      rt.runWatcher(w);
      return {
        step(i) {
          rt.writeProducer(p, i + 1);
          host.flush();
          return sink;
        },
      };
    },
    verify(rt) {
      const { step } = this.setup(rt);
      return fold(64, step);
    },
  },
  {
    id: "A.watcher.create-dispose",
    level: "A",
    mechanism:
      "Node/edge allocation and teardown: create, run, dispose a watcher.",
    preconditions: "Shared producer; no host hook.",
    measured: "createWatcher + runWatcher (1 tracked read) + disposeWatcher.",
    excluded: "Propagation.",
    opsPerStep: 1,
    setup(rt) {
      bare(rt);
      const p = rt.createProducer(1);
      let sink = 0;
      return {
        step() {
          const w = rt.createWatcher(() => {
            sink += rt.readProducer(p);
          });
          rt.runWatcher(w);
          rt.disposeWatcher(w);
          return sink;
        },
      };
    },
  },
  // ---------------------------------------------------------------- B
  ...[10, 100, 1000].map((depth) => ({
    id: `B.chain.depth-${depth}`,
    level: "B",
    mechanism:
      "Linear chain: transitive push (Unknown) and pull validation + recompute of every level.",
    preconditions: "Each level adds 1; every write changes the tail.",
    measured: "Write at the root + read of the tail.",
    excluded: "Fan-out and dynamic tracking.",
    opsPerStep: depth,
    setup(rt) {
      bare(rt);
      const root = rt.createProducer(0);
      let prev = rt.createConsumer(() => rt.readProducer(root) + 1);
      for (let i = 1; i < depth; i++) {
        const below = prev;
        prev = rt.createConsumer(() => rt.readConsumer(below) + 1);
      }
      const tail = prev;
      rt.readConsumer(tail);
      return {
        step(i) {
          rt.writeProducer(root, i);
          return rt.readConsumer(tail);
        },
      };
    },
    verify(rt) {
      const { step } = this.setup(rt);
      return fold(16, step);
    },
  })),
  ...[10, 100, 1000].map((width) => ({
    id: `B.fanout.width-${width}`,
    level: "B",
    mechanism: "Direct fan-out push to N computeds, then reading all of them.",
    preconditions: "N computeds on one producer.",
    measured: "Write + N reads (each Changed → advance).",
    excluded: "Transitive levels.",
    opsPerStep: width,
    setup(rt) {
      bare(rt);
      const p = rt.createProducer(0);
      const leaves = range(width).map((k) =>
        rt.createConsumer(() => rt.readProducer(p) + k),
      );
      for (const c of leaves) rt.readConsumer(c);
      return {
        step(i) {
          rt.writeProducer(p, i);
          let sum = 0;
          for (const c of leaves) sum += rt.readConsumer(c);
          return sum;
        },
      };
    },
    verify(rt) {
      const { step } = this.setup(rt);
      return fold(8, step);
    },
  })),
  ...[10, 100, 1000].map((width) => ({
    id: `B.fanin.width-${width}`,
    level: "B",
    mechanism:
      "Fan-in: one computed over N producers; one source changes per step.",
    preconditions: "Stable read order.",
    measured: "Write one source + recompute over N tracked cursor hits.",
    excluded: "Reorders.",
    opsPerStep: width,
    setup(rt) {
      bare(rt);
      const sources = range(width).map((k) => rt.createProducer(k));
      const c = rt.createConsumer(() => {
        let sum = 0;
        for (const s of sources) sum += rt.readProducer(s);
        return sum;
      });
      rt.readConsumer(c);
      return {
        step(i) {
          rt.writeProducer(sources[i % width], i);
          return rt.readConsumer(c);
        },
      };
    },
    verify(rt) {
      const { step } = this.setup(rt);
      return fold(16, step);
    },
  })),
  {
    id: "B.diamond.layers-8x8",
    level: "B",
    mechanism:
      "Layered diamonds: shared upstream, glitch-free single recompute per node.",
    preconditions:
      "8 layers × 8 nodes, each reading 2 nodes of the previous layer.",
    measured: "Write + read of the sink (validation across a dense DAG).",
    excluded: "Dynamic topology.",
    opsPerStep: 64,
    setup(rt) {
      bare(rt);
      const p = rt.createProducer(0);
      let layer = range(8).map((k) =>
        rt.createConsumer(() => rt.readProducer(p) + k),
      );
      for (let l = 1; l < 8; l++) {
        const prev = layer;
        layer = range(8).map((k) =>
          rt.createConsumer(
            () => rt.readConsumer(prev[k]) + rt.readConsumer(prev[(k + 1) & 7]),
          ),
        );
      }
      const top = layer;
      const sink = rt.createConsumer(() => {
        let sum = 0;
        for (const c of top) sum += rt.readConsumer(c);
        return sum;
      });
      rt.readConsumer(sink);
      return {
        step(i) {
          rt.writeProducer(p, i);
          return rt.readConsumer(sink);
        },
      };
    },
    verify(rt) {
      const { step } = this.setup(rt);
      return fold(8, step);
    },
  },
  {
    id: "B.cutoff.equal-chain-100",
    level: "B",
    mechanism:
      "Equality cutoff: the first computed returns the same value; validation must stop recompute below.",
    preconditions: "Root changes parity-insensitively ((x & 0) constant).",
    measured: "Write + read of the tail (one recompute, 99 validations).",
    excluded: "Value propagation.",
    opsPerStep: 100,
    setup(rt) {
      bare(rt);
      const root = rt.createProducer(0);
      let prev = rt.createConsumer(() => rt.readProducer(root) & 0);
      for (let i = 1; i < 100; i++) {
        const below = prev;
        prev = rt.createConsumer(() => rt.readConsumer(below) + 1);
      }
      const tail = prev;
      rt.readConsumer(tail);
      return {
        step(i) {
          rt.writeProducer(root, i + 1);
          return rt.readConsumer(tail);
        },
      };
    },
    verify(rt) {
      const { step } = this.setup(rt);
      return fold(16, step);
    },
  },
  // ---------------------------------------------------------------- C
  {
    id: "C.batch.writes-32-read",
    level: "C",
    mechanism:
      "Nested reactive batch: 32 writes, one settled checkpoint, one read.",
    preconditions: "One computed over 32 producers; idle hook installed.",
    measured: "enter batch, 32 writes, leave batch (idle hook), read.",
    excluded: "Watchers.",
    opsPerStep: 32,
    setup(rt) {
      rt.resetRuntimeContext();
      let idles = 0;
      rt.configureRuntimeContext({ hooks: { onRuntimeIdle: () => idles++ } });
      const sources = range(32).map((k) => rt.createProducer(k));
      const c = rt.createConsumer(() => {
        let sum = 0;
        for (const s of sources) sum += rt.readProducer(s);
        return sum;
      });
      rt.readConsumer(c);
      return {
        step(i) {
          rt.enterReactiveBatch();
          for (let k = 0; k < 32; k++) rt.writeProducer(sources[k], i + k);
          rt.leaveReactiveBatch();
          return rt.readConsumer(c) + idles;
        },
      };
    },
    verify(rt) {
      const { step } = this.setup(rt);
      return fold(8, step);
    },
  },
  {
    id: "C.context.switch-a-b-a",
    level: "C",
    mechanism: "Register-bank switch A → B → A around a tracked read.",
    preconditions: "Two contexts; work is a clean read.",
    measured:
      "runWithRuntimeContext(B) + runWithRuntimeContext(A) + clean read.",
    excluded: "Propagation.",
    opsPerStep: 1,
    setup(rt) {
      bare(rt);
      const a = rt.getActiveRuntimeContext();
      const b = rt.createRuntimeContext();
      const p = rt.createProducer(1);
      const c = rt.createConsumer(() => rt.readProducer(p));
      rt.readConsumer(c);
      return {
        step: () =>
          rt.runWithRuntimeContext(b, () =>
            rt.runWithRuntimeContext(a, () => rt.readConsumer(c)),
          ),
      };
    },
  },
  {
    id: "C.domain.batch-per-write",
    level: "C",
    mechanism:
      "Managed batch boundary around a single write, called with a fresh closure as host adapters do.",
    preconditions:
      "Domain context active; scheduler with batch hooks; the written producer has a dirty computed subscriber.",
    measured:
      "domain.batch(() => write): entry, reactive and scheduler batch enter/leave, one write that hits an already-dirty subscriber.",
    excluded: "Context switch, recompute, watcher execution.",
    opsPerStep: 1,
    setup(rt) {
      bare(rt);
      let phase = 0;
      const domain = rt.createExecutionDomain({
        scheduler: {
          enterBatch: () => void phase++,
          leaveBatch: () => void phase--,
        },
      });
      rt.switchRuntimeContext(domain.context);
      const p = rt.createProducer(0);
      const c = rt.createConsumer(() => rt.readProducer(p) + 1);
      rt.readConsumer(c);
      return {
        step: (i) => (
          domain.batch(() => rt.writeProducer(p, i)),
          rt.readProducer(p) + phase
        ),
      };
    },
    verify(rt) {
      const { step } = this.setup(rt);
      return fold(64, step);
    },
  },
  {
    id: "C.domain.run-per-read",
    level: "C",
    mechanism:
      "Managed entry around a clean read, as framework enter() calls it: state check, then domain.run with a fresh closure.",
    preconditions: "Domain context active; the computed is clean.",
    measured: "domain.state + domain.run(() => readConsumer(c)).",
    excluded: "Context switch, stabilization.",
    opsPerStep: 1,
    setup(rt) {
      bare(rt);
      const domain = rt.createExecutionDomain();
      rt.switchRuntimeContext(domain.context);
      const p = rt.createProducer(3);
      const c = rt.createConsumer(() => rt.readProducer(p) * 2);
      rt.readConsumer(c);
      const closed = rt.ExecutionDomainState.Closed;
      return {
        step: () =>
          domain.state !== closed ? domain.run(() => rt.readConsumer(c)) : 0,
      };
    },
  },
  {
    id: "C.watchers.wave-256",
    level: "C",
    mechanism:
      "Invalidation wave: one write invalidates 256 watchers behind computeds; flush validates and reruns.",
    preconditions: "256 watchers, each on its own computed over the root.",
    measured: "Write + flush (256 validations, 256 executions).",
    excluded: "Scheduler package.",
    opsPerStep: 256,
    setup(rt) {
      const host = hostQueue(rt);
      const p = rt.createProducer(0);
      let sink = 0;
      for (let k = 0; k < 256; k++) {
        const c = rt.createConsumer(() => rt.readProducer(p) + k);
        rt.runWatcher(
          rt.createWatcher(() => {
            sink += rt.readConsumer(c);
          }),
        );
      }
      return {
        step(i) {
          rt.writeProducer(p, i + 1);
          host.flush();
          return sink;
        },
      };
    },
    verify(rt) {
      const { step } = this.setup(rt);
      return fold(8, step);
    },
  },
  {
    id: "C.selective.read-12-of-256",
    level: "C",
    mechanism:
      "Lazy selectivity: write invalidates 256 computeds, only 12 are read.",
    preconditions: "Unread computeds stay dirty.",
    measured: "Write + 12 reads.",
    excluded: "Recompute of unread nodes.",
    opsPerStep: 12,
    setup(rt) {
      bare(rt);
      const p = rt.createProducer(0);
      const nodes = range(256).map((k) =>
        rt.createConsumer(() => rt.readProducer(p) * k),
      );
      for (const c of nodes) rt.readConsumer(c);
      return {
        step(i) {
          rt.writeProducer(p, i);
          let sum = 0;
          for (let k = 0; k < 12; k++)
            sum += rt.readConsumer(nodes[(i + k * 21) & 255]);
          return sum;
        },
      };
    },
    verify(rt) {
      const { step } = this.setup(rt);
      return fold(16, step);
    },
  },
  // ---------------------------------------------------------------- D
  {
    id: "D.list.filter-select",
    level: "D",
    mechanism:
      "Component-like list: items, a filter, a selection, per-row derived views and one watcher per visible row.",
    preconditions: "200 items; filter and selection change alternately.",
    measured: "One state update + flush of affected row watchers.",
    excluded: "DOM.",
    opsPerStep: 1,
    setup(rt) {
      const host = hostQueue(rt);
      const items = range(200).map((k) => rt.createProducer(k));
      const filter = rt.createProducer(0);
      const selected = rt.createProducer(0);
      let sink = 0;
      const rows = items.map((item, k) => {
        const visible = rt.createConsumer(
          () => (rt.readProducer(item) + rt.readProducer(filter)) % 3 !== 0,
        );
        const label = rt.createConsumer(() =>
          rt.readConsumer(visible) ? rt.readProducer(item) : -1,
        );
        const isSelected = rt.createConsumer(
          () => rt.readProducer(selected) === k,
        );
        const w = rt.createWatcher(() => {
          sink +=
            rt.readConsumer(label) + (rt.readConsumer(isSelected) ? 1000 : 0);
        });
        rt.runWatcher(w);
        return w;
      });
      return {
        step(i) {
          if (i & 1) rt.writeProducer(selected, i % 200);
          else rt.writeProducer(filter, i);
          host.flush();
          return sink + rows.length;
        },
      };
    },
    verify(rt) {
      const { step } = this.setup(rt);
      return fold(16, step);
    },
  },
  {
    id: "D.subtree.mount-unmount",
    level: "D",
    mechanism:
      "Resource churn: mount a subtree of computeds and watchers over shared state, update once, dispose.",
    preconditions: "Shared producers persist; the subtree is fully disposed.",
    measured: "Create 8 computeds + 4 watchers, run, one update, dispose all.",
    excluded: "Persistent graph growth (verified by E.retention).",
    opsPerStep: 1,
    setup(rt) {
      const host = hostQueue(rt);
      const shared = range(4).map((k) => rt.createProducer(k));
      let sink = 0;
      return {
        // Plain loops: Array.from({ length }) takes V8's generic iterable
        // path and was the largest self-time item of this step.
        step(i) {
          const computeds = new Array(8);
          for (let k = 0; k < 8; k++) {
            computeds[k] = rt.createConsumer(
              () => rt.readProducer(shared[k & 3]) + k,
            );
          }
          const watchers = new Array(4);
          for (let k = 0; k < 4; k++) {
            const w = rt.createWatcher(() => {
              sink +=
                rt.readConsumer(computeds[k]) +
                rt.readConsumer(computeds[k + 4]);
            });
            rt.runWatcher(w);
            watchers[k] = w;
          }
          rt.writeProducer(shared[i & 3], i);
          host.flush();
          for (const w of watchers) rt.disposeWatcher(w);
          for (const c of computeds) rt.disposeNode(c);
          return sink;
        },
      };
    },
    verify(rt) {
      const { step } = this.setup(rt);
      return fold(16, step);
    },
  },
  // ---------------------------------------------------------------- E
  {
    id: "E.retention.subtree-churn",
    level: "E",
    mechanism:
      "Memory: bytes retained per mount/unmount cycle after GC (should be ~0).",
    preconditions: "Same as D.subtree.mount-unmount.",
    measured: "Heap delta after 2000 cycles and full GC.",
    excluded: "Timing.",
    memory: true,
    opsPerStep: 1,
    setup(rt) {
      return workloads
        .find((w) => w.id === "D.subtree.mount-unmount")
        .setup(rt);
    },
  },
];

export function findWorkload(id) {
  const workload = workloads.find((w) => w.id === id);
  if (workload === undefined) throw new Error(`Unknown workload ${id}`);
  return workload;
}
