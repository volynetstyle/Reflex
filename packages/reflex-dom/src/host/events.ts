const ON_0 = 111; // o
const ON_1 = 110; // n
const COLON = 58; // :

const noop = (): void => {};

const EVENT_ALIASES = {
  onClick: "click",
  onInput: "input",
  onChange: "change",
  onSubmit: "submit",
  onKeyDown: "keydown",
  onKeyUp: "keyup",
  onMouseDown: "mousedown",
  onMouseUp: "mouseup",
  onMouseMove: "mousemove",
  onPointerDown: "pointerdown",
  onPointerUp: "pointerup",
  onPointerMove: "pointermove",
  onDoubleClick: "dblclick",
  onDblClick: "dblclick",
} as const;

const UPPER_A = 65;
const UPPER_Z = 90;
const HTML_NS = "http://www.w3.org/1999/xhtml";

/**
 * Events that `<body>` and `<frameset>` forward to their `Window`: the HTML
 * "Window-reflecting body element event handler set" and `WindowEventHandlers`.
 * They are dispatched at `Window`, so a listener on the element would never run.
 */
const WINDOW_FORWARDED_EVENTS: Record<string, true> = Object.assign(
  Object.create(null) as Record<string, true>,
  {
    afterprint: true,
    beforeprint: true,
    beforeunload: true,
    blur: true,
    error: true,
    focus: true,
    gamepadconnected: true,
    gamepaddisconnected: true,
    hashchange: true,
    languagechange: true,
    load: true,
    message: true,
    messageerror: true,
    offline: true,
    online: true,
    pagehide: true,
    pagereveal: true,
    pageshow: true,
    pageswap: true,
    popstate: true,
    rejectionhandled: true,
    resize: true,
    scroll: true,
    storage: true,
    unhandledrejection: true,
    unload: true,
  },
);

function isWindowReflectingElement(el: Element): boolean {
  return (
    el.namespaceURI === HTML_NS &&
    (el.localName === "body" || el.localName === "frameset")
  );
}

/**
 * Target that receives `event` for a listener declared on `el`: the element
 * itself, or its `Window` for window-forwarded events on `<body>`/`<frameset>`
 * (`null` when the document has no `Window`).
 */
function resolveListenerTarget(el: Element, event: string): EventTarget | null {
  return WINDOW_FORWARDED_EVENTS[event] === true && isWindowReflectingElement(el)
    ? el.ownerDocument.defaultView
    : el;
}

function isOnPrefix(name: string): boolean {
  return (
    name.length > 2 &&
    name.charCodeAt(0) === ON_0 &&
    name.charCodeAt(1) === ON_1
  );
}

function isColonEvent(name: string): boolean {
  return name.length > 3 && name.charCodeAt(2) === COLON;
}

const resolvedEventNames: Record<string, string> = Object.create(null);

function resolveEventName(name: string): string {
  const cached = resolvedEventNames[name];
  if (cached !== undefined) return cached;

  const resolved = isColonEvent(name)
    ? name.slice(3)
    : (EVENT_ALIASES[name as keyof typeof EVENT_ALIASES] ??
      name.slice(2).toLowerCase());

  resolvedEventNames[name] = resolved;
  return resolved;
}

function isEventListenerObject(value: unknown): value is EventListenerObject {
  return value !== null && typeof value === "object" && "handleEvent" in value;
}

function getEventListenerOptions(
  value: EventListenerOrEventListenerObject,
): AddEventListenerOptions | undefined {
  if (!isEventListenerObject(value)) return undefined;

  const options = value as EventListenerObject & AddEventListenerOptions;
  return options.once === true ||
    options.capture === true ||
    options.passive === true ||
    options.signal != null
    ? {
        once: options.once,
        capture: options.capture,
        passive: options.passive,
        signal: options.signal,
      }
    : undefined;
}

/**
 * Whether `name`/`value` declare an event listener.
 *
 * `on:name` and `onName` (uppercase after `on`) are always events. A lowercase
 * `onname` is an event only when it is a native event handler property of
 * `element` (`onclick`); otherwise it is an ordinary prop, so custom-element
 * props such as `onboarding` can take accessors. Without an element (server
 * rendering) lowercase names are treated as events.
 */
export function isEventProp(
  name: string,
  value: unknown,
  element?: Element,
): boolean {
  if (
    !isOnPrefix(name) ||
    !(typeof value === "function" || isEventListenerObject(value))
  ) {
    return false;
  }

  const third = name.charCodeAt(2);

  return (
    third === COLON ||
    (third >= UPPER_A && third <= UPPER_Z) ||
    element === undefined ||
    name in element
  );
}

export function attachEventListener<Context = undefined>(
  el: Element,
  name: string,
  handler: EventListenerOrEventListenerObject,
  dispatch?: (
    context: Context,
    handler: EventListenerOrEventListenerObject,
    receiver: EventTarget,
    event: Event,
  ) => void,
  context?: Context,
): () => void {
  const event = resolveEventName(name);
  const target = resolveListenerTarget(el, event);

  if (target === null) {
    return noop;
  }

  const options = getEventListenerOptions(handler);
  // An aborted signal never attaches, independent of the host's support.
  if (options?.signal?.aborted === true) return noop;
  const listener =
    dispatch === undefined
      ? handler
      : isEventListenerObject(handler)
        ? {
            handleEvent(event: Event) {
              dispatch(context!, handler, target, event);
            },
          }
        : function (this: EventTarget, event: Event) {
            dispatch(context!, handler, this, event);
          };

  target.addEventListener(event, listener, options);

  return () => {
    target.removeEventListener(event, listener, options);
  };
}
