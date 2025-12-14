/**
 * TABLE[c] = bitmask:
 * bit0 (1) → valid as first char
 * bit1 (2) → valid as subsequent char
 */
export const TABLE = new Uint8Array(256);

(() => {
  // First char: A–Z, a–z, _, :
  for (let c = 65; c <= 90; c++) TABLE[c] = 3; // A-Z → 0b11
  for (let c = 97; c <= 122; c++) TABLE[c] = 3; // a-z → 0b11
  TABLE[95] = 3; // _
  TABLE[58] = 3; // :

  // Subsequent chars only: 0–9, -, ., ·
  for (let c = 48; c <= 57; c++) TABLE[c] = 2; // 0-9 → 0b10
  TABLE[45] = 2; // -
  TABLE[46] = 2; // .
  TABLE[183] = 2; // · (middle dot)
})();

// extend "both" (bitmask |= 2) for symbols allowed both first & next
// Already done for A-Z, a-z, _, :

/**
 * Validates whether an attribute name is safe according to the specified rules:
 * - Start character: A-Z, a-z, _, or :
 * - Name characters: Start characters plus 0-9, -, ., or \u00B7 (middle dot)
 * - Ensures maximal safety and performance for library usage.
 *
 * @param attributeName The attribute name to validate
 * @returns True if the attribute name is safe, false otherwise
 */
/**
 * Lookup tables for ASCII characters.
 * 1 = allowed, 0 = forbidden.
 * Length is exactly 256.
 */
/**
 * Ultra-fast ASCII attribute validator using two lookup tables.
 */
export function isAttributeNameSafeBranchless(name: string): boolean {
  const len = name.length;
  if (len === 0 || len > 256) return false;

  // First char must satisfy (TABLE[c] & 1) !== 0
  let c = name.charCodeAt(0);
  if (c >= 256 || (TABLE[c]! & 1) === 0) return false;

  // Next chars: (TABLE[c] & 2) !== 0
  for (let i = 1; i < len; i++) {
    c = name.charCodeAt(i);
    if (c >= 256 || (TABLE[c]! & 2) === 0) return false;
  }

  return true;
}
