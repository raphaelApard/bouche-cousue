/**
 * Thin wrapper over the preferences file the main process keeps.
 *
 * The extensions put these three sliders in `storage.local`; here they live in
 * `settings.json` under the app's user-data folder, reached through the
 * preload bridge. Every access is guarded: none of the data kept here — three
 * slider positions and two choices — is important enough to break the app over.
 */

import { bridge } from "./bridge.js";

/**
 * Reads several keys at once.
 *
 * @param {string[]} keys
 * @returns {Promise<object>} the stored values, or `{}` if unreadable.
 */
export async function readAll(keys) {
  try {
    return await bridge.readSettings(keys);
  } catch {
    return {};
  }
}

export function write(key, value) {
  bridge.writeSetting(key, String(value))?.catch?.(() => {
    /* Unwritable preferences file — settings simply will not persist. */
  });
}

/**
 * Validates a stored number against the bounds of the slider it belongs to.
 *
 * The bounds matter: a missing key reads back as `undefined`, and
 * `Number(undefined)` is `NaN` — but `Number(null)` is `0`, which would
 * silently look like a valid value for any slider whose minimum is 0.
 *
 * @param {unknown} raw
 * @param {{min: string|number, max: string|number}} bounds
 * @returns {number|null} the number, or null if absent or out of range.
 */
export function numberInRange(raw, { min, max }) {
  if (raw === null || raw === undefined || raw === "") return null;

  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  if (value < Number(min) || value > Number(max)) return null;

  return value;
}
