/**
 * Indicates whether the DOM is available.
 * This can be useful for determining if certain browser APIs are accessible.
 */
export const IS_DOM_AVAILABLE = typeof globalThis.document !== "undefined";
