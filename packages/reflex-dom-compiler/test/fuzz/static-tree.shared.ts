/**
 * Generators for lowered `jsx(...)` trees: mostly compilable shapes, plus
 * hostile tags, props and characters that must fall back without changing
 * the mounted DOM.
 */
import fc from "fast-check";
import { expect } from "vitest";
import type { CompilerReport } from "../../src/diagnostics";
import { evaluate, mountApp } from "../harness/dom";

const HEADER =
  `import { jsx, Fragment } from "@volynets/reflex-dom/jsx-runtime";\n` +
  `import { render } from "@volynets/reflex-dom";\n` +
  // Opaque to the compiler: a call is a dynamic child, i.e. a hole.
  `const val = (x) => x;\n`;

const CHARS = ["a", "b", " ", "&", "<", ">", '"', "'", "\n", "\r", "\t", " ", "é", "😀", "="];
const text = fc.array(fc.constantFrom(...CHARS), { maxLength: 5 }).map((chars) => chars.join(""));
const escapeUnsafeForJsCode = (value: string): string =>
  value.replace(/[<>\u2028\u2029]/g, (ch) => {
    switch (ch) {
      case "<":
        return "\\u003C";
      case ">":
        return "\\u003E";
      case "\u2028":
        return "\\u2028";
      case "\u2029":
        return "\\u2029";
      default:
        return ch;
    }
  });
const str = text.map((value) => escapeUnsafeForJsCode(JSON.stringify(value)));
const num = fc.constantFrom("0", "1", "-0", "3.5", "1e21", "2n");
const bool = fc.constantFrom("true", "false");
const nil = fc.constantFrom("null", "undefined", "void 0");

const literalChild = fc.oneof(
  { weight: 4, arbitrary: str },
  { weight: 1, arbitrary: num },
  { weight: 1, arbitrary: fc.oneof(bool, nil) },
);

/**
 * Dynamic children: text, empty and accessor values take the marker path;
 * element and array values must make create() decline before building.
 */
const holeChild = fc.oneof(
  { weight: 3, arbitrary: str.map((s) => `val(${s})`) },
  { weight: 1, arbitrary: fc.oneof(num, nil, bool).map((v) => `val(${v})`) },
  { weight: 2, arbitrary: str.map((s) => `() => ${s}`) },
  { weight: 1, arbitrary: fc.constant(`() => jsx("i", { children: "accessor element" })`) },
  { weight: 1, arbitrary: fc.constant(`val(jsx("b", { children: "element value" }))`) },
  { weight: 1, arbitrary: str.map((s) => `val([${s}, "x"])`) },
);

const TAGS = [
  "div", "span", "p", "section", "a", "b", "em", "ul", "ol", "li", "h1", "h2",
  "button", "label", "img", "br", "hr", "small", "strong", "nav", "details", "summary",
  "fieldset", "legend",
  // Hostile: parser-sensitive, foreign or unsupported.
  "table", "tr", "td", "select", "option", "pre", "textarea", "my-el", "svg", "input",
];

const ATTRIBUTES: Record<string, fc.Arbitrary<string>> = {
  class: fc.oneof(str, num, bool, nil),
  className: str,
  id: fc.oneof(str, num, bool, nil),
  title: str,
  lang: fc.constantFrom('"en"', '"uk"', '""'),
  dir: fc.constantFrom('"ltr"', '"rtl"', '"auto"', '"bogus"'),
  role: str,
  "data-x": fc.oneof(str, num, bool, nil),
  "aria-hidden": fc.oneof(bool, str, nil),
  "aria-level": num,
  hidden: fc.oneof(bool, str, nil),
  disabled: fc.oneof(bool, str),
  inert: bool,
  href: fc.constantFrom('"/a"', '"#x"', '"https://e.x/?a=1&b=2"', '"javascript:alert(1)"', '" java\\tscript:x"', '""'),
  src: fc.constantFrom('"/i.png"', '"data:,x"'),
  alt: str,
  type: fc.constantFrom('"button"', '"submit"', '"bogus"'),
  htmlFor: str,
  for: fc.oneof(str, nil),
  crossOrigin: fc.constantFrom('"anonymous"', '"use-credentials"'),
  crossorigin: fc.oneof(fc.constantFrom('"anonymous"'), nil),
  target: str,
  style: fc.constant('"color: red"'),
  tabIndex: fc.constant("1"),
  value: str,
  onClick: fc.constant("() => {}"),
  width: fc.constant("10"),
};

const attributes = fc
  .uniqueArray(fc.constantFrom(...Object.keys(ATTRIBUTES)), { maxLength: 4 })
  .chain((names) =>
    fc.tuple(...names.map((name) => ATTRIBUTES[name]!.map((value) => `${JSON.stringify(name)}: ${value}`))),
  );

const { element } = fc.letrec<{ node: string; element: string; fragment: string }>((tie) => ({
  node: fc.oneof(
    { depthSize: "small", withCrossShrink: true },
    { weight: 3, arbitrary: literalChild },
    { weight: 1, arbitrary: holeChild },
    { weight: 3, arbitrary: tie("element") },
    { weight: 1, arbitrary: tie("fragment") },
  ),
  element: fc
    .record({
      tag: fc.constantFrom(...TAGS),
      props: attributes,
      children: fc.oneof(
        fc.constant(null),
        tie("node"),
        fc.array(tie("node"), { maxLength: 4 }).map((nodes) => `[${nodes.join(", ")}]`),
      ),
    })
    .map(({ tag, props, children }) => {
      const all = children === null ? props : [...props, `children: ${children}`];
      return `jsx(${JSON.stringify(tag)}, { ${all.join(", ")} })`;
    }),
  fragment: fc
    .array(tie("node"), { maxLength: 3 })
    .map((nodes) => `jsx(Fragment, { children: [${nodes.join(", ")}] })`),
}));

/** A module whose `App` returns one generated element. */
export const staticModule = element.map(
  (root) =>
    `${HEADER}function App() {\n  return ${root};\n}\n` +
    // The renderer is provably App's only caller.
    `export default (container) => render(jsx(App, {}), container);\n`,
);

export type Compile = (
  code: string,
  variant: "baseline" | "native" | "template" | "auto",
) => { body: string; report: CompilerReport | null } | Promise<{ body: string; report: CompilerReport | null }>;

export interface Coverage {
  samples: number;
  template: number;
  native: number;
  runtime: number;
  /** Compiled regions with a dynamic child. */
  holes: number;
}

export function newCoverage(): Coverage {
  return { samples: 0, template: 0, native: 0, runtime: 0, holes: 0 };
}

/**
 * Every compiled variant must mount exactly the baseline DOM, with the same
 * MutationObserver records for mount and dispose.
 */
export async function checkSample(code: string, compile: Compile, coverage: Coverage): Promise<void> {
  const baseline = mountApp(evaluate((await compile(code, "baseline")).body).default);
  const baselineDispose = baseline.dispose();
  coverage.samples++;
  for (const variant of ["native", "template", "auto"] as const) {
    const { body, report } = await compile(code, variant);
    if (variant === "template") {
      for (const region of report!.regions) {
        coverage[region.strategy]++;
        if (region.holes > 0 && region.strategy !== "runtime") coverage.holes++;
      }
    }
    const mounted = mountApp(evaluate(body).default);
    let disposeTrace: unknown = null;
    try {
      expect(mounted.snapshot, `${variant} DOM`).toEqual(baseline.snapshot);
      expect(mounted.html, `${variant} innerHTML`).toBe(baseline.html);
      expect(mounted.mutations, `${variant} mount mutations`).toEqual(baseline.mutations);
    } finally {
      disposeTrace = mounted.dispose();
    }
    expect(disposeTrace, `${variant} dispose mutations`).toEqual(baselineDispose);
  }
}

export const FUZZ_RUNS = Number((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.REFLEX_FUZZ_RUNS ?? 0) || 0;
