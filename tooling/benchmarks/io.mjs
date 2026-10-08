import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value !== null && typeof value === "object") return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Non-finite metadata number");
  if (value === undefined) throw new Error("Undefined metadata value");
  return JSON.stringify(value);
}
export const sha256 = value => createHash("sha256").update(value).digest("hex");
export const fingerprint = value => sha256(canonical(value));
export const runId = () => new Date().toISOString().replaceAll(":", "-") + "-" + randomUUID();
export function readJson(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch (error) { throw new Error("Cannot read JSON " + path + ": " + error.message, { cause: error }); }
}
// Immutable evidence: choose another run ID instead of overwriting any result.
export function writeImmutable(path, value) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, value, { flag: "wx" }); }
export const writeJson = (path, value) => writeImmutable(path, JSON.stringify(value, null, 2) + "\n");
export function options(argv, values, booleans = []) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--") continue;
    if (booleans.includes(flag)) { out[flag.slice(2)] = true; continue; }
    if (!values.includes(flag)) throw new Error("Unknown argument " + flag);
    const value = argv[++i];
    if (!value || value.startsWith("--")) throw new Error("Missing value for " + flag);
    if (Object.hasOwn(out, flag.slice(2))) throw new Error("Duplicate argument " + flag);
    out[flag.slice(2)] = value;
  }
  return out;
}
export function required(opts, name) { if (!opts[name]) throw new Error("Missing --" + name); return opts[name]; }
export function numberOption(opts, name, fallback, min = 0) { const value = Number(opts[name] ?? fallback); if (!Number.isFinite(value) || value < min) throw new Error("Invalid --" + name); return value; }
export const escapeXml = text => String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
