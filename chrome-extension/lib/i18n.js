/**
 * Translation loading and DOM binding.
 *
 * The extension ships in French only; strings live in `locales/fr.json` so
 * that copy can be edited without touching code. Adding a language back would
 * mean restoring a locale picker on top of this module — `translateDocument()`
 * and the listener list below already do the re-rendering such a switch needs.
 *
 * User-facing strings are never written inline anywhere else in the codebase.
 * Static markup binds them with `data-i18n` attributes; dynamic text calls
 * `t(key)`. The content script has no copy of its own: every sentence it shows
 * is translated here and travels with the message that asks for it.
 */

import { api } from "./api.js";
import { I18N } from "./config.js";

let messages = {};

const listeners = new Set();

/** Dotted path lookup, e.g. `warning.open.title`. */
function lookup(source, key) {
  return key.split(".").reduce((node, part) => (node == null ? undefined : node[part]), source);
}

/**
 * Translates a key, falling back to the key itself, so a missing translation
 * degrades visibly instead of crashing.
 *
 * @param {string} key            dotted path, e.g. `warning.open.title`
 * @param {object} [placeholders] `{name}` values to substitute
 */
export function t(key, placeholders = {}) {
  const value = lookup(messages, key);
  if (typeof value !== "string") return key;

  return Object.entries(placeholders)
    .reduce((text, [name, replacement]) => text.replaceAll(`{${name}}`, replacement), value);
}

/** Both halves of a veil message, ready to hand to the content script. */
export function veilText(prefix) {
  return { title: t(`${prefix}.title`), text: t(`${prefix}.text`) };
}

/** Formats a millisecond duration as seconds, using the locale's separator. */
export function formatSeconds(milliseconds) {
  const formatter = new Intl.NumberFormat(I18N.LOCALE, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  });
  return `${formatter.format(milliseconds / 1000)} ${t("settings.secondsUnit")}`;
}

/**
 * Registers a callback for text that cannot be expressed as a static
 * `data-i18n` binding. Fired by `translateDocument()`, which runs once at
 * startup — so these callbacks are also the first-render path for the status
 * badge and the settings labels.
 */
export function onLocaleChange(listener) {
  listeners.add(listener);
}

/** Rewrites everything bound through `data-i18n*` attributes, then notifies listeners. */
export function translateDocument() {
  document.documentElement.lang = I18N.LOCALE;
  document.title = t("app.title");

  for (const node of document.querySelectorAll("[data-i18n]")) {
    node.textContent = t(node.dataset.i18n);
  }
  for (const node of document.querySelectorAll("[data-i18n-aria-label]")) {
    node.setAttribute("aria-label", t(node.dataset.i18nAriaLabel));
  }

  for (const listener of listeners) listener();
}

/** Loads the locale file. Call before rendering. */
export async function initI18n() {
  const response = await fetch(api.runtime.getURL(`${I18N.PATH}/${I18N.LOCALE}.json`));
  if (!response.ok) throw new Error(`Cannot load locale (HTTP ${response.status})`);
  messages = await response.json();
}
