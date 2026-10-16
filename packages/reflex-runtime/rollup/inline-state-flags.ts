import ts from "typescript";

/**
 * Build-time inlining of the node state flags (src/kernel/shape/meta.ts).
 *
 * Bundlers keep the flags as module bindings: esbuild emits them as `var`,
 * Terser runs with `reduce_vars: false`, and the bundles export them. V8 then
 * loads every flag from a module cell and checks its tag at each use, so a
 * mask such as `Visited | Revalidate` costs two loads, two checks and an `or`
 * on every watcher run instead of one immediate operand.
 *
 * This transform replaces imported flag references with their numeric values
 * in every module that imports them, and nothing else: declarations, exports,
 * property names and type positions stay untouched. It fails the build instead
 * of skipping when a flag is shadowed or reassigned, or when meta.ts defines a
 * flag with an expression it cannot evaluate.
 */

/** Pure bit flags. Role bits and initial states depend on __DEV__. */
export const STATE_FLAG_NAMES = [
  "None",
  "Unknown",
  "Changed",
  "Both",
  "Visited",
  "Computing",
  "Watcher",
  "Scheduled",
  "Disposed",
  "WatcherCleanupPending",
  "Revalidate",
] as const;

export type StateFlags = ReadonlyMap<string, number>;

/** Evaluates the flag declarations of a meta.ts source (any revision). */
export function readStateFlags(metaSource: string): StateFlags {
  const file = ts.createSourceFile(
    "meta.ts",
    metaSource,
    ts.ScriptTarget.Latest,
    true,
  );
  const flags = new Map<string, number>();
  const evaluate = (node: ts.Expression): number => {
    if (ts.isParenthesizedExpression(node)) return evaluate(node.expression);
    if (ts.isNumericLiteral(node)) return Number(node.text);
    if (ts.isIdentifier(node) && flags.has(node.text))
      return flags.get(node.text)!;
    if (ts.isBinaryExpression(node)) {
      const left = evaluate(node.left);
      const right = evaluate(node.right);
      switch (node.operatorToken.kind) {
        case ts.SyntaxKind.LessThanLessThanToken:
          return left << right;
        case ts.SyntaxKind.BarToken:
          return left | right;
      }
    }
    throw new Error(
      `inline-state-flags: cannot evaluate meta.ts initializer "${node.getText(file)}"`,
    );
  };
  const wanted = new Set<string>(STATE_FLAG_NAMES);
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name)) continue;
      const name = declaration.name.text;
      if (!wanted.has(name) || declaration.initializer === undefined) continue;
      flags.set(name, evaluate(declaration.initializer));
    }
  }
  // Older revisions predate some flags; the core ones must always exist.
  for (const name of ["Unknown", "Changed", "Both", "Visited", "Computing"])
    if (!flags.has(name))
      throw new Error(`inline-state-flags: meta.ts does not define ${name}`);
  return flags;
}

const FLAG_SOURCE = /(^|\/)(shape|meta)(\/index|\/meta)?(\.[cm]?[jt]s)?$/;

function isTypePosition(node: ts.Node): boolean {
  for (let p: ts.Node | undefined = node.parent; p; p = p.parent) {
    if (ts.isTypeNode(p) || ts.isTypeAliasDeclaration(p)) return true;
    if (ts.isInterfaceDeclaration(p)) return true;
    if (ts.isExpression(p) || ts.isStatement(p)) return false;
  }
  return false;
}

export interface InlineResult {
  code: string;
  replaced: number;
}

/**
 * Replaces references to imported state flags with numeric literals.
 * Returns null when the module imports no flag.
 */
export function inlineStateFlags(
  code: string,
  fileName: string,
  flags: StateFlags,
): InlineResult | null {
  if (!code.includes("import")) return null;
  const kind = /\.[cm]?tsx?$/.test(fileName)
    ? ts.ScriptKind.TS
    : ts.ScriptKind.JS;
  const file = ts.createSourceFile(
    fileName,
    code,
    ts.ScriptTarget.Latest,
    true,
    kind,
  );

  // local binding name -> flag value
  const locals = new Map<string, number>();
  for (const statement of file.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !FLAG_SOURCE.test(statement.moduleSpecifier.text)
    )
      continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      if (element.isTypeOnly) continue;
      const imported = (element.propertyName ?? element.name).text;
      const value = flags.get(imported);
      if (value !== undefined) locals.set(element.name.text, value);
    }
  }
  if (locals.size === 0) return null;

  const edits: { start: number; end: number; text: string }[] = [];
  const visit = (node: ts.Node): void => {
    // Fail closed on any other binding or write of an inlined name.
    if (
      (ts.isVariableDeclaration(node) ||
        ts.isParameter(node) ||
        ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node) ||
        ts.isBindingElement(node)) &&
      node.name &&
      ts.isIdentifier(node.name) &&
      locals.has(node.name.text)
    )
      throw new Error(
        `inline-state-flags: ${fileName} shadows state flag ${node.name.text}`,
      );
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
      ts.isIdentifier(node.left) &&
      locals.has(node.left.text)
    )
      throw new Error(
        `inline-state-flags: ${fileName} assigns state flag ${node.left.text}`,
      );

    if (ts.isShorthandPropertyAssignment(node) && locals.has(node.name.text)) {
      edits.push({
        start: node.name.getStart(file),
        end: node.name.end,
        text: `${node.name.text}: ${locals.get(node.name.text)}`,
      });
      return;
    }
    if (ts.isIdentifier(node) && locals.has(node.text)) {
      const parent = node.parent;
      const isReference =
        !ts.isImportSpecifier(parent) &&
        !ts.isExportSpecifier(parent) &&
        !(ts.isPropertyAccessExpression(parent) && parent.name === node) &&
        !(ts.isPropertyAssignment(parent) && parent.name === node) &&
        !(
          (ts.isMethodDeclaration(parent) ||
            ts.isPropertyDeclaration(parent) ||
            ts.isPropertySignature(parent)) &&
          parent.name === node
        ) &&
        !ts.isQualifiedName(parent) &&
        !isTypePosition(node);
      if (isReference)
        edits.push({
          start: node.getStart(file),
          end: node.end,
          text: `${locals.get(node.text)} /* ${node.text} */`,
        });
      return;
    }
    ts.forEachChild(node, visit);
  };
  for (const statement of file.statements)
    if (!ts.isImportDeclaration(statement)) visit(statement);

  if (edits.length === 0) return null;
  let out = code;
  for (const edit of edits.sort((a, b) => b.start - a.start))
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  return { code: out, replaced: edits.length };
}
