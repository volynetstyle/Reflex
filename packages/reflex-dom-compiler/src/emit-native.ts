import { types as t } from "@babel/core";
import { soleTextChild, type StaticElement } from "./model";

/**
 * Emits `function create(d) { ... }` building `root` with direct DOM calls in
 * the mount document `d`: the same operations reflex-dom performs, minus prop
 * dispatch and child classification.
 */
export function emitNative(root: StaticElement, id: t.Identifier): t.FunctionDeclaration {
  const doc = t.identifier("d");
  const body: t.Statement[] = [];
  let next = 0;

  const assign = (target: t.Identifier, property: string, value: string) =>
    body.push(
      t.expressionStatement(
        t.assignmentExpression(
          "=",
          t.memberExpression(target, t.identifier(property)),
          t.stringLiteral(value),
        ),
      ),
    );

  const call = (target: t.Identifier, method: string, args: t.Expression[]) =>
    t.callExpression(t.memberExpression(target, t.identifier(method)), args);

  const build = (element: StaticElement): t.Identifier => {
    const node = t.identifier(`e${next++}`);
    body.push(
      t.variableDeclaration("const", [
        t.variableDeclarator(
          node,
          call(doc, "createElement", [t.stringLiteral(element.tag)]),
        ),
      ]),
    );

    for (const { name, value } of element.attributes) {
      if (name === "class") assign(node, "className", value);
      else {
        body.push(
          t.expressionStatement(
            call(node, "setAttribute", [t.stringLiteral(name), t.stringLiteral(value)]),
          ),
        );
      }
    }

    const sole = soleTextChild(element);
    if (sole !== null) {
      assign(node, "textContent", sole);
    } else if (element.children.length > 0) {
      // `append` turns string arguments into Text nodes of the same document.
      const children = element.children.map((child) =>
        child.type === "text" ? t.stringLiteral(child.value) : build(child),
      );
      body.push(t.expressionStatement(call(node, "append", children)));
    }

    return node;
  };

  const root$ = build(root);
  body.push(t.returnStatement(root$));
  return t.functionDeclaration(id, [doc], t.blockStatement(body));
}
