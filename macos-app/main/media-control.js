/**
 * The macOS half of the rule: how a video actually gets stopped.
 *
 * The web app owns its `<video>` and the extensions own the tab's, so both can
 * simply call `pause()`. Here the film belongs to somebody else — Firefox,
 * QuickTime, VLC, a streaming app — and the only ways in are the ones macOS
 * offers to any script.
 *
 * There are two, and they are not equal:
 *
 * - **An Apple event to a named application** says "pause" and means it. It is
 *   idempotent, the app can be asked what it is doing, and the permission it
 *   costs — Automation — is asked for by macOS the first time, in a dialog the
 *   adult can answer. It only reaches applications that are scriptable, which
 *   Firefox is not.
 *
 * - **The keyboard's play/pause key**, posted as the keyboard itself would,
 *   reaches whatever is playing, scriptable or not. It costs far more: macOS
 *   only lets an app press keys for the user if that app is listed under
 *   Accessibility, and — this is the trap — a refusal is *silent*. The event
 *   is swallowed, `osascript` exits 0, and nothing happens. It is also a
 *   *toggle*, so the state below has to be tracked rather than commanded.
 *
 * So the default target is `auto`: drive the player that is actually there
 * with the channel that suits it, and fall back to the key only for a player
 * no Apple event can reach. That is what makes VLC or Safari work with no
 * Accessibility permission at all.
 */

import { execFile } from "node:child_process";
import { systemPreferences } from "electron";

import { DEFAULTS, TARGETS } from "../lib/config.js";

/** Media key code for play/pause, from `IOKit/hidsystem/ev_keymap.h`. */
const NX_KEYTYPE_PLAY = 16;

/**
 * Posts one media key as a system-defined NSEvent, the way the keyboard does.
 * Written in JavaScript for Automation because that is the only scripting
 * language on a stock Mac with a bridge to AppKit — no compiler, no helper
 * binary, nothing to ship.
 */
const MEDIA_KEY_SCRIPT = `
ObjC.import('Cocoa');
ObjC.import('CoreGraphics');
function press(key, down) {
  var flags = down ? 0xa00 : 0xb00;
  var event = $.NSEvent.otherEventWithTypeLocationModifierFlagsTimestampWindowNumberContextSubtypeData1Data2(
    14, $.NSMakePoint(0, 0), flags, 0, 0, $(), 8, (key << 16) | flags, -1);
  $.CGEventPost(0, event.CGEvent);
}
press(${NX_KEYTYPE_PLAY}, true);
press(${NX_KEYTYPE_PLAY}, false);
`;

/** Virtual key code for the space bar, from `Carbon/Events.h`. */
const KEY_SPACE = 49;

/**
 * Types a space into whatever is in front, which is how a person pauses a
 * video in Firefox — and in most players, since they nearly all bind it.
 *
 * It is a plain keyboard event rather than the system-defined one above, and
 * that is the point of having both: they travel by different routes, so a Mac
 * that ignores one may well answer the other. Both need the same Accessibility
 * permission; neither is a way around it.
 */
const SPACE_KEY_SCRIPT = `
ObjC.import('Cocoa');
ObjC.import('CoreGraphics');
var source = $.CGEventSourceCreate(1);
$.CGEventPost(0, $.CGEventCreateKeyboardEvent(source, ${KEY_SPACE}, true));
$.CGEventPost(0, $.CGEventCreateKeyboardEvent(source, ${KEY_SPACE}, false));
`;

/** The two channels that press a key rather than send an Apple event. */
const KEY_SCRIPTS = { mediakey: MEDIA_KEY_SCRIPT, space: SPACE_KEY_SCRIPT };

/**
 * Apps a space bar must never be typed into.
 *
 * Unlike the media key, a space goes wherever the keyboard is pointing. In the
 * Finder it opens Quick Look, and in this app's own panel it presses whatever
 * button has focus — so those two are refused outright, and the child's film,
 * which is the window in front while they watch, is not.
 */
const NEVER_SPACE = ["Finder", "Bouche Cousue", "Electron"];

/** Pauses and resumes every media element in the front page. */
const BROWSER_JS = action =>
  `document.querySelectorAll('video,audio').forEach(function (m) { m.${action}(); })`;

/**
 * The players this app knows by name: what to look for in the process list,
 * what `lsappinfo` calls them, and the AppleScript for each half of the pair.
 *
 * Firefox is in here without a script on purpose. It is not scriptable, so the
 * only way into it is the media key — but knowing it is the one playing is
 * still worth something: `auto` can pick the right channel, and the panel can
 * say why the key is needed.
 */
const PLAYERS = {
  vlc: {
    process: "VLC",
    display: "VLC",
    // VLC's `play` is a toggle too, but unlike the media key it can be asked
    // first whether it is playing, so the pair still says what it means.
    pause: `tell application "VLC" to if playing then play`,
    play:  `tell application "VLC" to if not playing then play`
  },
  quicktime: {
    process: "QuickTime Player",
    display: "QuickTime Player",
    pause: `tell application "QuickTime Player" to if (exists document 1) then pause document 1`,
    play:  `tell application "QuickTime Player" to if (exists document 1) then play document 1`
  },
  safari: {
    process: "Safari",
    display: "Safari",
    pause: `tell application "Safari" to do JavaScript "${BROWSER_JS("pause")}" in front document`,
    play:  `tell application "Safari" to do JavaScript "${BROWSER_JS("play")}" in front document`
  },
  chrome: {
    process: "Google Chrome",
    display: "Google Chrome",
    pause: `tell application "Google Chrome" to tell active tab of front window to execute javascript "${BROWSER_JS("pause")}"`,
    play:  `tell application "Google Chrome" to tell active tab of front window to execute javascript "${BROWSER_JS("play")}"`
  },
  firefox: {
    process: "firefox",
    display: "Firefox"
    // No script: Firefox answers no Apple events. The key is the only way in.
  }
};

/** Where `auto` looks when nothing recognisable is in front: films first. */
const AUTO_ORDER = ["vlc", "quicktime", "safari", "chrome"];

/** Which player to drive, as chosen in the panel. */
let target = DEFAULTS.target;

/**
 * What the player is believed to be doing: `null` until we have set it
 * ourselves, which is the only honest starting point — nothing can be asked.
 */
let state = null;

/** The last thing that went wrong, and the channel it went wrong on. */
let lastError = null;
let lastChannel = null;

/* ---------- Asking macOS what is there ---------- */

function run(command, args) {
  return new Promise(resolve => {
    execFile(command, args, { timeout: 4000 }, (error, stdout, stderr) => {
      resolve({ ok: !error, out: stdout ?? "", error: error ? (stderr.trim() || error.message) : null });
    });
  });
}

/**
 * Whether a player is open, matched on its bundle's executable path — which
 * also catches an app's helper processes, but the question is only whether it
 * is there at all.
 *
 * This is asked of `pgrep`, never of AppleScript:
 * `if application "VLC" is running then tell application "VLC" …` reads as a
 * guard and is not one, because compiling the `tell` block fetches the app's
 * terminology and that alone launches it (measured — VLC opened on a machine
 * where the guard said it was closed).
 */
async function isOpen(id) {
  const { ok } = await run("pgrep", ["-f", `\\.app/Contents/MacOS/${PLAYERS[id].process}`]);
  return ok;
}

/**
 * The name of the application in front.
 *
 * `lsappinfo` is a stock command that reads the window server's own list: no
 * permission, no prompt, and a handful of milliseconds. System Events could
 * answer the same question but would cost an Automation prompt to do it.
 */
async function frontmostApp() {
  const front = await run("lsappinfo", ["front"]);
  if (!front.ok || !front.out.trim()) return null;

  const named = await run("lsappinfo", ["info", "-only", "name", front.out.trim()]);
  if (!named.ok) return null;

  return (named.out.match(/"LSDisplayName"="([^"]*)"/) ?? [])[1] ?? null;
}

/** The player in front, if it is one we know by name. */
async function frontmostPlayer() {
  const name = await frontmostApp();
  return Object.keys(PLAYERS).find(id => PLAYERS[id].display === name) ?? null;
}

/**
 * Which channel this command should go through.
 *
 * A fixed target is taken at its word. `auto` prefers whatever is in front —
 * while a child is watching, the film is the front window. A player in front
 * that answers no Apple event is offered the space bar instead, which is what
 * a person would press: it is the same permission as the media key but a
 * different kind of event, so it is worth trying where the other fails.
 * Failing all that, the first known player merely open, and then the key.
 */
async function resolve() {
  if (target !== "auto") return target;

  const front = await frontmostPlayer();
  if (front) return PLAYERS[front].pause ? front : "space";

  for (const id of AUTO_ORDER) {
    if (await isOpen(id)) return id;
  }
  return "mediakey";
}

/* ---------- Doing it ---------- */

/**
 * Whether posting a media key would actually reach anything.
 *
 * Checked before every press, not once at startup: an unsigned build gets a
 * new ad-hoc signature each time it is rebuilt, which quietly invalidates the
 * Accessibility permission granted to the previous one.
 */
function trusted() {
  return systemPreferences.isTrustedAccessibilityClient(false);
}

/**
 * @returns {Promise<boolean>} whether the player was reached and told. False
 *   means nothing happened, and the belief above must not move.
 */
async function send(channel, action) {
  lastChannel = channel;

  const player = PLAYERS[channel];
  const script = KEY_SCRIPTS[channel] ?? (player?.[action] ? null : KEY_SCRIPTS.mediakey);

  // A key press, by one route or the other.
  if (script) {
    // Asked first because it is the specific fact about this press. The
    // missing permission has a notice of its own, driven by `hasAccessibility`
    // rather than by whatever went wrong last, so nothing is hidden by this
    // order.
    if (script === KEY_SCRIPTS.space && NEVER_SPACE.includes(await frontmostApp())) {
      lastError = "notfront";
      return false;
    }
    if (!trusted()) {
      // Pressing anyway would look like success — `osascript` exits 0 whether
      // or not macOS swallowed the event — and would leave the belief
      // inverted, so the next real pause would press nothing at all.
      lastError = "accessibility";
      return false;
    }
    const { ok, error } = await run("osascript", ["-l", "JavaScript", "-e", script]);
    lastError = error;
    return ok;
  }

  if (!await isOpen(channel)) {
    lastError = null;   // a closed player is not a failure; there is no film
    return false;
  }

  const { ok, error } = await run("osascript", ["-e", player[action]]);
  lastError = error;
  return ok;
}

/* ---------- What the rule asks for ---------- */

/** @param {string} id  one of `TARGETS`; anything else falls back to the default. */
export function setTarget(id) {
  const next = TARGETS.includes(id) ? id : DEFAULTS.target;
  if (next === target) return;
  target = next;
  state = null;   // a new player is a player we know nothing about
  lastError = null;
}

export function currentTarget() {
  return target;
}

export function lastFailure() {
  return lastError;
}

/** The channel the last command went through, for the panel to explain itself. */
export function channelUsed() {
  return lastChannel;
}

/**
 * Whether the media key is even available to this app.
 *
 * `auto` reports it too, because a player like Firefox can only be reached
 * that way — the panel says so as a warning rather than an error.
 *
 * @param {boolean} [prompt]  open the System Settings pane if not yet granted.
 */
export function hasAccessibility(prompt = false) {
  if (!["mediakey", "space", "auto"].includes(target)) return true;
  return prompt ? systemPreferences.isTrustedAccessibilityClient(true) : trusted();
}

/**
 * Called once when the rule starts watching, before any mouth has been read.
 *
 * It presses nothing, and that is the whole point. The state machine opens by
 * parking the film — "ferme la bouche pour lancer la vidéo" — which for a tab
 * is a real `pause()` and here would be a blind press of a toggle at the one
 * moment we know least: usually the adult has activated the rule *before*
 * starting the film, so the press lands on nothing playing and leaves us
 * believing we paused something. Every later press is then off by one, and the
 * mouth appears to do nothing at all.
 *
 * So the assumption is the useful one: a film is playing, or is about to be.
 * The first open mouth acts, and from there the alternation is honest. If it
 * ever does fall out of step — the child hits the space bar, a film ends — the
 * panel's ▶/⏸ acts and flips the belief at once, which puts the two back
 * together.
 */
export function arm() {
  state = "playing";
  lastError = null;
}

/**
 * The belief only matters on the key, which can merely be swapped. A named
 * player is told outright every time: saying "pause" twice to VLC pauses it
 * once, so there is nothing to guard against and no drift to accumulate.
 */
function isToggle(channel, action) {
  return !PLAYERS[channel]?.[action];
}

/** Stops the video, if it is not believed to be stopped already. */
export async function pause() {
  const channel = await resolve();
  if (isToggle(channel, "pause") && state === "paused") return;
  if (await send(channel, "pause")) state = "paused";
}

/** Starts the video again, if it is not believed to be playing already. */
export async function play() {
  const channel = await resolve();
  if (isToggle(channel, "play") && state === "playing") return;
  if (await send(channel, "play")) state = "playing";
}

/**
 * Says "pause" again to a film that is supposed to be stopped.
 *
 * This is how the rule holds: the state machine speaks only when something
 * changes, but a child can restart the film themselves, and nothing would say
 * otherwise until their mouth next moved. An Apple event can be repeated all
 * day — VLC is asked to pause only `if playing`, and a browser's `pause()` on
 * an already-paused video does nothing — so repeating it costs nothing and
 * catches a film that started again.
 *
 * A key press cannot be repeated: pressing a toggle that we believe is already
 * stopped would start it. So on those channels this does nothing at all, and
 * says so, rather than fighting the player.
 *
 * @returns {Promise<boolean>} whether the order could be repeated.
 */
export async function hold() {
  const channel = await resolve();
  if (isToggle(channel, "pause")) return false;
  return send(channel, "pause");
}

/**
 * Hands the player back to whoever was watching: the film resumes, and this
 * module forgets what it thought it knew. Called when monitoring stops, so
 * turning the rule off never leaves a film parked with nobody to restart it.
 */
export async function release() {
  if (state === "paused") await play();
  state = null;
}
