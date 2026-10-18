import type { NativeDOMEventPropMap } from "./events.native";

/**
 * `CommandEvent` from HTML invoker commands (`command`/`commandfor`).
 *
 * Declared structurally so the typings do not depend on a DOM library that
 * already ships the interface; the platform type is assignable to it.
 */
export interface DOMCommandEvent extends Event {
  /** The `command` value of the invoking button. */
  readonly command: string;
  /** The invoking button, retargeted across shadow boundaries. */
  readonly source: Element | null;
}

/** `ContentVisibilityAutoStateChangeEvent` from CSS Containment 2. */
export interface DOMContentVisibilityAutoStateChangeEvent extends Event {
  /** Whether the element's contents are now skipped. */
  readonly skipped: boolean;
}

/** `SnapEvent` from CSS Scroll Snap 2. */
export interface DOMSnapEvent extends Event {
  readonly snapTargetBlock: Node | null;
  readonly snapTargetInline: Node | null;
}

/** `TimeEvent` fired by SVG animation elements. */
export interface DOMTimeEvent extends Event {
  readonly detail: number;
  readonly view: Window | null;
}

/**
 * Event types where TypeScript's DOM library disagrees with the defining
 * specification for events dispatched at elements.
 *
 * - `abort`, `error`: HTML fires plain `Event`s at media, image, script and
 *   link elements. `UIEvent`/`ErrorEvent` only apply to `Window`.
 * - `resize`: at elements this is the media `resize` event, a plain `Event`.
 * - `pointerrawupdate`: Pointer Events 3 fires a `PointerEvent`.
 * - `webkit*`: the Compatibility Standard aliases dispatch the unprefixed
 *   event interfaces.
 */
type ElementEventTypeCorrections = {
  abort: Event;
  error: Event;
  resize: Event;
  pointerrawupdate: PointerEvent;
  webkitanimationend: AnimationEvent;
  webkitanimationiteration: AnimationEvent;
  webkitanimationstart: AnimationEvent;
  webkittransitionend: TransitionEvent;
};

/** Element events that are specified but missing from TypeScript's DOM library. */
type ElementEventSupplements = {
  contentvisibilityautostatechange: DOMContentVisibilityAutoStateChangeEvent;
  scrollsnapchange: DOMSnapEvent;
  scrollsnapchanging: DOMSnapEvent;
  /** Non-standard; see `CompatibilityNativeDOMEventPropMap`. */
  dragexit: DragEvent;
};

/** HTML element events missing from TypeScript's DOM library. */
type HTMLElementEventSupplements = {
  command: DOMCommandEvent;
};

/**
 * SVG animation events. Their names are camelCase, so they are reachable only
 * through the case-preserving `on:` form (`on:beginEvent`).
 */
type SVGAnimationEventSupplements = {
  beginEvent: DOMTimeEvent;
  endEvent: DOMTimeEvent;
  repeatEvent: DOMTimeEvent;
};

/**
 * Events that `<body>` and `<frameset>` forward to their `Window` (see
 * `host/events.ts`): `WindowEventHandlers` plus the HTML
 * "Window-reflecting body element event handler set".
 */
export type WindowForwardedEventName =
  | keyof WindowEventHandlersEventMap
  | "blur"
  | "error"
  | "focus"
  | "load"
  | "resize"
  | "scroll";

/** Elements whose window-forwarded event listeners are attached to `Window`. */
type WindowReflectingElement = HTMLBodyElement | HTMLFrameSetElement;

type ElementEventMapBase<T extends Element> = T extends HTMLBodyElement
  ? HTMLBodyElementEventMap & HTMLElementEventSupplements
  : T extends HTMLFrameSetElement
    ? HTMLFrameSetElementEventMap & HTMLElementEventSupplements
    : T extends HTMLVideoElement
  ? HTMLVideoElementEventMap & HTMLElementEventSupplements
  : T extends HTMLMediaElement
    ? HTMLMediaElementEventMap & HTMLElementEventSupplements
    : T extends HTMLElement
      ? HTMLElementEventMap & HTMLElementEventSupplements
      : T extends SVGAnimationElement
        ? SVGElementEventMap & SVGAnimationEventSupplements
        : T extends SVGElement
          ? SVGElementEventMap
          : T extends MathMLElement
            ? MathMLElementEventMap
            : ElementEventMap;

type CorrectEventTypes<Events> = {
  [K in keyof Events]: K extends keyof ElementEventTypeCorrections
    ? ElementEventTypeCorrections[K]
    : Events[K];
};

/**
 * Maps event names to event types for listeners declared on an element of
 * type `T`.
 *
 * `<body>` and `<frameset>` include the window-forwarded events
 * ({@link WindowForwardedEventName}), typed as they are dispatched at
 * `Window`. `WindowEventHandlers` events are not included for `<svg>`: the
 * renderer only forwards them from `<body>`/`<frameset>`.
 */
export type DOMEventMapFor<T extends Element> = T extends WindowReflectingElement
  ? Omit<
      CorrectEventTypes<ElementEventMapBase<T> & ElementEventSupplements>,
      WindowForwardedEventName
    > &
      Pick<WindowEventMap, WindowForwardedEventName>
  : CorrectEventTypes<ElementEventMapBase<T> & ElementEventSupplements>;

/** The object a listener for `Name` declared on `T` is attached to. */
type ListenerTarget<T extends Element, Name> = T extends WindowReflectingElement
  ? Name extends WindowForwardedEventName
    ? Window
    : T
  : T;

/** A DOM event whose `currentTarget` has the specified element type. */
export type DOMEvent<T extends EventTarget, E extends Event = Event> = E & {
  readonly currentTarget: T;
};

/**
 * Function handler for a DOM event. The renderer invokes it with `this` bound
 * to the element, as `addEventListener` does.
 */
export type DOMEventHandler<T extends EventTarget, E extends Event = Event> = (
  this: T,
  event: DOMEvent<T, E>,
) => void;

/**
 * Listener options the renderer forwards to `addEventListener`.
 *
 * `signal` is deliberately absent: the listener's lifetime is owned by the
 * element binding and the renderer does not forward it.
 */
export type DOMEventListenerOptions = Pick<
  AddEventListenerOptions,
  "capture" | "once" | "passive"
>;

/** Listener object with `handleEvent` and the forwarded listener options. */
export interface DOMEventListenerObject<
  T extends EventTarget,
  E extends Event = Event,
> extends DOMEventListenerOptions {
  /** Handles an event whose `currentTarget` is typed as `T`. */
  handleEvent: (event: DOMEvent<T, E>) => void;
}

/** An event prop may be a handler function or a listener object with options. */
export type DOMEventHandlerProp<
  T extends EventTarget,
  E extends Event = Event,
> = DOMEventHandler<T, E> | DOMEventListenerObject<T, E>;

/**
 * Application-defined events, typed for `on:name` props on every element.
 *
 * @example
 * ```ts
 * declare module "@volynets/reflex-dom" {
 *   interface DOMCustomEventMap {
 *     "widget-ready": CustomEvent<{ id: string }>;
 *   }
 * }
 * ```
 */
export interface DOMCustomEventMap {}

type EventOf<Events, Name> = Name extends keyof Events
  ? Extract<Events[Name], Event>
  : Event;

type NativeDOMEventPropNameFor<Events> = {
  [K in keyof NativeDOMEventPropMap]: NativeDOMEventPropMap[K] extends keyof Events
    ? K
    : never;
}[keyof NativeDOMEventPropMap];

type NativeDOMEventProps<T extends Element, Events> = {
  [K in NativeDOMEventPropNameFor<Events>]?: DOMEventHandlerProp<
    ListenerTarget<T, NativeDOMEventPropMap[K]>,
    EventOf<Events, NativeDOMEventPropMap[K]>
  >;
};

type ColonEventName<Events> = (keyof Events | keyof DOMCustomEventMap) & string;

/**
 * `on:name` props: typed for the element's own events and for
 * {@link DOMCustomEventMap}; any other name stays open for undeclared custom
 * events and receives an untyped event.
 */
type ColonDOMEventProps<T extends Element, Events> = {
  [Name in
    | `on:${ColonEventName<Events>}`
    | `on:${string}`]?: Name extends `on:${infer Event extends ColonEventName<Events>}`
    ? DOMEventHandlerProp<
        ListenerTarget<T, Event>,
        Event extends keyof Events
          ? EventOf<Events, Event>
          : EventOf<DOMCustomEventMap, Event>
      >
    : // Undeclared custom events are intentionally open-ended.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      DOMEventHandlerProp<T, any>;
};

/** All event props (`onName` and `on:name`) for an element of type `T`. */
export type DOMEventProps<
  T extends Element,
  Events = DOMEventMapFor<T>,
> = NativeDOMEventProps<T, Events> & ColonDOMEventProps<T, Events>;
