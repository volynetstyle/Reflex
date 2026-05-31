export { For, Portal, Show, Switch } from "./operators";

export {
  useComponentDidMount,
  useComponentDidUnmount,
  useContext,
  createContext,
  provideContext,
  hasOwnContext,
  useEffect,
  useEffectOnce,
  useEffectRender,
  useRef,
  type UseEffectFn,
} from "@volynets/reflex-framework";

export { Fragment, jsx, jsxDEV, jsxs } from "./runtime/jsx";

export { createDOMRenderer, type DOMRenderer } from "./runtime/renderer";

export {
  createApp,
  setupDOM,
  type ReflexDOMApp,
} from "./runtime/app";

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
