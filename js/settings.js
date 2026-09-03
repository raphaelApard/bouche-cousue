/**
 * The three detection settings exposed in the footer.
 *
 * Values are restored from localStorage on load and written back on every
 * change, so a family keeps the tuning that works for their child.
 */

import { el } from "./dom.js";
import { DETECTION, STORAGE_KEYS } from "./config.js";
import { readNumberInRange, writeRaw } from "./storage.js";
import { formatSeconds, onLocaleChange } from "./i18n.js";

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

/**
 * Higher slider value means stricter detection, so the mapping is inverted:
 * 15 gives a tolerant 0.080, 90 a demanding 0.005.
 */
function applySensitivity(value) {
  settings.openThreshold = DETECTION.SENSITIVITY_BASE - value / 1000;
}

function applyWarningDelay(value) {
  settings.warningDelay = value;
  el.warningDelayValue.textContent = formatSeconds(value);
}

function applyPauseDelay(value) {
  settings.pauseDelay = value;
  el.pauseDelayValue.textContent = formatSeconds(value);
}

/** Restores the stored value, applies it, and persists every later change. */
function bindSlider(slider, storageKey, apply) {
  const stored = readNumberInRange(storageKey, slider);
  if (stored !== null) slider.value = stored;

  apply(Number(slider.value));

  slider.addEventListener("input", () => {
    const value = Number(slider.value);
    apply(value);
    writeRaw(storageKey, value);
  });
}

export function initSettings() {
  bindSlider(el.sensitivity, STORAGE_KEYS.sensitivity, applySensitivity);
  bindSlider(el.warningDelay, STORAGE_KEYS.warningDelay, applyWarningDelay);
  bindSlider(el.pauseDelay, STORAGE_KEYS.pauseDelay, applyPauseDelay);

  // The decimal separator and the unit are language-dependent.
  onLocaleChange(() => {
    applyWarningDelay(settings.warningDelay);
    applyPauseDelay(settings.pauseDelay);
  });
}
