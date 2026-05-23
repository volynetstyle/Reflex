/** @jsxImportSource @volynets/reflex-dom */

import { ControlButton } from "../components/ui";
import type { DemoModel } from "../state/demo.app";

export function RuntimeSection(props: { model: DemoModel }) {
  const { model } = props;

  return (
    <section class="section-card">
      <div class="section-head">
        <div>
          <span class="eyebrow">Core Runtime</span>
          <h2>Signals, computed values, memo warmth, and explicit flush</h2>
        </div>
        <div class="toolbar">
          <ControlButton kind="primary" onClick={model.flushScheduler}>
            Flush Scheduler
          </ControlButton>
          <ControlButton onClick={model.runBatchScenario}>
            Run Batched Scenario
          </ControlButton>
          <ControlButton onClick={model.pingOwnership}>
            Ping Owned Model
          </ControlButton>
          <ControlButton onClick={model.cycleSelectedStatus}>
            Cycle Selected Status
          </ControlButton>
        </div>
      </div>

      <div class="info-grid">
        <article class="info-card">
          <span class="eyebrow">What changes now</span>
          <p>
            Rows, counters, and derived cards react immediately because they
            read signals and computed state directly.
          </p>
        </article>
        <article class="info-card">
          <span class="eyebrow">What waits</span>
          <p>
            Effect diagnostics and source-driven resources advance when you
            explicitly press <code>Flush Scheduler</code>.
          </p>
        </article>
      </div>
    </section>
  );
}
