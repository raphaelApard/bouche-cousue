/**
 * Which catalogue episodes were watched, and how often — so the list can tell
 * a child "this one again?" from "a new one".
 *
 * Kept in this browser only, under `STORAGE_KEYS.watched`, as
 * `{ [videoId]: { views, started } }`. `started` is set when an episode is
 * opened; `views` goes up by one only when it plays to its end. Nothing else
 * is recorded: no dates, no durations, nothing about the child.
 *
 * The stored object is re-validated on every read, entry by entry, so a value
 * edited by hand or left by an older version drops the bad entries rather than
 * the whole history.
 */

import { CATALOG, STORAGE_KEYS } from "./config.js";
import { readJsonObject, removeRaw, writeRaw } from "./storage.js";

const VIDEO_ID = /^[\w-]{11}$/;

/** @typedef {{views: number, started: boolean}} Entry */

/** @returns {Map<string, Entry>} */
function load() {
  const stored = readJsonObject(STORAGE_KEYS.watched) ?? {};
  const history = new Map();
  for (const [id, entry] of Object.entries(stored)) {
    if (!VIDEO_ID.test(id) || !entry || typeof entry !== "object") continue;
    const views = Number.isInteger(entry.views)
      ? Math.min(Math.max(entry.views, 0), CATALOG.MAX_VIEWS)
      : 0;
    history.set(id, { views, started: entry.started === true || views > 0 });
  }
  return history;
}

function save(history) {
  writeRaw(STORAGE_KEYS.watched, JSON.stringify(Object.fromEntries(history)));
}

function update(id, change) {
  if (!VIDEO_ID.test(id)) return;
  const history = load();
  history.set(id, change(history.get(id) ?? { views: 0, started: false }));
  save(history);
}

/** @returns {Entry} never null: an unseen episode is `{ views: 0, started: false }`. */
export function getEntry(id) {
  return load().get(id) ?? { views: 0, started: false };
}

/** The episode was opened. */
export function recordStart(id) {
  update(id, entry => ({ ...entry, started: true }));
}

/** The episode played to its end. */
export function recordEnd(id) {
  update(id, entry => ({
    started: true,
    views: Math.min(entry.views + 1, CATALOG.MAX_VIEWS)
  }));
}

/** Whether there is anything to clear. */
export function hasHistory() {
  return load().size > 0;
}

export function clearHistory() {
  removeRaw(STORAGE_KEYS.watched);
}
