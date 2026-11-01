import { defineRule } from "@tsslint/config";
import type TypeScript from "typescript";

type TS = typeof TypeScript;
type Node = TypeScript.Node;
type Expression = TypeScript.Expression;
type Symbol = TypeScript.Symbol;
type Checker = TypeScript.TypeChecker;

interface Directive {
  start: number;
  end: number;
  text: string;
}

/** Only real comment trivia, never text inside a string, template or regexp. */
function directives(ts: TS, file: TypeScript.SourceFile): Directive[] {
  const found = new Map<number, Directive>();
  const collect = (start: number, end: number) => {
    const text = file.text.slice(start, end);
    if (/^(?:\/\/|\/\*)\s*@jit\b/.test(text)) {
      found.set(start, { start, end, text });
    }
  };
  const pending: Node[] = [file];
  while (pending.length > 0) {
    const node = pending.pop()!;
    const children = node.getChildren(file);
    if (children.length > 0) {
      pending.push(...children);
    } else {
      ts.forEachLeadingCommentRange(file.text, node.pos, collect);
      ts.forEachTrailingCommentRange(file.text, node.end, collect);
    }
  }
  return [...found.values()].sort((a, b) => a.start - b.start);
}

function unwrapParentheses(ts: TS, expression: Expression): Expression {
  while (ts.isParenthesizedExpression(expression))
    expression = expression.expression;
  return expression;
}

/** TypeScript-only wrappers disappear at runtime and do not make eval indirect. */
function unwrapRuntimeExpression(ts: TS, expression: Expression): Expression {
  while (
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isTypeAssertionExpression(expression) ||
    ts.isNonNullExpression(expression) ||
    ts.isSatisfiesExpression(expression)
  ) {
    expression = expression.expression;
  }
  return expression;
}

/** A deliberately narrow source proof: a const initialized to an Int32. */
function isInt32Source(
  ts: TS,
  checker: Checker,
  symbol: Symbol | undefined,
): boolean {
  if (symbol === undefined || symbol.declarations?.length !== 1) return false;
  const declaration = symbol.declarations[0]!;
  if (
    !ts.isVariableDeclaration(declaration) ||
    declaration.initializer === undefined ||
    !ts.isVariableDeclarationList(declaration.parent) ||
    (declaration.parent.flags & ts.NodeFlags.Const) === 0
  )
    return false;

  const initial = unwrapParentheses(ts, declaration.initializer);
  if (
    ts.isBinaryExpression(initial) &&
    initial.operatorToken.kind === ts.SyntaxKind.BarToken
  ) {
    const right = unwrapParentheses(ts, initial.right);
    const leftType = checker.getTypeAtLocation(initial.left);
    return (
      ts.isNumericLiteral(right) &&
      Number(right.text) === 0 &&
      (leftType.flags & ts.TypeFlags.NumberLike) !== 0
    );
  }

  let sign = 1;
  let literal = initial;
  if (
    ts.isPrefixUnaryExpression(literal) &&
    (literal.operator === ts.SyntaxKind.MinusToken ||
      literal.operator === ts.SyntaxKind.PlusToken)
  ) {
    sign = literal.operator === ts.SyntaxKind.MinusToken ? -1 : 1;
    literal = literal.operand;
  }
  if (!ts.isNumericLiteral(literal)) return false;
  const value = sign * Number(literal.text.replaceAll("_", ""));
  return Number.isInteger(value) && value >= -2147483648 && value <= 2147483647;
}

function symbolAt(
  ts: TS,
  checker: Checker,
  node: TypeScript.Identifier,
): Symbol | undefined {
  const parent = node.parent;
  if (ts.isShorthandPropertyAssignment(parent) && parent.name === node) {
    return checker.getShorthandAssignmentValueSymbol(parent);
  }
  return checker.getSymbolAtLocation(node);
}

/** Find writes to a binding, including destructuring and for-in/of targets. */
function writeKind(
  ts: TS,
  identifier: TypeScript.Identifier,
): "update" | "other" | null {
  let target: Node = identifier;
  for (;;) {
    const parent = target.parent;
    if (
      ts.isParenthesizedExpression(parent) ||
      ts.isAsExpression(parent) ||
      ts.isTypeAssertionExpression(parent) ||
      ts.isNonNullExpression(parent) ||
      ts.isSatisfiesExpression(parent)
    ) {
      target = parent;
      continue;
    }
    if (
      (ts.isPrefixUnaryExpression(parent) ||
        ts.isPostfixUnaryExpression(parent)) &&
      parent.operand === target &&
      (parent.operator === ts.SyntaxKind.PlusPlusToken ||
        parent.operator === ts.SyntaxKind.MinusMinusToken)
    )
      return "update";
    if (
      ts.isBinaryExpression(parent) &&
      parent.left === target &&
      parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment
    )
      return "other";
    if (
      (ts.isForInStatement(parent) || ts.isForOfStatement(parent)) &&
      parent.initializer === target
    )
      return "other";
    if (
      (ts.isShorthandPropertyAssignment(parent) && parent.name === target) ||
      (ts.isPropertyAssignment(parent) && parent.initializer === target) ||
      (ts.isSpreadAssignment(parent) && parent.expression === target) ||
      (ts.isSpreadElement(parent) && parent.expression === target) ||
      ts.isArrayLiteralExpression(parent) ||
      ts.isObjectLiteralExpression(parent)
    ) {
      target = parent;
      continue;
    }
    return null;
  }
}

function isPrimitiveBoolean(ts: TS, type: TypeScript.Type): boolean {
  if (type.isUnion())
    return type.types.every((part) => isPrimitiveBoolean(ts, part));
  return (type.flags & ts.TypeFlags.BooleanLike) !== 0;
}

/** The checker establishes source-level premises, not V8's representation. */
export const jitContracts = defineRule(
  ({ typescript: ts, program, file, report }) => {
    if (!file.text.includes("@jit")) return;
    const markers = directives(ts, file);
    if (markers.length === 0) return;
    const checker = program.getTypeChecker();
    const statements: TypeScript.Statement[] = [];
    const collectStatements = (node: Node) => {
      if (ts.isStatement(node)) statements.push(node);
      ts.forEachChild(node, collectStatements);
    };
    collectStatements(file);
    statements.sort((a, b) => a.getStart(file) - b.getStart(file));

    const error = (message: string, node: Node) => {
      report(message, node.getStart(file), node.getEnd()).asError();
    };
    for (const marker of markers) {
      const lineStart = file.text.lastIndexOf("\n", marker.start - 1) + 1;
      const match = /^\/\/\s*@jit\s+(.+?)\s*$/.exec(marker.text);
      const statement = statements.find(
        (node) =>
          node.getStart(file) >= marker.end &&
          /^\s*$/.test(file.text.slice(marker.end, node.getStart(file))),
      );
      if (
        !match ||
        file.text.slice(lineStart, marker.start).trim() !== "" ||
        statement === undefined
      ) {
        report(
          "@jit must be a standalone line comment immediately before a statement.",
          marker.start,
          marker.end,
        ).asError();
        continue;
      }

      const provenance = /^int32-provenance\(([A-Za-z_$][\w$]*)\)$/.exec(
        match[1]!,
      );
      if (provenance) {
        if (
          !ts.isVariableStatement(statement) ||
          (statement.declarationList.flags & ts.NodeFlags.Let) === 0 ||
          statement.declarationList.declarations.length !== 1
        ) {
          error(
            "int32-provenance requires one local let declaration.",
            statement,
          );
          continue;
        }
        const declaration = statement.declarationList.declarations[0]!;
        const initializer =
          declaration.initializer &&
          unwrapParentheses(ts, declaration.initializer);
        if (
          !ts.isIdentifier(declaration.name) ||
          !initializer ||
          !ts.isIdentifier(initializer) ||
          initializer.text !== provenance[1]
        ) {
          error(
            "int32-provenance requires initialization from the named source binding.",
            declaration,
          );
          continue;
        }
        let scope: Node | undefined = declaration.parent;
        while (scope && !ts.isFunctionLike(scope)) scope = scope.parent;
        const tracked = checker.getSymbolAtLocation(declaration.name);
        if (
          !scope ||
          !tracked ||
          !isInt32Source(ts, checker, checker.getSymbolAtLocation(initializer))
        ) {
          error(
            "int32-provenance requires a function-local binding and a const source initialized by number | 0 or an Int32 literal.",
            declaration,
          );
          continue;
        }

        const inspect = (node: Node) => {
          if (ts.isCallExpression(node)) {
            const callee = unwrapRuntimeExpression(ts, node.expression);
            if (ts.isIdentifier(callee) && callee.text === "eval") {
              error(
                "int32-provenance does not allow direct eval in the enclosing function.",
                node,
              );
            }
          }
          if (ts.isWithStatement(node))
            error(
              "int32-provenance does not allow with in the enclosing function.",
              node,
            );
          if (
            ts.isIdentifier(node) &&
            node !== declaration.name &&
            symbolAt(ts, checker, node) === tracked &&
            writeKind(ts, node) === "other"
          ) {
            error(
              "int32-provenance permits only ++ or -- writes to the tracked binding.",
              node,
            );
          }
          ts.forEachChild(node, inspect);
        };
        inspect(scope);
      } else if (match[1] === "canonical-boolean") {
        if (!ts.isIfStatement(statement) && !ts.isWhileStatement(statement)) {
          error(
            "canonical-boolean requires an if or while condition.",
            statement,
          );
          continue;
        }
        const options = program.getCompilerOptions();
        if (!(options.strictNullChecks ?? options.strict ?? false)) {
          error("canonical-boolean requires strictNullChecks.", statement);
          continue;
        }
        const condition = unwrapParentheses(ts, statement.expression);
        const call = ts.isBinaryExpression(condition)
          ? unwrapParentheses(ts, condition.left)
          : undefined;
        if (
          !ts.isBinaryExpression(condition) ||
          condition.operatorToken.kind !==
            ts.SyntaxKind.EqualsEqualsEqualsToken ||
          condition.right.kind !== ts.SyntaxKind.TrueKeyword ||
          !call ||
          !ts.isCallExpression(call) ||
          !isPrimitiveBoolean(ts, checker.getTypeAtLocation(call))
        ) {
          error(
            "canonical-boolean requires a primitive boolean call compared with === true.",
            condition,
          );
        }
      } else {
        report(
          `Unknown @jit contract: ${match[1]}.`,
          marker.start,
          marker.end,
        ).asError();
      }
    }
  },
);
