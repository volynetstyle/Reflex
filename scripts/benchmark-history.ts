import {
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

type GateBenchmark = {
  id: string;
  comparison: { ratio: number };
  measurement: { status: "valid" | "unstable" | "insufficient-samples" };
  performance: { status: string };
};
type GateSummary = {
  schemaVersion: number;
  suite: string;
  scope: string;
  measuredAt: string;
  commitTimestamp: string;
  workflowRunId: string;
  commits: { head: string };
  environment: {
    cpu: string;
    node: string;
    runnerImage: string;
    runnerImageVersion: string;
  };
  benchmarks: GateBenchmark[];
};
type Snapshot = {
  commit: string;
  measuredAt: string;
  commitTimestamp: string;
  timestamp: number;
  workflowRunId: string;
  environment: GateSummary["environment"];
  values: Map<string, number>;
  excluded: string[];
};
type TrendPoint = {
  kind: "commit" | "day";
  key: string;
  label: string;
  measuredAt: string;
  commits: string[];
  values: Record<string, number>;
  excludedMeasurements: number;
};

function value(flag: string): string {
  const index = process.argv.indexOf(flag);
  const result = index === -1 ? undefined : process.argv[index + 1];
  if (!result) throw new Error(`Missing required argument ${flag}`);
  return result;
}

function findSummaries(root: string): string[] {
  const found: string[] = [];
  function visit(path: string): void {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) visit(child);
      else if (entry.name === "summary.json") found.push(child);
    }
  }
  if (statSync(root, { throwIfNoEntry: false })?.isDirectory()) visit(root);
  return found;
}

function dayKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) =>
    parts.find((item) => item.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function timeLabel(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function median(numbers: number[]): number {
  const sorted = [...numbers].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
}

function aggregateDay(day: string, snapshots: Snapshot[]): TrendPoint {
  const ids = new Set(
    snapshots.flatMap((snapshot) => [...snapshot.values.keys()]),
  );
  const values: Record<string, number> = {};
  for (const id of ids) {
    const samples = snapshots
      .map((snapshot) => snapshot.values.get(id))
      .filter((number): number is number => number !== undefined);
    if (samples.length > 0) values[id] = median(samples);
  }
  return {
    kind: "day",
    key: day,
    label: day.slice(5),
    measuredAt: snapshots.at(-1)!.measuredAt,
    commits: snapshots.map((snapshot) => snapshot.commit),
    values,
    excludedMeasurements: snapshots.reduce(
      (sum, snapshot) => sum + snapshot.excluded.length,
      0,
    ),
  };
}

function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function chart(
  suite: string,
  points: TrendPoint[],
  ids: string[],
  environmentChanged: boolean,
): string {
  const width = Math.max(1100, 500 + points.length * 92);
  const labelWidth = 430;
  const right = 35;
  const top = 78;
  const rowHeight = 84;
  const height = top + ids.length * rowHeight + 72;
  const plotWidth = width - labelWidth - right;
  const pointX = (index: number) =>
    labelWidth +
    (points.length === 1
      ? plotWidth / 2
      : (index * plotWidth) / (points.length - 1));
  const low = 0.75;
  const high = 1.25;
  const rows = ids
    .map((id, rowIndex) => {
      const rowTop = top + rowIndex * rowHeight;
      const y = (ratio: number) =>
        rowTop +
        64 -
        ((Math.max(low, Math.min(high, ratio)) - low) / (high - low)) * 54;
      const available = points
        .map((point, index) => ({ index, ratio: point.values[id] }))
        .filter(
          (item): item is { index: number; ratio: number } =>
            item.ratio !== undefined,
        );
      const polyline = available
        .map((item) => `${pointX(item.index)},${y(item.ratio)}`)
        .join(" ");
      const dots = available
        .map((item) => {
          const point = points[item.index]!;
          const color = point.kind === "commit" ? "#0969da" : "#8250df";
          return `<circle cx="${pointX(item.index)}" cy="${y(item.ratio)}" r="4" fill="${color}"><title>${escapeXml(point.label)}: ${(item.ratio * 100).toFixed(1)}% of paired baseline (${point.commits.length} commit${point.commits.length === 1 ? "" : "s"})</title></circle>`;
        })
        .join("");
      const label = id.length > 58 ? `…${id.slice(-57)}` : id;
      return `<text x="10" y="${rowTop + 37}" class="bench">${escapeXml(label)}</text><line x1="${labelWidth}" y1="${y(1)}" x2="${width - right}" y2="${y(1)}" stroke="#d0d7de"/><line x1="${labelWidth}" y1="${y(1.2)}" x2="${width - right}" y2="${y(1.2)}" stroke="#d1242f" stroke-dasharray="4 4"/><polyline points="${polyline}" fill="none" stroke="#57606a" stroke-width="2"/>${dots}`;
    })
    .join("");
  const labels = points
    .map(
      (point, index) =>
        `<text x="${pointX(index)}" y="${height - 35}" text-anchor="middle" class="axis" fill="${point.kind === "commit" ? "#0969da" : "#8250df"}">${escapeXml(point.label)}</text>`,
    )
    .join("");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    '<rect width="100%" height="100%" fill="#fff"/><style>.title{font:600 20px system-ui}.meta,.axis{font:12px system-ui;fill:#57606a}.bench{font:11px ui-monospace,monospace;fill:#24292f}</style>',
    `<text x="10" y="28" class="title">${escapeXml(suite)} normalized performance history</text>`,
    `<text x="10" y="50" class="meta">Fixed 75–125% scale · 100% = paired baseline · purple = previous-day median · blue = commits today · invalid measurements excluded${environmentChanged ? " · ⚠ runner fingerprint changed" : ""}</text>`,
    rows,
    labels,
    "</svg>",
  ].join("");
}

const suite = value("--suite");
const scope = value("--scope");
const currentPath = value("--current");
const historyDir = value("--history-dir");
const jsonPath = value("--json");
const chartPath = value("--chart");
const timeZone = value("--timezone");
const current = JSON.parse(readFileSync(currentPath, "utf8")) as GateSummary;
if (current.schemaVersion !== 3)
  throw new Error(
    `History requires quality summary schemaVersion 3, received ${current.schemaVersion}`,
  );
const byCommit = new Map<string, Snapshot>();

for (const path of [...findSummaries(historyDir), currentPath]) {
  const summary = JSON.parse(readFileSync(path, "utf8")) as GateSummary;
  if (
    summary.schemaVersion !== 3 ||
    summary.suite !== suite ||
    summary.scope !== scope
  )
    continue;
  const timestamp = Date.parse(summary.measuredAt);
  if (!Number.isFinite(timestamp)) continue;
  const valid = summary.benchmarks.filter(
    (benchmark) => benchmark.measurement.status === "valid",
  );
  const snapshot: Snapshot = {
    commit: summary.commits.head,
    measuredAt: summary.measuredAt,
    commitTimestamp: summary.commitTimestamp,
    timestamp,
    workflowRunId: summary.workflowRunId,
    environment: summary.environment,
    values: new Map(
      valid.map((benchmark) => [benchmark.id, benchmark.comparison.ratio]),
    ),
    excluded: summary.benchmarks
      .filter((benchmark) => benchmark.measurement.status !== "valid")
      .map((benchmark) => benchmark.id),
  };
  const existing = byCommit.get(snapshot.commit);
  if (!existing || existing.timestamp < timestamp)
    byCommit.set(snapshot.commit, snapshot);
}

const snapshots = [...byCommit.values()].sort(
  (left, right) => left.timestamp - right.timestamp,
);
const today = dayKey(new Date(current.measuredAt), timeZone);
const previousDays = new Map<string, Snapshot[]>();
const todaySnapshots: Snapshot[] = [];
for (const snapshot of snapshots) {
  const day = dayKey(new Date(snapshot.measuredAt), timeZone);
  if (day === today) todaySnapshots.push(snapshot);
  else previousDays.set(day, [...(previousDays.get(day) ?? []), snapshot]);
}
const points: TrendPoint[] = [
  ...[...previousDays].map(([day, items]) => aggregateDay(day, items)),
  ...todaySnapshots.map((snapshot) => ({
    kind: "commit" as const,
    key: snapshot.commit,
    label: `${timeLabel(new Date(snapshot.measuredAt), timeZone)} ${snapshot.commit.slice(0, 7)}`,
    measuredAt: snapshot.measuredAt,
    commits: [snapshot.commit],
    values: Object.fromEntries(snapshot.values),
    excludedMeasurements: snapshot.excluded.length,
  })),
];
const ids = [
  ...new Set(points.flatMap((point) => Object.keys(point.values))),
].sort();
const environments = [
  ...new Set(
    snapshots.map(
      (snapshot) =>
        `${snapshot.environment.cpu}|${snapshot.environment.node}|${snapshot.environment.runnerImage}|${snapshot.environment.runnerImageVersion}`,
    ),
  ),
];
const output = {
  schemaVersion: 2,
  suite,
  scope,
  timeZone,
  generatedAt: new Date().toISOString(),
  metric: "paired head/base ratio",
  policy: {
    currentDay: "one point per commit",
    previousDays: "median per day",
    invalidMeasurements: "excluded",
  },
  environmentChanged: environments.length > 1,
  environmentFingerprints: environments,
  points,
};

mkdirSync(dirname(jsonPath), { recursive: true });
mkdirSync(dirname(chartPath), { recursive: true });
writeFileSync(jsonPath, `${JSON.stringify(output, null, 2)}\n`);
writeFileSync(chartPath, chart(suite, points, ids, environments.length > 1));
console.log(
  `Built ${suite} normalized history: ${snapshots.length} commits -> ${points.length} points; ${environments.length} environment fingerprint(s)`,
);
