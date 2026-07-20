import {
  buildCounts,
  buildProgress,
  currentDuration,
  elapsedMilliseconds,
  formatDuration,
  type BuildState,
} from "./model";
import { paint, statusSymbol } from "./terminal";

export function Dashboard({ state }: { state: BuildState }) {
  const counts = buildCounts(state);
  const finished = counts.built + counts.cached;
  const labelWidth = Math.max(
    7,
    ...state.packages.map((packageState) => packageState.label.length),
  );
  const percent = buildProgress(state);

  return (
    <screen>
      <line>
        <text color="cyan">
          <text color="bold">@reflex-build</text>
        </text>{" "}
        <text color="dim">
          [{finished}/{state.packages.length}]
        </text>
      </line>
      <line />
      {state.packages.map((packageState) => {
        const duration = currentDuration(packageState);
        const suffix =
          packageState.state === "cached"
            ? paint("dim", "cached")
            : duration === undefined
              ? ""
              : paint("dim", formatDuration(duration));
        const packageLabel = packageState.label.padEnd(labelWidth);
        const styledLabel =
          packageState.state === "pending"
            ? paint("dim", packageLabel)
            : packageState.state === "building"
              ? paint("bold", packageLabel)
              : packageLabel;

        return (
          <>
            <line>
              {statusSymbol(packageState.state)} {styledLabel}
              {suffix ? `  ${suffix}` : ""}
            </line>
            {(packageState.state === "building" ||
              packageState.state === "failed") &&
              packageState.phases.map((phase) => {
                const phaseDuration = currentDuration(phase);
                const phaseSuffix =
                  phaseDuration === undefined
                    ? ""
                    : ` ${paint("dim", formatDuration(phaseDuration))}`;
                const phaseLabel =
                  phase.state === "pending"
                    ? paint("dim", phase.name)
                    : phase.state === "running"
                      ? paint("blue", phase.name)
                      : phase.name;
                return (
                  <line>
                    <indent />
                    {statusSymbol(phase.state)} {phaseLabel}
                    {phaseSuffix}
                  </line>
                );
              })}
          </>
        );
      })}
      <line />
      <line>{renderProgressBar(percent)}</line>
      <line />
      <line>Built: {counts.built}</line>
      <line>Cached: {counts.cached}</line>
      <line>Building: {counts.building}</line>
      <line>Pending: {counts.pending}</line>
      {counts.failed > 0 && <line>Failed: {counts.failed}</line>}
      <line />
      <line>
        <text color="dim">Total:</text>{" "}
        {formatDuration(elapsedMilliseconds(state.startedAt))}
      </line>
    </screen>
  );
}

function renderProgressBar(percent: number): string {
  const width = Math.max(12, Math.min(31, (process.stdout.columns ?? 80) - 10));
  const complete = Math.round((width * percent) / 100);
  return `${paint("green", "в”Ѓ".repeat(complete))}${paint("dim", "в”Ѓ".repeat(width - complete))} ${String(percent).padStart(3)}%`;
}
