import {
  blackhole,
  type BenchHarness,
  type BenchVariant,
  HarnessMetrics,
  registerBenchFile,
  type WriteInput,
} from "./shared";

import * as AlienSignalsModule from "../../@volynets/reflex-runtime/node_modules/alien-signals/esm/index.mjs";
import {
  createRuntime as createReflexRuntime,
  effect as reflexEffect,
  memo as reflexMemo,
  signal as reflexSignal,
} from "../dist/esm";

type AlienSignal = {
  (): number;
  (value: number): void;
};

const {
  computed,
  effect: alienEffect,
  endBatch,
  signal,
  startBatch,
} = AlienSignalsModule as {
  computed(getter: () => number): () => number;
  effect(fn: () => void): () => void;
  endBatch(): void;
  signal(initial: number): AlienSignal;
  startBatch(): void;
};

type InternalNode = ReactiveNode & {
  value: number;
  compute?: () => number;
  version: number;
  queued: boolean;
};

let activeSub: InternalNode | undefined;

class LinkedPropagationHarness implements BenchHarness {
  readonly metrics = new HarnessMetrics();
  private readonly system = createReactiveSystem({
    update: (sub) => this.refreshNode(sub as InternalNode),
    notify: (sub) => this.enqueue(sub as InternalNode),
    unwatched: () => {},
  });
  private readonly queue: Array<InternalNode | undefined> = [];
  private readonly disposers: Array<() => void> = [];
  private batchDepth = 0;
  private queueHead = 0;
  private queueTail = 0;

  signal(
    initial: number,
    _label?: string,
  ): readonly [() => number, (value: WriteInput) => void] {
    this.metrics.recordSetupAllocation();
    const node = this.createSignalNode(initial);

    return [
      () => this.readNode(node),
      (value) => {
        this.metrics.recordSchedulerOp();
        const next = typeof value === "function" ? value(node.value) : value;
        if (Object.is(next, node.value)) return;
        node.value = next;
        node.version += 1;
        if (node.subs !== undefined) {
          this.system.propagate(node.subs);
        }
        if (this.batchDepth === 0) {
          this.flush();
        }
      },
    ] as const;
  }

  memo(fn: () => number, _label?: string): () => number {
    this.metrics.recordSetupAllocation();
    const node = this.createComputedNode(fn, ReactiveFlags.Mutable);
    return () => {
      this.metrics.recordRefresh();
      return this.readNode(node);
    };
  }

  effect(read: () => number, _meta?: { label?: string; priority?: number }): () => void {
    this.metrics.recordSetupAllocation();
    const node = this.createComputedNode(() => {
      this.metrics.recordRecompute();
      this.metrics.recordEffectRun();
      const value = read();
      blackhole(value);
      return value;
    }, ReactiveFlags.Watching);

    this.runEffect(node);

    const dispose = () => {
      let link = node.deps;
      while (link !== undefined) {
        link = this.system.unlink(link, node);
      }
      node.flags = ReactiveFlags.None;
    };

    this.disposers.push(dispose);
    return dispose;
  }

  batch<T>(fn: () => T): T {
    this.metrics.recordSchedulerOp();
    this.batchDepth += 1;
    try {
      return fn();
    } finally {
      this.batchDepth -= 1;
      this.metrics.recordSchedulerOp();
      if (this.batchDepth === 0) {
        this.flush();
      }
    }
  }

  flush(): void {
    while (this.queueHead < this.queueTail) {
      const index = this.queueHead++;
      const node = this.queue[index]!;
      this.queue[index] = undefined;
      node.queued = false;
      if ((node.flags & ReactiveFlags.Watching) === 0) continue;
      if ((node.flags & (ReactiveFlags.Pending | ReactiveFlags.Dirty)) === 0) continue;
      this.metrics.recordSchedulerOp();
      this.runEffect(node);
    }
    this.queueHead = 0;
    this.queueTail = 0;
  }

  resetRunMetrics(): void {
    this.metrics.resetRunMetrics();
  }

  beginStep(): void {
    this.metrics.beginStep();
  }

  endStep(wallTimeMs: number) {
    return this.metrics.endStep(wallTimeMs);
  }

  dispose(): void {
    for (let i = this.disposers.length - 1; i >= 0; --i) {
      this.disposers[i]!();
    }
    this.disposers.length = 0;
    this.queue.length = 0;
    this.queueHead = 0;
    this.queueTail = 0;
  }

  private createSignalNode(initial: number): InternalNode {
    return {
      value: initial,
      version: 0,
      flags: ReactiveFlags.None,
      queued: false,
      deps: undefined,
      lastInTail: undefined,
      subs: undefined,
      subsTail: undefined,
    };
  }

  private createComputedNode(
    compute: () => number,
    flags: ReactiveFlags,
  ): InternalNode {
    return {
      value: 0,
      compute,
      version: 0,
      flags: flags | ReactiveFlags.Dirty,
      queued: false,
      deps: undefined,
      lastInTail: undefined,
      subs: undefined,
      subsTail: undefined,
    };
  }

  private readNode(node: InternalNode): number {
    const sub = activeSub;
    if (sub !== undefined) {
      this.system.link(node, sub, node.version);
    }

    if ((node.flags & ReactiveFlags.Watching) !== 0) {
      return node.value;
    }

    if ((node.flags & (ReactiveFlags.Dirty | ReactiveFlags.Pending)) !== 0) {
      this.refreshNode(node);
    }

    return node.value;
  }

  private refreshNode(node: InternalNode): boolean {
    if (node.compute === undefined) return false;
    if (
      (node.flags & ReactiveFlags.Pending) !== 0 &&
      (node.flags & ReactiveFlags.Dirty) === 0 &&
      node.deps !== undefined &&
      !this.system.checkDirty(node.deps, node)
    ) {
      return false;
    }

    const prevValue = node.value;
    const prevSub = activeSub;
    activeSub = node;

    let link = node.deps;
    while (link !== undefined) {
      link.version = -1;
      link = link.nextDep;
    }

    try {
      this.metrics.recordRecompute();
      node.value = node.compute();
    } finally {
      activeSub = prevSub;
      let cursor = node.deps;
      while (cursor !== undefined) {
        if (cursor.version === -1) {
          cursor = this.system.unlink(cursor, node);
          continue;
        }
        cursor = cursor.nextDep;
      }
      node.flags &= ~(ReactiveFlags.Pending | ReactiveFlags.Dirty | ReactiveFlags.Recursed | ReactiveFlags.RecursedCheck);
    }

    const changed = !Object.is(prevValue, node.value);
    if (changed) {
      node.version += 1;
      if (node.subs !== undefined) {
        this.system.shallowPropagate(node.subs);
      }
    }
    return changed;
  }

  private runEffect(node: InternalNode): void {
    const prevSub = activeSub;
    activeSub = node;

    let link = node.deps;
    while (link !== undefined) {
      link.version = -1;
      link = link.nextDep;
    }

    try {
      node.compute!();
    } finally {
      activeSub = prevSub;
      let cursor = node.deps;
      while (cursor !== undefined) {
        if (cursor.version === -1) {
          cursor = this.system.unlink(cursor, node);
          continue;
        }
        cursor = cursor.nextDep;
      }
      node.flags &= ~(ReactiveFlags.Pending | ReactiveFlags.Dirty | ReactiveFlags.Recursed | ReactiveFlags.RecursedCheck);
    }
  }

  private enqueue(node: InternalNode): void {
    if (node.queued) return;
    node.queued = true;
    if (this.queueTail === this.queue.length) {
      this.queue.push(node);
      this.metrics.recordStepAllocation();
    } else {
      this.queue[this.queueTail] = node;
    }
    this.queueTail += 1;
  }
}

class AlienHarness implements BenchHarness {
  readonly metrics = new HarnessMetrics();
  private readonly disposers: Array<() => void> = [];

  signal(
    initial: number,
    _label?: string,
  ): readonly [() => number, (value: WriteInput) => void] {
    this.metrics.recordSetupAllocation();
    const state = signal(initial);

    return [
      () => state(),
      (value) => {
        this.metrics.recordSchedulerOp();
        const next = typeof value === "function" ? value(state()) : value;
        state(next);
      },
    ] as const;
  }

  memo(fn: () => number, _label?: string): () => number {
    this.metrics.recordSetupAllocation();

    const accessor = computed(() => {
      this.metrics.recordRecompute();
      return fn();
    });

    return () => {
      this.metrics.recordRefresh();
      return accessor();
    };
  }

  effect(read: () => number, _meta?: { label?: string; priority?: number }): () => void {
    this.metrics.recordSetupAllocation();

    const dispose = alienEffect(() => {
      this.metrics.recordRecompute();
      this.metrics.recordEffectRun();
      blackhole(read());
    });

    this.disposers.push(dispose);
    return dispose;
  }

  batch<T>(fn: () => T): T {
    this.metrics.recordSchedulerOp();
    startBatch();

    try {
      return fn();
    } finally {
      endBatch();
      this.metrics.recordSchedulerOp();
    }
  }

  flush(): void {
    startBatch();
    try {
    } finally {
      endBatch();
    }
  }

  resetRunMetrics(): void {
    this.metrics.resetRunMetrics();
  }

  beginStep(): void {
    this.metrics.beginStep();
  }

  endStep(wallTimeMs: number) {
    return this.metrics.endStep(wallTimeMs);
  }

  dispose(): void {
    for (let index = this.disposers.length - 1; index >= 0; --index) {
      this.disposers[index]!();
    }
    this.disposers.length = 0;
  }
}

const reflexRuntime = createReflexRuntime({ effectStrategy: "sab" });

class ReflexHarness implements BenchHarness {
  readonly metrics = new HarnessMetrics();

  signal(
    initial: number,
    _label?: string,
  ): readonly [() => number, (value: WriteInput) => void] {
    this.metrics.recordSetupAllocation();
    return reflexSignal(initial) as unknown as readonly [
      () => number,
      (value: WriteInput) => void,
    ];
  }

  memo(fn: () => number, _label?: string): () => number {
    this.metrics.recordSetupAllocation();
    return reflexMemo(fn);
  }

  effect(read: () => number, _meta?: { label?: string; priority?: number }): () => void {
    this.metrics.recordSetupAllocation();
    return reflexEffect(() => {
      blackhole(read());
    });
  }

  batch<T>(fn: () => T): T {
    return reflexRuntime.batch(fn);
  }

  flush(): void {
    reflexRuntime.flush();
  }

  resetRunMetrics(): void {
    this.metrics.resetRunMetrics();
  }

  beginStep(): void {
    this.metrics.beginStep();
  }

  endStep(wallTimeMs: number) {
    return this.metrics.endStep(wallTimeMs);
  }

  dispose(): void {}
}

const variants: readonly BenchVariant[] = [
  {
    label: "linked-propagation",
    createHarness: () => new LinkedPropagationHarness(),
  },
  {
    label: "alien-signals",
    createHarness: () => new AlienHarness(),
  },
  {
    label: "reflex-signals",
    createHarness: () => new ReflexHarness(),
  },
];

registerBenchFile("alien-propagation", variants);

export interface ReactiveNode {
  deps?: Link;
  lastInTail?: Link;
  subs?: Link;
  subsTail?: Link;
  flags: ReactiveFlags;
}

export interface Link {
  version: number;
  dep: ReactiveNode;
  sub: ReactiveNode;
  prevSub: Link | undefined;
  nextSub: Link | undefined;
  prevDep: Link | undefined;
  nextDep: Link | undefined;
}

interface Stack<T> {
  value: T;
  prev: Stack<T> | undefined;
}

export const enum ReactiveFlags {
  None = 0,
  Mutable = 1,
  Watching = 2,
  RecursedCheck = 4,
  Recursed = 8,
  Dirty = 16,
  Pending = 32,
}

function createReactiveSystem({
  update,
  notify,
  unwatched,
}: {
  update(sub: ReactiveNode): boolean;
  notify(sub: ReactiveNode): void;
  unwatched(sub: ReactiveNode): void;
}) {
  return {
    link,
    unlink,
    propagate,
    checkDirty,
    shallowPropagate,
  };

  function link(dep: ReactiveNode, sub: ReactiveNode, version: number): void {
    const prevDep = sub.lastInTail;
    if (prevDep !== undefined && prevDep.dep === dep) {
      prevDep.version = version;
      return;
    }
    const nextDep = prevDep !== undefined ? prevDep.nextDep : sub.deps;
    if (nextDep !== undefined && nextDep.dep === dep) {
      nextDep.version = version;
      sub.lastInTail = nextDep;
      return;
    }
    const prevSub = dep.subsTail;
    if (prevSub !== undefined && prevSub.version === version && prevSub.sub === sub) {
      return;
    }
    const newLink =
      sub.lastInTail =
      dep.subsTail =
        {
          version,
          dep,
          sub,
          prevDep,
          nextDep,
          prevSub,
          nextSub: undefined,
        };
    if (nextDep !== undefined) {
      nextDep.prevDep = newLink;
    }
    if (prevDep !== undefined) {
      prevDep.nextDep = newLink;
    } else {
      sub.deps = newLink;
    }
    if (prevSub !== undefined) {
      prevSub.nextSub = newLink;
    } else {
      dep.subs = newLink;
    }
  }

  function unlink(link: Link, sub = link.sub): Link | undefined {
    const dep = link.dep;
    const prevDep = link.prevDep;
    const nextDep = link.nextDep;
    const nextSub = link.nextSub;
    const prevSub = link.prevSub;
    if (nextDep !== undefined) {
      nextDep.prevDep = prevDep;
    } else {
      sub.lastInTail = prevDep;
    }
    if (prevDep !== undefined) {
      prevDep.nextDep = nextDep;
    } else {
      sub.deps = nextDep;
    }
    if (nextSub !== undefined) {
      nextSub.prevSub = prevSub;
    } else {
      dep.subsTail = prevSub;
    }
    if (prevSub !== undefined) {
      prevSub.nextSub = nextSub;
    } else if ((dep.subs = nextSub) === undefined) {
      unwatched(dep);
    }
    return nextDep;
  }

  function propagate(link: Link): void {
    let next = link.nextSub;
    let stack: Stack<Link | undefined> | undefined;

    top: do {
      const sub = link.sub;
      let flags = sub.flags;

      if (!(flags & (ReactiveFlags.RecursedCheck | ReactiveFlags.Recursed | ReactiveFlags.Dirty | ReactiveFlags.Pending))) {
        sub.flags = flags | ReactiveFlags.Pending;
      } else if (!(flags & (ReactiveFlags.RecursedCheck | ReactiveFlags.Recursed))) {
        flags = ReactiveFlags.None;
      } else if (!(flags & ReactiveFlags.RecursedCheck)) {
        sub.flags = (flags & ~ReactiveFlags.Recursed) | ReactiveFlags.Pending;
      } else if (!(flags & (ReactiveFlags.Dirty | ReactiveFlags.Pending)) && isValidLink(link, sub)) {
        sub.flags = flags | (ReactiveFlags.Recursed | ReactiveFlags.Pending);
        flags &= ReactiveFlags.Mutable;
      } else {
        flags = ReactiveFlags.None;
      }

      if (flags & ReactiveFlags.Watching) {
        notify(sub);
      }

      if (flags & ReactiveFlags.Mutable) {
        const subSubs = sub.subs;
        if (subSubs !== undefined) {
          const nextSub = (link = subSubs).nextSub;
          if (nextSub !== undefined) {
            stack = { value: next, prev: stack };
            next = nextSub;
          }
          continue;
        }
      }

      if ((link = next!) !== undefined) {
        next = link.nextSub;
        continue;
      }

      while (stack !== undefined) {
        link = stack.value!;
        stack = stack.prev;
        if (link !== undefined) {
          next = link.nextSub;
          continue top;
        }
      }

      break;
    } while (true);
  }

  function checkDirty(link: Link, sub: ReactiveNode): boolean {
    let stack: Stack<Link> | undefined;
    let checkDepth = 0;
    let dirty = false;

    top: do {
      const dep = link.dep;
      const flags = dep.flags;

      if (sub.flags & ReactiveFlags.Dirty) {
        dirty = true;
      } else if (link.version !== (dep as InternalNode).version) {
        link.version = (dep as InternalNode).version;
        dirty = true;
      } else if ((flags & (ReactiveFlags.Mutable | ReactiveFlags.Dirty)) === (ReactiveFlags.Mutable | ReactiveFlags.Dirty)) {
        if (update(dep)) {
          const subs = dep.subs!;
          if (subs.nextSub !== undefined) {
            shallowPropagate(subs);
          }
          dirty = true;
        }
      } else if ((flags & (ReactiveFlags.Mutable | ReactiveFlags.Pending)) === (ReactiveFlags.Mutable | ReactiveFlags.Pending)) {
        if (link.nextSub !== undefined || link.prevSub !== undefined) {
          stack = { value: link, prev: stack };
        }
        link = dep.deps!;
        sub = dep;
        ++checkDepth;
        continue;
      }

      if (!dirty) {
        const nextDep = link.nextDep;
        if (nextDep !== undefined) {
          link = nextDep;
          continue;
        }
      }

      while (checkDepth--) {
        const firstSub = sub.subs!;
        const hasMultipleSubs = firstSub.nextSub !== undefined;
        if (hasMultipleSubs) {
          link = stack!.value;
          stack = stack!.prev;
        } else {
          link = firstSub;
        }
        if (dirty) {
          if (update(sub)) {
            if (hasMultipleSubs) {
              shallowPropagate(firstSub);
            }
            sub = link.sub;
            continue;
          }
          dirty = false;
        } else {
          sub.flags &= ~ReactiveFlags.Pending;
        }
        sub = link.sub;
        const nextDep = link.nextDep;
        if (nextDep !== undefined) {
          link = nextDep;
          continue top;
        }
      }

      return dirty;
    } while (true);
  }

  function shallowPropagate(link: Link): void {
    do {
      const sub = link.sub;
      const flags = sub.flags;
      if ((flags & (ReactiveFlags.Pending | ReactiveFlags.Dirty)) === ReactiveFlags.Pending) {
        sub.flags = flags | ReactiveFlags.Dirty;
        if ((flags & (ReactiveFlags.Watching | ReactiveFlags.RecursedCheck)) === ReactiveFlags.Watching) {
          notify(sub);
        }
      }
    } while ((link = link.nextSub!) !== undefined);
  }

  function isValidLink(checkLink: Link, sub: ReactiveNode): boolean {
    let link = sub.lastInTail;
    while (link !== undefined) {
      if (link === checkLink) {
        return true;
      }
      link = link.prevDep;
    }
    return false;
  }
}
