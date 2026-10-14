import {
  createConsumer,
  createProducer,
  getActiveRuntimeContext,
  readConsumer,
  readProducer,
  writeProducer,
  type ReactiveNode,
} from "@volynets/reflex-runtime";
import {
  currentConsumer,
  disposeNode,
} from "@volynets/reflex-runtime/internal";
import { addCleanup } from "../ownership/ownership.cleanup";
import { isShuttingDown } from "../ownership/ownership.meta";
import type { OwnershipNode } from "../ownership/ownership.node";
import {
  getActiveOwnerContext,
  type OwnerContext,
} from "../ownership/ownership.scope";
import { runInDomain } from "./enter";

/**
 * Lifetime rule (O2): absent an explicit lease, the owner of a producer must
 * outlive every scope that keeps a live (tracked) dependency on it. An ancestor-owned
 * (or same-scope) producer may be read by descendants; a sibling- or
 * child-owned producer read by a longer-lived scope needs `lease()` or
 * `transfer()`.
 *
 * Ownership is recorded on the managed handle, never on the reactive node.
 * The read check runs in development builds only; a released handle throws
 * in every build. None of this is a security boundary: raw node access
 * bypasses it.
 */
export class BorrowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BorrowError";
  }
}

export class ReleasedResourceError extends Error {
  constructor() {
    super("The owned reactive value was released with its owner.");
    this.name = "ReleasedResourceError";
  }
}

interface Lifetime {
  owner: OwnerContext;
  node: OwnershipNode;
  readonly graph: ReactiveNode;
  leases: Set<OwnershipNode>;
  released: boolean;
  /** Owner closed while leases were outstanding. */
  orphaned: boolean;
}

export interface OwnedValue<T> {
  (): T;
}

export interface OwnedSignal<T> extends OwnedValue<T> {
  set(value: T | ((previous: T) => T)): void;
}

const lifetimes = new WeakMap<OwnedValue<unknown>, Lifetime>();

function lifetimeOf(handle: OwnedValue<unknown>): Lifetime {
  const lifetime = lifetimes.get(handle);
  if (lifetime === undefined) {
    throw new TypeError("Expected an owned reactive value.");
  }
  return lifetime;
}

function isAncestorOrSelf(
  ancestor: OwnershipNode,
  node: OwnershipNode | null,
): boolean {
  for (let current = node; current !== null; current = current.parent) {
    if (current === ancestor) return true;
  }
  return false;
}

function hasLease(lifetime: Lifetime, reader: OwnershipNode | null): boolean {
  for (let current = reader; current !== null; current = current.parent) {
    if (lifetime.leases.has(current)) return true;
  }
  return false;
}

function assertBorrow(lifetime: Lifetime): void {
  // Only tracked reads keep a live dependency; untracked snapshot reads are
  // always allowed.
  if (currentConsumer === null) return;

  // G1/G2: a tracked read from another domain would create a hidden
  // cross-domain edge.
  const domain = lifetime.owner.domain;
  if (domain != null && getActiveRuntimeContext() !== domain.context) {
    throw new BorrowError(
      "A reactive computation read a value owned by another execution domain. " +
        "Cross-domain values travel through ports.",
    );
  }

  const reader = getActiveOwnerContext()?.currentNode ?? null;
  if (reader === null || isAncestorOrSelf(lifetime.node, reader)) return;
  if (hasLease(lifetime, reader)) return;
  throw new BorrowError(
    "A scope read a reactive value whose owner does not outlive it. " +
      "Read values owned by an ancestor, or lease()/transfer() it explicitly.",
  );
}

function release(lifetime: Lifetime): void {
  if (lifetime.released) return;
  lifetime.released = true;
  const graph = lifetime.graph;
  const domain = lifetime.owner.domain;
  // Physical unlink waits for the owner's domain safe point (L2).
  const unlink = (): void => disposeNode(graph);
  if (domain != null && !domain.closed) domain.teardown(unlink);
  else runInDomain(domain, unlink);
}

function bindLifetime(owner: OwnerContext, graph: ReactiveNode): Lifetime {
  const node = owner.currentNode;
  if (node === null) {
    throw new BorrowError("Owned reactive values need an active owner node.");
  }
  if (isShuttingDown(node)) {
    throw new Error("Cannot create an owned value in a disposed scope.");
  }
  const lifetime: Lifetime = {
    owner,
    node,
    graph,
    leases: new Set(),
    released: false,
    orphaned: false,
  };
  watchOwner(lifetime, node);
  return lifetime;
}

/** Only the current owner's closure counts; a transfer retires old owners. */
function watchOwner(lifetime: Lifetime, node: OwnershipNode): void {
  addCleanup(node, () => {
    if (lifetime.node === node) onOwnerClosed(lifetime);
  });
}

function onOwnerClosed(lifetime: Lifetime): void {
  if (lifetime.leases.size !== 0) {
    lifetime.orphaned = true;
    return;
  }
  release(lifetime);
}

function read<T>(lifetime: Lifetime, readGraph: () => T): T {
  if (lifetime.released) throw new ReleasedResourceError();
  if (__DEV__) assertBorrow(lifetime);
  return readGraph();
}

/** A signal owned by `owner.currentNode`, released when that scope closes. */
export function createOwnedSignal<T>(
  owner: OwnerContext,
  initial: T,
): OwnedSignal<T> {
  const graph = createProducer(initial);
  const lifetime = bindLifetime(owner, graph);
  const signal = (() =>
    read(lifetime, () => readProducer(graph))) as OwnedSignal<T>;
  signal.set = (value) => {
    if (lifetime.released) throw new ReleasedResourceError();
    const next =
      typeof value === "function"
        ? (value as (previous: T) => T)(graph.payload as T)
        : value;
    // Managed writes are attributed to the owner's domain (S1).
    runInDomain(lifetime.owner.domain, () => writeProducer(graph, next));
  };
  lifetimes.set(signal, lifetime);
  return signal;
}

/** A computed owned by `owner.currentNode`; its reads follow the same rule. */
export function createOwnedComputed<T>(
  owner: OwnerContext,
  compute: () => T,
): OwnedValue<T> {
  const graph = createConsumer(compute);
  const lifetime = bindLifetime(owner, graph);
  const value = (() =>
    read(lifetime, () => readConsumer(graph))) as OwnedValue<T>;
  lifetimes.set(value, lifetime);
  return value;
}

/**
 * Explicit lifetime agreement: `borrower` (and its descendants) may read
 * `handle`, and the value stays live until every lease is released, even if
 * its owner closes first. The lease ends when `borrower` closes or when the
 * returned function is called.
 */
export function lease(
  handle: OwnedValue<unknown>,
  borrower: OwnershipNode,
): () => void {
  const lifetime = lifetimeOf(handle);
  if (lifetime.released) throw new ReleasedResourceError();
  if (isShuttingDown(borrower)) {
    throw new Error("Cannot lease to a disposed scope.");
  }

  lifetime.leases.add(borrower);
  let active = true;
  const end = (): void => {
    if (!active) return;
    active = false;
    lifetime.leases.delete(borrower);
    if (lifetime.orphaned && lifetime.leases.size === 0) release(lifetime);
  };
  addCleanup(borrower, end);
  return end;
}

/**
 * Moves ownership of `handle` to `target`; the previous owner closing no
 * longer releases it. Only allowed within the same execution domain.
 */
export function transfer(
  handle: OwnedValue<unknown>,
  target: OwnerContext,
): void {
  const lifetime = lifetimeOf(handle);
  if (lifetime.released) throw new ReleasedResourceError();
  const node = target.currentNode;
  if (node === null || isShuttingDown(node)) {
    throw new Error("Cannot transfer to a missing or disposed scope.");
  }
  if ((target.domain ?? null) !== (lifetime.owner.domain ?? null)) {
    throw new BorrowError(
      "Owned values cannot move across execution domains; use a port.",
    );
  }

  lifetime.owner = target;
  lifetime.node = node;
  watchOwner(lifetime, node);
}

/** Whether the handle's value was released with its owner. */
export function isReleased(handle: OwnedValue<unknown>): boolean {
  return lifetimeOf(handle).released;
}
