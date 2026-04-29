/** @jsxImportSource @volynets/reflex-dom */

import { StatusPill } from "../components/ui";
import type { DemoModel } from "../state/demo.app";

export function HeroSection(props: {
  model: DemoModel;
  runtimeScope: string;
}) {
  const { model, runtimeScope } = props;

  return (
    <section class="hero-card">
      <div class="hero-copy">
        <span class="eyebrow">Workspace Example</span>
        <h1>{() => model.workspace.title}</h1>
        <p class="hero-summary">{() => model.workspace.selectedSummary}</p>
        <p class="hero-subtitle">{() => model.workspace.subtitle}</p>
      </div>

      <div class="hero-meta">
        <div class="meta-stack">
          <StatusPill label={() => model.saveState()} />
          <StatusPill label={() => model.insightResource.status()} />
          <span class="status-pill tone-info">{runtimeScope}</span>
        </div>
        <p>{() => model.workspace.queueHint}</p>
        <strong class="system-trace">{model.firstSystemTrace}</strong>
      </div>
    </section>
  );
}
