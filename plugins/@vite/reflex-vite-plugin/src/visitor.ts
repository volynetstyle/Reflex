/**
 * JSX reactive props visitor for the Reflex Vite plugin
 */

import { Visitor } from "@swc/core/Visitor.js";
import type {
  JSXAttribute,
  JSXAttributeOrSpread,
  JSXExpressionContainer,
  TsType,
  Expression,
} from "@swc/core";
import type { NormalizedReflexModelTransformOptions } from "./types";
import {
  createAccessorExpression,
  createCallExpression,
  createIdentifier,
} from "./ast-utils";
import {
  shouldWrapExpression,
  shouldWrapModelAttribute,
  isModelMemberExpression,
} from "./expressions";
import { getJSXAttributeName, isJSXExpressionContainer } from "./jsx-utils";

/**
 * Visitor that transforms reactive JSX props into accessors
 */
export class ReflexDOMJSXReactivePropsVisitor extends Visitor {
  private jsxAttributeDepth = 0;
  private modelValueReadHelperUsed = false;

  constructor(
    private readonly reactiveProps: ReadonlySet<string>,
    private readonly modelOptions: NormalizedReflexModelTransformOptions | null,
  ) {
    super();
  }

  /**
   * Checks if the model value read helper is being used
   * @returns Whether the helper is used
   */
  shouldInjectModelValueReadHelper(): boolean {
    return this.modelValueReadHelperUsed;
  }

  override visitTsType(node: TsType): TsType {
    return node;
  }

  override visitJSXAttribute(node: JSXAttribute): JSXAttributeOrSpread {
    this.jsxAttributeDepth++;
    let next: JSXAttribute;

    try {
      next = super.visitJSXAttribute(node) as JSXAttribute;
    } finally {
      this.jsxAttributeDepth--;
    }

    const propName = getJSXAttributeName(next.name);

    if (!propName) {
      return next;
    }

    const value = next.value;

    if (!isJSXExpressionContainer(value)) {
      return next;
    }

    // Safe to access expression because we've type-guarded
    const containerValue = value as JSXExpressionContainer;
    const expression = containerValue.expression;

    if (expression.type === "JSXEmptyExpression") {
      return next;
    }

    if (this.shouldWrapModelExpression(expression, propName)) {
      (next.value as JSXExpressionContainer) = {
        ...value,
        expression: createAccessorExpression(
          this.createModelValueReadExpression(expression),
        ),
      } as JSXExpressionContainer;

      return next;
    }

    if (!this.reactiveProps.has(propName)) {
      return next;
    }

    if (!shouldWrapExpression(expression)) {
      return next;
    }

    (next.value as JSXExpressionContainer) = {
      ...value,
      expression: createAccessorExpression(expression),
    } as JSXExpressionContainer;

    return next;
  }

  override visitJSXExpressionContainer(
    node: JSXExpressionContainer,
  ): JSXExpressionContainer {
    const next = super.visitJSXExpressionContainer(node);

    if (this.jsxAttributeDepth > 0) {
      return next;
    }

    const expression = next.expression;

    if (expression.type === "JSXEmptyExpression") {
      return next;
    }

    if (this.shouldWrapModelExpression(expression)) {
      return {
        ...next,
        expression: createAccessorExpression(
          this.createModelValueReadExpression(expression),
        ),
      };
    }

    if (!shouldWrapExpression(expression)) {
      return next;
    }

    return {
      ...next,
      expression: createAccessorExpression(expression),
    };
  }

  private shouldWrapModelExpression(
    expression: Expression,
    propName?: string,
  ): boolean {
    if (this.modelOptions === null) {
      return false;
    }

    if (propName !== undefined && !shouldWrapModelAttribute(propName)) {
      return false;
    }

    return isModelMemberExpression(expression, this.modelOptions.roots);
  }

  private createModelValueReadExpression(expression: Expression) {
    if (this.modelOptions === null) {
      return expression;
    }

    this.modelValueReadHelperUsed = true;

    return createCallExpression(
      createIdentifier(this.modelOptions.helper),
      expression,
    );
  }
}
