/**
 * Converts an empty string or undefined to null.
 */
function normalizeValue(value) {
  return value === '' || value === undefined ? null : value;
}

/**
 * Converts an empty string or undefined to 0.
 * Useful for numeric fields that should never be null.
 */
function normalizeNumber(value) {
  if (value === '' || value === undefined || value === null) return 0;
  const num = Number(value);
  return isNaN(num) ? 0 : num;
}

/**
 * Converts empty or null strings to trimmed versions safely.
 */
function normalizeString(value) {
  return value ? String(value).trim() : null;
}

module.exports = { normalizeValue, normalizeNumber, normalizeString };
