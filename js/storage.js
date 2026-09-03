/**
 * Thin wrapper over localStorage.
 *
 * Every access is guarded: private browsing and blocked-storage settings make
 * localStorage throw rather than return null, and none of the data kept here
 * is important enough to break the app over.
 */

/** @returns {string|null} the stored string, or null if absent or unreadable. */
export function readRaw(key) {
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
