import type { ReactiveNode } from "@reflex/runtime";

export interface RuntimeBinding {
  enqueue(node: ReactiveNode): void;
  notifySettled(): void;
  isDisposed(): boolean;
}

const watcherBindings = new WeakMap<ReactiveNode, RuntimeBinding>();
const runtimeBindings = new Set<RuntimeBinding>();

let currentRuntimeBinding: RuntimeBinding | null = null;
let defaultRuntimeBinding: RuntimeBinding | null = null;

export function bindWatcherToRuntime(
  node: ReactiveNode,
  runtime: RuntimeBinding | null,
): void {
  if (runtime !== null) {
    watcherBindings.set(node, runtime);
  }
}

export function bindWatcherToCurrentRuntime(node: ReactiveNode): void {
  bindWatcherToRuntime(
    node,
    currentRuntimeBinding ?? defaultRuntimeBinding,
  );
}

export function getWatcherRuntime(
  node: ReactiveNode,
): RuntimeBinding | undefined {
  return watcherBindings.get(node);
}

export function getCurrentRuntimeBinding(): RuntimeBinding | null {
  return currentRuntimeBinding;
}

export function getDefaultRuntimeBinding(): RuntimeBinding | null {
  return defaultRuntimeBinding;
}

export function setDefaultRuntimeBinding(
  runtime: RuntimeBinding | null,
): void {
  defaultRuntimeBinding = runtime;
}

export function registerRuntimeBinding(runtime: RuntimeBinding): void {
  runtimeBindings.add(runtime);
}

export function unregisterRuntimeBinding(runtime: RuntimeBinding): void {
  runtimeBindings.delete(runtime);

  if (defaultRuntimeBinding === runtime) {
    defaultRuntimeBinding = null;
  }

  if (currentRuntimeBinding === runtime) {
    currentRuntimeBinding = null;
  }
}

export function getRuntimeBindings(): Iterable<RuntimeBinding> {
  return runtimeBindings;
}

export function withRuntimeBinding<T>(
  runtime: RuntimeBinding | null,
  fn: () => T,
): T {
  if (currentRuntimeBinding === runtime) {
    return fn();
  }

  const previous = currentRuntimeBinding;
  currentRuntimeBinding = runtime;

  try {
    return fn();
  } finally {
    currentRuntimeBinding = previous;
  }
}
