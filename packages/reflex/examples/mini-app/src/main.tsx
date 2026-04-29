/** @jsxImportSource @volynets/reflex-dom */

import { createRuntime } from "@volynets/reflex";
import { render } from "@volynets/reflex-dom";
import { DemoApp } from "./app";
import { createDemoApp } from "./state/demo.app";
import "./styles/app.css";

const runtime = createRuntime({ effectStrategy: "flush" });
const model = createDemoApp();
const root = document.getElementById("app");

if (root !== null) {
  render(<DemoApp model={model} runtimeScope={runtime.ctx.scope} />, root);
}
