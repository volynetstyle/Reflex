import {
  createConsumer,
  createProducer,
  createWatcher,
  disposeWatcher,
  readConsumer,
  readProducer,
  runWatcher,
  writeProducer,
} from "../../src";
import {
  SpecRuntime,
  type SpecComputed,
  type SpecProducer,
  type SpecWatcher,
} from "./spec-runtime";

export type Value = number | boolean | string | null;
export type NodeId = string;

export type Expr =
  | { type: "constant"; value: Value }
  | { type: "read"; id: NodeId }
  | {
      type: "add" | "multiply" | "greaterThan" | "equal";
      left: Expr;
      right: Expr;
    }
  | { type: "if"; condition: Expr; then: Expr; else: Expr }
  | { type: "throw"; message: string };

export type Op =
  | { type: "signal"; id: NodeId; value: Value }
  | { type: "computed"; id: NodeId; expression: Expr }
  | { type: "effect"; id: NodeId; expression: Expr; cleanup?: Expr }
  | { type: "set"; id: NodeId; value: Value }
  | { type: "read" | "dispose"; id: NodeId }
  | { type: "flush" };

export interface NormalizedError {
  name: string;
  message: string;
}

export interface EffectEvent {
  effect: NodeId;
  phase: "run" | "cleanup";
  value: Value;
}

export interface Observation {
  value?: Value;
  error?: NormalizedError;
  effects: EffectEvent[];
}

interface Machine {
  execute(op: Op): Observation;
}

type AnySpecNode = SpecProducer<Value> | SpecComputed<Value> | SpecWatcher;

export class SpecMachine implements Machine {
  private readonly runtime = new SpecRuntime();
  private readonly nodes = new Map<NodeId, AnySpecNode>();
  private readonly watchers = new Map<NodeId, SpecWatcher>();
  private effects: EffectEvent[] = [];

  execute(op: Op): Observation {
    this.effects = [];
    try {
      const value = this.executeUnsafe(op);
      return value === undefined
        ? { effects: this.effects }
        : { value, effects: this.effects };
    } catch (error) {
      return { error: normalizeError(error), effects: this.effects };
    }
  }

  private executeUnsafe(op: Op): Value | undefined {
    switch (op.type) {
      case "signal":
        this.assertNew(op.id);
        this.nodes.set(op.id, this.runtime.createProducer(op.value));
        return;
      case "computed":
        this.assertNew(op.id);
        this.nodes.set(
          op.id,
          this.runtime.createComputed(() =>
            evaluate(op.expression, (id) => this.read(id)),
          ),
        );
        return;
      case "effect": {
        this.assertNew(op.id);
        const node = this.runtime.createWatcher(() => {
          this.effects.push({
            effect: op.id,
            phase: "run",
            value: evaluate(op.expression, (id) => this.read(id)),
          });
          if (op.cleanup === undefined) return;
          return () => {
            this.effects.push({
              effect: op.id,
              phase: "cleanup",
              value: evaluate(op.cleanup!, (id) => this.read(id)),
            });
          };
        });
        this.nodes.set(op.id, node);
        this.watchers.set(op.id, node);
        return;
      }
      case "set":
        this.runtime.writeProducer(this.producer(op.id), op.value);
        return;
      case "read":
        return this.read(op.id);
      case "flush":
        for (const watcher of this.watchers.values())
          this.runtime.runWatcher(watcher);
        return;
      case "dispose": {
        const watcher = this.watcher(op.id);
        this.runtime.disposeWatcher(watcher);
        this.watchers.delete(op.id);
        return;
      }
    }
  }

  private read(id: NodeId): Value {
    const node = this.node(id);
    if (node.kind === "producer") return this.runtime.readProducer(node);
    if (node.kind === "computed") return this.runtime.readComputed(node);
    throw new TypeError(`Cannot read watcher '${id}'`);
  }

  private node(id: NodeId): AnySpecNode {
    const node = this.nodes.get(id);
    if (node === undefined) throw new ReferenceError(`Unknown node '${id}'`);
    return node;
  }

  private producer(id: NodeId): SpecProducer<Value> {
    const node = this.node(id);
    if (node.kind !== "producer")
      throw new TypeError(`'${id}' is not a signal`);
    return node;
  }

  private watcher(id: NodeId): SpecWatcher {
    const node = this.node(id);
    if (node.kind !== "watcher")
      throw new TypeError(`'${id}' is not an effect`);
    return node;
  }

  private assertNew(id: NodeId): void {
    if (this.nodes.has(id)) throw new Error(`Duplicate node '${id}'`);
  }
}

type ReflexProducer = ReturnType<typeof createProducer<Value>>;
type ReflexComputed = ReturnType<typeof createConsumer<Value>>;
type ReflexWatcher = ReturnType<typeof createWatcher>;
type AnyReflexNode = ReflexProducer | ReflexComputed | ReflexWatcher;

export class ReflexMachine implements Machine {
  private readonly nodes = new Map<NodeId, AnyReflexNode>();
  private readonly kinds = new Map<
    NodeId,
    "producer" | "computed" | "watcher"
  >();
  private readonly watchers = new Map<NodeId, ReflexWatcher>();
  private effects: EffectEvent[] = [];

  execute(op: Op): Observation {
    this.effects = [];
    try {
      const value = this.executeUnsafe(op);
      return value === undefined
        ? { effects: this.effects }
        : { value, effects: this.effects };
    } catch (error) {
      return { error: normalizeError(error), effects: this.effects };
    }
  }

  private executeUnsafe(op: Op): Value | undefined {
    switch (op.type) {
      case "signal":
        this.add(op.id, "producer", createProducer(op.value));
        return;
      case "computed":
        this.add(
          op.id,
          "computed",
          createConsumer(() => evaluate(op.expression, (id) => this.read(id))),
        );
        return;
      case "effect": {
        const watcher = createWatcher(() => {
          this.effects.push({
            effect: op.id,
            phase: "run",
            value: evaluate(op.expression, (id) => this.read(id)),
          });
          if (op.cleanup === undefined) return;
          return () => {
            this.effects.push({
              effect: op.id,
              phase: "cleanup",
              value: evaluate(op.cleanup!, (id) => this.read(id)),
            });
          };
        });
        this.add(op.id, "watcher", watcher);
        this.watchers.set(op.id, watcher);
        return;
      }
      case "set":
        writeProducer(this.producer(op.id), op.value);
        return;
      case "read":
        return this.read(op.id);
      case "flush":
        for (const watcher of this.watchers.values()) runWatcher(watcher);
        return;
      case "dispose":
        disposeWatcher(this.watcher(op.id));
        this.watchers.delete(op.id);
        return;
    }
  }

  private read(id: NodeId): Value {
    const kind = this.kind(id);
    const node = this.nodes.get(id)!;
    if (kind === "producer") return readProducer(node as ReflexProducer);
    if (kind === "computed") return readConsumer(node as ReflexComputed);
    throw new TypeError(`Cannot read watcher '${id}'`);
  }

  private producer(id: NodeId): ReflexProducer {
    if (this.kind(id) !== "producer")
      throw new TypeError(`'${id}' is not a signal`);
    return this.nodes.get(id) as ReflexProducer;
  }

  private watcher(id: NodeId): ReflexWatcher {
    if (this.kind(id) !== "watcher")
      throw new TypeError(`'${id}' is not an effect`);
    return this.nodes.get(id) as ReflexWatcher;
  }

  private kind(id: NodeId): "producer" | "computed" | "watcher" {
    const kind = this.kinds.get(id);
    if (kind === undefined) throw new ReferenceError(`Unknown node '${id}'`);
    return kind;
  }

  private add(
    id: NodeId,
    kind: "producer" | "computed" | "watcher",
    node: AnyReflexNode,
  ): void {
    if (this.nodes.has(id)) throw new Error(`Duplicate node '${id}'`);
    this.nodes.set(id, node);
    this.kinds.set(id, kind);
  }
}

export function executeDifferential(program: readonly Op[]): Observation[] {
  const expectedMachine = new SpecMachine();
  const actualMachine = new ReflexMachine();
  return program.map((operation, index) => {
    const expected = expectedMachine.execute(operation);
    const actual = actualMachine.execute(operation);
    if (!observationsEqual(actual, expected)) {
      throw new DifferentialError(
        index,
        operation,
        expected,
        actual,
        program.slice(0, index + 1),
      );
    }
    return actual;
  });
}

/** Explicit semantic equality: in particular NaN equals NaN and -0 differs from 0. */
export function observationsEqual(
  left: Observation,
  right: Observation,
): boolean {
  if ("value" in left !== "value" in right) return false;
  if ("value" in left && !Object.is(left.value, right.value)) return false;
  if ("error" in left !== "error" in right) return false;
  if (
    left.error !== undefined &&
    (right.error === undefined ||
      left.error.name !== right.error.name ||
      left.error.message !== right.error.message)
  )
    return false;
  if (left.effects.length !== right.effects.length) return false;
  return left.effects.every((event, index) => {
    const other = right.effects[index];
    return (
      other !== undefined &&
      event.effect === other.effect &&
      event.phase === other.phase &&
      Object.is(event.value, other.value)
    );
  });
}

export class DifferentialError extends Error {
  constructor(
    readonly operationIndex: number,
    readonly operation: Op,
    readonly expected: Observation,
    readonly actual: Observation,
    readonly prefix: readonly Op[],
  ) {
    super(
      `Differential mismatch at operation ${operationIndex}: ${format(operation)}\n` +
        `expected ${format(expected)}\nactual   ${format(actual)}`,
    );
    this.name = "DifferentialError";
  }
}

// Shared deliberately: expression semantics are outside the differential boundary.
function evaluate(expression: Expr, readNode: (id: NodeId) => Value): Value {
  switch (expression.type) {
    case "constant":
      return expression.value;
    case "read":
      return readNode(expression.id);
    case "if":
      return evaluate(expression.condition, readNode)
        ? evaluate(expression.then, readNode)
        : evaluate(expression.else, readNode);
    case "add":
      return (
        Number(evaluate(expression.left, readNode)) +
        Number(evaluate(expression.right, readNode))
      );
    case "multiply":
      return (
        Number(evaluate(expression.left, readNode)) *
        Number(evaluate(expression.right, readNode))
      );
    case "greaterThan":
      return (
        Number(evaluate(expression.left, readNode)) >
        Number(evaluate(expression.right, readNode))
      );
    case "equal":
      return Object.is(
        evaluate(expression.left, readNode),
        evaluate(expression.right, readNode),
      );
    case "throw":
      throw new Error(expression.message);
  }
}

function normalizeError(error: unknown): NormalizedError {
  return error instanceof Error
    ? { name: error.name, message: error.message }
    : { name: "ThrownValue", message: String(error) };
}

function format(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (typeof item !== "number" || Number.isFinite(item)) {
      if (!Object.is(item, -0)) return item;
    }
    if (Number.isNaN(item)) return "<NaN>";
    if (item === Infinity) return "<Infinity>";
    if (item === -Infinity) return "<-Infinity>";
    if (Object.is(item, -0)) return "<-0>";
    return item;
  });
}
