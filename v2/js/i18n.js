/**
 * Translation loading and DOM binding.
 *
 * Both locales are loaded at startup, but only one is ever on screen: `t()`
 * returns the current language and the FR/EN control calls `setLocale()`, which
 * switches it and re-renders the whole document.
 *
 * User-facing strings are never written inline anywhere else in the codebase.
 * Static markup binds them with `data-i18n` attributes; dynamic text calls
 * `t(key)` and re-renders through the listeners registered here.
 */

import { I18N, STORAGE_KEYS } from "./config.js";
import { readOneOf, writeRaw } from "./storage.js";

/**
 * Resolved against this module's own URL rather than the page's, so the app
 * works from any base path — a project site such as
 * `https://user.github.io/bouche-cousue/v2/` as readily as a domain root.
 */
const LOCALES_URL = new URL(`../${I18N.PATH}/`, import.meta.url);

/** @type {Map<string, object>} locale code to its loaded messages. */
const bundles = new Map();

let primary = I18N.DEFAULT;

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

function substitute(text, placeholders) {
  return Object.entries(placeholders)
    .reduce((result, [name, replacement]) => result.replaceAll(`{${name}}`, replacement), text);
}

/**
 * Resolves a key in one locale, falling back to the default locale and then to
 * the key itself, so a missing translation degrades visibly instead of
 * crashing.
 */
function translate(code, key, placeholders) {
  const direct = lookup(bundles.get(code), key);
  if (typeof direct === "string") return substitute(direct, placeholders);

  const fallback = lookup(bundles.get(I18N.DEFAULT), key);
  return typeof fallback === "string" ? substitute(fallback, placeholders) : key;
}

/**
 * Translates a key into the primary language.
 *
 * @param {string} key            dotted path, e.g. `warning.open.title`
 * @param {object} [placeholders] `{name}` values to substitute
 */
export function t(key, placeholders = {}) {
  return translate(primary, key, placeholders);
}

export function getLocale() {
  return primary;
}

/** Formats a plain number with the locale's decimal separator. */
export function formatDecimal(value, digits = 2) {
  return new Intl.NumberFormat(primary, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(value);
}

/** Formats a millisecond duration as seconds, using the locale's separator. */
export function formatSeconds(milliseconds) {
  const formatter = new Intl.NumberFormat(primary, {
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
  document.documentElement.lang = primary;
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

/** Promotes one of the loaded locales to primary and re-renders everything. */
export function setLocale(code) {
  if (!I18N.LOCALES.includes(code) || code === primary) return;
  primary = code;
  writeRaw(STORAGE_KEYS.locale, code);
  translateDocument();
}

/** Loads every locale file and restores the stored choice. Call before rendering. */
export async function initI18n() {
  const loaded = await Promise.all(I18N.LOCALES.map(fetchLocale));
  I18N.LOCALES.forEach((code, index) => bundles.set(code, loaded[index]));

  primary = readOneOf(STORAGE_KEYS.locale, I18N.LOCALES) ?? I18N.DEFAULT;
}
