// Declarative command-line options. A command declares its options once; the
// same table parses argv and renders `--help`, so the two cannot drift.
//
//   { name: { type: "string" | "number" | "boolean" | "list" | "duration",
//             default, describe, repeat } }
//
// `list` takes comma-separated values (`--families default,hub`); `repeat`
// collects every occurrence of a string option (`--mutate a --mutate b`);
// `duration` takes 90, 90s, 5m or 1h and yields milliseconds. Booleans accept
// `--flag` and `--no-flag`. Unknown options are errors, never ignored.

export class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "UsageError";
  }
}

export function parseDuration(text) {
  const match = /^(\d+(?:\.\d+)?)(ms|s|m|h)?$/.exec(String(text).trim());
  if (match === null) throw new UsageError(`invalid duration "${text}"`);
  const unit = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000 }[match[2] ?? "s"];
  const ms = Math.round(Number(match[1]) * unit);
  if (!Number.isSafeInteger(ms) || ms <= 0)
    throw new UsageError(`duration must be positive and finite, got "${text}"`);
  return ms;
}

function convert(name, type, raw) {
  switch (type) {
    case "number": {
      const value = Number(raw);
      if (!Number.isFinite(value))
        throw new UsageError(`--${name} expects a number, got "${raw}"`);
      return value;
    }
    case "list":
      return String(raw)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    case "duration":
      return parseDuration(raw);
    default:
      return raw;
  }
}

export function parseArgs(argv, options = {}) {
  const values = {};
  const positionals = [];
  for (const [name, option] of Object.entries(options)) {
    if (option.repeat) values[name] = [...(option.default ?? [])];
    else if (option.default !== undefined) values[name] = option.default;
    else if (option.type === "boolean") values[name] = false;
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    const eq = arg.indexOf("=");
    const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
    let inline = eq === -1 ? undefined : arg.slice(eq + 1);
    const option = options[name];
    if (option === undefined && name.startsWith("no-")) {
      const positive = options[name.slice(3)];
      if (positive?.type === "boolean" && inline === undefined) {
        values[name.slice(3)] = false;
        continue;
      }
    }
    if (option === undefined)
      throw new UsageError(
        `unknown option --${name}` +
          (Object.keys(options).length
            ? ` (known: ${Object.keys(options)
                .map((key) => `--${key}`)
                .join(", ")})`
            : ""),
      );
    if (option.type === "boolean") {
      if (inline !== undefined && inline !== "true" && inline !== "false")
        throw new UsageError(
          `--${name} expects true or false, got "${inline}"`,
        );
      values[name] = inline === undefined ? true : inline !== "false";
      continue;
    }
    if (inline === undefined) {
      inline = argv[++i];
      if (inline === undefined || inline.startsWith("--"))
        throw new UsageError(`--${name} requires a value`);
    }
    const value = convert(name, option.type, inline);
    if (
      option.type === "number" &&
      (!Number.isSafeInteger(value) || value < (option.min ?? 0))
    )
      throw new UsageError(
        `--${name} expects an integer >= ${option.min ?? 0}`,
      );
    if (option.type === "list" && value.length === 0)
      throw new UsageError(`--${name} requires at least one value`);
    if (option.repeat) values[name].push(value);
    else values[name] = value;
  }
  return { values, positionals };
}

export function renderOptions(options = {}) {
  const rows = Object.entries(options).map(([name, option]) => {
    const value =
      option.type === "boolean"
        ? ""
        : ` <${option.placeholder ?? option.type ?? "value"}>`;
    const fallback =
      option.default === undefined ||
      option.default === false ||
      (Array.isArray(option.default) && option.default.length === 0)
        ? ""
        : ` (default: ${Array.isArray(option.default) ? option.default.join(",") : option.default})`;
    return [`  --${name}${value}`, `${option.describe ?? ""}${fallback}`];
  });
  const width = Math.max(0, ...rows.map(([left]) => left.length)) + 2;
  return rows.map(([left, right]) => left.padEnd(width) + right).join("\n");
}
