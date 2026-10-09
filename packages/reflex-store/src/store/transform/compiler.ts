/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Expression, Program } from "@swc/wasm";
import {
  collectStaticMemberPath,
  DUMMY_SPAN,
  parseModule,
  printModule as printSync,
  visitNode,
} from "./ast";
import {
  collectStoreBindings,
  collectFactoryNames,
  pathKey,
  bindingKey,
  memberRoot,
} from "./bindings";
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
  "@volynets/reflex-store/advanced",
  "@reflex/store",
  "@reflex/store/store",
  "@reflex/store/compiled-store",
  "@reflex/store/advanced",
]);

const DEFAULT_RUNTIME_MODULE = "@volynets/reflex-store/runtime";

const DEFAULT_LOWERING_TARGET: CompiledStoreLoweringTarget = {
  runtimeModule: DEFAULT_RUNTIME_MODULE,
  scope: {
    exportName: "createStoreScope",
    localName: "__reflex_createStoreScope",
    actionMethod: "action",
  },
  signal: {
    runtimeModule: "@volynets/reflex-store/runtime/internal",
    exportName: "createStoreCell",
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
  const identifiers = new Set<string>();
  visitNode(ast, (node) => {
    if (node.type === "Identifier") identifiers.add(node.value);
  });
  const factoryNames = collectFactoryNames(ast);
  const diagnostics: CompiledStoreTransformResult["diagnostics"] = [];
  const state: TransformState = {
    diagnostics,
    options: {
      importRuntime: options.importRuntime ?? true,
      eraseFacade: options.eraseFacade ?? false,
      onDiagnostic: options.onDiagnostic ?? "throw",
    },
    target: resolveLoweringTarget(options),
    stores: collectStoreBindings(ast, diagnostics),
    tempCounter: 0,
    identifiers,
    factoryNames,
  };

  state.target.scope.localName = allocateName(
    state.target.scope.localName,
    state,
  );
  state.target.signal.localName = allocateName(
    state.target.signal.localName,
    state,
  );
  state.target.identifiers.context = allocateName(
    state.target.identifiers.context,
    state,
  );
  state.target.identifiers.value = allocateName(
    state.target.identifiers.value,
    state,
  );
  const hasGetters = [...state.stores.values()].some(
    (store) => store.getters.length > 0,
  );
  if (hasGetters) {
    state.computedName = allocateName(
      "__reflex_createDisposableComputed",
      state,
    );
  }
  const defaultScope =
    state.target.runtimeModule === DEFAULT_RUNTIME_MODULE &&
    state.target.scope.exportName === "createStoreScope";
  if (!defaultScope) {
    for (const store of state.stores.values()) {
      if (store.methods.length > 0 || store.getters.length > 0) {
        state.diagnostics.push({
          code: "unsupported-shape",
          message:
            "Compiled store methods and getters require the default Store scope lowering target.",
        });
      }
    }
  }
  scanUnsupportedStoreSyntax(ast, state);

  for (const store of state.stores.values()) {
    for (const member of [...store.methods, ...store.getters]) {
      scanUnsupportedStoreSyntax(
        {
          ...ast,
          body: [
            ...ast.body.filter((item) => item.type === "ImportDeclaration"),
            {
              type: "ExpressionStatement",
              span: DUMMY_SPAN,
              expression: rewriteStoreThis(member.fn, store),
            },
          ],
        } as any,
        state,
      );
    }
  }

  if (state.diagnostics.length > 0 && state.options.onDiagnostic === "throw") {
    throw new CompiledStoreTransformError(state.diagnostics);
  }

  if (state.diagnostics.length > 0)
    return { code, diagnostics: [...state.diagnostics], map: null };

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
    scope: {
      ...DEFAULT_LOWERING_TARGET.scope,
      ...(target?.model ? { curried: true } : {}),
      ...target?.model,
      ...target?.scope,
    },
    signal: {
      ...(target?.runtimeModule ||
      options.runtimeModule ||
      target?.signal?.exportName
        ? { exportName: "signal", localName: "__reflex_signal" }
        : DEFAULT_LOWERING_TARGET.signal),
      ...target?.signal,
    },
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
      return transformImportDeclaration(item, state);
    case "VariableDeclaration":
      return transformVariableDeclaration(item, state);
    case "ExpressionStatement":
      return [
        {
          ...item,
          expression: transformExpression(item.expression, state),
        },
      ];
    case "FunctionDeclaration":
      return [transformFunctionDeclaration(item, state)];
    case "ExportDeclaration":
      return [
        {
          ...item,
          declaration:
            item.declaration?.type === "FunctionDeclaration"
              ? transformFunctionDeclaration(item.declaration, state)
              : transformNestedFunctions(item.declaration, state),
        },
      ];
    case "ExportDefaultDeclaration":
      return [
        {
          ...item,
          decl: transformNestedFunctions(item.decl, state),
        },
      ];
    case "ExportDefaultExpression":
      return [
        {
          ...item,
          expression: transformExpression(item.expression, state),
        },
      ];
    default:
      return [transformNestedFunctions(item, state)];
  }
}

function transformBlockStatement(block: any, state: TransformState): any {
  return {
    ...block,
    stmts: (block.stmts ?? []).flatMap((statement: any) =>
      transformStatement(statement, state),
    ),
  };
}

function transformFunctionDeclaration(
  declaration: any,
  state: TransformState,
): any {
  return {
    ...declaration,
    body: transformBlockStatement(declaration.body, state),
  };
}

function transformNestedFunctions(node: any, state: TransformState): any {
  if (node === null || typeof node !== "object") return node;
  if (Array.isArray(node)) {
    return node.map((child) => transformNestedFunctions(child, state));
  }
  if (node.type === "FunctionDeclaration") {
    return transformFunctionDeclaration(node, state);
  }
  if (
    node.type === "FunctionExpression" ||
    node.type === "ArrowFunctionExpression"
  ) {
    return transformExpression(node, state);
  }
  if (node.type === "BlockStatement") {
    return transformBlockStatement(node, state);
  }

  const transformed: Record<string, unknown> = { ...node };
  for (const key of Object.keys(node)) {
    if (key === "span" || key === "ctxt" || key === "type" || key === "raw") {
      continue;
    }
    const value = node[key];
    if (Array.isArray(value)) {
      transformed[key] = value.map((child) =>
        transformNestedFunctions(child, state),
      );
    } else if (value !== null && typeof value === "object") {
      transformed[key] = transformNestedFunctions(value, state);
    }
  }
  return transformed;
}

function transformSingleStatement(statement: any, state: TransformState): any {
  const transformed = transformStatement(statement, state);
  if (transformed.length === 1) return transformed[0];
  return {
    type: "BlockStatement",
    span: statement.span,
    ctxt: statement.ctxt,
    stmts: transformed,
  };
}

function transformStatement(statement: any, state: TransformState): any[] {
  switch (statement?.type) {
    case "VariableDeclaration":
      return transformVariableDeclaration(statement, state);
    case "ExpressionStatement":
      return [
        {
          ...statement,
          expression: transformExpression(statement.expression, state),
        },
      ];
    case "ReturnStatement":
    case "ThrowStatement":
      return [
        {
          ...statement,
          argument: statement.argument
            ? transformExpression(statement.argument, state)
            : statement.argument,
        },
      ];
    case "BlockStatement":
      return [transformBlockStatement(statement, state)];
    case "FunctionDeclaration":
      return [transformFunctionDeclaration(statement, state)];
    case "IfStatement":
      return [
        {
          ...statement,
          test: transformExpression(statement.test, state),
          consequent: transformSingleStatement(statement.consequent, state),
          alternate: statement.alternate
            ? transformSingleStatement(statement.alternate, state)
            : statement.alternate,
        },
      ];
    case "WhileStatement":
    case "DoWhileStatement":
      return [
        {
          ...statement,
          test: transformExpression(statement.test, state),
          body: transformSingleStatement(statement.body, state),
        },
      ];
    case "ForStatement":
      return [
        {
          ...statement,
          init:
            statement.init?.type === "VariableDeclaration"
              ? (transformVariableDeclaration(statement.init, state)[0] ??
                statement.init)
              : statement.init
                ? transformExpression(statement.init, state)
                : statement.init,
          test: statement.test
            ? transformExpression(statement.test, state)
            : statement.test,
          update: statement.update
            ? transformExpression(statement.update, state)
            : statement.update,
          body: transformSingleStatement(statement.body, state),
        },
      ];
    case "ForInStatement":
    case "ForOfStatement":
      return [
        {
          ...statement,
          right: transformExpression(statement.right, state),
          body: transformSingleStatement(statement.body, state),
        },
      ];
    case "LabeledStatement":
      return [
        {
          ...statement,
          body: transformSingleStatement(statement.body, state),
        },
      ];
    case "WithStatement":
      return [
        {
          ...statement,
          object: transformExpression(statement.object, state),
          body: transformSingleStatement(statement.body, state),
        },
      ];
    case "TryStatement":
      return [
        {
          ...statement,
          block: transformBlockStatement(statement.block, state),
          handler: statement.handler
            ? {
                ...statement.handler,
                body: transformBlockStatement(statement.handler.body, state),
              }
            : statement.handler,
          finalizer: statement.finalizer
            ? transformBlockStatement(statement.finalizer, state)
            : statement.finalizer,
        },
      ];
    case "SwitchStatement":
      return [
        {
          ...statement,
          discriminant: transformExpression(statement.discriminant, state),
          cases: (statement.cases ?? []).map((item: any) => ({
            ...item,
            test: item.test ? transformExpression(item.test, state) : item.test,
            consequent: (item.consequent ?? []).flatMap((child: any) =>
              transformStatement(child, state),
            ),
          })),
        },
      ];
    default:
      return [statement];
  }
}

function transformImportDeclaration(item: any, state: TransformState): any[] {
  if (!STORE_MODULES.has(item.source?.value)) {
    return [item];
  }

  const specifiers = (item.specifiers ?? []).filter(
    (specifier: any) => !state.factoryNames.has(bindingKey(specifier.local)),
  );

  if (specifiers.length === 0) {
    return [];
  }

  return [{ ...item, specifiers }];
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
    const binding =
      name === null ? undefined : state.stores.get(bindingKey(declaration.id));

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
  const { scope, runtimeModule, signal } = state.target;
  const signalModule = signal.runtimeModule ?? runtimeModule;
  const runtimeNames = [scope.exportName + " as " + scope.localName];
  if (state.computedName)
    runtimeNames.push("createDisposableComputed as " + state.computedName);
  if (signalModule === runtimeModule)
    runtimeNames.push(signal.exportName + " as " + signal.localName);
  let source =
    "import { " +
    runtimeNames.join(", ") +
    " } from " +
    JSON.stringify(runtimeModule) +
    ";";
  if (signalModule !== runtimeModule) {
    source +=
      "\nimport { " +
      signal.exportName +
      " as " +
      signal.localName +
      " } from " +
      JSON.stringify(signalModule) +
      ";";
  }
  const imports = parseModule(source, "compiled-store-runtime-import.ts").body;
  const insertIndex = body.findIndex(
    (item) => item.type !== "ImportDeclaration",
  );
  const index = insertIndex === -1 ? body.length : insertIndex;
  return [...body.slice(0, index), ...imports, ...body.slice(index)];
}
function createCompiledStoreStatements(
  binding: StoreBinding,
  kind: "const" | "let" | "var",
  state: TransformState,
): any[] {
  const lines: string[] = [];
  const { identifiers, scope, signal } = state.target;
  const defaultScope =
    state.target.runtimeModule === DEFAULT_RUNTIME_MODULE &&
    scope.exportName === "createStoreScope";
  const scopeName = defaultScope ? nextTemp(state, "scope") : binding.name;
  const emitFacade =
    defaultScope && (!state.options.eraseFacade || binding.needsFacade);

  if (emitFacade) binding.lifetimeName ??= allocateName("__store_alive", state);

  for (const method of binding.methods) {
    method.internalName ??= allocateName(
      "__store_method_" + method.key.replace(/[^A-Za-z0-9_$]/g, "_"),
      state,
    );
  }
  for (const getter of binding.getters) {
    getter.internalName ??= allocateName(
      "__store_getter_" + getter.key.replace(/[^A-Za-z0-9_$]/g, "_"),
      state,
    );
  }

  for (const leaf of binding.leaves) {
    const names = getLeafNames(leaf, state);
    lines.push(
      defaultScope
        ? "let " + names.read + ";"
        : "const " +
            names.read +
            " = " +
            createCellSource(leaf, binding, state) +
            ";",
    );
    lines.push("let " + names.write + ";");
  }

  lines.push(
    kind +
      " " +
      scopeName +
      " = " +
      scope.localName +
      "((" +
      identifiers.context +
      ") => {",
  );

  for (const leaf of binding.leaves) {
    const names = getLeafNames(leaf, state);
    const action = formatMemberAccess(identifiers.context, scope.actionMethod);
    if (defaultScope) {
      lines.push(
        "  " +
          names.read +
          " = " +
          identifiers.context +
          ".own(" +
          createCellSource(leaf, binding, state) +
          ");",
      );
    }
    if (
      !defaultScope &&
      signal.exportName === "createStoreCell" &&
      signal.runtimeModule === "@volynets/reflex-store/runtime/internal"
    ) {
      lines.push(
        "  " + identifiers.context + ".onDispose(" + names.read + ".dispose);",
      );
    }
    if (
      defaultScope &&
      signal.exportName === "createStoreCell" &&
      signal.runtimeModule === "@volynets/reflex-store/runtime/internal"
    ) {
      lines.push(
        "  " +
          names.write +
          " = " +
          identifiers.context +
          ".writer(" +
          names.read +
          ");",
      );
      continue;
    }
    lines.push(
      "  " + names.write + " = " + action + "((" + identifiers.value + ") => {",
    );
    lines.push("    " + names.read + ".set(" + identifiers.value + ");");
    lines.push("    return " + identifiers.value + ";");
    lines.push("  });");
  }

  const action = formatMemberAccess(identifiers.context, scope.actionMethod);
  for (const method of binding.methods) {
    const fn = transformExpression(rewriteStoreThis(method.fn, binding), state);
    lines.push(
      "  const " +
        method.internalName +
        " = " +
        action +
        "(" +
        printExpression(fn) +
        ");",
    );
  }
  for (const getter of binding.getters) {
    if (!state.computedName) {
      throw new Error("Missing generated computed import for store getter.");
    }
    const getterValue = nextTemp(state, "getter");
    const fn = transformExpression(rewriteStoreThis(getter.fn, binding), state);
    lines.push(
      "  const " +
        getterValue +
        " = " +
        state.computedName +
        "(() => (" +
        printExpression(fn) +
        ").call(" +
        binding.name +
        "));",
    );
    lines.push(
      "  " +
        identifiers.context +
        ".own({ [Symbol.dispose]: () => " +
        getterValue +
        ".dispose() });",
    );
    lines.push(
      "  const " + getter.internalName + " = " + getterValue + ".read;",
    );
  }

  lines.push(
    "  return " +
      (defaultScope
        ? createStoreScopeSource(binding, identifiers.context, emitFacade)
        : createStoreObjectSource(binding, state)) +
      ";",
  );
  lines.push(scope.curried ? "})();" : "});");
  if (emitFacade) {
    const facade = createStoreObjectSource(binding, state, scopeName);
    const contents = facade.slice(1, -1).trim();
    lines.push(
      kind +
        " " +
        binding.name +
        " = { " +
        contents +
        (contents ? "," : "") +
        " dispose: " +
        scopeName +
        ".dispose, [Symbol.dispose]: " +
        scopeName +
        "[Symbol.dispose] };",
    );
  }

  if (emitFacade) {
    if (binding.displayName)
      lines.push(
        "Object.defineProperty(" +
          binding.name +
          ", Symbol.for('@volynets/reflex-store/name'), { value: " +
          JSON.stringify(binding.displayName) +
          " });",
      );
    const guard =
      "if (!" +
      formatMemberAccess(scopeName, binding.lifetimeName!) +
      "()) throw new Error('Cannot use a disposed compiled store'); ";
    const writes = binding.leaves
      .map(
        (leaf, index) =>
          getLeafNames(leaf, state).write + "(values[" + index + "]);",
      )
      .join(" ");
    const collects = binding.leaves
      .map((leaf) => getLeafNames(leaf, state).read + ".collect();")
      .join(" ");
    lines.push(
      "Object.defineProperty(" +
        binding.name +
        ", Symbol.for('@volynets/reflex-store/data/1'), { value: {" +
        "raw: () => { " +
        guard +
        "return " +
        createStoreDataSource(binding, state) +
        "; }," +
        "snapshot: (data, copy) => { " +
        guard +
        "return " +
        createStoreDataSource(binding, state, true) +
        "; }," +
        "paths: " +
        JSON.stringify(binding.leaves.map((leaf) => leaf.parts)) +
        "," +
        "branches: " +
        JSON.stringify([
          [],
          ...[...binding.branchPaths].map((path) => JSON.parse(path)),
        ]) +
        "," +
        "hydrate: (values) => { " +
        guard +
        writes +
        " }," +
        "collect: () => { " +
        collects +
        " }," +
        "dispose: " +
        binding.name +
        ".dispose } });",
    );
  }
  return parseModule(lines.join("\n"), "compiled-store-lowering.ts").body;
}

function createCellSource(
  leaf: StoreLeafPath,
  binding: StoreBinding,
  state: TransformState,
): string {
  const signal = state.target.signal;
  const options =
    binding.displayName && signal.exportName === "createStoreCell"
      ? ", " +
        JSON.stringify({
          name: binding.displayName + "." + leaf.parts.join("."),
        })
      : "";
  return signal.localName + "(" + printExpression(leaf.initial) + options + ")";
}

function rewriteStoreThis(node: any, binding: StoreBinding, root = true): any {
  if (!node || typeof node !== "object") return node;
  if (Array.isArray(node))
    return node.map((child) => rewriteStoreThis(child, binding, false));
  if (node.type === "ThisExpression") return { ...binding.identifier };
  if (
    !root &&
    [
      "FunctionExpression",
      "FunctionDeclaration",
      "MethodProperty",
      "GetterProperty",
      "SetterProperty",
      "ClassExpression",
      "ClassDeclaration",
    ].includes(node.type)
  )
    return node;
  const result: any = { ...node };
  for (const key of Object.keys(node)) {
    if (!["span", "ctxt"].includes(key))
      result[key] = rewriteStoreThis(node[key], binding, false);
  }
  return result;
}

function createStoreDataSource(
  binding: StoreBinding,
  state: TransformState,
  snapshot = false,
): string {
  const root = createStoreTreeNode();
  for (const path of binding.branchPaths) {
    let branch = root;
    for (const key of JSON.parse(path) as string[]) {
      let next = branch.branches.get(key);
      if (!next) branch.branches.set(key, (next = createStoreTreeNode()));
      branch = next;
    }
  }
  for (const leaf of binding.leaves) insertStoreLeaf(root, leaf.parts, leaf);
  const render = (node: StoreTreeNode): string => {
    const entries = [...node.branches].map(([key, branch]) => ({
      key,
      value: render(branch),
    }));
    for (const [key, leaf] of node.leaves) {
      let value = getLeafNames(leaf, state).read + "()";
      if (snapshot) {
        value = "data";
        for (const part of leaf.parts) value = formatMemberAccess(value, part);
        value = "copy(" + value + ")";
      }
      entries.push({ key, value });
    }
    if (snapshot) {
      // Match Reflect.ownKeys ordering: array-index keys precede other strings.
      const indexOf = (key: string) => {
        const index = Number(key);
        return Number.isInteger(index) &&
          index >= 0 &&
          index < 0xffffffff &&
          String(index) === key
          ? index
          : Infinity;
      };
      entries.sort((a, b) => indexOf(a.key) - indexOf(b.key));
    }
    const object =
      "{" +
      entries
        .map(({ key, value }) => formatObjectKey(key) + ": " + value)
        .join(", ") +
      "}";
    return snapshot ? "Object.freeze(" + object + ")" : object;
  };
  return render(root);
}

function createStoreScopeSource(
  binding: StoreBinding,
  context: string,
  emitFacade: boolean,
): string {
  const members = [
    ...(emitFacade
      ? [binding.lifetimeName + ": () => !" + context + ".disposed"]
      : []),
    ...binding.methods.map(
      (method) => method.internalName + ": " + method.internalName,
    ),
    ...binding.getters.map(
      (getter) => getter.internalName + ": " + getter.internalName,
    ),
  ];
  return members.length === 0 ? "{}" : "{ " + members.join(", ") + " }";
}
type StoreTreeNode = {
  branches: Map<string, StoreTreeNode>;
  leaves: Map<string, StoreLeafPath>;
};

function createStoreObjectSource(
  binding: StoreBinding,
  state: TransformState,
  scopeName?: string,
): string {
  const root = createStoreTreeNode();
  for (const path of binding.branchPaths) {
    let branch = root;
    for (const key of JSON.parse(path) as string[]) {
      let next = branch.branches.get(key);
      if (!next) {
        next = createStoreTreeNode();
        branch.branches.set(key, next);
      }
      branch = next;
    }
  }

  for (const leaf of binding.leaves) {
    insertStoreLeaf(root, leaf.parts, leaf);
  }

  return createStoreTreeObjectSource(root, state, 2, binding, scopeName);
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
  rootBinding?: StoreBinding,
  scopeName?: string,
): string {
  const pad = " ".repeat(indent);
  const childPad = " ".repeat(indent + 2);
  const entries: string[] = [];

  for (const [key, branch] of node.branches) {
    entries.push(
      childPad +
        formatObjectKey(key) +
        ": " +
        createStoreTreeObjectSource(branch, state, indent + 2),
    );
  }

  for (const [key, leaf] of node.leaves) {
    const names = getLeafNames(leaf, state);
    entries.push(
      [
        childPad + "get " + formatObjectKey(key) + "() {",
        childPad + "  return " + names.read + "();",
        childPad + "},",
        childPad +
          "set " +
          formatObjectKey(key) +
          "(" +
          state.target.identifiers.value +
          ") {",
        childPad +
          "  " +
          names.write +
          "(" +
          state.target.identifiers.value +
          ");",
        childPad + "}",
      ].join("\n"),
    );
  }

  if (rootBinding && scopeName) {
    for (const method of rootBinding.methods) {
      entries.push(
        childPad +
          formatObjectKey(method.key) +
          ": " +
          "function (...args) { if (!" +
          formatMemberAccess(scopeName, rootBinding.lifetimeName!) +
          "()) throw new Error('Cannot call a disposed compiled store'); return " +
          formatMemberAccess(scopeName, method.internalName!) +
          ".apply(" +
          rootBinding.name +
          ", args); }",
      );
    }
    for (const getter of rootBinding.getters) {
      entries.push(
        childPad +
          "get " +
          formatObjectKey(getter.key) +
          "() { if (!" +
          formatMemberAccess(scopeName, rootBinding.lifetimeName!) +
          "()) throw new Error('Cannot read a disposed compiled store'); return " +
          formatMemberAccess(scopeName, getter.internalName!) +
          "(); }",
      );
    }
  }

  if (entries.length === 0) {
    return "{}";
  }

  return "{\n" + entries.join(",\n") + "\n" + pad + "}";
}
function formatObjectKey(key: string): string {
  return isIdentifierName(key) ? key : JSON.stringify(key);
}

function formatMemberAccess(object: string, property: string): string {
  return isIdentifierName(property)
    ? `${object}.${property}`
    : `${object}[${JSON.stringify(property)}]`;
}

function allocateName(preferred: string, state: TransformState): string {
  if (!isIdentifierName(preferred))
    throw new Error("Invalid generated identifier: " + preferred);
  let name = preferred;
  let suffix = 0;
  while (state.identifiers.has(name)) name = preferred + "_" + ++suffix;
  state.identifiers.add(name);
  return name;
}

function getLeafNames(leaf: StoreLeafPath, state: TransformState) {
  if (leaf.names) return leaf.names;
  const context = { path: leaf.parts, mangledPath: leaf.mangled };
  return (leaf.names = {
    read: allocateName(state.target.identifiers.read(context), state),
    set: allocateName(state.target.identifiers.set(context), state),
    write: allocateName(state.target.identifiers.write(context), state),
  });
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
  if (node.type === "FunctionExpression") {
    return {
      ...node,
      body: transformBlockStatement(node.body, state),
    } as Expression;
  }
  if (node.type === "ArrowFunctionExpression") {
    return {
      ...node,
      body:
        (node.body as any).type === "BlockStatement"
          ? transformBlockStatement(node.body, state)
          : transformExpression(node.body as Expression, state),
    } as Expression;
  }

  let result: Expression = node;
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
    if (frame === undefined) continue;

    if (frame.phase === "exit") {
      frame.assign(finalizeExpression(frame.node, frame.slots, state));
      continue;
    }

    const expression = frame.node;
    if (
      expression.type === "FunctionExpression" ||
      expression.type === "ArrowFunctionExpression"
    ) {
      frame.assign(transformExpression(expression, state));
      continue;
    }

    const childCount = countTransformChildren(expression, state);
    if (childCount === 0) {
      const withNestedFunctions = transformNestedFunctions(expression, state);
      frame.assign(finalizeExpression(withNestedFunctions, EMPTY_SLOTS, state));
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
  return allocateName(
    state.target.identifiers.temporary({
      index: state.tempCounter,
      label,
    }),
    state,
  );
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

  const rootNode = memberRoot(node);
  const store = rootNode ? stores.get(bindingKey(rootNode)) : undefined;
  if (!store) {
    return null;
  }

  return store.leafPaths.get(pathKey(path)) ?? null;
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
  const previous = nextTemp(state, "previous");
  return createIIFE([
    createConstDeclaration(previous, createReadCall(leaf, state)),
    createConstDeclaration(rhsTemp, right),
    createConstDeclaration(
      nextTempName,
      createBinaryExpression(
        createIdentifierExpression(previous),
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
  const declaration = createConstDeclaration(
    tempName,
    createReadCall(leaf, state),
  );
  declaration.kind = "let";
  const result = nextTemp(state, "result");
  return createIIFE([
    declaration,
    createConstDeclaration(result, {
      type: "UpdateExpression",
      span: DUMMY_SPAN,
      operator: operator === "+" ? "++" : "--",
      prefix,
      argument: createIdentifierExpression(tempName),
    } as Expression),
    createExpressionStatement(
      createWriteCall(leaf, createIdentifierExpression(tempName), state),
    ),
    createReturnStatement(createIdentifierExpression(result)),
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
