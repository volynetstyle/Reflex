/**
 * JSX module parsing and printing utilities for the Reflex Vite plugin
 */

import { parseSync, printSync } from "@swc/core";
import type { Module, Program } from "@swc/core";
import { stripQueryAndHash } from "./string-utils";
import type { ReflexDOMTransformResult } from "./types";

/**
 * Parses a JSX/TSX module
 * @param code - The source code
 * @param id - The module ID
 * @returns The parsed module
 */
export function parseJSXModule(code: string, id: string): Module {
  const cleanId = stripQueryAndHash(id);
  const isTypeScript = /\.([cm]?ts)x$/i.test(cleanId);

  return parseSync(code, {
    syntax: isTypeScript ? "typescript" : "ecmascript",
    tsx: isTypeScript,
    jsx: !isTypeScript,
    target: "es2022",
  });
}

/**
 * Prints a program back to code
 * @param program - The program to print
 * @param id - The module ID
 * @returns The transform result with code and source map
 */
export function printProgram(
  program: Program,
  id: string,
): ReflexDOMTransformResult {
  const output = printSync(program, {
    filename: stripQueryAndHash(id),
    sourceMaps: true,
  });

  return {
    code: output.code,
    map: output.map ?? null,
  };
}
