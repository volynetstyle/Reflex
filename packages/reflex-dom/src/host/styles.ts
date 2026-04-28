import type { StyleObject, StyleValue } from "../types";

type StyleRecord = Record<string, string | number | null | undefined>;
type MutableStyle = CSSStyleDeclaration &
  Record<string, string | number | null | undefined>;

type StylableElement = Element & { style: CSSStyleDeclaration };

function hasStyle(el: Element): el is StylableElement {
  return "style" in el;
}

function isCustomProp(key: string): boolean {
  return key.charCodeAt(0) === 45 && key.charCodeAt(1) === 45;
}

function clearStyleKey(style: CSSStyleDeclaration, key: string): void {
  if (isCustomProp(key)) {
    style.removeProperty(key);
  } else {
    (style as MutableStyle)[key] = "";
  }
}

function setStyleKey(
  style: CSSStyleDeclaration,
  key: string,
  value: string | number | null | undefined,
): void {
  if (value == null) {
    clearStyleKey(style, key);
  } else if (isCustomProp(key)) {
    style.setProperty(key, "" + value);
  } else {
    (style as MutableStyle)[key] = value;
  }
}

function applyStyleObject(style: CSSStyleDeclaration, next: StyleObject): void {
  const record = next as StyleRecord;

  for (const key in record) {
    setStyleKey(style, key, record[key]);
  }
}

function clearStyleObject(style: CSSStyleDeclaration, prev: StyleObject): void {
  const record = prev as StyleRecord;

  for (const key in record) {
    clearStyleKey(style, key);
  }
}

function patchStyleObject(
  style: CSSStyleDeclaration,
  next: StyleObject,
  prev: StyleObject,
): void {
  const nextRecord = next as StyleRecord;
  const prevRecord = prev as StyleRecord;

  for (const key in prevRecord) {
    if (!(key in nextRecord)) {
      clearStyleKey(style, key);
    }
  }

  for (const key in nextRecord) {
    const nextValue = nextRecord[key];

    if (prevRecord[key] !== nextValue) {
      setStyleKey(style, key, nextValue);
    }
  }
}

export function applyStyle(
  el: Element,
  next: StyleValue | null | undefined,
  prev: StyleValue | null | undefined,
): StyleValue | null | undefined {
  if (next === prev) return next;
  if (!hasStyle(el)) return next;

  const style = el.style;

  if (next == null) {
    if (prev != null) {
      if (typeof prev === "string") {
        style.cssText = "";
      } else {
        clearStyleObject(style, prev);
      }

      el.removeAttribute("style");
    }

    return next;
  }

  if (typeof next === "string") {
    style.cssText = next;
    return next;
  }

  if (prev == null) {
    applyStyleObject(style, next);
    return next;
  }

  if (typeof prev === "string") {
    style.cssText = "";
    applyStyleObject(style, next);
    return next;
  }

  patchStyleObject(style, next, prev);
  return next;
}