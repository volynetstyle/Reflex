import ts from "typescript";

/**
 * Build-time inlining of the runtime's compile-time constants.
 *
 * Bundlers keep module-level constants as bindings: esbuild emits them as
 * `var`, Terser runs with `reduce_vars: false`, and the bundles export many of
 * them. V8 then loads each constant from a module cell or context slot and
 * checks its representation at every use, so a mask such as
 * `Visited | Revalidate` costs loads, checks and an `or` instead of one
 * immediate operand.
 *
 * A constant here is a top-level `const` of the runtime sources whose
 * initializer evaluates at build time to a number or boolean: literals,
 * arithmetic and bitwise operators, conditionals, compile-time defines
 * (`__DEV__`, ...) and other constants. Values never change at run time, so
 * replacing references with literals changes only what the compiler sees.
 *
 * References are replaced in the module that declares the constant and in
 * modules that import it from an internal module. Declarations, exports,
 * property names and type positions stay untouched. The transform fails the
 * build instead of skipping when an inlined name is shadowed or written.
 */

/** Node state flags (src/kernel/shape/meta.ts): must always be inlined. */
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

export type ConstantValue = number | boolean;
export type ConstantTable = ReadonlyMap<string, ConstantValue>;
export type Defines = Readonly<Record<string, string>>;

export interface SourceFile {
  path: string;
  code: string;
}

const UNEVALUABLE = Symbol("unevaluable");
type Evaluated = ConstantValue | typeof UNEVALUABLE;

function evaluateWith(
  lookup: (name: string) => Evaluated | undefined,
): (node: ts.Expression) => Evaluated {
  const evaluate = (node: ts.Expression): Evaluated => {
    if (ts.isParenthesizedExpression(node)) return evaluate(node.expression);
    if (ts.isNumericLiteral(node)) return Number(node.text.replace(/_/g, ""));
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (ts.isIdentifier(node)) return lookup(node.text) ?? UNEVALUABLE;
    if (ts.isPrefixUnaryExpression(node)) {
      const value = evaluate(node.operand);
      if (value === UNEVALUABLE) return value;
      switch (node.operator) {
        case ts.SyntaxKind.TildeToken:
          return ~Number(value);
        case ts.SyntaxKind.MinusToken:
          return -Number(value);
        case ts.SyntaxKind.PlusToken:
          return +Number(value);
        case ts.SyntaxKind.ExclamationToken:
          return !value;
      }
      return UNEVALUABLE;
    }
    if (ts.isConditionalExpression(node)) {
      const test = evaluate(node.condition);
      if (test === UNEVALUABLE) return test;
      return evaluate(test ? node.whenTrue : node.whenFalse);
    }
    if (ts.isBinaryExpression(node)) {
      const left = evaluate(node.left);
      const right = evaluate(node.right);
      if (left === UNEVALUABLE || right === UNEVALUABLE) return UNEVALUABLE;
      const a = Number(left);
      const b = Number(right);
      switch (node.operatorToken.kind) {
        case ts.SyntaxKind.BarToken:
          return a | b;
        case ts.SyntaxKind.AmpersandToken:
          return a & b;
        case ts.SyntaxKind.CaretToken:
          return a ^ b;
        case ts.SyntaxKind.LessThanLessThanToken:
          return a << b;
        case ts.SyntaxKind.GreaterThanGreaterThanToken:
          return a >> b;
        case ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken:
          return a >>> b;
        case ts.SyntaxKind.PlusToken:
          return a + b;
        case ts.SyntaxKind.MinusToken:
          return a - b;
        case ts.SyntaxKind.AsteriskToken:
          return a * b;
        case ts.SyntaxKind.AmpersandAmpersandToken:
          return left && right;
        case ts.SyntaxKind.BarBarToken:
          return left || right;
      }
    }
    return UNEVALUABLE;
  };
  return evaluate;
}

function parse(file: SourceFile): ts.SourceFile {
  const kind = /\.[cm]?tsx?$/.test(file.path)
    ? ts.ScriptKind.TS
    : ts.ScriptKind.JS;
  return ts.createSourceFile(
    file.path,
    file.code,
    ts.ScriptTarget.Latest,
    true,
    kind,
  );
}

function defineValue(raw: string): ConstantValue | undefined {
  if (raw === "true") return true;
  if (raw === "false") return false;
  const number = Number(raw);
  return Number.isFinite(number) ? number : undefined;
}

/**
 * Evaluates the compile-time constants of a set of runtime sources. A name
 * declared as a constant with different values in different modules is
 * ambiguous and excluded.
 */
export function collectConstants(
  files: readonly SourceFile[],
  defines: Defines,
): ConstantTable {
  const declarations: { name: string; init: ts.Expression }[] = [];
  for (const file of files) {
    const sf = parse(file);
    for (const statement of sf.statements) {
      if (
        !ts.isVariableStatement(statement) ||
        (statement.declarationList.flags & ts.NodeFlags.Const) === 0
      )
        continue;
      for (const declaration of statement.declarationList.declarations)
        if (ts.isIdentifier(declaration.name) && declaration.initializer)
          declarations.push({
            name: declaration.name.text,
            init: declaration.initializer,
          });
    }
  }

  const values = new Map<string, Evaluated>();
  const ambiguous = new Set<string>();
  for (const [name, raw] of Object.entries(defines)) {
    const value = defineValue(raw);
    if (value !== undefined) values.set(name, value);
  }
  // Fixed point: a constant may reference one declared later or elsewhere.
  for (let changed = true; changed; ) {
    changed = false;
    for (const { name, init } of declarations) {
      if (ambiguous.has(name)) continue;
      const value = evaluateWith((n) => (ambiguous.has(n) ? undefined : values.get(n)))(init);
      if (value === UNEVALUABLE) continue;
      const known = values.get(name);
      if (known === undefined) {
        values.set(name, value);
        changed = true;
      } else if (known !== value) {
        ambiguous.add(name);
        values.delete(name);
        changed = true;
      }
    }
  }
  const table = new Map<string, ConstantValue>();
  for (const { name } of declarations) {
    const value = values.get(name);
    if (value !== undefined && value !== UNEVALUABLE && !ambiguous.has(name))
      table.set(name, value);
  }
  for (const name of STATE_FLAG_NAMES.slice(0, 5))
    if (!table.has(name))
      throw new Error(`inline-constants: state flag ${name} is not a constant`);
  return table;
}

const INTERNAL_SPECIFIER = /^(\.{1,2}\/|@runtime(\/|$))/;

function isTypePosition(node: ts.Node): boolean {
  for (let p: ts.Node | undefined = node.parent; p; p = p.parent) {
    if (ts.isTypeNode(p) || ts.isTypeAliasDeclaration(p)) return true;
    if (ts.isInterfaceDeclaration(p) || ts.isEnumDeclaration(p)) return true;
    if (ts.isExpression(p) || ts.isStatement(p)) return false;
  }
  return false;
}

function literal(value: ConstantValue): string {
  if (typeof value === "boolean") return String(value);
  return value < 0 ? `(${value})` : String(value);
}

export interface InlineResult {
  code: string;
  replaced: number;
}

/**
 * Replaces references to compile-time constants with literals in one module.
 * Returns null when the module references no constant.
 */
export function inlineConstants(
  code: string,
  fileName: string,
  table: ConstantTable,
): InlineResult | null {
  const sf = parse({ path: fileName, code });

  // Bindings of this module that denote constants: own top-level constants
  // and named imports of constants from internal modules.
  const locals = new Map<string, ConstantValue>();
  const own = new Set<ts.Node>();
  for (const statement of sf.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      INTERNAL_SPECIFIER.test(statement.moduleSpecifier.text)
    ) {
      const bindings = statement.importClause?.namedBindings;
      if (statement.importClause?.isTypeOnly) continue;
      if (!bindings || !ts.isNamedImports(bindings)) continue;
      for (const element of bindings.elements) {
        if (element.isTypeOnly) continue;
        const value = table.get((element.propertyName ?? element.name).text);
        if (value !== undefined) locals.set(element.name.text, value);
      }
    } else if (
      ts.isVariableStatement(statement) &&
      (statement.declarationList.flags & ts.NodeFlags.Const) !== 0
    ) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue;
        const value = table.get(declaration.name.text);
        if (value === undefined) continue;
        locals.set(declaration.name.text, value);
        own.add(declaration);
      }
    }
  }
  if (locals.size === 0) return null;

  const edits: { start: number; end: number; text: string }[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isVariableDeclaration(node) ||
        ts.isParameter(node) ||
        ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node) ||
        ts.isBindingElement(node)) &&
      !own.has(node) &&
      node.name &&
      ts.isIdentifier(node.name) &&
      locals.has(node.name.text)
    )
      throw new Error(
        `inline-constants: ${fileName} shadows constant ${node.name.text}`,
      );
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
      ts.isIdentifier(node.left) &&
      locals.has(node.left.text)
    )
      throw new Error(
        `inline-constants: ${fileName} assigns constant ${node.left.text}`,
      );

    if (ts.isShorthandPropertyAssignment(node) && locals.has(node.name.text)) {
      edits.push({
        start: node.name.getStart(sf),
        end: node.name.end,
        text: `${node.name.text}: ${literal(locals.get(node.name.text)!)}`,
      });
      return;
    }
    if (ts.isIdentifier(node) && locals.has(node.text)) {
      const parent = node.parent;
      const isReference =
        !ts.isImportSpecifier(parent) &&
        !ts.isExportSpecifier(parent) &&
        !(ts.isVariableDeclaration(parent) && parent.name === node) &&
        !(ts.isPropertyAccessExpression(parent) && parent.name === node) &&
        !(ts.isPropertyAssignment(parent) && parent.name === node) &&
        !(
          (ts.isMethodDeclaration(parent) ||
            ts.isPropertyDeclaration(parent) ||
            ts.isPropertySignature(parent) ||
            ts.isEnumMember(parent)) &&
          parent.name === node
        ) &&
        !ts.isQualifiedName(parent) &&
        !isTypePosition(node);
      if (isReference)
        edits.push({
          start: node.getStart(sf),
          end: node.end,
          text: `${literal(locals.get(node.text)!)} /* ${node.text} */`,
        });
      return;
    }
    ts.forEachChild(node, visit);
  };
  for (const statement of sf.statements)
    if (!ts.isImportDeclaration(statement)) visit(statement);

  if (edits.length === 0) return null;
  let out = code;
  for (const edit of edits.sort((a, b) => b.start - a.start))
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  return { code: out, replaced: edits.length };
}
