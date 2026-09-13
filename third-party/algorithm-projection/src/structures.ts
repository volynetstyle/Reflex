import ts from "typescript";
import { locationOf, propertyPath, textOf, walk } from "./ast.js";
import type { LinkedTraversal } from "./model.js";
export function extractLinkedTraversals(
  fn: ts.FunctionLikeDeclaration,
  source: ts.SourceFile,
  checker: ts.TypeChecker,
): LinkedTraversal[] {
  const out: LinkedTraversal[] = [];
  walk(fn.body ?? fn, (node) => {
    if (
      !ts.isForStatement(node) ||
      !node.initializer ||
      !node.condition ||
      !node.incrementor
    )
      return;
    const init = readInit(node.initializer);
    const next = readNext(node.incrementor);
    if (!init || !next || init.variable !== next.variable) return;
    const termination = terminationOf(node.condition, init.variable, source);
    if (!termination) return;
    const type = checker
      .typeToString(checker.getTypeAtLocation(init.name))
      .split(" | ")
      .filter((x) => x !== "null" && x !== "undefined")
      .join(" | ");
    out.push({
      kind: "linked-traversal",
      variable: init.variable,
      ...(type && type !== "any" ? { type } : {}),
      start: textOf(init.start, source),
      continuation: textOf(next.expression, source),
      termination,
      location: locationOf(node, source),
    });
  });
  return out;
}
function readInit(
  i: ts.ForInitializer,
): { variable: string; name: ts.Identifier; start: ts.Expression } | undefined {
  if (!ts.isVariableDeclarationList(i) || i.declarations.length !== 1) return;
  const d = i.declarations[0];
  if (!d || !ts.isIdentifier(d.name) || !d.initializer) return;
  return { variable: d.name.text, name: d.name, start: d.initializer };
}
function readNext(
  e: ts.Expression,
): { variable: string; expression: ts.Expression } | undefined {
  if (
    !ts.isBinaryExpression(e) ||
    e.operatorToken.kind !== ts.SyntaxKind.EqualsToken ||
    !ts.isIdentifier(e.left)
  )
    return;
  const path = propertyPath(e.right);
  if (!path?.startsWith(`${e.left.text}.`)) return;
  return { variable: e.left.text, expression: e.right };
}
function terminationOf(
  e: ts.Expression,
  v: string,
  s: ts.SourceFile,
): string | undefined {
  if (!ts.isBinaryExpression(e)) return;
  const l = textOf(e.left, s),
    r = textOf(e.right, s);
  if (l !== v && r !== v) return;
  const other = l === v ? r : l;
  const k = e.operatorToken.kind;
  if (
    k === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
    k === ts.SyntaxKind.ExclamationEqualsToken
  )
    return `${v} === ${other}`;
  if (
    k === ts.SyntaxKind.EqualsEqualsEqualsToken ||
    k === ts.SyntaxKind.EqualsEqualsToken
  )
    return `${v} !== ${other}`;
  return;
}
