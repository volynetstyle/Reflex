import type { Attributes } from "../types/core";
import type { JSXRenderable } from "../types/renderable";

/**
 * JSX namespace consumed by TypeScript when using Reflex JSX types.
 *
 * This file describes the type-level JSX contract only.
 * It does not implement JSX creation.
 */
export namespace JSX {
  /**
   * The value produced by JSX expressions.
   *
   * `unknown` is used here because JSX syntax itself should be host-agnostic.
   * The concrete renderer can later narrow the host type.
   */
  export type Element = JSXRenderable<unknown>;

  /**
   * Tells TypeScript which prop name receives JSX children.
   *
   * This enables:
   *
   * ```tsx
   * <Panel>
   *   <span>Hello</span>
   * </Panel>
   * ```
   *
   * to become:
   *
   * ```ts
   * {
   *   children: ...
   * }
   * ```
   */
  export interface ElementChildrenAttribute {
    children: {};
  }

  /**
   * Attributes available on every JSX element/component.
   *
   * Currently this exposes only `key`.
   */
  export type IntrinsicAttributes = Attributes;

  /**
   * Allows Reflex to preserve component props without React-style magic.
   *
   * React uses this hook for defaultProps/propTypes adjustments.
   * Reflex deliberately keeps it identity-based:
   *
   * ```ts
   * LibraryManagedAttributes<Component, Props> === Props
   * ```
   */
  export type LibraryManagedAttributes<_, P> = P;

  /**
   * Host intrinsic elements.
   *
   * This intentionally stays permissive at the framework-core level.
   * A DOM package such as `reflex-dom` should override or augment this with
   * stricter DOM element typings.
   *
   * Example future DOM-side version:
   *
   * ```ts
   * interface IntrinsicElements {
   *   div: DOMAttributes<HTMLDivElement>;
   *   button: DOMAttributes<HTMLButtonElement>;
   * }
   * ```
   */
  export interface IntrinsicElements {
    [tagName: string]: unknown;
  }
}