import { bench, describe } from "vitest";
import { createMemo, createSignal, flush } from "@solidjs/signals";

// ── Wide graphs ───────────────────────────────────────────────────────────────

describe("Wide graphs (@solidjs/signals)", () => {
  // Static 1000×5, 2 sources — читаем только ~10% конечных узлов
  bench("Wide 1000×5, 2 sources, read ~10%", () => {
    const N = 1000;
    const SOURCES = 2;
    const DEPS = 5;

    const sources = Array.from({ length: SOURCES }, () => createSignal(0));
    const nodes = Array.from({ length: N }, (_, i) =>
      createMemo(() => {
        let sum = 0;
        for (let d = 0; d < DEPS; d++) {
          sum += sources[(i + d) % SOURCES][0]();
        }
        return sum;
      })
    );

    // warm-up
    sources.forEach(([, set]) => set(0));
    nodes.forEach((n) => n());

    let tick = 0;

    return () => {
      const srcIdx = tick % SOURCES;
      sources[srcIdx][1](tick);
      // Читаем только небольшую часть — реалистичный сценарий
      for (let i = 0; i < N; i += 10) {
        nodes[i]();
      }
      tick++;
    };
  });

  // Static 1000×5, 25 sources — читаем ~5–10%
  bench("Wide 1000×5, 25 sources, read ~10%", () => {
    const N = 1000;
    const SOURCES = 25;
    const DEPS = 5;

    const sources = Array.from({ length: SOURCES }, () => createSignal(0));
    const nodes = Array.from({ length: N }, (_, i) =>
      createMemo(() => {
        let sum = 0;
        for (let d = 0; d < DEPS; d++) {
          sum += sources[(i + d) % SOURCES][0]();
        }
        return sum;
      })
    );

    // warm-up
    sources.forEach(([, set]) => set(0));
    nodes.slice(0, 100).forEach(n => n()); // частичный warm-up

    let tick = 0;
    return () => {
      const srcIdx = tick % SOURCES;
      sources[srcIdx][1](tick * 10 + srcIdx);
      // реалистично — читаем ~10%
      for (let i = 0; i < N; i += 10) nodes[i]();
      tick++;
    };
  });
});

// ── Deep graph ────────────────────────────────────────────────────────────────

describe("Deep graphs", () => {
  bench("Deep 10 chains × 500 depth, change all sources", () => {
    const CHAINS = 10;
    const DEPTH = 500;
    const SOURCES = 3;

    const sources = Array.from({ length: SOURCES }, () => createSignal(0));
    const ends: ReturnType<typeof createMemo>[] = [];

    for (let c = 0; c < CHAINS; c++) {
      let prev = sources[c % SOURCES][0];
      for (let d = 0; d < DEPTH; d++) {
        const p = prev;
        prev = createMemo(() => p());
      }
      ends.push(prev);
    }

    // warm-up
    sources.forEach(([, s]) => s(0));
    ends.forEach(e => e());

    let tick = 0;
    return () => {
      sources.forEach(([, set]) => set(tick));
      // Читаем только концы цепочек (самый частый сценарий)
      ends.forEach(e => e());
      tick++;
    };
  });
});

// ── Square / diamond-like ─────────────────────────────────────────────────────

describe("Square / fan-in graphs", () => {
  bench("Square 12×12, 3 sources, read 25% of last layer", () => {
    const LAYERS = 12;
    const WIDTH = 12;
    const SOURCES = 3;

    const sources = Array.from({ length: SOURCES }, () => createSignal(0));

    let prevLayer = sources.map(s => s[0]);

    for (let l = 1; l < LAYERS; l++) {
      const current = prevLayer;
      prevLayer = Array.from({ length: WIDTH }, () =>
        createMemo(() => {
          let sum = 0;
          for (const v of current) sum += v() as number;
          return sum;
        })
      );
    }

    const lastLayer = prevLayer;
    const readCount = Math.round(WIDTH * 0.25);

    // warm-up
    sources.forEach(([, s]) => s(0));
    lastLayer.slice(0, readCount).forEach(n => n());

    let tick = 0;
    return () => {
      sources.forEach(([, set], i) => set(tick + i * 7));
      for (let i = 0; i < readCount; i++) {
        lastLayer[i]();
      }
      tick++;
    };
  });
});

// ── Dynamic deps ──────────────────────────────────────────────────────────────

describe("Dynamic dependencies", () => {
  bench("100 nodes, 25% dynamic deps, read 30%", () => {
    const N = 100;
    const DEPS = 15;
    const SOURCES = 6;
    const DYN_RATIO = 0.25;

    const sources = Array.from({ length: SOURCES }, () => createSignal(0));
    const dynamicCount = Math.floor(N * DYN_RATIO);

    const nodes = Array.from({ length: N }, (_, i) => {
      const dyn = i < dynamicCount;
      return createMemo(() => {
        let sum = 0;
        if (dyn) {
          const v = sources[0][0]();
          const dir = v % 2 === 0 ? 1 : -1;
          for (let d = 0; d < DEPS; d++) {
            const idx = (dir > 0 ? d : DEPS - 1 - d) % SOURCES;
            sum += sources[idx][0]();
          }
        } else {
          for (let d = 0; d < DEPS; d++) {
            sum += sources[(i + d) % SOURCES][0]();
          }
        }
        return sum;
      });
    });

    // warm-up
    sources.forEach(([, s]) => s(0));
    nodes.forEach(n => n());

    const readCount = Math.round(N * 0.3);

    let tick = 0;
    return () => {
      sources.forEach(([, set]) => set(tick));
      for (let i = 0; i < readCount; i++) nodes[i]();
      tick++;
    };
  });
});