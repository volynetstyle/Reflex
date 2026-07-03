import { REGISTER_HELPERS } from "./rules.ts";

export function validateRegisterSource(code: string, id: string): void {
  for (const [name, arity] of REGISTER_HELPERS) {
    const declaration = new RegExp(
      `export\\s+function\\s+${name}\\s*\\(([^)]*)\\)`,
      "g",
    );
    const matches = [...code.matchAll(declaration)];

    if (matches.length !== 1) {
      throw new Error(
        `[inline-kernel-registers] ${id}: expected exactly one ${name} declaration`,
      );
    }

    const parameters = matches[0]?.[1]?.trim();
    const actualArity = parameters === "" ? 0 : parameters?.split(",").length;
    if (actualArity !== arity) {
      throw new Error(
        `[inline-kernel-registers] ${id}: ${name} must have arity ${arity}, got ${actualArity}`,
      );
    }
  }
}

export function validateRegisterCallSites(code: string): void {
  for (const [name] of REGISTER_HELPERS) {
    const unresolvedCall = new RegExp(`(?<!function\\s)\\b${name}\\s*\\(`);
    const match = unresolvedCall.exec(code);
    if (match !== null) {
      const start = Math.max(0, match.index - 80);
      const end = Math.min(code.length, match.index + 160);
      throw new Error(
        `[inline-kernel-registers] unsupported or unresolved call to ${name}: ${code.slice(start, end)}`,
      );
    }
  }
}
