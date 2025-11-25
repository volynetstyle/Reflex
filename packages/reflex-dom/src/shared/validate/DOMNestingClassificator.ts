import {
  PHRASING_ELEMENTS,
  SCRIPT_SUPPORTING,
  VOID_ELEMENTS,
  IMPLIED_END_TAGS,
} from "../../client/nestingRule"

type LookupExistingFlag = 1 & { __brand: "LOOKUP_EXISTING_FLAG" };

const LOOKUP_EXISTING_FLAG = 1 as LookupExistingFlag;
const SPECIAL_RULES = {
  RUBY: "__RUBY__", // Ruby annotations
  DATALIST: "__DATALIST__", // Data list options
  PHRASING_OR_HEADING: "__PHRASING_OR_HEADING__", // Phrasing or heading content
} as const;

function makeLookup(
  tokens: Iterable<string>
): Record<string, LookupExistingFlag> {
  const o = Object.create(null) as Record<string, LookupExistingFlag>;
  for (const t of tokens) {
    o[t] = LOOKUP_EXISTING_FLAG;
  }
  return o;
}

function toLookup(
  entries: Iterable<string>
): Record<string, LookupExistingFlag> {
  return makeLookup(entries);
}

function strToLookup(
  str: string | undefined
): Record<string, LookupExistingFlag> | undefined {
  if (str == null) return undefined;
  if (str === "")
    return Object.create(null) as Record<string, LookupExistingFlag>;
  return makeLookup(str.split(/\s+/));
}

const PHRASING_LOOKUP = toLookup(PHRASING_ELEMENTS);
const SCRIPT_SUPPORTING_LOOKUP = toLookup(SCRIPT_SUPPORTING);
const IMPLIED_END_TAGS_LOOKUP = toLookup(IMPLIED_END_TAGS);
const VOID_LOOKUP = toLookup(VOID_ELEMENTS);

const enum AllowedKind {
  Any = 0,
  Phrasing = 1,
  Set = 2,
}


const RULE_DATA: Array<[string, AllowedKind, string?, string?]> = [
  ["html", AllowedKind.Set, "head body"],
  [
    "head",
    AllowedKind.Set,
    "base link meta title style script noscript template",
  ],
  ["body", AllowedKind.Any],
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
  ["h1", AllowedKind.Phrasing],
  ["h2", AllowedKind.Phrasing],
  ["h3", AllowedKind.Phrasing],
  ["h4", AllowedKind.Phrasing],
  ["h5", AllowedKind.Phrasing],
  ["h6", AllowedKind.Phrasing],
  ["p", AllowedKind.Phrasing],
  ["div", AllowedKind.Any],
  ["main", AllowedKind.Any],
  ["blockquote", AllowedKind.Any],
  ["figure", AllowedKind.Any],
  ["figcaption", AllowedKind.Any],
  ["pre", AllowedKind.Phrasing],
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
  [
    "table",
    AllowedKind.Set,
    "caption colgroup thead tbody tfoot tr script template",
  ],
  ["caption", AllowedKind.Any, undefined, "table"],
  ["colgroup", AllowedKind.Set, "col script template"],
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
  ["details", AllowedKind.Any],
  ["summary", AllowedKind.Set, "__PHRASING_OR_HEADING__"],
  ["dialog", AllowedKind.Any],
  ["picture", AllowedKind.Set, "source img script template"],
  ["video", AllowedKind.Set, "source track script template", "audio video"],
  ["audio", AllowedKind.Set, "source track script template", "audio video"],
  ["canvas", AllowedKind.Any],
  ["map", AllowedKind.Any],
  ["object", AllowedKind.Set, "param script template"],
  ["iframe", AllowedKind.Set, ""],
  ["a", AllowedKind.Phrasing, undefined, "a"],
  ["em", AllowedKind.Phrasing],
  ["strong", AllowedKind.Phrasing],
  ["small", AllowedKind.Phrasing],
  ["s", AllowedKind.Phrasing],
  ["cite", AllowedKind.Phrasing],
  ["q", AllowedKind.Phrasing],
  ["dfn", AllowedKind.Phrasing, undefined, "dfn"],
  ["abbr", AllowedKind.Phrasing],
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
  ["ins", AllowedKind.Any],
  ["del", AllowedKind.Any],
  ["script", AllowedKind.Set, ""],
  ["noscript", AllowedKind.Any, undefined, "noscript"],
  ["template", AllowedKind.Any],
  ["slot", AllowedKind.Any],
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
  ["math", AllowedKind.Any],
  ["svg", AllowedKind.Any],
];

interface NormalizedRule {
  kind: AllowedKind;
  allowedSet?: Record<string, LookupExistingFlag>;
  forbiddenSet?: Record<string, LookupExistingFlag>;
}

function normalizeRules(
  data: typeof RULE_DATA
): Record<string, NormalizedRule> {
  const out = Object.create(null) as Record<string, NormalizedRule>;

  for (const [tag, kindNum, allowedList, forbiddenList] of RULE_DATA) {
    let allowedSet: Record<string, LookupExistingFlag> | undefined;

    if (kindNum === AllowedKind.Set) {
      if (allowedList === SPECIAL_RULES.RUBY) {
        allowedSet = toLookup([...PHRASING_ELEMENTS, "rt", "rp"]);
      } else if (allowedList === SPECIAL_RULES.DATALIST) {
        allowedSet = toLookup([
          ...PHRASING_ELEMENTS,
          "option",
          "script",
          "template",
        ]);
      } else if (allowedList === SPECIAL_RULES.PHRASING_OR_HEADING) {
        allowedSet = toLookup([
          ...PHRASING_ELEMENTS,
          "h1",
          "h2",
          "h3",
          "h4",
          "h5",
          "h6",
        ]);
      } else {
        allowedSet = strToLookup(allowedList);
      }
    }
    
    out[tag] = {
      kind: kindNum,
      allowedSet,
      forbiddenSet: strToLookup(forbiddenList),
    };
  }

  return out;
}

// if (__DEV__) Object.freeze(NORMALIZED_RULES);

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

const NORMALIZED_RULES = normalizeRules(RULE_DATA);

function isValidChild(
  parentTag: string,
  childTag: string,
  ancestorInfo: AncestorInfo
): boolean {
  if (isVoid(parentTag)) {
    return false;
  }

  const norm = NORMALIZED_RULES[parentTag];

  if (!norm) return checkContextRestrictions(childTag, ancestorInfo);

  switch (norm.kind) {
    case AllowedKind.Any:
      break;
    case AllowedKind.Phrasing:
      if (!isPhrasing(childTag)) {
        return false;
      }
      break;
    case AllowedKind.Set:
      if (norm.allowedSet?.[childTag] !== LOOKUP_EXISTING_FLAG) {
        return false;
      }
      break;
  }

  if (norm.forbiddenSet?.[childTag] === LOOKUP_EXISTING_FLAG) {
    return false;
  }

  return checkContextRestrictions(childTag, ancestorInfo);
}

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
  if (!parentTag) {
    return true;
  }

  return isValidChild(parentTag, childTag, ancestorInfo);
}

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
    ancestorInfo[scopeKey] = tag;
  }

  return ancestorInfo;
}

export {
  PHRASING_ELEMENTS,
  SCRIPT_SUPPORTING,
  VOID_ELEMENTS,
  IMPLIED_END_TAGS,
};

export function isPhrasingContent(tagName: string): boolean {
  return tagName in PHRASING_LOOKUP;
}

export function isVoidElement(tagName: string): boolean {
  return tagName in VOID_LOOKUP;
}

export const __INTERNAL_LOOKUPS__ = {
  PHRASING_LOOKUP,
  VOID_LOOKUP,
  IMPLIED_END_TAGS_LOOKUP,
  SCRIPT_SUPPORTING_LOOKUP,
};
