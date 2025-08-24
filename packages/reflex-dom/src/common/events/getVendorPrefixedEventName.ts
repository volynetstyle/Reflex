import { IS_DOM_AVAILABLE } from "../isDomAvailable";

/**
 * Style object used to detect supported CSS properties.
 * If the DOM is unavailable (SSR or test environment), `style` will be empty.
 */
let style: CSSStyleDeclaration | {} = {};

if (IS_DOM_AVAILABLE) {
  style = document.createElement("div").style;
}

/**
 * A map of modern event names to their possible vendor-prefixed alternatives.
 * In 2025, only `Webkit` prefixes may still be relevant for some legacy WebKit-based browsers.
 * Other prefixes (e.g., `Moz`) are considered obsolete and are not included.
 */
const vendorMap = {
  animationend: {
    animation: "animationend",
    WebkitAnimation: "webkitAnimationEnd",
  },
  animationiteration: {
    animation: "animationiteration",
    WebkitAnimation: "webkitAnimationIteration",
  },
  animationstart: {
    animation: "animationstart",
    WebkitAnimation: "webkitAnimationStart",
  },
  transitionend: {
    transition: "transitionend",
    WebkitTransition: "webkitTransitionEnd",
  },
};

/**
 * Simple cache to avoid repeatedly checking `style` for the same event name.
 */
const cache: Record<string, string> = {};

/**
 * Returns the correct event name for the current environment, using vendor prefixes if necessary.
 *
 * Notes on fallback behavior:
 * - In modern browsers (Chrome, Firefox, Edge, Safari), the unprefixed event name is sufficient.
 * - `Webkit` prefixes are retained only as a minimal fallback for legacy WebKit-based browsers.
 * - If the DOM is unavailable (e.g., server-side rendering), the original event name is returned.
 *
 * @param event - The standard event name, e.g., "transitionend" or "animationstart".
 * @returns The supported event name, possibly vendor-prefixed.
 */
export function getVendorPrefixedEventName(event: string): string {
  if (cache[event]) {
    return cache[event];
  }

  const map = vendorMap[event];

  if (!map) {
    return (cache[event] = event);
  }

  for (const prop in map) {
    if (prop in style) {
      return (cache[event] = map[prop]);
    }
  }

  // Fallback: return the original event name if no supported property is detected
  return (cache[event] = event);
}
