import type { HoldoutSemanticMutantId } from "./holdout-mutants";
import type {
  SpecCleanup,
  SpecComputation,
  SpecComputed,
  SpecProducer,
  SpecWatcher,
} from "./spec-runtime";

type Dependency = SpecProducer<unknown> | SpecComputed<unknown>;
type DependencySnapshot = Map<Dependency, number>;

export const semanticMutants = [
  {
    id: "producer-strict-equality",
    description: "Producer writes use === instead of Object.is.",
  },
  {
    id: "computed-strict-equality",
    description: "Computed values use === instead of Object.is.",
  },
  {
    id: "computed-failure-commits-dependencies",
    description: "A failed computed commits its partial dependency set.",
  },
  {
    id: "computed-failure-commits-validation-epoch",
    description: "A failed computed marks the current revision as validated.",
  },
  {
    id: "cleanup-reads-become-dependencies",
    description: "Reads performed by watcher cleanup become dependencies.",
  },
  {
    id: "watcher-failure-commits-dependencies",
    description: "A failed watcher commits its partial dependency set.",
  },
  {
    id: "watcher-failure-retries-immediately",
    description:
      "A callback failure loses its retry baseline and retries on plain flush.",
  },
  {
    id: "validation-failure-clears-pending",
    description:
      "A validation failure becomes clean until another dependency changes.",
  },
  {
    id: "cleanup-failure-retains-cleanup",
    description: "A throwing cleanup is retained and invoked again.",
  },
] as const;

export type SemanticMutantId =
  | (typeof semanticMutants)[number]["id"]
  | HoldoutSemanticMutantId;

export interface MutationProbe {
  reached: boolean;
  infected: boolean;
  hits: number;
}

/**
 * Deliberately separate faulty implementation used to qualify the oracle.
 * SpecRuntime remains untouched and is always the source of expected traces.
 */
export class MutantRuntime {
  readonly probe: MutationProbe = {
    reached: false,
    infected: false,
    hits: 0,
  };

  private revision = 0;
  private collector: DependencySnapshot | undefined;
  private cleanupOnlyDependencies: Set<Dependency> | undefined;
  private collectingWatcherComputation = false;

  constructor(readonly mutant: SemanticMutantId | undefined = undefined) {}

  createProducer<T>(value: T): SpecProducer<T> {
    return { kind: "producer", value, version: 0 };
  }

  createComputed<T>(compute: SpecComputation<T>): SpecComputed<T> {
    return {
      kind: "computed",
      compute,
      value: undefined,
      version: 0,
      validatedAt: -1,
      initialized: false,
      dependencies: new Map(),
      retryDependencies: undefined,
    };
  }

  createWatcher(compute: SpecComputation<void | SpecCleanup>): SpecWatcher {
    return {
      kind: "watcher",
      compute,
      cleanup: undefined,
      initialized: false,
      dependencies: new Map(),
      retryDependencies: undefined,
    };
  }

  readProducer<T>(node: SpecProducer<T>): T {
    this.track(node);
    return node.value;
  }

  writeProducer<T>(node: SpecProducer<T>, value: T): void {
    const expectedEqual = Object.is(node.value, value);
    let equal = expectedEqual;

    if (this.is("producer-strict-equality")) {
      equal = node.value === value;
      this.hit(equal !== expectedEqual);
    }

    if (equal) return;
    node.value = value;
    if (this.is("producer-write-skips-version")) {
      this.hit(true);
    } else {
      node.version += 1;
    }
    this.revision += 1;
  }

  readComputed<T>(node: SpecComputed<T>): T {
    this.stabilize(node);
    this.track(node);
    return node.value as T;
  }

  runWatcher(node: SpecWatcher): void {
    if (node.compute === undefined) return;

    if (node.retryDependencies !== undefined) {
      if (!this.retryTriggersChanged(node.retryDependencies)) return;
    } else if (node.initialized) {
      let changed: boolean;
      try {
        changed = this.dependenciesChanged(node.dependencies);
      } catch (error) {
        if (this.is("validation-failure-clears-pending")) {
          this.hit(true);
          node.retryDependencies = this.retrySnapshot(node.dependencies);
        }
        throw error;
      }
      if (!changed) return;
    }

    if (
      this.is("watcher-cleanup-runs-after-computation") &&
      node.cleanup !== undefined
    ) {
      this.runWatcherWithLateCleanup(node);
      return;
    }

    const previousCollector = this.collector;
    const nextDependencies: DependencySnapshot = new Map();

    if (node.cleanup !== undefined) {
      const cleanup = node.cleanup;
      node.cleanup = undefined;

      if (this.is("cleanup-reads-become-dependencies")) {
        this.hit(false);
        this.collector = nextDependencies;
        this.cleanupOnlyDependencies = new Set();
      } else {
        this.collector = undefined;
      }

      let cleanupSucceeded = false;
      try {
        cleanup();
        cleanupSucceeded = true;
      } catch (error) {
        if (this.is("cleanup-failure-retains-cleanup")) {
          this.hit(true);
          node.cleanup = cleanup;
        }
        node.retryDependencies = this.retrySnapshot(node.dependencies);
        throw error;
      } finally {
        if (!cleanupSucceeded) this.cleanupOnlyDependencies = undefined;
        this.collector = previousCollector;
      }

      if (node.compute === undefined) return;
    }

    this.collector = nextDependencies;
    this.collectingWatcherComputation = true;

    try {
      const cleanup = node.compute();
      node.cleanup = typeof cleanup === "function" ? cleanup : undefined;

      if (this.is("cleanup-reads-become-dependencies")) {
        this.hit((this.cleanupOnlyDependencies?.size ?? 0) !== 0);
      }

      node.dependencies = nextDependencies;
      node.retryDependencies = undefined;
      node.initialized = true;
    } catch (error) {
      if (this.is("watcher-failure-commits-dependencies")) {
        this.hit(true);
        node.dependencies = nextDependencies;
        node.retryDependencies = this.retrySnapshot(nextDependencies);
      } else if (this.is("watcher-failure-retries-immediately")) {
        this.hit(true);
        node.retryDependencies = undefined;
      } else {
        node.retryDependencies = this.retrySnapshot(
          node.dependencies,
          nextDependencies,
        );
      }
      throw error;
    } finally {
      this.collectingWatcherComputation = false;
      this.cleanupOnlyDependencies = undefined;
      this.collector = previousCollector;
    }
  }

  private runWatcherWithLateCleanup(node: SpecWatcher): void {
    const compute = node.compute!;
    const previousCleanup = node.cleanup!;
    const previousCollector = this.collector;
    const nextDependencies: DependencySnapshot = new Map();
    node.cleanup = undefined;
    this.collector = nextDependencies;
    this.hit(true);

    try {
      const nextCleanup = compute();
      this.collector = undefined;
      previousCleanup();
      node.cleanup =
        typeof nextCleanup === "function" ? nextCleanup : undefined;
      node.dependencies = nextDependencies;
      node.retryDependencies = undefined;
      node.initialized = true;
    } catch (error) {
      node.retryDependencies = this.retrySnapshot(
        node.dependencies,
        nextDependencies,
      );
      throw error;
    } finally {
      this.collector = previousCollector;
    }
  }

  disposeWatcher(node: SpecWatcher): void {
    if (node.compute === undefined) return;
    const cleanup = node.cleanup;
    node.compute = undefined;
    node.cleanup = undefined;
    node.dependencies.clear();
    node.retryDependencies?.clear();
    node.retryDependencies = undefined;
    if (cleanup !== undefined) {
      if (this.is("watcher-dispose-skips-cleanup")) {
        this.hit(true);
      } else {
        cleanup();
      }
    }
  }

  private retrySnapshot(
    committed: DependencySnapshot,
    partial: DependencySnapshot = new Map(),
  ): DependencySnapshot {
    const snapshot: DependencySnapshot = new Map();

    const visit = (dependency: Dependency): void => {
      if (snapshot.has(dependency)) return;
      snapshot.set(dependency, dependency.version);
      if (dependency.kind === "computed") {
        const nested = dependency.retryDependencies ?? dependency.dependencies;
        for (const child of nested.keys()) visit(child);
      }
    };

    for (const dependency of committed.keys()) visit(dependency);
    for (const dependency of partial.keys()) visit(dependency);
    return snapshot;
  }

  private retryTriggersChanged(dependencies: DependencySnapshot): boolean {
    for (const [dependency, observedVersion] of dependencies) {
      if (dependency.version !== observedVersion) return true;
    }
    return false;
  }

  private track(node: Dependency): void {
    this.collector?.set(node, node.version);

    if (
      this.is("cleanup-reads-become-dependencies") &&
      this.cleanupOnlyDependencies !== undefined
    ) {
      if (this.collectingWatcherComputation) {
        this.cleanupOnlyDependencies.delete(node);
      } else {
        this.cleanupOnlyDependencies.add(node);
      }
    }
  }

  private dependenciesChanged(dependencies: DependencySnapshot): boolean {
    let changed = false;
    for (const [dependency, observedVersion] of dependencies) {
      if (dependency.kind === "computed") this.stabilize(dependency);
      if (dependency.version !== observedVersion) changed = true;
    }
    return changed;
  }

  private stabilize<T>(node: SpecComputed<T>): void {
    if (node.initialized && this.is("computed-validation-trusts-cache")) {
      this.hit(node.validatedAt !== this.revision);
      return;
    }
    if (node.initialized && node.validatedAt === this.revision) return;

    if (node.initialized) {
      let changed: boolean;
      try {
        changed = this.dependenciesChanged(node.dependencies);
      } catch (error) {
        node.retryDependencies = this.retrySnapshot(node.dependencies);
        throw error;
      }

      if (!changed) {
        node.validatedAt = this.revision;
        node.retryDependencies = undefined;
        return;
      }
    }

    const previousCollector = this.collector;
    const nextDependencies: DependencySnapshot = new Map();
    this.collector = nextDependencies;

    try {
      const nextValue = node.compute();
      const expectedEqual =
        node.initialized && Object.is(node.value, nextValue);
      let equal = expectedEqual;

      if (node.initialized && this.is("computed-strict-equality")) {
        equal = node.value === nextValue;
        this.hit(equal !== expectedEqual);
      }

      if (!node.initialized || !equal) {
        node.value = nextValue;
        if (node.initialized && this.is("computed-change-keeps-version")) {
          this.hit(true);
        } else {
          node.version += 1;
        }
      }

      node.dependencies = nextDependencies;
      node.retryDependencies = undefined;
      node.initialized = true;
      node.validatedAt = this.revision;
    } catch (error) {
      if (this.is("computed-failure-commits-dependencies")) {
        this.hit(true);
        node.dependencies = nextDependencies;
        node.retryDependencies = this.retrySnapshot(nextDependencies);
      } else {
        node.retryDependencies = this.retrySnapshot(
          node.dependencies,
          nextDependencies,
        );
      }

      if (this.is("computed-failure-commits-validation-epoch")) {
        this.hit(true);
        node.validatedAt = this.revision;
      }
      if (this.is("failed-computed-increments-version")) {
        this.hit(true);
        node.version += 1;
      }

      throw error;
    } finally {
      this.collector = previousCollector;
    }
  }

  private is(mutant: SemanticMutantId): boolean {
    return this.mutant === mutant;
  }

  private hit(infected: boolean): void {
    this.probe.reached = true;
    this.probe.infected ||= infected;
    this.probe.hits += 1;
  }
}
