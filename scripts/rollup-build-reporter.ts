import type { Plugin, RollupLog } from "rollup";

const supportsColor =
  process.env.NO_COLOR === undefined &&
  process.env.TERM !== "dumb" &&
  process.stdout.isTTY === true;

const color = {
  dim: (value: string) => paint("2", value),
  green: (value: string) => paint("32", value),
  cyan: (value: string) => paint("36", value),
  yellow: (value: string) => paint("33", value),
  red: (value: string) => paint("31", value),
  bold: (value: string) => paint("1", value),
};

function paint(code: string, value: string): string {
  if (!supportsColor) return value;
  return `\x1b[${code}m${value}\x1b[0m`;
}

function formatKb(bytes: number): string {
  return `${(bytes / 1024).toFixed(2)} KB`;
}

function formatMs(startedAt: bigint): string {
  const elapsed = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
  return `${elapsed.toFixed(0)} ms`;
}

function bundleSize(bundle: Parameters<Required<Plugin>["writeBundle"]>[1]): {
  modules: number;
  size: number;
} {
  let size = 0;
  let modules = 0;

  for (const chunk of Object.values(bundle)) {
    if ("code" in chunk) {
      size += chunk.code.length;
      modules += 1;
    }
  }

  return { modules, size };
}

export function createBuildReporter(
  packageName: string,
  targetName: string,
): Plugin {
  let startedAt = process.hrtime.bigint();

  return {
    name: "build-reporter",
    buildStart() {
      startedAt = process.hrtime.bigint();
      console.log("");
      console.log(
        `${color.cyan("|")} ${color.bold(packageName)} ${color.dim("build")} ${color.green(targetName)}`,
      );
    },
    writeBundle(_, bundle) {
      const stats = bundleSize(bundle);

      console.log(
        `${color.cyan("|")} modules ${color.green(String(stats.modules))}`,
      );
      console.log(`${color.cyan("|")} size    ${color.green(formatKb(stats.size))}`);
      console.log(`${color.cyan("L")} done    ${color.dim(formatMs(startedAt))}`);
    },
  };
}

export function reportRollupWarning(log: RollupLog): void {
  const code = log.code ? ` ${log.code}` : "";
  const message = log.message.replace(/\s+/g, " ").trim();

  console.log("");
  console.log(`${color.yellow("!")} ${color.bold("warning")}${color.dim(code)}`);
  console.log(`${color.yellow("|")} ${message}`);

  if (log.id) {
    console.log(`${color.yellow("L")} ${color.dim(log.id)}`);
  }
}
