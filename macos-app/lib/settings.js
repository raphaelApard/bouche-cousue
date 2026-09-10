/**
 * The settings exposed in the panel.
 *
 * The engine runs in a window of its own and the controls live in the panel,
 * so this module holds no markup: it keeps the derived values the state
 * machine reads, the bounds both sides agree on, and the reading and writing
 * of them. `RANGES` is the single source of truth for those bounds — the panel
 * stamps them onto its inputs rather than repeating them in the markup.
 *
 * The three sliders are the extensions' three, unchanged. The two choices
 * below them are this build's own: which player to drive, and whether the
 * child sees a message on screen.
 */

import { DEFAULTS, DETECTION, STORAGE_KEYS, TARGETS } from "./config.js";
import { numberInRange, readAll, write } from "./storage.js";

/**
 * Live detection settings, read by the state machine on every frame.
 *
 * `openThreshold` is the mouth openness above which the mouth counts as open,
 * expressed as a ratio of face height.
 */
export const settings = {
  openThreshold: 0.005,
  warningDelay: 1500,
  pauseDelay: 5000
};

/** Slider bounds and starting positions, in the units the controls use. */
export const RANGES = Object.freeze({
  sensitivity:  { min: 15,  max: 90,   step: 1,   default: 90 },
  warningDelay: { min: 300, max: 5000, step: 100, default: 1500 },
  pauseDelay:   { min: 0,   max: 5000, step: 100, default: 5000 }
});

/**
 * Folds one slider value into `settings`.
 *
 * Sensitivity is the odd one out: a higher slider value means stricter
 * detection, so the mapping is inverted — 15 gives a tolerant 0.080, 90 a
 * demanding 0.005. Keep that inversion if you touch the control.
 *
 * @param {keyof RANGES} name
 * @param {number} value
 */
export function applySetting(name, value) {
  if (name === "sensitivity") settings.openThreshold = DETECTION.SENSITIVITY_BASE - value / 1000;
  else if (name in settings) settings[name] = value;
}

/** Persists one setting. Called by the panel, which owns the controls. */
export function storeSetting(name, value) {
  write(STORAGE_KEYS[name], value);
}

/**
 * Reads the three slider positions, falling back to the defaults.
 *
 * The bounds are checked rather than trusted: a missing key reads back as
 * `undefined`, but a corrupted one could hold anything, and a slider dragged
 * outside its range would put the state machine into a state no adult chose.
 *
 * @returns {Promise<{sensitivity: number, warningDelay: number, pauseDelay: number}>}
 */
export async function readSliderValues() {
  const stored = await readAll(Object.values(STORAGE_KEYS));

  return Object.fromEntries(
    Object.entries(RANGES).map(([name, range]) => {
      const value = numberInRange(stored[STORAGE_KEYS[name]], range);
      return [name, value ?? range.default];
    })
  );
}

/**
 * Reads the two non-numeric choices, validated the same way: an unknown target
 * would leave the app pressing a key no player answers.
 *
 * @returns {Promise<{target: string, overlay: boolean}>}
 */
export async function readOptions() {
  const stored = await readAll([STORAGE_KEYS.target, STORAGE_KEYS.overlay]);
  const target = stored[STORAGE_KEYS.target];
  const overlay = stored[STORAGE_KEYS.overlay];

  return {
    target: TARGETS.includes(target) ? target : DEFAULTS.target,
    overlay: overlay === undefined ? DEFAULTS.overlay : overlay === "true"
  };
}

/** Restores the stored settings into `settings`. Called by the engine on start. */
export async function loadSettings() {
  const values = await readSliderValues();
  for (const [name, value] of Object.entries(values)) applySetting(name, value);
  return values;
}
