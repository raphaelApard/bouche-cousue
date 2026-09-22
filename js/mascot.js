/**
 * The cat, in seven faces.
 *
 * The drawing itself lives in `#mascotTemplate` in the markup — one copy, so
 * there is one place to redraw it — and this module stamps that template into
 * however many slots the page has. Which face shows is decided entirely by the
 * `data-expression` attribute and the rules in `css/mascot.css`; nothing here
 * touches a path.
 *
 * The mascot carries no text and is `aria-hidden`: every sentence beside it
 * comes from the locale files.
 */

import { MASCOT } from "./config.js";

const EXPRESSIONS = new Set(Object.values(MASCOT));

/** @type {HTMLTemplateElement|null} */
let template = null;

function source() {
  if (template) return template;

  const node = document.getElementById("mascotTemplate");
  if (!(node instanceof HTMLTemplateElement)) throw new Error("Missing <template> #mascotTemplate");
  template = node;
  return template;
}

/**
 * Fills a slot with its own copy of the cat.
 *
 * @param {Element} slot        an empty element from the markup
 * @param {string} [expression] one of `MASCOT`; defaults to neutral
 * @returns {SVGElement} the drawing, for later `setExpression()` calls
 */
export function mount(slot, expression = MASCOT.NEUTRAL) {
  const svg = source().content.firstElementChild.cloneNode(true);
  setExpression(svg, expression);
  slot.replaceChildren(svg);
  return svg;
}

/**
 * @param {SVGElement} svg        a drawing returned by `mount()`
 * @param {string} expression     one of `MASCOT`; anything else is ignored, so
 *                                a stray reason name cannot blank the cat
 */
export function setExpression(svg, expression) {
  if (!EXPRESSIONS.has(expression)) return;
  svg.dataset.expression = expression;
}
