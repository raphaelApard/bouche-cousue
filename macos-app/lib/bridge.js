/**
 * The one line the renderers use to reach the main process.
 *
 * The extensions have `lib/api.js`, which picks `browser` or `chrome`; this is
 * the same idea for Electron. `window.p4l` is installed by `preload.cjs` and
 * is the only thing these pages can touch outside their own document — no Node
 * integration, context isolation on.
 */
export const bridge = window.p4l;
