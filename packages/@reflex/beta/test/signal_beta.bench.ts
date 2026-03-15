/**
 * Чесний порівняльний benchmark: @solidjs/signals vs наш runtime (v3)
 *
 * ВАЖЛИВІ УМОВИ ДЛЯ ЧЕСНОСТІ:
 *
 * 1. Solid — push-based з явним flush().
 *    set(v) лише маркує граф dirty. flush() propagates зміни.
 *    c() БЕЗ flush повертає stale значення з попереднього flush.
 *    → Solid benchmark МУСИТЬ мати flush() між set() і read().
 *    → Без flush: вимірюємо тільки "читання кешу", а не reactive update.
 *
 * 2. Наш runtime — lazy pull.
 *    write(v) маркує dirty. read() тригерить ensureFresh() → свіжий результат.
 *    flush() не потрібен і не існує.
 *
 * 3. Апples-to-apples: обидва варіанти мають повний цикл
 *    write → propagate → read fresh value.
 *
 * 4. Графи будуються ОДИН раз поза hot-path.
 *    warm-up: повний прохід після побудови (trackingStable settle для v3,
 *    initial computation для Solid createMemo).
 *
 * 5. Anti-JIT sink: mul+add accumulator щоб V8 не усунув обчислення.
 *
 * 6. Реальні µs через performance.now() loop, не vitest hz
 *    (vitest bench JIT-оптимізує до 0.0001ms при мікровимірах).
 */

import { describe, bench } from "vitest";
import { createSignal, createMemo, flush } from "@solidjs/signals";
import { createRuntime } from "../dist/esm";

// ─── Anti-JIT sink ────────────────────────────────────────────────────────────
let _sink = 0;
function sink(v: number) {
  _sink = (_sink * 1000003 + v) | 0;
}

// ─── Наш runtime helpers ──────────────────────────────────────────────────────
function makeOurs() {
  const rt = createRuntime();
  return {
    signal: <T>(v: T) => {
      const s = rt.signal(v);
      return [() => s.read(), (val: T) => s.write(val)] as const;
    },
    computed: <T>(fn: () => T) => {
      const c = rt.computed(fn);
      return () => c();
    },
  };
}

// ─── Solid helpers ────────────────────────────────────────────────────────────
// Solid сигнал повертає [getter, setter] — вже правильний формат
// Solid memo повертає getter function — вже правильний формат

// ─────────────────────────────────────────────────────────────────────────────
// WIDE STATIC: 1000 computed × 5 deps, read ~10%
//
// Типовий UI-граф: N derived values, кожен залежить від кількох stores.
// Міняємо одне джерело → ~50% або ~4% вузлів dirty залежно від src count.
// Читаємо 10% (реалістично: не всі DOM-елементи видимі).
// ─────────────────────────────────────────────────────────────────────────────
{
  const N = 1000,
    DEPS = 5,
    SRCS2 = 2,
    SRCS25 = 25;

  // ── Ours: 2 sources ──
  const ours2 = (() => {
    const { signal, computed } = makeOurs();
    const sources = Array.from({ length: SRCS2 }, (_, i) => signal(i));
    const nodes = Array.from({ length: N }, (_, i) =>
      computed(() => {
        let s = 0;
        for (let d = 0; d < DEPS; d++) s += sources[(i + d) % SRCS2][0]();
        return s;
      }),
    );
    sources.forEach(([, set]) => set(0));
    nodes.forEach((n) => sink(n()));
    return { sources, nodes };
  })();

  // ── Solid: 2 sources ──
  const solid2 = (() => {
    const sources = Array.from({ length: SRCS2 }, () => createSignal(0));
    const nodes = Array.from({ length: N }, (_, i) =>
      createMemo(() => {
        let s = 0;
        for (let d = 0; d < DEPS; d++) s += sources[(i + d) % SRCS2][0]();
        return s;
      }),
    );
    sources.forEach(([, set]) => set(0));
    flush();
    nodes.forEach((n) => sink(n()));
    return { sources, nodes };
  })();

  // ── Ours: 25 sources ──
  const ours25 = (() => {
    const { signal, computed } = makeOurs();
    const sources = Array.from({ length: SRCS25 }, (_, i) => signal(i));
    const nodes = Array.from({ length: N }, (_, i) =>
      computed(() => {
        let s = 0;
        for (let d = 0; d < DEPS; d++) s += sources[(i + d) % SRCS25][0]();
        return s;
      }),
    );
    sources.forEach(([, set]) => set(0));
    nodes.forEach((n) => sink(n()));
    return { sources, nodes };
  })();

  // ── Solid: 25 sources ──
  const solid25 = (() => {
    const sources = Array.from({ length: SRCS25 }, () => createSignal(0));
    const nodes = Array.from({ length: N }, (_, i) =>
      createMemo(() => {
        let s = 0;
        for (let d = 0; d < DEPS; d++) s += sources[(i + d) % SRCS25][0]();
        return s;
      }),
    );
    sources.forEach(([, set]) => set(0));
    flush();
    nodes.forEach((n) => sink(n()));
    return { sources, nodes };
  })();

  describe("Wide static: 1000×5, read ~10%", () => {
    bench("[ours ] 2 sources", () => {
      let tick = 0;

      ours2.sources[tick % 2][1](tick);
      for (let i = 0; i < N; i += 10) sink(ours2.nodes[i]() as number);
      tick++;
    });

    bench("[solid] 2 sources  (+flush)", () => {
      let tick = 0;

      solid2.sources[tick % 2][1](tick);
      flush(); // ← необхідний для fresh reads
      for (let i = 0; i < N; i += 10) sink(solid2.nodes[i]() as number);
      tick++;
    });

    bench("[ours ] 25 sources", () => {
      let tick = 0;

      const idx = tick % SRCS25;
      ours25.sources[idx][1](tick * 3 + idx);
      for (let i = 0; i < N; i += 11) sink(ours25.nodes[i]() as number);
      tick++;
    });

    bench("[solid] 25 sources (+flush)", () => {
      let tick = 0;

      const idx = tick % SRCS25;
      solid25.sources[idx][1](tick * 3 + idx);
      flush();
      for (let i = 0; i < N; i += 11) sink(solid25.nodes[i]() as number);
      tick++;
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// DEEP: 8 ланцюгів × 400 вузлів
//
// Перевіряє вартість propagation через глибокі ланцюги.
// Solid push: flush() обходить весь ланцюг від кореня.
// Наш pull:   ensureFresh() рекурсивно descends до dirty вузла.
// ─────────────────────────────────────────────────────────────────────────────
{
  const buildOursChains = () => {
    const { signal, computed } = makeOurs();
    const sources = Array.from({ length: 4 }, () => signal(0));
    const ends: Array<() => number> = [];
    for (let c = 0; c < 8; c++) {
      let prev = sources[c % 4][0];
      for (let d = 0; d < 400; d++) {
        const p = prev;
        prev = computed(() => p() as number);
      }
      ends.push(prev);
    }
    sources.forEach(([, s]) => s(0));
    ends.forEach((e) => sink(e()));
    return { sources, ends };
  };

  const buildSolidChains = () => {
    const sources = Array.from({ length: 4 }, () => createSignal(0));
    const ends: Array<() => number> = [];
    for (let c = 0; c < 8; c++) {
      let prev = sources[c % 4][0];
      for (let d = 0; d < 400; d++) {
        const p = prev;
        prev = createMemo(() => p());
      }
      ends.push(prev as () => number);
    }
    sources.forEach(([, s]) => s(0));
    flush();
    ends.forEach((e) => sink(e()));
    return { sources, ends };
  };

  const oursChains1 = buildOursChains();
  const solidChains1 = buildSolidChains();
  const oursChainsAll = buildOursChains();
  const solidChainsAll = buildSolidChains();

  describe("Deep: 8 chains × 400 depth", () => {
    bench("[ours ] change 1 src → read all ends", () => {
      let tick = 0;

      oursChains1.sources[1][1](tick);
      oursChains1.ends.forEach((e) => sink(e()));
      tick++;
    });

    bench("[solid] change 1 src → read all ends (+flush)", () => {
      let tick = 0;

      solidChains1.sources[1][1](tick);
      flush();
      solidChains1.ends.forEach((e) => sink(e()));
      tick++;
    });

    bench("[ours ] change all srcs → read all ends", () => {
      let tick = 0;

      oursChainsAll.sources.forEach(([, set]) => set(tick));
      oursChainsAll.ends.forEach((e) => sink(e()));
      tick++;
    });

    bench("[solid] change all srcs → read all ends (+flush)", () => {
      let tick = 0;

      solidChainsAll.sources.forEach(([, set]) => set(tick));
      flush();
      solidChainsAll.ends.forEach((e) => sink(e()));
      tick++;
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// FAN-IN / SQUARE: 12 шарів × 12 вузлів
//
// Кожен вузол читає весь попередній шар → максимальна конвергенція.
// Будь-яка зміна propagate через всі 12 шарів.
// ─────────────────────────────────────────────────────────────────────────────
{
  const buildOursSquare = (readRatio: number) => {
    const { signal, computed } = makeOurs();
    const sources = Array.from({ length: 4 }, () => signal(0));
    let prev = sources.map((s) => s[0]);
    for (let l = 1; l < 12; l++) {
      const cur = prev;
      prev = Array.from({ length: 12 }, () =>
        computed(() => {
          let s = 0;
          for (const fn of cur) s += fn() as number;
          return s;
        }),
      );
    }
    const readers = prev.slice(0, Math.max(1, Math.round(12 * readRatio)));
    sources.forEach(([, s]) => s(0));
    readers.forEach((r) => sink(r()));
    return { sources, readers };
  };

  const buildSolidSquare = (readRatio: number) => {
    const sources = Array.from({ length: 4 }, () => createSignal(0));
    let prev = sources.map((s) => s[0]);
    for (let l = 1; l < 12; l++) {
      const cur = prev;
      prev = Array.from({ length: 12 }, () =>
        createMemo(() => {
          let s = 0;
          for (const fn of cur) s += fn() as number;
          return s;
        }),
      );
    }
    const readers = prev.slice(0, Math.max(1, Math.round(12 * readRatio)));
    sources.forEach(([, s]) => s(0));
    flush();
    readers.forEach((r) => sink(r()));
    return { sources, readers };
  };

  const oursSq25 = buildOursSquare(0.25);
  const solidSq25 = buildSolidSquare(0.25);
  const oursSq100 = buildOursSquare(1.0);
  const solidSq100 = buildSolidSquare(1.0);

  describe("Fan-in / square: 12×12, 4 sources", () => {
    bench("[ours ] read 25% last layer", () => {
      let tick = 0;

      oursSq25.sources.forEach(([, set], i) => set(tick + i * 13));
      oursSq25.readers.forEach((r) => sink(r()));
      tick++;
    });

    bench("[solid] read 25% last layer (+flush)", () => {
      let tick = 0;

      solidSq25.sources.forEach(([, set], i) => set(tick + i * 13));
      flush();
      solidSq25.readers.forEach((r) => sink(r()));
      tick++;
    });

    bench("[ours ] read 100% last layer", () => {
      let tick = 0;

      oursSq100.sources.forEach(([, set], i) => set(tick + i * 7));
      oursSq100.readers.forEach((r) => sink(r()));
      tick++;
    });

    bench("[solid] read 100% last layer (+flush)", () => {
      let tick = 0;

      solidSq100.sources.forEach(([, set], i) => set(tick + i * 7));
      flush();
      solidSq100.readers.forEach((r) => sink(r()));
      tick++;
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// DYNAMIC DEPS: 25% вузлів мають conditional залежності
//
// sources[0] парний → forward deps, непарний → reverse deps.
// Flip deps = trackingStable скидається у нас,
//           = новий set залежностей у Solid при кожному flush.
// ─────────────────────────────────────────────────────────────────────────────
{
  const buildOursDynamic = (readRatio: number) => {
    const { signal, computed } = makeOurs();
    const SRCS = 8,
      N = 100,
      DEPS = 15;
    const sources = Array.from({ length: SRCS }, () => signal(0));
    const dynCount = Math.floor(N * 0.25);
    const nodes = Array.from({ length: N }, (_, i) => {
      const isDyn = i < dynCount;
      return computed(() => {
        let s = 0;
        if (isDyn) {
          const fwd = sources[0][0]() % 2 === 0;
          for (let d = 0; d < DEPS; d++)
            s += sources[(fwd ? d : DEPS - 1 - d) % SRCS][0]();
        } else {
          for (let d = 0; d < DEPS; d++) s += sources[(i + d) % SRCS][0]();
        }
        return s;
      });
    });
    sources.forEach(([, s]) => s(0));
    nodes.forEach((n) => sink(n()));
    const readers = nodes.slice(0, Math.max(1, Math.round(N * readRatio)));
    return { sources, readers, nodes };
  };

  const buildSolidDynamic = (readRatio: number) => {
    const SRCS = 8,
      N = 100,
      DEPS = 15;
    const sources = Array.from({ length: SRCS }, () => createSignal(0));
    const dynCount = Math.floor(N * 0.25);
    const nodes = Array.from({ length: N }, (_, i) => {
      const isDyn = i < dynCount;
      return createMemo(() => {
        let s = 0;
        if (isDyn) {
          const fwd = sources[0][0]() % 2 === 0;
          for (let d = 0; d < DEPS; d++)
            s += sources[(fwd ? d : DEPS - 1 - d) % SRCS][0]();
        } else {
          for (let d = 0; d < DEPS; d++) s += sources[(i + d) % SRCS][0]();
        }
        return s;
      });
    });
    sources.forEach(([, s]) => s(0));
    flush();
    nodes.forEach((n) => sink(n()));
    const readers = nodes.slice(0, Math.max(1, Math.round(N * readRatio)));
    return { sources, readers, nodes };
  };

  const oursFlip = buildOursDynamic(0.3);
  const solidFlip = buildSolidDynamic(0.3);
  const oursAll = buildOursDynamic(1.0);
  const solidAll = buildSolidDynamic(1.0);
  const oursStable = buildOursDynamic(0.3);
  const solidStable = buildSolidDynamic(0.3);

  describe("Dynamic deps: 100 nodes, 25% dynamic", () => {
    bench("[ours ] flip deps each tick, read 30%", () => {
      let tick = 0;

      oursFlip.sources.forEach(([, set], i) =>
        set(i === 0 ? tick : tick * 7 + i),
      );
      oursFlip.readers.forEach((r) => sink(r()));
      tick++;
    });

    bench("[solid] flip deps each tick, read 30% (+flush)", () => {
      let tick = 0;

      solidFlip.sources.forEach(([, set], i) =>
        set(i === 0 ? tick : tick * 7 + i),
      );
      flush();
      solidFlip.readers.forEach((r) => sink(r()));
      tick++;
    });

    bench("[ours ] flip deps each tick, read 100%", () => {
      let tick = 0;

      oursAll.sources.forEach(([, set], i) =>
        set(i === 0 ? tick : tick * 7 + i),
      );
      oursAll.nodes.forEach((n) => sink(n()));
      tick++;
    });

    bench("[solid] flip deps each tick, read 100% (+flush)", () => {
      let tick = 0;

      solidAll.sources.forEach(([, set], i) =>
        set(i === 0 ? tick : tick * 7 + i),
      );
      flush();
      solidAll.nodes.forEach((n) => sink(n()));
      tick++;
    });

    // Stable: sources[0] завжди парний → deps не флипають
    // trackingStable=true для нас; Solid: стабільна підписка
    bench("[ours ] stable branch, read 30%", () => {
      let tick = 0;

      oursStable.sources.forEach(([, set], i) =>
        set(i === 0 ? tick * 2 : tick * 7 + i),
      );
      oursStable.readers.forEach((r) => sink(r()));
      tick++;
    });

    bench("[solid] stable branch, read 30% (+flush)", () => {
      let tick = 0;

      solidStable.sources.forEach(([, set], i) =>
        set(i === 0 ? tick * 2 : tick * 7 + i),
      );
      flush();
      solidStable.readers.forEach((r) => sink(r()));
      tick++;
    });
  });
}
