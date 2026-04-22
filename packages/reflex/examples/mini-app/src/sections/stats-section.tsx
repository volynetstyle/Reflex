/** @jsxImportSource @volynets/reflex-dom */

import { KeyStat } from "../components/ui";
import type { DemoModel } from "../state/demo.app";

export function StatsSection(props: { model: DemoModel }) {
  const { model } = props;

  return (
    <section class="stats-grid">
      <KeyStat
        eyebrow="Visible Tasks"
        value={() => model.metrics.totals.visible}
        detail={() => `Open: ${model.metrics.totals.open}`}
      />
      <KeyStat
        eyebrow="Throughput"
        value={() => model.metrics.totals.throughput}
        detail={() => `Flush cycles: ${model.flushCount()}`}
      />
      <KeyStat
        eyebrow="Command Events"
        value={() => model.activityCount()}
        detail={model.latestLabel}
      />
      <KeyStat
        eyebrow="Heartbeat"
        value={() => model.heartbeat()}
        detail={() =>
          model.isModelInstance
            ? "Model is live and owns its timer."
            : "Model missing."
        }
      />
    </section>
  );
}
