import type { attributeAliases } from "../host/aliases";
import type { AriaAttributes, AriaRoleValue } from "./aria";
import type { DOMEventProps } from "./events";
import type { MaybeAccessor, Ref, RefAttributes } from "./core";
import type { JSXRenderable, JSXText } from "./renderable";
import type { StyleValue } from "./style";

/*
 * How props reach the DOM (see `host/props.ts` and `host/attr.ts`):
 *
 * - HTML and MathML: a name that exists on the element is assigned as a
 *   property; any other name is written with `setAttribute`.
 * - SVG: every name is written with `setAttribute`, verbatim. SVG attribute
 *   names are case-sensitive, so only real attribute names (or the camelCase
 *   aliases in `host/aliases.ts`) are typed for SVG.
 * - `null`, `undefined` and `false` remove the attribute; `true` writes an
 *   empty attribute. Attributes whose values are keyword strings therefore do
 *   not accept `true`.
 */

type AnyFn = (...args: never[]) => unknown;

/** Value of an attribute with free-form or keyword content. `false` removes it. */
type AttributeValue = string | number | false | null | undefined;
/** Value of an HTML boolean attribute: present when `true`. */
type BooleanAttributeValue = boolean | null | undefined;
/** Value of a `data-*` attribute. */
type DataAttributeValue = string | number | bigint | boolean | null | undefined;
type DOMPropertyValue = string | number | boolean | null | undefined;

type AttributeProp<T = AttributeValue> = MaybeAccessor<T>;
type KeywordAttribute<K extends string> = AttributeProp<K | false | null | undefined>;

/** A custom element tag name containing the required hyphen. */
type CustomElementTag = `${string}-${string}`;
type TextControlValue = string | number | null | undefined;
type SelectControlValue = TextControlValue | readonly string[];

type OverrideProps<Base, Extra> = Omit<Base, keyof Extra> & Extra;

// ---------------------------------------------------------------------------
// Properties derived from the element interface
// ---------------------------------------------------------------------------

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

/**
 * Writable properties that are not attributes and must not be props:
 *
 * - handled by the common props (`children`, `className`, `style`, `ref`)
 *   or typed with spec values (`role`);
 * - replace the renderer-owned children (`innerHTML`, `textContent`,
 *   `text`, `length` of `<select>`, ...); `innerHTML`/`outerHTML` would also
 *   be an HTML injection sink;
 * - layout state with no attribute (`scrollTop`, `scrollLeft`);
 * - ARIA reflection (`ariaLabel`, ...): `aria-*` is the single typed spelling,
 *   with spec value types.
 */
type NonAttributeProperty =
  | "children"
  | "className"
  | "ref"
  | "role"
  | "style"
  | "innerHTML"
  | "innerText"
  | "length"
  | "nodeValue"
  | "outerHTML"
  | "outerText"
  | "scrollLeft"
  | "scrollTop"
  | "text"
  | "textContent"
  | `aria${string}`;

/**
 * Writable properties whose content attribute takes values the property type
 * does not: they are typed as attributes (`HTMLGlobalAttributes`,
 * `HTMLElementAttributeMap`), and the renderer writes such values to the
 * attribute.
 */
type WidenedAttributeProperty = "download" | "hidden";

type WritablePrimitiveKeys<T> = Exclude<
  {
    [K in WritableKeys<T>]: T[K] extends AnyFn
      ? never
      : Exclude<T[K], undefined> extends DOMPropertyValue
        ? K
        : never;
  }[WritableKeys<T>],
  NonAttributeProperty | WidenedAttributeProperty
>;

/** Writable primitive properties of `T`, assigned as properties by the renderer. */
type NativePropertyProps<T extends Element> = {
  [K in WritablePrimitiveKeys<T>]?: MaybeAccessor<T[K] | null | undefined>;
};

// ---------------------------------------------------------------------------
// Attributes shared by every namespace
// ---------------------------------------------------------------------------

type DataAttributes = {
  [Name in `data-${string}`]?: MaybeAccessor<DataAttributeValue>;
};

/** Shadow DOM props, valid only on elements that can host a shadow root. */
export interface ShadowHostProps {
  /** Attaches a shadow root; `true` means `{ mode: "open" }`. */
  shadowRoot?: true | ShadowRootInit;
  /** Content rendered into the shadow root. Implies `shadowRoot`. */
  shadowChildren?: JSXRenderable;
  /** Receives the attached shadow root. Implies `shadowRoot`. */
  shadowRootRef?: Ref<ShadowRoot>;
  /** Style sheets adopted by the shadow root. Implies `shadowRoot`. */
  shadowAdoptedStyleSheets?: MaybeAccessor<
    Iterable<CSSStyleSheet> | null | undefined
  >;
}

/** Form-associated custom element props. */
export interface ElementInternalsProps {
  /** Receives the result of `attachInternals()`. */
  elementInternals?: Ref<ElementInternals>;
}

/** Props for Shadow DOM and custom-element platform features. */
export type PlatformProps = ShadowHostProps & ElementInternalsProps;

/**
 * Common DOM props: children, class, style, ref, `data-*` and `aria-*`
 * attributes.
 */
export interface DOMPropsBase<T extends Element = Element>
  extends RefAttributes<T>, DataAttributes, AriaAttributes {
  /** Renderable child content. */
  children?: JSXRenderable;
  /** HTML/SVG class attribute; accepts static or reactive string values. */
  class?: MaybeAccessor<string | null | undefined>;
  /** Alias for `class` supported for JSX/compiler ergonomics. */
  className?: MaybeAccessor<string | null | undefined>;
  /** Inline style text or object, optionally supplied by an accessor. */
  style?: MaybeAccessor<StyleValue | null | undefined>;
  /** ARIA role, optionally followed by fallback roles. */
  role?: MaybeAccessor<AriaRoleValue | null | undefined>;
}

/** Common props plus the writable primitive properties of `T`. */
export type DOMProps<T extends Element = Element> = DOMPropsBase<T> &
  NativePropertyProps<T>;

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

type HTMLTag = keyof HTMLElementTagNameMap;

/** HTML global attributes that have no writable primitive property. */
interface HTMLGlobalAttributes {
  /** Hides the element; `"until-found"` until find-in-page or a fragment reveals it. */
  hidden?: AttributeProp<boolean | "until-found" | null | undefined>;
  /** Shadow parts exposed by this element. */
  part?: AttributeProp;
  /** Shadow parts of this host re-exported to the outer tree. */
  exportparts?: AttributeProp;
  itemid?: AttributeProp;
  itemprop?: AttributeProp;
  itemref?: AttributeProp;
  itemscope?: AttributeProp<BooleanAttributeValue>;
  itemtype?: AttributeProp;
}

type CrossOriginValue = "" | "anonymous" | "use-credentials";

interface CrossOriginAttribute {
  /** HTML-native spelling of `crossOrigin`. */
  crossorigin?: KeywordAttribute<CrossOriginValue>;
}

interface DownloadAttribute {
  /** Downloads the target; a string names the file, `true` keeps its name. */
  download?: AttributeProp<string | boolean | null | undefined>;
}

interface FormOwnerAttribute {
  /** ID of the form owner when it is not an ancestor. */
  form?: AttributeProp;
}

interface PopoverInvokerAttributes {
  /** ID of the popover this control toggles. */
  popovertarget?: AttributeProp;
}

interface RenderBlockingAttribute {
  blocking?: KeywordAttribute<"render">;
}

type InvokerCommand =
  | "close"
  | "hide-popover"
  | "request-close"
  | "show-modal"
  | "show-popover"
  | "toggle-popover"
  | `--${string}`;

/**
 * Content attributes, per element, that have no writable primitive property
 * on the element interface (token lists, element references, and features
 * newer than TypeScript's DOM library), or whose values the property type
 * does not cover. Other attributes are typed from the interface.
 */
export interface HTMLElementAttributeMap {
  a: DownloadAttribute;
  area: DownloadAttribute;
  audio: CrossOriginAttribute;
  button: FormOwnerAttribute &
    PopoverInvokerAttributes & {
      /** Invoker command run on the `commandfor` element. */
      command?: KeywordAttribute<InvokerCommand>;
      /** ID of the element controlled by `command`. */
      commandfor?: AttributeProp;
    };
  dialog: {
    /** Which close requests may close the dialog. */
    closedby?: KeywordAttribute<"any" | "closerequest" | "none">;
  };
  fieldset: FormOwnerAttribute;
  form: {
    /** HTML-native spelling of `acceptCharset`. */
    "accept-charset"?: AttributeProp;
  };
  iframe: {
    /** Space-separated sandbox tokens. */
    sandbox?: AttributeProp;
  };
  img: CrossOriginAttribute;
  input: FormOwnerAttribute &
    PopoverInvokerAttributes & {
      /** ID of a `<datalist>` with suggestions. */
      list?: AttributeProp;
    };
  label: {
    /** HTML-native spelling of `htmlFor`. */
    for?: AttributeProp;
  };
  link: CrossOriginAttribute &
    RenderBlockingAttribute & {
      sizes?: AttributeProp;
    };
  meta: {
    /** HTML-native spelling of `httpEquiv`. */
    "http-equiv"?: KeywordAttribute<
      | "content-language"
      | "content-security-policy"
      | "content-type"
      | "default-style"
      | "refresh"
      | "set-cookie"
      | "x-ua-compatible"
    >;
  };
  object: FormOwnerAttribute;
  output: FormOwnerAttribute & {
    /** IDs of the elements that contributed to the result. */
    for?: AttributeProp;
    /** Alias for `for`. */
    htmlFor?: AttributeProp;
  };
  script: CrossOriginAttribute & RenderBlockingAttribute;
  select: FormOwnerAttribute;
  style: RenderBlockingAttribute;
  textarea: FormOwnerAttribute;
  video: CrossOriginAttribute;
}

/**
 * Elements that can host a shadow root ("valid shadow host name" in the DOM
 * Standard). `attachShadow()` throws for any other built-in element.
 */
type ShadowHostTag =
  | "article"
  | "aside"
  | "blockquote"
  | "body"
  | "div"
  | "footer"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "h5"
  | "h6"
  | "header"
  | "main"
  | "nav"
  | "p"
  | "section"
  | "span";

/** Void elements: their content model is nothing. */
type VoidTag = Extract<
  HTMLTag,
  | "area"
  | "base"
  | "br"
  | "col"
  | "embed"
  | "hr"
  | "img"
  | "input"
  | "link"
  | "meta"
  | "source"
  | "track"
  | "wbr"
>;

type TextChild = JSXText | boolean | null | undefined;
/** Text-only children, for raw text and escapable raw text elements. */
type TextChildren = MaybeAccessor<TextChild> | readonly MaybeAccessor<TextChild>[];

/** Raw text and escapable raw text elements: their content is text only. */
type TextContentTag = "script" | "style" | "textarea" | "title";

/** HTML props: common props, native properties, global attributes and events. */
export type HTMLProps<T extends HTMLElement = HTMLElement> = DOMProps<T> &
  HTMLGlobalAttributes &
  DOMEventProps<T>;

type InputControlProps = {
  value?: MaybeAccessor<TextControlValue>;
  defaultValue?: MaybeAccessor<TextControlValue>;
  checked?: MaybeAccessor<boolean | null | undefined>;
  defaultChecked?: MaybeAccessor<boolean | null | undefined>;
  indeterminate?: MaybeAccessor<boolean | null | undefined>;
  children?: undefined;
};

type TextareaControlProps = {
  value?: MaybeAccessor<TextControlValue>;
  defaultValue?: MaybeAccessor<TextControlValue>;
  /** Initial text; ignored when `value` or `defaultValue` is present. */
  children?: TextChildren;
};

type SelectControlProps = {
  value?: MaybeAccessor<SelectControlValue>;
};

type OptionControlProps = {
  value?: MaybeAccessor<TextControlValue>;
  selected?: MaybeAccessor<boolean | null | undefined>;
  defaultSelected?: MaybeAccessor<boolean | null | undefined>;
};

/** Managed form-control props (see `host/forms.ts`), keyed by tag. */
type HTMLControlPropsMap = {
  input: InputControlProps;
  option: OptionControlProps;
  select: SelectControlProps;
  textarea: TextareaControlProps;
};

type HTMLElementPropsBase<Tag extends HTMLTag> = HTMLProps<
  HTMLElementTagNameMap[Tag]
> &
  (Tag extends keyof HTMLElementAttributeMap
    ? HTMLElementAttributeMap[Tag]
    : unknown) &
  (Tag extends ShadowHostTag ? ShadowHostProps : unknown);

/** Props of the HTML element named `Tag`. */
export type HTMLElementProps<Tag extends HTMLTag> =
  Tag extends keyof HTMLControlPropsMap
    ? OverrideProps<HTMLElementPropsBase<Tag>, HTMLControlPropsMap[Tag]>
    : Tag extends VoidTag
      ? OverrideProps<HTMLElementPropsBase<Tag>, { children?: undefined }>
      : Tag extends TextContentTag
        ? OverrideProps<HTMLElementPropsBase<Tag>, { children?: TextChildren }>
        : HTMLElementPropsBase<Tag>;

type InputProps = HTMLElementProps<"input">;
type TextareaProps = HTMLElementProps<"textarea">;
type SelectProps = HTMLElementProps<"select">;
type OptionProps = HTMLElementProps<"option">;

/** HTML props plus an open set of properties for a custom element. */
export type CustomElementProps<T extends HTMLElement = HTMLElement> =
  HTMLProps<T> &
    ShadowHostProps &
    ElementInternalsProps & {
      [name: string]: unknown;
    };

export type HTMLIntrinsicElements = {
  [Tag in HTMLTag]: HTMLElementProps<Tag>;
};

// ---------------------------------------------------------------------------
// SVG
// ---------------------------------------------------------------------------

type SVGTag = keyof SVGElementTagNameMap;

/** camelCase spellings the renderer rewrites to SVG attribute names. */
type SVGAliasAttributeName = Exclude<
  keyof typeof attributeAliases,
  "acceptCharset" | "className" | "crossOrigin" | "htmlFor" | "httpEquiv"
>;

/** SVG 2 presentation attributes (CSS properties settable as attributes). */
type SVGPresentationAttributeName =
  | "alignment-baseline"
  | "baseline-shift"
  | "clip"
  | "clip-path"
  | "clip-rule"
  | "color"
  | "color-interpolation"
  | "color-interpolation-filters"
  | "color-rendering"
  | "cursor"
  | "cx"
  | "cy"
  | "d"
  | "direction"
  | "display"
  | "dominant-baseline"
  | "fill"
  | "fill-opacity"
  | "fill-rule"
  | "filter"
  | "flood-color"
  | "flood-opacity"
  | "font-family"
  | "font-size"
  | "font-size-adjust"
  | "font-stretch"
  | "font-style"
  | "font-variant"
  | "font-weight"
  | "glyph-orientation-horizontal"
  | "glyph-orientation-vertical"
  | "height"
  | "image-rendering"
  | "letter-spacing"
  | "lighting-color"
  | "marker-end"
  | "marker-mid"
  | "marker-start"
  | "mask"
  | "mask-type"
  | "opacity"
  | "overflow"
  | "paint-order"
  | "pointer-events"
  | "r"
  | "rx"
  | "ry"
  | "shape-rendering"
  | "stop-color"
  | "stop-opacity"
  | "stroke"
  | "stroke-dasharray"
  | "stroke-dashoffset"
  | "stroke-linecap"
  | "stroke-linejoin"
  | "stroke-miterlimit"
  | "stroke-opacity"
  | "stroke-width"
  | "text-anchor"
  | "text-decoration"
  | "text-overflow"
  | "text-rendering"
  | "transform"
  | "transform-origin"
  | "unicode-bidi"
  | "vector-effect"
  | "visibility"
  | "white-space"
  | "width"
  | "word-spacing"
  | "writing-mode"
  | "x"
  | "y";

/** SVG 2 element attributes, spelled exactly as in the specification. */
type SVGElementAttributeName =
  // Core, styling, conditional processing
  | "autofocus"
  | "id"
  | "lang"
  | "nonce"
  | "requiredExtensions"
  | "slot"
  | "systemLanguage"
  | "tabindex"
  | "xml:lang"
  | "xml:space"
  | "xmlns"
  | "xmlns:xlink"
  | "part"
  // Document structure
  | "preserveAspectRatio"
  | "viewBox"
  | "zoomAndPan"
  | "version"
  | "playbackorder"
  | "timelinebegin"
  // Linking and embedded content
  | "crossorigin"
  | "decoding"
  | "download"
  | "href"
  | "hreflang"
  | "media"
  | "ping"
  | "referrerpolicy"
  | "rel"
  | "target"
  | "title"
  | "type"
  | "xlink:href"
  | "xlink:title"
  // Geometry
  | "dx"
  | "dy"
  | "fr"
  | "fx"
  | "fy"
  | "pathLength"
  | "points"
  | "x1"
  | "x2"
  | "y1"
  | "y2"
  // Text
  | "lengthAdjust"
  | "method"
  | "path"
  | "rotate"
  | "side"
  | "spacing"
  | "startOffset"
  | "textLength"
  // Painting servers, markers, clipping and masking
  | "clipPathUnits"
  | "gradientTransform"
  | "gradientUnits"
  | "markerHeight"
  | "markerUnits"
  | "markerWidth"
  | "maskContentUnits"
  | "maskUnits"
  | "offset"
  | "orient"
  | "patternContentUnits"
  | "patternTransform"
  | "patternUnits"
  | "refX"
  | "refY"
  | "spreadMethod"
  // Filter effects
  | "amplitude"
  | "azimuth"
  | "baseFrequency"
  | "bias"
  | "diffuseConstant"
  | "divisor"
  | "edgeMode"
  | "elevation"
  | "exponent"
  | "filterUnits"
  | "in"
  | "in2"
  | "intercept"
  | "k1"
  | "k2"
  | "k3"
  | "k4"
  | "kernelMatrix"
  | "kernelUnitLength"
  | "limitingConeAngle"
  | "mode"
  | "numOctaves"
  | "operator"
  | "order"
  | "pointsAtX"
  | "pointsAtY"
  | "pointsAtZ"
  | "preserveAlpha"
  | "primitiveUnits"
  | "radius"
  | "result"
  | "scale"
  | "seed"
  | "slope"
  | "specularConstant"
  | "specularExponent"
  | "stdDeviation"
  | "stitchTiles"
  | "surfaceScale"
  | "tableValues"
  | "targetX"
  | "targetY"
  | "xChannelSelector"
  | "yChannelSelector"
  // Animation (SVG Animations / SMIL)
  | "accumulate"
  | "additive"
  | "attributeName"
  | "attributeType"
  | "begin"
  | "by"
  | "calcMode"
  | "dur"
  | "end"
  | "from"
  | "keyPoints"
  | "keySplines"
  | "keyTimes"
  | "max"
  | "min"
  | "repeatCount"
  | "repeatDur"
  | "restart"
  | "to"
  | "values";

type SVGAttributes = {
  [K in
    | SVGAliasAttributeName
    | SVGPresentationAttributeName
    | SVGElementAttributeName]?: AttributeProp;
};

/**
 * SVG props: common props, SVG 2 attributes and the renderer's camelCase
 * aliases, and typed events. Writable properties of the SVG interfaces are
 * not props, because the renderer writes SVG names as attributes.
 */
export type SVGProps<T extends SVGElement = SVGElement> = DOMPropsBase<T> &
  SVGAttributes &
  DOMEventProps<T>;

type SVGTextContentTag = "script" | "style" | "title";

/** Props of the SVG element named `Tag`. */
export type SVGElementProps<Tag extends SVGTag> = Tag extends SVGTextContentTag
  ? OverrideProps<SVGProps<SVGElementTagNameMap[Tag]>, { children?: TextChildren }>
  : SVGProps<SVGElementTagNameMap[Tag]>;

export type SVGIntrinsicElements = {
  [Tag in SVGTag]: SVGElementProps<Tag>;
};

// ---------------------------------------------------------------------------
// MathML
// ---------------------------------------------------------------------------

type MathMLTag = keyof MathMLElementTagNameMap;
type MathMLBoolean = "true" | "false";
type MathMLLength = string | number;

/** MathML Core global attributes. */
interface MathMLGlobalAttributes {
  dir?: KeywordAttribute<"ltr" | "rtl">;
  displaystyle?: KeywordAttribute<MathMLBoolean>;
  mathbackground?: AttributeProp;
  mathcolor?: AttributeProp;
  mathsize?: AttributeProp<MathMLLength | false | null | undefined>;
  scriptlevel?: AttributeProp<
    number | `${number}` | `+${number}` | false | null | undefined
  >;
  /**
   * MathML 3 linking, kept for engines that still support it.
   * @deprecated Not part of MathML Core.
   */
  href?: AttributeProp;
}

type MathMLLengthAttribute = AttributeProp<MathMLLength | false | null | undefined>;

/** Element-specific MathML Core attributes. */
export interface MathMLElementAttributeMap {
  annotation: { encoding?: AttributeProp };
  "annotation-xml": { encoding?: AttributeProp };
  math: { display?: KeywordAttribute<"block" | "inline"> };
  mfrac: { linethickness?: MathMLLengthAttribute };
  mi: {
    /**
     * MathML Core only defines `normal`; the other MathML 3 values are kept
     * for engines that still support them.
     */
    mathvariant?: KeywordAttribute<
      | "normal"
      | "bold"
      | "italic"
      | "bold-italic"
      | "double-struck"
      | "bold-fraktur"
      | "script"
      | "bold-script"
      | "fraktur"
      | "sans-serif"
      | "bold-sans-serif"
      | "sans-serif-italic"
      | "sans-serif-bold-italic"
      | "monospace"
      | "initial"
      | "tailed"
      | "looped"
      | "stretched"
    >;
  };
  mo: {
    fence?: KeywordAttribute<MathMLBoolean>;
    form?: KeywordAttribute<"infix" | "postfix" | "prefix">;
    largeop?: KeywordAttribute<MathMLBoolean>;
    lspace?: MathMLLengthAttribute;
    maxsize?: MathMLLengthAttribute;
    minsize?: MathMLLengthAttribute;
    movablelimits?: KeywordAttribute<MathMLBoolean>;
    rspace?: MathMLLengthAttribute;
    separator?: KeywordAttribute<MathMLBoolean>;
    stretchy?: KeywordAttribute<MathMLBoolean>;
    symmetric?: KeywordAttribute<MathMLBoolean>;
  };
  mover: { accent?: KeywordAttribute<MathMLBoolean> };
  mpadded: {
    depth?: MathMLLengthAttribute;
    height?: MathMLLengthAttribute;
    lspace?: MathMLLengthAttribute;
    voffset?: MathMLLengthAttribute;
    width?: MathMLLengthAttribute;
  };
  mspace: {
    depth?: MathMLLengthAttribute;
    height?: MathMLLengthAttribute;
    width?: MathMLLengthAttribute;
  };
  mtd: {
    columnspan?: AttributeProp<number | `${number}` | false | null | undefined>;
    rowspan?: AttributeProp<number | `${number}` | false | null | undefined>;
  };
  munder: { accentunder?: KeywordAttribute<MathMLBoolean> };
  munderover: {
    accent?: KeywordAttribute<MathMLBoolean>;
    accentunder?: KeywordAttribute<MathMLBoolean>;
  };
}

/** MathML props: common props, native properties, global attributes and events. */
export type MathMLProps<T extends MathMLElement = MathMLElement> = DOMProps<T> &
  MathMLGlobalAttributes &
  DOMEventProps<T>;

/** Props of the MathML element named `Tag`. */
export type MathMLElementProps<Tag extends MathMLTag> = MathMLProps<
  MathMLElementTagNameMap[Tag]
> &
  (Tag extends keyof MathMLElementAttributeMap
    ? MathMLElementAttributeMap[Tag]
    : unknown);

export type MathMLIntrinsicElements = {
  [Tag in MathMLTag]: MathMLElementProps<Tag>;
};

// ---------------------------------------------------------------------------
// Tag resolution
// ---------------------------------------------------------------------------

/**
 * Tags defined by both HTML and SVG (`a`, `script`, `style`, `title`). Their
 * namespace depends on where they are rendered, so they accept the props of
 * either element.
 */
type SharedHTMLSVGTag = HTMLTag & SVGTag;

type KnownElementTag = HTMLTag | SVGTag | MathMLTag;

type KnownElementProps<Tag extends KnownElementTag> =
  Tag extends SharedHTMLSVGTag
    ? HTMLIntrinsicElements[Tag] | SVGIntrinsicElements[Tag]
    : Tag extends HTMLTag
      ? HTMLIntrinsicElements[Tag]
      : Tag extends SVGTag
        ? SVGIntrinsicElements[Tag]
        : Tag extends MathMLTag
          ? MathMLIntrinsicElements[Tag]
          : never;

export type CustomElementIntrinsicElements = {
  [Tag in CustomElementTag]: CustomElementProps<HTMLElement>;
};

type KnownIntrinsicElements = {
  [Tag in KnownElementTag]: KnownElementProps<Tag>;
};

/**
 * Maps intrinsic JSX tag names to their props.
 *
 * Custom elements registered in `HTMLElementTagNameMap` get the typed props of
 * their class; any other hyphenated name gets {@link CustomElementProps}.
 *
 * This must stay an intersection: in a single mapped type, a known hyphenated
 * key (`annotation-xml`, registered custom elements) would be absorbed by the
 * `${string}-${string}` pattern. A declared property of one constituent takes
 * precedence over the other constituent's index signature.
 */
export type IntrinsicElements = KnownIntrinsicElements &
  CustomElementIntrinsicElements;

/** Union of supported HTML, SVG, MathML, and custom tag names. */
export type ElementTag = KnownElementTag | CustomElementTag;

/** Resolves the allowed props for a given JSX DOM tag. */
export type ElementProps<Tag extends ElementTag> =
  Tag extends KnownElementTag
    ? KnownElementProps<Tag>
    : CustomElementProps<HTMLElement>;

/** Resolves the concrete DOM instance type for a supported tag name. */
export type ElementInstance<Tag extends ElementTag> =
  Tag extends SharedHTMLSVGTag
    ? HTMLElementTagNameMap[Tag] | SVGElementTagNameMap[Tag]
    : Tag extends HTMLTag
      ? HTMLElementTagNameMap[Tag]
      : Tag extends SVGTag
        ? SVGElementTagNameMap[Tag]
        : Tag extends MathMLTag
          ? MathMLElementTagNameMap[Tag]
          : HTMLElement;

export type {
  CustomElementTag,
  InputProps,
  OptionProps,
  SelectProps,
  TextareaProps,
};
