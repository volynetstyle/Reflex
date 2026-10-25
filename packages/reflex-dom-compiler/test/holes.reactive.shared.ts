import { describe, expect, it } from "vitest";
import { jsx } from "@volynets/reflex-dom/jsx-runtime";
import { signal } from "../../reflex-dom/test/reactivity";
import type { CompilerReport } from "../src/diagnostics";
import { evaluate, mountApp, type Mounted } from "./harness/dom";

// One reactive hole between static siblings. The accessor comes from outside,
// so every variant runs the same signal sequence.
export const SOURCE = `import { jsx, jsxs } from "@volynets/reflex-dom/jsx-runtime";
import { render } from "@volynets/reflex-dom";
function App(props) {
  return jsxs("p", { class: "live", children: ["value: ", props.value, jsx("b", { children: "!" })] });
}
export const mount = (container, value) => render(jsx(App, { value }), container);
`;

type Variant = "baseline" | "native" | "template";
type Entry = { mount: (container: Element, value: () => unknown) => () => void };
export type CompileHoles = (code: string, variant: Variant) => { body: string; report: CompilerReport | null };

let compileSource: CompileHoles;

function load(variant: Variant): Entry {
  const { body, report } = compileSource(SOURCE, variant);
  if (variant !== "baseline") {
    expect(report!.regions).toMatchObject([{ strategy: variant, holes: 1 }]);
  }
  return evaluate(body) as unknown as Entry;
}

const STEPS: unknown[] = ["two", 3, null, "", "back", false, "last"];

interface Trace {
  html: string[];
  records: unknown[];
  sameTextNode: boolean[];
}

function run(variant: Variant, first: unknown, steps: readonly unknown[]): Trace {
  const [value, setValue] = signal<unknown>(first);
  const entry = load(variant);
  const read = value;
  let mounted: Mounted | null = null;
  // The observer of mountApp stays attached between steps.
  const observer = new MutationObserver(() => {});
  mounted = mountApp((container: Element) => {
    observer.observe(container, { childList: true, subtree: true, characterData: true, characterDataOldValue: true });
    return entry.mount(container, read);
  });
  const p = () => mounted!.container.querySelector("p")!;
  const textNode = p().childNodes[1];
  const trace: Trace = { html: [mounted.html], records: [mounted.mutations], sameTextNode: [] };
  observer.takeRecords();

  for (const step of steps) {
    setValue(step);
    trace.html.push(mounted.container.innerHTML);
    trace.records.push(
      observer.takeRecords().map((r) => ({
        type: r.type,
        oldValue: r.oldValue,
        added: Array.from(r.addedNodes, (n) => n.nodeName),
        removed: Array.from(r.removedNodes, (n) => n.nodeName),
      })),
    );
    trace.sameTextNode.push(p().childNodes[1] === textNode);
  }
  observer.disconnect();
  mounted.dispose();
  return trace;
}

/** Registers the differential suite with a node-side compiler. */
export function reactiveHoleSuite(compile: CompileHoles, label: string): void {
  compileSource = compile;
  describe(`reactive holes (${label})`, () => {
  it.each(["native", "template"] as const)("%s: updates in place exactly like the source tree", (variant) => {
    const baseline = run("baseline", "one", STEPS);
    const compiled = run(variant, "one", STEPS);
    expect(compiled).toEqual(baseline);
    // Text updates reuse the hole's Text node.
    expect(compiled.sameTextNode.every(Boolean)).toBe(true);
    expect(compiled.html[1]).toContain("value: two<b>!</b>");
  });

  const italic = () => jsx("i", { children: "structural" });
  const steps = () => [italic(), "text again", null, italic()];

  it.each(["native", "template"] as const)("%s: switches to structural content like the source tree", (variant) => {
    const baseline = run("baseline", "text", steps());
    const compiled = run(variant, "text", steps());
    expect(compiled.html[1]).toContain("<i>structural</i>");
    expect(compiled.html).toEqual(baseline.html);
    expect(compiled.records).toEqual(baseline.records);
  });

  it.each(["native", "template"] as const)("%s: a structural first value mounts like the source tree", (variant) => {
    const baseline = run("baseline", italic(), steps());
    const compiled = run(variant, italic(), steps());
    expect(compiled.html[0]).toContain("<i>structural</i>");
    expect(compiled.html).toEqual(baseline.html);
    expect(compiled.records).toEqual(baseline.records);
  });
});
}
