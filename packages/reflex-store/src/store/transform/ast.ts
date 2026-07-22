/* eslint-disable @typescript-eslint/no-explicit-any */
import { parseSync } from "@swc/core";
import type { Module } from "@swc/core";

export const DUMMY_SPAN = {
  start: 0,
  end: 0,
  ctxt: 0,
};

export function parseModule(code: string, id: string): Module {
  const isTypeScript = /\.([cm]?ts)x?$/i.test(id);

  return parseSync(code, {
    syntax: isTypeScript ? "typescript" : "ecmascript",
    tsx: /\.([cm]?ts)x$/i.test(id),
    jsx: /\.([cm]?jsx)$/i.test(id),
    target: "es2022",
  });
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

export function visitNode(node: any, visit: (node: any) => void): void {
  if (node === null || typeof node !== "object") {
    return;
  }

  if (typeof node.type === "string") {
    visit(node);
  }

  for (const key of Object.keys(node)) {
    if (key === "span" || key === "ctxt" || key === "type" || key === "raw") {
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
