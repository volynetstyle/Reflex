// Framework-neutral liveness workloads. Every framework receives the same
// adapter surface:
//
//   api.signal(v)    -> { read(), write(v) }
//   api.computed(fn) -> { read() }
//   api.effect(fn)   -> dispose()
//   api.flush()
//
// Lifetime contract (identical for all frameworks): every computed handle is
// held by the workload for the whole run; effects are disposed explicitly.
// Nothing relies on GC collecting unreachable computeds.

export const MOD = 1_000_003;

export function prng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DAG = {
  producers: 64,
  layers: 4,
  width: 512,
  fanIn: 3,
  watchers: 256,
  readsPerWatcher: 3,
  unrelated: 64,
};

/**
 * Builds the shared DAG: `producers` signals, `layers` × `width` computeds
 * (fan-in from the previous layer), plus `unrelated` signals that no computed
 * reads. `stats` counts user-level work identically for every framework.
 */
function buildDag(api, seed) {
  const random = prng(seed);
  const pick = (n) => Math.floor(random() * n);
  const stats = { computes: 0, effectRuns: 0, sink: 0 };

  const values = Array.from({ length: DAG.producers }, (_, i) => i + 1);
  const producers = values.map((value) => api.signal(value));
  const unrelatedValues = Array.from({ length: DAG.unrelated }, () => 0);
  const unrelated = unrelatedValues.map((value) => api.signal(value));

  const spec = [];
  const layers = [];
  for (let layer = 0; layer < DAG.layers; layer++) {
    const layerSpec = [];
    const nodes = [];
    for (let i = 0; i < DAG.width; i++) {
      const parents = Array.from({ length: DAG.fanIn }, () =>
        pick(layer === 0 ? DAG.producers : DAG.width),
      );
      layerSpec.push(parents);
      const sources = layer === 0 ? producers : layers[layer - 1];
      const salt = layer * 131 + i;
      nodes.push(
        api.computed(() => {
          stats.computes++;
          let sum = salt;
          for (const p of parents) sum += sources[p].read();
          return sum % MOD;
        }),
      );
    }
    spec.push(layerSpec);
    layers.push(nodes);
  }
  const top = layers[DAG.layers - 1];

  const watcherReads = Array.from({ length: DAG.watchers }, () =>
    Array.from({ length: DAG.readsPerWatcher }, () => pick(DAG.width)),
  );
  const makeWatcher = (w) =>
    api.effect(() => {
      stats.effectRuns++;
      let sum = 0;
      for (const index of watcherReads[w]) sum += top[index].read();
      stats.sink = (stats.sink + sum) % MOD;
    });

  const writeProducer = (p) => {
    values[p] = (values[p] * 31 + 7) % MOD;
    producers[p].write(values[p]);
    api.flush();
  };
  const writeUnrelated = (u) => {
    unrelatedValues[u]++;
    unrelated[u].write(unrelatedValues[u]);
    api.flush();
  };

  /** Plain-JS evaluation of the top layer from current producer values. */
  const reference = () => {
    let previous = values;
    for (let layer = 0; layer < DAG.layers; layer++) {
      previous = spec[layer].map((parents, i) => {
        let sum = layer * 131 + i;
        for (const p of parents) sum += previous[p];
        return sum % MOD;
      });
    }
    return previous;
  };

  /** Reads every top computed; mismatches against the reference. */
  const verify = () => {
    const expected = reference();
    let mismatches = 0;
    for (let i = 0; i < DAG.width; i++) {
      if (top[i].read() !== expected[i]) mismatches++;
    }
    return mismatches;
  };

  return {
    random,
    pick,
    stats,
    top,
    makeWatcher,
    writeProducer,
    writeUnrelated,
    verify,
  };
}

/**
 * Each workload returns { stats, phases: [{ name, ops, run }], verify }.
 * Phases run in order; `run` performs `ops` operations.
 */
export const WORKLOADS = {
  /**
   * High-frequency observer toggling with few writes: dispose a share of the
   * watchers, write `writesPerCycle` times, recreate them. Liveness pays a
   * live/non-live transition per cycle; Reflex keeps the computed graph.
   */
  "observer-toggle": {
    params: [
      { toggleShare: 1, writesPerCycle: 0 },
      { toggleShare: 1, writesPerCycle: 1 },
      { toggleShare: 1, writesPerCycle: 10 },
      { toggleShare: 0.25, writesPerCycle: 1 },
    ],
    cycles: 30,
    build(api, param, seed) {
      const dag = buildDag(api, seed);
      const toggled = Math.round(DAG.watchers * param.toggleShare);
      const disposers = Array.from({ length: DAG.watchers }, (_, w) =>
        dag.makeWatcher(w),
      );
      api.flush();
      const cycles = this.cycles;
      return {
        stats: dag.stats,
        verify: dag.verify,
        phases: [
          {
            name: "cycle",
            ops: cycles,
            run() {
              for (let c = 0; c < cycles; c++) {
                for (let w = 0; w < toggled; w++) disposers[w]();
                for (let i = 0; i < param.writesPerCycle; i++)
                  dag.writeProducer(dag.pick(DAG.producers));
                for (let w = 0; w < toggled; w++)
                  disposers[w] = dag.makeWatcher(w);
                api.flush();
              }
            },
          },
        ],
      };
    },
  },

  /**
   * Standalone reads of unobserved computeds interleaved with writes to
   * signals that no computed depends on. Global version/epoch schemes may
   * poll upstream after an unrelated write; Reflex's clean flag does not.
   */
  "standalone-reads": {
    params: [
      { readsPerUnrelatedWrite: 0 },
      { readsPerUnrelatedWrite: 100 },
      { readsPerUnrelatedWrite: 10 },
      { readsPerUnrelatedWrite: 1 },
    ],
    reads: 20_000,
    build(api, param, seed) {
      const dag = buildDag(api, seed);
      for (const node of dag.top) node.read();
      const reads = this.reads;
      const every = param.readsPerUnrelatedWrite;
      return {
        stats: dag.stats,
        verify: dag.verify,
        phases: [
          {
            name: "read",
            ops: reads,
            run() {
              let sum = 0;
              for (let r = 0; r < reads; r++) {
                if (every !== 0 && r % every === 0)
                  dag.writeUnrelated(dag.pick(DAG.unrelated));
                sum += dag.top[dag.pick(DAG.width)].read();
              }
              dag.stats.sink = (dag.stats.sink + sum) % MOD;
            },
          },
        ],
      };
    },
  },

  /**
   * Rare toggling, many dormant writes: liveness' best case. All watchers are
   * removed once, `dormantWrites` writes hit DAG producers, then the watchers
   * come back once.
   */
  "dormant-writes": {
    params: [{ dormantWrites: 100 }, { dormantWrites: 10_000 }],
    build(api, param, seed) {
      const dag = buildDag(api, seed);
      let disposers = Array.from({ length: DAG.watchers }, (_, w) =>
        dag.makeWatcher(w),
      );
      api.flush();
      return {
        stats: dag.stats,
        verify: dag.verify,
        phases: [
          {
            name: "deactivate",
            ops: 1,
            run() {
              for (const dispose of disposers) dispose();
              disposers = [];
            },
          },
          {
            name: "dormant-write",
            ops: param.dormantWrites,
            run() {
              for (let i = 0; i < param.dormantWrites; i++)
                dag.writeProducer(dag.pick(DAG.producers));
            },
          },
          {
            name: "reactivate",
            ops: 1,
            run() {
              disposers = Array.from({ length: DAG.watchers }, (_, w) =>
                dag.makeWatcher(w),
              );
              api.flush();
            },
          },
        ],
      };
    },
  },
};

export const paramLabel = (param) =>
  Object.entries(param)
    .map(([key, value]) => `${key}=${value}`)
    .join(",");
