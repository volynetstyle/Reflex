import { performance } from "node:perf_hooks";

import {
  createOwnerContext,
  createOwnershipNode,
  disposeOwnershipNode,
  runWithComponentExecution,
  useComputed,
  useEffect,
  useSignal,
} from "@volynets/reflex-framework";
import {
  createConsumer,
  createProducer,
  createWatcher,
  disposeNode,
  disposeWatcher,
  readConsumer,
  readProducer,
  runWatcher,
  writeProducer,
  type ConsumerNode,
  type ProducerNode,
  type WatcherNode,
} from "../../../src/internal";
import { currentConsumer } from "../../../src/kernel/state";
import {
  censusGraph,
  flush,
  fullGc,
  heapUsed,
  installQueueScheduler,
  probeWrites,
  RetentionTracker,
  type GraphCensus,
  type Node,
  type WriteCost,
} from "./harness";

/**
 * Experiments A and B: create/dispose churn of components that share
 * long-lived computeds.
 *
 * World (identical for every variant):
 *   s0..s3            producers
 *   sharedSum   = s0 + s1                  (shared computed)
 *   sharedScaled= sharedSum * 2 + s2       (shared computed)
 *   app watcher reads sharedScaled         (keeps the shared layer clean)
 *
 * Component (4 nodes, 6 edges):
 *   local  = producer
 *   c1     = sharedScaled + local
 *   c2     = c1 + s3 + sharedSum
 *   effect reads c2
 *
 * Each cycle mounts one component, unmounts the oldest once `window`
 * components are live, writes s0 and flushes. Unmount strategy is the only
 * difference between variants.
 */

export type ChurnVariant =
  /** A: reflex-framework ownership (useSignal/useComputed/useEffect). */
  | "managed"
  /** B: raw createConsumer; effect disposed, computeds simply dropped. */
  | "raw-dispose-watcher"
  /** B: raw nodes, nothing disposed (no lifetime at all). */
  | "raw-no-dispose"
  /** Control: raw nodes, every node disposed by hand (ideal lifetime). */
  | "raw-manual-dispose";

export interface ChurnOptions {
  variant: ChurnVariant;
  cycles: number;
  window: number;
  checkpoints: number;
  probeWrites: number;
}

export interface ChurnCheckpoint {
  cycle: number;
  mounted: number;
  unmounted: number;
  heapBytes: number;
  retainedObjects: number;
  releasedObjects: number;
  graph: GraphCensus;
  write: WriteCost;
  /** Mean create+dispose+write+flush cost per cycle since the last checkpoint. */
  cycleNs: number;
}

export interface ChurnResult {
  experiment: "A" | "B" | "control";
  options: ChurnOptions;
  baselineHeapBytes: number;
  checkpoints: ChurnCheckpoint[];
}

interface ComponentRecord {
  id: number;
  local: Node | null;
  c1: Node | null;
  c2: Node | null;
  effect: Node | null;
  /** Owner-side objects (ownership node) for the managed variant. */
  owned: object[];
  unmount: () => void;
}

const LOCAL_BASE = 1_000_000_000;

const rawC1 = (shared: ConsumerNode<number>, local: ProducerNode<number>) =>
  createConsumer(() => readConsumer(shared) + readProducer(local));

const rawC2 = (
  c1: ConsumerNode<number>,
  s3: ProducerNode<number>,
  shared: ConsumerNode<number>,
) =>
  createConsumer(
    () => readConsumer(c1) + readProducer(s3) + readConsumer(shared),
  );

const rawEffect = (c2: ConsumerNode<number>, emit: (value: number) => void) =>
  createWatcher(() => emit(readConsumer(c2)));

function rawUnmount(
  variant: ChurnVariant,
  c1: ConsumerNode<number>,
  c2: ConsumerNode<number>,
  effect: WatcherNode,
): () => void {
  switch (variant) {
    case "raw-dispose-watcher":
      return () => disposeWatcher(effect);
    case "raw-manual-dispose":
      return () => {
        disposeWatcher(effect);
        disposeNode(c2);
        disposeNode(c1);
      };
    default:
      return () => {};
  }
}

export async function runChurn(options: ChurnOptions): Promise<ChurnResult> {
  installQueueScheduler();

  const s0 = createProducer(0);
  const s1 = createProducer(1);
  const s2 = createProducer(2);
  const s3 = createProducer(3);
  const sharedSum: ConsumerNode<number> = createConsumer(
    () => readProducer(s0) + readProducer(s1),
  );
  const sharedScaled: ConsumerNode<number> = createConsumer(
    () => readConsumer(sharedSum) * 2 + readProducer(s2),
  );
  let sink = 0;
  const app = createWatcher(() => {
    sink += readConsumer(sharedScaled);
  });
  runWatcher(app);

  const roots: Node[] = [s0, s1, s2, s3] as Node[];
  const owner = createOwnerContext();
  const componentOf = new WeakMap<Node, number>();
  const mounted = new Set<number>();
  const live: ComponentRecord[] = [];
  const retention = new RetentionTracker();
  let unmounted = 0;

  const tag = (record: ComponentRecord, key: "c1" | "c2" | "effect") => {
    if (record[key] !== null) return;
    const node = currentConsumer as Node;
    record[key] = node;
    componentOf.set(node, record.id);
  };

  /** The local producer is the c1 source carrying this component's marker. */
  const findLocal = (record: ComponentRecord) => {
    for (let edge = record.c1!.firstIn; edge !== null; edge = edge.nextIn) {
      if (edge.from.payload === LOCAL_BASE + record.id) {
        record.local = edge.from;
        componentOf.set(edge.from, record.id);
        return;
      }
    }
    throw new Error(`local producer of component ${record.id} not found`);
  };

  const release = (record: ComponentRecord) => {
    const objects: object[] = [...record.owned];
    for (const key of ["local", "c1", "c2", "effect"] as const) {
      if (record[key] !== null) objects.push(record[key]!);
    }
    retention.release(objects);
  };

  function mountManaged(id: number): ComponentRecord {
    const ownership = createOwnershipNode();
    const record: ComponentRecord = {
      id,
      local: null,
      c1: null,
      c2: null,
      effect: null,
      owned: [ownership],
      unmount: () => disposeOwnershipNode(ownership),
    };
    runWithComponentExecution({ owner, node: ownership }, () => {
      const local = useSignal(LOCAL_BASE + id);
      const c1 = useComputed(() => {
        tag(record, "c1");
        return readConsumer(sharedScaled) + local();
      });
      const c2 = useComputed(() => {
        tag(record, "c2");
        return c1() + readProducer(s3) + readConsumer(sharedSum);
      });
      useEffect(() => {
        tag(record, "effect");
        sink += c2();
      });
    });
    findLocal(record);
    return record;
  }

  function mountRaw(id: number): ComponentRecord {
    // Each closure is built in its own factory: closures created in one
    // function share a V8 context, and a retained c1 would otherwise keep the
    // disposed effect (and everything else in that scope) alive.
    const local = createProducer(LOCAL_BASE + id) as ProducerNode<number>;
    const c1 = rawC1(sharedScaled, local);
    const c2 = rawC2(c1, s3, sharedSum);
    const effect = rawEffect(c2, (value) => (sink += value));
    runWatcher(effect);

    const record: ComponentRecord = {
      id,
      local: local as Node,
      c1: c1 as Node,
      c2: c2 as Node,
      effect: effect as Node,
      owned: [],
      unmount: rawUnmount(options.variant, c1, c2, effect),
    };
    for (const node of [local, c1, c2, effect] as Node[]) {
      componentOf.set(node, id);
    }
    return record;
  }

  const mount = options.variant === "managed" ? mountManaged : mountRaw;

  const unmountOldest = () => {
    const record = live.shift()!;
    record.unmount();
    mounted.delete(record.id);
    unmounted++;
    release(record);
  };

  const isDead = (node: Node) => {
    const id = componentOf.get(node);
    return id !== undefined && !mounted.has(id);
  };

  let writeValue = 0;
  const probeStep = (i: number) => {
    // Alternate the two shared inputs so both shared layers get invalidated.
    writeValue++;
    if ((i & 1) === 0) writeProducer(s0, -writeValue);
    else writeProducer(s2, -writeValue);
  };

  // Warm the write/flush path so JIT code is not attributed to churn.
  probeWrites(options.probeWrites, probeStep);
  await fullGc();
  const baselineHeapBytes = heapUsed();
  const checkpoints: ChurnCheckpoint[] = [];
  const every = Math.max(1, Math.floor(options.cycles / options.checkpoints));

  async function checkpoint(cycle: number, cycleNs: number): Promise<void> {
    await fullGc();
    const heapBytes = heapUsed() - baselineHeapBytes;
    const retainedObjects = retention.retained();
    const graph = censusGraph(roots, isDead);
    const write = probeWrites(options.probeWrites, probeStep);
    checkpoints.push({
      cycle,
      mounted: mounted.size,
      unmounted,
      heapBytes,
      retainedObjects,
      releasedObjects: retention.released,
      graph,
      write,
      cycleNs,
    });
  }

  await checkpoint(0, 0);
  let sliceStart = performance.now();
  let sliceCycles = 0;

  for (let cycle = 1; cycle <= options.cycles; cycle++) {
    const record = mount(cycle);
    live.push(record);
    mounted.add(record.id);
    if (live.length > options.window) unmountOldest();

    writeProducer(s0, cycle);
    flush();
    sliceCycles++;

    if (cycle % every === 0 || cycle === options.cycles) {
      const cycleNs = ((performance.now() - sliceStart) * 1e6) / sliceCycles;
      await checkpoint(cycle, cycleNs);
      sliceStart = performance.now();
      sliceCycles = 0;
    }
  }

  if (sink === Number.MIN_VALUE) console.log(sink);

  return {
    experiment:
      options.variant === "managed"
        ? "A"
        : options.variant === "raw-manual-dispose"
          ? "control"
          : "B",
    options,
    baselineHeapBytes,
    checkpoints,
  };
}
