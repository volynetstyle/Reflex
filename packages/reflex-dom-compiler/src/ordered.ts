import { types as t, type NodePath } from "@babel/core";
import {
  callType,
  checkCallShape,
  evaluateLiteral,
  isFactoryCall,
  readProps,
  unwrap,
  type ClassifyConfig,
  type ElementResult,
} from "./classify";
import type { StaticAttribute, StaticElement, StaticNode } from "./model";
import { rejectTag, staticAttribute, textOf } from "./semantics";

// mountElement handles these outside the ordinary props/children phases.
export const PLATFORM_PROPS = new Set([
  "shadowRoot",
  "shadowChildren",
  "shadowRootRef",
  "shadowAdoptedStyleSheets",
  "elementInternals",
]);

/** Native-only plan: preserve binding and child mount order, including user code. */
export function classifyOrderedElement(
  call: NodePath<t.CallExpression>,
  config: ClassifyConfig,
  values: NodePath<t.Expression>[],
): ElementResult {
  const type = callType(call, config);
  if (type.kind !== "host") return { ok: false, reason: "component boundary" };
  const reason = rejectTag(type.tag) ?? checkCallShape(call);
  if (reason !== null) return { ok: false, reason };
  const props = readProps(call);
  if (typeof props === "string") return { ok: false, reason: props };
  if ([...props.keys()].some((name) => PLATFORM_PROPS.has(name))) {
    return { ok: false, reason: "platform-managed props" };
  }

  const attributes: StaticAttribute[] = [];
  const names = new Set<string>();
  let bind = false;
  for (const [name, value] of props) {
    if (name === "children") continue;
    const attr = staticAttribute(name, evaluateLiteral(value));
    if (attr.kind === "reject") {
      bind = true;
      continue;
    }
    if (attr.kind === "skip") continue;
    const key = attr.kind === "set" ? attr.attribute.name : attr.name;
    if (names.has(key)) bind = true;
    names.add(key);
    if (attr.kind === "set") attributes.push(attr.attribute);
  }

  const capture = (path: NodePath): number => {
    const index = values.length;
    values.push(path as NodePath<t.Expression>);
    return index;
  };
  const children: StaticNode[] = [];
  const bindings: { name: string; index: number }[] = [];
  const collect = (input: NodePath, scalar: boolean): void => {
    const path = unwrap(input)!;
    const literal = evaluateLiteral(path);
    if (literal !== null) {
      const text = textOf(literal);
      if (text !== null) children.push({ type: "text", value: text });
      return;
    }
    if (
      path.isArrayExpression() &&
      path.get("elements").every((p) => p.node !== null && !p.isSpreadElement())
    ) {
      for (const child of path.get("elements"))
        collect(child as NodePath<t.Expression>, false);
      return;
    }
    if (isFactoryCall(path, config) && callType(path, config).kind === "host") {
      const checkpoint = values.length;
      const child = classifyOrderedElement(path, config, values);
      if (child.ok) {
        children.push(child.element);
        return;
      }
      values.length = checkpoint;
    }
    // Components, operators, arrays and foreign/form content are mounted by
    // the renderer, exactly where they occurred in the source child sequence.
    children.push({ type: "hole", index: capture(input), scalar });
  };

  // Evaluation order follows the props object, not the later DOM mount order.
  for (const [name, path] of props) {
    if (name === "children") collect(path, true);
    else if (bind) bindings.push({ name, index: capture(path) });
  }
  const child = props.get("children");
  return {
    ok: true,
    element: {
      type: "element",
      tag: type.tag,
      attributes: bind ? [] : attributes,
      bindings,
      children,
      scalarChildren: child !== undefined && evaluateLiteral(child) !== null,
    },
  };
}

export function orderedCounts(node: StaticNode): {
  children: number;
  bindings: number;
} {
  if (node.type === "hole") return { children: 1, bindings: 0 };
  if (node.type === "text") return { children: 0, bindings: 0 };
  const result = { children: 0, bindings: node.bindings?.length ?? 0 };
  for (const child of node.children) {
    const count = orderedCounts(child);
    result.children += count.children;
    result.bindings += count.bindings;
  }
  return result;
}

/** (d, _hole, h, mount): operations occur in the renderer's original order. */
export function emitOrderedNative(
  root: StaticElement,
  id: t.Identifier,
): t.FunctionDeclaration {
  const d = t.identifier("d"),
    h = t.identifier("h"),
    mount = t.identifier("mount");
  const body: t.Statement[] = [
    t.ifStatement(
      t.logicalExpression(
        "||",
        t.unaryExpression("!", mount),
        t.binaryExpression(
          "!==",
          t.memberExpression(mount, t.identifier("version")),
          t.numericLiteral(1),
        ),
      ),
      t.returnStatement(t.nullLiteral()),
    ),
    t.ifStatement(
      t.binaryExpression(
        "!==",
        t.unaryExpression(
          "typeof",
          t.memberExpression(mount, t.identifier("prop")),
        ),
        t.stringLiteral("function"),
      ),
      t.returnStatement(t.nullLiteral()),
    ),
  ];
  const invoke = (object: t.Expression, method: string, args: t.Expression[]) =>
    t.callExpression(t.memberExpression(object, t.identifier(method)), args);
  const emit = (expr: t.Expression) => body.push(t.expressionStatement(expr));
  const value = (index: number) =>
    t.memberExpression(h, t.numericLiteral(index), true);
  let next = 0;
  const build = (element: StaticElement): t.Identifier => {
    const node = t.identifier(`e${next++}`);
    body.push(
      t.variableDeclaration("const", [
        t.variableDeclarator(
          node,
          invoke(d, "createElement", [t.stringLiteral(element.tag)]),
        ),
      ]),
    );
    for (const attr of element.attributes) {
      if (attr.name === "class")
        emit(
          t.assignmentExpression(
            "=",
            t.memberExpression(node, t.identifier("className")),
            t.stringLiteral(attr.value),
          ),
        );
      else
        emit(
          invoke(node, "setAttribute", [
            t.stringLiteral(attr.name),
            t.stringLiteral(attr.value),
          ]),
        );
    }
    if (element.bindings?.length === 1) {
      const binding = element.bindings[0]!;
      emit(
        invoke(mount, "prop", [
          node,
          t.stringLiteral(binding.name),
          value(binding.index),
        ]),
      );
    } else if (element.bindings?.length) {
      emit(
        invoke(mount, "props", [
          node,
          t.objectExpression(
            element.bindings.map((binding) =>
              t.objectProperty(
                t.stringLiteral(binding.name),
                value(binding.index),
              ),
            ),
          ),
        ]),
      );
    }
    for (const child of element.children) {
      if (child.type === "hole")
        emit(
          invoke(mount, "child", [
            node,
            value(child.index),
            t.booleanLiteral(child.scalar),
          ]),
        );
      else if (child.type === "element")
        emit(invoke(node, "appendChild", [build(child)]));
      else if (element.scalarChildren)
        emit(
          t.assignmentExpression(
            "=",
            t.memberExpression(node, t.identifier("textContent")),
            t.stringLiteral(child.value),
          ),
        );
      else
        emit(
          invoke(node, "appendChild", [
            invoke(d, "createTextNode", [t.stringLiteral(child.value)]),
          ]),
        );
    }
    return node;
  };
  const node = build(root);
  body.push(t.returnStatement(node));
  return t.functionDeclaration(
    id,
    [d, t.identifier("_hole"), h, mount],
    t.blockStatement(body),
  );
}
