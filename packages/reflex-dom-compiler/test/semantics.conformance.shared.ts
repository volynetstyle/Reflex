/**
 * The compiler's prop tables claim that, for every compilable tag, a static
 * prop has exactly one DOM effect: the attribute `staticAttribute` returns.
 * reflex-dom applies many props through DOM properties, whose setters differ
 * between engines (normalization, read-only getters), so the claim is checked
 * here against the real runtime instead of trusted from the spec.
 */
import { render } from "@volynets/reflex-dom";
import { jsx } from "@volynets/reflex-dom/jsx-runtime";
import {
  ATTRIBUTE_ALIASES,
  BOOLEAN_ATTRIBUTES,
  COMPILABLE_TAGS,
  STRING_ATTRIBUTES,
  URL_ATTRIBUTES,
  staticAttribute,
  type Literal,
} from "../src/semantics";

const PROPS = [
  "class",
  ...STRING_ATTRIBUTES,
  ...BOOLEAN_ATTRIBUTES,
  ...URL_ATTRIBUTES,
  ...Object.keys(ATTRIBUTE_ALIASES),
  "data-x",
  "data-long-name",
  "aria-label",
  "aria-hidden",
  // Rejected by the tables: the test must not depend on them compiling.
  "type",
  "tabIndex",
  "width",
];

const VALUES: unknown[] = [
  "x", "", "BOGUS", "ltr", "rtl", "auto", "lazy", "eager", "async", "submit",
  "button", "noopener", "_blank", "/p?q=1&r=2", "javascript:x", " java\tscript:x",
  'a"b<c>&', 0, 5, -0, 1e21, 2n, true, false, null, undefined,
];

function literalOf(value: unknown): Literal {
  switch (typeof value) {
    case "string":
      return { kind: "string", value };
    case "number":
      return { kind: "number", value };
    case "bigint":
      return { kind: "bigint", value: value.toString() };
    case "boolean":
      return { kind: "boolean", value };
    case "undefined":
      return { kind: "undefined" };
    default:
      return { kind: "null" };
  }
}

type Attributes = [string, string][] | string;

function attributesOf(element: Element | null): Attributes {
  if (element === null) return "no element";
  return Array.from(element.attributes, (a): [string, string] => [a.name, a.value]);
}

/** Mounts `props` as one element each; a throwing render reports per prop. */
function mountEach(doc: Document, tag: string, cases: [string, unknown][]): Attributes[] {
  const container = doc.createElement("div");
  try {
    const dispose = render(
      cases.map(([prop, value]) => jsx(tag, { [prop]: value })),
      container,
    );
    const result = Array.from(container.children, (child) => attributesOf(child));
    dispose();
    return result;
  } catch {
    if (cases.length === 1) return ["throws"];
    return cases.flatMap((single) => mountEach(doc, tag, [single]));
  }
}

export interface Conformance {
  checked: number;
  mismatches: string[];
}

export function checkSemantics(doc: Document): Conformance {
  let checked = 0;
  const mismatches: string[] = [];

  for (const tag of COMPILABLE_TAGS) {
    for (const value of VALUES) {
      const cases: [string, unknown][] = [];
      const expected: Attributes[] = [];
      for (const prop of PROPS) {
        const decision = staticAttribute(prop, literalOf(value));
        if (decision.kind === "reject") continue;
        cases.push([prop, value]);
        expected.push(
          decision.kind === "set" ? [[decision.attribute.name, decision.attribute.value]] : [],
        );
      }

      const actual = mountEach(doc, tag, cases);
      cases.forEach(([prop], index) => {
        checked++;
        const want = JSON.stringify(expected[index]);
        const got = JSON.stringify(actual[index]);
        if (want !== got) {
          mismatches.push(`<${tag} ${prop}={${String(value)}}>: compiler ${want}, runtime ${got}`);
        }
      });
    }
  }
  return { checked, mismatches };
}
