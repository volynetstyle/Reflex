/**
 * JSX utilities for the Reflex Vite plugin
 */

import type {
  JSXAttributeName,
  JSXAttrValue,
  JSXExpressionContainer,
} from "@swc/core";

/**
 * Gets the name of a JSX attribute
 * @param name - The attribute name node
 * @returns The attribute name string or null
 */
export function getJSXAttributeName(name: JSXAttributeName): string | null {
  if (name.type === "Identifier") {
    return name.value;
  }

  return null;
}

/**
 * Type guard for JSXExpressionContainer
 * @param value - The value to check
 * @returns Whether the value is a JSXExpressionContainer
 */
export function isJSXExpressionContainer(
  value: JSXAttrValue | undefined,
): value is JSXExpressionContainer {
  return value?.type === "JSXExpressionContainer";
}
