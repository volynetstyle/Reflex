/**
 * AST node creation and utilities for the Reflex Vite plugin
 */

import type {
  ArrowFunctionExpression,
  CallExpression,
  Expression,
  Identifier,
  ImportDeclaration,
  ImportSpecifier,
  ModuleItem,
  Program,
  StringLiteral,
} from "@swc/core";
import {
  DUMMY_SPAN,
  MODEL_READ_EXPORT,
  type NormalizedReflexModelTransformOptions,
} from "./types";

/**
 * Creates an identifier expression
 * @param value - The identifier value
 * @returns The identifier expression
 */
export function createIdentifier(value: string): Expression {
  return {
    type: "Identifier",
    span: DUMMY_SPAN,
    ctxt: 0,
    value,
    optional: false,
  } as unknown as Expression;
}

/**
 * Creates a call expression
 * @param callee - The function to call
 * @param expression - The argument expression
 * @returns The call expression
 */
export function createCallExpression(
  callee: Expression,
  expression: Expression,
): CallExpression {
  return {
    type: "CallExpression",
    span: getExpressionSpan(expression),
    ctxt: 0,
    callee,
    arguments: [{ expression }],
    typeArguments: undefined,
  } as unknown as CallExpression;
}

/**
 * Gets the span of an expression
 * @param expression - The expression
 * @returns The span of the expression
 */
export function getExpressionSpan(expression: Expression) {
  return (expression as { span?: typeof DUMMY_SPAN }).span ?? DUMMY_SPAN;
}

/**
 * Creates an accessor (arrow function) expression that wraps the given expression
 * @param expression - The expression to wrap
 * @returns The arrow function expression
 */
export function createAccessorExpression(
  expression: Expression,
): ArrowFunctionExpression {
  return {
    type: "ArrowFunctionExpression",
    span: (expression as ArrowFunctionExpression).span,
    ctxt: 0,
    params: [],
    body: expression,
    async: false,
    generator: false,
    typeParameters: undefined,
    returnType: undefined,
  } as unknown as ArrowFunctionExpression;
}

/**
 * Creates an import declaration for the model value read helper
 * @param options - The model transform options
 * @returns The import declaration
 */
export function createModelValueReadImport(
  options: NormalizedReflexModelTransformOptions,
): ImportDeclaration {
  const local: Identifier = {
    type: "Identifier",
    span: DUMMY_SPAN,
    ctxt: 0,
    value: options.helper,
    optional: false,
  } as unknown as Identifier;

  const imported: Identifier = {
    type: "Identifier",
    span: DUMMY_SPAN,
    ctxt: 0,
    value: MODEL_READ_EXPORT,
    optional: false,
  } as unknown as Identifier;

  const specifier: ImportSpecifier = {
    type: "ImportSpecifier",
    span: DUMMY_SPAN,
    local,
    imported,
    isTypeOnly: false,
  } as unknown as ImportSpecifier;

  const source: StringLiteral = {
    type: "StringLiteral",
    span: DUMMY_SPAN,
    value: options.importSource,
    raw: JSON.stringify(options.importSource),
  } as unknown as StringLiteral;

  return {
    type: "ImportDeclaration",
    span: DUMMY_SPAN,
    specifiers: [specifier],
    source,
    typeOnly: false,
  } as unknown as ImportDeclaration;
}

/**
 * Injects the model value read import at the beginning of the program
 * @param program - The program to inject into
 * @param options - The model transform options
 * @returns The modified program
 */
export function injectModelValueReadImport(
  program: Program,
  options: NormalizedReflexModelTransformOptions,
): Program {
  if (program.type !== "Module") {
    return program;
  }

  const helperImport = createModelValueReadImport(options) as ModuleItem;

  return {
    ...program,
    body: [helperImport, ...program.body],
  };
}
