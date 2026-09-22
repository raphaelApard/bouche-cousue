/**
 * The extension API namespace, under whichever name the browser provides.
 *
 * Firefox exposes `browser`, promise-based; Chrome exposes only `chrome`,
 * which has returned promises since MV3. Choosing between them in one place is
 * what lets the Firefox and Chrome builds share every file but `manifest.json`
 * and the icons — so a change to the rule does not have to be made twice.
 *
 * Scripts that cannot import — the background worker and the content script —
 * repeat this one line rather than importing it.
 */
export const api = globalThis.browser ?? globalThis.chrome;
