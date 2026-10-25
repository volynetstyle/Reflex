import {
  createProducer,
  getActiveRuntimeContext,
  readProducer,
  writeProducer,
  type ExecutionDomain,
  type ProducerNode,
} from "@volynets/reflex-runtime";
import {
  isTracking,
  disposeNode,
  enterReactiveBatch,
  leaveReactiveBatch,
} from "@volynets/reflex-runtime/internal";
import { addCleanup } from "../ownership/ownership.cleanup";
import { isShuttingDown } from "../ownership/ownership.meta";
import type { OwnershipNode } from "../ownership/ownership.node";

/** Contract: docs/architecture/domain-ports.md. */
export interface PortMessage<T> {
  readonly version: number;
  readonly value: T;
}

export interface PortEndpoint {
  readonly domain: ExecutionDomain;
  /** The scope whose disposal closes the port on this side. */
  readonly node?: OwnershipNode | null;
}

export interface PortOptions {
  /** `"latest"` coalesces to one pending message; `"fifo"` keeps every version. */
  delivery?: "latest" | "fifo";
  /** Pending message bound for `"fifo"` delivery. */
  capacity?: number;
  /** Payload policy: immutable contract (DEV-frozen), structured clone, or shared. */
  payload?: "freeze" | "clone" | "share";
  /** Ports must form a DAG between domains unless feedback is explicit. */
  feedback?: "reject" | "allow";
}

export interface DomainPort<T> {
  /** Last delivered version; 0 before the first delivery. */
  readonly version: number;
  /** Last published version. */
  readonly published: number;
  readonly closed: boolean;
  /** Managed mirror read. */
  read(): T | undefined;
  /** Last delivered value, read without tracking. */
  peek(): T | undefined;
  publish(value: T): void;
  /** Applies an externally transported message (same version rule). */
  deliver(message: PortMessage<T>): boolean;
  /** Delivers pending messages synchronously. */
  flush(): void;
  close(): void;
}

const portMirrors = new WeakMap<DomainPort<unknown>, ProducerNode<unknown>>();

/** The target-domain mirror producer; for this package and its tests only. */
export function portMirror<T>(
  port: DomainPort<T>,
): ProducerNode<T | undefined> {
  return portMirrors.get(port as DomainPort<unknown>) as ProducerNode<
    T | undefined
  >;
}

export class PortClosedError extends Error {
  constructor() {
    super("The domain port is closed.");
    this.name = "PortClosedError";
  }
}

export class PortOverflowError extends Error {
  constructor(capacity: number) {
    super(`The domain port exceeded its capacity of ${capacity} messages.`);
    this.name = "PortOverflowError";
  }
}

export class PortTopologyError extends Error {
  constructor() {
    super(
      "This port would close a cycle between execution domains. " +
        'Ports form a DAG unless created with feedback: "allow".',
    );
    this.name = "PortTopologyError";
  }
}

// Directed multigraph of live, DAG-constrained ports between domains.
const topology = new Map<ExecutionDomain, Map<ExecutionDomain, number>>();

function reaches(from: ExecutionDomain, to: ExecutionDomain): boolean {
  const seen = new Set<ExecutionDomain>();
  const stack = [from];
  while (stack.length !== 0) {
    const domain = stack.pop()!;
    if (domain === to) return true;
    if (seen.has(domain)) continue;
    seen.add(domain);
    for (const next of topology.get(domain)?.keys() ?? []) stack.push(next);
  }
  return false;
}

function link(from: ExecutionDomain, to: ExecutionDomain): () => void {
  let edges = topology.get(from);
  if (edges === undefined) topology.set(from, (edges = new Map()));
  edges.set(to, (edges.get(to) ?? 0) + 1);
  return () => {
    const count = edges.get(to)! - 1;
    if (count === 0) edges.delete(to);
    else edges.set(to, count);
    if (edges.size === 0) topology.delete(from);
  };
}

function deepFreeze<T>(value: T, seen = new Set<unknown>()): T {
  if (value === null || typeof value !== "object" || seen.has(value)) {
    return value;
  }
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    deepFreeze((value as Record<PropertyKey, unknown>)[key], seen);
  }
  return Object.freeze(value);
}

export function createPort<T>(
  source: PortEndpoint,
  target: PortEndpoint,
  options: PortOptions = {},
): DomainPort<T> {
  const delivery = options.delivery ?? "latest";
  const capacity = options.capacity ?? 1024;
  const payload = options.payload ?? "freeze";

  if (source.domain === target.domain) {
    throw new TypeError("A port connects two different execution domains.");
  }
  if (source.domain.closed || target.domain.closed) {
    throw new PortClosedError();
  }
  if (options.feedback !== "allow" && reaches(target.domain, source.domain)) {
    throw new PortTopologyError();
  }
  const unlink =
    options.feedback === "allow"
      ? undefined
      : link(source.domain, target.domain);

  const local = target.domain.run(() =>
    createProducer<T | undefined>(undefined),
  );
  const pending: PortMessage<T>[] = [];
  let version = 0;
  let published = 0;
  let closed = false;
  let scheduled = false;

  const prepare = (value: T): T => {
    if (payload === "clone") return structuredClone(value);
    if (payload === "freeze" && __DEV__) return deepFreeze(value);
    return value;
  };

  const apply = (message: PortMessage<T>): boolean => {
    if (closed || message.version <= version) return false;
    if (target.domain.closed) {
      port.close();
      return false;
    }
    version = message.version;
    target.domain.run(() => {
      enterReactiveBatch();
      try {
        writeProducer(local, message.value);
      } finally {
        leaveReactiveBatch();
      }
    });
    return true;
  };

  const drain = (): void => {
    scheduled = false;
    while (pending.length !== 0 && !closed) apply(pending.shift()!);
  };

  const port: DomainPort<T> = {
    get version() {
      return version;
    },
    get published() {
      return published;
    },
    get closed() {
      return closed;
    },
    read() {
      if (
        __DEV__ &&
        isTracking() &&
        getActiveRuntimeContext() !== target.domain.context
      ) {
        throw new Error(
          "A port mirror is tracked only inside its target domain.",
        );
      }
      return readProducer(local);
    },
    peek() {
      return local.payload;
    },
    publish(value) {
      if (closed) throw new PortClosedError();
      if (delivery === "fifo" && pending.length >= capacity) {
        throw new PortOverflowError(capacity);
      }
      const message: PortMessage<T> = {
        version: ++published,
        value: prepare(value),
      };
      if (delivery === "latest") pending.length = 0;
      pending.push(message);
      if (!scheduled) {
        scheduled = true;
        queueMicrotask(drain);
      }
    },
    deliver(message) {
      return apply(message);
    },
    flush() {
      drain();
    },
    close() {
      if (closed) return;
      closed = true;
      pending.length = 0;
      unlink?.();
    },
  };

  const watch = (endpoint: PortEndpoint): void => {
    const node = endpoint.node;
    if (node != null && !isShuttingDown(node)) addCleanup(node, port.close);
    endpoint.domain.signal.addEventListener("abort", port.close, {
      once: true,
    });
  };
  watch(source);
  watch(target);

  // The mirror lives as long as the target tree; unlink at its safe point.
  const targetNode = target.node;
  if (targetNode != null && !isShuttingDown(targetNode)) {
    addCleanup(targetNode, () =>
      target.domain.teardown(() => disposeNode(local)),
    );
  }

  portMirrors.set(port as DomainPort<unknown>, local as ProducerNode<unknown>);
  return port;
}
