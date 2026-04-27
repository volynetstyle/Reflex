/**
 * String utility functions for the Reflex Vite plugin
 */

/**
 * Removes query string and hash from module ID
 * @param id - The module ID
 * @returns The cleaned module ID
 */
export function stripQueryAndHash(id: string): string {
  return id.replace(/[?#].*$/, "");
}

/**
 * Checks if a file should be processed based on include/exclude patterns
 * @param id - The module ID
 * @param include - The include regex pattern
 * @param exclude - The exclude regex pattern
 * @returns Whether the file should be processed
 */
export function shouldProcessFile(
  id: string,
  include: RegExp,
  exclude: RegExp,
): boolean {
  const cleanId = stripQueryAndHash(id);
  return include.test(cleanId) && !exclude.test(cleanId);
}

/**
 * Checks if code contains potential reactive JSX expressions
 * @param code - The source code
 * @param reactiveProps - The list of reactive props
 * @returns Whether the code likely contains reactive JSX expressions
 */
export function hasPotentialReactiveJSXExpression(
  code: string,
  reactiveProps: readonly string[],
): boolean {
  const hasReactivePropExpression = reactiveProps.some((propName) =>
    new RegExp(`\\b${propName}\\s*=\\s*\\{`).test(code),
  );

  if (hasReactivePropExpression) {
    return true;
  }

  return code.includes("{") && /<[A-Za-z][\w.:$-]*(?:\s|>|\/)|<>/.test(code);
}

/**
 * Determines if a file is TypeScript based on its extension
 * @param id - The module ID
 * @returns Whether the file is TypeScript
 */
export function isTypeScriptFile(id: string): boolean {
  const cleanId = stripQueryAndHash(id);
  return /\.([cm]?ts)x$/i.test(cleanId);
}
