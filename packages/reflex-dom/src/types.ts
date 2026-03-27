import type { attributeAliases } from "./drafts/client/aliases";

export type Accessor<T> = () => T;
export type MaybeAccessor<T> = T | Accessor<T>;

type CSSPropertyValue = string | number | null | undefined;
type CSSWritableKey = Exclude<
  {
    [K in keyof CSSStyleDeclaration]:
      CSSStyleDeclaration[K] extends string | number | null | undefined
        ? K
        : never;
  }[keyof CSSStyleDeclaration],
  number | "length" | "parentRule" | "cssText"
>;

export type StyleObject = Partial<Record<CSSWritableKey, CSSPropertyValue>> & {
  [CustomProperty in `--${string}`]?: CSSPropertyValue;
};

export type StyleValue = string | StyleObject;

export type Cleanup = (() => void) & { dispose?: () => void };

export interface RefObject<T extends Node> {
  current: T | null;
}

export type AttributeKey = string | number | bigint;

export interface Attributes {
  key?: AttributeKey | null | undefined;
}

export type RefCallback<T extends Node> = (
  instance: T | null,
) => void | (() => void);

export type Ref<T extends Node> = RefCallback<T> | RefObject<T> | null;

export interface RefAttributes<T extends Element> extends Attributes {
  ref?: Ref<T> | undefined;
}

export type JSXText = string | number | bigint;
export type JSXPrimitive = JSXText | boolean | null | undefined;

export interface RenderableRecord {
  readonly kind: symbol;
}

export type JSXRenderable =
  | JSXPrimitive
  | Node
  | RenderableRecord
  | Iterable<unknown>
  | Accessor<unknown>;

export type Component<P = Record<string, never>> = (props: P) => JSXRenderable;

export interface ComponentRenderable<P = Record<string, never>>
  extends RenderableRecord {
  readonly type: Component<P>;
  readonly props: P;
}

export interface ElementRenderable<
  Tag extends string = string,
  Props = DOMProps,
> extends RenderableRecord {
  readonly tag: Tag;
  readonly props: Props;
}

type AnyFn = (...args: any[]) => unknown;
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

type IfEquals<X, Y, OnEqual = X, OnMismatch = never> = (<T>() => T extends X
  ? 1
  : 2) extends <T>() => T extends Y ? 1 : 2
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
    [K in WritableKeys<T>]:
      T[K] extends AnyFn
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

export type DOMEvent<T extends EventTarget, E extends Event = Event> = E & {
  readonly currentTarget: T;
};

export type DOMEventHandler<T extends EventTarget, E extends Event = Event> = (
  event: DOMEvent<T, E>,
) => void;

export interface DOMEventListenerObject<
  T extends EventTarget,
  E extends Event = Event,
> extends AddEventListenerOptions {
  handleEvent(event: DOMEvent<T, E>): void;
}

export type DOMEventHandlerProp<
  T extends EventTarget,
  E extends Event = Event,
> = DOMEventHandler<T, E> | DOMEventListenerObject<T, E>;

type ResolveEvent<
  Events extends object,
  Name extends string,
> = Name extends keyof Events ? Extract<Events[Name], Event> : Event;

type DOMEventProps<T extends Element, Events extends object> = {
  onAbort?: DOMEventHandlerProp<T, ResolveEvent<Events, "abort">>;
  onAnimationCancel?: DOMEventHandlerProp<
    T,
    ResolveEvent<Events, "animationcancel">
  >;
  onAnimationEnd?: DOMEventHandlerProp<
    T,
    ResolveEvent<Events, "animationend">
  >;
  onAnimationIteration?: DOMEventHandlerProp<
    T,
    ResolveEvent<Events, "animationiteration">
  >;
  onAnimationStart?: DOMEventHandlerProp<
    T,
    ResolveEvent<Events, "animationstart">
  >;
  onAuxClick?: DOMEventHandlerProp<T, ResolveEvent<Events, "auxclick">>;
  onBeforeInput?: DOMEventHandlerProp<T, ResolveEvent<Events, "beforeinput">>;
  onBeforeMatch?: DOMEventHandlerProp<T, ResolveEvent<Events, "beforematch">>;
  onBeforeToggle?: DOMEventHandlerProp<T, ResolveEvent<Events, "beforetoggle">>;
  onBlur?: DOMEventHandlerProp<T, ResolveEvent<Events, "blur">>;
  onCancel?: DOMEventHandlerProp<T, ResolveEvent<Events, "cancel">>;
  onCanPlay?: DOMEventHandlerProp<T, ResolveEvent<Events, "canplay">>;
  onCanPlayThrough?: DOMEventHandlerProp<
    T,
    ResolveEvent<Events, "canplaythrough">
  >;
  onChange?: DOMEventHandlerProp<T, ResolveEvent<Events, "change">>;
  onClick?: DOMEventHandlerProp<T, ResolveEvent<Events, "click">>;
  onClose?: DOMEventHandlerProp<T, ResolveEvent<Events, "close">>;
  onCompositionEnd?: DOMEventHandlerProp<
    T,
    ResolveEvent<Events, "compositionend">
  >;
  onCompositionStart?: DOMEventHandlerProp<
    T,
    ResolveEvent<Events, "compositionstart">
  >;
  onCompositionUpdate?: DOMEventHandlerProp<
    T,
    ResolveEvent<Events, "compositionupdate">
  >;
  onContextMenu?: DOMEventHandlerProp<T, ResolveEvent<Events, "contextmenu">>;
  onCopy?: DOMEventHandlerProp<T, ResolveEvent<Events, "copy">>;
  onCut?: DOMEventHandlerProp<T, ResolveEvent<Events, "cut">>;
  onDblClick?: DOMEventHandlerProp<T, ResolveEvent<Events, "dblclick">>;
  onDoubleClick?: DOMEventHandlerProp<T, ResolveEvent<Events, "dblclick">>;
  onDrag?: DOMEventHandlerProp<T, ResolveEvent<Events, "drag">>;
  onDragEnd?: DOMEventHandlerProp<T, ResolveEvent<Events, "dragend">>;
  onDragEnter?: DOMEventHandlerProp<T, ResolveEvent<Events, "dragenter">>;
  onDragExit?: DOMEventHandlerProp<T, ResolveEvent<Events, "dragexit">>;
  onDragLeave?: DOMEventHandlerProp<T, ResolveEvent<Events, "dragleave">>;
  onDragOver?: DOMEventHandlerProp<T, ResolveEvent<Events, "dragover">>;
  onDragStart?: DOMEventHandlerProp<T, ResolveEvent<Events, "dragstart">>;
  onDrop?: DOMEventHandlerProp<T, ResolveEvent<Events, "drop">>;
  onDurationChange?: DOMEventHandlerProp<
    T,
    ResolveEvent<Events, "durationchange">
  >;
  onEmptied?: DOMEventHandlerProp<T, ResolveEvent<Events, "emptied">>;
  onEnded?: DOMEventHandlerProp<T, ResolveEvent<Events, "ended">>;
  onError?: DOMEventHandlerProp<T, ResolveEvent<Events, "error">>;
  onFocus?: DOMEventHandlerProp<T, ResolveEvent<Events, "focus">>;
  onFocusIn?: DOMEventHandlerProp<T, ResolveEvent<Events, "focusin">>;
  onFocusOut?: DOMEventHandlerProp<T, ResolveEvent<Events, "focusout">>;
  onFormData?: DOMEventHandlerProp<T, ResolveEvent<Events, "formdata">>;
  onGotPointerCapture?: DOMEventHandlerProp<
    T,
    ResolveEvent<Events, "gotpointercapture">
  >;
  onInput?: DOMEventHandlerProp<T, ResolveEvent<Events, "input">>;
  onInvalid?: DOMEventHandlerProp<T, ResolveEvent<Events, "invalid">>;
  onKeyDown?: DOMEventHandlerProp<T, ResolveEvent<Events, "keydown">>;
  onKeyUp?: DOMEventHandlerProp<T, ResolveEvent<Events, "keyup">>;
  onLoad?: DOMEventHandlerProp<T, ResolveEvent<Events, "load">>;
  onLoadedData?: DOMEventHandlerProp<T, ResolveEvent<Events, "loadeddata">>;
  onLoadedMetadata?: DOMEventHandlerProp<
    T,
    ResolveEvent<Events, "loadedmetadata">
  >;
  onLoadStart?: DOMEventHandlerProp<T, ResolveEvent<Events, "loadstart">>;
  onLostPointerCapture?: DOMEventHandlerProp<
    T,
    ResolveEvent<Events, "lostpointercapture">
  >;
  onMouseDown?: DOMEventHandlerProp<T, ResolveEvent<Events, "mousedown">>;
  onMouseEnter?: DOMEventHandlerProp<T, ResolveEvent<Events, "mouseenter">>;
  onMouseLeave?: DOMEventHandlerProp<T, ResolveEvent<Events, "mouseleave">>;
  onMouseMove?: DOMEventHandlerProp<T, ResolveEvent<Events, "mousemove">>;
  onMouseOut?: DOMEventHandlerProp<T, ResolveEvent<Events, "mouseout">>;
  onMouseOver?: DOMEventHandlerProp<T, ResolveEvent<Events, "mouseover">>;
  onMouseUp?: DOMEventHandlerProp<T, ResolveEvent<Events, "mouseup">>;
  onPaste?: DOMEventHandlerProp<T, ResolveEvent<Events, "paste">>;
  onPause?: DOMEventHandlerProp<T, ResolveEvent<Events, "pause">>;
  onPlay?: DOMEventHandlerProp<T, ResolveEvent<Events, "play">>;
  onPlaying?: DOMEventHandlerProp<T, ResolveEvent<Events, "playing">>;
  onPointerCancel?: DOMEventHandlerProp<T, ResolveEvent<Events, "pointercancel">>;
  onPointerDown?: DOMEventHandlerProp<T, ResolveEvent<Events, "pointerdown">>;
  onPointerEnter?: DOMEventHandlerProp<T, ResolveEvent<Events, "pointerenter">>;
  onPointerLeave?: DOMEventHandlerProp<T, ResolveEvent<Events, "pointerleave">>;
  onPointerMove?: DOMEventHandlerProp<T, ResolveEvent<Events, "pointermove">>;
  onPointerOut?: DOMEventHandlerProp<T, ResolveEvent<Events, "pointerout">>;
  onPointerOver?: DOMEventHandlerProp<T, ResolveEvent<Events, "pointerover">>;
  onPointerUp?: DOMEventHandlerProp<T, ResolveEvent<Events, "pointerup">>;
  onProgress?: DOMEventHandlerProp<T, ResolveEvent<Events, "progress">>;
  onRateChange?: DOMEventHandlerProp<T, ResolveEvent<Events, "ratechange">>;
  onReset?: DOMEventHandlerProp<T, ResolveEvent<Events, "reset">>;
  onScroll?: DOMEventHandlerProp<T, ResolveEvent<Events, "scroll">>;
  onScrollEnd?: DOMEventHandlerProp<T, ResolveEvent<Events, "scrollend">>;
  onSecurityPolicyViolation?: DOMEventHandlerProp<
    T,
    ResolveEvent<Events, "securitypolicyviolation">
  >;
  onSeeked?: DOMEventHandlerProp<T, ResolveEvent<Events, "seeked">>;
  onSeeking?: DOMEventHandlerProp<T, ResolveEvent<Events, "seeking">>;
  onSelect?: DOMEventHandlerProp<T, ResolveEvent<Events, "select">>;
  onSelectionChange?: DOMEventHandlerProp<
    T,
    ResolveEvent<Events, "selectionchange">
  >;
  onSlotChange?: DOMEventHandlerProp<T, ResolveEvent<Events, "slotchange">>;
  onStalled?: DOMEventHandlerProp<T, ResolveEvent<Events, "stalled">>;
  onSubmit?: DOMEventHandlerProp<T, ResolveEvent<Events, "submit">>;
  onSuspend?: DOMEventHandlerProp<T, ResolveEvent<Events, "suspend">>;
  onTimeUpdate?: DOMEventHandlerProp<T, ResolveEvent<Events, "timeupdate">>;
  onToggle?: DOMEventHandlerProp<T, ResolveEvent<Events, "toggle">>;
  onTouchCancel?: DOMEventHandlerProp<T, ResolveEvent<Events, "touchcancel">>;
  onTouchEnd?: DOMEventHandlerProp<T, ResolveEvent<Events, "touchend">>;
  onTouchMove?: DOMEventHandlerProp<T, ResolveEvent<Events, "touchmove">>;
  onTouchStart?: DOMEventHandlerProp<T, ResolveEvent<Events, "touchstart">>;
  onTransitionCancel?: DOMEventHandlerProp<
    T,
    ResolveEvent<Events, "transitioncancel">
  >;
  onTransitionEnd?: DOMEventHandlerProp<
    T,
    ResolveEvent<Events, "transitionend">
  >;
  onTransitionRun?: DOMEventHandlerProp<
    T,
    ResolveEvent<Events, "transitionrun">
  >;
  onTransitionStart?: DOMEventHandlerProp<
    T,
    ResolveEvent<Events, "transitionstart">
  >;
  onVolumeChange?: DOMEventHandlerProp<T, ResolveEvent<Events, "volumechange">>;
  onWaiting?: DOMEventHandlerProp<T, ResolveEvent<Events, "waiting">>;
  onWheel?: DOMEventHandlerProp<T, ResolveEvent<Events, "wheel">>;
} & {
  [K in keyof Events & string as `on:${K}`]?: DOMEventHandlerProp<
    T,
    Extract<Events[K], Event>
  >;
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
  DOMEventProps<T, HTMLElementEventMap>;

export type SVGProps<T extends SVGElement = SVGElement> = DOMProps<T> &
  SVGAliasAttributeProps &
  SVGCoreAttributeProps &
  DOMEventProps<T, SVGElementEventMap>;

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
export type ComponentProps<T extends Component<any>> = T extends Component<
  infer Props
>
  ? Props
  : never;
