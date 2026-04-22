/* eslint-disable @typescript-eslint/no-explicit-any */
import { parseSync, printSync } from "@swc/core";
import type { Expression, Module, Program } from "@swc/core";

type StoreLeafPath = {
  mangled: string;
  path: string;
};

type StoreBinding = {
  leafPaths: Map<string, StoreLeafPath>;
};

type TransformState = {
  stores: Map<string, StoreBinding>;
  tempCounter: number;
};

export interface CompiledStoreTransformResult {
  code: string;
  map: string | null;
}

export function transformCompiledStore(
  code: string,
  id = "compiled-store.ts",
): CompiledStoreTransformResult {
  const ast = parseModule(code, id);
  const state: TransformState = {
    stores: collectStoreBindings(ast),
    tempCounter: 0,
  };
  const transformed = transformProgram(ast, state) as Program;
  const output = printSync(transformed, {
    filename: id,
    sourceMaps: true,
  });

  return {
    code: output.code,
    map: output.map ?? null,
  };
}

function parseModule(code: string, id: string): Module {
  const isTypeScript = /\.([cm]?ts)x?$/i.test(id);

  return parseSync(code, {
    syntax: isTypeScript ? "typescript" : "ecmascript",
    tsx: /\.([cm]?ts)x$/i.test(id),
    jsx: /\.([cm]?jsx)$/i.test(id),
    target: "es2022",
  });
}

function collectStoreBindings(program: Module): Map<string, StoreBinding> {
  const stores = new Map<string, StoreBinding>();

  for (const item of program.body) {
    if (item.type !== "VariableDeclaration") {
      continue;
    }

    for (const declaration of item.declarations ?? []) {
      const name =
        declaration.id?.type === "Identifier" ? declaration.id.value : null;
      const init = declaration.init;

      if (name === null || !isCreateStoreCall(init)) {
        continue;
      }

      const objectArg = (init as any).arguments?.[0]?.expression;
      if (objectArg?.type !== "ObjectExpression") {
        continue;
      }

      const leafPaths = new Map<string, StoreLeafPath>();
      collectLeafPaths(objectArg, leafPaths);
      stores.set(name, { leafPaths });
    }
  }

  return stores;
}

function transformProgram(program: Program, state: TransformState): Program {
  if (program.type !== "Module") {
    return program;
  }

  return {
    ...program,
    body: program.body.map((item) => transformModuleItem(item, state)),
  };
}

function transformModuleItem(item: any, state: TransformState): any {
  switch (item.type) {
    case "VariableDeclaration":
      return {
        ...item,
        declarations: item.declarations.map((declaration: any) =>
          transformVariableDeclarator(declaration, state),
        ),
      };
    case "ExpressionStatement":
      return {
        ...item,
        expression: transformExpression(item.expression, state),
      };
    default:
      return item;
  }
}

function transformVariableDeclarator(declaration: any, state: TransformState): any {
  if (declaration.init === undefined) {
    return declaration;
  }

  return {
    ...declaration,
    init: transformExpression(declaration.init, state),
  };
}

function transformExpression(node: Expression, state: TransformState): Expression {
  let result = node;
  const stack: TransformFrame[] = [
    {
      phase: "enter",
      node,
      assign(expression) {
        result = expression;
      },
    },
  ];

  while (stack.length > 0) {
    const frame = stack.pop();
    if (frame === undefined) {
      continue;
    }

    if (frame.phase === "exit") {
      frame.assign(finalizeExpression(frame.node, frame.slots, state));
      continue;
    }

    const expression = frame.node;
    const childCount = countTransformChildren(expression, state);

    if (childCount === 0) {
      frame.assign(finalizeExpression(expression, EMPTY_SLOTS, state));
      continue;
    }

    const slots = createSlots(childCount);
    stack.push({
      phase: "exit",
      node: expression,
      assign: frame.assign,
      slots,
    });
    pushExpressionChildren(expression, state, slots, stack);
  }

  return result;
}

function nextTemp(state: TransformState, label: string): string {
  state.tempCounter += 1;
  return `__${label}_${state.tempCounter}`;
}

function isCreateStoreCall(expression: any): expression is any {
  return (
    expression?.type === "CallExpression" &&
    expression.callee?.type === "Identifier" &&
    expression.callee.value === "createStore" &&
    expression.arguments?.length === 1
  );
}

function collectLeafPaths(
  rootObjectExpression: any,
  target: Map<string, StoreLeafPath>,
): void {
  const stack: Array<{ objectExpression: any; prefix: string[] }> = [
    { objectExpression: rootObjectExpression, prefix: [] },
  ];

  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) {
      continue;
    }

    for (const property of current.objectExpression.properties ?? []) {
      if (property.type !== "KeyValueProperty") {
        continue;
      }

      const key = getStaticPropertyKey(property.key);
      if (key === null) {
        continue;
      }

      const path = [...current.prefix, key];
      const value = property.value;

      if (value?.type === "ObjectExpression") {
        stack.push({ objectExpression: value, prefix: path });
        continue;
      }

      const joined = path.join(".");
      target.set(joined, {
        path: joined,
        mangled: path.join("_"),
      });
    }
  }
}

function getStaticPropertyKey(node: any): string | null {
  switch (node?.type) {
    case "Identifier":
      return node.value;
    case "StringLiteral":
      return node.value;
    case "NumericLiteral":
      return String(node.value);
    default:
      return null;
  }
}

function getLeafPathForMember(
  node: any,
  stores: ReadonlyMap<string, StoreBinding>,
): StoreLeafPath | null {
  const parts = collectStaticMemberPath(node);
  if (parts === null || parts.length < 2) {
    return null;
  }

  const [root, ...path] = parts;
  if (root === undefined) {
    return null;
  }

  const store = stores.get(root);
  if (!store) {
    return null;
  }

  return store.leafPaths.get(path.join(".")) ?? null;
}

function getLeafPathForTarget(
  node: any,
  stores: ReadonlyMap<string, StoreBinding>,
): StoreLeafPath | null {
  if (node?.type === "MemberExpression") {
    return getLeafPathForMember(node, stores);
  }

  if (
    node?.type === "SimpleAssignmentTarget" &&
    node.value?.type === "MemberExpression"
  ) {
    return getLeafPathForMember(node.value, stores);
  }

  return null;
}

function collectStaticMemberPath(node: any): string[] | null {
  const parts: string[] = [];
  let current = node;

  while (current?.type === "MemberExpression") {
    if (current.computed) {
      return null;
    }

    const property = current.property;
    if (property?.type !== "Identifier") {
      return null;
    }

    parts.unshift(property.value);
    current = current.object;
  }

  if (current?.type !== "Identifier") {
    return null;
  }

  parts.unshift(current.value);
  return parts;
}

function createReadCall(mangledPath: string): Expression {
  return createCallExpression(`__read_${mangledPath}`, []);
}

function createWriteCall(mangledPath: string, value: Expression): Expression {
  return createCallExpression(`__write_${mangledPath}`, [value]);
}

function createCompoundAssignment(
  mangledPath: string,
  operator: "+" | "-",
  right: Expression,
  rhsTemp: string,
  nextTempName: string,
): Expression {
  return createIIFE([
    createConstDeclaration(rhsTemp, right),
    createConstDeclaration(
      nextTempName,
      createBinaryExpression(
        createReadCall(mangledPath),
        operator,
        createIdentifierExpression(rhsTemp),
      ),
    ),
    createExpressionStatement(
      createWriteCall(mangledPath, createIdentifierExpression(nextTempName)),
    ),
    createReturnStatement(createIdentifierExpression(nextTempName)),
  ]);
}

function createUpdateExpressionLowering(
  mangledPath: string,
  operator: "+" | "-",
  tempName: string,
  prefix: boolean,
): Expression {
  if (prefix) {
    return createIIFE([
      createConstDeclaration(
        tempName,
        createBinaryExpression(
          createReadCall(mangledPath),
          operator,
          createNumericLiteral(1),
        ),
      ),
      createExpressionStatement(
        createWriteCall(mangledPath, createIdentifierExpression(tempName)),
      ),
      createReturnStatement(createIdentifierExpression(tempName)),
    ]);
  }

  return createIIFE([
    createConstDeclaration(tempName, createReadCall(mangledPath)),
    createExpressionStatement(
      createWriteCall(
        mangledPath,
        createBinaryExpression(
          createIdentifierExpression(tempName),
          operator,
          createNumericLiteral(1),
        ),
      ),
    ),
    createReturnStatement(createIdentifierExpression(tempName)),
  ]);
}

function createIdentifierExpression(name: string): Expression {
  return {
    type: "Identifier",
    span: DUMMY_SPAN,
    ctxt: 0,
    value: name,
    optional: false,
  } as any;
}

function createNumericLiteral(value: number): Expression {
  return {
    type: "NumericLiteral",
    span: DUMMY_SPAN,
    value,
    raw: String(value),
  } as any;
}

function createCallExpression(
  calleeName: string,
  args: Expression[],
): Expression {
  return {
    type: "CallExpression",
    span: DUMMY_SPAN,
    ctxt: 0,
    callee: createIdentifierExpression(calleeName),
    arguments: args.map((expression) => ({
      expression,
    })),
    typeArguments: undefined,
  } as any;
}

function createBinaryExpression(
  left: Expression,
  operator: "+" | "-",
  right: Expression,
): Expression {
  return {
    type: "BinaryExpression",
    span: DUMMY_SPAN,
    operator,
    left,
    right,
  } as any;
}

function createConstDeclaration(name: string, init: Expression): any {
  return {
    type: "VariableDeclaration",
    span: DUMMY_SPAN,
    ctxt: 0,
    kind: "const",
    declare: false,
    declarations: [
      {
        type: "VariableDeclarator",
        span: DUMMY_SPAN,
        definite: false,
        id: {
          type: "Identifier",
          span: DUMMY_SPAN,
          ctxt: 0,
          value: name,
          optional: false,
          typeAnnotation: undefined,
        },
        init,
      },
    ],
  };
}

function createExpressionStatement(expression: Expression): any {
  return {
    type: "ExpressionStatement",
    span: DUMMY_SPAN,
    expression,
  };
}

function createReturnStatement(argument: Expression): any {
  return {
    type: "ReturnStatement",
    span: DUMMY_SPAN,
    argument,
  };
}

function createIIFE(statements: any[]): Expression {
  return {
    type: "CallExpression",
    span: DUMMY_SPAN,
    ctxt: 0,
    callee: {
      type: "ParenthesisExpression",
      span: DUMMY_SPAN,
      expression: {
        type: "ArrowFunctionExpression",
        span: DUMMY_SPAN,
        ctxt: 0,
        params: [],
        body: {
          type: "BlockStatement",
          span: DUMMY_SPAN,
          ctxt: 0,
          stmts: statements,
        },
        async: false,
        generator: false,
        typeParameters: undefined,
        returnType: undefined,
      },
    },
    arguments: [],
    typeArguments: undefined,
  } as any;
}

type AssignExpression = (expression: Expression) => void;

type EnterFrame = {
  phase: "enter";
  node: Expression;
  assign: AssignExpression;
};

type ExitFrame = {
  phase: "exit";
  node: Expression;
  assign: AssignExpression;
  slots: Expression[];
};

type TransformFrame = EnterFrame | ExitFrame;
type ChildSpec = readonly [index: number, expression: Expression];

const EMPTY_SLOTS: Expression[] = [];
const SIMPLE_CHILDREN = new Set<Expression["type"]>([
  "BinaryExpression",
  "ParenthesisExpression",
  "UnaryExpression",
  "ConditionalExpression",
  "SequenceExpression",
  "TemplateLiteral",
]);

function createSlots(size: number): Expression[] {
  return new Array<Expression>(size);
}

function countTransformChildren(node: Expression, state: TransformState): number {
  switch (node.type) {
    case "AssignmentExpression":
      return 1;
    case "UpdateExpression":
      return getLeafPathForTarget(node.argument, state.stores) === null ? 1 : 0;
    case "MemberExpression":
      return 1;
    case "CallExpression":
      return getCallExpressionChildCount(node);
    default:
      return SIMPLE_CHILDREN.has(node.type) ? getSimpleChildSpecs(node).length : 0;
  }
}

function pushExpressionChildren(
  node: Expression,
  state: TransformState,
  slots: Expression[],
  stack: TransformFrame[],
): void {
  switch (node.type) {
    case "AssignmentExpression":
      pushChild(stack, node.right, slots, 0);
      return;
    case "UpdateExpression":
      if (getLeafPathForTarget(node.argument, state.stores) === null) {
        pushChild(stack, node.argument as Expression, slots, 0);
      }
      return;
    case "MemberExpression":
      pushChild(stack, node.object as Expression, slots, 0);
      return;
    case "CallExpression": {
      for (let argIndex = node.arguments.length - 1; argIndex >= 0; argIndex--) {
        const arg = node.arguments[argIndex];
        if (arg?.expression === undefined) {
          continue;
        }

        const slotIndex = getCallExpressionSlotIndex(node, argIndex, state);
        pushChild(stack, arg.expression, slots, slotIndex);
      }

      const index = getCallExpressionCalleeSlotIndex(node, state);
      if (index !== -1) {
        const calleeExpression = getCalleeExpression(node.callee);
        if (calleeExpression !== null) {
          pushChild(stack, calleeExpression, slots, index);
        }
      }
      return;
    }
    default:
      const specs = getSimpleChildSpecs(node);
      for (let i = specs.length - 1; i >= 0; i--) {
        const [index, expression] = specs[i]!;
        pushChild(stack, expression, slots, index);
      }
      return;
  }
}

function finalizeExpression(
  node: Expression,
  slots: Expression[],
  state: TransformState,
): Expression {
  switch (node.type) {
    case "AssignmentExpression":
      return finalizeAssignmentExpression(node, slots, state);
    case "UpdateExpression":
      return finalizeUpdateExpression(node, slots, state);
    case "MemberExpression":
      return finalizeMemberExpression(node, slots, state);
    case "CallExpression":
      return finalizeCallExpression(node, slots, state);
    default:
      return SIMPLE_CHILDREN.has(node.type) ? finalizeSimpleExpression(node, slots) : node;
  }
}

function getSimpleChildSpecs(node: Expression): ChildSpec[] {
  switch (node.type) {
    case "BinaryExpression":
      return [[0, node.left], [1, node.right]];
    case "ParenthesisExpression":
      return [[0, node.expression]];
    case "UnaryExpression":
      return [[0, node.argument]];
    case "ConditionalExpression":
      return [[0, node.test], [1, node.consequent], [2, node.alternate]];
    case "SequenceExpression":
    case "TemplateLiteral":
      return node.expressions.map((expression, index) => [index, expression] as const);
    default:
      return [];
  }
}

function finalizeSimpleExpression(node: Expression, slots: Expression[]): Expression {
  switch (node.type) {
    case "BinaryExpression":
      return { ...node, left: slots[0] ?? node.left, right: slots[1] ?? node.right } as Expression;
    case "ParenthesisExpression":
      return { ...node, expression: slots[0] ?? node.expression } as Expression;
    case "UnaryExpression":
      return { ...node, argument: slots[0] ?? node.argument } as Expression;
    case "ConditionalExpression":
      return {
        ...node,
        test: slots[0] ?? node.test,
        consequent: slots[1] ?? node.consequent,
        alternate: slots[2] ?? node.alternate,
      } as Expression;
    case "SequenceExpression":
    case "TemplateLiteral":
      return {
        ...node,
        expressions: node.expressions.map((expression, index) => slots[index] ?? expression),
      } as Expression;
    default:
      return node;
  }
}

function finalizeAssignmentExpression(
  node: any,
  slots: Expression[],
  state: TransformState,
): Expression {
  const leafPath = getLeafPathForTarget(node.left, state.stores);
  const right = slots[0] ?? node.right;

  if (leafPath === null) {
    return {
      ...node,
      right,
    } as Expression;
  }

  switch (node.operator) {
    case "=":
      return createWriteCall(leafPath.mangled, right);
    case "+=":
      return createCompoundAssignment(
        leafPath.mangled,
        "+",
        right,
        nextTemp(state, "rhs"),
        nextTemp(state, "next"),
      );
    case "-=":
      return createCompoundAssignment(
        leafPath.mangled,
        "-",
        right,
        nextTemp(state, "rhs"),
        nextTemp(state, "next"),
      );
    default:
      return {
        ...node,
        right,
      } as Expression;
  }
}

function finalizeUpdateExpression(
  node: any,
  slots: Expression[],
  state: TransformState,
): Expression {
  const leafPath = getLeafPathForTarget(node.argument, state.stores);

  if (leafPath === null) {
    return {
      ...node,
      argument: slots[0] ?? node.argument,
    } as Expression;
  }

  const operator =
    node.operator === "++" ? "+" : node.operator === "--" ? "-" : null;
  if (operator === null) {
    return node;
  }

  return createUpdateExpressionLowering(
    leafPath.mangled,
    operator,
    nextTemp(state, node.prefix ? "next" : "prev"),
    node.prefix,
  );
}

function finalizeMemberExpression(
  node: any,
  slots: Expression[],
  state: TransformState,
): Expression {
  const next = {
    ...node,
    object: slots[0] ?? node.object,
  };
  const leafPath = getLeafPathForMember(next, state.stores);

  if (leafPath === null) {
    return next as Expression;
  }

  return createReadCall(leafPath.mangled);
}

function finalizeCallExpression(
  node: any,
  slots: Expression[],
  state: TransformState,
): Expression {
  const nextArgs = node.arguments.map((arg: any, index: number) => {
    if (arg?.expression === undefined) {
      return arg;
    }

    const slotIndex = getCallExpressionSlotIndex(node, index, state);
    return {
      ...arg,
      expression: slotIndex === -1 ? arg.expression : slots[slotIndex] ?? arg.expression,
    };
  });

  const calleeSlotIndex = getCallExpressionCalleeSlotIndex(node, state);
  const calleeExpression = getCalleeExpression(node.callee);
  const nextCallee =
    calleeSlotIndex === -1 || calleeExpression === null
      ? node.callee
      : setCalleeExpression(node.callee, slots[calleeSlotIndex] ?? calleeExpression);

  return {
    ...node,
    callee: nextCallee,
    arguments: nextArgs,
  } as Expression;
}

function getCallExpressionChildCount(node: any): number {
  let count = 0;

  if (getCalleeExpression(node.callee) !== null) {
    count += 1;
  }

  for (const arg of node.arguments ?? []) {
    if (arg?.expression !== undefined) {
      count += 1;
    }
  }

  return count;
}

function getCallExpressionCalleeSlotIndex(node: any, _state: TransformState): number {
  return getCalleeExpression(node.callee) === null ? -1 : 0;
}

function getCallExpressionSlotIndex(
  node: any,
  argumentIndex: number,
  _state: TransformState,
): number {
  let index = getCallExpressionCalleeSlotIndex(node, _state) === -1 ? 0 : 1;

  for (let i = 0; i < argumentIndex; i++) {
    if (node.arguments[i]?.expression !== undefined) {
      index += 1;
    }
  }

  return node.arguments[argumentIndex]?.expression === undefined ? -1 : index;
}

function getCalleeExpression(callee: any): Expression | null {
  if (callee?.type === "Super") {
    return null;
  }

  if (callee?.type === "Expression") {
    return callee.expression as Expression;
  }

  return callee as Expression;
}

function setCalleeExpression(callee: any, expression: Expression): any {
  if (callee?.type === "Expression") {
    return {
      ...callee,
      expression,
    };
  }

  return expression;
}

function pushChild(
  stack: TransformFrame[],
  node: Expression,
  slots: Expression[],
  index: number,
): void {
  stack.push({
    phase: "enter",
    node,
    assign(expression) {
      slots[index] = expression;
    },
  });
}

const DUMMY_SPAN = {
  start: 0,
  end: 0,
  ctxt: 0,
};
