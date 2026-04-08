/** @jsxImportSource ../src */

import { For, Portal, Show } from "../src";
// @ts-expect-error reflex-dom should not re-export framework context api
import { createContext } from "../src";
// @ts-expect-error reflex-dom should not re-export framework hooks
import { useSignal } from "../src";

const buttonRef = { current: null as HTMLButtonElement | null };

<button
  ref={buttonRef}
  type="button"
  disabled={() => true}
  style={{ color: "red", "--accent": 1 }}
  onClick={(event) => {
    const element: HTMLButtonElement = event.currentTarget;
    element.disabled = true;
  }}
  on:click={(event) => {
    event.currentTarget.disabled = false;
  }}
/>;

<div
  onFullscreenChange={(event) => {
    const nativeEvent: Event = event;
    event.currentTarget.hidden = false;
    nativeEvent.preventDefault();
  }}
  onPointerRawUpdate={(event) => {
    const rawPointerEvent: Event = event;
    event.currentTarget.hidden = rawPointerEvent.type.length > 0;
  }}
  onDragExit={(event) => {
    const fallbackEvent: Event = event;
    event.currentTarget.draggable = true;
    fallbackEvent.stopPropagation();
  }}
/>;

<input
  onKeyPress={(event) => {
    const keyEvent: KeyboardEvent = event;
    event.currentTarget.value = keyEvent.key;
  }}
/>;

<body
  onBeforeUnload={(event) => {
    const beforeUnloadEvent: BeforeUnloadEvent = event;
    beforeUnloadEvent.returnValue = "";
    event.currentTarget.hidden = false;
  }}
/>;

<video
  onEncrypted={(event) => {
    const encryptedEvent: MediaEncryptedEvent = event;
    event.currentTarget.muted = encryptedEvent.initDataType.length > 0;
  }}
  onEnterPictureInPicture={(event) => {
    const pictureInPictureEvent: PictureInPictureEvent = event;
    pictureInPictureEvent.pictureInPictureWindow.width;
    event.currentTarget.pause();
  }}
/>;

<svg viewBox="0 0 10 10">
  <circle cx={5} cy={5} r={4} strokeWidth={2} />
</svg>;

const shadowRootRef = { current: null as ShadowRoot | null };
const internalsRef = { current: null as ElementInternals | null };
const styleSheet = {} as CSSStyleSheet;

<math display="block">
  <mrow>
    <mi>x</mi>
    <mo>+</mo>
    <mn>1</mn>
  </mrow>
</math>;

<my-widget
  shadowRoot={{ mode: "open", delegatesFocus: true }}
  shadowRootRef={shadowRootRef}
  shadowAdoptedStyleSheets={[styleSheet]}
  shadowChildren={<span>shadow</span>}
  elementInternals={internalsRef}
  customValue={{ ok: true }}
  on:widget-ready={(event) => {
    const customEvent: Event = event;
    customEvent.preventDefault();
  }}
/>;

<select multiple value={["a", "b"]}>
  <option value="a">A</option>
  <option value="b">B</option>
</select>;

<Show when={"ready"}>
  {(value) => <span>{value.toUpperCase()}</span>}
</Show>;

<For each={[{ id: "a", label: "A" }]} by={(item) => item.id}>
  {(item, index) => <li data-index={index}>{item.label}</li>}
</For>;

const portalTarget = document.createElement("div");

<Portal to={portalTarget}>
  <span>inside portal</span>
</Portal>;

const wrongRef = { current: null as HTMLDivElement | null };

// @ts-expect-error button refs must target HTMLButtonElement
<button ref={wrongRef} />;

// @ts-expect-error href is not a valid button prop
<button href="/bad" />;

// @ts-expect-error class only accepts string or accessor
<div class={123} />;

// @ts-expect-error onClick must receive the correct event type
<button onClick={(event: KeyboardEvent) => event.preventDefault()} />;

// @ts-expect-error body-level window events should not exist on div
<div onBeforeUnload={(event) => event.preventDefault()} />;

// @ts-expect-error media events should not exist on button
<button onEncrypted={(event) => event.preventDefault()} />;

// @ts-expect-error unknown style keys should be rejected
<div style={{ madeUpProp: "nope" }} />;

// @ts-expect-error unknown SVG camelCase props should be rejected
<circle frobnicate="x" />;
