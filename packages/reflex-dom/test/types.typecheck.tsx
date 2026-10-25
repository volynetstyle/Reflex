/** @jsxImportSource ../src */

import { For, Portal, Show } from "../src";
import { createContext, Provider, provideContext, useContext } from "../src";
import { useSignal } from "../src";
import type {
  Component,
  ComponentProps,
  DOMCommandEvent,
  DOMEventMapFor,
  DOMRangeHandle,
  ElementInstance,
  JSXRenderable,
  NativeDOMEventName,
  PropsWithChildren,
  useAbortSignal,
} from "../src";
import type {
  CompatibilityNativeDOMEventPropMap,
  StandardNativeDOMEventPropMap,
  WindowNativeDOMEventPropMap,
} from "../src/types/events.native";

declare module "../src" {
  interface DOMCustomEventMap {
    "widget-ready": CustomEvent<{ id: string }>;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "x-typed": HTMLElement & { level: number };
  }
}

// ---------------------------------------------------------------------------
// Type-level helpers
// ---------------------------------------------------------------------------

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Expect<T extends true> = T;

// ---------------------------------------------------------------------------
// Event prop names agree with the runtime resolution in host/events.ts:
// `onName` resolves to `Lowercase<Name>` unless it is an explicit alias.
// ---------------------------------------------------------------------------

type ResolvedEventName<Prop> = Prop extends `on${infer Name}`
  ? Lowercase<Name>
  : never;

type MisresolvedEventProps = {
  [K in keyof StandardNativeDOMEventPropMap]: Equal<
    ResolvedEventName<K>,
    StandardNativeDOMEventPropMap[K]
  > extends true
    ? never
    : K;
}[keyof StandardNativeDOMEventPropMap];

type _EventPropsResolveLikeRuntime = Expect<
  Equal<MisresolvedEventProps, never>
>;
type _CompatibilityAliases = Expect<
  Equal<
    CompatibilityNativeDOMEventPropMap,
    { onDoubleClick: "dblclick"; onDragExit: "dragexit" }
  >
>;

// Every event the DOM library defines for elements has a prop.
type ElementLevelEventName =
  | keyof ElementEventMap
  | keyof GlobalEventHandlersEventMap
  | keyof HTMLMediaElementEventMap
  | keyof HTMLVideoElementEventMap;
type _EveryElementEventHasAProp = Expect<
  Equal<Exclude<ElementLevelEventName, NativeDOMEventName>, never>
>;

// Window events are props only where the renderer forwards them to Window.
type WindowEventName =
  WindowNativeDOMEventPropMap[keyof WindowNativeDOMEventPropMap];
type _BodyHasWindowEvents = Expect<
  Equal<Exclude<WindowEventName, keyof DOMEventMapFor<HTMLBodyElement>>, never>
>;
type _DivHasNoWindowEvents = Expect<
  Equal<Extract<WindowEventName, keyof DOMEventMapFor<HTMLDivElement>>, never>
>;
type _SvgHasNoWindowEvents = Expect<
  Equal<Extract<WindowEventName, keyof DOMEventMapFor<SVGSVGElement>>, never>
>;
type _BodyErrorIsWindowError = Expect<
  Equal<DOMEventMapFor<HTMLBodyElement>["error"], ErrorEvent>
>;

// Event types follow the specifications where the DOM library differs.
type _ElementErrorIsEvent = Expect<
  Equal<DOMEventMapFor<HTMLImageElement>["error"], Event>
>;
type _RawUpdateIsPointerEvent = Expect<
  Equal<DOMEventMapFor<HTMLDivElement>["pointerrawupdate"], PointerEvent>
>;
type _PrefixedAnimationEvent = Expect<
  Equal<DOMEventMapFor<HTMLDivElement>["webkitanimationend"], AnimationEvent>
>;
type _CommandEvent = Expect<
  Equal<DOMEventMapFor<HTMLDialogElement>["command"], DOMCommandEvent>
>;

// Shared HTML/SVG tags resolve to either element.
type _SharedTagInstance = Expect<
  Equal<ElementInstance<"a">, HTMLAnchorElement | SVGAElement>
>;

// ---------------------------------------------------------------------------
// Structural operators and hooks
// ---------------------------------------------------------------------------

const rangeRef = { current: null as DOMRangeHandle | null };
<Show when={true} ref={rangeRef}>
  <span />
</Show>;
<For
  each={[1]}
  by={(value) => value}
  ref={(range) => {
    range?.focus();
  }}
>
  {(value) => <span>{value}</span>}
</For>;
// @ts-expect-error Structural refs receive a range, not an element.
<Show when={true} ref={{ current: null as HTMLDivElement | null }} />;
const abortSignal: AbortSignal = null! as ReturnType<typeof useAbortSignal>;
void abortSignal;

const Theme = createContext("light");
const OptionalTheme = createContext<string>();
const theme: string = useContext(Theme);
const optionalTheme: string | undefined = useContext(OptionalTheme);
void theme;
void optionalTheme;
provideContext(Theme, "dark");
// @ts-expect-error The value must match the context type.
provideContext(Theme, 1);
// @ts-expect-error The owner is resolved implicitly.
useContext(null!, Theme);
<Provider context={Theme} value="dark">
  <span />
</Provider>;
// @ts-expect-error The value must match the context type.
<Provider context={Theme} value={1} />;
void useSignal;

<Show when={"ready"}>{(value) => <span>{value.toUpperCase()}</span>}</Show>;

<For each={[{ id: "a", label: "A" }]} by={(item) => item.id}>
  {(item, index) => <li data-index={index}>{() => item().label}</li>}
</For>;

const portalTarget = document.createElement("div");

<Portal to={portalTarget}>
  <span>inside portal</span>
</Portal>;

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

const Greeting: Component<{ name: string }> = (props) => `Hello ${props.name}`;
const Panel = (props: PropsWithChildren<{ title: string }>): JSXRenderable => (
  <section aria-label={props.title}>{props.children}</section>
);
const Nothing = () => null;
const List = () => [<li />, "text", 1];

<Greeting name="Ada" key="greeting" />;
<Panel title="Settings">
  <Nothing />
  <List />
</Panel>;

// @ts-expect-error missing required prop
<Greeting />;
// @ts-expect-error props are checked against the component
<Greeting name={1} />;

const NotAComponent = 5;
// @ts-expect-error only tags and functions returning renderables are JSX tags
<NotAComponent />;
// @ts-expect-error unknown intrinsic tag
<notatag />;

type _ButtonProps = Expect<
  Equal<ComponentProps<"button">["type"], ComponentProps<"button">["type"]>
>;
const buttonType: ComponentProps<"button">["disabled"] = () => true;
const greetingProps: ComponentProps<typeof Greeting> = { name: "Ada" };
void buttonType;
void greetingProps;

// ---------------------------------------------------------------------------
// HTML props and events
// ---------------------------------------------------------------------------

const buttonRef = { current: null as HTMLButtonElement | null };

<button
  ref={buttonRef}
  type="button"
  disabled={() => true}
  style={{ color: "red", "--accent": 1 }}
  onClick={(event) => {
    const element: HTMLButtonElement = event.currentTarget;
    const pointer: PointerEvent = event;
    element.disabled = pointer.isPrimary;
  }}
  on:click={(event) => {
    event.currentTarget.disabled = false;
  }}
/>;

<button
  onClick={function (event) {
    this.disabled = event.button === 0;
    const typed: HTMLButtonElement = event.currentTarget;
    void typed;
  }}
  onKeyDown={{
    once: true,
    passive: true,
    handleEvent(event) {
      const key: string = event.key;
      event.currentTarget.value = key;
    },
  }}
/>;

<button
  onClick={{
    // @ts-expect-error the renderer does not forward `signal`
    signal: new AbortController().signal,
    handleEvent() {},
  }}
/>;

<div
  onFullscreenChange={(event) => {
    const nativeEvent: Event = event;
    event.currentTarget.hidden = false;
    nativeEvent.preventDefault();
  }}
  onPointerRawUpdate={(event) => {
    const rawPointerEvent: PointerEvent = event;
    event.currentTarget.hidden = rawPointerEvent.pressure > 0;
  }}
  onDragExit={(event) => {
    const dragEvent: DragEvent = event;
    event.currentTarget.draggable = true;
    dragEvent.stopPropagation();
  }}
  onScrollSnapChange={(event) => {
    void event.snapTargetBlock;
  }}
  onContentVisibilityAutoStateChange={(event) => {
    const skipped: boolean = event.skipped;
    void skipped;
  }}
  onDoubleClick={(event) => {
    const mouse: MouseEvent = event;
    void mouse;
  }}
/>;

<input
  onInvalid={(event) => {
    event.currentTarget.setCustomValidity("required");
  }}
  onKeyPress={(event) => {
    const keyEvent: KeyboardEvent = event;
    event.currentTarget.value = keyEvent.key;
  }}
/>;

<img
  src="/a.png"
  alt=""
  crossorigin="anonymous"
  onError={(event) => {
    const plain: Event = event;
    void plain;
  }}
/>;

<img
  alt=""
  onError={(event) => {
    // @ts-expect-error element `error` events are plain Events, not ErrorEvents
    const scriptError: ErrorEvent = event;
    void scriptError;
  }}
/>;

<dialog
  closedby="closerequest"
  onCommand={(event) => {
    const command: string = event.command;
    void command;
  }}
/>;
<button command="show-modal" commandfor="settings" popovertarget="menu" />;
<button command="--custom-action" commandfor="settings" />;
// @ts-expect-error unknown built-in invoker command
<button command="open" />;

<video
  onEncrypted={(event) => {
    const encryptedEvent: MediaEncryptedEvent = event;
    event.currentTarget.muted = encryptedEvent.initDataType.length > 0;
  }}
  onEnterPictureInPicture={(event) => {
    const pictureInPictureEvent: PictureInPictureEvent = event;
    void pictureInPictureEvent.pictureInPictureWindow.width;
    event.currentTarget.pause();
  }}
  onResize={(event) => {
    const plain: Event = event;
    void plain;
  }}
/>;

// HTML-native attribute spellings, on the elements that define them.
<label for="email" htmlFor="email" />;
<output for="a b" form="f" />;
<form accept-charset="utf-8" acceptCharset="utf-8" />;
<meta http-equiv="refresh" httpEquiv="refresh" content="5" />;
<input list="suggestions" form="f" />;
<iframe sandbox="allow-scripts" />;
<link rel="icon" sizes="16x16" blocking="render" crossorigin="" />;

// @ts-expect-error `for` is only defined on label and output
<div htmlFor="email" />;
// @ts-expect-error unknown `http-equiv` keyword
<meta http-equiv="cache-control" />;

// Attributes whose values the property type does not cover.
<div hidden={true} />;
<div hidden="until-found" />;
<details hidden={() => "until-found" as const} />;
<a href="/report.pdf" download />;
<a href="/report.pdf" download="report.pdf" />;
<area href="/report.pdf" download={false} />;
// @ts-expect-error `hidden` takes a boolean or "until-found"
<div hidden="yes" />;
// @ts-expect-error `download` is defined on a and area only
<div download />;

// Global attributes.
<div
  part="label"
  exportparts="label"
  itemscope
  itemtype="https://schema.org/Person"
  itemprop="name"
  popover="auto"
  inert={false}
  data-state="open"
  data-count={1}
  data-active
/>;

// Non-attribute properties are not props.
// @ts-expect-error innerHTML is an injection sink, not an attribute
<div innerHTML="<b>x</b>" />;
// @ts-expect-error textContent would replace renderer-owned children
<div textContent="x" />;
// @ts-expect-error ARIA reflection properties are not props; use aria-*
<div ariaLabel="x" />;

// ---------------------------------------------------------------------------
// ARIA
// ---------------------------------------------------------------------------

<div
  role="switch checkbox"
  aria-checked="mixed"
  aria-expanded="false"
  aria-hidden={() => "true"}
  aria-level={2}
  aria-valuenow="0.5"
  aria-live="polite"
  aria-relevant="additions text"
  aria-labelledby="a b"
  aria-description="details"
/>;
<svg role="img" aria-label="chart" />;

<div aria-hidden={true} aria-expanded={false} aria-checked="mixed" />;
// @ts-expect-error aria-live takes tokens, not booleans
<div aria-live={true} />;
// TypeScript never reports undeclared hyphenated JSX attributes, so unknown
// `aria-*` names cannot be rejected; declared ones are value-checked.
// @ts-expect-error unknown role
<div role="bogus" />;
// @ts-expect-error invalid aria-live token
<div aria-live="loud" />;

// ---------------------------------------------------------------------------
// Content models
// ---------------------------------------------------------------------------

<title>Page {1}</title>;
<textarea>initial</textarea>;
<style>{"a { color: red }"}</style>;
<br />;

// @ts-expect-error void elements have no content
<img alt="">child</img>;
// @ts-expect-error input is a void element
<input>child</input>;
<title>
  {/* @ts-expect-error title contains text only */}
  <span />
</title>;

// ---------------------------------------------------------------------------
// Shadow DOM and custom elements
// ---------------------------------------------------------------------------

const shadowRootRef = { current: null as ShadowRoot | null };
const internalsRef = { current: null as ElementInternals | null };
const styleSheet = {} as CSSStyleSheet;

<div shadowRoot={{ mode: "closed" }} shadowChildren={<slot />} />;
<my-widget
  shadowRoot={{ mode: "open", delegatesFocus: true }}
  shadowRootRef={shadowRootRef}
  shadowAdoptedStyleSheets={[styleSheet]}
  shadowChildren={<span>shadow</span>}
  elementInternals={internalsRef}
  customValue={{ ok: true }}
  on:widget-ready={(event) => {
    const id: string = event.detail.id;
    void id;
  }}
  on:anything-else={(event: CustomEvent<number>) => {
    void event.detail;
  }}
/>;

// @ts-expect-error button cannot host a shadow root
<button shadowRoot />;
// @ts-expect-error only autonomous custom elements attach internals
<div elementInternals={internalsRef} />;
// @ts-expect-error SVG elements cannot host a shadow root
<g shadowRoot />;

// Custom elements registered in HTMLElementTagNameMap get typed props.
<x-typed level={2} />;
// @ts-expect-error registered custom element props are typed
<x-typed level="2" />;

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

<select multiple value={["a", "b"]}>
  <option value="a">A</option>
  <option value="b" selected={() => true}>
    B
  </option>
</select>;
<input type="checkbox" checked={() => true} indeterminate={false} />;
<textarea value={() => "x"} />;

// ---------------------------------------------------------------------------
// SVG
// ---------------------------------------------------------------------------

<svg viewBox="0 0 10 10" tabindex={0}>
  <circle cx={5} cy={5} r={4} strokeWidth={2} stroke-linecap="round" />
  <path d="M0 0" clip-path="url(#c)" fill={false} />
  <filter id="blur">
    <feGaussianBlur in="SourceGraphic" stdDeviation={2} result="b" />
  </filter>
  <a href="#target" stroke="red" />
  <animate
    attributeName="opacity"
    dur="1s"
    repeatCount="indefinite"
    on:beginEvent={(event) => {
      const detail: number = event.detail;
      void detail;
    }}
  />
</svg>;
<For each={[{ id: "a", label: "A" }]} by={(item) => item.id}>
  {(item, index) => <li data-index={index}>{() => item().label}</li>}
</For>;
<For each={[{ id: "a", label: "A" }]} by={(item) => item.id}>
  {/* @ts-expect-error Rows receive accessors, not item values. */}
  {(item) => <li>{item.label}</li>}
</For>;

// @ts-expect-error SVG names are written as attributes; the attribute is `tabindex`
<svg tabIndex={0} />;
// Presentation attributes accept their CSS camelCase spelling.
<path clipPath="url(#c)" fontSize={12} pointerEvents="none" />;
// @ts-expect-error aliases are camelCase; there is no PascalCase spelling
<path ClipPath="url(#c)" />;
// @ts-expect-error unknown SVG camelCase props should be rejected
<circle frobnicate="x" />;
// @ts-expect-error SVG keyword attributes do not accept `true`
<path fill={true} />;

// ---------------------------------------------------------------------------
// MathML
// ---------------------------------------------------------------------------

<math display="block">
  <mrow>
    <mi mathvariant="normal">x</mi>
    <mo stretchy="false" form="infix">
      +
    </mo>
    <mfrac linethickness={0}>
      <mn>1</mn>
      <mn>2</mn>
    </mfrac>
    <mspace width="1em" />
  </mrow>
</math>;

// @ts-expect-error MathML booleans are "true"/"false" strings
<mo stretchy={true} />;
// @ts-expect-error `display` is only defined on <math>
<mi display="block" />;

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

<div
  style={{
    backgroundColor: "red",
    "background-color": "red",
    "-webkit-line-clamp": 2,
    float: "left",
    "--accent": "blue",
  }}
/>;

// ---------------------------------------------------------------------------
// Rejections
// ---------------------------------------------------------------------------

const wrongRef = { current: null as HTMLDivElement | null };

// @ts-expect-error button refs must target HTMLButtonElement
<button ref={wrongRef} />;

// @ts-expect-error href is not a valid button prop
<button href="/bad" />;

// @ts-expect-error class only accepts string or accessor
<div class={123} />;

// @ts-expect-error onClick must receive the correct event type
<button onClick={(event: KeyboardEvent) => event.preventDefault()} />;

<body
  onBeforeUnload={(event) => {
    const unload: BeforeUnloadEvent = event;
    const target: Window = event.currentTarget;
    unload.preventDefault();
    void target;
  }}
  on:hashchange={(event) => {
    const change: HashChangeEvent = event;
    void change.newURL;
  }}
  onError={(event) => {
    const scriptError: ErrorEvent = event;
    void scriptError.message;
  }}
  onClick={(event) => {
    const body: HTMLBodyElement = event.currentTarget;
    void body;
  }}
/>;

// @ts-expect-error window events are only forwarded from <body>/<frameset>
<div onBeforeUnload={(event) => event.preventDefault()} />;
// @ts-expect-error <svg> does not forward window events
<svg onHashChange={(event) => event.preventDefault()} />;

// @ts-expect-error media events should not exist on button
<button onEncrypted={(event) => event.preventDefault()} />;

// @ts-expect-error unknown style keys should be rejected
<div style={{ madeUpProp: "nope" }} />;
