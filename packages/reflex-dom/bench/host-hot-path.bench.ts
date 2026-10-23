import { bench, describe } from "vitest";
import { normalizeAttr } from "../src/host/aliases";
import { applyManagedFormProp } from "../src/host/forms";
import { appendRenderableNodes } from "../src/mount/append";
import { classifyRenderable } from "../src/renderable/classify";

const options = { time: 300, warmupTime: 100 };
const operations = 1_024;
const names = [
  "className",
  "htmlFor",
  "strokeWidth",
  "viewBox",
  "id",
  "data-value",
];
const values = [
  undefined,
  null,
  false,
  "text",
  42,
  1n,
  [],
  () => 1,
  new Set([1]),
];

describe("host hot paths", () => {
  bench(
    "classify mixed renderables",
    () => {
      let result = 0;
      for (let i = 0; i < operations; i++) {
        result += classifyRenderable(values[i % values.length]);
      }
      if (result === 0) throw new Error("missing classifications");
    },
    options,
  );

  bench(
    "normalize attribute names",
    () => {
      let result = 0;
      for (let i = 0; i < operations; i++) {
        result += normalizeAttr(names[i % names.length]!).length;
      }
      if (result === 0) throw new Error("missing attribute names");
    },
    options,
  );

  const parent = document.createElement("div");
  bench(
    "append single text",
    () => {
      appendRenderableNodes(parent, "text", "html");
      parent.textContent = "";
    },
    options,
  );

  const nested = [[null, "first"], new Set(["middle"]), [false, ["last"]]];
  bench(
    "append nested children",
    () => {
      appendRenderableNodes(parent, nested, "html");
      parent.textContent = "";
    },
    options,
  );

  const select = document.createElement("select");
  select.add(new Option("first", "0"));
  select.add(new Option("second", "1"));
  let value = 0;
  bench(
    "write single select value",
    () => {
      applyManagedFormProp(select, "value", (value ^= 1));
    },
    options,
  );
});
