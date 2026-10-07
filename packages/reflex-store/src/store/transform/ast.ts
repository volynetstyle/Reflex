/* eslint-disable @typescript-eslint/no-explicit-any */
import { parseSync, printSync } from "@swc/wasm";
import type { Module } from "@swc/wasm";

export const DUMMY_SPAN = {
  start: 0,
  end: 0,
  ctxt: 0,
};

export function parseModule(code: string, id: string): Module {
  const isTypeScript = /\.([cm]?ts)x?$/i.test(id);

  return normalizeParsed(
    parseSync(code, {
      syntax: isTypeScript ? "typescript" : "ecmascript",
      tsx: /\.([cm]?ts)x$/i.test(id),
      jsx: /\.([cm]?jsx)$/i.test(id),
      target: "es2022",
    }),
  ) as Module;
}

function normalizeParsed(node: any): any {
  if (!node || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map(normalizeParsed);
  if (node.type === "FunctionBody") node.type = "BlockStatement";
  for (const key of Object.keys(node)) {
    if (key !== "span") node[key] = normalizeParsed(node[key]);
  }
  return node;
}

/** SWC WASM uses FunctionBody where the compiler's normalized AST uses blocks. */
export function printModule(
  program: any,
  options: any,
): { code: string; map?: string } {
  const functionTypes = new Set([
    "FunctionDeclaration",
    "FunctionExpression",
    "ArrowFunctionExpression",
    "MethodProperty",
    "GetterProperty",
    "SetterProperty",
    "ClassMethod",
    "PrivateMethod",
    "Constructor",
  ]);
  const convert = (node: any, parentType?: string, key?: string): any => {
    if (!node || typeof node !== "object") return node;
    if (Array.isArray(node))
      return node.map((child) => convert(child, parentType, key));
    const result: any = {};
    for (const field of Object.keys(node))
      result[field] = convert(node[field], node.type, field);
    if (
      node.type === "BlockStatement" &&
      key === "body" &&
      functionTypes.has(parentType!)
    ) {
      result.type = "FunctionBody";
      delete result.ctxt;
    }
    if (
      (node.type === "GetterProperty" || node.type === "SetterProperty") &&
      result.function?.body
    )
      result.function.body.type = "FunctionBody";
    return result;
  };
  return printSync(convert(program), options);
}

export function collectStaticMemberPath(node: any): string[] | null {
  const path: string[] = [];
  let current = node;

  while (current?.type === "MemberExpression") {
    if (current.computed || current.property?.type === "Computed") {
      return null;
    }

    const key = getStaticPropertyKey(current.property);
    if (key === null) {
      return null;
    }

    path.unshift(key);
    current = current.object;
  }

  if (current?.type !== "Identifier") {
    return null;
  }

  path.unshift(current.value);
  return path;
}

export function getStaticPropertyKey(node: any): string | null {
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

export function visitNode(
  node: any,
  visit: (node: any, parent?: any) => void,
  parent?: any,
): void {
  if (node === null || typeof node !== "object") {
    return;
  }

  if (typeof node.type === "string") {
    visit(node, parent);
  }

  for (const key of Object.keys(node)) {
    if (key === "span" || key === "ctxt" || key === "type" || key === "raw") {
      continue;
    }

    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        visitNode(child, visit, node);
      }
      continue;
    }

    visitNode(value, visit, node);
  }
}
