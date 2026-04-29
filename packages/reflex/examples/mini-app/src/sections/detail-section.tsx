/** @jsxImportSource @volynets/reflex-dom */

import { Show } from "@volynets/reflex-dom";
import { ControlButton, StatusPill } from "../components/ui";
import type { DemoModel } from "../state/demo.app";

export function DetailSection(props: { model: DemoModel }) {
  const { model } = props;

  return (
    <article class="section-card detail-card">
      <div class="section-head">
        <div>
          <span class="eyebrow">Optimistic Editor</span>
          <h2>Transition-backed title edits</h2>
        </div>
        <ControlButton kind="primary" onClick={model.saveSelectedTitle}>
          Save With Transition
        </ControlButton>
      </div>

      <Show
        when={model.selectedTask}
        fallback={
          <p class="empty-state">
            Select a task from the board to inspect it here.
          </p>
        }
      >
        {() => {
          const current = model.selectedTask();
          if (!current) return null;

          return (
            <div class="detail-stack">
              <div class="detail-banner">
                <div>
                  <span class="eyebrow">Live Accessor</span>
                  <h3>{model.optimisticTitle}</h3>
                </div>
                <div class="meta-stack">
                  <StatusPill label={current.status} />
                  <span class="status-pill tone-info">{current.owner}</span>
                </div>
              </div>

              <label class="field">
                <span>Edit selected title</span>
                <input
                  value={model.editorValue}
                  onInput={(event) =>
                    model.setEditorValue(
                      (event.currentTarget as HTMLInputElement).value,
                    )
                  }
                />
              </label>

              <p class="detail-note">
                The optimistic title updates immediately, then settles when
                the simulated server write completes.
              </p>
            </div>
          );
        }}
      </Show>
    </article>
  );
}
