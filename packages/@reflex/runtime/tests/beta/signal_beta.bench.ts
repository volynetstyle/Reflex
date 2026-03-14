import { bench, describe } from "vitest";
import { createRuntime } from "./api";

// ── Изолированный runtime на группу тестов ────────────────────────────────
function makeHelpers() {
  const rt = createRuntime();

  const signal = <T>(v: T) => {
    const s = rt.signal(v);
    return [s.read.bind(s), s.write.bind(s)] as const;
  };

  const computed = <T>(fn: () => T) => rt.computed(fn).bind(rt.computed(fn));

  return { signal, computed };
}

// ── Фабрики графов (создаются один раз) ───────────────────────────────────

function createWideStatic(
  nodeCount: number,
  depsPerNode: number,
  sourceCount: number
) {
  const { signal, computed } = makeHelpers();

  const sources = Array.from({ length: sourceCount }, (_, i) => signal(i));

  const nodes = Array.from({ length: nodeCount }, (_, i) =>
    computed(() => {
      let sum = 0;
      for (let d = 0; d < depsPerNode; d++) {
        sum += sources[(i + d) % sourceCount][0]();
      }
      return sum;
    })
  );

  // Полный warm-up
  sources.forEach(([, set]) => set(0));
  nodes.forEach(n => n()); // cold start

  return { sources, nodes, nodeCount };
}

function createDeepChains(
  chainCount: number,
  depth: number,
  sourceCount: number
) {
  const { signal, computed } = makeHelpers();

  const sources = Array.from({ length: sourceCount }, () => signal(0));
  const ends: Array<() => number> = [];

  for (let c = 0; c < chainCount; c++) {
    let prev = sources[c % sourceCount][0];
    for (let d = 0; d < depth; d++) {
      const p = prev;
      prev = computed(() => p() as number);
    }
    ends.push(prev);
  }

  // warm-up
  sources.forEach(([, s]) => s(0));
  ends.forEach(e => e());

  return { sources, ends };
}

function createSquareFanIn(
  layers: number,
  width: number,
  sourceCount: number,
  readRatio = 0.25
) {
  const { signal, computed } = makeHelpers();

  const sources = Array.from({ length: sourceCount }, () => signal(0));

  let prevLayer = sources.map(s => s[0]);

  for (let l = 1; l < layers; l++) {
    const current = prevLayer;
    prevLayer = Array.from({ length: width }, () =>
      computed(() => {
        let sum = 0;
        for (const fn of current) sum += fn() as number;
        return sum;
      })
    );
  }

  const lastLayer = prevLayer;
  const readCount = Math.max(1, Math.round(width * readRatio));
  const readers = lastLayer.slice(0, readCount);

  // warm-up
  sources.forEach(([, s]) => s(0));
  readers.forEach(r => r());

  return { sources, readers };
}

function createDynamicGraph(
  nodeCount: number,
  deps: number,
  sourceCount: number,
  dynamicRatio = 0.25,
  readRatio = 0.25
) {
  const { signal, computed } = makeHelpers();

  const sources = Array.from({ length: sourceCount }, () => signal(0));
  const dynamicCount = Math.floor(nodeCount * dynamicRatio);

  const nodes = Array.from({ length: nodeCount }, (_, i) => {
    const isDynamic = i < dynamicCount;
    return computed(() => {
      let sum = 0;
      if (isDynamic) {
        const v = sources[0][0]();
        const forward = v % 2 === 0;
        for (let d = 0; d < deps; d++) {
          const idx = forward ? d : deps - 1 - d;
          sum += sources[idx % sourceCount][0]();
        }
      } else {
        for (let d = 0; d < deps; d++) {
          sum += sources[(i + d) % sourceCount][0]();
        }
      }
      return sum;
    });
  });

  // warm-up
  sources.forEach(([, s]) => s(0));
  nodes.forEach(n => n());

  const readCount = Math.max(1, Math.round(nodeCount * readRatio));
  const readers = nodes.slice(0, readCount);

  return { sources, readers, nodes, readCount };
}

// ── Benchmarks ─────────────────────────────────────────────────────────────

describe("Wide static graphs", () => {
  bench("wide 1000×5 deps, 2 sources — read ~10%", () => {
    const { sources, nodes } = createWideStatic(1000, 5, 2);
    let tick = 0;
    return () => {
      sources[tick % 2][1](tick);
      // читаем ~10% — типичный UI сценарий
      for (let i = 0; i < nodes.length; i += 10) nodes[i]();
      tick++;
    };
  });

  bench("wide 1000×5 deps, 25 sources — read ~8-10%", () => {
    const { sources, nodes } = createWideStatic(1000, 5, 25);
    let tick = 0;
    return () => {
      const idx = tick % 25;
      sources[idx][1](tick * 3 + idx);
      for (let i = 0; i < nodes.length; i += 11) nodes[i]();
      tick++;
    };
  });
});

describe("Deep propagation", () => {
  bench("deep 8 chains × 400 depth — change 1 src → read all ends", () => {
    const { sources, ends } = createDeepChains(8, 400, 4);
    let tick = 0;
    return () => {
      sources[1][1](tick); // меняем только один источник
      ends.forEach(e => e());
      tick++;
    };
  });
});

describe("Fan-in / square graphs", () => {
  bench("square 12×12 layers, 4 sources — read ~25% last layer", () => {
    const { sources, readers } = createSquareFanIn(12, 12, 4, 0.25);
    let tick = 0;
    return () => {
      sources.forEach(([, set], i) => set(tick + i * 13));
      readers.forEach(r => r());
      tick++;
    };
  });
});

describe("Dynamic dependency graphs", () => {
  bench("dynamic 100 nodes, 25% dyn, 15 deps, 8 src — read ~25%", () => {
    const { sources, readers } = createDynamicGraph(100, 15, 8, 0.25, 0.30);
    let tick = 0;
    return () => {
      sources.forEach(([, set]) => set(tick));
      readers.forEach(r => r());
      tick++;
    };
  });

  // Worst-case сценарий — читаем почти всё
  bench("dynamic 120 nodes, 25% dyn — worst-case read ~100%", () => {
    const { sources, nodes } = createDynamicGraph(120, 15, 8, 0.25, 1);
    let tick = 0;
    return () => {
      sources.forEach(([, set]) => set(tick));
      nodes.forEach(n => n());
      tick++;
    };
  });
});