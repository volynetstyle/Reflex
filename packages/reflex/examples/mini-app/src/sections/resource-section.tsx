/** @jsxImportSource @volynets/reflex-dom */

import { For, Show, Switch } from "@volynets/reflex-dom";
import { ControlButton, StatusPill } from "../components/ui";
import type { DemoModel } from "../state/demo.app";

export function ResourceSection(props: { model: DemoModel }) {
  const { model } = props;

  return (
    <article class="section-card">
      <div class="section-head">
        <div>
          <span class="eyebrow">Async Resource</span>
          <h2>Source-driven fetch state with stale request protection</h2>
        </div>
        <ControlButton onClick={model.requestInsightRefresh}>
          Queue Refetch
        </ControlButton>
      </div>

      <div class="resource-headline">
        <StatusPill label={() => model.insightResource.status()} />
        <span class="resource-pending">
          {() =>
            model.isPendingInsights()
              ? "Loader is currently pending."
              : "No in-flight request right now."
          }
        </span>
      </div>

      <Switch
        value={() => model.insightResource.status()}
        cases={[
          {
            when: "idle",
            children: (
              <p class="empty-state">
                Flush the scheduler to kick off the current source request.
              </p>
            ),
          },
          {
            when: "pending",
            children: (
              <p class="empty-state">
                Pending. The previous resolved value stays visible while the
                next request is in flight.
              </p>
            ),
          },
          {
            when: "rejected",
            children: (
              <p class="empty-state">
                {() =>
                  String(
                    model.insightResource.error() ?? "Unknown resource failure.",
                  )
                }
              </p>
            ),
          },
        ]}
        fallback={
          <Show when={() => Boolean(model.insightResource.value())}>
            {() => {
              const insight = model.insightResource.value();
              if (!insight) return null;

              return (
                <div class="insight-panel">
                  <h3>{insight.headline}</h3>
                  <p>Latency: {insight.latencyMs} ms</p>
                  <ul class="list">
                    <For each={insight.checklist} by={(item) => item}>
                      {(item) => <li>{item}</li>}
                    </For>
                  </ul>
                  <div class="note-grid">
                    <For each={insight.notes} by={(item) => item}>
                      {(note) => <p class="info-card">{note}</p>}
                    </For>
                  </div>
                </div>
              );
            }}
          </Show>
        }
      />
    </article>
  );
}
