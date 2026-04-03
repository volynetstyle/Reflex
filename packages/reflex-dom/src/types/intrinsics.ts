import type { attributeAliases } from "../host/aliases";
import type { MaybeAccessor, RefAttributes } from "./core";
import type { DOMEventProps } from "./events";
import type { JSXRenderable } from "./renderable";
import type { StyleValue } from "./style";

type AnyFn = (...args: unknown[]) => unknown;
type DOMAttributeValue = string | number | bigint | boolean | null | undefined;
type DOMPropertyValue = string | number | boolean | null | undefined;
type AliasAttributeName = keyof typeof attributeAliases;
type HTMLAliasAttributeName =
  | "acceptCharset"
  | "crossOrigin"
  | "htmlFor"
  | "httpEquiv";
type SVGAliasAttributeName = Exclude<
  AliasAttributeName,
  HTMLAliasAttributeName
>;
type SVGCoreAttributeName =
  | "accentHeight"
  | "alignmentBaseline"
  | "cx"
  | "cy"
  | "d"
  | "dominantBaseline"
  | "dx"
  | "dy"
  | "fill"
  | "fillOpacity"
  | "fillRule"
  | "gradientTransform"
  | "gradientUnits"
  | "height"
  | "href"
  | "markerEnd"
  | "markerMid"
  | "markerStart"
  | "offset"
  | "opacity"
  | "pathLength"
  | "patternContentUnits"
  | "patternUnits"
  | "points"
  | "preserveAspectRatio"
  | "r"
  | "rx"
  | "ry"
  | "spreadMethod"
  | "stopColor"
  | "stopOpacity"
  | "stroke"
  | "strokeDasharray"
  | "strokeDashoffset"
  | "strokeLinecap"
  | "strokeLinejoin"
  | "strokeMiterlimit"
  | "strokeOpacity"
  | "strokeWidth"
  | "textAnchor"
  | "transform"
  | "transformOrigin"
  | "vectorEffect"
  | "viewBox"
  | "width"
  | "x"
  | "x1"
  | "x2"
  | "xlinkHref"
  | "xmlns"
  | "xmlnsXlink"
  | "y"
  | "y1"
  | "y2";

type IfEquals<X, Y, OnEqual = X, OnMismatch = never> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? OnEqual
    : OnMismatch;

type WritableKeys<T> = {
  [K in keyof T]-?: IfEquals<
    { [Q in K]: T[K] },
    { -readonly [Q in K]: T[K] },
    K,
    never
  >;
}[keyof T];

type WritablePrimitiveKeys<T> = Exclude<
  {
    [K in WritableKeys<T>]: T[K] extends AnyFn
      ? never
      : Exclude<T[K], undefined> extends DOMPropertyValue
        ? K
        : never;
  }[WritableKeys<T>],
  "children" | "className" | "ref" | "style"
>;

type NativePropertyProps<T extends Element> = {
  [K in WritablePrimitiveKeys<T>]?: MaybeAccessor<T[K]>;
};

type DataAttributes = {
  [Name in `data-${string}`]?: MaybeAccessor<DOMAttributeValue>;
};

type AriaAttributes = {
  [Name in `aria-${string}`]?: MaybeAccessor<
    string | number | boolean | null | undefined
  >;
};

type HTMLAliasAttributeProps = {
  [K in HTMLAliasAttributeName]?: MaybeAccessor<DOMAttributeValue>;
};

type SVGAliasAttributeProps = {
  [K in SVGAliasAttributeName]?: MaybeAccessor<DOMAttributeValue>;
};

type SVGLowercaseAttributeName =
  | "clip-path"
  | "clip-rule"
  | "fill-opacity"
  | "fill-rule"
  | "flood-color"
  | "flood-opacity"
  | "font-family"
  | "font-size"
  | "font-style"
  | "font-weight"
  | "marker-end"
  | "marker-mid"
  | "marker-start"
  | "stop-color"
  | "stop-opacity"
  | "stroke-dasharray"
  | "stroke-dashoffset"
  | "stroke-linecap"
  | "stroke-linejoin"
  | "stroke-miterlimit"
  | "stroke-opacity"
  | "stroke-width"
  | "text-anchor"
  | "vector-effect"
  | "viewBox"
  | "xlink:href"
  | "xmlns:xlink";

type SVGCoreAttributeProps = {
  [K in SVGCoreAttributeName]?: MaybeAccessor<DOMAttributeValue>;
} & {
  [Name in SVGLowercaseAttributeName]?: MaybeAccessor<DOMAttributeValue>;
};

export interface DOMPropsBase<T extends Element = Element>
  extends RefAttributes<T>,
    DataAttributes,
    AriaAttributes {
  children?: JSXRenderable;
  class?: MaybeAccessor<string | null | undefined>;
  className?: MaybeAccessor<string | null | undefined>;
  style?: MaybeAccessor<StyleValue | null | undefined>;
}

export type DOMProps<T extends Element = Element> = DOMPropsBase<T> &
  NativePropertyProps<T>;

export type HTMLProps<T extends HTMLElement = HTMLElement> = DOMProps<T> &
  HTMLAliasAttributeProps &
  DOMEventProps<T>;

export type SVGProps<T extends SVGElement = SVGElement> = DOMProps<T> &
  SVGAliasAttributeProps &
  SVGCoreAttributeProps &
  DOMEventProps<T>;

export type HTMLIntrinsicElements = {
  [Tag in keyof HTMLElementTagNameMap]: HTMLProps<HTMLElementTagNameMap[Tag]>;
};

export type SVGIntrinsicElements = {
  [Tag in keyof SVGElementTagNameMap]: SVGProps<SVGElementTagNameMap[Tag]>;
};

export type IntrinsicElements = HTMLIntrinsicElements & SVGIntrinsicElements;
export type ElementTag = keyof IntrinsicElements;
export type ElementProps<Tag extends ElementTag> = IntrinsicElements[Tag];
export type ElementInstance<Tag extends ElementTag> =
  IntrinsicElements[Tag] extends DOMProps<infer Instance extends Element>
    ? Instance
    : Element;
