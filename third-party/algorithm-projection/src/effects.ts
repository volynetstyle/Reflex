import ts from "typescript";
import { locationOf, propertyPath, textOf, walk } from "./ast.js";
import type {
  BranchFact,
  CallEffect,
  LoopFact,
  ReadEffect,
  SourceLocation,
  StackCandidate,
  StateTransition,
  WriteEffect,
} from "./model.js";
export interface ExtractedFacts {
  loops: LoopFact[];
  branches: BranchFact[];
  reads: ReadEffect[];
  writes: WriteEffect[];
  calls: CallEffect[];
  stateTransitions: StateTransition[];
  stackCandidates: StackCandidate[];
}
export function extractFacts(
  fn: ts.FunctionLikeDeclaration,
  source: ts.SourceFile,
  checker: ts.TypeChecker,
): ExtractedFacts {
  const loops: LoopFact[] = [],
    branches: BranchFact[] = [],
    reads: ReadEffect[] = [],
    writes: WriteEffect[] = [],
    calls: CallEffect[] = [],
    stateTransitions: StateTransition[] = [];
  const indexAliases = new Map<string, string>();
  const indexPops = new Map<string, number>();
  const indexDeltas = new Map<
    string,
    { increments: number; decrements: number }
  >();
  const indexedAccesses = new Map<
    string,
    {
      storage: string;
      index: string;
      writes: number;
      reads: number;
      location: SourceLocation;
    }
  >();
  const stack = new Map<
    string,
    {
      storage: string;
      index: string;
      pushes: number;
      pops: number;
      location: SourceLocation;
    }
  >();
  const guards: { node: ts.Node; text: string }[] = [];
  walk(fn.body ?? fn, (node) => {
    if (insideProjectionInstrumentation(node, source)) return;
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isPrefixUnaryExpression(node.initializer) &&
      node.initializer.operator === ts.SyntaxKind.MinusMinusToken
    ) {
      const index = textOf(node.initializer.operand, source);
      indexAliases.set(node.name.text, index);
      indexPops.set(index, (indexPops.get(index) ?? 0) + 1);
    }
    if (ts.isIfStatement(node)) {
      const condition = textOf(node.expression, source);
      branches.push({
        kind: "if",
        condition,
        location: locationOf(node, source),
      });
      guards.push({ node: node.thenStatement, text: condition });
      if (node.elseStatement)
        guards.push({ node: node.elseStatement, text: `!(${condition})` });
    } else if (ts.isSwitchStatement(node))
      branches.push({
        kind: "switch",
        condition: textOf(node.expression, source),
        location: locationOf(node, source),
      });
    else if (ts.isConditionalExpression(node))
      branches.push({
        kind: "conditional",
        condition: textOf(node.condition, source),
        location: locationOf(node, source),
      });
    const loop = loopOf(node, source);
    if (loop) loops.push(loop);
    if (ts.isCallExpression(node))
      calls.push({
        target: textOf(node.expression, source),
        arguments: node.arguments.map((x) => textOf(x, source)),
        location: locationOf(node, source),
      });
    if (ts.isBinaryExpression(node) && assignment(node.operatorToken.kind)) {
      const target = propertyPath(node.left);
      if (target) {
        if (ts.isIdentifier(node.left)) {
          const delta = indexDelta(node, source);
          if (delta !== 0) {
            const counts = indexDeltas.get(target) ?? {
              increments: 0,
              decrements: 0,
            };
            if (delta > 0) counts.increments++;
            else counts.decrements++;
            indexDeltas.set(target, counts);
          }
        }
        const value = assignedValue(node, source),
          type = typeOf(node.left, checker),
          guard = guards.filter((x) => descendant(node, x.node)).at(-1)?.text;
        writes.push({
          target,
          value,
          ...(type ? { type } : {}),
          ...(guard ? { guard } : {}),
          location: locationOf(node, source),
        });
        if (
          ts.isPropertyAccessExpression(node.left) &&
          node.left.name.text === "state"
        ) {
          const owner = typeOf(node.left.expression, checker);
          const resolved =
            node.operatorToken.kind === ts.SyntaxKind.EqualsToken
              ? resolveAssignedValue(node.right, fn, source)
              : value;
          stateTransitions.push({
            kind: "state-transition",
            target:
              owner && owner !== "any"
                ? `${owner.replace(/<.*>$/u, "")}.state`
                : target,
            ...(node.operatorToken.kind === ts.SyntaxKind.EqualsToken
              ? inferFrom(resolved)
              : { from: target }),
            to: resolved,
            ...(guard ? { guard } : {}),
            location: locationOf(node, source),
          });
        }
      }
    }
    if (
      (ts.isPropertyAccessExpression(node) ||
        ts.isElementAccessExpression(node)) &&
      !writeTarget(node)
    ) {
      const target = propertyPath(node);
      if (target) {
        const type = typeOf(node, checker);
        reads.push({
          target,
          ...(type ? { type } : {}),
          location: locationOf(node, source),
        });
      }
    }
    if (ts.isElementAccessExpression(node) && node.argumentExpression) {
      const storage = propertyPath(node.expression),
        u = node.argumentExpression;
      if (storage && ts.isIdentifier(u)) {
        const key = `${storage}:${u.text}`;
        const access = indexedAccesses.get(key) ?? {
          storage,
          index: u.text,
          writes: 0,
          reads: 0,
          location: locationOf(node, source),
        };
        if (writeTarget(node)) {
          const assignmentNode = node.parent;
          if (
            ts.isBinaryExpression(assignmentNode) &&
            textOf(assignmentNode.right, source) !== "null!"
          )
            access.writes++;
        } else access.reads++;
        indexedAccesses.set(key, access);
      } else if (
        storage &&
        (ts.isPostfixUnaryExpression(u) || ts.isPrefixUnaryExpression(u))
      ) {
        const push = u.operator === ts.SyntaxKind.PlusPlusToken,
          pop = u.operator === ts.SyntaxKind.MinusMinusToken;
        if (push || pop) {
          const index = textOf(u.operand, source),
            key = `${storage}:${index}`,
            item = stack.get(key) ?? {
              storage,
              index,
              pushes: 0,
              pops: 0,
              location: locationOf(node, source),
            };
          if (push) item.pushes++;
          if (pop) item.pops++;
          stack.set(key, item);
        }
      }
    }
  });
  for (const [key, access] of indexedAccesses) {
    const deltas = indexDeltas.get(access.index);
    if (
      !deltas ||
      access.writes === 0 ||
      access.reads === 0 ||
      deltas.increments === 0 ||
      deltas.decrements === 0
    )
      continue;
    if (!stack.has(key)) {
      stack.set(key, {
        storage: access.storage,
        index: access.index,
        pushes: access.writes,
        pops: Math.min(access.reads, deltas.decrements),
        location: access.location,
      });
    }
  }
  for (const write of writes) {
    const match = /^(.*)\[([$A-Z_a-z][A-Z_a-z0-9$]*)\]$/u.exec(write.target);
    if (!match || write.value === "null!") continue;
    const storage = match[1]!;
    const index = match[2]!;
    const key = `${storage}:${index}`;
    const existing = stack.get(key);
    if (
      (existing?.pushes ?? 0) > 0 ||
      !reads.some((read) => read.target === write.target)
    )
      continue;
    const increments = writes.filter(
      (candidate) =>
        candidate.target === index && candidate.value === `${index} + 1`,
    ).length;
    const decrements = writes.filter(
      (candidate) =>
        candidate.target === index && candidate.value === `${index} - 1`,
    ).length;
    if (increments > 0 && decrements > 0) {
      stack.set(key, {
        storage,
        index,
        pushes: 1,
        pops: Math.max(existing?.pops ?? 0, decrements),
        location: write.location,
      });
    }
  }
  return {
    loops,
    branches,
    reads: unique(
      reads,
      (x) => `${x.target}:${x.location.line}:${x.location.column}`,
    ),
    writes,
    calls,
    stateTransitions,
    stackCandidates: [...stack.values()]
      .map((x) => ({ ...x, pops: x.pops || indexPops.get(x.index) || 0 }))
      .filter((x) => x.pushes && x.pops)
      .map((x) => ({ kind: "stack-candidate", ...x })),
  };
}
function loopOf(n: ts.Node, s: ts.SourceFile): LoopFact | undefined {
  const location = locationOf(n, s);
  if (ts.isForStatement(n))
    return {
      kind: "for",
      ...(n.initializer ? { iterator: textOf(n.initializer, s) } : {}),
      ...(n.condition ? { condition: textOf(n.condition, s) } : {}),
      ...(n.incrementor ? { update: textOf(n.incrementor, s) } : {}),
      location,
    };
  if (ts.isForInStatement(n) || ts.isForOfStatement(n))
    return {
      kind: ts.isForInStatement(n) ? "for-in" : "for-of",
      iterator: textOf(n.initializer, s),
      condition: textOf(n.expression, s),
      location,
    };
  if (ts.isWhileStatement(n))
    return { kind: "while", condition: textOf(n.expression, s), location };
  if (ts.isDoStatement(n))
    return { kind: "do-while", condition: textOf(n.expression, s), location };
  return;
}
function typeOf(n: ts.Node, c: ts.TypeChecker): string | undefined {
  try {
    return c.typeToString(c.getTypeAtLocation(n));
  } catch {
    return;
  }
}
function indexDelta(node: ts.BinaryExpression, source: ts.SourceFile): number {
  if (!ts.isIdentifier(node.left)) return 0;
  if (node.operatorToken.kind === ts.SyntaxKind.PlusEqualsToken) return 1;
  if (node.operatorToken.kind === ts.SyntaxKind.MinusEqualsToken) return -1;
  if (
    node.operatorToken.kind !== ts.SyntaxKind.EqualsToken ||
    !ts.isBinaryExpression(node.right)
  )
    return 0;
  if (
    textOf(node.right.left, source) !== node.left.text ||
    textOf(node.right.right, source) !== "1"
  )
    return 0;
  if (node.right.operatorToken.kind === ts.SyntaxKind.PlusToken) return 1;
  if (node.right.operatorToken.kind === ts.SyntaxKind.MinusToken) return -1;
  return 0;
}
function assignedValue(
  node: ts.BinaryExpression,
  source: ts.SourceFile,
): string {
  if (node.operatorToken.kind === ts.SyntaxKind.EqualsToken)
    return textOf(node.right, source);
  const operator = textOf(node.operatorToken, source).slice(0, -1);
  return `${textOf(node.left, source)} ${operator} ${textOf(node.right, source)}`;
}
const assignment = (k: ts.SyntaxKind): boolean =>
  k >= ts.SyntaxKind.FirstAssignment && k <= ts.SyntaxKind.LastAssignment;
const writeTarget = (n: ts.Node): boolean =>
  ts.isBinaryExpression(n.parent) &&
  n.parent.left === n &&
  assignment(n.parent.operatorToken.kind);
function descendant(n: ts.Node, a: ts.Node): boolean {
  for (let x: ts.Node | undefined = n; x; x = x.parent)
    if (x === a) return true;
  return false;
}
function inferFrom(value: string): { from?: string } {
  const found = /^\(?\s*([$A-Z_a-z][A-Z_a-z0-9$]*)\s*[&|^]/u.exec(value)?.[1];
  return found ? { from: found } : {};
}
function resolveAssignedValue(
  expression: ts.Expression,
  fn: ts.FunctionLikeDeclaration,
  source: ts.SourceFile,
): string {
  if (!ts.isIdentifier(expression)) return textOf(expression, source);
  let latest: ts.Expression | undefined;
  walk(fn.body ?? fn, (node) => {
    if (insideProjectionInstrumentation(node, source)) return;
    if (node.pos >= expression.pos) return;
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === expression.text &&
      node.initializer
    )
      latest = node.initializer;
    else if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left) &&
      node.left.text === expression.text
    )
      latest = node.right;
  });
  return latest ? textOf(latest, source) : expression.text;
}
function unique<T>(items: T[], key: (x: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((x) => {
    const k = key(x);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function insideProjectionInstrumentation(
  node: ts.Node,
  source: ts.SourceFile,
): boolean {
  for (
    let current: ts.Node | undefined = node;
    current;
    current = current.parent
  ) {
    if (!ts.isIfStatement(current)) continue;
    if (!ts.isIdentifier(current.expression)) continue;
    if (
      current.expression.text !== "__PROFILE__" &&
      current.expression.text !== "__DEV__"
    )
      continue;
    if (
      /\bobserveRuntime(?:Projection|Propagate|PushPath|PullPath|ReadConsumerPath)/u.test(
        current.thenStatement.getText(source),
      )
    )
      return true;
  }
  return false;
}
