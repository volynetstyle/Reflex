/**
 * Returns true if running in any real browser context.
 * (window + document + createElement must exist)
 */
export const IS_BROWSER =
  typeof globalThis.window !== "undefined" &&
  typeof globalThis.document !== "undefined" &&
  typeof globalThis.document.createElement === "function";

/**
 * Returns true if DOM-like APIs exist.
 * JSDOM → true
 * Real browser → true
 * Node/Bun/SSR → false
 */
export const IS_DOM_AVAILABLE = IS_BROWSER;

/**
 * Returns true for server-side environments (Node, Bun, Deno).
 * Works reliably for SSR setups.
 */
export const IS_SERVER = !IS_BROWSER;

/**
 * Detects JSDOM specifically.
 * JSDOM sets navigator.userAgent containing "jsdom".
 * Safe: navigator may not exist → optional checks.
 */
export const IS_JSDOM =
  IS_DOM_AVAILABLE &&
  !!(
    globalThis.navigator &&
    typeof globalThis.navigator.userAgent === "string" &&
    globalThis.navigator.userAgent.includes("jsdom")
  );
