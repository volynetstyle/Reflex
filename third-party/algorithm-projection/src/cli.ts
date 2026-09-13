#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { analyzeFile } from "./extract.js";
import { createInstrumentationPlan } from "./plan.js";

export interface CliIo {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

interface CliOptions {
  file: string;
  functionName: string;
  project?: string;
  output?: string;
  compact: boolean;
  plan: boolean;
}

const HELP = `Usage: algorithm-projection <file> <function> [options]

Project a TypeScript function into Algorithm IR.

Options:
  -p, --project <tsconfig>  TypeScript project used for type resolution
  -o, --output <file>      Write JSON to a file instead of stdout
      --compact            Emit compact JSON
      --plan               Emit an instrumentation plan instead of Algorithm IR
  -h, --help               Show this help
  -v, --version            Show the package version`;

export function runCli(
  args: string[],
  io: CliIo = {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  },
): number {
  try {
    if (args.includes("--help") || args.includes("-h")) {
      io.stdout(`${HELP}\n`);
      return 0;
    }
    if (args.includes("--version") || args.includes("-v")) {
      io.stdout("0.1.0\n");
      return 0;
    }
    const options = parseArgs(args);
    const projection = analyzeFile(
      resolve(options.file),
      options.functionName,
      {
        ...(options.project ? { tsconfig: resolve(options.project) } : {}),
      },
    );
    const output = options.plan
      ? createInstrumentationPlan(projection)
      : projection;
    const json = JSON.stringify(output, null, options.compact ? 0 : 2);
    if (options.output)
      writeFileSync(resolve(options.output), `${json}\n`, "utf8");
    else io.stdout(`${json}\n`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.stderr(`algorithm-projection: ${message}\nRun with --help for usage.\n`);
    return 1;
  }
}

function parseArgs(args: string[]): CliOptions {
  const positional: string[] = [];
  let project: string | undefined;
  let output: string | undefined;
  let compact = false;
  let plan = false;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]!;
    if (argument === "--project" || argument === "-p")
      project = readValue(args, ++index, argument);
    else if (argument === "--output" || argument === "-o")
      output = readValue(args, ++index, argument);
    else if (argument === "--compact") compact = true;
    else if (argument === "--plan") plan = true;
    else if (argument.startsWith("-"))
      throw new Error(`Unknown option ${argument}`);
    else positional.push(argument);
  }
  if (positional.length !== 2)
    throw new Error("Expected <file> and <function>");
  return {
    file: positional[0]!,
    functionName: positional[1]!,
    ...(project ? { project } : {}),
    ...(output ? { output } : {}),
    compact,
    plan,
  };
}

function readValue(args: string[], index: number, option: string): string {
  const value = args[index];
  if (!value || value.startsWith("-"))
    throw new Error(`Missing value for ${option}`);
  return value;
}

const isEntrypoint =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isEntrypoint) process.exitCode = runCli(process.argv.slice(2));
