import {
  PHRASING_ELEMENTS,
  SCRIPT_SUPPORTING,
  VOID_ELEMENTS,
  IMPLIED_END_TAGS,
} from "../../client/nestingRule";

type LookupExistingFlag = 1 & { __brand: "LOOKUP_EXISTING_FLAG" };

const LOOKUP_EXISTING_FLAG = 1 as LookupExistingFlag;

// Local fast lookup builders (kept here to avoid exposing internal structures externally)
function createLookup(
  entries: Iterable<string>
): Record<string, LookupExistingFlag> {
  const o = Object.create(null) as Record<string, LookupExistingFlag>;
  for (const v of entries) {
    o[v] = LOOKUP_EXISTING_FLAG;
  }

  return o;
}

const PHRASING_LOOKUP = createLookup(PHRASING_ELEMENTS);
const SCRIPT_SUPPORTING_LOOKUP = createLookup(SCRIPT_SUPPORTING);
const IMPLIED_END_TAGS_LOOKUP = createLookup(IMPLIED_END_TAGS);
const VOID_LOOKUP = createLookup(VOID_ELEMENTS);

const enum AllowedKind {
  Any = 0,
  Phrasing = 1,
  Transparent = 2,
  Set = 3,
}

// https://html.spec.whatwg.org/multipage/
// Compact rules description to minimize bundle size & allocations.
// Format tuple: [tag, allowedKind, allowedList?, forbiddenList?]
// allowedKind: 0:any,1:phrasing,2:transparent,3:list (space separated in allowedList)
// For tags that allow only text (no element children) we use kind=3 with empty string.
// Void elements are excluded (handled by isVoid early-return) to avoid redundant entries.
// [tag, allowedKind, allowedList?, forbiddenList?]
// [0:any,1:phrasing,2:transparent,3:set]
const RULE_DATA: Array<
  [string, AllowedKind, string?, string?]
> = [
  // Document structure
  ["html", AllowedKind.Set, "head body"],
  [
    "head",
    AllowedKind.Set,
    "base link meta title style script noscript template",
  ],
  ["body", AllowedKind.Any],
  // Sectioning / grouping
  ["article", AllowedKind.Any, undefined, "main"],
  ["section", AllowedKind.Any],
  ["nav", AllowedKind.Any, undefined, "main"],
  ["aside", AllowedKind.Any, undefined, "main"],
  ["header", AllowedKind.Any, undefined, "header footer main"],
  ["footer", AllowedKind.Any, undefined, "header footer main"],
  [
    "address",
    AllowedKind.Any,
    undefined,
    "article aside header footer nav section h1 h2 h3 h4 h5 h6 address",
  ],
  ["search", AllowedKind.Any],
  // Headings
  ["h1", AllowedKind.Phrasing],
  ["h2", AllowedKind.Phrasing],
  ["h3", AllowedKind.Phrasing],
  ["h4", AllowedKind.Phrasing],
  ["h5", AllowedKind.Phrasing],
  ["h6", AllowedKind.Phrasing],
  // Grouping
  ["p", AllowedKind.Phrasing],
  ["div", AllowedKind.Any],
  ["main", AllowedKind.Any],
  ["blockquote", AllowedKind.Any],
  ["figure", AllowedKind.Any],
  ["figcaption", AllowedKind.Any],
  ["pre", AllowedKind.Phrasing],
  // Lists
  ["ul", AllowedKind.Set, "li script template"],
  ["ol", AllowedKind.Set, "li script template"],
  ["menu", AllowedKind.Set, "li script template"],
  ["li", AllowedKind.Any],
  ["dl", AllowedKind.Set, "dt dd div script template"],
  [
    "dt",
    AllowedKind.Any,
    undefined,
    "header footer article aside nav section h1 h2 h3 h4 h5 h6",
  ],
  ["dd", AllowedKind.Any],
  // Tables
  [
    "table",
    AllowedKind.Set,
    "caption colgroup thead tbody tfoot tr script template",
  ],
  ["caption", AllowedKind.Any, undefined, "table"],
  ["colgroup", AllowedKind.Set, "col template"],
  ["thead", AllowedKind.Set, "tr script template"],
  ["tbody", AllowedKind.Set, "tr script template"],
  ["tfoot", AllowedKind.Set, "tr script template"],
  ["tr", AllowedKind.Set, "th td script template"],
  [
    "th",
    AllowedKind.Any,
    undefined,
    "header footer article aside nav section h1 h2 h3 h4 h5 h6",
  ],
  [
    "td",
    AllowedKind.Any,
    undefined,
    "header footer article aside nav section h1 h2 h3 h4 h5 h6",
  ],
  // Forms
  ["form", AllowedKind.Any, undefined, "form"],
  ["fieldset", AllowedKind.Any],
  ["legend", AllowedKind.Set, "__PHRASING_OR_HEADING__"],
  ["label", AllowedKind.Phrasing, undefined, "label"],
  [
    "button",
    AllowedKind.Phrasing,
    undefined,
    "a button details embed iframe input label select textarea",
  ],
  ["select", AllowedKind.Set, "option optgroup script template"],
  ["datalist", AllowedKind.Set, "__DATALIST__"],
  ["optgroup", AllowedKind.Set, "option script template"],
  ["option", AllowedKind.Set, ""],
  ["textarea", AllowedKind.Set, ""],
  ["output", AllowedKind.Phrasing],
  ["progress", AllowedKind.Phrasing, undefined, "progress"],
  ["meter", AllowedKind.Phrasing, undefined, "meter"],
  // Interactive
  ["details", AllowedKind.Any],
  ["summary", AllowedKind.Set, "__PHRASING_OR_HEADING__"],
  ["dialog", AllowedKind.Any],
  // Embedded
  ["picture", AllowedKind.Set, "source img script template"],
  ["video", AllowedKind.Set, undefined, "audio video"],
  ["audio", AllowedKind.Set, undefined, "audio video"],
  ["canvas", AllowedKind.Set],
  ["map", AllowedKind.Set],
  ["object", AllowedKind.Set],
  ["iframe", AllowedKind.Set, ""],
  // Text-level semantics
  ["a", AllowedKind.Phrasing, undefined, "a"],
  ["em", AllowedKind.Phrasing],
  ["strong", AllowedKind.Phrasing],
  ["small", AllowedKind.Phrasing],
  ["s", AllowedKind.Phrasing],
  ["cite", AllowedKind.Phrasing],
  ["q", AllowedKind.Phrasing],
  ["dfn", AllowedKind.Phrasing, undefined, "dfn"],
  ["abbr", AllowedKind.Phrasing],
  // ruby: phrasing + rt rp -> handle specially later
  ["ruby", AllowedKind.Set, "__RUBY__"],
  ["rt", AllowedKind.Phrasing],
  ["rp", AllowedKind.Set, ""],
  ["data", AllowedKind.Phrasing],
  ["time", AllowedKind.Phrasing],
  ["code", AllowedKind.Phrasing],
  ["var", AllowedKind.Phrasing],
  ["samp", AllowedKind.Phrasing],
  ["kbd", AllowedKind.Phrasing],
  ["sub", AllowedKind.Phrasing],
  ["sup", AllowedKind.Phrasing],
  ["i", AllowedKind.Phrasing],
  ["b", AllowedKind.Phrasing],
  ["u", AllowedKind.Phrasing],
  ["mark", AllowedKind.Phrasing],
  ["bdi", AllowedKind.Phrasing],
  ["bdo", AllowedKind.Phrasing],
  ["span", AllowedKind.Phrasing],
  // Edits
  ["ins", AllowedKind.Set],
  ["del", AllowedKind.Set],
  // Script-supporting
  ["script", AllowedKind.Set, ""],
  ["noscript", AllowedKind.Set, undefined, "noscript"],
  ["template", AllowedKind.Set],
  ["slot", AllowedKind.Set],
  // Additional elements for completeness
  ["area", AllowedKind.Set, ""],
  ["base", AllowedKind.Set, ""],
  ["br", AllowedKind.Set, ""],
  ["col", AllowedKind.Set, ""],
  ["embed", AllowedKind.Set, ""],
  ["hr", AllowedKind.Set, ""],
  ["img", AllowedKind.Set, ""],
  ["input", AllowedKind.Set, ""],
  ["link", AllowedKind.Set, ""],
  ["meta", AllowedKind.Set, ""],
  ["param", AllowedKind.Set, ""],
  ["source", AllowedKind.Set, ""],
  ["style", AllowedKind.Set, ""],
  ["title", AllowedKind.Set, ""],
  ["track", AllowedKind.Set, ""],
  ["wbr", AllowedKind.Set, ""],
  ["hgroup", AllowedKind.Set, "h1 h2 h3 h4 h5 h6 p script template"],
  // Foreign elements (approximated as any)
  ["math", AllowedKind.Set],
  ["svg", AllowedKind.Set],
];

interface NormalizedRule {
  kind: AllowedKind;
  allowedSet?: Record<string, LookupExistingFlag>; // only for kind === Set
  forbiddenSet?: Record<string, LookupExistingFlag>;
}

function strToLookup(
  str: string | undefined
): Record<string, LookupExistingFlag> | undefined {
  if (!str && str !== "") {
    return undefined;
  }

  if (str === "") {
    return Object.create(null) as Record<string, LookupExistingFlag>;
  }

  const o = Object.create(null) as Record<string, LookupExistingFlag>;

  for (const token of str.split(/\s+/)) {
    if (token) {
      o[token] = LOOKUP_EXISTING_FLAG;
    }
  }

  return o;
}

const NORMALIZED_RULES: Record<string, NormalizedRule> = (() => {
  const out = Object.create(null) as Record<string, NormalizedRule>;

  for (const [tag, kindNum, allowedList, forbiddenList] of RULE_DATA) {
    let kind = kindNum as AllowedKind;
    let allowedSet: Record<string, LookupExistingFlag> | undefined;

    if (kind === AllowedKind.Set) {
      if (allowedList === "__RUBY__") {
        // ruby: phrasing + rt rp
        const o = Object.create(null) as Record<string, LookupExistingFlag>;

        for (const v of PHRASING_ELEMENTS) {
          o[v] = LOOKUP_EXISTING_FLAG;
        }

        o.rt = LOOKUP_EXISTING_FLAG;
        o.rp = LOOKUP_EXISTING_FLAG;

        allowedSet = o;
      } else if (allowedList === "__DATALIST__") {
        // datalist: phrasing or (option + script-supporting)
        const o = Object.create(null) as Record<string, LookupExistingFlag>;

        for (const v of PHRASING_ELEMENTS) {
          o[v] = LOOKUP_EXISTING_FLAG;
        }

        o.option = LOOKUP_EXISTING_FLAG;
        o.script = LOOKUP_EXISTING_FLAG;
        o.template = LOOKUP_EXISTING_FLAG;

        allowedSet = o;
      } else if (allowedList === "__PHRASING_OR_HEADING__") {
        // For summary/legend: phrasing or heading content
        const o = Object.create(null) as Record<string, LookupExistingFlag>;

        for (const v of PHRASING_ELEMENTS) {
          o[v] = LOOKUP_EXISTING_FLAG;
        }

        o.h1 = LOOKUP_EXISTING_FLAG;
        o.h2 = LOOKUP_EXISTING_FLAG;
        o.h3 = LOOKUP_EXISTING_FLAG;
        o.h4 = LOOKUP_EXISTING_FLAG;
        o.h5 = LOOKUP_EXISTING_FLAG;
        o.h6 = LOOKUP_EXISTING_FLAG;

        allowedSet = o;
      } else {
        allowedSet = strToLookup(allowedList);
      }
    }

    const forbiddenSet = strToLookup(forbiddenList);

    out[tag] = { kind, allowedSet, forbiddenSet };
  }
  return out;
})();

// Freeze in dev to catch accidental mutation (noop in prod if minified tree-shaken)
const __DEV__ = (() => {
  if (typeof globalThis === "undefined") return false;
  const g: any = globalThis as any;
  const env = g && g.process && g.process.env && g.process.env.NODE_ENV;
  return env !== "production";
})();
if (__DEV__) Object.freeze(NORMALIZED_RULES);

interface AncestorInfo {
  currentTag: string | null;
  formTag: string | null;
  aTagInScope: string | null;
  buttonTagInScope: string | null;
  pTagInButtonScope: string | null;
  listItemTagAutoclosing: string | null;
  dlItemTagAutoclosing: string | null;
}

const isPhrasing = (tag: string): boolean =>
  PHRASING_LOOKUP[tag] === LOOKUP_EXISTING_FLAG;
const isVoid = (tag: string): boolean =>
  VOID_LOOKUP[tag] === LOOKUP_EXISTING_FLAG;

function isValidChild(
  parentTag: string,
  childTag: string,
  ancestorInfo: AncestorInfo
): boolean {
  if (isVoid(parentTag)) {
    return false;
  }

  const norm = NORMALIZED_RULES[parentTag];

  if (!norm) {
    return checkContextRestrictions(childTag, ancestorInfo);
  }

  switch (norm.kind) {
    case AllowedKind.Any:
      break;
    case AllowedKind.Phrasing:
      if (!isPhrasing(childTag)) {
        return false;
      }
      break;
    case AllowedKind.Transparent:
      break;
    case AllowedKind.Set: {
      const allowedSet = norm.allowedSet!;

      if (allowedSet[childTag] !== LOOKUP_EXISTING_FLAG) {
        return false;
      }
      break;
    }
  }

  const forbidden = norm.forbiddenSet;

  if (forbidden && forbidden[childTag] === LOOKUP_EXISTING_FLAG) {
    return false;
  }

  return checkContextRestrictions(childTag, ancestorInfo);
}

// Context-specific validation rules
// Mapping restrictions -> ancestorInfo field (compressed logic)
const CONTEXT_RESTRICTIONS: Record<string, keyof AncestorInfo> = Object.freeze({
  form: "formTag",
  a: "aTagInScope",
  button: "buttonTagInScope",
  p: "pTagInButtonScope",
  li: "listItemTagAutoclosing",
  dd: "dlItemTagAutoclosing",
  dt: "dlItemTagAutoclosing",
});

function checkContextRestrictions(
  childTag: string,
  ancestorInfo: AncestorInfo
): boolean {
  const k = CONTEXT_RESTRICTIONS[childTag];
  return k ? ancestorInfo[k] == null : true;
}

export function validateDOMNesting(
  childTag: string,
  parentTag: string | null,
  ancestorInfo: AncestorInfo
): boolean {
  if (!parentTag) return true;

  const valid = isValidChild(parentTag, childTag, ancestorInfo);
  if (!valid && typeof console !== "undefined") {
    // Keep error lazy & compact; message kept stable for external tooling (tests) if any
    console.error(
      `Invalid HTML nesting: <${childTag}> inside <${parentTag}>. See HTML specification for valid nesting rules.`
    );
  }
  return valid;
}

// Hoist scopeUpdates map to avoid re-allocation per call.
const SCOPE_UPDATES: Record<string, keyof AncestorInfo> = Object.freeze({
  form: "formTag",
  a: "aTagInScope",
  button: "buttonTagInScope",
  p: "pTagInButtonScope",
  li: "listItemTagAutoclosing",
  dd: "dlItemTagAutoclosing",
  dt: "dlItemTagAutoclosing",
});

export function updateAncestorInfo(
  info: AncestorInfo | null,
  tag: string
): AncestorInfo {
  const ancestorInfo: AncestorInfo = info || {
    currentTag: null,
    formTag: null,
    aTagInScope: null,
    buttonTagInScope: null,
    pTagInButtonScope: null,
    listItemTagAutoclosing: null,
    dlItemTagAutoclosing: null,
  };

  ancestorInfo.currentTag = tag;

  const scopeKey = SCOPE_UPDATES[tag];

  if (scopeKey) {
    (ancestorInfo[scopeKey] as string | null) = tag;
  }

  return ancestorInfo;
}

// Export constants for reuse in other modules
// Re-export (proxy) for external compatibility if consumers imported from this file originally.
export {
  PHRASING_ELEMENTS,
  SCRIPT_SUPPORTING,
  VOID_ELEMENTS,
  IMPLIED_END_TAGS,
};

// Utility function to check if element is phrasing content
export function isPhrasingContent(tagName: string): boolean {
  return PHRASING_LOOKUP[tagName] === LOOKUP_EXISTING_FLAG;
}

// Utility function to check if element is void
export function isVoidElement(tagName: string): boolean {
  return VOID_LOOKUP[tagName] === LOOKUP_EXISTING_FLAG;
}

// (Optional) Expose internal lookups for advanced callers (tree-shakeable if unused)
export const __INTERNAL_LOOKUPS__ = {
  PHRASING_LOOKUP,
  VOID_LOOKUP,
  IMPLIED_END_TAGS_LOOKUP,
  SCRIPT_SUPPORTING_LOOKUP,
};
