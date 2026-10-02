import { AsyncProtocolError } from "./errors";

/** Freshness handles belong to async sources, never to ordinary reactive nodes. */
export interface FreshnessDependency {
  ensure(): void;
  /** Check the already-pulled source without recording a reactive edge. */
  validate(): void;
}

export type FrontierSnapshot = ReadonlySet<FreshnessDependency>;
export const EMPTY_FRONTIER: FrontierSnapshot = new Set();

export class FrontierBuilder {
  private readonly dependencies = new Set<FreshnessDependency>();

  constructor(private readonly owner?: FreshnessDependency) {}

  add(dependency: FreshnessDependency): void {
    if (dependency === this.owner)
      throw new AsyncProtocolError("Cyclic async derivation dependency.");
    this.dependencies.add(dependency);
  }

  merge(frontier: FrontierSnapshot): void {
    for (const dependency of frontier) this.add(dependency);
  }

  snapshot(): FrontierSnapshot {
    return this.dependencies.size === 0
      ? EMPTY_FRONTIER
      : new Set(this.dependencies);
  }
}

// Computed evaluations and async bodies collect independently of execution API lifetime.
let activeFrontierCollector: FrontierBuilder | undefined;

export function withFrontierCollector<T>(
  collector: FrontierBuilder,
  expression: () => T,
): T {
  const parent = activeFrontierCollector;
  activeFrontierCollector = collector;
  try {
    return expression();
  } finally {
    activeFrontierCollector = parent;
  }
}

export function recordFreshnessDependency(
  dependency: FreshnessDependency,
): void {
  activeFrontierCollector?.add(dependency);
}

export function inheritFrontier(frontier: FrontierSnapshot): void {
  activeFrontierCollector?.merge(frontier);
}
