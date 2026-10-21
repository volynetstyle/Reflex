import { createApp } from "@volynets/reflex-dom";

const label = () => "dynamic";
const app = createApp();
export const dispose = app.render(
  <section class="vite-compiler"><span>{label}</span><b>static</b></section>,
  document.body,
);
