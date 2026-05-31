/* eslint-disable @typescript-eslint/no-explicit-any */
import { parseSync, printSync } from "@swc/core";
import type { Expression, Module, Program } from "@swc/core";

const STORE_MODULES = new Set([
  "@reflex/store",
  "@reflex/store/store",
  "@reflex/store/compiled-store",
]);

const DEFAULT_RUNTIME_MODULE = "@volynets/reflex";

type StoreLeafPath = {
  initial: Expression;
  mangled: string;
  path: string;
  parts: string[];
};

type StoreBinding = {
  name: string;
  branchPaths: Set<string>;
  leafPaths: Map<string, StoreLeafPath>;
  leaves: StoreLeafPath[];
};

type RuntimeNames = {
  createModel: string;
  signal: string;
};

type DiagnosticCode =
  | "dynamic-access"
  | "branch-alias"
  | "spread-reflection"
  | "delete"
  | "optional-chain";

type TransformState = {
  diagnostics: CompiledStoreDiagnostic[];
  options: Required<CompiledStoreTransformOptions>;
  runtimeNames: RuntimeNames;
  stores: Map<string, StoreBinding>;
  tempCounter: number;
};

export interface CompiledStoreDiagnostic {
  code: DiagnosticCode;
  message: string;
}

export interface CompiledStoreTransformOptions {
  /**
   * Emits the runtime import needed by generated code.
   *
   * Test harnesses can disable this and provide `__reflex_createModel` and
   * `__reflex_signal` in scope manually.
   */
  importRuntime?: boolean;
  /**
   * Runtime facade used by generated code.
   */
  runtimeModule?: string;
  /**
   * `throw` is the compiler default because unsupported store syntax should be
   * found during development, not discovered as a runtime semantic mismatch.
   */
  onDiagnostic?: "throw" | "collect";
}

export interface CompiledStoreTransformResult {
  code: string;
  diagnostics: CompiledStoreDiagnostic[];
  map: string | null;
}

export class CompiledStoreTransformError extends Error {
  readonly diagnostics: CompiledStoreDiagnostic[];

  constructor(diagnostics: CompiledStoreDiagnostic[]) {
    super(diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    this.name = "CompiledStoreTransformError";
    this.diagnostics = diagnostics;
  }
}

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
      runtimeModule: options.runtimeModule ?? DEFAULT_RUNTIME_MODULE,
    },
    runtimeNames: {
      createModel: "__reflex_createModel",
      signal: "__reflex_signal",
    },
    stores: collectStoreBindings(ast),
    tempCounter: 0,
  };

  scanUnsupportedStoreSyntax(ast, state);

  if (
    state.diagnostics.length > 0 &&
    state.options.onDiagnostic === "throw"
  ) {
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

export function transformCompiledStore(
  code: string,
  id = "compiled-store.ts",
  options: CompiledStoreTransformOptions = {},
): CompiledStoreTransformResult {
  return compileStore(code, id, options);
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

      const branchPaths = new Set<string>();
      const leafPaths = new Map<string, StoreLeafPath>();
      const leaves: StoreLeafPath[] = [];
      collectLeafPaths(objectArg, [], leafPaths, branchPaths, leaves);
      stores.set(name, { name, branchPaths, leafPaths, leaves });
    }
  }

  return stores;
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

function transformVariableDeclaration(
  item: any,
  state: TransformState,
): any[] {
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

function transformVariableDeclarator(declaration: any, state: TransformState): any {
  if (declaration.init === undefined) {
    return declaration;
  }

  return {
    ...declaration,
    init: transformExpression(declaration.init, state),
  };
}

function insertRuntimeImport(body: any[], state: TransformState): any[] {
  const source = [
    `import {`,
    `  createModel as ${state.runtimeNames.createModel},`,
    `  signal as ${state.runtimeNames.signal}`,
    `} from ${JSON.stringify(state.options.runtimeModule)};`,
  ].join("\n");
  const runtimeImport = parseModule(source, "compiled-store-runtime-import.ts")
    .body[0]!;
  const insertIndex = body.findIndex(
    (item) => item.type !== "ImportDeclaration",
  );
  const index = insertIndex === -1 ? body.length : insertIndex;

  return [
    ...body.slice(0, index),
    runtimeImport,
    ...body.slice(index),
  ];
}

function createCompiledStoreStatements(
  binding: StoreBinding,
  kind: "const" | "let" | "var",
  state: TransformState,
): any[] {
  const lines: string[] = [];

  for (const leaf of binding.leaves) {
    lines.push(
      `const [__read_${leaf.mangled}, __set_${leaf.mangled}] = ` +
        `${state.runtimeNames.signal}(${printExpression(leaf.initial)});`,
    );
    lines.push(`let __write_${leaf.mangled};`);
  }

  lines.push(`${kind} ${binding.name} = ${state.runtimeNames.createModel}((ctx) => {`);

  for (const leaf of binding.leaves) {
    lines.push(`  __write_${leaf.mangled} = ctx.action((value) => {`);
    lines.push(`    __set_${leaf.mangled}(value);`);
    lines.push(`    return value;`);
    lines.push(`  });`);
  }

  lines.push(`  return ${createStoreObjectSource(binding)};`);
  lines.push(`})();`);

  return parseModule(lines.join("\n"), "compiled-store-lowering.ts").body;
}

type StoreTreeNode = {
  branches: Map<string, StoreTreeNode>;
  leaves: Map<string, StoreLeafPath>;
};

function createStoreObjectSource(binding: StoreBinding): string {
  const root = createStoreTreeNode();

  for (const leaf of binding.leaves) {
    insertStoreLeaf(root, leaf.parts, leaf);
  }

  return createStoreTreeObjectSource(root, 2);
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
  indent: number,
): string {
  const pad = " ".repeat(indent);
  const childPad = " ".repeat(indent + 2);
  const entries: string[] = [];

  for (const [key, branch] of node.branches) {
    entries.push(
      `${childPad}${formatObjectKey(key)}: ${createStoreTreeObjectSource(
        branch,
        indent + 2,
      )}`,
    );
  }

  for (const [key, leaf] of node.leaves) {
    entries.push(
      [
        `${childPad}get ${formatObjectKey(key)}() {`,
        `${childPad}  return __read_${leaf.mangled}();`,
        `${childPad}},`,
        `${childPad}set ${formatObjectKey(key)}(value) {`,
        `${childPad}  __write_${leaf.mangled}(value);`,
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
  objectExpression: any,
  prefix: string[],
  target: Map<string, StoreLeafPath>,
  branches: Set<string>,
  leaves: StoreLeafPath[],
): void {
  for (const property of objectExpression.properties ?? []) {
    if (property.type !== "KeyValueProperty") {
      continue;
    }

    const key = getStaticPropertyKey(property.key);
    if (key === null) {
      continue;
    }

    const path = [...prefix, key];
    const value = property.value;

    if (value?.type === "ObjectExpression") {
      branches.add(path.join("."));
      collectLeafPaths(value, path, target, branches, leaves);
      continue;
    }

    const joined = path.join(".");
    const leaf = {
      initial: value,
      path: joined,
      parts: path,
      mangled: manglePath(path),
    };
    target.set(joined, leaf);
    leaves.push(leaf);
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

function manglePath(path: readonly string[]): string {
  return path.map(mangleIdentifierPart).join("_");
}

function mangleIdentifierPart(part: string): string {
  const mangled = part.replace(/[^A-Za-z0-9_$]/g, "_");
  return /^[0-9]/.test(mangled) ? `_${mangled}` : mangled;
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
      return SIMPLE_CHILDREN.has(node.type)
        ? finalizeSimpleExpression(node, slots)
        : node;
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

function scanUnsupportedStoreSyntax(
  program: Module,
  state: TransformState,
): void {
  if (state.stores.size === 0) {
    return;
  }

  visitNode(program, (node) => {
    if (node.type === "MemberExpression") {
      scanMemberExpression(node, state);
      return;
    }

    if (node.type === "VariableDeclarator") {
      scanVariableDeclarator(node, state);
      return;
    }

    if (node.type === "BinaryExpression" && node.operator === "in") {
      if (isStoreRootOrBranch(node.right, state)) {
        addDiagnostic(
          state,
          "spread-reflection",
          "Spread and reflection are not guaranteed for compiled stores in phase 1.",
        );
      }
      return;
    }

    if (node.type === "UnaryExpression" && node.operator === "delete") {
      if (isStoreRootOrBranch(node.argument, state)) {
        addDiagnostic(
          state,
          "delete",
          "Deleting compiled-store paths is not supported in phase 1.",
        );
      }
      return;
    }

    if (node.type === "CallExpression") {
      scanCallExpression(node, state);
      return;
    }

    if (node.type === "ObjectExpression") {
      scanObjectExpression(node, state);
      return;
    }

    if (node.type === "OptionalChainingExpression" || node.type === "OptChainExpression") {
      addDiagnostic(
        state,
        "optional-chain",
        "Optional chaining on compiled stores is not supported in phase 1.",
      );
    }
  });
}

function scanMemberExpression(node: any, state: TransformState): void {
  const root = getMemberRootIdentifier(node);
  if (root === null || !state.stores.has(root)) {
    return;
  }

  if (hasDynamicMemberAccess(node)) {
    addDiagnostic(
      state,
      "dynamic-access",
      "Dynamic compiled-store access is not supported in phase 1.",
    );
  }
}

function scanVariableDeclarator(node: any, state: TransformState): void {
  if (node.id?.type === "ObjectPattern" && isStoreRootOrBranch(node.init, state)) {
    addDiagnostic(
      state,
      "spread-reflection",
      "Spread and reflection are not guaranteed for compiled stores in phase 1.",
    );
    return;
  }

  if (node.id?.type !== "Identifier") {
    return;
  }

  if (isStoreBranchMember(node.init, state)) {
    addDiagnostic(
      state,
      "branch-alias",
      "Aliasing nested compiled-store branches is not supported in phase 1.",
    );
  }
}

function scanCallExpression(node: any, state: TransformState): void {
  const calleePath = collectStaticMemberPath(node.callee);
  if (calleePath === null) {
    return;
  }

  const [root, method] = calleePath;
  const arg = node.arguments?.[0]?.expression;
  const isReflection =
    (root === "Object" &&
      (method === "keys" ||
        method === "values" ||
        method === "entries" ||
        method === "getOwnPropertyNames" ||
        method === "getOwnPropertySymbols")) ||
    (root === "Reflect" && method === "ownKeys");

  if (isReflection && isStoreRootOrBranch(arg, state)) {
    addDiagnostic(
      state,
      "spread-reflection",
      "Spread and reflection are not guaranteed for compiled stores in phase 1.",
    );
  }
}

function scanObjectExpression(node: any, state: TransformState): void {
  for (const property of node.properties ?? []) {
    if (
      property.type === "SpreadElement" &&
      isStoreRootOrBranch(property.arguments ?? property.expression, state)
    ) {
      addDiagnostic(
        state,
        "spread-reflection",
        "Spread and reflection are not guaranteed for compiled stores in phase 1.",
      );
    }
  }
}

function isStoreRootOrBranch(node: any, state: TransformState): boolean {
  if (node?.type === "Identifier") {
    return state.stores.has(node.value);
  }

  return isStoreBranchMember(node, state);
}

function isStoreBranchMember(node: any, state: TransformState): boolean {
  const parts = collectStaticMemberPath(node);
  if (parts === null || parts.length < 2) {
    return false;
  }

  const [root, ...path] = parts;
  if (root === undefined) {
    return false;
  }

  const binding = state.stores.get(root);
  if (binding === undefined) {
    return false;
  }

  const joined = path.join(".");
  return binding.branchPaths.has(joined);
}

function getMemberRootIdentifier(node: any): string | null {
  let current = node;

  while (current?.type === "MemberExpression") {
    current = current.object;
  }

  return current?.type === "Identifier" ? current.value : null;
}

function hasDynamicMemberAccess(node: any): boolean {
  let current = node;

  while (current?.type === "MemberExpression") {
    if (current.computed || current.property?.type === "Computed") {
      return true;
    }
    current = current.object;
  }

  return false;
}

function addDiagnostic(
  state: TransformState,
  code: DiagnosticCode,
  message: string,
): void {
  if (
    state.diagnostics.some(
      (diagnostic) => diagnostic.code === code && diagnostic.message === message,
    )
  ) {
    return;
  }

  state.diagnostics.push({ code, message });
}

function visitNode(node: any, visit: (node: any) => void): void {
  if (node === null || typeof node !== "object") {
    return;
  }

  if (typeof node.type === "string") {
    visit(node);
  }

  for (const key of Object.keys(node)) {
    if (
      key === "span" ||
      key === "ctxt" ||
      key === "type" ||
      key === "raw"
    ) {
      continue;
    }

    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        visitNode(child, visit);
      }
      continue;
    }

    visitNode(value, visit);
  }
}

const DUMMY_SPAN = {
  start: 0,
  end: 0,
  ctxt: 0,
};
