/**
 * Hierarchical minimization of oracle programs. program.ts `shrink` removes
 * operations and single reads; it cannot remove a node, so a counterexample
 * from a deep or wide program (a chain of 1,000 consumers) stays almost as
 * large as it was found. This reducer first removes whole nodes, in chunks of
 * decreasing size per node class (ddmin, Zeller and Hildebrandt, "Simplifying
 * and Isolating Failure-Inducing Input", TSE 2002), renumbering every
 * reference, as hierarchical delta debugging reduces the coarse level before
 * the fine one (Misherghi and Su, ICSE 2006). Then `shrink` reduces what is
 * left, and the two alternate until neither makes progress.
 *
 * Every candidate is a valid program: a reference to a removed node removes
 * the read, action, operation or condition that holds it.
 */
import {
  shrink,
  type CallbackSpec,
  type NestedAction,
  type Op,
  type Program,
  type ReadStep,
  type WatcherSpec,
} from "./program.ts";

/** `program` without the nodes `removed` (node ids), references renumbered. */
export function removeNodes(
  program: Program,
  removed: ReadonlySet<number>,
): Program {
  const { spec } = program;
  const producers = spec.producers;
  const consumers = spec.consumers.length;
  const total = producers + consumers + spec.watchers.length;
  const map: number[] = [];
  let next = 0;
  for (let id = 0; id < total; id++) map.push(removed.has(id) ? -1 : next++);
  let keptProducers = 0;
  for (let id = 0; id < producers; id++) if (map[id]! >= 0) keptProducers++;
  let keptConsumers = 0;
  for (let id = producers; id < producers + consumers; id++)
    if (map[id]! >= 0) keptConsumers++;

  const node = (id: number) => map[id] ?? -1;
  const watcher = (index: number) => {
    const id = node(producers + consumers + index);
    return id < 0 ? -1 : id - keptProducers - keptConsumers;
  };
  const read = (step: ReadStep): ReadStep | null => {
    const id = node(step.node);
    if (id < 0) return null;
    if (step.when === undefined) return { ...step, node: id };
    const producer = node(step.when.producer);
    if (producer < 0) return null;
    return { ...step, node: id, when: { ...step.when, producer } };
  };
  const action = (item: NestedAction): NestedAction | null => {
    switch (item.kind) {
      case "write": {
        const producer = node(item.producer);
        return producer < 0 ? null : { ...item, producer };
      }
      case "read":
      case "foreign-read": {
        const id = node(item.node);
        return id < 0 ? null : { ...item, node: id };
      }
      case "dispose": {
        const index = watcher(item.watcher);
        return index < 0 ? null : { ...item, watcher: index };
      }
    }
  };
  const callback = <T extends WatcherSpec>(item: T): T => {
    const result: T = {
      ...item,
      reads: item.reads.map(read).filter((step) => step !== null),
    };
    if (item.reverseWhen !== undefined) {
      const producer = node(item.reverseWhen.producer);
      if (producer < 0) delete result.reverseWhen;
      else result.reverseWhen = { ...item.reverseWhen, producer };
    }
    if (item.action !== undefined) {
      const mapped = action(item.action);
      if (mapped === null) {
        delete result.action;
        delete result.actionWhen;
      } else result.action = mapped;
    }
    if (item.cleanup?.action !== undefined) {
      const mapped = action(item.cleanup.action);
      const cleanup = { ...item.cleanup };
      if (mapped === null) delete cleanup.action;
      else cleanup.action = mapped;
      result.cleanup = cleanup;
    }
    return result;
  };
  const ops = (list: readonly Op[]): Op[] =>
    list.flatMap((op): Op[] => {
      switch (op.kind) {
        case "write": {
          const producer = node(op.producer);
          return producer < 0 ? [] : [{ ...op, producer }];
        }
        case "read":
        case "dispose": {
          const id = node(op.node);
          return id < 0 ? [] : [{ ...op, node: id }];
        }
        case "run": {
          const index = watcher(op.watcher);
          return index < 0 ? [] : [{ ...op, watcher: index }];
        }
        case "batch":
        case "context":
          return [{ ...op, ops: ops(op.ops) }];
        default:
          return [op];
      }
    });

  const keep = (offset: number) => (_: unknown, index: number) =>
    map[offset + index]! >= 0;
  const nextSpec = {
    ...spec,
    producers: keptProducers,
    consumers: spec.consumers
      .filter(keep(producers))
      .map((item) => callback(item as WatcherSpec) as CallbackSpec),
    watchers: spec.watchers
      .filter(keep(producers + consumers))
      .map((item) => callback(item)),
  };
  if (spec.hook !== undefined) {
    const mapped = action(spec.hook.action);
    if (mapped === null) delete nextSpec.hook;
    else nextSpec.hook = { ...spec.hook, action: mapped };
  }
  return { spec: nextSpec, ops: ops(program.ops) };
}

/** Producers, consumers and watchers of a program. */
export const nodeCount = (program: Program) =>
  program.spec.producers +
  program.spec.consumers.length +
  program.spec.watchers.length;

/**
 * ddmin over the nodes of each class (consumers, watchers, producers):
 * remove chunks of half the class, then quarters, ..., then single nodes,
 * keeping every removal after which the program still fails.
 */
export function reduceNodes(
  program: Program,
  fails: (program: Program) => boolean,
  budget: { steps: number },
): Program {
  let current = program;
  const range = (kind: "consumers" | "watchers" | "producers") => {
    const { spec } = current;
    if (kind === "producers") return { first: 0, count: spec.producers };
    if (kind === "consumers")
      return { first: spec.producers, count: spec.consumers.length };
    return {
      first: spec.producers + spec.consumers.length,
      count: spec.watchers.length,
    };
  };
  for (const kind of ["consumers", "watchers", "producers"] as const) {
    for (
      let size = Math.max(1, range(kind).count >> 1);
      size >= 1;
      size >>= 1
    ) {
      for (let start = 0; start < range(kind).count; ) {
        if (budget.steps-- <= 0) return current;
        const { first, count } = range(kind);
        const removed = new Set<number>();
        for (let i = start; i < Math.min(count, start + size); i++)
          removed.add(first + i);
        const candidate = removeNodes(current, removed);
        if (fails(candidate)) current = candidate;
        else start += size;
      }
    }
  }
  return current;
}

/**
 * Minimizes a failing program: node chunks first, then operations and
 * reads (program.ts `shrink`), repeated while either level makes progress.
 * `maxSteps` bounds the number of candidate programs tried.
 */
export function minimize(
  program: Program,
  fails: (program: Program) => boolean,
  maxSteps = 4_000,
): Program {
  const budget = { steps: maxSteps };
  let current = program;
  for (;;) {
    const before = JSON.stringify(current);
    current = reduceNodes(current, fails, budget);
    if (budget.steps <= 0) break;
    const share = Math.max(1, budget.steps >> 1);
    current = shrink(current, fails, share);
    budget.steps -= share;
    if (budget.steps <= 0 || JSON.stringify(current) === before) break;
  }
  return current;
}
