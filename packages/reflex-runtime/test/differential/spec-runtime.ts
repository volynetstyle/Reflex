export type SpecCleanup = () => void;
export type SpecComputation<T> = () => T;
type Dependency = SpecProducer<unknown> | SpecComputed<unknown>;
type DependencySnapshot = Map<Dependency, number>;

export interface SpecProducer<T> {
  readonly kind: "producer";
  value: T;
  version: number;
}
export interface SpecComputed<T> {
  readonly kind: "computed";
  readonly compute: SpecComputation<T>;
  value: T | undefined;
  version: number;
  validatedAt: number;
  initialized: boolean;
  dependencies: DependencySnapshot;
  retryDependencies: DependencySnapshot | undefined;
}
export interface SpecWatcher {
  readonly kind: "watcher";
  compute: SpecComputation<void | SpecCleanup> | undefined;
  cleanup: SpecCleanup | undefined;
  initialized: boolean;
  dependencies: DependencySnapshot;
  retryDependencies: DependencySnapshot | undefined;
}

/** Deliberately slow executable model with no subscriber graph or dirty bits. */
export class SpecRuntime {
  private revision = 0;
  private collector: DependencySnapshot | undefined;

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
    if (Object.is(node.value, value)) return;
    node.value = value;
    node.version += 1;
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
    } else if (
      node.initialized &&
      !this.dependenciesChanged(node.dependencies)
    ) {
      return;
    }

    const previousCollector = this.collector;
    const nextDependencies: DependencySnapshot = new Map();
    if (node.cleanup !== undefined) {
      const cleanup = node.cleanup;
      node.cleanup = undefined;
      this.collector = undefined;
      try {
        cleanup();
      } catch (error) {
        node.retryDependencies = this.retrySnapshot(node.dependencies);
        throw error;
      } finally {
        this.collector = previousCollector;
      }
      if (node.compute === undefined) return;
    }

    this.collector = nextDependencies;
    try {
      const cleanup = node.compute();
      node.cleanup = typeof cleanup === "function" ? cleanup : undefined;
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
    if (cleanup !== undefined) cleanup();
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
  }
  private dependenciesChanged(dependencies: DependencySnapshot): boolean {
    for (const [dependency, observedVersion] of dependencies) {
      if (dependency.kind === "computed") this.stabilize(dependency);
      if (dependency.version !== observedVersion) return true;
    }
    return false;
  }
  private stabilize<T>(node: SpecComputed<T>): void {
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
      if (!node.initialized || !Object.is(node.value, nextValue)) {
        node.value = nextValue;
        node.version += 1;
      }
      node.dependencies = nextDependencies;
      node.retryDependencies = undefined;
      node.initialized = true;
      node.validatedAt = this.revision;
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
}
