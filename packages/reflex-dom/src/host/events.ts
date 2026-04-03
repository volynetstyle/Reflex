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

export function attachEventListener(
  el: Element,
  name: string,
  handler: EventListenerOrEventListenerObject,
): () => void {
  const event = resolveEventName(name);
  const options = resolveEventOptions(handler);
  el.addEventListener(event, handler, options);

  return () => {
    el.removeEventListener(event, handler, options);
  };
}
