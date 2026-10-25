import { describe, expect, it } from "vitest";
import { commands, server } from "vitest/browser";
import type { CompilerReport } from "../src/diagnostics";
import { evaluate, mountApp } from "./harness/dom";

declare module "vitest/browser" {
  interface BrowserCommands {
    compileLowered(code: string, variant: string): Promise<{ body: string; report: CompilerReport | null }>;
  }
}

const SOURCE = `import { jsx, jsxs } from "@volynets/reflex-dom/jsx-runtime";
import { render } from "@volynets/reflex-dom";
function App() {
  return jsxs("section", { class: "card", children: [
    jsx("h2", { children: "Title" }),
    jsx("p", { children: "<not markup> & text" }),
  ] });
}
export default (container) => render(jsx(App, {}), container);`;

async function load(variant: "baseline" | "native" | "template") {
  // A fresh evaluation: template regions have not been prepared yet.
  const { body, report } = await commands.compileLowered(SOURCE, variant);
  if (variant !== "baseline") expect(report!.regions.map((r) => r.strategy)).toEqual([variant]);
  return evaluate(body).default;
}

async function trustedTypesFrame(): Promise<{ doc: Document; violations: string[]; remove(): void }> {
  const frame = document.createElement("iframe");
  frame.srcdoc =
    `<!doctype html><meta http-equiv="Content-Security-Policy" ` +
    `content="require-trusted-types-for 'script'"><body></body>`;
  const loaded = new Promise((resolve) => (frame.onload = resolve));
  document.body.appendChild(frame);
  await loaded;
  const doc = frame.contentDocument!;
  const violations: string[] = [];
  doc.addEventListener("securitypolicyviolation", (event) => violations.push(event.violatedDirective));
  return { doc, violations, remove: () => frame.remove() };
}

// Chromium enforces Trusted Types; the others may not, which the test detects.
describe.runIf(server.browser === "chromium")("Trusted Types", () => {
  it("the frame really enforces the policy", async () => {
    const { doc, remove } = await trustedTypesFrame();
    expect(() => {
      doc.createElement("div").innerHTML = "<b>x</b>";
    }).toThrow(/TrustedHTML/); // A TypeError of the frame realm
    remove();
  });

  it("template regions fall back to the runtime instead of bypassing the policy", async () => {
    const { doc, violations, remove } = await trustedTypesFrame();
    const baseline = mountApp(await load("baseline"), doc);
    const compiled = mountApp(await load("template"), doc);
    expect(compiled.snapshot).toEqual(baseline.snapshot);
    expect(compiled.html).toBe(baseline.html);
    // The template parse was attempted and refused by the policy; violation
    // events are dispatched asynchronously.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(violations.length).toBeGreaterThan(0);
    baseline.dispose();
    compiled.dispose();
    remove();
  });

  it("native regions need no HTML parsing at all", async () => {
    const { doc, violations, remove } = await trustedTypesFrame();
    const baseline = mountApp(await load("baseline"), doc);
    const compiled = mountApp(await load("native"), doc);
    expect(compiled.snapshot).toEqual(baseline.snapshot);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(violations).toEqual([]);
    baseline.dispose();
    compiled.dispose();
    remove();
  });
});
