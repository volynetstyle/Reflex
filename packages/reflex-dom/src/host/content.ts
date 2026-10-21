import type { Namespace } from "./namespace";

/**
 * Properties that replace an element's content when assigned (`innerHTML`,
 * `textContent`, `innerText`). JSX children are rendered after them.
 */
export function isContentProp(name: string): boolean {
  return name === "innerHTML" || name === "textContent" || name === "innerText";
}

/**
 * Whether `props` set the element's content through a property. SVG writes
 * every prop as an attribute, so there they are plain attributes.
 */
export function hasContentProp(
  props: Record<string, unknown>,
  ns: Namespace,
): boolean {
  return (
    ns !== "svg" &&
    (props.innerHTML !== undefined ||
      props.textContent !== undefined ||
      props.innerText !== undefined)
  );
}

/**
 * HTML elements whose content the HTML parser reads as text: raw text
 * (`script`, `style`) and escapable raw text (`textarea`, `title`). Comments
 * inside them are text, so their children carry no hydration markers.
 */
export function isTextOnlyElement(tag: string, ns: Namespace): boolean {
  return (
    ns === "html" &&
    (tag === "script" ||
      tag === "style" ||
      tag === "textarea" ||
      tag === "title")
  );
}
