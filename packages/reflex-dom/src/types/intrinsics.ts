import type { attributeAliases } from "../host/aliases";
import type { DOMEventProps } from "./events";
import type { MaybeAccessor, Ref, RefAttributes } from "./core";
import type { JSXRenderable } from "./renderable";
import type { StyleValue } from "./style";

type AnyFn = (...args: unknown[]) => unknown;
type DOMAttributeValue = string | number | bigint | boolean | null | undefined;
type DOMPropertyValue = string | number | boolean | null | undefined;
type AliasAttributeName = keyof typeof attributeAliases;
type HTMLAliasAttributeName =
  | "acceptCharset"
  | "className"
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
type MathMLAttributeName =
  | "display"
  | "displaystyle"
  | "href"
  | "mathbackground"
  | "mathcolor"
  | "mathsize"
  | "mathvariant";
type CustomElementTag = `${string}-${string}`;
type TextControlValue = string | number | null | undefined;
type SelectControlValue = TextControlValue | readonly string[];

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

type SVGCoreAttributeProps = {
  [K in SVGCoreAttributeName]?: MaybeAccessor<DOMAttributeValue>;
} & {
  [Name in SVGLowercaseAttributeName]?: MaybeAccessor<DOMAttributeValue>;
};

type MathMLAttributeProps = {
  [K in MathMLAttributeName]?: MaybeAccessor<DOMAttributeValue>;
};

type PlatformProps = {
  shadowRoot?: true | ShadowRootInit;
  shadowChildren?: JSXRenderable;
  shadowRootRef?: Ref<ShadowRoot>;
  shadowAdoptedStyleSheets?: MaybeAccessor<
    readonly CSSStyleSheet[] | null | undefined
  >;
  elementInternals?: Ref<ElementInternals>;
};

type OverrideProps<Base, Extra> = Omit<Base, keyof Extra> & Extra;

type InputControlProps = {
  value?: MaybeAccessor<TextControlValue>;
  defaultValue?: MaybeAccessor<TextControlValue>;
  checked?: MaybeAccessor<boolean | null | undefined>;
  defaultChecked?: MaybeAccessor<boolean | null | undefined>;
  indeterminate?: MaybeAccessor<boolean | null | undefined>;
};

type TextareaControlProps = {
  value?: MaybeAccessor<TextControlValue>;
  defaultValue?: MaybeAccessor<TextControlValue>;
};

type SelectControlProps = {
  value?: MaybeAccessor<SelectControlValue>;
};

type OptionControlProps = {
  value?: MaybeAccessor<TextControlValue>;
  selected?: MaybeAccessor<boolean | null | undefined>;
  defaultSelected?: MaybeAccessor<boolean | null | undefined>;
};

export interface DOMPropsBase<T extends Element = Element>
  extends RefAttributes<T>,
    DataAttributes,
    AriaAttributes,
    PlatformProps {
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

export type MathMLProps<T extends MathMLElement = MathMLElement> = DOMProps<T> &
  MathMLAttributeProps &
  DOMEventProps<T>;

export type CustomElementProps<T extends HTMLElement = HTMLElement> =
  HTMLProps<T> & {
    [name: string]: unknown;
  };

type InputProps = OverrideProps<HTMLProps<HTMLInputElement>, InputControlProps>;
type TextareaProps = OverrideProps<
  HTMLProps<HTMLTextAreaElement>,
  TextareaControlProps
>;
type SelectProps = OverrideProps<HTMLProps<HTMLSelectElement>, SelectControlProps>;
type OptionProps = OverrideProps<HTMLProps<HTMLOptionElement>, OptionControlProps>;

type HTMLIntrinsicElementsBase = {
  [Tag in keyof HTMLElementTagNameMap]: HTMLProps<HTMLElementTagNameMap[Tag]>;
};

export type HTMLIntrinsicElements = Omit<
  HTMLIntrinsicElementsBase,
  "input" | "option" | "select" | "textarea"
> & {
  input: InputProps;
  option: OptionProps;
  select: SelectProps;
  textarea: TextareaProps;
};

export type SVGIntrinsicElements = {
  [Tag in keyof SVGElementTagNameMap]: SVGProps<SVGElementTagNameMap[Tag]>;
};

export type MathMLIntrinsicElements = {
  [Tag in keyof MathMLElementTagNameMap]: MathMLProps<MathMLElementTagNameMap[Tag]>;
};

export type CustomElementIntrinsicElements = {
  [Tag in CustomElementTag]: CustomElementProps<HTMLElement>;
};

export type IntrinsicElements =
  & HTMLIntrinsicElements
  & SVGIntrinsicElements
  & MathMLIntrinsicElements
  & CustomElementIntrinsicElements;

export type ElementTag =
  | keyof HTMLIntrinsicElements
  | keyof SVGIntrinsicElements
  | keyof MathMLIntrinsicElements
  | CustomElementTag;

export type ElementProps<Tag extends ElementTag> =
  Tag extends keyof HTMLIntrinsicElements
    ? HTMLIntrinsicElements[Tag]
    : Tag extends keyof SVGIntrinsicElements
      ? SVGIntrinsicElements[Tag]
      : Tag extends keyof MathMLIntrinsicElements
        ? MathMLIntrinsicElements[Tag]
        : Tag extends CustomElementTag
          ? CustomElementProps<HTMLElement>
          : never;

export type ElementInstance<Tag extends ElementTag> =
  Tag extends keyof HTMLElementTagNameMap
    ? HTMLElementTagNameMap[Tag]
    : Tag extends keyof SVGElementTagNameMap
      ? SVGElementTagNameMap[Tag]
      : Tag extends keyof MathMLElementTagNameMap
        ? MathMLElementTagNameMap[Tag]
        : Tag extends CustomElementTag
          ? HTMLElement
          : Element;

export type {
  CustomElementTag,
  InputProps,
  OptionProps,
  PlatformProps,
  SelectProps,
  TextareaProps,
};
