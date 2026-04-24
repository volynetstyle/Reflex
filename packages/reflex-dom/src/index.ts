export { For, Portal, Show, Switch } from "./operators";
export { Fragment, jsx, jsxDEV, jsxs } from "./runtime/jsx";
export { createDOMRenderer, type DOMRenderer } from "./runtime/renderer";
export {
  createDOMRuntime,
  hydrate,
  mount,
  render,
  resume,
  useDOMRenderer,
} from "./runtime/singleton";

export { renderToString } from "./server";

export type { DOMRuntimeOptions } from "./runtime/options";

export type {
  CustomElementProps,
  CustomElementTag,
  DOMEvent,
  DOMEventHandler,
  DOMEventHandlerProp,
  DOMEventMapFor,
  DOMEventListenerObject,
  DOMProps,
  DOMPropsBase,
  ElementInstance,
  ElementProps,
  ElementTag,
  HTMLProps,
  IntrinsicElements,
  JSXRenderable,
  MathMLProps,
  PlatformProps,
  Ref,
  RefAttributes,
  RefObject,
  SVGProps,
  StyleObject,
  StyleValue,
} from "./types";
export type {
  ForProps,
  PortalProps,
  ShowProps,
  SwitchCase,
  SwitchProps,
} from "./operators";
