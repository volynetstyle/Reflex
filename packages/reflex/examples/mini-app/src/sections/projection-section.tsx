/** @jsxImportSource @volynets/reflex-dom */

import type { DemoModel } from "../state/demo.app";

export function ProjectionSection(props: { model: DemoModel }) {
  const { model } = props;

  return (
    <article class="section-card">
      <div class="section-head">
        <div>
          <span class="eyebrow">Projection Store</span>
          <h2>Fine-grained nested reads without manual memo bookkeeping</h2>
        </div>
      </div>

      <div class="projection-grid">
        <article class="info-card">
          <span class="eyebrow">Selection Slot</span>
          <strong>{() => model.metrics.selection.id}</strong>
          <p>
            {() =>
              `${model.metrics.selection.owner} / ${model.metrics.selection.status}`}
          </p>
        </article>
        <article class="info-card">
          <span class="eyebrow">Visible / Open</span>
          <strong>
            {() =>
              `${model.metrics.totals.visible} / ${model.metrics.totals.open}`}
          </strong>
          <p>These values come from a store-style projection.</p>
        </article>
        <article class="info-card">
          <span class="eyebrow">Subtitle</span>
          <strong>{() => model.workspace.subtitle}</strong>
          <p>The page chrome itself is powered by a projection store.</p>
        </article>
      </div>
    </article>
  );
}
