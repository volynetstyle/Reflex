// @vitest-environment node
import { describe, expect, it } from "vitest";
import { formatReport, summarizeReport, transformReflexDOM } from "../src";
import type { ReflexDOMCompilerOptions } from "../src";

const IMPORT = `import { jsx, jsxs, Fragment } from "@volynets/reflex-dom/jsx-runtime";\n`;

function compile(body: string, options: ReflexDOMCompilerOptions = {}, header = IMPORT) {
  return transformReflexDOM(header + body, { strategy: "template", ...options });
}

function only(body: string, options?: ReflexDOMCompilerOptions, header?: string) {
  const { report, code } = compile(body, options, header);
  expect(report.regions).toHaveLength(1);
  return { region: report.regions[0]!, code };
}

const RENDER = `import { For, render } from "@volynets/reflex-dom";\n`;

/** A component whose only caller is provably the renderer. */
const component = (expr: string) =>
  `${RENDER}function App() { return ${expr}; }\nrender(jsx(App, {}), root);`;

describe("lowering", () => {
  const profile = component(
    `jsxs("section", { class: "profile", children: [jsx("h2", { children: "Profile" }), jsx("p", { children: "Welcome" })] })`,
  );

  it("emits the plan's native-tree shape", () => {
    const { code, report } = compile(profile, { strategy: "native" });
    expect(report.regions[0]).toMatchObject({ static: true, strategy: "native", nodes: 5, reason: null });
    expect(code).toContain(`const e0 = d.createElement("section");`);
    expect(code).toContain(`e0.className = "profile";`);
    expect(code).toContain(`e1.textContent = "Profile";`);
    expect(code).toContain(`e0.append(e1, e2);`);
    expect(code).toContain("return _compiled(_create, _fallback);");
  });

  it("emits the plan's template shape", () => {
    const { code, report } = compile(profile);
    expect(report.regions[0]).toMatchObject({ strategy: "template" });
    expect(code).toContain(
      `_template("<section class=\\"profile\\"><h2>Profile</h2><p>Welcome</p></section>")`,
    );
  });

  it("keeps the source tree as the fallback", () => {
    const { code } = compile(profile);
    expect(code).toMatch(/function _fallback\(\) \{\s+return jsxs\("section"/);
  });

  it("places helpers after the imports, before any user code", () => {
    const { code } = compile(`const early = other();\n${profile}`, {}, IMPORT + `import { other } from "x";\n`);
    const helperImport = code.indexOf(`from "@volynets/reflex-dom-compiler/runtime"`);
    expect(helperImport).toBeGreaterThan(code.indexOf(`from "x"`));
    expect(code.indexOf("const _tpl")).toBeGreaterThan(helperImport);
    expect(code.indexOf("const _tpl")).toBeLessThan(code.indexOf("const early"));
  });

  it("accepts jsxDEV calls with inert source arguments", () => {
    const { region } = only(
      component(`jsxDEV("p", { children: "dev" }, void 0, false, { fileName: "a.tsx", lineNumber: 1 }, this)`),
      {},
      IMPORT + `import { jsxDEV } from "@volynets/reflex-dom/jsx-dev-runtime";\n`,
    );
    expect(region.strategy).toBe("template");
  });
});

describe("binding resolution", () => {
  it("ignores a local function named jsx", () => {
    const { report } = compile(component(`jsx("p", { children: "x" })`), {}, "function jsx() {}\n");
    expect(report.regions).toHaveLength(0);
  });

  it("ignores a parameter shadowing the factory import", () => {
    const { report } = compile(`export function App(jsx) { return jsx("p", { children: "x" }); }`);
    expect(report.regions).toHaveLength(0);
  });

  it("ignores factories from other modules", () => {
    const { report } = compile(
      component(`jsx("p", { children: "x" })`),
      {},
      `import { jsx } from "react/jsx-runtime";\n`,
    );
    expect(report.regions).toHaveLength(0);
  });

  it("accepts configured factory sources", () => {
    const { report } = compile(
      component(`jsx("p", { children: "x" })`),
      { factorySources: ["my-jsx"] },
      `import { jsx } from "my-jsx";\n`,
    );
    expect(report.regions[0]!.strategy).toBe("template");
  });
});

describe("evaluation timing", () => {
  it("never moves user expressions", () => {
    const body = component(`jsx("div", { id: makeId(), children: () => value() })`);
    const { region, code } = only(body);
    expect(region).toMatchObject({ static: false, strategy: "runtime", reason: `dynamic prop "id"` });
    expect(code).toContain(`id: makeId()`);
    expect(code).not.toContain("_compiled");
  });

  it("allocates a fresh descriptor per evaluation", () => {
    const { code } = compile(component(`jsx("p", { children: "x" })`));
    expect(code).toMatch(/function App\(\) \{\s+return _compiled\(/);
  });
});

describe("escape analysis", () => {
  it.each([
    [`const saved = jsx("p", {});\n${component("saved")}`, "stored in a variable"],
    [`function helper() { return jsx("p", {}); }`, `"helper" is never rendered`],
    [component(`jsx(Card, { children: jsx("p", {}) })`), "children of component <Card>"],
    [component(`jsx(Card, { header: jsx("p", {}) })`), "stored in an object"],
    [component(`wrap(jsx("p", {}))`), "passed as an argument"],
    [component(`[jsx("p", {})].map(x => x)`), "used in MemberExpression"],
    // Components: names prove nothing, only callers do.
    [`export function App() { return jsx("p", {}); }`, `"App" is exported, so its callers are unknown`],
    [`export const App = () => jsx("p", {});`, `"App" is exported`],
    [`export default () => jsx("p", {});`, "unknown callers"],
    [`${component(`jsx("p", {})`)}\nApp();`, `"App" is used outside a JSX component position`],
    [`${component(`jsx("p", {})`)}\nexport { App };`, `"App" is used outside a JSX component position`],
    [`function App() { return jsx("p", {}); }\nexport const view = jsx(App, {});`, `a <App> element escapes`],
    [`${RENDER}let App = () => jsx("p", {});\nApp = other;\nrender(jsx(App, {}), root);`, `"App" is reassigned`],
    [
      `${RENDER}function App() { return flag ? jsx("p", {}) : jsx("div", { id: x(), children: jsx(App, {}) }); }\nrender(jsx(App, {}), root);`,
      `"App" renders itself`,
    ],
    // For: only reflex-dom's, and only when the For element is consumed.
    [`${RENDER}export const list = jsx(For, { each: items, by: k, children: () => jsx("p", {}) });`, "stored in a variable"],
    [
      `import { For } from "elsewhere";\nimport { render } from "@volynets/reflex-dom";\nrender(jsx(For, { each: items, by: k, children: () => jsx("p", {}) }), root);`,
      "unknown callers",
    ],
  ])("keeps escaping descriptors on the runtime: %s", (body, reason) => {
    const region = compile(body).report.regions.find((r) => r.tag === "p")!;
    expect(region).toMatchObject({ static: true, strategy: "runtime" });
    expect(region.reason).toContain(reason);
  });

  it.each([
    component(`flag ? jsx("p", {}) : null`),
    component(`flag && jsx("p", {})`),
    component(`[jsx("p", {}), "text"]`),
    component(`jsx(Fragment, { children: jsx("p", {}) })`),
    component(`jsx("div", { id: dynamic(), children: jsx("p", {}) })`),
    `${RENDER}const App = () => jsx("p", {});\nrender(jsx(App, {}), root);`,
    `function card() { return jsx("p", {}); }\n${component(`jsx(card, {})`)}`,
    `${RENDER}render(jsx("p", {}), root);`,
    `${RENDER}render(jsx(For, { each: items, by: k, children: (item) => jsx("p", {}) }), root);`,
    `${RENDER}render(jsx(For, { each: items, by: k, children: function (item) { return jsx("p", {}); } }), root);`,
    `${RENDER}render(jsx(For, { each: items, by: k, fallback: jsx("p", {}), children: () => null }), root);`,
    component(`jsx(For, { each: items, by: k, children: () => jsx("p", {}) })`),
  ])("compiles consumed positions: %s", (body) => {
    const region = compile(body).report.regions.find((r) => r.tag === "p")!;
    expect(region.reason).toBeNull();
    expect(region.strategy).toBe("template");
  });
});

describe("negative corpus from the plan", () => {
  it.each([
    [`jsx("table", { children: jsx("tr", { children: jsx("td", { children: "Hello" }) }) })`, "table", "table parsing context"],
    [`jsx("select", { value: "b", children: [jsx("option", { value: "a", children: "A" })] })`, "select", "form control"],
    [`jsx("my-element", { ref: callback })`, "my-element", "custom element"],
    [`jsx("svg", { children: jsx("foreignObject", { children: jsx("div", { children: "Hello" }) }) })`, "div", "inside <svg>"],
    [`jsx("input", { value: "x" })`, "input", "form control"],
    [`jsx("pre", { children: "\\nx" })`, "pre", "unsupported element"],
  ])("keeps %s on the runtime", (expr, tag, reason) => {
    const { report, code } = compile(component(expr));
    expect(report.regions.every((r) => r.strategy === "runtime")).toBe(true);
    expect(report.regions.find((r) => r.tag === tag)!.reason).toContain(reason);
    expect(code).not.toContain("_compiled");
  });
});

describe("prop semantics", () => {
  const attrs = (props: string) => {
    const { region, code } = only(component(`jsx("div", { ${props} })`), { strategy: "native" });
    // Only the emitted builder: the fallback keeps the source props.
    const start = code.indexOf("function _create");
    return { region, code: start < 0 ? code : code.slice(start, code.indexOf("function _fallback")) };
  };

  it.each([
    [`style: "color: red"`, "style"],
    [`onClick: handler`, "event prop"],
    [`ref: callback`, "ref"],
    [`tabIndex: 1`, `prop "tabIndex"`],
    [`href: "javascript:alert(1)"`, "sanitized at runtime"],
    [`href: " JaVa\\tScRiPt:x"`, "sanitized at runtime"],
    [`disabled: "disabled"`, `non-boolean value for "disabled"`],
    [`id: true`, `boolean value for "id"`],
    [`width: 10`, `prop "width"`],
    [`class: "a", className: "b"`, "conflicting aliases"],
    // Fuzz regression: the later `false` removes what `className` set.
    [`className: "", class: false`, "conflicting aliases"],
    [`htmlFor: "f", for: null`, "conflicting aliases"],
    // Fuzz/conformance regression: fieldset.type is getter-only, button.type
    // normalizes in jsdom.
    [`type: "button"`, `prop "type"`],
    [`...rest`, "spread props"],
    [`["id"]: "x"`, "computed prop name"],
    [`get id() { return "x"; }`, "accessor or method"],
  ])("rejects %s", (props, reason) => {
    const { region } = attrs(props);
    expect(region.strategy).toBe("runtime");
    expect(region.reason).toContain(reason);
  });

  it("maps static values the way reflex-dom applies them", () => {
    const { region, code } = attrs(
      `className: "c", "aria-hidden": false, "aria-busy": true, "data-on": true, "data-off": false, ` +
        `"data-n": 5, hidden: true, inert: false, title: null, id: undefined, htmlFor: "f", href: "/x"`,
    );
    expect(region.strategy).toBe("native");
    expect(code).toContain(`e0.className = "c"`);
    expect(code).toContain(`e0.setAttribute("aria-hidden", "false")`);
    expect(code).toContain(`e0.setAttribute("aria-busy", "true")`);
    expect(code).toContain(`e0.setAttribute("data-on", "")`);
    expect(code).not.toContain("data-off");
    expect(code).toContain(`e0.setAttribute("data-n", "5")`);
    expect(code).toContain(`e0.setAttribute("hidden", "")`);
    expect(code).not.toContain("inert");
    expect(code).not.toContain(`"title"`);
    expect(code).toContain(`e0.setAttribute("for", "f")`);
    expect(code).toContain(`e0.setAttribute("href", "/x")`);
  });

  it("rejects keyed elements", () => {
    expect(only(component(`jsx("p", {}, "k")`)).region.reason).toBe("keyed element");
  });
});

describe("text topology and parser context", () => {
  it.each([
    [`jsx("p", { children: ["a", "b"] })`, "parser changed text"],
    [`jsx("p", { children: ["", "x"] })`, "parser"],
    [`jsx("p", { children: "cr\\r\\nlf" })`, "parser changed text"],
    [`jsx("p", { children: jsx("div", {}) })`, "parser moved <div> out of <p>"],
    [`jsx("a", { children: jsx("a", {}) })`, "parser"],
    [`jsx("img", { children: "x" })`, "parser"],
  ])("demotes %s from template to native", (expr, reason) => {
    const { region } = only(component(expr));
    expect(region.strategy).toBe("native");
    expect(region.reason).toContain(reason);
  });

  it("drops an empty scalar text but keeps empty array texts", () => {
    expect(only(component(`jsx("p", { children: "" })`)).region).toMatchObject({ strategy: "template", nodes: 1 });
    expect(only(component(`jsx("p", { children: [""] })`), { strategy: "native" }).code).toContain(`e0.append("")`);
  });

  it("formats numbers and bigints like String()", () => {
    const { code } = only(component(`jsx("p", { children: [1, 2n, -0, 1e21, true, null] })`), { strategy: "native" });
    expect(code).toContain(`e0.append("1", "2", "0", "1e+21")`);
  });
});

describe("strategy selection", () => {
  it("uses native below the auto heuristic and template above it", () => {
    const small = only(component(`jsx("p", { children: "x" })`), { strategy: "auto" }).region;
    expect(small).toMatchObject({ strategy: "native", reason: "below the auto template heuristic (2 < 8 nodes)" });

    const items = Array.from({ length: 4 }, (_, i) => `jsx("li", { children: "${i}" })`).join(", ");
    const large = only(component(`jsx("ul", { children: [${items}] })`), { strategy: "auto" }).region;
    expect(large).toMatchObject({ strategy: "template", nodes: 9 });
  });

  it("respects a custom minimum", () => {
    const { region } = only(component(`jsx("p", { children: "x" })`), { strategy: "auto", autoTemplateMinNodes: 2 });
    expect(region.strategy).toBe("template");
  });
});

describe("switching off", () => {
  const body = component(`jsx("p", { children: "x" })`);

  it("is a no-op with enabled: false", () => {
    const { code, report } = compile(body, { enabled: false });
    expect(report).toMatchObject({ disabled: true, regions: [] });
    expect(code).not.toContain("_compiled");
  });

  it("honours the file pragma", () => {
    const { code, report } = compile(`// @reflex-dom-compiler off\n${body}`);
    expect(report.disabled).toBe(true);
    expect(code).not.toContain("_compiled");
  });
});

describe("diagnostics", () => {
  it("explains every region", () => {
    const { report } = compile(
      component(`jsx("div", { id: x(), children: [jsx("p", { children: [jsx("div", {})] }), jsx("table", {})] })`),
    );
    const text = formatReport(report);
    expect(text).toContain("Region #1 <div>");
    expect(text).toContain(`Reason: dynamic prop "id"`);
    expect(text).toContain("Strategy: native");
    expect(text).toContain("Reason: parser context");
    expect(text).toContain("Reason: table parsing context <table>");
    expect(summarizeReport(report)).toMatchObject({ regions: 3, native: 1, runtime: 2, staticCoverage: 1 });
  });
});
