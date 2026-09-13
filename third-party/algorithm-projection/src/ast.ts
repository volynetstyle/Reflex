import ts from "typescript";
import type { SourceLocation } from "./model.js";
export const textOf = (node: ts.Node, source: ts.SourceFile): string =>
  node.getText(source);
export function locationOf(
  node: ts.Node,
  source: ts.SourceFile,
): SourceLocation {
  const p = source.getLineAndCharacterOfPosition(node.getStart(source));
  return { file: source.fileName, line: p.line + 1, column: p.character + 1 };
}
export function findFunction(
  source: ts.SourceFile,
  name: string,
): ts.FunctionLikeDeclaration {
  let found: ts.FunctionLikeDeclaration | undefined;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (
      (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) &&
      node.name?.text === name
    )
      found = node;
    else if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) ||
        ts.isFunctionExpression(node.initializer))
    )
      found = node.initializer;
    else if (ts.isMethodDeclaration(node) && node.name.getText(source) === name)
      found = node;
    else ts.forEachChild(node, visit);
  };
  visit(source);
  if (!found)
    throw new Error(
      `Function ${JSON.stringify(name)} was not found in ${source.fileName}`,
    );
  return found;
}
export function propertyPath(e: ts.Expression): string | undefined {
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) {
    const r = propertyPath(e.expression);
    return r ? `${r}.${e.name.text}` : undefined;
  }
  if (ts.isElementAccessExpression(e) && e.argumentExpression) {
    const r = propertyPath(e.expression);
    return r ? `${r}[${e.argumentExpression.getText()}]` : undefined;
  }
  return undefined;
}
export function walk(root: ts.Node, visitor: (node: ts.Node) => void): void {
  const visit = (node: ts.Node): void => {
    visitor(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
}
