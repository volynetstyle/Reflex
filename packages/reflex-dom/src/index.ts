export { For, Portal, Show, Switch } from "./operators";
export type {
  ForProps,
  PortalProps,
  ShowProps,
  SwitchCase,
  SwitchProps,
} from "./operators";

export {
  createContext,
  hasOwnContext,
  provideContext,
  useComputed,
  useContext,
  useEffect,
  useEffectOnce,
  useMemo,
  useMount,
  useOwned,
  useRef,
  useUnmount,
  useAbortSignal,
  getLifetimeSignal,
} from "@volynets/reflex-framework";
export type { UseEffectFn } from "@volynets/reflex-framework";

export { useMountedEffect } from "./hooks/use-mounted-effect";
export { useSignal } from "./hooks/use-signal";
export { Fragment, jsx, jsxDEV, jsxs } from "./runtime/jsx";
export { createApp, setupDOM } from "./client/app";
export {
  createDOMRuntime,
  hydrate,
  mount,
  render,
  resume,
  useDOMRenderer,
} from "./client/default";
export { createDOMRenderer, type DOMRenderer } from "./client/renderer";
export type { DOMRuntimeOptions } from "./runtime/options";
export type { MountEffects } from "./runtime/mount-effects";
export { renderToString } from "./server";
export { createDOMRangeHandle, type DOMRangeHandle } from "./host/range-handle";

export type { JSX } from "./types/jsx";
export type {
  Accessor,
  AriaAttributes,
  AriaAttributeValueMap,
  AriaRole,
  AriaRoleValue,
  Attributes,
  Component,
  ComponentProps,
  ComponentRenderable,
  ComponentType,
  CSSPropertyValue,
  CustomElementIntrinsicElements,
  CustomElementProps,
  CustomElementTag,
  DOMCommandEvent,
  DOMContentVisibilityAutoStateChangeEvent,
  DOMCustomEventMap,
  DOMEvent,
  DOMEventHandler,
  DOMEventHandlerProp,
  DOMEventListenerObject,
  DOMEventListenerOptions,
  DOMEventMapFor,
  DOMEventProps,
  DOMProps,
  DOMPropsBase,
  DOMSnapEvent,
  DOMTimeEvent,
  ElementInstance,
  ElementInternalsProps,
  ElementProps,
  ElementTag,
  HTMLElementAttributeMap,
  HTMLElementProps,
  HTMLIntrinsicElements,
  HTMLProps,
  InputProps,
  IntrinsicElements,
  JSXRenderable,
  MathMLElementAttributeMap,
  MathMLElementProps,
  MathMLIntrinsicElements,
  MathMLProps,
  MaybeAccessor,
  OptionProps,
  PlatformProps,
  PropsWithChildren,
  Ref,
  RefAttributes,
  RefCallback,
  RefObject,
  SelectProps,
  ShadowHostProps,
  StyleObject,
  StyleValue,
  SVGElementProps,
  SVGIntrinsicElements,
  SVGProps,
  TextareaProps,
} from "./types";
export type {
  NativeDOMEventName,
  NativeDOMEventPropMap,
  NativeDOMEventPropName,
} from "./types/events.native";

export {
  defineModel,
  isModel,
  isModelActionValue,
  isModelReadableValue,
  own,
  readModelValue,
} from "./runtime/model";
export type {
  Model,
  ModelAction,
  ModelContext,
  ModelFactory,
  ModelHandle,
  ModelOptions,
  ModelReadable,
  ModelSetup,
  ModelValue,
} from "./runtime/model";
