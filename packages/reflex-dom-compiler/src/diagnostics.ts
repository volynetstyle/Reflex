/** How a host element region is built after compilation. */
export type RegionStrategy = "template" | "native" | "runtime";

export interface RegionReport {
  /** 1-based, in source order. */
  readonly id: number;
  readonly tag: string;
  readonly line: number | null;
  readonly column: number | null;
  /** No captured values or runtime bindings are needed. */
  readonly static: boolean;
  /** Dynamic/opaque children mounted inline or at template markers. */
  readonly holes: number;
  /** Props delegated to runtime binding by an ordered native region. */
  readonly bindings?: number;
  readonly strategy: RegionStrategy;
  /** Generated elements and texts; opaque children/holes are excluded. */
  readonly nodes: number;
  /** Why the region is not compiled, or why a weaker strategy was chosen. */
  readonly reason: string | null;
}

export interface CompilerReport {
  readonly filename: string | null;
  /** True when a pragma or the `enabled` option switched the compiler off. */
  readonly disabled: boolean;
  readonly regions: readonly RegionReport[];
}

export interface ReportSummary {
  readonly regions: number;
  readonly template: number;
  readonly native: number;
  readonly runtime: number;
  /** Compiled DOM nodes over all nodes of static regions. */
  readonly staticCoverage: number;
}

export function summarizeReport(report: CompilerReport): ReportSummary {
  let template = 0;
  let native = 0;
  let runtime = 0;
  let compiledNodes = 0;
  let staticNodes = 0;

  for (const region of report.regions) {
    if (region.strategy === "template") template++;
    else if (region.strategy === "native") native++;
    else runtime++;

    if (region.static || region.holes > 0 || (region.bindings ?? 0) > 0) {
      staticNodes += region.nodes;
      if (region.strategy !== "runtime") compiledNodes += region.nodes;
    }
  }

  return {
    regions: report.regions.length,
    template,
    native,
    runtime,
    staticCoverage: staticNodes === 0 ? 0 : compiledNodes / staticNodes,
  };
}

/** Human-readable form of a report, one block per region. */
export function formatReport(report: CompilerReport): string {
  const lines = [`DOM compiler report${report.filename ? `: ${report.filename}` : ""}`];

  if (report.disabled) {
    lines.push("", "  Disabled for this file.");
    return lines.join("\n");
  }

  for (const region of report.regions) {
    const at = region.line === null ? "" : ` (${region.line}:${region.column})`;
    lines.push(
      "",
      `Region #${region.id} <${region.tag}>${at}`,
      `  Static: ${region.static ? "yes" : "no"}`,
      `  Strategy: ${region.strategy}`,
    );
    if (region.static || region.holes > 0 || region.bindings) lines.push(`  Nodes: ${region.nodes}`);
    if (region.holes > 0) lines.push(`  Dynamic children: ${region.holes}`);
    if (region.bindings) lines.push(`  Runtime props: ${region.bindings}`);
    if (region.reason !== null) lines.push(`  Reason: ${region.reason}`);
  }

  const summary = summarizeReport(report);
  lines.push(
    "",
    `Summary: ${summary.regions} regions, ${summary.template} template, ` +
      `${summary.native} native, ${summary.runtime} runtime; ` +
      `static node coverage ${(summary.staticCoverage * 100).toFixed(0)}%`,
  );

  return lines.join("\n");
}
