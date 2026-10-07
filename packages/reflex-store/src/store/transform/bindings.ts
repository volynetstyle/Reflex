/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Module } from "@swc/core";
import { getStaticPropertyKey, visitNode } from "./ast";
import type {
  CompiledStoreDiagnostic,
  StoreBinding,
  StoreLeafPath,
} from "./contracts";

export const STORE_MODULES = new Set([
  "@volynets/reflex-store",
  "@volynets/reflex-store/store",
  "@volynets/reflex-store/compiled-store",
  "@reflex/store",
  "@reflex/store/store",
  "@reflex/store/compiled-store",
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
    for (const item of program.body) {
      if (item.type !== "VariableDeclaration") continue;
      for (const declaration of item.declarations) {
        const init = declaration.init;
        if (
          init?.type === "CallExpression" &&
          init.callee.type === "Identifier" &&
          init.callee.value === "createStore"
        )
          names.add(bindingKey(init.callee));
      }
    }
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
  for (const item of program.body) {
    if (item.type === "ImportDeclaration")
      for (const specifier of item.specifiers) factoryUses.add(specifier.local);
  }
  for (const item of program.body) {
    if (item.type !== "VariableDeclaration") continue;
    for (const declaration of item.declarations) {
      if (
        declaration.id.type !== "Identifier" ||
        !isCreateStoreCall(declaration.init, names)
      )
        continue;
      recognized.add(declaration.init as object);
      factoryUses.add((declaration.init as any).callee);
      const objectArg = (declaration.init as any).arguments?.[0]?.expression;
      if (
        objectArg?.type !== "ObjectExpression" ||
        (declaration.init as any).arguments.length !== 1
      ) {
        diagnostics.push({
          code: "unsupported-shape",
          message: "Compiled stores require exactly one static object literal.",
        });
        continue;
      }
      const branchPaths = new Set<string>();
      const leafPaths = new Map<string, StoreLeafPath>();
      const leaves: StoreLeafPath[] = [];
      collectLeafPaths(
        objectArg,
        [],
        leafPaths,
        branchPaths,
        leaves,
        diagnostics,
      );
      const name = declaration.id.value;
      stores.set(bindingKey(declaration.id), {
        name,
        branchPaths,
        leafPaths,
        leaves,
      });
    }
  }
  visitNode(program, (node) => {
    if (
      node.type === "Identifier" &&
      names.has(bindingKey(node)) &&
      !factoryUses.has(node)
    ) {
      diagnostics.push({
        code: "unsupported-binding",
        message:
          "The createStore binding can only be used as a direct top-level store factory.",
      });
    }
    if (isCreateStoreCall(node, names) && !recognized.has(node)) {
      diagnostics.push({
        code: "unsupported-binding",
        message:
          "Compiled stores must be declared in a top-level variable declaration.",
      });
    }
  });
  return stores;
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

function collectLeafPaths(
  object: any,
  prefix: string[],
  target: Map<string, StoreLeafPath>,
  branches: Set<string>,
  leaves: StoreLeafPath[],
  diagnostics: CompiledStoreDiagnostic[],
): void {
  const keys = new Set<string>();
  for (const property of object.properties ?? []) {
    const key =
      property.type === "KeyValueProperty"
        ? getStaticPropertyKey(property.key)
        : null;
    if (
      key === null ||
      key === "__proto__" ||
      (prefix.length === 0 && key === "dispose") ||
      keys.has(key)
    ) {
      diagnostics.push({
        code: "unsupported-shape",
        message:
          "Compiled store shapes require unique static data properties; spreads, methods, accessors, shorthand and __proto__/reserved lifecycle keys are unsupported.",
      });
      continue;
    }
    keys.add(key);
    const path = [...prefix, key];
    if (property.value?.type === "ObjectExpression") {
      branches.add(pathKey(path));
      collectLeafPaths(
        property.value,
        path,
        target,
        branches,
        leaves,
        diagnostics,
      );
    } else {
      const leaf: StoreLeafPath = {
        initial: property.value,
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
}
