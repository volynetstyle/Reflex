// Operators
export { For, Portal, Show, Switch } from "./operators";

// Hooks and context
export {
  useRef,
  // state
  useSignal,
  useComputed,
  useMemo,

  // side-effects
  useEffect,
  useEffectOnce,
  // Lifecycle
  useOwned,
  useMount,
  useUnmount,
  // Contextual/Cross-component state
  useContext,
  createContext,
  provideContext,
  hasOwnContext,
  type UseEffectFn,
} from "@volynets/reflex-framework";
export { useEffectRender } from "./hooks/use-effect-render";

// JSX runtime
export { Fragment, jsx, jsxDEV, jsxs } from "./runtime/jsx";

// DOM runtime
export { createApp, setupDOM } from "./runtime/app";
export {
  createDOMRuntime,
  hydrate,
  mount,
  render,
  resume,
  useDOMRenderer,
} from "./runtime/singleton";
export { createDOMRenderer, type DOMRenderer } from "./runtime/renderer";
export {
  RenderEffectPhase,
  type DOMRenderEffectScheduler,
  type RenderEffectScheduler,
} from "./runtime/render-effect-scheduler";

// Server
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

