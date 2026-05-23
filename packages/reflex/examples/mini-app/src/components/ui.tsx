/** @jsxImportSource @volynets/reflex-dom */

import type { JSXRenderable } from "@volynets/reflex-dom";

function statusTone(status: string): string {
  switch (status) {
    case "done":
    case "resolved":
    case "settled":
      return "success";
    case "review":
    case "pending":
    case "saving":
      return "warn";
    case "rejected":
      return "danger";
    default:
      return "info";
  }
}

export function StatusPill(props: { label: Accessor<string> | string }) {
  return (
    <span
      class={() =>
        `status-pill tone-${statusTone(
          typeof props.label === "string" ? props.label : props.label(),
        )}`
      }
    >
      {typeof props.label === "string" ? props.label : props.label}
    </span>
  );
}

export function KeyStat(props: {
  eyebrow: string;
  value: Accessor<string | number> | string | number;
  detail: Accessor<string> | string;
}) {
  return (
    <article class="key-stat">
      <span class="eyebrow">{props.eyebrow}</span>
      <strong class="value">
        {typeof props.value === "function" ? props.value : String(props.value)}
      </strong>
      <p>{typeof props.detail === "function" ? props.detail : props.detail}</p>
    </article>
  );
}

export function ControlButton(props: {
  kind?: "primary" | "secondary" | "ghost";
  onClick: () => void;
  children?: JSXRenderable;
}) {
  return (
    <button
      type="button"
      class={() => `control-button ${props.kind ?? "secondary"}`}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}
