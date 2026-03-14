import { bench, describe } from "vitest";
import { RadixHeap } from "../compare/radixHeap";

const N = 1;

// ── Генерируем данные один раз вне бенчей ────────────────────────────────────

// Случайные приоритеты (не монотонные — настоящий «random»)
const randomKeys = Uint32Array.from({ length: N }, () =>
  (Math.random() * 0xffff) >>> 0
);

// Монотонно возрастающие — типичный планировщик / Dijkstra
const monotoneKeys = Uint32Array.from({ length: N }, (_, i) => i);

// Все одинаковые — worst-case для redistribution
const sameKeys = new Uint32Array(N).fill(1);

// Предзаполненные кучи для бенчей, которые меряют только pop
function makeHeap(keys: Uint32Array): RadixHeap<number> {
  const h = new RadixHeap<number>();
  for (let i = 0; i < keys.length; i++) h.insert(i, keys[i]!);
  return h;
}

// ── Insert ───────────────────────────────────────────────────────────────────

describe("RadixHeap — insert", () => {
  bench("insert random keys", () => {
    const heap = new RadixHeap<number>();
    for (let i = 0; i < N; i++) heap.insert(i, randomKeys[i]!);
  });

  bench("insert monotone keys", () => {
    const heap = new RadixHeap<number>();
    for (let i = 0; i < N; i++) heap.insert(i, monotoneKeys[i]!);
  });

  bench("insert same priority", () => {
    const heap = new RadixHeap<number>();
    for (let i = 0; i < N; i++) heap.insert(i, 1);
  });
});

// ── popMin ───────────────────────────────────────────────────────────────────
// setup запускается один раз за итерацию бенча через замыкание-фабрику,
// чтобы каждый прогон получал свежую, уже заполненную кучу.

describe("RadixHeap — popMin", () => {
  bench("popMin random keys", () => {
    const heap = makeHeap(randomKeys);
    while (!heap.isEmpty()) heap.popMin();
  });

  bench("popMin monotone keys", () => {
    const heap = makeHeap(monotoneKeys);
    while (!heap.isEmpty()) heap.popMin();
  });

  bench("popMin same priority", () => {
    const heap = makeHeap(sameKeys);
    while (!heap.isEmpty()) heap.popMin();
  });
});

// ── Mixed insert + popMin ────────────────────────────────────────────────────

describe("RadixHeap — mixed", () => {
  // Каждые 3 вставки — один pop: имитирует планировщик задач
  bench("insert/pop 1:3 random", () => {
    const heap = new RadixHeap<number>();
    for (let i = 0; i < N; i++) {
      heap.insert(i, randomKeys[i]!);
      if (i % 3 === 0) heap.popMin();
    }
  });

  bench("insert/pop 1:3 monotone", () => {
    const heap = new RadixHeap<number>();
    for (let i = 0; i < N; i++) {
      heap.insert(i, monotoneKeys[i]!);
      if (i % 3 === 0) heap.popMin();
    }
  });

  // «Storm»: очередь стабилизируется у ~N/2 элементов на одном приоритете
  bench("insert/pop storm same priority", () => {
    const heap = new RadixHeap<number>();
    for (let i = 0; i < N; i++) heap.insert(i, 1);
    for (let i = 0; i < N; i++) {
      heap.popMin();
      heap.insert(N + i, 1);
    }
  });
});