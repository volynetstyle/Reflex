import { describe, expect, it, vi } from "vitest";
import { createDOMRangeHandle } from "../src";

describe("native DOM range capabilities", () => {
  it("follows fragment transfer and delayed anchor restoration in a closed shadow root", async () => {
    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "closed" });
    const fragment = document.createDocumentFragment();
    const start = document.createComment("start");
    const end = document.createComment("end");
    const first = document.createElement("b");
    fragment.append(start, first, end);
    const handle = createDOMRangeHandle(start, end);
    const observer = {
      observe: vi.fn(),
      unobserve: vi.fn(),
    } as unknown as ResizeObserver;
    document.body.appendChild(host);
    try {
      handle.observe(observer);
      shadow.appendChild(fragment);
      await Promise.resolve();
      start.remove();
      end.remove();
      await Promise.resolve();
      expect(observer.unobserve).toHaveBeenCalledExactlyOnceWith(first);
      shadow.prepend(start);
      shadow.appendChild(end);
      await Promise.resolve();
      expect(observer.observe).toHaveBeenCalledTimes(2);
      const next = document.createElement("i");
      first.replaceWith(next);
      await Promise.resolve();
      expect(observer.observe).toHaveBeenLastCalledWith(next);
    } finally {
      handle.dispose();
      host.remove();
    }
  });

  it("follows adoption into another document and uses its active element", async () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    const other = iframe.contentDocument!;
    const parent = document.createDocumentFragment();
    const start = document.createTextNode("");
    const end = document.createTextNode("");
    const first = document.createElement("input");
    parent.append(start, first, end);
    const handle = createDOMRangeHandle(start, end);
    const observer = {
      observe: vi.fn(),
      unobserve: vi.fn(),
    } as unknown as IntersectionObserver;
    try {
      handle.observe(observer);
      other.body.append(start, first, end);
      await Promise.resolve();
      handle.focus();
      expect(other.activeElement).toBe(first);
      handle.blur();
      expect(other.activeElement).not.toBe(first);
      const next = other.createElement("input");
      first.replaceWith(next);
      await Promise.resolve();
      expect(observer.unobserve).toHaveBeenCalledExactlyOnceWith(first);
      expect(observer.observe).toHaveBeenLastCalledWith(next);
      expect(Array.from(handle.nodes())).toEqual([next]);
    } finally {
      handle.dispose();
      iframe.remove();
    }
  });

  it("focuses and blurs the first target inside a shadow root", () => {
    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "closed" });
    const start = document.createComment("start");
    const end = document.createComment("end");
    const first = document.createElement("input");
    const second = document.createElement("input");
    shadow.append(start, first, second, end);
    document.body.appendChild(host);
    const handle = createDOMRangeHandle(start, end);
    try {
      handle.focus();
      expect(shadow.activeElement).toBe(first);
      handle.blur();
      expect(shadow.activeElement).toBeNull();
    } finally {
      handle.dispose();
      host.remove();
    }
  });

  it.runIf(typeof Range.prototype.getClientRects === "function")(
    "measures text and elements and skips hidden focus targets",
    () => {
      const container = document.createElement("div");
      const start = document.createComment("start");
      const end = document.createComment("end");
      const text = document.createTextNode("measured text");
      const hidden = document.createElement("button");
      hidden.hidden = true;
      const input = document.createElement("input");
      container.append(start, text, hidden, input, end);
      document.body.appendChild(container);
      const handle = createDOMRangeHandle(start, end);
      try {
        const rects = handle.rects();
        expect(rects.length).toBeGreaterThanOrEqual(2);
        expect(rects.every((rect) => rect.width > 0 && rect.height > 0)).toBe(
          true,
        );
        handle.focus({ preventScroll: true });
        expect(document.activeElement).toBe(input);
        handle.blur();
        expect(document.activeElement).not.toBe(input);
      } finally {
        handle.dispose();
        container.remove();
      }
    },
  );

  it.runIf(typeof ResizeObserver !== "undefined")(
    "delivers native observations for replacement elements",
    async () => {
      const container = document.createElement("div");
      const start = document.createComment("start");
      const end = document.createComment("end");
      const first = document.createElement("div");
      first.style.height = "20px";
      container.append(start, first, end);
      document.body.appendChild(container);
      const handle = createDOMRangeHandle(start, end);
      const seen = new Set<Element>();
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) seen.add(entry.target);
      });
      try {
        handle.observe(observer);
        await vi.waitFor(() => expect(seen.has(first)).toBe(true));
        const next = document.createElement("div");
        next.style.height = "30px";
        first.replaceWith(next);
        await vi.waitFor(() => expect(seen.has(next)).toBe(true));
        expect(Array.from(handle.nodes())).toEqual([next]);
      } finally {
        handle.dispose();
        observer.disconnect();
        container.remove();
      }
    },
  );
});
