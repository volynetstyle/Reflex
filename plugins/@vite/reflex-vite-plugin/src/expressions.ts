/**
 * Expression checking and utilities for the Reflex Vite plugin
 */

import type { Expression, MemberExpression } from "@swc/core";
import { WRAPPABLE_EXPRESSION_TYPES } from "./types";

/**
 * Checks if an expression should be wrapped in an accessor
 * @param expression - The expression to check
 * @returns Whether the expression should be wrapped
 */
export function shouldWrapExpression(expression: Expression): boolean {
  return WRAPPABLE_EXPRESSION_TYPES.has(expression.type);
}

/**
 * Checks if a model attribute should be wrapped
 * @param propName - The property name
 * @returns Whether the attribute should be wrapped
 */
export function shouldWrapModelAttribute(propName: string): boolean {
  return propName !== "key" && propName !== "ref" && !/^on[A-Z]/.test(propName);
}

/**
 * Unwraps wrapped expressions (like parenthesis or type assertions)
 * @param expression - The expression to unwrap
 * @returns The unwrapped expression
 */
export function unwrapExpression(expression: Expression): Expression {
  switch (expression.type) {
    case "ParenthesisExpression":
    case "TsAsExpression":
    case "TsConstAssertion":
    case "TsInstantiation":
    case "TsNonNullExpression":
    case "TsSatisfiesExpression":
    case "TsTypeAssertion":
      return unwrapExpression(expression.expression);
    default:
      return expression;
  }
}

/**
 * Checks if an expression is a model member expression
 * @param expression - The expression to check
 * @param roots - The set of model root names
 * @returns Whether the expression is a model member expression
 */
export function isModelMemberExpression(
  expression: Expression,
  roots: ReadonlySet<string>,
): expression is MemberExpression {
  const unwrapped = unwrapExpression(expression);

  return (
    unwrapped.type === "MemberExpression" &&
    isModelMemberRoot(unwrapped.object, roots)
  );
}

/**
 * Checks if an expression is a model member root
 * @param expression - The expression to check
 * @param roots - The set of model root names
 * @returns Whether the expression is a model member root
 */
export function isModelMemberRoot(
  expression: Expression,
  roots: ReadonlySet<string>,
): boolean {
  const unwrapped = unwrapExpression(expression);

  if (unwrapped.type === "Identifier") {
    return roots.has(unwrapped.value);
  }

  if (unwrapped.type === "MemberExpression") {
    return isModelMemberRoot(unwrapped.object, roots);
  }

  return false;
}
