/**
 * The amber run to the left of a slider's thumb.
 *
 * A native range input draws one flat track, so the filled part has to be
 * painted from the value. Each input carries its own `--range-fill`
 * percentage and the track gradient in `css/base.css` reads it.
 *
 * Kept apart from `ui.js` so the playback bar can use it too without the
 * playback bar having to reach into the module that owns everything else.
 */

/** @param {HTMLInputElement} input a range input */
export function paintRange(input) {
  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const span = max - min;
  const ratio = span > 0 ? (Number(input.value) - min) / span : 0;

  input.style.setProperty("--range-fill", `${Math.min(100, Math.max(0, ratio * 100))}%`);
}

/** Paints now, and again on every move of the handle. */
export function bindRangeFill(input) {
  paintRange(input);
  input.addEventListener("input", () => paintRange(input));
}
