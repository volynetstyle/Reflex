const ON_0 = 111; // o
const ON_1 = 110; // n
const COLON = 58; // :

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

function resolveEventName(name: string): string {
  if (isColonEvent(name)) return name.slice(3);

  return (
    EVENT_ALIASES[name as keyof typeof EVENT_ALIASES] ??
    name.slice(2).toLowerCase()
  );
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

export function isEventProp(name: string, value: unknown): boolean {
  return (
    isOnPrefix(name) &&
    (typeof value === "function" || isEventListenerObject(value))
  );
}

export function attachEventListener<Context = undefined>(
  el: Element,
  name: string,
  handler: EventListenerOrEventListenerObject,
  dispatch?: (
    context: Context,
    handler: EventListenerOrEventListenerObject,
    receiver: Element,
    event: Event,
  ) => void,
  context?: Context,
): () => void {
  const event = resolveEventName(name);
  const options = getEventListenerOptions(handler);
  // An aborted signal never attaches, independent of the host's support.
  if (options?.signal?.aborted === true) return () => {};
  const listener =
    dispatch === undefined
      ? handler
      : isEventListenerObject(handler)
        ? {
            handleEvent(event: Event) {
              dispatch(context!, handler, el, event);
            },
          }
        : function (this: Element, event: Event) {
            dispatch(context!, handler, this, event);
          };

  el.addEventListener(event, listener, options);

  return () => {
    el.removeEventListener(event, listener, options);
  };
}
