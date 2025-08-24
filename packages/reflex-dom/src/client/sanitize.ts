/**
 * A safe fallback URL for blocked javascript: URLs.
 * Prevents code execution if a javascript: URL is accidentally visited.
 */
const BLOCKED_JS_URL =
  "javascript:throw new Error('Blocked javascript: URL for security.')";

/**
 * Checks if a character is a C0 control character or space (U+0000 to U+001F, U+0020).
 * @param charCode - The character code to check.
 * @returns True if the character is a C0 control or space, false otherwise.
 */
function isC0ControlOrSpace(charCode: number): boolean {
  return (charCode >= 0 && charCode <= 0x1f) || charCode === 0x20;
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
export function sanitizeURL<T>(url: T): T | string {
  if (!url || typeof url !== "string") {
    return String(url); // Coerce to string and return as-is
  }

  const strUrl = url as string;
  const len = strUrl.length;

  if (len < 10) {
    // "javascript:" is 11 characters
    return strUrl;
  }

  // Skip leading C0 control characters or spaces
  let i = 0;

  while (i < len && isC0ControlOrSpace(strUrl.charCodeAt(i))) {
    i++;
  }

  const proto = "javascript:";
  const protoLength = proto.length;
  let j = 0;

  while (j < protoLength && i < len) {
    const char = strUrl[i];
    if (char === "\r" || char === "\n" || char === "\t") {
      i++;
      continue;
    }

    // Case-insensitive comparison
    if (char.toLowerCase() !== proto[j]) {
      return strUrl; // Not a javascript: URL
    }

    i++;
    j++;
  }

  // If protocol fully matched, return safe placeholder
  if (j === protoLength) {
    return BLOCKED_JS_URL;
  }

  return strUrl;
}
