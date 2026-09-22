/**
 * The breakpoint, carried as a class on `<body>`.
 *
 * The width itself is CSS, in `--bp-mobile` at the top of `css/base.css`, and
 * this module only reads it: nothing here decides how wide anything is.
 *
 * The indirection is forced. A media query cannot read a custom property, so
 * `@media (max-width: var(--bp-mobile))` is not a thing CSS can express; naming
 * the state on the body is what lets every stylesheet ask for the breakpoint by
 * name instead of repeating the number.
 */

/** Exactly one of these is on the body at any moment. */
const MOBILE = "is-mobile";
const DESKTOP = "is-desktop";

/**
 * Reads the breakpoint out of the stylesheet. Loudly, like `byId()`: a missing
 * property would otherwise build the query `(max-width: )`, which never matches
 * and would quietly leave every phone in the desktop layout.
 */
function breakpoint() {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue("--bp-mobile").trim();
  if (!value) throw new Error("Missing --bp-mobile in css/base.css");
  return value;
}

/**
 * Applies the class once, and again whenever the breakpoint is crossed — a
 * phone turned on its side, a window dragged narrower.
 *
 * Called before anything else in `main.js`, and before its first `await`, so
 * the class is on the body by the time the page is first painted. The
 * stylesheets are already applied by then: they are linked in the head, and a
 * module script does not run until after they are.
 */
export function initLayout() {
  const media = matchMedia(`(max-width: ${breakpoint()})`);

  const apply = () => {
    document.body.classList.toggle(MOBILE, media.matches);
    document.body.classList.toggle(DESKTOP, !media.matches);
  };

  media.addEventListener("change", apply);
  apply();
}
