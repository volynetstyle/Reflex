import {
  createConsumer,
  createProducer,
  resetRuntime,
  readConsumer,
  readProducer,
  writeProducer,
  type ReactiveNode,
} from "../../runtime.test_utils";

/**
 * Workload builders for the work-amplification study.
 *
 * Unlike the cost-attribution fixtures (topology-generators.ts), every case
 * here exposes an explicit, independently-readable `sinks` array instead of
 * one aggregate root. Semantic delta — how many *observable* values actually
 * changed on a given write — can only be measured meaningfully against
 * multiple independent sinks: a single aggregate (e.g. a sum) flips on any
 * underlying change regardless of how many leaves actually moved, which
 * collapses exactly the signal this study needs. The harness reads every
 * sink before and after each step and counts how many differ; that external,
 * black-box measurement is the semantic-delta ground truth, kept separate
 * from — and not derived from — the runtime's own internal counters.
 *
 * Deliberately not shared with topology-generators.ts: duplicating a few
 * small builders here keeps this study from being able to perturb the
 * already-verified cost-attribution sweep.
 */

export type AmplificationCase = {
  sinks: ReactiveNode<number>[];
  step(iteration: number): void;
};

let blackholeValue = 0;
function blackhole(value: number): void {
  blackholeValue ^= value | 0;
}
export function getAmplificationBlackhole(): number {
  return blackholeValue;
}

/**
 * fanout x read-selectivity: one producer fans out to `fanout` computed
 * children, each of which strictly changes value on every write (monotonic
 * source). ALL `fanout` children are read once up front — consumers are
 * lazy, so a computed node that is never read never gets a dependency edge
 * at all; without this initial pass, an "unread" child would simply not be
 * wired into the graph, which would test laziness rather than the intended
 * question. After that initial pass, only the first
 * `round(fanout*readFraction)` children ("sinks") are read on subsequent
 * writes; the rest keep their edge from the initial read but are never
 * observed again. Semantic delta is exactly `sinks.length` on every write,
 * deterministically (every sink's compute is a strictly monotonic function
 * of the source).
 */
export function createFanoutSelectivityCase(
  fanout: number,
  readFraction: number,
): AmplificationCase {
  resetRuntime();

  const source = createProducer(0);
  const children = Array.from({ length: fanout }, (_, index) =>
    createConsumer(() => readProducer(source) + index),
  );

  // Establish a real dependency edge for every child before selectivity
  // narrows which ones keep getting read.
  for (const child of children) blackhole(readConsumer(child));

  const sinkCount = Math.max(1, Math.min(fanout, Math.round(fanout * readFraction)));
  const sinks = children.slice(0, sinkCount);

  let nextValue = 0;

  return {
    sinks,
    step() {
      nextValue += 1;
      writeProducer(source, nextValue);
    },
  };
}

/**
 * depth control case: a plain chain of `depth` computed nodes, single sink
 * at the tail. Included as a negative-control probe — a chain fundamentally
 * requires touching all `depth` intermediate nodes to update its one sink
 * (compute functions are opaque; none can be skipped), so structural work
 * scaling ~linearly with depth for a constant delta=1 is *expected*, not
 * amplification. This case exists to make sure the analysis correctly
 * reports that as unremarkable rather than flagging it.
 */
export function createDepthControlCase(depth: number): AmplificationCase {
  resetRuntime();

  const source = createProducer(0);
  let node = createConsumer(() => readProducer(source) + 1);

  for (let index = 1; index < depth; index += 1) {
    const previous = node;
    node = createConsumer(() => readConsumer(previous) + 1);
  }

  const sinks = [node];
  blackhole(readConsumer(node));

  let nextValue = 0;

  return {
    sinks,
    step() {
      nextValue += 1;
      writeProducer(source, nextValue);
    },
  };
}

/**
 * dependency-width case: one consumer tracking `width` producers in stable
 * order, single sink (the consumer itself). Only one of the `width`
 * producers is written per step, so semantic delta is exactly 1 every write
 * (the sink's sum always changes by a nonzero amount). Tests whether
 * tracking-resolution work stays flat (fast-path tiers hit) or grows with
 * width for that fixed delta.
 */
export function createWidthAmplificationCase(width: number): AmplificationCase {
  resetRuntime();

  const sources = Array.from({ length: width }, (_, index) =>
    createProducer(index),
  );
  const root = createConsumer(() => {
    let total = 0;
    for (let index = 0; index < sources.length; index += 1) {
      total += readProducer(sources[index]!);
    }
    return total;
  });

  const sinks = [root];
  blackhole(readConsumer(root));

  return {
    sinks,
    step(iteration) {
      writeProducer(
        sources[iteration % sources.length]!,
        iteration + sources.length,
      );
    },
  };
}

/**
 * churn with real value change: single sink reading a `width`-sized pattern
 * drawn from a `2*width` pool, where a deterministic `churnRate` fraction of
 * read positions are redirected to a different producer identity each step
 * (mirrors cost-attribution's createChurnCase). Pool values are written too,
 * so the sink's value genuinely changes most writes — a comparison point for
 * createChurnZeroDeltaCase below.
 */
export function createChurnRealDeltaCase(
  width: number,
  churnRate: number,
): AmplificationCase {
  resetRuntime();

  const poolSize = width * 2;
  const pool = Array.from({ length: poolSize }, (_, index) =>
    createProducer(index),
  );
  const changingCount = Math.round(churnRate * width);

  function patternFor(step: number): ReactiveNode<number>[] {
    const pattern: ReactiveNode<number>[] = new Array(width);
    for (let i = 0; i < width; i += 1) {
      pattern[i] = i < changingCount ? pool[(i + step) % poolSize]! : pool[i]!;
    }
    return pattern;
  }

  const selector = createProducer(0);
  const root = createConsumer(() => {
    const pattern = patternFor(readProducer(selector));
    let total = 0;
    for (let index = 0; index < pattern.length; index += 1) {
      total += readProducer(pattern[index]!);
    }
    return total;
  });

  const sinks = [root];
  blackhole(readConsumer(root));

  return {
    sinks,
    step(iteration) {
      writeProducer(selector, iteration + 1);
      writeProducer(pool[iteration % poolSize]!, iteration + poolSize);
    },
  };
}

/**
 * churn with ZERO value change: identical dependency-set churn mechanism to
 * createChurnRealDeltaCase, but every pool producer holds the SAME constant
 * value forever (never written). Which producer gets read changes every
 * step (real structural churn — new edges, dropped edges, reordering), but
 * the sink's sum is invariant (width * constant) by construction, so
 * semantic delta is exactly 0 on every write. Any structural work here is,
 * by construction, spent on zero observable payoff — a direct waste
 * measurement rather than a ratio (which would be undefined at delta=0).
 */
export function createChurnZeroDeltaCase(
  width: number,
  churnRate: number,
): AmplificationCase {
  resetRuntime();

  const poolSize = width * 2;
  const CONSTANT = 7;
  const pool = Array.from({ length: poolSize }, () => createProducer(CONSTANT));
  const changingCount = Math.round(churnRate * width);

  function patternFor(step: number): ReactiveNode<number>[] {
    const pattern: ReactiveNode<number>[] = new Array(width);
    for (let i = 0; i < width; i += 1) {
      pattern[i] = i < changingCount ? pool[(i + step) % poolSize]! : pool[i]!;
    }
    return pattern;
  }

  const selector = createProducer(0);
  const root = createConsumer(() => {
    const pattern = patternFor(readProducer(selector));
    let total = 0;
    for (let index = 0; index < pattern.length; index += 1) {
      total += readProducer(pattern[index]!);
    }
    return total;
  });

  const sinks = [root];
  blackhole(readConsumer(root));

  return {
    sinks,
    step(iteration) {
      // Only the selector (read pattern) changes; pool values never do.
      writeProducer(selector, iteration + 1);
    },
  };
}

export type LocalityMode = "stable" | "permutation" | "distant-reuse" | "duplicate-reads";

/**
 * locality case: mirrors cost-attribution's createLocalityCase (single sink,
 * stable dependency SET, different per-pass read order/repetition). One
 * source producer is written per step, so semantic delta is exactly 1 every
 * write, same rationale as createWidthAmplificationCase.
 */
export function createLocalityAmplificationCase(
  width: number,
  mode: LocalityMode,
): AmplificationCase {
  resetRuntime();

  const sources = Array.from({ length: width }, (_, index) =>
    createProducer(index),
  );
  const selector = createProducer(0);

  const root = createConsumer(() => {
    const step = readProducer(selector);
    let total = 0;

    if (mode === "stable") {
      for (let index = 0; index < width; index += 1) {
        total += readProducer(sources[index]!);
      }
    } else if (mode === "permutation") {
      for (let index = 0; index < width; index += 1) {
        total += readProducer(sources[(index + step) % width]!);
      }
    } else if (mode === "distant-reuse") {
      for (let index = 0; index < width; index += 1) {
        total += readProducer(sources[index]!);
      }
      total += readProducer(sources[0]!);
    } else {
      for (let index = 0; index < width; index += 1) {
        total += readProducer(sources[index]!);
        if (index === 0) total += readProducer(sources[0]!);
      }
    }

    return total;
  });

  const sinks = [root];
  blackhole(readConsumer(root));

  return {
    sinks,
    step(iteration) {
      writeProducer(selector, iteration + 1);
      writeProducer(sources[iteration % width]!, iteration + width);
    },
  };
}

/**
 * semantic-change-ratio, staggered across `width` independent sinks: sink
 * `i`'s schedule is phase-shifted by `i`, so — since a change occurs at
 * exactly `changesPerCycle` positions out of every `cycleLen`-write cycle —
 * the COUNT of sinks changing on any single write is exactly
 * `round(ratio * width)` deterministically for every write, not just on
 * average (proof: at write v, sink i changes iff (v+i) mod cycleLen lands on
 * one of `changesPerCycle` fixed residues; for width a multiple of
 * cycleLen=4, each residue class is hit by exactly width/4 sinks, for every
 * v). Structural verification work (every sink gets pull-checked regardless
 * of whether it changes) should stay ~width regardless of ratio.
 */
export function createSemanticRatioStaggeredCase(
  width: number,
  ratio: number,
): { amplification: AmplificationCase; expectedDeltaPerWrite: number } {
  resetRuntime();

  const cycleLen = 4;
  const changesPerCycle = Math.round(ratio * cycleLen);

  const source = createProducer(0);
  const sinks = Array.from({ length: width }, (_, index) =>
    createConsumer(() => {
      const phased = readProducer(source) + index;
      const cycles = Math.floor(phased / cycleLen);
      const within = Math.min(phased % cycleLen, changesPerCycle);
      return cycles * changesPerCycle + within;
    }),
  );

  for (const sink of sinks) blackhole(readConsumer(sink));

  let nextValue = 0;

  return {
    amplification: {
      sinks,
      step() {
        nextValue += 1;
        writeProducer(source, nextValue);
      },
    },
    expectedDeltaPerWrite: Math.round((changesPerCycle / cycleLen) * width),
  };
}
