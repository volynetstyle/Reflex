import { performance } from "node:perf_hooks";

export function runPerformance(api, fixedIterations = {}) {
  const { computed, derive, signal, asyncDerived, createRuntime, unwrap } = api;
  const scenarios = [
    [
      "pure sync signal read",
      () => {
        const input = signal(7);
        return workload((count) => {
          let sum = 0;
          for (let i = 0; i < count; ++i) sum += input();
          return sum;
        }, 7);
      },
    ],
    ["pure sync graph, zero async nodes", () => syncGraph(false)],
    ["pure sync graph + dormant async support", () => syncGraph(true)],
    [
      "ready async read",
      () => {
        const a = asyncDerived(() => 7);
        const read = a.read;
        return workload(
          (count) => {
            let sum = 0;
            for (let i = 0; i < count; ++i) sum += read();
            return sum;
          },
          7,
          [a],
        );
      },
    ],
    [
      "ready async read, tagged result",
      () => {
        const a = asyncDerived(() => 7);
        return workload(
          (count) => {
            let sum = 0;
            for (let i = 0; i < count; ++i)
              sum += unwrap(a.experimentalReadResult());
            return sum;
          },
          7,
          [a],
        );
      },
    ],
    [
      "blocked async read",
      () => {
        const a = asyncDerived(() => new Promise(() => {}));
        const read = () => {
          try {
            a.read();
            return 0;
          } catch (error) {
            if (!(error instanceof api.AsyncBlocker)) throw error;
            return 1;
          }
        };
        return workload(
          (count) => {
            let sum = 0;
            for (let i = 0; i < count; ++i) sum += read();
            return sum;
          },
          1,
          [a],
        );
      },
    ],
    [
      "blocked async read, tagged result",
      () => {
        const a = asyncDerived(() => new Promise(() => {}));
        return workload(
          (count) => {
            let sum = 0;
            for (let i = 0; i < count; ++i)
              sum += a.experimentalReadResult().kind === "blocked" ? 1 : 0;
            return sum;
          },
          1,
          [a],
        );
      },
    ],
    ["99.9% ready reads, throw protocol", () => mixedReads(false)],
    ["99.9% ready reads, tagged result", () => mixedReads(true)],
    [
      "async -> sync computed chain",
      () => {
        const a = asyncDerived(() => 7);
        const b = derive(() => a.read() + 1);
        const c = derive(() => b() * 2);
        return workload(
          (count) => {
            let sum = 0;
            for (let i = 0; i < count; ++i) sum += c();
            return sum;
          },
          16,
          [a],
        );
      },
    ],
    [
      "wide sync fanout with one async branch",
      () => {
        const input = signal(1);
        const a = asyncDerived(() => 7);
        const branches = Array.from({ length: 16 }, (_, i) =>
          computed(() => input() + i),
        );
        branches.push(derive(() => input() + a.read()));
        return workload(
          (count) => {
            let sum = 0;
            for (let i = 0; i < count; ++i) {
              input.set(i & 1);
              for (const branch of branches) sum += branch();
            }
            if (sum !== count * 127 + Math.floor(count / 2) * 17)
              throw new Error("Fanout value changed");
            return sum;
          },
          undefined,
          [a],
        );
      },
    ],
    [
      "async publication through warm sync chain",
      () => publicationThroughSyncGraph(false),
    ],
    [
      "async publication through warm sync diamond",
      () => publicationThroughSyncGraph(true),
    ],
  ];
  function workload(run, expected, sources = []) {
    return {
      run(count) {
        const result = run(count);
        if (
          !Number.isFinite(result) ||
          (expected !== undefined && result !== expected * count)
        )
          throw new Error("Benchmark returned incorrect values");
        return result;
      },
      close() {
        sources.reverse().forEach((s) => s.dispose());
      },
    };
  }
  function syncGraph(dormant) {
    const input = signal(1);
    const b = computed(() => input() + 1);
    const c = computed(() => b() * 2);
    const support = dormant ? [asyncDerived(() => 99)] : [];
    return workload(
      (count) => {
        let sum = 0;
        for (let i = 0; i < count; ++i) {
          input.set(i & 1);
          sum += c();
        }
        if (sum !== count * 2 + Math.floor(count / 2) * 2)
          throw new Error("Sync graph value changed");
        return sum;
      },
      undefined,
      support,
    );
  }
  function mixedReads(tagged) {
    const ready = asyncDerived(() => 7);
    const blocked = asyncDerived(() => new Promise(() => {}));
    return workload(
      (count) => {
        let sum = 0;
        for (let i = 0; i < count; ++i) {
          const source = i % 1000 === 0 ? blocked : ready;
          if (tagged) {
            const result = source.experimentalReadResult();
            if (result.kind === "error") throw result.error;
            sum += result.kind === "value" ? result.value : 1;
          } else {
            try {
              sum += source.read();
            } catch (error) {
              if (!(error instanceof api.AsyncBlocker)) throw error;
              sum += 1;
            }
          }
        }
        if (sum !== count * 7 - Math.ceil(count / 1000) * 6)
          throw new Error("Mixed read value changed");
        return sum;
      },
      undefined,
      [ready, blocked],
    );
  }
  function publicationThroughSyncGraph(diamond) {
    const a = asyncDerived(() => 2);
    const b = derive(() => a.read() + 1);
    const c = derive(() => a.read() + 2);
    const left = b();
    const right = c();
    const expected = diamond ? left + right : right;
    const target = asyncDerived(() => (diamond ? b() + c() : c()));
    return workload(
      (count) => {
        let sum = 0;
        for (let i = 0; i < count; ++i) {
          target.refresh();
          const commit = target.commit();
          if (commit === undefined)
            throw new Error("Synchronous attempt did not publish");
          sum += commit.value;
        }
        return sum;
      },
      expected,
      [target, a],
    );
  }
  const results = [];
  for (const [name, setup] of scenarios) {
    const rt = createRuntime();
    const work = setup();
    let iterations = fixedIterations[name] ?? 256;
    try {
      for (let i = 0; i < 3; ++i) work.run(iterations);
      while (fixedIterations[name] === undefined && iterations < 16_777_216) {
        const start = performance.now();
        work.run(iterations);
        if (performance.now() - start >= 20) break;
        iterations *= 2;
      }
      for (let i = 0; i < 3; ++i) work.run(iterations);
      const nsPerOp = [];
      for (let i = 0; i < 7; ++i) {
        rt.flush();
        globalThis.gc?.();
        const start = performance.now();
        work.run(iterations);
        nsPerOp.push(((performance.now() - start) * 1e6) / iterations);
      }
      results.push({ name, iterations, nsPerOp });
    } finally {
      work.close();
      rt.flush();
    }
  }
  return results;
}
