/**
 * The adult panel: the three detection settings, and the panel itself.
 *
 * Values are restored from localStorage on load and written back on every
 * change, so a family keeps the tuning that works for their child.
 *
 * The button that opens it is a plain labelled button. An earlier version made
 * it a one-second press-and-hold, so a child poking at the screen would not
 * land in the settings — but an adult pressing it read that as a dead control,
 * which is the worse failure of the two.
 */

import { el } from "./dom.js";
import { DETECTION, STORAGE_KEYS } from "./config.js";
import { readNumberInRange, readOneOf, removeRaw, writeBoolean, writeRaw } from "./storage.js";
import { formatDecimal, formatSeconds, onLocaleChange } from "./i18n.js";
import { bindRangeFill, paintRange } from "./range-fill.js";
import * as ui from "./ui.js";

/**
 * Live detection settings, read by the state machine on every frame.
 *
 * `openThreshold` is the mouth openness above which the mouth counts as open,
 * expressed as a ratio of face height.
 */
export const settings = {
  openThreshold: 0.048,
  warningDelay: 1500,
  pauseDelay: 3000
};

/** Every slider, with the key it persists under and what its value means. */
const SLIDERS = [
  { input: () => el.sensitivity, key: STORAGE_KEYS.sensitivity, apply: applySensitivity },
  { input: () => el.warningDelay, key: STORAGE_KEYS.warningDelay, apply: applyWarningDelay },
  { input: () => el.pauseDelay, key: STORAGE_KEYS.pauseDelay, apply: applyPauseDelay }
];

/**
 * Higher slider value means stricter detection, so the mapping is inverted:
 * 15 gives a tolerant 0.080, 90 a demanding 0.005.
 */
function applySensitivity(value) {
  settings.openThreshold = DETECTION.SENSITIVITY_BASE - value / 1000;

  // The chip shows where the slider sits, not the threshold behind it: a
  // parent tunes this by feel, and 0.005 means nothing to them.
  const { min, max } = el.sensitivity;
  el.sensitivityValue.textContent = formatDecimal((value - Number(min)) / (Number(max) - Number(min)));
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
function bindSlider({ input, key, apply }) {
  const slider = input();
  const stored = readNumberInRange(key, slider);
  if (stored !== null) slider.value = stored;

  apply(Number(slider.value));
  bindRangeFill(slider);

  slider.addEventListener("input", () => {
    const value = Number(slider.value);
    apply(value);
    writeRaw(key, value);
  });
}

/** Back to the shipped tuning, in one press, when a session has gone astray. */
function resetSettings() {
  for (const { input, key, apply } of SLIDERS) {
    const slider = input();
    removeRaw(key);
    slider.value = slider.defaultValue;
    apply(Number(slider.value));
    paintRange(slider);
  }

  removeRaw(STORAGE_KEYS.mirror);
  applyMirror(true);
}

/* ---------- The mirror is a preference, not a setting of the rule ---------- */

/*
  A checkbox rather than a button whose word flips: the label stays put and the
  tick carries the state, which is one less thing to read mid-film.
*/
function applyMirror(wanted) {
  ui.setMirrorWanted(wanted);
  el.mirrorToggle.checked = wanted;
}

/* ---------- Opening and closing the panel ---------- */

export function isPanelOpen() {
  return !el.settingsPanel.hidden;
}

export function openPanel() {
  el.settingsPanel.hidden = false;
  el.settingsButton.setAttribute("aria-expanded", "true");
  el.settingsButton.classList.add("is-open");
  el.quickBar.hidden = true;
}

export function closePanel() {
  el.settingsPanel.hidden = true;
  el.settingsButton.setAttribute("aria-expanded", "false");
  el.settingsButton.classList.remove("is-open");
}

function togglePanel() {
  if (isPanelOpen()) closePanel();
  else openPanel();
}

function wirePanel() {
  el.settingsButton.addEventListener("click", togglePanel);

  // Escape closes it, and a click anywhere outside does too.
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && isPanelOpen()) closePanel();
  });

  document.addEventListener("pointerdown", event => {
    if (!isPanelOpen()) return;
    const target = event.target;
    if (target instanceof Node
        && !el.settingsPanel.contains(target)
        && !el.settingsButton.contains(target)) {
      closePanel();
    }
  });
}

export function initSettings() {
  for (const slider of SLIDERS) bindSlider(slider);

  // The mirror is on unless it was explicitly turned off: a missing key must
  // not read back as "hidden", which is exactly what readBoolean would say.
  const storedMirror = readOneOf(STORAGE_KEYS.mirror, ["0", "1"]);
  applyMirror(storedMirror === null || storedMirror === "1");

  el.mirrorToggle.addEventListener("change", () => {
    applyMirror(el.mirrorToggle.checked);
    writeBoolean(STORAGE_KEYS.mirror, el.mirrorToggle.checked);
  });

  el.resetButton.addEventListener("click", resetSettings);

  wirePanel();

  // The decimal separator and the unit are language-dependent.
  onLocaleChange(() => {
    applyWarningDelay(settings.warningDelay);
    applyPauseDelay(settings.pauseDelay);
  });
}
