/** @jsxImportSource @volynets/reflex-dom */

import { For, Show } from "@volynets/reflex-dom";
import { StatusPill } from "../components/ui";
import type { DemoModel } from "../state/demo.app";

export function BoardSection(props: { model: DemoModel }) {
  const { model } = props;

  return (
    <article class="section-card board-card">
      <div class="section-head">
        <div>
          <span class="eyebrow">Task Board</span>
          <h2>Keyed selection and projection-aware rows</h2>
        </div>
        <div class="toolbar compact">
          <button
            type="button"
            class={() => `chip ${model.filterMode() === "all" ? "chip-active" : ""}`}
            onClick={() => model.setFilterMode("all")}
          >
            All
          </button>
          <button
            type="button"
            class={() => `chip ${model.filterMode() === "focus" ? "chip-active" : ""}`}
            onClick={() => model.setFilterMode("focus")}
          >
            Focus
          </button>
          <button
            type="button"
            class={() => `chip ${model.filterMode() === "done" ? "chip-active" : ""}`}
            onClick={() => model.setFilterMode("done")}
          >
            Done
          </button>
        </div>
      </div>

      <label class="field">
        <span>Search by title, owner, or tag</span>
        <input
          value={model.searchQuery}
          placeholder="Type sync, Mila, projection..."
          onInput={(event) =>
            model.setSearchQuery((event.currentTarget as HTMLInputElement).value)
          }
        />
      </label>

      <div class="task-list">
        <For each={model.tasks} by={(task) => task.id}>
          {(task) => (
            <button
              type="button"
              class={() =>
                `task-row ${model.isSelected(task.id) ? "task-row-selected" : ""}`
              }
              onClick={() => model.selectTask(task.id)}
            >
              <div class="task-main">
                <div class="task-topline">
                  <strong>{task.id}</strong>
                  <StatusPill label={task.status} />
                </div>
                <h3>{task.title}</h3>
                <p>{task.summary}</p>
                <small class="task-meta">
                  {() =>
                    model.spotlightMetaById(task.id) ||
                    `${task.owner} / ${task.points} pts`}
                </small>
              </div>
              <div class="task-aside">
                <span class="task-owner">{task.owner}</span>
                <span class="task-risk">{task.risk} risk</span>
                <Show when={() => Boolean(model.spotlightTitleById(task.id))}>
                  <span class="task-spotlight">Spotlighted</span>
                </Show>
              </div>
            </button>
          )}
        </For>
      </div>
    </article>
  );
}
