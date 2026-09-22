/**
 * Thin wrapper over localStorage.
 *
 * Every access is guarded: private browsing and blocked-storage settings make
 * localStorage throw rather than return null, and none of the data kept here
 * is important enough to break the app over.
 */

/**
 * The unguarded read, kept to this module on purpose: every caller outside it
 * goes through `readNumberInRange()` or `readOneOf()`, which is what keeps a
 * missing key from reading back as a plausible value.
 *
 * @returns {string|null} the stored string, or null if absent or unreadable.
 */
function readRaw(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeRaw(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* Storage unavailable — preferences simply will not persist. */
  }
}

export function removeRaw(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* Storage unavailable — nothing was persisted in the first place. */
  }
}

export function readBoolean(key) {
  return readRaw(key) === "1";
}

export function writeBoolean(key, value) {
  writeRaw(key, value ? "1" : "0");
}

/**
 * Reads a number, rejecting anything outside the given bounds.
 *
 * The bounds matter: a missing key reads back as `null`, and `Number(null)` is
 * `0` — which would silently look like a valid value for any slider whose
 * minimum is 0.
 *
 * @returns {number|null} the stored number, or null if absent or out of range.
 */
export function readNumberInRange(key, { min, max }) {
  const raw = readRaw(key);
  if (raw === null) return null;

  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  if (value < Number(min) || value > Number(max)) return null;

  return value;
}

/**
 * Reads a string, rejecting anything outside a known set — the same guard as
 * `readNumberInRange`, for preferences whose values are names rather than
 * numbers.
 *
 * @returns {string|null} the stored value, or null if absent or unrecognised.
 */
export function readOneOf(key, allowed) {
  const raw = readRaw(key);
  return allowed.includes(raw) ? raw : null;
}
