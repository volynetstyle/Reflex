import { types as t, type NodePath } from "@babel/core";
import type { StaticAttribute, StaticElement, StaticNode } from "./model";

type Binding = NonNullable<ReturnType<NodePath["scope"]["getBinding"]>>;

export interface ClassifyConfig {
  /** Modules whose `jsx`/`jsxs`/`jsxDEV`/`Fragment` exports are the Reflex JSX factory. */
  readonly factorySources: ReadonlySet<string>;
  /** Modules whose `render`/`mount` exports mount a renderable. */
  readonly renderSources: ReadonlySet<string>;
  /** Treat functions with a PascalCase name as components (their return value is mounted). */
  readonly assumePascalCaseComponents: boolean;
}

export type ElementResult =
  | { readonly ok: true; readonly element: StaticElement }
  | { readonly ok: false; readonly reason: string };

export type CallType =
  | { readonly kind: "host"; readonly tag: string }
  | { readonly kind: "fragment" }
  | { readonly kind: "component"; readonly name: string };

// ---------------------------------------------------------------------------
// Binding resolution: the callee must be the real factory import, not a name.

const FACTORY_EXPORTS = new Set(["jsx", "jsxs", "jsxDEV"]);
const RENDER_EXPORTS = new Set(["render", "mount"]);

function importedName(
  binding: Binding | undefined,
  sources: ReadonlySet<string>,
): string | null {
  if (binding === undefined || binding.kind !== "module") return null;
  const specifier = binding.path;
  if (!specifier.isImportSpecifier()) return null;
  const declaration = specifier.parentPath;
  if (
    !declaration.isImportDeclaration() ||
    declaration.node.importKind === "type" ||
    specifier.node.importKind === "type" ||
    !sources.has(declaration.node.source.value)
  ) {
    return null;
  }
  const imported = specifier.node.imported;
  return t.isIdentifier(imported) ? imported.name : imported.value;
}

function resolvesTo(
  path: NodePath,
  sources: ReadonlySet<string>,
  names: ReadonlySet<string>,
): boolean {
  if (!path.isIdentifier()) return false;
  const name = importedName(path.scope.getBinding(path.node.name), sources);
  return name !== null && names.has(name);
}

export function isFactoryCall(
  path: NodePath,
  config: ClassifyConfig,
): path is NodePath<t.CallExpression> {
  return (
    path.isCallExpression() &&
    resolvesTo(path.get("callee") as NodePath, config.factorySources, FACTORY_EXPORTS)
  );
}

export function callType(
  call: NodePath<t.CallExpression>,
  config: ClassifyConfig,
): CallType {
  const type = unwrap(call.get("arguments")[0] as NodePath | undefined);
  if (type?.isStringLiteral()) return { kind: "host", tag: type.node.value };
  if (type && resolvesTo(type, config.factorySources, new Set(["Fragment"]))) {
    return { kind: "fragment" };
  }
  return {
    kind: "component",
    name: type?.isIdentifier() ? type.node.name : "<expression>",
  };
}

// ---------------------------------------------------------------------------
// Literals: the only values a static region may contain.

type Literal =
  | { readonly kind: "string"; readonly value: string }
  | { readonly kind: "number"; readonly value: number }
  | { readonly kind: "bigint"; readonly value: string }
  | { readonly kind: "boolean"; readonly value: boolean }
  | { readonly kind: "null" }
  | { readonly kind: "undefined" };

function unwrap(path: NodePath | undefined): NodePath | undefined {
  let current = path;
  while (
    current !== undefined &&
    (current.isParenthesizedExpression() ||
      current.isTSAsExpression() ||
      current.isTSSatisfiesExpression() ||
      current.isTSNonNullExpression() ||
      current.isTSTypeAssertion())
  ) {
    current = current.get("expression") as NodePath;
  }
  return current;
}

function isGlobalUndefined(path: NodePath): boolean {
  return (
    path.isIdentifier({ name: "undefined" }) &&
    path.scope.getBinding("undefined") === undefined
  );
}

function evaluateLiteral(input: NodePath | undefined): Literal | null {
  const path = unwrap(input);
  if (path === undefined) return null;
  const node = path.node;

  if (t.isStringLiteral(node)) return { kind: "string", value: node.value };
  if (t.isNumericLiteral(node)) return { kind: "number", value: node.value };
  if (t.isBigIntLiteral(node)) {
    return { kind: "bigint", value: BigInt(node.value).toString() };
  }
  if (t.isBooleanLiteral(node)) return { kind: "boolean", value: node.value };
  if (t.isNullLiteral(node)) return { kind: "null" };
  if (isGlobalUndefined(path)) return { kind: "undefined" };
  if (
    t.isTemplateLiteral(node) &&
    node.expressions.length === 0 &&
    typeof node.quasis[0]!.value.cooked === "string"
  ) {
    return { kind: "string", value: node.quasis[0]!.value.cooked };
  }
  if (t.isUnaryExpression(node)) {
    if (node.operator === "-" && t.isNumericLiteral(node.argument)) {
      return { kind: "number", value: -node.argument.value };
    }
    if (
      node.operator === "void" &&
      evaluateLiteral(path.get("argument") as NodePath) !== null
    ) {
      return { kind: "undefined" };
    }
  }
  return null;
}

/** `String(value)` exactly as the runtime computes it. */
function textOf(literal: Literal): string | null {
  switch (literal.kind) {
    case "string":
      return literal.value;
    case "number":
      return String(literal.value);
    case "bigint":
      return literal.value;
    default:
      return null;
  }
}

/** Arguments `jsxDEV` adds after the key: source locations and `this`. */
function isInert(path: NodePath): boolean {
  if (evaluateLiteral(path) !== null || path.isThisExpression()) return true;
  if (path.isObjectExpression()) {
    return path
      .get("properties")
      .every(
        (property) =>
          property.isObjectProperty() &&
          !property.node.computed &&
          isInert(property.get("value") as NodePath),
      );
  }
  if (path.isArrayExpression()) {
    return path
      .get("elements")
      .every((element) => element.node !== null && isInert(element as NodePath));
  }
  return false;
}

// ---------------------------------------------------------------------------
// Elements. The supported set excludes every element whose DOM construction
// differs from `createElement` + attributes + children in reflex-dom: form
// controls (managed properties), parser-special elements, tables, foreign
// namespaces and custom elements.

const COMPILABLE_TAGS = new Set([
  "a", "abbr", "address", "article", "aside", "b", "bdi", "bdo", "blockquote",
  "br", "button", "cite", "code", "dd", "del", "details", "dfn", "div", "dl",
  "dt", "em", "fieldset", "figcaption", "figure", "footer", "h1", "h2", "h3",
  "h4", "h5", "h6", "header", "hgroup", "hr", "i", "img", "ins", "kbd", "label",
  "legend", "li", "main", "mark", "menu", "nav", "ol", "p", "q", "rp", "rt",
  "ruby", "s", "samp", "search", "section", "small", "span", "strong", "sub",
  "summary", "sup", "time", "u", "ul", "var", "wbr",
]);

const TABLE_TAGS = new Set([
  "table", "caption", "colgroup", "col", "thead", "tbody", "tfoot", "tr", "td", "th",
]);
const FORM_TAGS = new Set([
  "input", "select", "textarea", "option", "optgroup", "datalist", "form",
  "output", "progress", "meter",
]);

export function rejectTag(tag: string): string | null {
  if (COMPILABLE_TAGS.has(tag)) return null;
  if (tag.includes("-")) return `custom element <${tag}>`;
  if (tag === "svg" || tag === "math") return `foreign namespace <${tag}>`;
  if (TABLE_TAGS.has(tag)) return `table parsing context <${tag}>`;
  if (FORM_TAGS.has(tag)) return `form control semantics <${tag}>`;
  return `unsupported element <${tag}>`;
}

// ---------------------------------------------------------------------------
// Props. A prop compiles only when its static value has one DOM effect in every
// engine: the attribute it ends up as. reflex-dom assigns many names through
// DOM properties (`name in element`), so a name is listed only where property
// and attribute paths store the same string, independently of the tag.

const ATTRIBUTE_ALIASES: Readonly<Record<string, string>> = {
  className: "class",
  htmlFor: "for",
  crossOrigin: "crossorigin",
};

/** Reflected `DOMString` attributes, plus attribute-only names. */
const STRING_ATTRIBUTES = new Set([
  "id", "title", "lang", "dir", "role", "slot", "alt", "target", "rel", "type",
  "name", "download", "datetime", "for", "loading", "decoding", "crossorigin",
]);
/** Reflected booleans: only `true` (present) and absence agree across paths. */
const BOOLEAN_ATTRIBUTES = new Set(["disabled", "hidden", "inert"]);
/** Sanitized by reflex-dom at runtime; compiled only when unchanged by it. */
const URL_ATTRIBUTES = new Set(["href", "src"]);

const DATA_OR_ARIA = /^(data|aria)-[a-z0-9._-]+$/;

type AttributeResult =
  | { readonly kind: "omit" }
  | { readonly kind: "set"; readonly attribute: StaticAttribute }
  | { readonly kind: "reject"; readonly reason: string };

const OMIT: AttributeResult = { kind: "omit" };

function set(name: string, value: string): AttributeResult {
  return { kind: "set", attribute: { name, value } };
}

function reject(reason: string): AttributeResult {
  return { kind: "reject", reason };
}

function isAbsent(literal: Literal): boolean {
  return (
    literal.kind === "null" ||
    literal.kind === "undefined" ||
    (literal.kind === "boolean" && !literal.value)
  );
}

function staticAttribute(prop: string, literal: Literal | null): AttributeResult {
  // reflex-dom skips undefined props before looking at their names.
  if (literal?.kind === "undefined") return OMIT;
  if (prop === "key") return literal === null ? reject(`dynamic prop "key"`) : OMIT;
  if (prop === "ref") return reject("ref");
  if (prop.startsWith("on")) return reject(`event prop "${prop}"`);
  if (prop === "style") return reject("style is normalized through CSSOM");
  if (literal === null) return reject(`dynamic prop "${prop}"`);

  const name = ATTRIBUTE_ALIASES[prop] ?? prop;
  const text = textOf(literal);

  if (name === "class") {
    if (text !== null) return set(name, text);
    if (literal.kind === "boolean" && literal.value) return set(name, "true");
    return OMIT;
  }

  if (DATA_OR_ARIA.test(name)) {
    if (text !== null) return set(name, text);
    if (literal.kind === "boolean") {
      if (name.startsWith("aria-")) return set(name, literal.value ? "true" : "false");
      return literal.value ? set(name, "") : OMIT;
    }
    return OMIT;
  }

  if (BOOLEAN_ATTRIBUTES.has(name)) {
    if (literal.kind === "boolean" && literal.value) return set(name, "");
    if (isAbsent(literal)) return OMIT;
    return reject(`non-boolean value for "${name}"`);
  }

  if (URL_ATTRIBUTES.has(name)) {
    if (isAbsent(literal)) return OMIT;
    if (literal.kind !== "string") return reject(`non-string URL "${name}"`);
    if (sanitizeURL(literal.value) !== literal.value) {
      return reject(`URL "${name}" is sanitized at runtime`);
    }
    return set(name, literal.value);
  }

  if (STRING_ATTRIBUTES.has(name)) {
    if (text !== null) return set(name, text);
    if (isAbsent(literal)) return OMIT;
    return reject(`boolean value for "${name}"`);
  }

  return reject(`prop "${prop}" has no verified static semantics`);
}

function propName(property: NodePath<t.ObjectProperty>): string | null {
  const key = property.node.key;
  if (property.node.computed) return null;
  if (t.isIdentifier(key)) return key.name;
  if (t.isStringLiteral(key)) return key.value;
  return null;
}

/** Static props by name, in source order; a reason string when not static. */
function readProps(
  call: NodePath<t.CallExpression>,
): Map<string, NodePath> | string {
  const props = new Map<string, NodePath>();
  const arg = unwrap(call.get("arguments")[1] as NodePath | undefined);
  if (arg === undefined || arg.isNullLiteral()) return props;
  if (!arg.isObjectExpression()) return "props are not an object literal";

  for (const property of arg.get("properties")) {
    if (property.isSpreadElement()) return "spread props";
    if (!property.isObjectProperty()) return "accessor or method in props";
    const name = propName(property);
    if (name === null || name === "__proto__") return "computed prop name";
    if (props.has(name)) return `duplicate prop "${name}"`;
    props.set(name, property.get("value") as NodePath);
  }
  return props;
}

function checkCallShape(call: NodePath<t.CallExpression>): string | null {
  const args = call.get("arguments") as NodePath[];
  const key = args[2];
  if (key !== undefined && evaluateLiteral(key)?.kind !== "undefined") {
    return "keyed element";
  }
  for (let index = 3; index < args.length; index++) {
    if (!isInert(args[index]!)) return "factory call has side-effecting arguments";
  }
  return null;
}

export function classifyElement(
  call: NodePath<t.CallExpression>,
  config: ClassifyConfig,
): ElementResult {
  const type = callType(call, config);
  if (type.kind !== "host") {
    return { ok: false, reason: `component boundary <${type.kind === "component" ? type.name : "Fragment"}>` };
  }

  const tagReason = rejectTag(type.tag);
  if (tagReason !== null) return { ok: false, reason: tagReason };

  const shapeReason = checkCallShape(call);
  if (shapeReason !== null) return { ok: false, reason: shapeReason };

  const props = readProps(call);
  if (typeof props === "string") return { ok: false, reason: props };

  const attributes: StaticAttribute[] = [];
  for (const [prop, valuePath] of props) {
    if (prop === "children") continue;
    const result = staticAttribute(prop, evaluateLiteral(valuePath));
    if (result.kind === "reject") return { ok: false, reason: result.reason };
    if (result.kind === "omit") continue;
    if (attributes.some((existing) => existing.name === result.attribute.name)) {
      return { ok: false, reason: `conflicting aliases for "${result.attribute.name}"` };
    }
    attributes.push(result.attribute);
  }

  const children: StaticNode[] = [];
  const childrenPath = props.get("children");
  if (childrenPath !== undefined) {
    const reason = collectChildren(childrenPath, true, children, config);
    if (reason !== null) return { ok: false, reason };
  }

  return {
    ok: true,
    element: { type: "element", tag: type.tag, attributes, children },
  };
}

/**
 * Appends the nodes reflex-dom creates for a children value. `scalar` marks
 * the element's own `children` value: a scalar text there is assigned through
 * `textContent`, so an empty string creates no node, while an empty string in
 * an array becomes an empty Text node.
 */
function collectChildren(
  input: NodePath,
  scalar: boolean,
  out: StaticNode[],
  config: ClassifyConfig,
): string | null {
  const path = unwrap(input)!;
  const literal = evaluateLiteral(path);

  if (literal !== null) {
    const text = textOf(literal);
    if (text !== null && !(scalar && text === "")) {
      out.push({ type: "text", value: text });
    }
    return null;
  }

  if (path.isArrayExpression()) {
    for (const element of path.get("elements")) {
      if (element.node === null) return "sparse children array";
      if (element.isSpreadElement()) return "spread children";
      const reason = collectChildren(element as NodePath, false, out, config);
      if (reason !== null) return reason;
    }
    return null;
  }

  if (isFactoryCall(path, config)) {
    const type = callType(path, config);
    if (type.kind === "fragment") {
      // `jsx(Fragment, props)` evaluates to `props.children ?? null`.
      const shapeReason = checkCallShape(path);
      if (shapeReason !== null) return shapeReason;
      const props = readProps(path);
      if (typeof props === "string") return props;
      for (const [name, value] of props) {
        if (name !== "children" && !isInert(value)) return "dynamic Fragment prop";
      }
      const children = props.get("children");
      return children === undefined
        ? null
        : collectChildren(children, scalar, out, config);
    }

    const result = classifyElement(path, config);
    if (!result.ok) return result.reason;
    out.push(result.element);
    return null;
  }

  return "dynamic child expression";
}

// ---------------------------------------------------------------------------
// Escape analysis. A compiled region replaces the element descriptor with an
// opaque one, so it is only legal where nothing can read `.kind`, `.tag` or
// `.props` of the original: positions whose value flows straight into the
// renderer.

export type Consumption =
  | { readonly consumed: true }
  | { readonly consumed: false; readonly reason: string };

const CONSUMED: Consumption = { consumed: true };
const FOREIGN_ROOTS = new Set(["svg", "math"]);

function escapes(reason: string): Consumption {
  return { consumed: false, reason: `descriptor escapes: ${reason}` };
}

function functionName(fn: NodePath<t.Function>): string | null {
  const node = fn.node;
  if ((t.isFunctionDeclaration(node) || t.isFunctionExpression(node)) && node.id) {
    return node.id.name;
  }
  const parent = fn.parentPath;
  if (parent?.isVariableDeclarator() && t.isIdentifier(parent.node.id)) {
    return parent.node.id.name;
  }
  return null;
}

function functionBinding(fn: NodePath<t.Function>): Binding | undefined {
  const name = functionName(fn);
  if (name === null) return undefined;
  return fn.isFunctionDeclaration() || fn.parentPath?.isVariableDeclarator()
    ? fn.parentPath!.scope.getBinding(name)
    : fn.scope.getBinding(name);
}

function isComponentFunction(fn: NodePath<t.Function>, config: ClassifyConfig): boolean {
  if (fn.isObjectMethod() || fn.isClassMethod() || fn.isClassPrivateMethod()) return false;
  const name = functionName(fn);
  if (config.assumePascalCaseComponents && name !== null && /^[A-Z]/.test(name)) {
    return true;
  }
  const binding = functionBinding(fn);
  return (
    binding !== undefined &&
    binding.referencePaths.some((reference) => {
      const call = reference.parentPath;
      return (
        call !== null &&
        reference.key === 0 &&
        reference.listKey === "arguments" &&
        isFactoryCall(call, config)
      );
    })
  );
}

export function consumption(
  call: NodePath<t.CallExpression>,
  config: ClassifyConfig,
): Consumption {
  let path: NodePath = call;

  for (;;) {
    const parent = path.parentPath;
    if (parent === null) return escapes("module scope");

    if (
      parent.isParenthesizedExpression() ||
      parent.isTSAsExpression() ||
      parent.isTSSatisfiesExpression() ||
      parent.isTSNonNullExpression() ||
      (parent.isConditionalExpression() && path.key !== "test") ||
      parent.isLogicalExpression() ||
      (parent.isSequenceExpression() &&
        path.key === parent.node.expressions.length - 1) ||
      parent.isArrayExpression()
    ) {
      path = parent;
      continue;
    }

    if (parent.isReturnStatement()) {
      const fn = parent.getFunctionParent();
      if (fn === null) return escapes("return outside a function");
      return isComponentFunction(fn, config) ? CONSUMED : escapes("returned from a non-component function");
    }

    if (parent.isArrowFunctionExpression() && path.key === "body") {
      return isComponentFunction(parent, config) ? CONSUMED : escapes("returned from a non-component function");
    }

    if (parent.isObjectProperty() && path.key === "value") {
      const props = parent.parentPath;
      const owner = props.parentPath;
      if (
        propName(parent as NodePath<t.ObjectProperty>) === "children" &&
        props.isObjectExpression() &&
        owner !== null &&
        props.key === 1 &&
        isFactoryCall(owner, config)
      ) {
        const type = callType(owner, config);
        if (type.kind === "component") {
          return escapes(`children of component <${type.name}>`);
        }
        if (type.kind === "host" && FOREIGN_ROOTS.has(type.tag)) {
          // Namespace integration points (foreignObject, annotation-xml) are
          // left to the runtime; mount also re-checks the namespace.
          return { consumed: false, reason: `inside <${type.tag}> namespace content` };
        }
        // A host element or Fragment hands its children to the renderer, so
        // they are consumed exactly when that call is.
        path = owner;
        continue;
      }
      return escapes("stored in an object");
    }

    if (
      parent.isCallExpression() &&
      path.key === 0 &&
      path.listKey === "arguments" &&
      resolvesTo(parent.get("callee") as NodePath, config.renderSources, RENDER_EXPORTS)
    ) {
      return CONSUMED;
    }

    if (parent.isVariableDeclarator()) return escapes("stored in a variable");
    if (parent.isCallExpression() || parent.isNewExpression()) return escapes("passed as an argument");
    return escapes(`used in ${parent.type}`);
  }
}

// ---------------------------------------------------------------------------
// Port of reflex-dom's `sanitizeURL`: a compiled URL must be one the runtime
// would leave unchanged.

const BLOCKED_PROTOCOLS = ["javascript:", "vbscript:"];

function sanitizeURL(url: string): string {
  let start = 0;
  while (start < url.length && url.charCodeAt(start) <= 0x20) start++;

  for (const protocol of BLOCKED_PROTOCOLS) {
    let index = start;
    let matched = 0;
    while (matched < protocol.length && index < url.length) {
      const code = url.charCodeAt(index);
      if (code === 0x09 || code === 0x0a || code === 0x0d) {
        index++;
        continue;
      }
      const lower = code >= 0x41 && code <= 0x5a ? code + 0x20 : code;
      if (lower !== protocol.charCodeAt(matched)) break;
      index++;
      matched++;
    }
    if (matched === protocol.length) return "about:blank";
  }
  return url;
}
