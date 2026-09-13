import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import ts from "typescript";
import { findFunction, locationOf } from "./ast.js";
import { buildCfg } from "./cfg.js";
import { extractFacts } from "./effects.js";
import type {
  AlgorithmProjection,
  AnalyzeFileOptions,
  AnalyzeSourceOptions,
} from "./model.js";
import { extractLinkedTraversals } from "./structures.js";
const defaults: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  strict: true,
  skipLibCheck: true,
};
export function analyzeSource(
  code: string,
  functionName: string,
  options: AnalyzeSourceOptions = {},
): AlgorithmProjection {
  const file = resolve(options.fileName ?? "projection-input.ts"),
    compilerOptions = { ...defaults, ...options.compilerOptions },
    host = ts.createCompilerHost(compilerOptions, true),
    get = host.getSourceFile.bind(host);
  host.getSourceFile = (f, v, e, n) =>
    resolve(f) === file
      ? ts.createSourceFile(file, code, v, true, ts.ScriptKind.TS)
      : get(f, v, e, n);
  host.readFile = (f) => (resolve(f) === file ? code : ts.sys.readFile(f));
  host.fileExists = (f) => resolve(f) === file || ts.sys.fileExists(f);
  return project(
    ts.createProgram([file], compilerOptions, host),
    file,
    code,
    functionName,
  );
}
export function analyzeFile(
  filePath: string,
  functionName: string,
  options: AnalyzeFileOptions = {},
): AlgorithmProjection {
  const file = resolve(filePath),
    code = readFileSync(file, "utf8");
  let compilerOptions = defaults,
    roots = [file];
  if (options.tsconfig) {
    const path = resolve(options.tsconfig),
      loaded = ts.readConfigFile(path, ts.sys.readFile);
    if (loaded.error) throw new Error(format(loaded.error));
    const parsed = ts.parseJsonConfigFileContent(
      loaded.config,
      ts.sys,
      dirname(path),
      undefined,
      path,
    );
    if (parsed.errors.length)
      throw new Error(parsed.errors.map(format).join("\n"));
    compilerOptions = parsed.options;
    roots = parsed.fileNames.includes(file)
      ? parsed.fileNames
      : [...parsed.fileNames, file];
  }
  return project(
    ts.createProgram(roots, compilerOptions),
    file,
    code,
    functionName,
  );
}
function project(
  program: ts.Program,
  file: string,
  code: string,
  name: string,
): AlgorithmProjection {
  const source = program.getSourceFile(file);
  if (!source) throw new Error(`TypeScript did not load ${file}`);
  const fn = findFunction(source, name),
    checker = program.getTypeChecker(),
    facts = extractFacts(fn, source, checker);
  return {
    function: name,
    source: locationOf(fn, source),
    cfg: buildCfg(code, file, name),
    loops: facts.loops,
    branches: facts.branches,
    effects: { reads: facts.reads, writes: facts.writes, calls: facts.calls },
    stateTransitions: facts.stateTransitions,
    structures: {
      linkedTraversals: extractLinkedTraversals(fn, source, checker),
      stackCandidates: facts.stackCandidates,
    },
  };
}
const format = (d: ts.Diagnostic): string =>
  ts.flattenDiagnosticMessageText(d.messageText, "\n");
