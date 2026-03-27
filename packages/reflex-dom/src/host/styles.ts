import type { StyleObject, StyleValue } from "../types";

type StyleRecord = Record<string, string | number | null | undefined>;

function toStyleRecord(value: StyleObject): StyleRecord {
  return value as StyleRecord;
}

function isCustomProp(key: string): boolean {
  return key.charCodeAt(0) === 45 && key.charCodeAt(1) === 45;
}

function clearStyleString(style: CSSStyleDeclaration): void {
  style.cssText = "";
}

function clearStyleObject(
  style: CSSStyleDeclaration,
  prev: StyleObject,
): void {
  for (const key in prev) {
    if (isCustomProp(key)) {
      style.removeProperty(key);
    } else {
      (style as any)[key] = "";
    }
  }
}

function setStyleValue(
  style: CSSStyleDeclaration,
  key: string,
  value: unknown,
): void {
  if (value == null) {
    if (isCustomProp(key)) {
      style.removeProperty(key);
    } else {
      (style as any)[key] = "";
    }
    return;
  }

  if (isCustomProp(key)) {
    style.setProperty(key, String(value));
  } else {
    (style as any)[key] = value;
  }
}

function patchStyleObject(
  style: CSSStyleDeclaration,
  next: StyleObject,
  prev: StyleObject,
): void {
  const nextRecord = toStyleRecord(next);
  const prevRecord = toStyleRecord(prev);

  // remove stale keys
  for (const key in prevRecord) {
    if (!(key in nextRecord)) {
      if (isCustomProp(key)) {
        style.removeProperty(key);
      } else {
        (style as any)[key] = "";
      }
    }
  }

  // apply only changed keys
  for (const key in nextRecord) {
    const nextValue = nextRecord[key];
    if (prevRecord[key] !== nextValue) {
      setStyleValue(style, key, nextValue);
    }
  }
}

export function applyStyle(
  el: Element,
  next: StyleValue | null | undefined,
  prev: StyleValue | null | undefined,
): StyleValue | null | undefined {
  if (!(el instanceof HTMLElement || el instanceof SVGElement)) {
    return next;
  }

  if (next === prev) {
    return next;
  }

  const style = el.style;

  if (next == null) {
    if (prev != null) {
      if (typeof prev === "string") {
        clearStyleString(style);
      } else {
        clearStyleObject(style, prev);
      }
      el.removeAttribute("style");
    }
    return next;
  }

  if (typeof next === "string") {
    if (typeof prev !== "string" || prev !== next) {
      style.cssText = next;
    }
    return next;
  }

  if (prev == null) {
    const nextRecord = toStyleRecord(next);

    for (const key in nextRecord) {
      setStyleValue(style, key, nextRecord[key]);
    }
    return next;
  }

  if (typeof prev === "string") {
    clearStyleString(style);
    const nextRecord = toStyleRecord(next);

    for (const key in nextRecord) {
      setStyleValue(style, key, nextRecord[key]);
    }
    return next;
  }

  patchStyleObject(style, next, prev);
  return next;
}
