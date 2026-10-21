import type { Namespace } from "./namespace";
import type { StyleValue } from "../types";
import { applyManagedFormProp, isManagedFormProp } from "./forms";
import { setAttr } from "./attr";
import { applyStyle } from "./styles";
import { normalizeAttr } from "./aliases";

function applyClass(el: Element, value: unknown, ns: Namespace): unknown {
  if (value == null || value === false) {
    el.removeAttribute("class");
  } else if (ns === "svg") {
    // SVGElement.className is an SVGAnimatedString.
    el.setAttribute("class", String(value));
  } else {
    // Element.className reflects the attribute and is cheaper to set.
    el.className = String(value);
  }

  return value;
}

// <div class="box" />
// <div className="box" />

// <label for="email" />
// <label htmlFor="email" />

// <form accept-charset="utf-8" />
// <form acceptCharset="utf-8" />

// <meta http-equiv="refresh" />
// <meta httpEquiv="refresh" />

// <img crossorigin="anonymous" />
// <img crossOrigin="anonymous" />

// <path stroke-width="2" />
// <path strokeWidth={2} />

// <path fill-opacity="0.5" />
// <path fillOpacity={0.5} />

// <text text-anchor="middle" />
// <text textAnchor="middle" />
//
// Both styles are officially supported: HTML-native for transparency,
// and React-style for familiarity to migrants from the React ecosystem.
export function applyProp(
  el: Element,
  name: string,
  value: unknown,
  ns: Namespace,
  prev: unknown,
): unknown {
  if (value === prev || name === "children" || name === "key") {
    return prev;
  }

  switch (name) {
    case "class":
    case "className":
      return applyClass(el, value, ns);

    case "style":
      return applyStyle(el, value as StyleValue, prev as StyleValue);
  }

  if (isManagedFormProp(el, name)) {
    return applyManagedFormProp(el, name, value);
  }

  setAttr(el, normalizeAttr(name), value, ns);
  return value;
}
