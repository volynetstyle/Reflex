import { types as t } from "@babel/core";
import { HOLE_PARAMS, holeGuard, mountHoles, type HoleSite } from "./emit-holes";
import { soleTextChild, type StaticElement } from "./model";

/**
 * Emits `function create(d) { ... }` building `root` with direct DOM calls in
 * the mount document `d`: the same operations reflex-dom performs, minus prop
 * dispatch and child classification. With holes, the signature is
 * `(d, hole, h)`: each hole gets a comment marker, and once the tree exists
 * the renderer's `hole` mounts `h[i]` there.
 */
export function emitNative(
  root: StaticElement,
  id: t.Identifier,
  accepts: t.Identifier | null,
): t.FunctionDeclaration {
  const doc = HOLE_PARAMS.doc();
  const body: t.Statement[] = [];
  const sites: HoleSite[] = [];
  let next = 0;

  if (accepts !== null) body.push(holeGuard(accepts));

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

  const declare = (name: t.Identifier, init: t.Expression) =>
    body.push(t.variableDeclaration("const", [t.variableDeclarator(name, init)]));

  const build = (element: StaticElement): t.Identifier => {
    const node = t.identifier(`e${next++}`);
    declare(node, call(doc, "createElement", [t.stringLiteral(element.tag)]));

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
      const children = element.children.map((child): t.Expression => {
        if (child.type === "text") return t.stringLiteral(child.value);
        if (child.type === "element") return build(child);
        const marker = t.identifier(`m${child.index}`);
        declare(marker, call(doc, "createComment", [t.stringLiteral("")]));
        sites.push({ hole: child, parent: node, marker });
        return marker;
      });
      body.push(t.expressionStatement(call(node, "append", children)));
    }

    return node;
  };

  const root$ = build(root);
  body.push(...mountHoles(sites), t.returnStatement(root$));
  const params = accepts === null ? [doc] : [doc, HOLE_PARAMS.mount(), HOLE_PARAMS.values()];
  return t.functionDeclaration(id, params, t.blockStatement(body));
}
