import type { Expr, NodeId, Value, Op, Program } from "./types";

type BinaryExprType = Extract<Expr, { left: Expr; right: Expr }>["type"];

type IdOpType = Extract<Op, { id: NodeId }>["type"];

const binary =
  (type: BinaryExprType) =>
  (left: Expr, right: Expr): Expr => ({
    type,
    left,
    right,
  });

const withId =
  <T extends IdOpType>(type: T) =>
  (id: NodeId): Extract<Op, { type: T }> =>
    ({ type, id }) as Extract<Op, { type: T }>;

export const expr = {
  value: (value: Value): Expr => ({ type: "constant", value }),

  read: (id: NodeId): Expr => ({ type: "read", id }),

  add: binary("add"),
  multiply: binary("multiply"),
  equal: binary("equal"),
  greaterThan: binary("greaterThan"),

  when: (condition: Expr, then: Expr, otherwise: Expr): Expr => ({
    type: "if",
    condition,
    then,
    else: otherwise,
  }),

  fail: (message: string): Expr => ({
    type: "throw",
    message,
  }),
};

export const op = {
  signal: (id: NodeId, value: Value): Op => ({
    type: "signal",
    id,
    value,
  }),

  computed: (id: NodeId, expression: Expr): Op => ({
    type: "computed",
    id,
    expression,
  }),

  watcher: (id: NodeId, expression: Expr, cleanup?: Expr): Op => ({
    type: "effect",
    id,
    expression,
    ...(cleanup !== undefined && { cleanup }),
  }),

  set: (id: NodeId, value: Value): Op => ({
    type: "set",
    id,
    value,
  }),

  read: withId("read"),
  dispose: withId("dispose"),

  flush: (): Op => ({ type: "flush" }),
};

export function defineProgram(
  id: string,
  operations: readonly Op[],
  meta?: Program["meta"],
): Program {
  return {
    id,
    operations,
    ...(meta !== undefined && { meta }),
  };
}
