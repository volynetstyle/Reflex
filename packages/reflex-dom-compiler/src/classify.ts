import { types as t, type NodePath } from "@babel/core";
import type { StaticAttribute, StaticElement, StaticNode } from "./model";
import { rejectTag, staticAttribute, textOf, type Literal } from "./semantics";

type Binding = NonNullable<ReturnType<NodePath["scope"]["getBinding"]>>;

export interface ClassifyConfig {
  /** Modules whose `jsx`/`jsxs`/`jsxDEV`/`Fragment` exports are the Reflex JSX factory. */
  readonly factorySources: ReadonlySet<string>;
  /** Modules whose `render`/`mount`/`hydrate`/`renderToString` render their first argument. */
  readonly renderSources: ReadonlySet<string>;
  /** Modules whose For/Show/Switch/Portal exports consume rendered branches. */
  readonly operatorSources: ReadonlySet<string>;
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
const RENDER_EXPORTS = new Set(["render", "mount", "hydrate", "renderToString"]);
const APP_FACTORIES = new Set(["createApp", "setupDOM"]);
const APP_RENDER_METHODS = new Set(["render", "mount", "hydrate"]);
const CHILD_OPERATORS = new Set(["For", "Show", "Portal"]);
const FALLBACK_OPERATORS = new Set(["For", "Show", "Switch"]);
const SWITCH_EXPORTS = new Set(["Switch"]);

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
  if (path.isIdentifier()) {
    const name = importedName(path.scope.getBinding(path.node.name), sources);
    return name !== null && names.has(name);
  }
  if (!path.isMemberExpression()) return false;
  const object = path.get("object"), property = path.get("property");
  const name = !path.node.computed && property.isIdentifier() ? property.node.name
    : property.isStringLiteral() ? property.node.value : null;
  if (name === null || !names.has(name) || !object.isIdentifier()) return false;
  const binding = object.scope.getBinding(object.node.name);
  if (binding?.kind !== "module" || !binding.path.isImportNamespaceSpecifier()) return false;
  const declaration = binding.path.parentPath;
  return declaration.isImportDeclaration() && declaration.node.importKind !== "type" && sources.has(declaration.node.source.value);
}

function appMethod(callee: NodePath<t.MemberExpression>): string | null {
  const property = callee.get("property");
  return !callee.node.computed && property.isIdentifier()
    ? property.node.name
    : property.isStringLiteral() ? property.node.value : null;
}

/** Frozen app results remain known through const aliases, including exports. */
function isFrozenApp(value: NodePath, config: ClassifyConfig, seen = new Set<t.Node>()): boolean {
  if (value.isCallExpression()) return resolvesTo(value.get("callee") as NodePath, config.renderSources, APP_FACTORIES);
  if (!value.isIdentifier()) return false;
  const binding = value.scope.getBinding(value.node.name);
  if (!binding?.constant || binding.kind !== "const" || !binding.path.isVariableDeclarator() ||
    !binding.path.get("id").isIdentifier() || seen.has(binding.path.node)) return false;
  // Keep explicit writes conservative, even though a genuine app is frozen.
  if (binding.referencePaths.some(ref => {
    const member = ref.parentPath;
    if (!member?.isMemberExpression() || member.node.object !== ref.node) return false;
    const use = member.parentPath;
    return (use?.isAssignmentExpression() && use.node.left === member.node) ||
      use?.isUpdateExpression() || (use?.isUnaryExpression() && use.node.operator === "delete");
  })) return false;
  seen.add(binding.path.node);
  const init = binding.path.get("init");
  return init.node !== null && isFrozenApp(init as NodePath, config, seen);
}

function isRenderCallee(callee: NodePath, config: ClassifyConfig, seen = new Set<t.Node>()): boolean {
  if (resolvesTo(callee, config.renderSources, RENDER_EXPORTS)) return true;
  if (callee.isMemberExpression()) {
    const method = appMethod(callee);
    return method !== null && APP_RENDER_METHODS.has(method) && isFrozenApp(callee.get("object"), config);
  }
  if (!callee.isIdentifier()) return false;
  const binding = callee.scope.getBinding(callee.node.name);
  if (!binding?.constant || binding.kind !== "const" || !binding.path.isVariableDeclarator() || seen.has(binding.path.node)) return false;
  seen.add(binding.path.node);
  const init = binding.path.get("init");
  if (init.node === null) return false;
  const pattern = binding.path.get("id");
  if (pattern.isObjectPattern()) {
    return isFrozenApp(init as NodePath, config) && pattern.get("properties").some(property => {
      if (!property.isObjectProperty() || !t.isIdentifier(property.node.value, { name: callee.node.name })) return false;
      const key = property.node.key;
      const name = !property.node.computed && t.isIdentifier(key) ? key.name : t.isStringLiteral(key) ? key.value : null;
      return name !== null && APP_RENDER_METHODS.has(name);
    });
  }
  return pattern.isIdentifier() && isRenderCallee(init as NodePath, config, seen);
}

function isRenderCall(call: NodePath<t.CallExpression>, config: ClassifyConfig): boolean {
  return isRenderCallee(call.get("callee") as NodePath, config);
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
// Literal evaluation over the AST; their DOM meaning lives in semantics.ts.

export function unwrap(path: NodePath | undefined): NodePath | undefined {
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

export function evaluateLiteral(input: NodePath | undefined): Literal | null {
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


function propName(property: NodePath<t.ObjectProperty>): string | null {
  const key = property.node.key;
  if (property.node.computed) return null;
  if (t.isIdentifier(key)) return key.name;
  if (t.isStringLiteral(key)) return key.value;
  return null;
}

/** Static props by name, in source order; a reason string when not static. */
export function readProps(
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

export function checkCallShape(call: NodePath<t.CallExpression>): string | null {
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

/**
 * Classifies a host element call. With `holes`, dynamic child expressions
 * become holes appended to it in evaluation order (document order); without,
 * they make the element non-static.
 */
export function classifyElement(
  call: NodePath<t.CallExpression>,
  config: ClassifyConfig,
  holes?: NodePath<t.Expression>[],
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
  // Every attribute the runtime writes or removes, so one alias cannot
  // silently undo another (`className: "a", class: false`).
  const written = new Set<string>();
  for (const [prop, valuePath] of props) {
    if (prop === "children") continue;
    const result = staticAttribute(prop, evaluateLiteral(valuePath));
    if (result.kind === "reject") return { ok: false, reason: result.reason };
    if (result.kind === "skip") continue;
    const name = result.kind === "set" ? result.attribute.name : result.name;
    if (written.has(name)) return { ok: false, reason: `conflicting aliases for "${name}"` };
    written.add(name);
    if (result.kind === "set") attributes.push(result.attribute);
  }

  const children: StaticNode[] = [];
  const childrenPath = props.get("children");
  if (childrenPath !== undefined) {
    const reason = collectChildren(childrenPath, true, children, config, holes);
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
  holes: NodePath<t.Expression>[] | undefined,
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
      const reason = collectChildren(element as NodePath, false, out, config, holes);
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
        : collectChildren(children, scalar, out, config, holes);
    }

    const result = classifyElement(path, config, holes);
    if (!result.ok) return result.reason;
    out.push(result.element);
    return null;
  }

  if (holes === undefined || !path.isExpression()) return "dynamic child expression";
  // Evaluated where it stands when the region is created; the renderer
  // mounts its value (`input`, before unwrapping, is what gets replaced).
  out.push({ type: "hole", index: holes.length, scalar });
  holes.push(input as NodePath<t.Expression>);
  return null;
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

/** The binding a function is declared as: `function F` or `const F = ...`. */
function functionBinding(fn: NodePath<t.Function>): Binding | undefined {
  const parent = fn.parentPath;
  if (parent?.isVariableDeclarator() && t.isIdentifier(parent.node.id)) {
    return parent.scope.getBinding(parent.node.id.name);
  }
  if (fn.isFunctionDeclaration() && fn.node.id) {
    return parent!.scope.getBinding(fn.node.id.name);
  }
  return undefined;
}

function isExportedDeclaration(binding: Binding): boolean {
  const declaration = binding.path.isVariableDeclarator()
    ? binding.path.parentPath
    : binding.path;
  const owner = declaration?.parentPath;
  return owner?.isExportNamedDeclaration() === true || owner?.isExportDefaultDeclaration() === true;
}

/** A trusted operator with plain literal props, without inspecting getters. */
function isRenderOperatorCall(path: NodePath | null, config: ClassifyConfig, names = CHILD_OPERATORS): path is NodePath<t.CallExpression> {
  return (
    path !== null &&
    isFactoryCall(path, config) &&
    typeof readProps(path) !== "string" &&
    resolvesTo(path.get("arguments")[0] as NodePath, config.operatorSources, names)
  );
}

/** The factory call whose props object holds `property` as prop `name`. */
function propOwner(property: NodePath, name: string, config: ClassifyConfig): NodePath<t.CallExpression> | null {
  if (!property.isObjectProperty() || propName(property) !== name) return null;
  const props = property.parentPath;
  const owner = props.parentPath;
  return props.isObjectExpression() && props.key === 1 && owner !== null && isFactoryCall(owner, config)
    ? owner
    : null;
}

/** Props whose values (or callback results) are consumed by an operator. */
function renderedPropOwner(property: NodePath, config: ClassifyConfig): NodePath<t.CallExpression> | null {
  const children = propOwner(property, "children", config);
  if (isRenderOperatorCall(children, config)) return children;
  const fallback = propOwner(property, "fallback", config);
  if (isRenderOperatorCall(fallback, config, FALLBACK_OPERATORS)) return fallback;
  if (!property.isObjectProperty() || propName(property) !== "children") return null;
  const caseObject = property.parentPath;
  const cases = caseObject.parentPath;
  if (!caseObject.isObjectExpression() || !cases?.isArrayExpression()) return null;
  // A case getter could call/inspect this.children before it is rendered.
  if (!caseObject.get("properties").every(prop => prop.isObjectProperty() &&
    propName(prop) !== null && propName(prop) !== "__proto__")) return null;
  const owner = cases.parentPath === null ? null : propOwner(cases.parentPath, "cases", config);
  return isRenderOperatorCall(owner, config, SWITCH_EXPORTS) ? owner : null;
}

/**
 * Whether the value `fn` returns reaches the renderer and nothing else. Names
 * prove nothing; callers do. Known callers are:
 *
 * - trusted operators mount their rendered branches and callback results;
 * - the renderer invokes accessors used exclusively as rendered content;
 * - the renderer calls a component, so a function whose every reference is
 *   the type argument of a consumed `jsx(F, ...)` call has only the renderer
 *   as caller. An exported or reassigned binding has unknown callers.
 */
function functionConsumption(
  fn: NodePath<t.Function>,
  config: ClassifyConfig,
  visiting: Set<t.Node>,
): Consumption {
  // A named expression can call itself without appearing in the outer
  // binding's references, and inspect the returned descriptor before mount.
  if (fn.isFunctionExpression() && fn.node.id != null &&
    (fn.scope.getBinding(fn.node.id.name)?.referencePaths.length ?? 0) > 0) {
    return escapes("named function has unproven self references");
  }
  const operator = renderedPropOwner(fn.parentPath!, config);
  if (operator !== null) {
    return consumption(operator, config, visiting);
  }

  const binding = functionBinding(fn);
  if (binding === undefined) {
    if (visiting.has(fn.node)) return escapes("recursive accessor");
    visiting.add(fn.node);
    try {
      const parent = fn.parentPath;
      // An inline component type or an accessor used only as rendered content.
      const use = parent !== null && fn.key === 0 && fn.listKey === "arguments" && isFactoryCall(parent, config)
        ? consumption(parent, config, visiting) : consumption(fn, config, visiting);
      return use.consumed ? CONSUMED : escapes("returned from a function with unknown callers");
    } finally { visiting.delete(fn.node); }
  }
  const name = binding.identifier.name;
  if (!binding.constant) return escapes(`"${name}" is reassigned`);
  if (isExportedDeclaration(binding)) return escapes(`"${name}" is exported, so its callers are unknown`);
  if (binding.referencePaths.length === 0) return escapes(`"${name}" is never rendered`);
  if (visiting.has(fn.node)) return escapes(`"${name}" renders itself`);

  visiting.add(fn.node);
  try {
    for (const reference of binding.referencePaths) {
      const call = reference.parentPath;
      const componentPosition = call !== null && reference.key === 0 && reference.listKey === "arguments" && isFactoryCall(call, config);
      const use = consumption(componentPosition ? call : reference, config, visiting);
      if (!componentPosition && !use.consumed) return escapes(`"${name}" is used outside a JSX component position`);
      if (!use.consumed) return escapes(`a <${name}> element escapes (${use.reason})`);
    }
  } finally {
    visiting.delete(fn.node);
  }
  return CONSUMED;
}

export function consumption(
  call: NodePath,
  config: ClassifyConfig,
  visiting: Set<t.Node> = new Set(),
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
      return functionConsumption(fn, config, visiting);
    }

    if (parent.isArrowFunctionExpression() && path.key === "body") {
      return functionConsumption(parent, config, visiting);
    }

    if (parent.isObjectProperty() && path.key === "value") {
      const operator = renderedPropOwner(parent, config);
      if (operator !== null) {
        path = operator;
        continue;
      }
      const props = parent.parentPath;
      const owner = props.parentPath;
      if (
        propName(parent as NodePath<t.ObjectProperty>) === "children" &&
        props.isObjectExpression() &&
        owner !== null &&
        props.key === 1 &&
        isFactoryCall(owner, config)
      ) {
        // Getters/methods/prototype tricks can inspect `this.children` before
        // mounting. Only ordinary literal props prove a renderer-only child.
        if (typeof readProps(owner) === "string") return escapes("children of opaque props");
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
      isRenderCall(parent, config)
    ) {
      return CONSUMED;
    }

    if (parent.isVariableDeclarator()) {
      const id = parent.get("id");
      const binding = id.isIdentifier() ? parent.scope.getBinding(id.node.name) : undefined;
      if (path.key !== "init" || binding?.kind !== "const" || !binding.constant ||
        isExportedDeclaration(binding) || binding.referencePaths.length === 0 || visiting.has(parent.node)) {
        return escapes("stored in a variable with unproven consumers");
      }
      visiting.add(parent.node);
      try {
        for (const reference of binding.referencePaths) {
          const use = consumption(reference, config, visiting);
          if (!use.consumed) return escapes(`stored in a variable (${use.reason})`);
        }
        return CONSUMED;
      } finally { visiting.delete(parent.node); }
    }
    if (parent.isCallExpression() || parent.isNewExpression()) return escapes("passed as an argument");
    return escapes(`used in ${parent.type}`);
  }
}
