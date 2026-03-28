const FIRST = 1;
const NEXT = 2;
const BOTH = FIRST | NEXT;

/**
 * TABLE[c]:
 * - bit 0 => valid as first char
 * - bit 1 => valid as subsequent char
 */
const TABLE = new Uint8Array(256);

// First char + subsequent char: A-Z, a-z, _, :
for (let c = 65; c <= 90; c++) TABLE[c] = BOTH;
for (let c = 97; c <= 122; c++) TABLE[c] = BOTH;
TABLE[95] = BOTH; // _
TABLE[58] = BOTH; // :

// Subsequent char only: 0-9, -, ., ·
for (let c = 48; c <= 57; c++) TABLE[c] = NEXT;
TABLE[45] = NEXT; // -
TABLE[46] = NEXT; // .
TABLE[183] = NEXT; // ·

/**
 * Validates whether an attribute name is safe according to the specified rules:
 * - Start character: A-Z, a-z, _, or :
 * - Name characters: Start characters plus 0-9, -, ., or \u00B7 (middle dot)
 * - Ensures maximal safety and performance for library usage.
 *
 * @param attributeName The attribute name to validate
 *
 * @returns True if the attribute name is safe, false otherwise
 *
 *  Lookup tables for ASCII characters.
 * 1 = allowed, 0 = forbidden.
 * Length is exactly 256.
 */
export function isAttributeName(name: string): boolean {
  const len = name.length;
  if (len === 0) return false;

  const table = TABLE;
  let i = 0;

  if ((table[name.charCodeAt(i++)]! & FIRST) === 0) return false;

  while (i < len) {
    if ((table[name.charCodeAt(i++)]! & NEXT) === 0) return false;
  }

  return true;
}
