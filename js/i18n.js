/**
 * Translation loading and DOM binding.
 *
 * Locale files are plain JSON under `locales/`, so adding a language is a data
 * change: copy a file, translate the values, list the code in
 * `config.I18N.SUPPORTED`, and add a button to the header.
 *
 * User-facing strings are never written inline anywhere else in the codebase.
 * Static markup binds them with `data-i18n` attributes; dynamic text calls
 * `t(key)` and re-renders through the listeners registered here.
 */

import { CONTACT_EMAIL, I18N, REPO_URL, STORAGE_KEYS } from "./config.js";
import { readRaw, writeRaw } from "./storage.js";

/** Values available to every string, written as `{name}` in the locale files. */
const GLOBAL_PLACEHOLDERS = { repo: REPO_URL, email: CONTACT_EMAIL };

/**
 * Resolved against this module's own URL rather than the page's, so the app
 * works from any base path — a project site such as
 * `https://user.github.io/bouche-cousue/` as readily as a domain root.
 */
const LOCALES_URL = new URL(`../${I18N.PATH}/`, import.meta.url);

let locale = I18N.FALLBACK;
let messages = {};
let fallbackMessages = {};

const listeners = new Set();

/**
 * Picks the initial language: a remembered choice first, then the browser's
 * preferences, then the fallback.
 */
function detectLocale() {
  const remembered = readRaw(STORAGE_KEYS.locale);
  if (remembered && I18N.SUPPORTED.includes(remembered)) return remembered;

  const preferences = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const tag of preferences) {
    const code = String(tag ?? "").slice(0, 2).toLowerCase();
    if (I18N.SUPPORTED.includes(code)) return code;
  }

  return I18N.FALLBACK;
}

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
 * Translates a key, falling back to the default locale and finally to the key
 * itself, so a missing translation degrades visibly instead of crashing.
 *
 * @param {string} key            dotted path, e.g. `warning.open.title`
 * @param {object} [placeholders] extra `{name}` values to substitute
 */
export function t(key, placeholders = {}) {
  const value = lookup(messages, key) ?? lookup(fallbackMessages, key);
  if (typeof value !== "string") return key;

  return Object.entries({ ...GLOBAL_PLACEHOLDERS, ...placeholders })
    .reduce((text, [name, replacement]) => text.replaceAll(`{${name}}`, replacement), value);
}

export function getLocale() {
  return locale;
}

/** Formats a millisecond duration as seconds, using the locale's separator. */
export function formatSeconds(milliseconds) {
  const formatter = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  });
  return `${formatter.format(milliseconds / 1000)} ${t("settings.secondsUnit")}`;
}

/**
 * Registers a callback fired whenever the language changes, for text that
 * cannot be expressed as a static `data-i18n` binding.
 */
export function onLocaleChange(listener) {
  listeners.add(listener);
}

/** Rewrites everything bound through `data-i18n*` attributes, then notifies listeners. */
export function translateDocument() {
  document.documentElement.lang = locale;
  document.title = t("app.title");

  for (const node of document.querySelectorAll("[data-i18n]")) {
    node.textContent = t(node.dataset.i18n);
  }
  for (const node of document.querySelectorAll("[data-i18n-html]")) {
    node.innerHTML = t(node.dataset.i18nHtml);
  }
  for (const node of document.querySelectorAll("[data-i18n-placeholder]")) {
    node.placeholder = t(node.dataset.i18nPlaceholder);
  }
  for (const node of document.querySelectorAll("[data-i18n-aria-label]")) {
    node.setAttribute("aria-label", t(node.dataset.i18nAriaLabel));
  }

  for (const listener of listeners) listener();
}

export async function setLocale(code) {
  if (!I18N.SUPPORTED.includes(code) || code === locale) return;

  messages = code === I18N.FALLBACK ? fallbackMessages : await fetchLocale(code);
  locale = code;
  writeRaw(STORAGE_KEYS.locale, code);
  translateDocument();
}

/** Loads the fallback locale plus the detected one. Call before rendering. */
export async function initI18n() {
  fallbackMessages = await fetchLocale(I18N.FALLBACK);

  const detected = detectLocale();
  messages = detected === I18N.FALLBACK ? fallbackMessages : await fetchLocale(detected);
  locale = detected;
}
