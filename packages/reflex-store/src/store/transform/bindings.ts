/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Module } from "@swc/wasm";
import {
  collectStaticMemberPath,
  getStaticPropertyKey,
  visitNode,
} from "./ast";
import type {
  CompiledStoreDiagnostic,
  StoreBinding,
  StoreGetter,
  StoreLeafPath,
  StoreMethod,
} from "./contracts";

export const STORE_MODULES = new Set([
  "@volynets/reflex-store",
  "@volynets/reflex-store/store",
  "@volynets/reflex-store/compiled-store",
  "@volynets/reflex-store/advanced",
  "@reflex/store",
  "@reflex/store/store",
  "@reflex/store/compiled-store",
  "@reflex/store/advanced",
]);

export const bindingKey = (identifier: any): string =>
  identifier.value + "#" + identifier.ctxt;

export function memberRoot(node: any): any {
  while (
    node?.type === "MemberExpression" ||
    node?.type === "OptionalChainingExpression"
  )
    node = node.object ?? node.base;
  return node?.type === "Identifier" ? node : null;
}

export function collectFactoryNames(program: Module): Set<string> {
  const names = new Set<string>();
  let hasLocalCreateStore = false;
  for (const item of program.body) {
    if (item.type === "ImportDeclaration") {
      for (const specifier of item.specifiers) {
        if (specifier.local.value === "createStore") hasLocalCreateStore = true;
        if (
          item.typeOnly ||
          specifier.type !== "ImportSpecifier" ||
          specifier.isTypeOnly ||
          !STORE_MODULES.has(item.source.value)
        )
          continue;
        if (
          (specifier.imported?.value ?? specifier.local.value) === "createStore"
        )
          names.add(bindingKey(specifier.local));
      }
    } else if (
      item.type === "FunctionDeclaration" ||
      item.type === "ClassDeclaration"
    ) {
      if (item.identifier?.value === "createStore") hasLocalCreateStore = true;
    } else if (item.type === "VariableDeclaration") {
      for (const declaration of item.declarations) {
        if (
          declaration.id.type === "Identifier" &&
          declaration.id.value === "createStore"
        )
          hasLocalCreateStore = true;
      }
    }
  }
  // Bare declarations are supported by the compiler API (the Vite plugin gates them).
  if (!hasLocalCreateStore && names.size === 0) {
    const declared = new Set<string>();
    const collectDeclared = (pattern: any) =>
      visitNode(pattern, (node) => {
        if (node.type === "Identifier" && node.value === "createStore")
          declared.add(bindingKey(node));
      });
    visitNode(program, (node) => {
      if (node.type === "VariableDeclarator") collectDeclared(node.id);
      if (
        [
          "FunctionDeclaration",
          "FunctionExpression",
          "ArrowFunctionExpression",
          "ClassDeclaration",
        ].includes(node.type)
      ) {
        if (node.identifier) collectDeclared(node.identifier);
        for (const parameter of node.params ?? [])
          collectDeclared(parameter.pat ?? parameter);
      }
    });
    visitNode(program, (node) => {
      if (
        node.type === "CallExpression" &&
        node.callee?.type === "Identifier" &&
        node.callee.value === "createStore" &&
        !declared.has(bindingKey(node.callee))
      )
        names.add(bindingKey(node.callee));
    });
  }
  return names;
}

export const pathKey = (path: readonly string[]): string =>
  JSON.stringify(path);

export function collectStoreBindings(
  program: Module,
  diagnostics: CompiledStoreDiagnostic[] = [],
): Map<string, StoreBinding> {
  const stores = new Map<string, StoreBinding>();
  const names = collectFactoryNames(program);
  const recognized = new Set<object>();
  const factoryUses = new Set<object>();
  const parents = new WeakMap<object, any>();

  visitNode(program, (node, parent) => {
    if (parent !== undefined) parents.set(node, parent);
    if (node.type === "ImportDeclaration") {
      for (const specifier of node.specifiers) factoryUses.add(specifier.local);
    }
  });

  visitNode(program, (node, parent) => {
    if (
      node.type !== "VariableDeclarator" ||
      parent?.type !== "VariableDeclaration" ||
      node.id?.type !== "Identifier" ||
      !isCreateStoreCall(node.init, names)
    )
      return;

    recognized.add(node.init as object);
    factoryUses.add(node.init.callee);
    if (!isSupportedStoreDeclarationContext(node, parents)) {
      diagnostics.push({
        code: "unsupported-binding",
        message:
          "Compiled stores must be declared at module scope or inside a function body.",
      });
      return;
    }

    const objectArg = node.init.arguments?.[0]?.expression;
    if (
      objectArg?.type !== "ObjectExpression" ||
      node.init.arguments.length < 1 ||
      node.init.arguments.length > 2
    ) {
      diagnostics.push({
        code: "unsupported-shape",
        message:
          "Compiled stores require a static object literal and optional static options.",
      });
      return;
    }

    let displayName: string | undefined;
    const optionsArg = node.init.arguments[1]?.expression;
    if (optionsArg) {
      if (
        optionsArg.type !== "ObjectExpression" ||
        optionsArg.properties.some(
          (property: any) =>
            property.type !== "KeyValueProperty" ||
            getStaticPropertyKey(property.key) !== "name" ||
            property.value?.type !== "StringLiteral",
        ) ||
        optionsArg.properties.length > 1
      ) {
        diagnostics.push({
          code: "unsupported-shape",
          message:
            "Compiled store options require a static optional name string.",
        });
        return;
      }
      displayName = optionsArg.properties[0]?.value.value;
    }

    const branchPaths = new Set<string>();
    const leafPaths = new Map<string, StoreLeafPath>();
    const leaves: StoreLeafPath[] = [];
    const methods: StoreMethod[] = [];
    const getters: StoreGetter[] = [];
    collectLeafPaths(
      objectArg,
      [],
      leafPaths,
      branchPaths,
      leaves,
      methods,
      getters,
      collectBoundaryNames(program),
      diagnostics,
    );
    stores.set(bindingKey(node.id), {
      name: node.id.value,
      identifier: node.id,
      displayName,
      needsFacade: methods.length > 0 || getters.length > 0,
      branchPaths,
      leafPaths,
      leaves,
      methods,
      getters,
    });
  });

  visitNode(program, (node) => {
    if (
      node.type === "ForStatement" &&
      node.init?.type === "VariableDeclaration" &&
      node.init.declarations.some((declaration: any) =>
        isCreateStoreCall(declaration.init, names),
      )
    ) {
      diagnostics.push({
        code: "unsupported-binding",
        message:
          "Compiled stores cannot be declared in a for-loop initializer.",
      });
    }
    if (
      node.type === "Identifier" &&
      names.has(bindingKey(node)) &&
      !factoryUses.has(node)
    ) {
      diagnostics.push({
        code: "unsupported-binding",
        message:
          "The createStore binding can only be used as a direct store factory.",
      });
    }
    if (isCreateStoreCall(node, names) && !recognized.has(node)) {
      diagnostics.push({
        code: "unsupported-binding",
        message: "Compiled stores must be declared in a variable declaration.",
      });
    }
  });

  visitNode(program, (node, parent) => {
    if (node.type !== "Identifier") return;
    const store = stores.get(bindingKey(node));
    if (!store || (parent?.type === "VariableDeclarator" && parent.id === node))
      return;
    if (parent?.type !== "MemberExpression" || parent.object !== node) {
      store.needsFacade = true;
      return;
    }
    let member = parent;
    let owner = parents.get(member);
    while (owner?.type === "MemberExpression" && owner.object === member) {
      member = owner;
      owner = parents.get(member);
    }
    const parts = collectStaticMemberPath(member)?.slice(1);
    if (
      !parts ||
      ![...store.leafPaths.values()].some(
        (leaf) =>
          leaf.parts.length <= parts.length &&
          leaf.parts.every((key, index) => parts[index] === key),
      )
    )
      store.needsFacade = true;
  });

  return stores;
}

function isSupportedStoreDeclarationContext(
  declarator: any,
  parents: WeakMap<object, any>,
): boolean {
  const declaration = parents.get(declarator);
  if (declaration?.type !== "VariableDeclaration") return false;

  const directParent = parents.get(declaration);
  const statementContainers = new Set([
    "BlockStatement",
    "IfStatement",
    "WhileStatement",
    "DoWhileStatement",
    "ForStatement",
    "ForInStatement",
    "ForOfStatement",
    "SwitchStatement",
    "SwitchCase",
    "TryStatement",
    "CatchClause",
    "LabeledStatement",
    "WithStatement",
  ]);
  let current = directParent;
  let insideBlock = false;

  while (current !== undefined) {
    if (
      current.type === "MethodProperty" ||
      current.type === "FunctionDeclaration" ||
      current.type === "FunctionExpression" ||
      current.type === "ArrowFunctionExpression"
    )
      return true;
    if (current.type === "StaticBlock") return false;
    if (current.type === "Module") {
      return current === directParent || insideBlock;
    }
    if (current.type === "BlockStatement") insideBlock = true;
    else if (!statementContainers.has(current.type)) return false;
    current = parents.get(current);
  }
  return false;
}

export function isCreateStoreCall(
  expression: any,
  names: Set<string>,
): expression is any {
  return (
    expression?.type === "CallExpression" &&
    expression.callee?.type === "Identifier" &&
    names.has(bindingKey(expression.callee))
  );
}

type BoundaryNames = {
  leaf: Set<string>;
  opaque: Set<string>;
};

function collectBoundaryNames(program: Module): BoundaryNames {
  const names: BoundaryNames = { leaf: new Set(), opaque: new Set() };
  for (const item of program.body) {
    if (
      item.type !== "ImportDeclaration" ||
      !STORE_MODULES.has(item.source.value)
    )
      continue;
    for (const specifier of item.specifiers) {
      if (specifier.type !== "ImportSpecifier" || specifier.isTypeOnly)
        continue;
      const imported = specifier.imported?.value ?? specifier.local.value;
      if (imported === "leaf" || imported === "opaque")
        names[imported].add(bindingKey(specifier.local));
    }
  }
  return names;
}

function methodFunction(property: any): any {
  return {
    type: "FunctionExpression",
    span: property.span,
    ctxt: property.ctxt ?? property.body?.ctxt ?? 0,
    identifier: null,
    params: property.params ?? [],
    decorators: property.decorators ?? [],
    body: property.body,
    generator: property.generator ?? false,
    async: property.async ?? false,
    typeParameters: property.typeParameters ?? null,
    returnType: property.returnType ?? property.typeAnnotation ?? null,
  };
}

function getterFunction(property: any): any {
  property = property.function ?? property;
  return {
    type: "FunctionExpression",
    span: property.span,
    ctxt: property.body?.ctxt ?? 0,
    identifier: null,
    params: [],
    decorators: [],
    body: property.body,
    generator: false,
    async: false,
    typeParameters: null,
    returnType: property.typeAnnotation ?? null,
  };
}

function collectLeafPaths(
  object: any,
  prefix: string[],
  target: Map<string, StoreLeafPath>,
  branches: Set<string>,
  leaves: StoreLeafPath[],
  methods: StoreMethod[],
  getters: StoreGetter[],
  boundaries: BoundaryNames,
  diagnostics: CompiledStoreDiagnostic[],
): void {
  const keys = new Set<string>();
  for (const property of object.properties ?? []) {
    const key = getStaticPropertyKey(property.key);
    if (
      key === null ||
      key === "__proto__" ||
      (prefix.length === 0 && (key === "dispose" || key === "constructor")) ||
      keys.has(key)
    ) {
      diagnostics.push({
        code: "unsupported-shape",
        message:
          "Compiled store shapes require unique static keys and do not support spreads, shorthand, setters, __proto__ or reserved lifecycle names.",
      });
      continue;
    }
    keys.add(key);

    if (property.type === "MethodProperty") {
      if (property.async || property.generator) {
        diagnostics.push({
          code: "unsupported-shape",
          message:
            "Compiled store methods must be synchronous non-generator actions.",
        });
        continue;
      }
      if (prefix.length !== 0) {
        diagnostics.push({
          code: "unsupported-shape",
          message: "Compiled store methods are supported only at the root.",
        });
        continue;
      }
      methods.push({ key, fn: methodFunction(property) });
      continue;
    }
    if (property.type === "GetterProperty") {
      if (prefix.length !== 0) {
        diagnostics.push({
          code: "unsupported-shape",
          message: "Compiled store getters are supported only at the root.",
        });
        continue;
      }
      getters.push({ key, fn: getterFunction(property) });
      continue;
    }
    if (property.type !== "KeyValueProperty") {
      diagnostics.push({
        code: "unsupported-shape",
        message:
          "Compiled store shapes support data properties, root methods and root getters.",
      });
      continue;
    }

    const path = [...prefix, key];
    let initial = property.value;
    let isBoundary = false;
    const value = property.value;
    if (
      value?.type === "CallExpression" &&
      value.callee?.type === "Identifier"
    ) {
      const callee = bindingKey(value.callee);
      const isLeaf = boundaries.leaf.has(callee);
      const isOpaque = boundaries.opaque.has(callee);
      if (isLeaf || isOpaque) {
        if (value.arguments?.length !== 1 || !value.arguments[0]?.expression) {
          diagnostics.push({
            code: "unsupported-shape",
            message:
              "leaf() and opaque() compiled-store boundaries require one value argument.",
          });
          continue;
        }
        initial = isOpaque ? value : value.arguments[0].expression;
        isBoundary = true;
      }
    }

    if (!isBoundary && initial?.type === "ObjectExpression") {
      branches.add(pathKey(path));
      collectLeafPaths(
        initial,
        path,
        target,
        branches,
        leaves,
        methods,
        getters,
        boundaries,
        diagnostics,
      );
      continue;
    }

    const leaf: StoreLeafPath = {
      initial,
      path: pathKey(path),
      parts: path,
      mangled: path
        .map((part) => part.replace(/[^A-Za-z0-9_$]/g, "_"))
        .join("_"),
    };
    target.set(pathKey(path), leaf);
    leaves.push(leaf);
  }
}
