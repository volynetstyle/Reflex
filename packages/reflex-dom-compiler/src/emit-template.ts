import { types as t } from "@babel/core";
import { parseFragment } from "parse5";
import type { StaticElement, StaticNode } from "./model";

const HTML_NS = "http://www.w3.org/1999/xhtml";
const VOID_TAGS = new Set(["br", "hr", "img", "wbr"]);

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

export function serialize(node: StaticNode): string {
  if (node.type === "text") return escapeText(node.value);
  let html = `<${node.tag}`;
  for (const { name, value } of node.attributes) {
    html += ` ${name}="${escapeAttribute(value)}"`;
  }
  html += ">";
  if (VOID_TAGS.has(node.tag)) return html;
  for (const child of node.children) html += serialize(child);
  return `${html}</${node.tag}>`;
}

interface ParsedNode {
  nodeName: string;
  tagName?: string;
  namespaceURI?: string;
  value?: string;
  attrs?: { name: string; value: string; namespace?: string }[];
  childNodes?: ParsedNode[];
}

function describe(node: StaticNode): string {
  return node.type === "text" ? `text ${JSON.stringify(node.value)}` : `<${node.tag}>`;
}

function compare(expected: StaticNode, actual: ParsedNode): string | null {
  if (expected.type === "text") {
    if (actual.nodeName !== "#text") return `parser produced ${actual.nodeName} for ${describe(expected)}`;
    return actual.value === expected.value
      ? null
      : `parser changed text ${JSON.stringify(expected.value)} to ${JSON.stringify(actual.value)}`;
  }

  if (actual.tagName !== expected.tag || actual.namespaceURI !== HTML_NS) {
    return `parser produced ${actual.tagName ?? actual.nodeName} for <${expected.tag}>`;
  }

  const attrs = actual.attrs ?? [];
  if (
    attrs.length !== expected.attributes.length ||
    expected.attributes.some(
      (attribute, index) =>
        attrs[index]!.name !== attribute.name ||
        attrs[index]!.value !== attribute.value ||
        attrs[index]!.namespace !== undefined,
    )
  ) {
    return `parser changed attributes of <${expected.tag}>`;
  }

  return compareChildren(expected.children, actual.childNodes ?? [], `<${expected.tag}>`);
}

function compareChildren(
  expected: readonly StaticNode[],
  actual: readonly ParsedNode[],
  owner: string,
): string | null {
  for (let index = 0; index < expected.length; index++) {
    const parsed = actual[index];
    if (parsed === undefined) return `parser moved ${describe(expected[index]!)} out of ${owner}`;
    const reason = compare(expected[index]!, parsed);
    if (reason !== null) return reason;
  }
  return actual.length === expected.length
    ? null
    : `parser restructured the children of ${owner}`;
}

/**
 * Parses the serialized region with the HTML fragment algorithm in a
 * `<template>` context, which is what `template.innerHTML` runs, and returns
 * why the result differs from the intended tree, or `null` when it is
 * identical node for node.
 */
export function verifyTemplate(root: StaticElement): string | null {
  const fragment = parseFragment(serialize(root)) as unknown as ParsedNode;
  const reason = compareChildren([root], fragment.childNodes ?? [], "the template");
  return reason === null ? null : `parser context: ${reason}`;
}

/** `const id = template("<html>")`, a per-region lazily prepared template. */
export function emitTemplate(
  root: StaticElement,
  id: t.Identifier,
  helper: t.Identifier,
): t.VariableDeclaration {
  return t.variableDeclaration("const", [
    t.variableDeclarator(
      id,
      t.addComment(
        t.callExpression(helper, [t.stringLiteral(serialize(root))]),
        "leading",
        "#__PURE__",
      ),
    ),
  ]);
}
