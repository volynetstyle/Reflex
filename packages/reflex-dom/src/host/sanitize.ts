const BLOCKED_URL = "about:blank";

function isC0ControlOrSpace(code: number): boolean {
  return code <= 0x20;
}

function isProtocolGap(code: number): boolean {
  return code === 0x09 || code === 0x0a || code === 0x0d;
}

function toAsciiLower(code: number): number {
  return code >= 0x41 && code <= 0x5a ? code + 0x20 : code;
}

// Blocked scheme tokens.
// Defense-in-depth: javascript: is the primary XSS vector via URL
// attributes (href/src/action/formaction/...). vbscript: is a legacy
// IE-only executable scheme still resolved by some embedders
// (Electron/webviews, old WebView controls), so it is blocked too.
const JAVASCRIPT_PROTOCOL = [0x6a, 0x61, 0x76, 0x61, 0x73, 0x63, 0x72, 0x69, 0x70, 0x74, 0x3a] as const; // "javascript:"
const VBSCRIPT_PROTOCOL = [0x76, 0x62, 0x73, 0x63, 0x72, 0x69, 0x70, 0x74, 0x3a] as const; // "vbscript:"

const BLOCKED_PROTOCOLS: readonly (readonly number[])[] = [
  JAVASCRIPT_PROTOCOL,
  VBSCRIPT_PROTOCOL,
];

function matchesProtocol(url: string, start: number, protocol: readonly number[]): boolean {
  const len = url.length;
  const protoLen = protocol.length;
  let i = start;
  let j = 0;

  while (j < protoLen && i < len) {
    const code = url.charCodeAt(i);

    if (isProtocolGap(code)) {
      i++;
      continue;
    }

    if (toAsciiLower(code) !== protocol[j]) {
      return false;
    }

    i++;
    j++;
  }

  return j === protoLen;
}

/**
 * Sanitizes URL-like values by blocking executable pseudo-protocols
 * (javascript:, vbscript:).
 *
 * The check:
 * - skips leading C0 control characters and spaces;
 * - ignores ASCII tab, LF and CR inside the protocol token
 *   (e.g. "java\tscript:" is still recognized as blocked);
 * - compares the scheme token case-insensitively.
 *
 * Returns `about:blank` when blocked.
 */
export function sanitizeURL(url: unknown): string {
  if (typeof url !== "string") return String(url);

  const len = url.length;
  let i = 0;

  while (i < len && isC0ControlOrSpace(url.charCodeAt(i))) {
    i++;
  }

  for (const protocol of BLOCKED_PROTOCOLS) {
    if (matchesProtocol(url, i, protocol)) {
      return BLOCKED_URL;
    }
  }

  return url;
}