/**
 * Translation loading and DOM binding.
 *
 * The app ships in French only; strings live in `locales/fr.json` so that
 * copy can be edited without touching code. Adding a language back would mean
 * restoring a locale picker on top of this module — `translateDocument()` and
 * the listener list below already do the re-rendering such a switch needs.
 *
 * User-facing strings are never written inline anywhere else in the codebase.
 * Static markup binds them with `data-i18n` attributes; dynamic text calls
 * `t(key)` and re-renders through the listeners registered here.
 */

import { I18N } from "./config.js";

/**
 * Resolved against this module's own URL rather than the page's, so the app
 * works from any base path — a project site such as
 * `https://user.github.io/bouche-cousue/` as readily as a domain root.
 */
const LOCALES_URL = new URL(`../${I18N.PATH}/`, import.meta.url);

let messages = {};

const listeners = new Set();

async function fetchLocale(code) {
  const response = await fetch(new URL(`${code}.json`, LOCALES_URL));
  if (!response.ok) throw new Error(`Cannot load locale "${code}" (HTTP ${response.status})`);
  return response.json();
}

/** Walks a dotted path such as `warning.open.title` through nested objects. */
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

export function getLocale() {
  return I18N.LOCALE;
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
 * startup — so these callbacks are also the first-render path for the veil,
 * the status badge and the settings labels.
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
  for (const node of document.querySelectorAll("[data-i18n-placeholder]")) {
    node.placeholder = t(node.dataset.i18nPlaceholder);
  }
  for (const node of document.querySelectorAll("[data-i18n-aria-label]")) {
    node.setAttribute("aria-label", t(node.dataset.i18nAriaLabel));
  }

  for (const listener of listeners) listener();
}

/** Loads the locale file. Call before rendering. */
export async function initI18n() {
  messages = await fetchLocale(I18N.LOCALE);
}
