// End-to-end long × long, after ReactivePerformanceLab's dependency-churn
// suite (packages/workloads/src/dependency-churn/long-long.ts), on the
// internal entry's protocol API instead of the kernel tracking calls: the
// schedule is whatever the runtime does, not a harness loop.
//
// `consumers` computeds each read a shared selector, then `deps` sources in
// the order of the current phase's pattern; one step writes the selector and
// flushes the observers. Observers:
//   pull        one watcher reads the computeds in creation order (the lab's
//               effect)
//   pull-reverse the same watcher reads them in reverse order
//   watchers    one watcher per computed; the flush runs them in the order
//               the write invalidated them
//
// Patterns (one per phase, PHASES phases in rotation):
//   shuffle         a fresh permutation per consumer and phase
//   shared-shuffle  one permutation per phase, shared by every consumer
//   value-sort      one shared order, two relocations per phase (the lab's
//                   realistic data-driven reorder)

const range = (n) => Array.from({ length: n }, (_, i) => i);
const PHASES = 8;

function prng(seed) {
  let state = seed >>> 0 || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

function shuffle(values, random) {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const labPatterns = {
  shuffle: ({ deps, consumers }, random) =>
    range(PHASES).map(() =>
      range(consumers).map(() => shuffle(range(deps), random)),
    ),
  "shared-shuffle": ({ deps, consumers }, random) =>
    range(PHASES).map(() => {
      const order = shuffle(range(deps), random);
      return range(consumers).map(() => order);
    }),
  "value-sort": ({ deps, consumers }, random) => {
    let order = shuffle(range(deps), random);
    return range(PHASES).map(() => {
      order = [...order];
      for (let edit = 0; edit < 2; edit++) {
        const [item] = order.splice(Math.floor(random() * order.length), 1);
        order.splice(Math.floor(random() * order.length), 0, item);
      }
      return range(consumers).map(() => order);
    });
  },
};
export const labObservers = ["pull", "pull-reverse", "watchers"];

/** Every case id of the selected patterns × observers × sizes. */
export function labCases({
  patterns = "shuffle",
  observers = "pull,watchers",
  deps = [256],
  consumers = [128],
} = {}) {
  const pick = (spec, names) => {
    const parts = spec.split(",").filter(Boolean);
    return parts.length === 0
      ? names
      : names.filter((name) => parts.includes(name));
  };
  const cases = [];
  for (const pattern of pick(patterns, Object.keys(labPatterns)))
    for (const observer of pick(observers, labObservers))
      for (const d of deps)
        for (const k of consumers)
          cases.push({
            id: `lab:${pattern}/${observer}/d${d}k${k}`,
            pattern,
            observer,
            deps: d,
            consumers: k,
          });
  return cases;
}

/**
 * Build a case on the internal entry `rt` and return `step()`: one selector
 * write and flush, `consumers` recomputations of `deps + 1` reads each.
 */
export function labLongLong(
  rt,
  { pattern = "shuffle", observer = "pull", deps = 256, consumers = 128 },
) {
  const queue = [];
  rt.resetRuntimeContext();
  rt.configureRuntimeContext({
    hooks: { onNodeInvalidated: (node) => void queue.push(node) },
  });
  const flush = () => {
    for (let i = 0; i < queue.length; i++) rt.runWatcher(queue[i]);
    queue.length = 0;
  };

  const phases = labPatterns[pattern]({ deps, consumers }, prng(4242));
  const selector = rt.createProducer(0);
  const sources = range(deps).map((i) => rt.createProducer(i));
  const computeds = range(consumers).map((k) =>
    rt.createConsumer(() => {
      const order = phases[rt.readProducer(selector) % PHASES][k];
      let total = 0;
      for (let i = 0; i < order.length; i++)
        total += rt.readProducer(sources[order[i]]);
      return total + k;
    }),
  );

  let sink = 0;
  if (observer === "watchers") {
    for (const c of computeds)
      rt.runWatcher(
        rt.createWatcher(() => {
          sink += rt.readConsumer(c);
        }),
      );
  } else {
    const order =
      observer === "pull-reverse" ? [...computeds].reverse() : computeds;
    rt.runWatcher(
      rt.createWatcher(() => {
        let total = 0;
        for (let i = 0; i < order.length; i++)
          total += rt.readConsumer(order[i]);
        sink += total;
      }),
    );
  }

  let phase = 0;
  const step = () => {
    rt.writeProducer(selector, ++phase);
    flush();
    return sink;
  };
  step.readsPerPass = consumers * (deps + 1);
  return step;
}
