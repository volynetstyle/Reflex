/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Module } from "@swc/core";
import { collectStaticMemberPath, visitNode } from "./ast";
import type { DiagnosticCode, TransformState } from "./contracts";

export function scanUnsupportedStoreSyntax(
  program: Module,
  state: TransformState,
): void {
  if (state.stores.size === 0) return;

  visitNode(program, (node) => {
    if (node.type === "MemberExpression") {
      scanMemberExpression(node, state);
    } else if (node.type === "VariableDeclarator") {
      scanVariableDeclarator(node, state);
    } else if (node.type === "BinaryExpression" && node.operator === "in") {
      if (isStoreRootOrBranch(node.right, state)) {
        addDiagnostic(state, "spread-reflection", REFLECTION_MESSAGE);
      }
    } else if (node.type === "UnaryExpression" && node.operator === "delete") {
      if (isStoreRootOrBranch(node.argument, state)) {
        addDiagnostic(
          state,
          "delete",
          "Deleting compiled-store paths is not supported in phase 1.",
        );
      }
    } else if (node.type === "CallExpression") {
      scanCallExpression(node, state);
    } else if (node.type === "ObjectExpression") {
      scanObjectExpression(node, state);
    } else if (
      node.type === "OptionalChainingExpression" ||
      node.type === "OptChainExpression"
    ) {
      addDiagnostic(
        state,
        "optional-chain",
        "Optional chaining on compiled stores is not supported in phase 1.",
      );
    }
  });
}

const REFLECTION_MESSAGE =
  "Spread and reflection are not guaranteed for compiled stores in phase 1.";

function scanMemberExpression(node: any, state: TransformState): void {
  const root = getMemberRootIdentifier(node);
  if (root !== null && state.stores.has(root) && hasDynamicMemberAccess(node)) {
    addDiagnostic(
      state,
      "dynamic-access",
      "Dynamic compiled-store access is not supported in phase 1.",
    );
  }
}

function scanVariableDeclarator(node: any, state: TransformState): void {
  if (node.id?.type === "ObjectPattern" && isStoreRootOrBranch(node.init, state)) {
    addDiagnostic(state, "spread-reflection", REFLECTION_MESSAGE);
  } else if (node.id?.type === "Identifier" && isStoreBranchMember(node.init, state)) {
    addDiagnostic(
      state,
      "branch-alias",
      "Aliasing nested compiled-store branches is not supported in phase 1.",
    );
  }
}

function scanCallExpression(node: any, state: TransformState): void {
  const calleePath = collectStaticMemberPath(node.callee);
  if (calleePath === null) return;

  const [root, method] = calleePath;
  const isReflection =
    (root === "Object" &&
      (method === "keys" ||
        method === "values" ||
        method === "entries" ||
        method === "getOwnPropertyNames" ||
        method === "getOwnPropertySymbols")) ||
    (root === "Reflect" && method === "ownKeys");

  if (isReflection && isStoreRootOrBranch(node.arguments?.[0]?.expression, state)) {
    addDiagnostic(state, "spread-reflection", REFLECTION_MESSAGE);
  }
}

function scanObjectExpression(node: any, state: TransformState): void {
  for (const property of node.properties ?? []) {
    if (
      property.type === "SpreadElement" &&
      isStoreRootOrBranch(property.arguments ?? property.expression, state)
    ) {
      addDiagnostic(state, "spread-reflection", REFLECTION_MESSAGE);
    }
  }
}

function isStoreRootOrBranch(node: any, state: TransformState): boolean {
  return node?.type === "Identifier"
    ? state.stores.has(node.value)
    : isStoreBranchMember(node, state);
}

function isStoreBranchMember(node: any, state: TransformState): boolean {
  const parts = collectStaticMemberPath(node);
  if (parts === null || parts.length < 2) return false;

  const [root, ...path] = parts;
  if (root === undefined) return false;

  return state.stores.get(root)?.branchPaths.has(path.join(".")) ?? false;
}

function getMemberRootIdentifier(node: any): string | null {
  let current = node;
  while (current?.type === "MemberExpression") current = current.object;
  return current?.type === "Identifier" ? current.value : null;
}

function hasDynamicMemberAccess(node: any): boolean {
  let current = node;
  while (current?.type === "MemberExpression") {
    if (current.computed || current.property?.type === "Computed") return true;
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
    !state.diagnostics.some(
      (diagnostic) => diagnostic.code === code && diagnostic.message === message,
    )
  ) {
    state.diagnostics.push({ code, message });
  }
}
