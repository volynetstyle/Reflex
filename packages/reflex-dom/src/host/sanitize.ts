/**
 * A safe fallback URL for blocked javascript: URLs.
 * Prevents code execution if a javascript: URL is accidentally visited.
 */
const BLOCKED_URL = "about:blank";
const JS_PROTOCOL = "javascript:";
const JS_PROTOCOL_LENGTH = JS_PROTOCOL.length;

/**
 * Checks if a character is a C0 control character or space (U+0000 to U+001F, U+0020).
 * @param charCode - The character code to check.
 * @returns True if the character is a C0 control or space, false otherwise.
 */

function isC0ControlOrSpace(code: number): boolean {
  return code <= 0x20;
}

function isAsciiCaseInsensitiveMatch(
  code: number,
  expectedLower: number,
): boolean {
  // Fast ASCII lowercasing:
  // 'A'..'Z' => +32
  if (code >= 0x41 && code <= 0x5a) {
    code += 0x20;
  }
  return code === expectedLower;
}

/**
 * Sanitizes a URL to prevent execution of `javascript:` protocol URLs.
 *
 * Follows WHATWG URL spec:
 * - Ignores leading C0 control characters or spaces.
 * - Ignores newlines (\r, \n) or tabs (\t) between letters of "javascript:".
 * - Matches "javascript:" case-insensitively.
 *
 * Returns a safe placeholder URL if a `javascript:` URL is detected, otherwise returns the original URL.
 * Optimized for performance with minimal string operations and early exits.
 *
 * @param url - The URL to sanitize (string or any type, coerced to string).
 * @returns The original URL if safe, or a safe javascript-blocking URL if dangerous.
 *
 * @example
 * sanitizeURL("javascript:alert('XSS')") // -> "javascript:throw new Error('Blocked javascript: URL for security.')"
 * sanitizeURL("https://example.com") // -> "https://example.com"
 */
export function sanitizeURL(url: unknown): string {
  if (typeof url !== "string") {
    return String(url);
  }

  const len = url.length;
  if (len < JS_PROTOCOL_LENGTH) {
    return url;
  }

  let i = 0;

  // Skip leading C0 controls and spaces
  while (i < len && isC0ControlOrSpace(url.charCodeAt(i))) {
    ++i;
  }

  let j = 0;

  while (j < JS_PROTOCOL_LENGTH && i < len) {
    const code = url.charCodeAt(i);

    // Ignore \t, \n, \r between protocol letters
    if (code === 0x09 || code === 0x0a || code === 0x0d) {
      ++i;
      continue;
    }

    if (!isAsciiCaseInsensitiveMatch(code, JS_PROTOCOL.charCodeAt(j))) {
      return url;
    }

    ++i;
    ++j;
  }

  return j === JS_PROTOCOL_LENGTH ? BLOCKED_URL : url;
}
