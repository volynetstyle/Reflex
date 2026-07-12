const FIRST = 1 << 0;
const NEXT = 1 << 1;

/**
 * Validates whether an attribute name is safe according to the specified rules:
 * - Start character: A-Z, a-z, _, or :
 * - Name characters: Start characters plus 0-9, -, ., or \u00B7 (middle dot)
 *
 * @param name The attribute name to validate
 * @returns True if the attribute name is safe, false otherwise
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

// Precomputed lookup table (256 entries): bit 0 = valid first char, bit 1 = valid subsequent char
const TABLE = new Uint8Array([
  0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0, // 0-15
  0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0, // 16-31
  0,0,0,0,0,0,0,0,0,0,0,0,0,2,2,0, // 32-47 (45 '-' =2, 46 '.' =2)
  2,2,2,2,2,2,2,2,2,2,3,0,0,0,0,0, // 48-63 (48-57 '0'-'9' =2, 58 ':' =3)
  0,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3, // 64-79 (65-79 'A'-'O' =3)
  3,3,3,3,3,3,3,3,3,3,3,0,0,0,0,3, // 80-95 (80-90 'P'-'Z' =3, 95 '_' =3)
  0,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3, // 96-111 (97-111 'a'-'o' =3)
  3,3,3,3,3,3,3,3,3,3,3,0,0,0,0,0, // 112-127 (112-122 'p'-'z' =3)
  0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0, // 128-143
  0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0, // 144-159
  0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0, // 160-175
  0,0,0,0,0,0,0,2,0,0,0,0,0,0,0,0, // 176-191 (183 '·' =2)
  0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0, // 192-207
  0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0, // 208-223
  0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0, // 224-239
  0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0, // 240-255
]);
