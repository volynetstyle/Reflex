import { IS_DOM_AVAILABLE } from "../avaiblable";

type VendorPrefixedEvent =
  | "animationend"
  | "animationiteration"
  | "animationstart"
  | "transitionend";

/**
 * Один раз создаём style и вычисляем, какие свойства вообще поддерживаются.
 */
const style: CSSStyleDeclaration | null = IS_DOM_AVAILABLE
  ? document.createElement("div").style
  : null;

const supports =
  style && IS_DOM_AVAILABLE
    ? {
        animation: "animation" in style,
        WebkitAnimation: "WebkitAnimation" in style,
        transition: "transition" in style,
        WebkitTransition: "WebkitTransition" in style,
      }
    : null;

/**
 * Кэш по именам событий, чтобы не делать лишнюю логику после первого вызова.
 */
const cache: Partial<Record<VendorPrefixedEvent, string>> = Object.create(null);

/**
 * Возвращает корректное имя события для текущего окружения.
 */
export function getVendorPrefixedEventName(event: VendorPrefixedEvent): string {
  const cached = cache[event];
  if (cached) {
    return cached;
  }

  // SSR / тесты / нет style — ничего не мудрим
  if (!supports) {
    cache[event] = event;
    return event;
  }

  let resolved: string;

  switch (event) {
    case "animationend":
      resolved = supports.animation
        ? "animationend"
        : supports.WebkitAnimation
        ? "webkitAnimationEnd"
        : "animationend";
      break;

    case "animationiteration":
      resolved = supports.animation
        ? "animationiteration"
        : supports.WebkitAnimation
        ? "webkitAnimationIteration"
        : "animationiteration";
      break;

    case "animationstart":
      resolved = supports.animation
        ? "animationstart"
        : supports.WebkitAnimation
        ? "webkitAnimationStart"
        : "animationstart";
      break;

    case "transitionend":
      resolved = supports.transition
        ? "transitionend"
        : supports.WebkitTransition
        ? "webkitTransitionEnd"
        : "transitionend";
      break;

    default:
      // На случай расширения типів в будущем
      resolved = event;
  }

  cache[event] = resolved;
  return resolved;
}
