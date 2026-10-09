import { bench, describe } from "vitest";
import {
  createDOMRangeHandle,
  type DOMRangeHandle,
} from "../src/host/range-handle";

const options = { time: 300, warmupTime: 100 };
const noop = () => {};

function fixture(size: number) {
  const parent = document.createElement("div");
  const start = document.createComment("start");
  const end = document.createComment("end");
  parent.appendChild(start);
  for (let i = 0; i < size; i++) {
    const element = document.createElement("button");
    // Measure membership lookup independently of native scrolling/layout.
    element.scrollIntoView = noop;
    parent.appendChild(element);
  }
  parent.appendChild(end);
  document.body.appendChild(parent);
  const handle = createDOMRangeHandle(start, end);
  return {
    parent,
    start,
    end,
    handle,
    dispose() {
      handle.dispose();
      parent.remove();
    },
  };
}

describe("DOM range reads", () => {
  for (const size of [16, 1024]) {
    let range: ReturnType<typeof fixture>;
    const lifecycle = {
      ...options,
      setup() {
        range = fixture(size);
      },
      teardown() {
        range.dispose();
      },
    };
    bench(`snapshot / ${size}`, () => range.handle.nodes(), lifecycle);
    bench(
      `focus first element / ${size}`,
      () => range.handle.focus(),
      lifecycle,
    );
    bench(
      `scroll target lookup / ${size}`,
      () => range.handle.scrollIntoView(),
      lifecycle,
    );
  }

  let range: ReturnType<typeof fixture>;
  const retained: DOMRangeHandle[] = [];
  let slot = 0;
  bench(
    "create and dispose without observation",
    () => {
      const handle = createDOMRangeHandle(range.start, range.end);
      // Keep handles observable outside this call to prevent escape analysis
      // from removing the object allocation under test.
      retained[slot++ & 1023] = handle;
      handle.dispose();
    },
    {
      ...options,
      setup() {
        range = fixture(1);
      },
      teardown() {
        retained.length = 0;
        range.dispose();
      },
    },
  );
});

describe("DOM range observation", () => {
  for (const subscriptions of [1, 4]) {
    for (const mutation of [
      "unrelated",
      "descendant",
      "replacement",
    ] as const) {
      let ranges: ReturnType<typeof fixture>[];
      let outside: Element;
      bench(
        `${mutation} / 100 ranges / ${subscriptions} subscriptions`,
        async () => {
          const next = document.createElement("i");
          if (mutation === "replacement") {
            ranges[0]!.parent.children[0]!.replaceWith(next);
          } else {
            const parent =
              mutation === "unrelated"
                ? outside
                : ranges[0]!.parent.children[0]!;
            parent.appendChild(next);
            next.remove();
          }
          await Promise.resolve();
        },
        {
          ...options,
          setup() {
            outside = document.createElement("aside");
            document.body.appendChild(outside);
            ranges = Array.from({ length: 100 }, () => fixture(16));
            for (const range of ranges) {
              const observer = {
                observe: noop,
                unobserve: noop,
              } as unknown as ResizeObserver;
              for (let i = 0; i < subscriptions; i++)
                range.handle.observe(observer);
            }
          },
          teardown() {
            for (const range of ranges) range.dispose();
            outside.remove();
          },
        },
      );
    }
  }
});
