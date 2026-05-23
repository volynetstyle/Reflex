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

export function isEventProp(name: string, value: unknown): boolean {
  return (
    isOnPrefix(name) &&
    (typeof value === "function" || isEventListenerObject(value))
  );
}

export function attachEventListener(
  el: Element,
  name: string,
  handler: EventListenerOrEventListenerObject,
): () => void {
  const event = resolveEventName(name);

  el.addEventListener(event, handler);

  return () => {
    el.removeEventListener(event, handler);
  };
}