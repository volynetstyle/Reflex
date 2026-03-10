import { bench, describe } from "vitest";
import { readConsumer, readProducer, writeProducer } from "../../dist/esm";
import ReactiveNode from "../../src/reactivity/shape/ReactiveNode";
import { ReactiveNodeKind } from "../../src/reactivity/shape";

// ── primitives ────────────────────────────────────────────────────────────────

const signal = <T>(initialValue: T) => {
  const node = new ReactiveNode(ReactiveNodeKind.Producer, initialValue);
  return [
    () => readProducer(node as ReactiveNode<unknown>) as T,
    (v: T) => writeProducer(node as ReactiveNode<unknown>, v),
  ] as const;
};

const computed = <T>(fn: () => T) => {
  const node = new ReactiveNode(ReactiveNodeKind.Consumer, undefined as T, fn);
  return () => readConsumer(node as ReactiveNode<unknown>) as T;
};

// ── warmup helper ─────────────────────────────────────────────────────────────

const warmup = (readers: (() => unknown)[]) => {
  for (const r of readers) r();
};

// ── Wide graphs ───────────────────────────────────────────────────────────────

describe("Wide graphs", () => {
  {
    const NODES = 1000;
    const DEPS_PER_NODE = 5;
    const SOURCES = 2;

    const sources = Array.from({ length: SOURCES }, (_, i) => signal(i));

    const nodes = Array.from({ length: NODES }, (_, i) =>
      computed(() => {
        let s = 0;
        for (let d = 0; d < DEPS_PER_NODE; d++) {
          s += sources[(i + d) % SOURCES]![0]();
        }
        return s;
      })
    );

    // build dependency graph
    warmup(nodes);

    let tick = 0;

    bench("Static 1000x5, 2 sources", () => {
      sources[tick % SOURCES]![1](tick);
      for (const n of nodes) n();
      tick++;
    });
  }

  {
    const NODES = 1000;
    const DEPS_PER_NODE = 5;
    const SOURCES = 25;

    const sources = Array.from({ length: SOURCES }, (_, i) => signal(i));

    const nodes = Array.from({ length: NODES }, (_, i) =>
      computed(() => {
        let s = 0;
        for (let d = 0; d < DEPS_PER_NODE; d++) {
          s += sources[(i + d) % SOURCES]![0]();
        }
        return s;
      })
    );

    warmup(nodes);

    let tick = 0;

    bench("Static 1000x5, 25 sources", () => {
      sources[tick % SOURCES]![1](tick);
      for (const n of nodes) n();
      tick++;
    });
  }
});

// ── Deep Graph ────────────────────────────────────────────────────────────────

describe("Deep Graph", () => {
  {
    const CHAINS = 5;
    const DEPTH = 500;
    const SOURCES = 3;

    const sources = Array.from({ length: SOURCES }, (_, i) => signal(i));
    const ends: (() => unknown)[] = [];

    for (let c = 0; c < CHAINS; c++) {
      const src = sources[c % SOURCES]![0];

      let prev = computed(() => src());

      for (let d = 1; d < DEPTH; d++) {
        const p = prev;
        prev = computed(() => p());
      }

      ends.push(prev);
    }

    warmup(ends);

    let tick = 0;

    bench("Static 5x500, 3 sources", () => {
      for (const s of sources) s[1](tick);
      for (const e of ends) e();
      tick++;
    });
  }
});

// ── Square Graph ──────────────────────────────────────────────────────────────

describe("Square Graph", () => {
  {
    const LAYERS = 10;
    const WIDTH = 10;
    const SOURCES = 2;
    const READ_RATIO = 0.2;

    const sources = Array.from({ length: SOURCES }, (_, i) => signal(i));

    let layer: (() => unknown)[] = Array.from({ length: WIDTH }, (_, i) => {
      if (i < SOURCES) return sources[i]![0];
      const s = sources[i % SOURCES]![0];
      return computed(() => s());
    });

    for (let l = 1; l < LAYERS; l++) {
      const prev = layer;

      layer = Array.from({ length: WIDTH }, () =>
        computed(() => {
          let s = 0;
          for (const p of prev) s += p() as number;
          return s;
        })
      );
    }

    const readCount = Math.max(1, Math.floor(WIDTH * READ_RATIO));
    const readers = layer.slice(0, readCount);

    warmup(readers);

    let tick = 0;

    bench("Static 10x10, 2 sources, read 20%", () => {
      for (let i = 0; i < SOURCES; i++) sources[i]![1](tick);
      for (const r of readers) r();
      tick++;
    });
  }
});

// ── Dynamic Graphs ────────────────────────────────────────────────────────────

describe("Dynamic Graphs", () => {
  {
    const NODES = 100;
    const DEPS = 15;
    const SOURCES = 6;
    const DYNAMIC_RATIO = 0.25;
    const READ_RATIO = 0.2;

    const sources = Array.from({ length: SOURCES }, (_, i) => signal(i));
    const dynamicCount = Math.floor(NODES * DYNAMIC_RATIO);

    const nodes = Array.from({ length: NODES }, (_, i) => {
      const isDynamic = i < dynamicCount;

      return computed(() => {
        let s = 0;

        if (isDynamic) {
          const v = sources[0]![0]();

          if (v % 2 === 0) {
            for (let d = 0; d < DEPS; d++) s += sources[d % SOURCES]![0]();
          } else {
            for (let d = DEPS - 1; d >= 0; d--) s += sources[d % SOURCES]![0]();
          }
        } else {
          for (let d = 0; d < DEPS; d++) {
            s += sources[(i + d) % SOURCES]![0]();
          }
        }

        return s;
      });
    });

    const readCount = Math.max(1, Math.floor(NODES * READ_RATIO));
    const readers = nodes.slice(0, readCount);

    warmup(readers);

    let tick = 0;

    bench("25% Dynamic 100x15, 6 sources, read 20%", () => {
      for (const s of sources) s[1](tick);
      for (const r of readers) r();
      tick++;
    });
  }

  {
    const NODES = 100;
    const DEPS = 15;
    const SOURCES = 6;
    const DYNAMIC_RATIO = 0.25;

    const sources = Array.from({ length: SOURCES }, (_, i) => signal(i));
    const dynamicCount = Math.floor(NODES * DYNAMIC_RATIO);

    const nodes = Array.from({ length: NODES }, (_, i) => {
      const isDynamic = i < dynamicCount;

      return computed(() => {
        let s = 0;

        if (isDynamic) {
          const v = sources[0]![0]();

          if (v % 2 === 0) {
            for (let d = 0; d < DEPS; d++) s += sources[d % SOURCES]![0]();
          } else {
            for (let d = DEPS - 1; d >= 0; d--) s += sources[d % SOURCES]![0]();
          }
        } else {
          for (let d = 0; d < DEPS; d++) {
            s += sources[(i + d) % SOURCES]![0]();
          }
        }

        return s;
      });
    });

    warmup(nodes);

    let tick = 0;

    bench("25% Dynamic 100x15, 6 sources", () => {
      for (const s of sources) s[1](tick);
      for (const n of nodes) n();
      tick++;
    });
  }
});