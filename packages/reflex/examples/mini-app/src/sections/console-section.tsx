/** @jsxImportSource @volynets/reflex-dom */

import { For } from "@volynets/reflex-dom";
import type { DemoModel } from "../state/demo.app";

export function ConsoleSection(props: { model: DemoModel }) {
  const { model } = props;

  return (
    <section class="section-card">
      <div class="section-head">
        <div>
          <span class="eyebrow">Event Console</span>
          <h2>event, map, filter, merge, hold, scan, and subscribeOnce</h2>
        </div>
      </div>

      <div class="console-grid">
        <article class="console-summary">
          <span class="eyebrow">Latest Label</span>
          <strong>{model.latestLabel}</strong>
          <p>{model.firstSystemTrace}</p>
        </article>

        <div class="console-list">
          <For each={model.activityFeed} by={(entry) => entry.id}>
            {(entry) => (
              <article class={() => `log-entry tone-${entry.tone}`}>
                <div class="log-topline">
                  <strong>{entry.label}</strong>
                  <span>{entry.timestamp}</span>
                </div>
                <p>{entry.detail}</p>
              </article>
            )}
          </For>
        </div>
      </div>
    </section>
  );
}
