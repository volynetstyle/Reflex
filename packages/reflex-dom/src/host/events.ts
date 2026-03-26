function isOnPrefix(name: string): boolean {
  return name.charCodeAt(0) === 111 && name.charCodeAt(1) === 110;
}

function isColonEvent(name: string): boolean {
  return name.charCodeAt(2) === 58;
}

function resolveEventName(name: string): string {
  if (isColonEvent(name)) {
    return name.slice(3);
  }

  switch (name) {
    case "onDoubleClick":
    case "onDblClick":
      return "dblclick";
    default:
      return name.slice(2).toLowerCase();
  }
}

function isEventListenerObject(
  value: unknown,
): value is EventListenerObject & AddEventListenerOptions {
  return typeof value === "object" && value !== null && "handleEvent" in value;
}

function resolveEventOptions(
  handler: EventListenerOrEventListenerObject,
): AddEventListenerOptions | boolean | undefined {
  return isEventListenerObject(handler) ? handler : undefined;
}

export function isEventProp(name: string, value: unknown): boolean {
  return (
    name.length > 2 &&
    isOnPrefix(name) &&
    (typeof value === "function" || isEventListenerObject(value))
  );
}

export interface BoundEvent {
  event: string;
  handler: EventListenerOrEventListenerObject;
  options: AddEventListenerOptions | boolean | undefined;
}

export function bindEvent(
  name: string,
  handler: EventListenerOrEventListenerObject,
): BoundEvent {
  return {
    event: resolveEventName(name),
    handler,
    options: resolveEventOptions(handler),
  };
}

export function attachBoundEvent(
  el: Element,
  bound: BoundEvent,
): () => void {
  el.addEventListener(bound.event, bound.handler, bound.options);
  return () => {
    el.removeEventListener(bound.event, bound.handler, bound.options);
  };
}

export function attachEventListener(
  el: Element,
  name: string,
  handler: EventListenerOrEventListenerObject,
): () => void {
  return attachBoundEvent(el, bindEvent(name, handler));
}