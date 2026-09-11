/**
 * The breakpoints, carried as classes on `<body>`.
 *
 * The widths themselves are CSS, in the `--bp-*` custom properties at the top
 * of `css/base.css`, and this module only reads them: nothing here decides how
 * wide anything is, and no number in it would need changing to move a
 * breakpoint.
 *
 * The indirection is forced. A media query cannot read a custom property, so
 * `@media (max-width: var(--bp-narrow))` is not a thing CSS can express; naming
 * the state on the body is what lets every stylesheet ask for the breakpoint by
 * name instead of repeating the number.
 */

/** Each class, and the `--bp-*` property whose width decides it. */
const BREAKPOINTS = Object.freeze({
  "is-narrow": ["--bp-narrow", width => `(max-width: ${width})`],
  "is-short": ["--bp-short", height => `(max-height: ${height})`],
  "is-phone": ["--bp-phone", width => `(max-width: ${width})`]
});

/**
 * Reads one breakpoint out of the stylesheet. Loudly, like `byId()`: a missing
 * property would otherwise build the query `(max-width: )`, which never matches
 * and would quietly leave the page in its widest layout on every phone.
 */
function widthOf(property) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(property).trim();
  if (!value) throw new Error(`Missing breakpoint ${property} in css/base.css`);
  return value;
}

/**
 * Applies every class once, and again whenever one starts or stops matching —
 * a phone turned on its side, a window dragged narrower.
 *
 * Called before anything else in `main.js`, and before its first `await`, so
 * the classes are on the body by the time the page is first painted. The
 * stylesheets are already applied by then: they are linked in the head, and a
 * module script does not run until after they are.
 */
export function initLayout() {
  for (const [className, [property, toQuery]] of Object.entries(BREAKPOINTS)) {
    const media = matchMedia(toQuery(widthOf(property)));
    const apply = () => document.body.classList.toggle(className, media.matches);
    media.addEventListener("change", apply);
    apply();
  }
}
