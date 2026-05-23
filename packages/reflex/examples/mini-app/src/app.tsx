/** @jsxImportSource @volynets/reflex-dom */

import { BoardSection } from "./sections/board-section";
import { ConsoleSection } from "./sections/console-section";
import { DetailSection } from "./sections/detail-section";
import { HeroSection } from "./sections/hero-section";
import { ProjectionSection } from "./sections/projection-section";
import { ResourceSection } from "./sections/resource-section";
import { RuntimeSection } from "./sections/runtime-section";
import { StatsSection } from "./sections/stats-section";
import type { DemoModel } from "./state/demo.app";

export function DemoApp(props: { model: DemoModel; runtimeScope: string }) {
  const { model } = props;

  return (
    <main class="deck-shell">
      <div class="hero-glow hero-glow-a" />
      <div class="hero-glow hero-glow-b" />
      <HeroSection model={model} runtimeScope={props.runtimeScope} />
      <StatsSection model={model} />
      <RuntimeSection model={model} />
      <section class="content-grid">
        <BoardSection model={model} />
        <DetailSection model={model} />
      </section>

      <section class="content-grid">
        <ResourceSection model={model} />
        <ProjectionSection model={model} />
      </section>
      <ConsoleSection model={model} />
    </main>
  );
}
