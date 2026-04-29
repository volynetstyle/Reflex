const BLOCKED_URL = "about:blank";

const J = 0x6a;
const A = 0x61;
const V = 0x76;
const S = 0x73;
const C = 0x63;
const R = 0x72;
const I = 0x69;
const P = 0x70;
const T = 0x74;
const COLON = 0x3a;

const JS_PROTOCOL_CODES = [J, A, V, A, S, C, R, I, P, T, COLON] as const;
const JS_PROTOCOL_LENGTH = JS_PROTOCOL_CODES.length;

function isC0ControlOrSpace(code: number): boolean {
  return code <= 0x20;
}

function toAsciiLower(code: number): number {
  return code >= 0x41 && code <= 0x5a ? code + 0x20 : code;
}

function isProtocolGap(code: number): boolean {
  return code === 0x09 || code === 0x0a || code === 0x0d;
}

/**
 * Sanitizes URL-like values by blocking javascript: URLs.
 *
 * The check:
 * - skips leading C0 control characters and spaces;
 * - ignores ASCII tab, LF and CR inside the protocol token;
 * - compares `javascript:` case-insensitively.
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

  let j = 0;

  while (j < JS_PROTOCOL_LENGTH && i < len) {
    const code = url.charCodeAt(i);

    if (isProtocolGap(code)) {
      i++;
      continue;
    }

    if (toAsciiLower(code) !== JS_PROTOCOL_CODES[j]) {
      return url;
    }

    i++;
    j++;
  }

  return j === JS_PROTOCOL_LENGTH ? BLOCKED_URL : url;
}
