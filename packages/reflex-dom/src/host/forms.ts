type TextEntryControl = HTMLInputElement | HTMLTextAreaElement;

interface TextEntryControlState {
  composing: boolean;
  pendingValue: string | null;
}

const textEntryControlStates = new WeakMap<
  TextEntryControl,
  TextEntryControlState
>();
const NON_TEXTUAL_INPUT_TYPES: ReadonlySet<string> = new Set([
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

function isTextEntryInput(inputElement: HTMLInputElement): boolean {
  return !NON_TEXTUAL_INPUT_TYPES.has(inputElement.type);
}

function ensureTextEntryControlState(
  controlElement: TextEntryControl,
): TextEntryControlState {
  let state = textEntryControlStates.get(controlElement);

  if (state !== undefined) {
    return state;
  }

  state = {
    composing: false,
    pendingValue: null,
  };
  textEntryControlStates.set(controlElement, state);

  controlElement.addEventListener("compositionstart", () => {
    state!.composing = true;
  });
  controlElement.addEventListener("compositionend", () => {
    state!.composing = false;

    if (state!.pendingValue !== null) {
      writeTextControlValuePreservingSelection(
        controlElement,
        state!.pendingValue,
      );
      state!.pendingValue = null;
    }
  });

  return state;
}

function coerceFormValueToString(value: unknown): string {
  return value == null ? "" : String(value);
}

interface TextSelectionSnapshot {
  start: number;
  end: number;
  direction: "forward" | "backward" | "none" | null;
}

function captureActiveTextSelection(
  controlElement: TextEntryControl,
): TextSelectionSnapshot | null {
  if (controlElement.ownerDocument?.activeElement !== controlElement) {
    return null;
  }

  try {
    const start = controlElement.selectionStart;
    const end = controlElement.selectionEnd;

    if (typeof start !== "number" || typeof end !== "number") {
      return null;
    }

    return {
      start,
      end,
      direction: controlElement.selectionDirection,
    };
  } catch {
    return null;
  }
}

function restoreTextSelection(
  controlElement: TextEntryControl,
  selectionSnapshot: TextSelectionSnapshot | null,
): void {
  if (selectionSnapshot === null) {
    return;
  }

  const maxTextLength = controlElement.value.length;
  const start = Math.min(selectionSnapshot.start, maxTextLength);
  const end = Math.min(selectionSnapshot.end, maxTextLength);

  try {
    controlElement.setSelectionRange(
      start,
      end,
      selectionSnapshot.direction ?? undefined,
    );
  } catch {
    // Some input types do not support restoring selection ranges.
  }
}

function writeTextControlValuePreservingSelection(
  controlElement: TextEntryControl,
  nextValue: string,
): void {
  if (controlElement.value === nextValue) {
    return;
  }

  const activeSelection = captureActiveTextSelection(controlElement);
  controlElement.value = nextValue;
  restoreTextSelection(controlElement, activeSelection);
}

function applyControlledTextValue(
  controlElement: TextEntryControl,
  value: unknown,
): unknown {
  const nextValue = coerceFormValueToString(value);
  const state = ensureTextEntryControlState(controlElement);

  if (state.composing) {
    state.pendingValue = nextValue;
    return value;
  }

  state.pendingValue = null;
  writeTextControlValuePreservingSelection(controlElement, nextValue);
  return value;
}

function applyDefaultTextValue(
  controlElement: TextEntryControl,
  value: unknown,
): unknown {
  controlElement.defaultValue = coerceFormValueToString(value);
  return value;
}

function applyControlledCheckedState(
  inputElement: HTMLInputElement,
  value: unknown,
): unknown {
  inputElement.checked = value === true;
  return value;
}

function applyDefaultCheckedState(
  inputElement: HTMLInputElement,
  value: unknown,
): unknown {
  inputElement.defaultChecked = value === true;
  return value;
}

function applyIndeterminateState(
  inputElement: HTMLInputElement,
  value: unknown,
): unknown {
  inputElement.indeterminate = value === true;
  return value;
}

function normalizeSelectBoundValues(
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

function applyMultipleSelectValue(
  selectElement: HTMLSelectElement,
  selectedValues: readonly string[],
): void {
  const selectedValueSet = new Set(selectedValues);

  for (let optionIndex = 0; optionIndex < selectElement.options.length; optionIndex++) {
    const optionElement = selectElement.options[optionIndex]!;
    optionElement.selected = selectedValueSet.has(optionElement.value);
  }
}

function applySingleSelectValue(
  selectElement: HTMLSelectElement,
  selectedValues: readonly string[],
): void {
  const nextValue = selectedValues[0] ?? "";

  if (nextValue === "") {
    selectElement.selectedIndex = -1;
    return;
  }

  selectElement.value = nextValue;
}

function applyControlledSelectValue(
  selectElement: HTMLSelectElement,
  value: unknown,
): unknown {
  const selectedValues = normalizeSelectBoundValues(
    value,
    selectElement.multiple,
  );

  if (selectElement.multiple) {
    applyMultipleSelectValue(selectElement, selectedValues);
    return value;
  }

  applySingleSelectValue(selectElement, selectedValues);
  return value;
}

function applyControlledSelectedIndex(
  selectElement: HTMLSelectElement,
  value: unknown,
): unknown {
  selectElement.selectedIndex =
    value == null || value === false ? -1 : Number(value);
  return value;
}

function applyControlledOptionSelectedState(
  optionElement: HTMLOptionElement,
  value: unknown,
): unknown {
  optionElement.selected = value === true;
  return value;
}

function applyDefaultOptionSelectedState(
  optionElement: HTMLOptionElement,
  value: unknown,
): unknown {
  optionElement.defaultSelected = value === true;
  return value;
}

function isManagedInputProperty(
  inputElement: HTMLInputElement,
  name: string,
): boolean {
  switch (name) {
    case "checked":
    case "defaultChecked":
    case "indeterminate":
      return true;
    case "value":
    case "defaultValue":
      return isTextEntryInput(inputElement) || inputElement.type === "file";
    default:
      return false;
  }
}

export function isManagedFormProp(
  formElement: Element,
  name: string,
): boolean {
  if (formElement instanceof HTMLInputElement) {
    return isManagedInputProperty(formElement, name);
  }

  if (formElement instanceof HTMLTextAreaElement) {
    return name === "value" || name === "defaultValue";
  }

  if (formElement instanceof HTMLSelectElement) {
    return (
      name === "value" ||
      name === "selectedIndex"
    );
  }

  if (formElement instanceof HTMLOptionElement) {
    return (
      name === "selected" ||
      name === "defaultSelected" ||
      name === "value"
    );
  }

  return false;
}

export function applyManagedFormProp(
  formElement: Element,
  name: string,
  value: unknown,
): unknown {
  if (formElement instanceof HTMLInputElement) {
    switch (name) {
      case "value":
        if (formElement.type === "file") {
          if (value == null || value === "") {
            formElement.value = "";
          }
          return value;
        }
        return applyControlledTextValue(formElement, value);
      case "defaultValue":
        return applyDefaultTextValue(formElement, value);
      case "checked":
        return applyControlledCheckedState(formElement, value);
      case "defaultChecked":
        return applyDefaultCheckedState(formElement, value);
      case "indeterminate":
        return applyIndeterminateState(formElement, value);
    }
  }

  if (formElement instanceof HTMLTextAreaElement) {
    switch (name) {
      case "value":
        return applyControlledTextValue(formElement, value);
      case "defaultValue":
        return applyDefaultTextValue(formElement, value);
    }
  }

  if (formElement instanceof HTMLSelectElement) {
    switch (name) {
      case "value":
        return applyControlledSelectValue(formElement, value);
      case "selectedIndex":
        return applyControlledSelectedIndex(formElement, value);
    }
  }

  if (formElement instanceof HTMLOptionElement) {
    switch (name) {
      case "selected":
        return applyControlledOptionSelectedState(formElement, value);
      case "defaultSelected":
        return applyDefaultOptionSelectedState(formElement, value);
      case "value":
        formElement.value = coerceFormValueToString(value);
        return value;
    }
  }

  return value;
}
