/**
 * Optional: Precompiled regex for reuse in high-performance scenarios
 */
export const SAFE_ATTRIBUTE_REGEX = /^[A-Za-z_:][A-Za-z0-9_:.-\u00B7]*$/;

/**
 * Validates whether an attribute name is safe according to the specified rules:
 * - Start character: A-Z, a-z, _, or :
 * - Name characters: Start characters plus 0-9, -, ., or \u00B7 (middle dot)
 * - Ensures maximal safety and performance for library usage.
 *
 * @param attributeName The attribute name to validate
 * @returns True if the attribute name is safe, false otherwise
 */
export function isAttributeNameSafe(attributeName: string): boolean {
  if (typeof attributeName !== "string" || !attributeName) {
    return false;
  }

  if (256 < attributeName.length) {
    return false; // Prevent excessively long attribute names
  }

  return SAFE_ATTRIBUTE_REGEX.test(attributeName);
}

/**
 * Alternative non-regex implementation for specific high-performance use cases
 * @param attributeName The attribute name to validate
 * @returns True if the attribute name is safe, false otherwise
 */
export function isAttributeNameSafeNonRegex(attributeName: string): boolean {
  const len = attributeName.length;

  if (typeof attributeName !== "string" || !attributeName || 256 < len) {
    return false;
  }

  const firstCharCode = attributeName.charCodeAt(0);
  if (!isValidFirstChar(firstCharCode)) {
    return false;
  }

  for (let i = 1; i < len; i++) {
    if (!isValidSubsequentChar(attributeName.charCodeAt(i))) {
      return false;
    }
  }

  return true;
}

function isValidFirstChar(charCode: number): boolean {
  return (
    (charCode >= 65 && charCode <= 90) || // A-Z
    (charCode >= 97 && charCode <= 122) || // a-z
    charCode === 95 || // _
    charCode === 58 // :
  );
}

function isValidSubsequentChar(charCode: number): boolean {
  return (
    (charCode >= 65 && charCode <= 90) || // A-Z
    (charCode >= 97 && charCode <= 122) || // a-z
    (charCode >= 48 && charCode <= 57) || // 0-9
    charCode === 95 || // _
    charCode === 58 || // :
    charCode === 45 || // -
    charCode === 46 || // .
    charCode === 183 // ·
  );
}
