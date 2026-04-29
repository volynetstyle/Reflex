import { describe, expect, it, vi } from "vitest";
import { XLINK_NS } from "../src/host/namespace";
import { setAttr } from "../src/host/attr";
import { attachEventListener, isEventProp } from "../src/host/events";
import { attachRef } from "../src/host/refs";
import { sanitizeURL } from "../src/host/sanitize";
import { applyStyle } from "../src/host/styles";
import { isAttributeName } from "../src/host/isAttributeNameSafe";

describe("host security and DOM helpers", () => {
  it("blocks javascript URLs including whitespace and mixed-case protocol tricks", () => {
    expect(sanitizeURL("javascript:alert(1)")).toBe("about:blank");
    expect(sanitizeURL(" \nJaVa\tScRiPt:alert(1)")).toBe("about:blank");
    expect(sanitizeURL("https://example.com")).toBe("https://example.com");
    expect(sanitizeURL(42)).toBe("42");
  });

  it("sanitizes URL-valued properties and xlink attributes before writing to the DOM", () => {
    const anchor = document.createElement("a");
    const image = document.createElement("img");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");

    setAttr(anchor, "href", "javascript:alert(1)", "html");
    setAttr(image, "src", "javascript:alert(2)", "html");
    setAttr(use, "xlink:href", "javascript:alert(3)", "svg");

    expect(anchor.getAttribute("href")).toBe("about:blank");
    expect(image.getAttribute("src")).toBe("about:blank");
    expect(use.getAttributeNS(XLINK_NS, "href")).toBe("about:blank");
  });

  it("clears boolean and string properties when values are removed", () => {
    const button = document.createElement("button");
    const input = document.createElement("input");

    setAttr(button, "disabled", true, "html");
    setAttr(button, "disabled", false, "html", true);
    setAttr(input, "value", "hello", "html");
    setAttr(input, "value", null, "html", "hello");

    expect(button.disabled).toBe(false);
    expect(button.hasAttribute("disabled")).toBe(false);
    expect(input.value).toBe("");
    expect(input.hasAttribute("value")).toBe(false);
  });

  it("applies, patches, and clears style objects and strings", () => {
    const element = document.createElement("div");

    applyStyle(element, { color: "red", "--accent": "blue" }, undefined);
    expect(element.style.color).toBe("red");
    expect(element.style.getPropertyValue("--accent")).toBe("blue");

    applyStyle(
      element,
      { backgroundColor: "black", "--accent": null },
      { color: "red", "--accent": "blue" },
    );
    expect(element.style.color).toBe("");
    expect(element.style.backgroundColor).toBe("black");
    expect(element.style.getPropertyValue("--accent")).toBe("");

    applyStyle(element, "opacity:0.5", { backgroundColor: "black" });
    expect(element.style.opacity).toBe("0.5");

    applyStyle(element, null, "opacity:0.5");
    expect(element.getAttribute("style")).toBeNull();
  });

  it("recognizes safe attribute names and rejects malformed ones", () => {
    expect(isAttributeName("data-id")).toBe(true);
    expect(isAttributeName("xlink:href")).toBe(true);
    expect(isAttributeName("1bad")).toBe(false);
    expect(isAttributeName("bad name")).toBe(false);
    expect(isAttributeName("")).toBe(false);
  });

  it("supports function refs, object refs, and cleanup semantics", () => {
    const element = document.createElement("div");
    const objectRef = { current: null as HTMLDivElement | null };
    const refCalls: Array<HTMLDivElement | null> = [];
    const cleanup = vi.fn();
    const functionRef = vi.fn((value: HTMLDivElement | null) => {
      refCalls.push(value);
      return value === null ? undefined : cleanup;
    });

    const disposeObjectRef = attachRef(element, objectRef);
    const disposeFunctionRef = attachRef(element, functionRef);

    expect(objectRef.current).toBe(element);
    expect(functionRef).toHaveBeenCalledWith(element);

    disposeObjectRef();
    disposeFunctionRef();

    expect(objectRef.current).toBeNull();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(refCalls.at(-1)).toBeNull();
  });

  it("detects event props and supports object listeners plus dblclick aliases", () => {
    const button = document.createElement("button");
    const handled = vi.fn();
    const listener = {
      once: true,
      handleEvent: handled,
    };

    expect(isEventProp("onClick", () => {})).toBe(true);
    expect(isEventProp("onClick", "nope")).toBe(false);

    const disposeAlias = attachEventListener(button, "onDblClick", () => {
      handled("dblclick");
    });
    const disposeObject = attachEventListener(button, "on:custom-event", listener);

    button.dispatchEvent(new MouseEvent("dblclick"));
    button.dispatchEvent(new Event("custom-event"));
    button.dispatchEvent(new Event("custom-event"));

    expect(handled).toHaveBeenCalledWith("dblclick");
    expect(handled).toHaveBeenCalledTimes(2);

    disposeAlias();
    disposeObject();
  });
});
