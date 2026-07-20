import type { Plugin } from "rollup";

type AstNode = {
  readonly type: string;
  readonly start: number;
  readonly end: number;
  readonly [key: string]: unknown;
};

type Replacement = {
  readonly start: number;
  readonly end: number;
  readonly text: string;
};

type InlineTarget =
  | { readonly kind: "discard" }
  | { readonly kind: "assign"; readonly target: string };

type IIFEAnalysis = {
  readonly returns: readonly AstNode[];
};

const INLINE_IIFE_SAFE_UNARY = new Set(["void", "!"]);

function isAstNode(value: unknown): value is AstNode {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { type?: unknown }).type === "string" &&
    typeof (value as { start?: unknown }).start === "number" &&
    typeof (value as { end?: unknown }).end === "number"
  );
}

function walkAst(
  node: AstNode,
  enter: (node: AstNode) => boolean | void,
): void {
  if (enter(node) === false) return;

  for (const key of Object.keys(node)) {
    if (key === "type" || key === "start" || key === "end" || key === "loc") {
      continue;
    }

    const value = node[key];

    if (Array.isArray(value)) {
      for (const child of value) {
        if (isAstNode(child)) walkAst(child, enter);
      }
      continue;
    }

    if (isAstNode(value)) walkAst(value, enter);
  }
}

function isFunctionLikeNode(node: AstNode): boolean {
  return (
    node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression" ||
    node.type === "ArrowFunctionExpression"
  );
}

function unwrapExpression(node: AstNode): AstNode {
  let current = node;

  while (current.type === "ParenthesizedExpression") {
    const expression = current.expression;
    if (!isAstNode(expression)) return current;
    current = expression;
  }

  return current;
}

function getDirectIIFECall(node: AstNode): AstNode | null {
  const expression = unwrapExpression(node);
  return expression.type === "CallExpression" ? expression : null;
}

function getUnusedIIFECall(node: AstNode): AstNode | null {
  const expression = unwrapExpression(node);

  if (expression.type === "CallExpression") {
    return expression;
  }

  if (expression.type === "UnaryExpression") {
    const operator = expression.operator;
    const argument = expression.argument;

    if (
      typeof operator === "string" &&
      INLINE_IIFE_SAFE_UNARY.has(operator) &&
      isAstNode(argument)
    ) {
      return getDirectIIFECall(argument);
    }
  }

  return null;
}

function getDirectIIFEFunction(call: AstNode): AstNode | null {
  const callee = call.callee;
  if (!isAstNode(callee)) return null;

  const unwrapped = unwrapExpression(callee);
  return unwrapped.type === "FunctionExpression" ||
    unwrapped.type === "ArrowFunctionExpression"
    ? unwrapped
    : null;
}

function hasDirectEval(node: AstNode): boolean {
  let found = false;

  walkAst(node, (current) => {
    if (found) return false;

    if (current.type === "CallExpression") {
      const callee = current.callee;
      if (
        isAstNode(callee) &&
        callee.type === "Identifier" &&
        callee.name === "eval"
      ) {
        found = true;
        return false;
      }
    }
  });

  return found;
}

function hasUseStrictDirective(fn: AstNode): boolean {
  const body = fn.body as AstNode | undefined;
  const statements = body?.body;

  if (!Array.isArray(statements)) return false;

  for (const statement of statements) {
    if (!isAstNode(statement) || statement.type !== "ExpressionStatement") {
      return false;
    }

    const expression = statement.expression as AstNode | undefined;
    const value = expression?.value;

    if (expression?.type !== "Literal" || typeof value !== "string") {
      return false;
    }

    if (value === "use strict") return true;
  }

  return false;
}

function hasOnlySimpleParams(fn: AstNode): boolean {
  const params = fn.params;
  if (!Array.isArray(params)) return false;

  const seen = new Set<string>();

  for (const param of params) {
    if (!isAstNode(param) || param.type !== "Identifier") return false;

    const name = param.name;
    if (typeof name !== "string" || seen.has(name)) return false;

    seen.add(name);
  }

  return true;
}

function hasInlineableArguments(call: AstNode): boolean {
  const args = call.arguments;
  return (
    Array.isArray(args) &&
    args.every((arg) => isAstNode(arg) && arg.type !== "SpreadElement")
  );
}

function analyzeInlineableIIFE(fn: AstNode): IIFEAnalysis | null {
  if (fn.async === true || fn.generator === true) return null;
  if (!hasOnlySimpleParams(fn)) return null;
  if (hasUseStrictDirective(fn)) return null;

  const body = fn.body as AstNode | undefined;
  if (!isAstNode(body)) return null;

  if (body.type !== "BlockStatement" && fn.type !== "ArrowFunctionExpression") {
    return null;
  }

  const returns: AstNode[] = [];
  let safe = true;

  walkAst(body, (node) => {
    if (!safe) return false;

    if (node !== body) {
      // Nested functions/classes have independent scopes and control flow. Do not
      // inspect return/this/arguments inside them as if they belonged to the IIFE.
      if (isFunctionLikeNode(node) || node.type === "ClassExpression")
        return false;

      if (
        node.type === "FunctionDeclaration" ||
        node.type === "ClassDeclaration"
      ) {
        safe = false;
        return false;
      }
    }

    if (node.type === "VariableDeclaration" && node.kind === "var") {
      safe = false;
      return false;
    }

    if (node.type === "ReturnStatement") {
      if (body.type !== "BlockStatement") {
        safe = false;
        return false;
      }

      returns.push(node);
      return;
    }

    if (node.type === "Super" || node.type === "MetaProperty") {
      safe = false;
      return false;
    }

    if (fn.type === "FunctionExpression" && node.type === "ThisExpression") {
      safe = false;
      return false;
    }

    if (node.type === "Identifier" && node.name === "arguments") {
      safe = false;
      return false;
    }

    if (node.type === "CallExpression") {
      const callee = node.callee;
      if (
        isAstNode(callee) &&
        callee.type === "Identifier" &&
        callee.name === "eval"
      ) {
        safe = false;
        return false;
      }
    }
  });

  return safe ? { returns } : null;
}

function createUniqueName(code: string, prefix: string, index: number): string {
  let attempt = 0;
  let name = `${prefix}${index}`;

  while (code.includes(name)) {
    attempt++;
    name = `${prefix}${index}_${attempt}`;
  }

  return name;
}

function createParamPrefix(code: string, fn: AstNode, call: AstNode): string {
  const params = fn.params as readonly AstNode[];
  const args = Array.isArray(call.arguments)
    ? (call.arguments as readonly AstNode[])
    : [];

  const paramInitializers = params.map((param, paramIndex) => {
    const arg = args[paramIndex];
    const name = param.name as string;
    const value = isAstNode(arg) ? code.slice(arg.start, arg.end) : "undefined";
    return `${name}=(${value})`;
  });

  const extraArgEffects = args
    .slice(params.length)
    .filter(isAstNode)
    .map((arg) => `void (${code.slice(arg.start, arg.end)});`);

  return [
    paramInitializers.length > 0 ? `let ${paramInitializers.join(",")};` : "",
    ...extraArgEffects,
  ].join("");
}

function createReturnReplacement(
  code: string,
  returnNode: AstNode,
  target: InlineTarget,
  label: string,
): string {
  const argument = returnNode.argument as AstNode | null | undefined;

  if (target.kind === "discard") {
    return argument
      ? `{void (${code.slice(argument.start, argument.end)});break ${label};}`
      : `{break ${label};}`;
  }

  return argument
    ? `{${target.target}=(${code.slice(argument.start, argument.end)});break ${label};}`
    : `{${target.target}=undefined;break ${label};}`;
}

function replaceReturnsInBody(
  code: string,
  bodyStart: number,
  bodyEnd: number,
  returns: readonly AstNode[],
  target: InlineTarget,
  label: string,
): string {
  if (returns.length === 0) return code.slice(bodyStart, bodyEnd);

  const orderedReturns = [...returns].sort(
    (left, right) => left.start - right.start,
  );
  let result = "";
  let cursor = bodyStart;

  for (const returnNode of orderedReturns) {
    result += code.slice(cursor, returnNode.start);
    result += createReturnReplacement(code, returnNode, target, label);
    cursor = returnNode.end;
  }

  result += code.slice(cursor, bodyEnd);
  return result;
}

function createInlineIIFEBodyBlock(
  code: string,
  call: AstNode,
  fn: AstNode,
  target: InlineTarget,
  label: string,
): string | null {
  const analysis = analyzeInlineableIIFE(fn);
  if (analysis === null || !hasInlineableArguments(call)) return null;

  const body = fn.body as AstNode;
  const prefix = createParamPrefix(code, fn, call);

  if (body.type !== "BlockStatement") {
    const expression = code.slice(body.start, body.end);
    return target.kind === "discard"
      ? `{${prefix}void (${expression});}`
      : `{${prefix}${target.target}=(${expression});}`;
  }

  const bodyText = replaceReturnsInBody(
    code,
    body.start + 1,
    body.end - 1,
    analysis.returns,
    target,
    label,
  );

  const fallthrough =
    target.kind === "assign" ? `${target.target}=undefined;` : "";
  const content = `${prefix}${bodyText}${fallthrough}`;

  return analysis.returns.length > 0 ? `${label}:{${content}}` : `{${content}}`;
}

function createInlineIIFEStatement(
  code: string,
  call: AstNode,
  fn: AstNode,
  target: InlineTarget,
  index: number,
): string | null {
  const label = createUniqueName(code, "__reflex_inline_iife_", index);
  return createInlineIIFEBodyBlock(code, call, fn, target, label);
}

function createAssigningInlineIIFEStatement(
  code: string,
  call: AstNode,
  fn: AstNode,
  assignmentTarget: string,
  index: number,
): string | null {
  const resultName = createUniqueName(code, "__reflex_iife_result_", index);
  const label = createUniqueName(code, "__reflex_inline_iife_", index);
  const block = createInlineIIFEBodyBlock(
    code,
    call,
    fn,
    { kind: "assign", target: resultName },
    label,
  );

  if (block === null) return null;

  // Assign the outer target after the simulated function body completes. This
  // preserves RHS-before-LHS-assignment semantics and avoids accidental writes to
  // a shadowed binding with the same name inside the inlined IIFE body.
  return `{let ${resultName};${block}${assignmentTarget}=${resultName};}`;
}

function createUnusedIIFEStatementReplacement(
  code: string,
  statement: AstNode,
  index: number,
): Replacement | null {
  const expression = statement.expression;
  if (!isAstNode(expression)) return null;

  const call = getUnusedIIFECall(expression);
  if (call === null) return null;

  const fn = getDirectIIFEFunction(call);
  if (fn === null) return null;

  const text = createInlineIIFEStatement(
    code,
    call,
    fn,
    { kind: "discard" },
    index,
  );
  if (text === null) return null;

  return { start: statement.start, end: statement.end, text };
}

function createAssignmentIIFEStatementReplacement(
  code: string,
  statement: AstNode,
  index: number,
): Replacement | null {
  const expression = statement.expression;
  if (!isAstNode(expression) || expression.type !== "AssignmentExpression")
    return null;
  if (expression.operator !== "=") return null;

  const left = expression.left;
  const right = expression.right;
  if (!isAstNode(left) || !isAstNode(right)) return null;

  // Deliberately narrow: member assignment can involve computed keys, getters,
  // proxies and setters. Identifier assignment covers generated hot-path IIFEs
  // without changing evaluation order of complex LHS expressions.
  if (left.type !== "Identifier") return null;

  const call = getDirectIIFECall(right);
  if (call === null) return null;

  const fn = getDirectIIFEFunction(call);
  if (fn === null) return null;

  const target = code.slice(left.start, left.end);
  const text = createAssigningInlineIIFEStatement(
    code,
    call,
    fn,
    target,
    index,
  );
  if (text === null) return null;

  return { start: statement.start, end: statement.end, text };
}

function createVariableIIFEDeclarationReplacement(
  code: string,
  statement: AstNode,
  index: number,
): Replacement | null {
  if (statement.type !== "VariableDeclaration") return null;
  if (statement.kind !== "const" && statement.kind !== "let") return null;

  const declarations = statement.declarations;
  if (!Array.isArray(declarations) || declarations.length !== 1) return null;

  const declaration = declarations[0];
  if (!isAstNode(declaration) || declaration.type !== "VariableDeclarator")
    return null;

  const id = declaration.id;
  const init = declaration.init;
  if (!isAstNode(id) || id.type !== "Identifier" || !isAstNode(init))
    return null;

  const call = getDirectIIFECall(init);
  if (call === null) return null;

  const fn = getDirectIIFEFunction(call);
  if (fn === null) return null;

  const resultName = createUniqueName(code, "__reflex_iife_result_", index);
  const label = createUniqueName(code, "__reflex_inline_iife_", index);
  const block = createInlineIIFEBodyBlock(
    code,
    call,
    fn,
    { kind: "assign", target: resultName },
    label,
  );

  if (block === null) return null;

  const target = code.slice(id.start, id.end);
  const declarationKind = statement.kind as "const" | "let";

  // Keep const as const. A leaked unique temp is less semantically dangerous than
  // silently weakening const to let. The global direct-eval guard prevents the
  // only practical reflective case where the temp name could be observed.
  const text = `let ${resultName};${block}${declarationKind} ${target}=${resultName};`;

  return { start: statement.start, end: statement.end, text };
}

function applyReplacements(
  code: string,
  replacements: readonly Replacement[],
): string {
  const ordered = [...replacements].sort(
    (left, right) => left.start - right.start,
  );
  let result = "";
  let cursor = 0;

  for (const replacement of ordered) {
    if (replacement.start < cursor) continue;

    result += code.slice(cursor, replacement.start);
    result += replacement.text;
    cursor = replacement.end;
  }

  result += code.slice(cursor);
  return result;
}

export function safeInlineIIFEPlugin(): Plugin {
  return {
    name: "safe-inline-iife",
    renderChunk(code) {
      let ast: AstNode;

      try {
        ast = this.parse(code) as AstNode;
      } catch {
        return null;
      }

      // Direct eval makes newly introduced bindings observable. Rather than
      // pretending that is fine, disable the lowering for that chunk.
      if (hasDirectEval(ast)) return null;

      const replacements: Replacement[] = [];

      walkAst(ast, (node) => {
        let replacement: Replacement | null = null;

        if (node.type === "ExpressionStatement") {
          replacement =
            createAssignmentIIFEStatementReplacement(
              code,
              node,
              replacements.length,
            ) ??
            createUnusedIIFEStatementReplacement(
              code,
              node,
              replacements.length,
            );
        } else if (node.type === "VariableDeclaration") {
          replacement = createVariableIIFEDeclarationReplacement(
            code,
            node,
            replacements.length,
          );
        }

        if (replacement !== null) replacements.push(replacement);
      });

      if (replacements.length === 0) return null;

      const result = applyReplacements(code, replacements);

      try {
        this.parse(result);
      } catch (error) {
        this.warn({
          code: "REFLEX_INLINE_IIFE_INVALID_OUTPUT",
          message:
            "safe-inline-iife produced unknown JavaScript and skipped the transform.",
          cause: error,
        });
        return null;
      }

      return { code: result, map: null };
    },
  };
}
