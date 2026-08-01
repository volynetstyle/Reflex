/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Module } from "@swc/core";
import { getStaticPropertyKey } from "./ast";
import type { StoreBinding, StoreLeafPath } from "./contracts";

export function collectStoreBindings(
  program: Module,
): Map<string, StoreBinding> {
  const stores = new Map<string, StoreBinding>();

  for (const item of program.body) {
    if (item.type !== "VariableDeclaration") continue;

    for (const declaration of item.declarations ?? []) {
      const name =
        declaration.id?.type === "Identifier" ? declaration.id.value : null;
      if (name === null || !isCreateStoreCall(declaration.init)) continue;

      const objectArg = (declaration.init as any).arguments?.[0]?.expression;
      if (objectArg?.type !== "ObjectExpression") continue;

      const branchPaths = new Set<string>();
      const leafPaths = new Map<string, StoreLeafPath>();
      const leaves: StoreLeafPath[] = [];
      collectLeafPaths(objectArg, [], leafPaths, branchPaths, leaves);
      stores.set(name, { name, branchPaths, leafPaths, leaves });
    }
  }

  return stores;
}

export function isCreateStoreCall(expression: any): expression is any {
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
    if (property.type !== "KeyValueProperty") continue;

    const key = getStaticPropertyKey(property.key);
    if (key === null) continue;

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

function manglePath(path: readonly string[]): string {
  return path.map(mangleIdentifierPart).join("_");
}

function mangleIdentifierPart(part: string): string {
  const mangled = part.replace(/[^A-Za-z0-9_$]/g, "_");
  return /^[0-9]/.test(mangled) ? `_${mangled}` : mangled;
}
