type TextControlElement = HTMLInputElement | HTMLTextAreaElement;

interface TextControlState {
  composing: boolean;
  pendingValue: string | null;
}

const textControlStates = new WeakMap<TextControlElement, TextControlState>();
const NON_TEXT_INPUT_TYPES: ReadonlySet<string> = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
] as const);

function isTextInput(el: HTMLInputElement): boolean {
  return !NON_TEXT_INPUT_TYPES.has(el.type);
}

function getTextControlState(el: TextControlElement): TextControlState {
  let state = textControlStates.get(el);

  if (state !== undefined) {
    return state;
  }

  state = {
    composing: false,
    pendingValue: null,
  };
  textControlStates.set(el, state);

  el.addEventListener("compositionstart", () => {
    state!.composing = true;
  });
  el.addEventListener("compositionend", () => {
    state!.composing = false;

    if (state!.pendingValue !== null) {
      setTextControlValue(el, state!.pendingValue);
      state!.pendingValue = null;
    }
  });

  return state;
}

function toTextValue(value: unknown): string {
  return value == null ? "" : String(value);
}

interface SelectionSnapshot {
  start: number;
  end: number;
  direction: "forward" | "backward" | "none" | null;
}

function captureSelection(el: TextControlElement): SelectionSnapshot | null {
  if (el.ownerDocument?.activeElement !== el) {
    return null;
  }

  try {
    const start = el.selectionStart;
    const end = el.selectionEnd;

    if (typeof start !== "number" || typeof end !== "number") {
      return null;
    }

    return {
      start,
      end,
      direction: el.selectionDirection,
    };
  } catch {
    return null;
  }
}

function restoreSelection(
  el: TextControlElement,
  snapshot: SelectionSnapshot | null,
): void {
  if (snapshot === null) {
    return;
  }

  const max = el.value.length;
  const start = Math.min(snapshot.start, max);
  const end = Math.min(snapshot.end, max);

  try {
    el.setSelectionRange(start, end, snapshot.direction ?? undefined);
  } catch {
    // Some input types do not support restoring selection ranges.
  }
}

function setTextControlValue(el: TextControlElement, next: string): void {
  if (el.value === next) {
    return;
  }

  const selection = captureSelection(el);
  el.value = next;
  restoreSelection(el, selection);
}

function applyTextControlValue(
  el: TextControlElement,
  value: unknown,
): unknown {
  const next = toTextValue(value);
  const state = getTextControlState(el);

  if (state.composing) {
    state.pendingValue = next;
    return value;
  }

  state.pendingValue = null;
  setTextControlValue(el, next);
  return value;
}

function applyTextControlDefaultValue(
  el: TextControlElement,
  value: unknown,
): unknown {
  el.defaultValue = toTextValue(value);
  return value;
}

function applyInputChecked(
  el: HTMLInputElement,
  value: unknown,
): unknown {
  el.checked = value === true;
  return value;
}

function applyInputDefaultChecked(
  el: HTMLInputElement,
  value: unknown,
): unknown {
  el.defaultChecked = value === true;
  return value;
}

function applyInputIndeterminate(
  el: HTMLInputElement,
  value: unknown,
): unknown {
  el.indeterminate = value === true;
  return value;
}

function normalizeSelectValues(
  value: unknown,
  multiple: boolean,
): readonly string[] {
  if (value == null) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map((entry) => String(entry));
  }

  const single = String(value);
  return multiple ? [single] : [single];
}

function applySelectValue(
  el: HTMLSelectElement,
  value: unknown,
): unknown {
  const values = normalizeSelectValues(value, el.multiple);

  if (el.multiple) {
    const selected = new Set(values);

    for (let i = 0; i < el.options.length; i++) {
      const option = el.options[i]!;
      option.selected = selected.has(option.value);
    }

    return value;
  }

  const next = values[0] ?? "";

  if (next === "") {
    el.selectedIndex = -1;
    return value;
  }

  el.value = next;
  return value;
}

function applySelectSelectedIndex(
  el: HTMLSelectElement,
  value: unknown,
): unknown {
  el.selectedIndex =
    value == null || value === false ? -1 : Number(value);
  return value;
}

function applyOptionSelected(
  el: HTMLOptionElement,
  value: unknown,
): unknown {
  el.selected = value === true;
  return value;
}

function applyOptionDefaultSelected(
  el: HTMLOptionElement,
  value: unknown,
): unknown {
  el.defaultSelected = value === true;
  return value;
}

function isManagedInputProp(el: HTMLInputElement, name: string): boolean {
  switch (name) {
    case "checked":
    case "defaultChecked":
    case "indeterminate":
      return true;
    case "value":
    case "defaultValue":
      return isTextInput(el) || el.type === "file";
    default:
      return false;
  }
}

export function isManagedFormProp(el: Element, name: string): boolean {
  if (el instanceof HTMLInputElement) {
    return isManagedInputProp(el, name);
  }

  if (el instanceof HTMLTextAreaElement) {
    return name === "value" || name === "defaultValue";
  }

  if (el instanceof HTMLSelectElement) {
    return (
      name === "value" ||
      name === "selectedIndex"
    );
  }

  if (el instanceof HTMLOptionElement) {
    return (
      name === "selected" ||
      name === "defaultSelected" ||
      name === "value"
    );
  }

  return false;
}

export function applyManagedFormProp(
  el: Element,
  name: string,
  value: unknown,
): unknown {
  if (el instanceof HTMLInputElement) {
    switch (name) {
      case "value":
        if (el.type === "file") {
          if (value == null || value === "") {
            el.value = "";
          }
          return value;
        }
        return applyTextControlValue(el, value);
      case "defaultValue":
        return applyTextControlDefaultValue(el, value);
      case "checked":
        return applyInputChecked(el, value);
      case "defaultChecked":
        return applyInputDefaultChecked(el, value);
      case "indeterminate":
        return applyInputIndeterminate(el, value);
    }
  }

  if (el instanceof HTMLTextAreaElement) {
    switch (name) {
      case "value":
        return applyTextControlValue(el, value);
      case "defaultValue":
        return applyTextControlDefaultValue(el, value);
    }
  }

  if (el instanceof HTMLSelectElement) {
    switch (name) {
      case "value":
        return applySelectValue(el, value);
      case "selectedIndex":
        return applySelectSelectedIndex(el, value);
    }
  }

  if (el instanceof HTMLOptionElement) {
    switch (name) {
      case "selected":
        return applyOptionSelected(el, value);
      case "defaultSelected":
        return applyOptionDefaultSelected(el, value);
      case "value":
        el.value = toTextValue(value);
        return value;
    }
  }

  return value;
}
