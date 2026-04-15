import { describe, expect, it } from "vitest";
import { applyManagedFormProp, isManagedFormProp } from "../src/host/forms";

describe("managed form props", () => {
  it("recognizes managed and unmanaged form properties", () => {
    const textInput = document.createElement("input");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    const textarea = document.createElement("textarea");
    const select = document.createElement("select");
    const option = document.createElement("option");
    const div = document.createElement("div");

    expect(isManagedFormProp(textInput, "value")).toBe(true);
    expect(isManagedFormProp(textInput, "defaultValue")).toBe(true);
    expect(isManagedFormProp(checkbox, "value")).toBe(false);
    expect(isManagedFormProp(checkbox, "checked")).toBe(true);
    expect(isManagedFormProp(textarea, "value")).toBe(true);
    expect(isManagedFormProp(select, "selectedIndex")).toBe(true);
    expect(isManagedFormProp(option, "defaultSelected")).toBe(true);
    expect(isManagedFormProp(div, "value")).toBe(false);
  });

  it("applies input checked/defaultChecked/indeterminate/defaultValue", () => {
    const input = document.createElement("input");

    applyManagedFormProp(input, "checked", true);
    applyManagedFormProp(input, "defaultChecked", true);
    applyManagedFormProp(input, "indeterminate", true);
    applyManagedFormProp(input, "defaultValue", 123);

    expect(input.checked).toBe(true);
    expect(input.defaultChecked).toBe(true);
    expect(input.indeterminate).toBe(true);
    expect(input.defaultValue).toBe("123");
  });

  it("resets file inputs only when the incoming value is empty-like", () => {
    const input = document.createElement("input");
    input.type = "file";

    expect(applyManagedFormProp(input, "value", "ignored")).toBe("ignored");
    expect(applyManagedFormProp(input, "value", null)).toBeNull();
    expect(input.value).toBe("");
  });

  it("preserves selection for active text controls and tolerates unsupported selection APIs", () => {
    const input = document.createElement("input");
    input.value = "hello";
    document.body.appendChild(input);
    input.focus();
    input.setSelectionRange(2, 4, "backward");

    applyManagedFormProp(input, "value", "hello!");
    expect(input.value).toBe("hello!");
    expect(input.selectionStart).toBe(2);
    expect(input.selectionEnd).toBe(4);
    expect(input.selectionDirection).toBe("backward");

    const unsupported = document.createElement("input");
    unsupported.type = "text";
    document.body.appendChild(unsupported);
    unsupported.focus();

    Object.defineProperty(unsupported, "selectionStart", {
      configurable: true,
      get() {
        throw new Error("selection unsupported");
      },
    });

    expect(() => applyManagedFormProp(unsupported, "value", "safe")).not.toThrow();
    expect(unsupported.value).toBe("safe");
  });

  it("defers writes during composition and flushes the latest pending value", () => {
    const textarea = document.createElement("textarea");

    applyManagedFormProp(textarea, "value", "alpha");
    textarea.value = "alph";
    textarea.dispatchEvent(new Event("compositionstart"));

    applyManagedFormProp(textarea, "value", "beta");
    applyManagedFormProp(textarea, "value", "gamma");
    expect(textarea.value).toBe("alph");

    textarea.dispatchEvent(new Event("compositionend"));
    expect(textarea.value).toBe("gamma");
  });

  it("applies select values, selectedIndex, and option state/value props", () => {
    const select = document.createElement("select");
    select.innerHTML = `
      <option value="a">A</option>
      <option value="b">B</option>
      <option value="c">C</option>
    `;

    applyManagedFormProp(select, "value", "b");
    expect(select.value).toBe("b");

    applyManagedFormProp(select, "selectedIndex", 2);
    expect(select.selectedIndex).toBe(2);

    applyManagedFormProp(select, "selectedIndex", false);
    expect(select.selectedIndex).toBe(-1);

    select.multiple = true;
    applyManagedFormProp(select, "value", ["a", "c"]);
    expect(Array.from(select.selectedOptions).map((option) => option.value)).toEqual([
      "a",
      "c",
    ]);

    const option = select.options[1]!;
    applyManagedFormProp(option, "selected", true);
    applyManagedFormProp(option, "defaultSelected", true);
    applyManagedFormProp(option, "value", 77);

    expect(option.selected).toBe(true);
    expect(option.defaultSelected).toBe(true);
    expect(option.value).toBe("77");
  });
});
