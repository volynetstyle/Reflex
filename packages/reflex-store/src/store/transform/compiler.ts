/* eslint-disable @typescript-eslint/no-explicit-any */
import { printSync } from "@swc/core";
import type { Expression, Program } from "@swc/core";
import { collectStaticMemberPath, DUMMY_SPAN, parseModule } from "./ast";
import { collectStoreBindings } from "./bindings";
import {
  CompiledStoreTransformError,
  type CompiledStoreTransformOptions,
  type CompiledStoreTransformResult,
  type CompiledStoreLoweringTarget,
  type StoreBinding,
  type StoreLeafPath,
  type TransformState,
} from "./contracts";
import { scanUnsupportedStoreSyntax } from "./diagnostics";

const STORE_MODULES = new Set([
  "@volynets/reflex-store",
  "@volynets/reflex-store/store",
  "@volynets/reflex-store/compiled-store",
  "@reflex/store",
  "@reflex/store/store",
  "@reflex/store/compiled-store",
]);

const DEFAULT_RUNTIME_MODULE = "@volynets/reflex";

const DEFAULT_LOWERING_TARGET: CompiledStoreLoweringTarget = {
  runtimeModule: DEFAULT_RUNTIME_MODULE,
  model: {
    exportName: "createModel",
    localName: "__reflex_createModel",
    actionMethod: "action",
  },
  signal: {
    exportName: "signal",
    localName: "__reflex_signal",
  },
  identifiers: {
    context: "ctx",
    value: "value",
    read: ({ mangledPath }) => `__read_${mangledPath}`,
    set: ({ mangledPath }) => `__set_${mangledPath}`,
    write: ({ mangledPath }) => `__write_${mangledPath}`,
    temporary: ({ index, label }) => `__${label}_${index}`,
  },
};

export function compileStore(
  code: string,
  id = "compiled-store.ts",
  options: CompiledStoreTransformOptions = {},
): CompiledStoreTransformResult {
  const ast = parseModule(code, id);
  const state: TransformState = {
    diagnostics: [],
    options: {
      importRuntime: options.importRuntime ?? true,
      onDiagnostic: options.onDiagnostic ?? "throw",
    },
    target: resolveLoweringTarget(options),
    stores: collectStoreBindings(ast),
    tempCounter: 0,
  };

  scanUnsupportedStoreSyntax(ast, state);

  if (state.diagnostics.length > 0 && state.options.onDiagnostic === "throw") {
    throw new CompiledStoreTransformError(state.diagnostics);
  }

  const transformed = transformProgram(ast, state) as Program;
  const output = printSync(transformed, {
    filename: id,
    sourceMaps: true,
  });

  return {
    code: output.code,
    diagnostics: [...state.diagnostics],
    map: output.map ?? null,
  };
}

function resolveLoweringTarget(
  options: CompiledStoreTransformOptions,
): CompiledStoreLoweringTarget {
  const target = options.loweringTarget;
  return {
    runtimeModule:
      target?.runtimeModule ?? options.runtimeModule ?? DEFAULT_RUNTIME_MODULE,
    model: { ...DEFAULT_LOWERING_TARGET.model, ...target?.model },
    signal: { ...DEFAULT_LOWERING_TARGET.signal, ...target?.signal },
    identifiers: {
      ...DEFAULT_LOWERING_TARGET.identifiers,
      ...target?.identifiers,
    },
  };
}

export function transformCompiledStore(
  code: string,
  id = "compiled-store.ts",
  options: CompiledStoreTransformOptions = {},
): CompiledStoreTransformResult {
  return compileStore(code, id, options);
}

function transformProgram(program: Program, state: TransformState): Program {
  if (program.type !== "Module") {
    return program;
  }

  let body = program.body.flatMap((item) => transformModuleItem(item, state));

  if (state.stores.size > 0 && state.options.importRuntime) {
    body = insertRuntimeImport(body, state);
  }

  return {
    ...program,
    body,
  };
}

function transformModuleItem(item: any, state: TransformState): any[] {
  switch (item.type) {
    case "ImportDeclaration":
      return transformImportDeclaration(item);
    case "VariableDeclaration":
      return transformVariableDeclaration(item, state);
    case "ExpressionStatement":
      return [
        {
          ...item,
          expression: transformExpression(item.expression, state),
        },
      ];
    default:
      return [item];
  }
}

function transformImportDeclaration(item: any): any[] {
  if (!STORE_MODULES.has(item.source?.value)) {
    return [item];
  }

  const specifiers = (item.specifiers ?? []).filter(
    (specifier: any) => !isCreateStoreImportSpecifier(specifier),
  );

  if (specifiers.length === 0) {
    return [];
  }

  return [{ ...item, specifiers }];
}

function isCreateStoreImportSpecifier(specifier: any): boolean {
  switch (specifier.type) {
    case "ImportSpecifier": {
      const imported = specifier.imported;
      const importedName =
        imported?.type === "Identifier" || imported?.type === "StringLiteral"
          ? imported.value
          : undefined;
      return (importedName ?? specifier.local?.value) === "createStore";
    }
    case "ImportDefaultSpecifier":
    case "ImportNamespaceSpecifier":
      return specifier.local?.value === "createStore";
    default:
      return false;
  }
}

function transformVariableDeclaration(item: any, state: TransformState): any[] {
  const output: any[] = [];
  let pending: any[] = [];

  const flushPending = () => {
    if (pending.length === 0) {
      return;
    }

    output.push({
      ...item,
      declarations: pending,
    });
    pending = [];
  };

  for (const declaration of item.declarations ?? []) {
    const name =
      declaration.id?.type === "Identifier" ? declaration.id.value : null;
    const binding = name === null ? undefined : state.stores.get(name);

    if (binding === undefined) {
      pending.push(transformVariableDeclarator(declaration, state));
      continue;
    }

    flushPending();
    output.push(...createCompiledStoreStatements(binding, item.kind, state));
  }

  flushPending();
  return output;
}

function transformVariableDeclarator(
  declaration: any,
  state: TransformState,
): any {
  if (declaration.init === undefined) {
    return declaration;
  }

  return {
    ...declaration,
    init: transformExpression(declaration.init, state),
  };
}

function insertRuntimeImport(body: any[], state: TransformState): any[] {
  const { model, runtimeModule, signal } = state.target;
  const source = [
    `import {`,
    `  ${model.exportName} as ${model.localName},`,
    `  ${signal.exportName} as ${signal.localName}`,
    `} from ${JSON.stringify(runtimeModule)};`,
  ].join("\n");
  const runtimeImport = parseModule(source, "compiled-store-runtime-import.ts")
    .body[0]!;
  const insertIndex = body.findIndex(
    (item) => item.type !== "ImportDeclaration",
  );
  const index = insertIndex === -1 ? body.length : insertIndex;

  return [...body.slice(0, index), runtimeImport, ...body.slice(index)];
}

function createCompiledStoreStatements(
  binding: StoreBinding,
  kind: "const" | "let" | "var",
  state: TransformState,
): any[] {
  const lines: string[] = [];
  const { identifiers, model, signal } = state.target;

  for (const leaf of binding.leaves) {
    const names = getLeafNames(leaf, state);
    lines.push(
      `const ${names.read} = ` +
        `${signal.localName}(${printExpression(leaf.initial)});`,
    );
    lines.push(`let ${names.write};`);
  }

  lines.push(
    `${kind} ${binding.name} = ${model.localName}` +
      `((${identifiers.context}) => {`,
  );

  for (const leaf of binding.leaves) {
    const names = getLeafNames(leaf, state);
    const action = formatMemberAccess(identifiers.context, model.actionMethod);
    lines.push(`  ${names.write} = ${action}((${identifiers.value}) => {`);
    lines.push(`    ${names.read}.set(${identifiers.value});`);
    lines.push(`    return ${identifiers.value};`);
    lines.push(`  });`);
  }

  lines.push(`  return ${createStoreObjectSource(binding, state)};`);
  lines.push(`})();`);

  return parseModule(lines.join("\n"), "compiled-store-lowering.ts").body;
}

type StoreTreeNode = {
  branches: Map<string, StoreTreeNode>;
  leaves: Map<string, StoreLeafPath>;
};

function createStoreObjectSource(
  binding: StoreBinding,
  state: TransformState,
): string {
  const root = createStoreTreeNode();

  for (const leaf of binding.leaves) {
    insertStoreLeaf(root, leaf.parts, leaf);
  }

  return createStoreTreeObjectSource(root, state, 2);
}

function createStoreTreeNode(): StoreTreeNode {
  return {
    branches: new Map(),
    leaves: new Map(),
  };
}

function insertStoreLeaf(
  node: StoreTreeNode,
  parts: readonly string[],
  leaf: StoreLeafPath,
): void {
  const [head, ...tail] = parts;
  if (head === undefined) {
    return;
  }

  if (tail.length === 0) {
    node.leaves.set(head, leaf);
    return;
  }

  let branch = node.branches.get(head);
  if (branch === undefined) {
    branch = createStoreTreeNode();
    node.branches.set(head, branch);
  }
  insertStoreLeaf(branch, tail, leaf);
}

function createStoreTreeObjectSource(
  node: StoreTreeNode,
  state: TransformState,
  indent: number,
): string {
  const pad = " ".repeat(indent);
  const childPad = " ".repeat(indent + 2);
  const entries: string[] = [];

  for (const [key, branch] of node.branches) {
    entries.push(
      `${childPad}${formatObjectKey(key)}: ${createStoreTreeObjectSource(
        branch,
        state,
        indent + 2,
      )}`,
    );
  }

  for (const [key, leaf] of node.leaves) {
    const names = getLeafNames(leaf, state);
    entries.push(
      [
        `${childPad}get ${formatObjectKey(key)}() {`,
        `${childPad}  return ${names.read}();`,
        `${childPad}},`,
        `${childPad}set ${formatObjectKey(key)}(${state.target.identifiers.value}) {`,
        `${childPad}  ${names.write}(${state.target.identifiers.value});`,
        `${childPad}}`,
      ].join("\n"),
    );
  }

  if (entries.length === 0) {
    return "{}";
  }

  return `{\n${entries.join(",\n")}\n${pad}}`;
}

function formatObjectKey(key: string): string {
  return isIdentifierName(key) ? key : JSON.stringify(key);
}

function formatMemberAccess(object: string, property: string): string {
  return isIdentifierName(property)
    ? `${object}.${property}`
    : `${object}[${JSON.stringify(property)}]`;
}

function getLeafNames(leaf: StoreLeafPath, state: TransformState) {
  const context = { path: leaf.parts, mangledPath: leaf.mangled };
  return {
    read: state.target.identifiers.read(context),
    set: state.target.identifiers.set(context),
    write: state.target.identifiers.write(context),
  };
}

function printExpression(expression: Expression): string {
  const output = printSync(
    {
      type: "Module",
      span: DUMMY_SPAN,
      body: [
        {
          type: "ExpressionStatement",
          span: DUMMY_SPAN,
          expression,
        },
      ],
      interpreter: null,
    } as any,
    {
      sourceMaps: false,
    },
  ).code.trim();

  return output.endsWith(";") ? output.slice(0, -1) : output;
}

function transformExpression(
  node: Expression,
  state: TransformState,
): Expression {
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
  return state.target.identifiers.temporary({
    index: state.tempCounter,
    label,
  });
}

function isIdentifierName(value: string): boolean {
  return /^[$A-Z_a-z][$\w]*$/.test(value);
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

function createReadCall(
  leaf: StoreLeafPath,
  state: TransformState,
): Expression {
  return createCallExpression(getLeafNames(leaf, state).read, []);
}

function createWriteCall(
  leaf: StoreLeafPath,
  value: Expression,
  state: TransformState,
): Expression {
  return createCallExpression(getLeafNames(leaf, state).write, [value]);
}

function createCompoundAssignment(
  leaf: StoreLeafPath,
  operator: "+" | "-",
  right: Expression,
  rhsTemp: string,
  nextTempName: string,
  state: TransformState,
): Expression {
  return createIIFE([
    createConstDeclaration(rhsTemp, right),
    createConstDeclaration(
      nextTempName,
      createBinaryExpression(
        createReadCall(leaf, state),
        operator,
        createIdentifierExpression(rhsTemp),
      ),
    ),
    createExpressionStatement(
      createWriteCall(leaf, createIdentifierExpression(nextTempName), state),
    ),
    createReturnStatement(createIdentifierExpression(nextTempName)),
  ]);
}

function createUpdateExpressionLowering(
  leaf: StoreLeafPath,
  operator: "+" | "-",
  tempName: string,
  prefix: boolean,
  state: TransformState,
): Expression {
  if (prefix) {
    return createIIFE([
      createConstDeclaration(
        tempName,
        createBinaryExpression(
          createReadCall(leaf, state),
          operator,
          createNumericLiteral(1),
        ),
      ),
      createExpressionStatement(
        createWriteCall(leaf, createIdentifierExpression(tempName), state),
      ),
      createReturnStatement(createIdentifierExpression(tempName)),
    ]);
  }

  return createIIFE([
    createConstDeclaration(tempName, createReadCall(leaf, state)),
    createExpressionStatement(
      createWriteCall(
        leaf,
        createBinaryExpression(
          createIdentifierExpression(tempName),
          operator,
          createNumericLiteral(1),
        ),
        state,
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

function countTransformChildren(
  node: Expression,
  state: TransformState,
): number {
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
      return SIMPLE_CHILDREN.has(node.type)
        ? getSimpleChildSpecs(node).length
        : 0;
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
      for (
        let argIndex = node.arguments.length - 1;
        argIndex >= 0;
        argIndex--
      ) {
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
      return SIMPLE_CHILDREN.has(node.type)
        ? finalizeSimpleExpression(node, slots)
        : node;
  }
}

function getSimpleChildSpecs(node: Expression): ChildSpec[] {
  switch (node.type) {
    case "BinaryExpression":
      return [
        [0, node.left],
        [1, node.right],
      ];
    case "ParenthesisExpression":
      return [[0, node.expression]];
    case "UnaryExpression":
      return [[0, node.argument]];
    case "ConditionalExpression":
      return [
        [0, node.test],
        [1, node.consequent],
        [2, node.alternate],
      ];
    case "SequenceExpression":
    case "TemplateLiteral":
      return node.expressions.map(
        (expression, index) => [index, expression] as const,
      );
    default:
      return [];
  }
}

function finalizeSimpleExpression(
  node: Expression,
  slots: Expression[],
): Expression {
  switch (node.type) {
    case "BinaryExpression":
      return {
        ...node,
        left: slots[0] ?? node.left,
        right: slots[1] ?? node.right,
      } as Expression;
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
        expressions: node.expressions.map(
          (expression, index) => slots[index] ?? expression,
        ),
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
      return createWriteCall(leafPath, right, state);
    case "+=":
      return createCompoundAssignment(
        leafPath,
        "+",
        right,
        nextTemp(state, "rhs"),
        nextTemp(state, "next"),
        state,
      );
    case "-=":
      return createCompoundAssignment(
        leafPath,
        "-",
        right,
        nextTemp(state, "rhs"),
        nextTemp(state, "next"),
        state,
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
    leafPath,
    operator,
    nextTemp(state, node.prefix ? "next" : "prev"),
    node.prefix,
    state,
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

  return createReadCall(leafPath, state);
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
      expression:
        slotIndex === -1
          ? arg.expression
          : (slots[slotIndex] ?? arg.expression),
    };
  });

  const calleeSlotIndex = getCallExpressionCalleeSlotIndex(node, state);
  const calleeExpression = getCalleeExpression(node.callee);
  const nextCallee =
    calleeSlotIndex === -1 || calleeExpression === null
      ? node.callee
      : setCalleeExpression(
          node.callee,
          slots[calleeSlotIndex] ?? calleeExpression,
        );

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

function getCallExpressionCalleeSlotIndex(
  node: any,
  _state: TransformState,
): number {
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
