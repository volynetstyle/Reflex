/** @jsxImportSource ../src */

import { For, Show } from "../src";

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

<svg viewBox="0 0 10 10">
  <circle cx={5} cy={5} r={4} strokeWidth={2} />
</svg>;

<Show when={"ready"}>
  {(value) => <span>{value.toUpperCase()}</span>}
</Show>;

<For each={[{ id: "a", label: "A" }]} by={(item) => item.id}>
  {(item, index) => <li data-index={index}>{item.label}</li>}
</For>;

const wrongRef = { current: null as HTMLDivElement | null };

// @ts-expect-error button refs must target HTMLButtonElement
<button ref={wrongRef} />;

// @ts-expect-error href is not a valid button prop
<button href="/bad" />;

// @ts-expect-error class only accepts string or accessor
<div class={123} />;

// @ts-expect-error onClick must receive the correct event type
<button onClick={(event: KeyboardEvent) => event.preventDefault()} />;

// @ts-expect-error unknown style keys should be rejected
<div style={{ madeUpProp: "nope" }} />;

// @ts-expect-error unknown SVG camelCase props should be rejected
<circle frobnicate="x" />;
