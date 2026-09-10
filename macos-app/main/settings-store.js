/**
 * The preferences file: three slider positions and two choices.
 *
 * The extensions keep these in `storage.local`; a desktop app has to pick a
 * file, so this is `settings.json` in the app's user-data folder. Nothing else
 * is ever written there — no frames, no readings, no history. If that ever
 * changes, the Privacy section of the README has to change with it.
 *
 * Values are stored as strings, exactly as the extensions store them, so that
 * `numberInRange()` in `lib/storage.js` stays the one place that decides what
 * a stored value is worth.
 */

import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

import { STORAGE_KEYS } from "../lib/config.js";

/** Only these keys are ever accepted from a renderer. */
const ALLOWED = new Set(Object.values(STORAGE_KEYS));

/** Sliders fire on every pixel of drag; the disk does not need to hear it. */
const FLUSH_DELAY = 400;

let file = null;
let values = {};
let pending = null;

export function load() {
  file = path.join(app.getPath("userData"), "settings.json");
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    // A hand-edited or truncated file is not worth refusing to start over.
    if (parsed && typeof parsed === "object") values = parsed;
  } catch {
    values = {};
  }
}

/** @param {string[]} keys @returns {object} the stored values among them. */
export function readAll(keys) {
  return Object.fromEntries(
    keys.filter(key => key in values).map(key => [key, values[key]])
  );
}

export function get(key) {
  return values[key];
}

export function write(key, value) {
  if (!ALLOWED.has(key)) return;
  values[key] = String(value).slice(0, 64);

  clearTimeout(pending);
  pending = setTimeout(flush, FLUSH_DELAY);
}

export function flush() {
  clearTimeout(pending);
  pending = null;
  try {
    fs.writeFileSync(file, `${JSON.stringify(values, null, 2)}\n`);
  } catch (error) {
    console.warn("Preferences could not be saved.", error);
  }
}
