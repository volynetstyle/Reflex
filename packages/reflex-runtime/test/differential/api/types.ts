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

export interface Program {
  readonly id: string;
  readonly operations: readonly Op[];
  readonly meta?: Readonly<Record<string, unknown>>;
}

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

export interface Machine {
  execute(op: Op): Observation;
}
