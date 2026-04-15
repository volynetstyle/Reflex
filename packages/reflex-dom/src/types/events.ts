import type {
  CompatibilityNativeDOMEventPropMap,
  NativeDOMEventPropMap,
} from "./events.native";

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

export type DOMEventMapFor<T extends Element> = T extends HTMLVideoElement
  ? HTMLVideoElementEventMap
  : T extends HTMLMediaElement
    ? HTMLMediaElementEventMap
    : T extends SVGSVGElement
      ? SVGSVGElementEventMap
      : T extends HTMLBodyElement
        ? HTMLBodyElementEventMap
        : T extends HTMLFrameSetElement
          ? HTMLFrameSetElementEventMap
          : T extends HTMLElement
            ? HTMLElementEventMap
            : T extends SVGElement
              ? SVGElementEventMap
              : T extends MathMLElement
                ? MathMLElementEventMap
                : ElementEventMap;

type NativeDOMEventPropNameFor<Events extends object> =
  | {
      [K in keyof NativeDOMEventPropMap]: NativeDOMEventPropMap[K] extends
        keyof Events
        ? K
        : never;
    }[keyof NativeDOMEventPropMap]
  | keyof CompatibilityNativeDOMEventPropMap;

type NativeDOMEventProps<T extends Element, Events extends object> = {
  [K in NativeDOMEventPropNameFor<Events>]?: DOMEventHandlerProp<
    T,
    ResolveEvent<Events, NativeDOMEventPropMap[K]>
  >;
};

// Custom event names are intentionally open-ended for user-defined DOM events.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UnknownCustomDOMEventHandlerProp<T extends Element> = DOMEventHandlerProp<T, any>;

type CustomDOMEventProps<T extends Element, Events extends object> = {
  [K in keyof Events & string as `on:${K}`]?: DOMEventHandlerProp<
    T,
    Extract<Events[K], Event>
  >;
} & {
  [Name in `on:${string}` as Name extends `on:${keyof Events & string}`
    ? never
    : Name]?: UnknownCustomDOMEventHandlerProp<T>;
};

export type DOMEventProps<
  T extends Element,
  Events extends object = DOMEventMapFor<T>,
> = NativeDOMEventProps<T, Events> & CustomDOMEventProps<T, Events>;
