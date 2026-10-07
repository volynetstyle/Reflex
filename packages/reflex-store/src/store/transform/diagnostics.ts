/* eslint-disable @typescript-eslint/no-explicit-any */
import { bindingKey, memberRoot, pathKey, STORE_MODULES } from "./bindings";
import type { Module } from "@swc/wasm";
import { collectStaticMemberPath, visitNode } from "./ast";
import type { DiagnosticCode, TransformState } from "./contracts";

export function scanUnsupportedStoreSyntax(
  program: Module,
  state: TransformState,
): void {
  if (state.stores.size === 0) return;

  for (const store of state.stores.values()) {
    for (const getter of store.getters) {
      visitNode(getter.fn, (node) => {
        if (
          node.type === "CallExpression" &&
          node.callee?.type === "MemberExpression"
        ) {
          const path = collectStaticMemberPath(node.callee);
          const receiver = node.callee.object;
          const receiverStore =
            receiver?.type === "ThisExpression"
              ? store
              : path?.length === 2
                ? state.stores.get(bindingKey(memberRoot(node.callee)))
                : undefined;
          const method =
            receiver?.type === "ThisExpression"
              ? node.callee.property?.value
              : path?.[1];
          if (
            receiverStore?.methods.some((candidate) => candidate.key === method)
          )
            addDiagnostic(
              state,
              "unsupported-write",
              "Compiled getters cannot call store actions.",
            );
        }

        if (node.type === "AwaitExpression" || node.type === "YieldExpression")
          addDiagnostic(
            state,
            "unsupported-write",
            "Compiled getters must be pure synchronous computations.",
          );
        if (
          node.type === "AssignmentExpression" ||
          node.type === "UpdateExpression"
        ) {
          let root = node.left ?? node.argument;
          while (root?.type === "MemberExpression") root = root.object;
          if (
            root?.type === "ThisExpression" ||
            (root?.type === "Identifier" && state.stores.has(bindingKey(root)))
          )
            addDiagnostic(
              state,
              "unsupported-write",
              "Compiled getters cannot write store state.",
            );
        }
      });
    }
  }

  const intrinsicNames = new Map<
    string,
    { arity: number; rootIndex: number }
  >();
  for (const item of program.body) {
    if (
      item.type !== "ImportDeclaration" ||
      (!STORE_MODULES.has(item.source.value) &&
        !["@volynets/reflex", "@volynets/reflex-store/runtime"].includes(
          item.source.value,
        ))
    )
      continue;
    for (const specifier of item.specifiers) {
      if (specifier.type !== "ImportSpecifier" || specifier.isTypeOnly)
        continue;
      const imported = specifier.imported?.value ?? specifier.local.value;
      if (
        ["snapshot", "hydrate", "getStoreName"].includes(imported) &&
        STORE_MODULES.has(item.source.value)
      )
        intrinsicNames.set(bindingKey(specifier.local), {
          arity: imported === "hydrate" ? 2 : 1,
          rootIndex: 0,
        });
      if (
        imported === "own" &&
        ["@volynets/reflex", "@volynets/reflex-store/runtime"].includes(
          item.source.value,
        )
      )
        intrinsicNames.set(bindingKey(specifier.local), {
          arity: 2,
          rootIndex: 1,
        });
    }
  }
  const returnRoots = new Set<object>();
  const collectReturned = (node: any): void => {
    if (node?.type === "Identifier" && state.stores.has(bindingKey(node)))
      returnRoots.add(node);
    if (node?.type === "ObjectExpression") {
      for (const property of node.properties)
        collectReturned(
          property.type === "KeyValueProperty" ? property.value : property,
        );
    }
  };
  visitNode(program, (node) => {
    if (node.type === "ReturnStatement") collectReturned(node.argument);
  });
  const intrinsicRoots = new Set<object>();
  visitNode(program, (node) => {
    if (node.type !== "CallExpression" || node.callee?.type !== "Identifier")
      return;
    const intrinsic = intrinsicNames.get(bindingKey(node.callee));
    const root = node.arguments?.[intrinsic?.rootIndex ?? 0]?.expression;
    if (
      intrinsic &&
      node.arguments.length === intrinsic.arity &&
      node.arguments.every((arg: any) => !arg.spread) &&
      root?.type === "Identifier" &&
      state.stores.has(bindingKey(root))
    )
      intrinsicRoots.add(root);
  });

  visitNode(program, (node, parent) => {
    if (
      node.type === "Identifier" &&
      state.stores.has(bindingKey(node)) &&
      !intrinsicRoots.has(node) &&
      !returnRoots.has(node) &&
      !(parent?.type === "VariableDeclarator" && parent.id === node) &&
      !(parent?.type === "MemberExpression" && parent.object === node) &&
      !(parent?.type === "ReturnStatement" && parent.argument === node)
    ) {
      addDiagnostic(state, "spread-reflection", REFLECTION_MESSAGE);
    }
    if (
      node.type === "AssignmentExpression" ||
      node.type === "UpdateExpression"
    ) {
      const target = node.left ?? node.argument;
      if (isStoreMember(target, state) || isStoreRootOrBranch(target, state)) {
        const parts = collectStaticMemberPath(target);
        const root = memberRoot(target);
        const store = root && state.stores.get(bindingKey(root));
        if (
          !parts ||
          !store?.leafPaths.has(pathKey(parts.slice(1))) ||
          (node.type === "AssignmentExpression" &&
            !["=", "+=", "-="].includes(node.operator))
        ) {
          addDiagnostic(
            state,
            "unsupported-write",
            "Only declared compiled-store leaves support =, +=, -=, ++ and --.",
          );
        }
        if (node.type === "AssignmentExpression" && node.operator !== "=") {
          visitNode(node.right, (child) => {
            if (
              child.type === "AwaitExpression" ||
              child.type === "YieldExpression"
            )
              addDiagnostic(
                state,
                "unsupported-write",
                "Suspending a compiled-store compound assignment is unsupported.",
              );
          });
        }
      }
    } else if (node.type === "MemberExpression") {
      scanMemberExpression(node, state);
    } else if (node.type === "VariableDeclarator") {
      scanVariableDeclarator(node, state);
    } else if (node.type === "BinaryExpression" && node.operator === "in") {
      if (isStoreRootOrBranch(node.right, state)) {
        addDiagnostic(state, "spread-reflection", REFLECTION_MESSAGE);
      }
    } else if (node.type === "UnaryExpression" && node.operator === "delete") {
      if (
        isStoreMember(node.argument, state) ||
        isStoreRootOrBranch(node.argument, state)
      ) {
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
      if (!isStoreMember(node.base ?? node, state)) return;
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
  const root = memberRoot(node);
  if (
    root !== null &&
    state.stores.has(bindingKey(root)) &&
    hasDynamicMemberAccess(node)
  ) {
    addDiagnostic(
      state,
      "dynamic-access",
      "Dynamic compiled-store access is not supported in phase 1.",
    );
  }
}

function scanVariableDeclarator(node: any, state: TransformState): void {
  if (
    node.id?.type === "ObjectPattern" &&
    isStoreRootOrBranch(node.init, state)
  ) {
    addDiagnostic(state, "spread-reflection", REFLECTION_MESSAGE);
  } else if (
    node.id?.type === "Identifier" &&
    isStoreBranchMember(node.init, state)
  ) {
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

  if (
    isReflection &&
    isStoreRootOrBranch(node.arguments?.[0]?.expression, state)
  ) {
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
    ? state.stores.has(bindingKey(node))
    : isStoreBranchMember(node, state);
}

function isStoreBranchMember(node: any, state: TransformState): boolean {
  const parts = collectStaticMemberPath(node);
  if (parts === null || parts.length < 2) return false;

  const [root, ...path] = parts;
  if (root === undefined) return false;

  const rootNode = memberRoot(node);
  return (
    rootNode !== null &&
    (state.stores.get(bindingKey(rootNode))?.branchPaths.has(pathKey(path)) ??
      false)
  );
}

function isStoreMember(node: any, state: TransformState): boolean {
  const root = memberRoot(node);
  return root !== null && state.stores.has(bindingKey(root));
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
      (diagnostic) =>
        diagnostic.code === code && diagnostic.message === message,
    )
  ) {
    state.diagnostics.push({ code, message });
  }
}
