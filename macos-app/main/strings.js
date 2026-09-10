/**
 * The locale, for the two things the main process says out loud: the tray
 * menu and the tooltip.
 *
 * `lib/i18n.js` is the renderers' copy — it binds the DOM and fetches over
 * `app://`, neither of which exists here. This reads the same file, so there
 * is still only one place where French is written.
 */

import fs from "node:fs";
import path from "node:path";

import { I18N } from "../lib/config.js";

let messages = {};

export function loadStrings(root) {
  try {
    messages = JSON.parse(
      fs.readFileSync(path.join(root, I18N.PATH, `${I18N.LOCALE}.json`), "utf8")
    );
  } catch (error) {
    console.error("Locale could not be loaded.", error);
  }
}

/** Dotted path lookup, falling back to the key so a gap shows rather than throws. */
export function t(key) {
  const value = key.split(".").reduce((node, part) => (node == null ? undefined : node[part]), messages);
  return typeof value === "string" ? value : key;
}
