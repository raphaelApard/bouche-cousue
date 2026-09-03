/**
 * The rule the whole app exists for: the film plays while the mouth is closed.
 *
 * Runs one detection per animation frame, decides what the mouth is doing, and
 * turns that into a warning, a pause, or a resume. Every side effect goes
 * through `ui` (what is shown) and `player` (what is played).
 */

import { DETECTION, REASON, TIMING } from "./config.js";
import { initDetector, isReady, readFrame, startCamera } from "./detector.js";
import { settings } from "./settings.js";
import { t } from "./i18n.js";
import * as player from "./player.js";
import * as ui from "./ui.js";

const CLOSED = "closed";

let currentState = CLOSED;
/** When the current state was entered, keyed by state name. */
const enteredAt = { [CLOSED]: 0, [REASON.OPEN]: 0, [REASON.AWAY]: 0, [REASON.COVERED]: 0, [REASON.PACIFIER]: 0 };

let paused = false;
let manuallyPaused = false;
let running = false;
let warningReason = null;

const playbackListeners = new Set();

/** Notifies the playback bar so its ▶/⏸ icon matches reality. */
export function onPlaybackChange(listener) {
  playbackListeners.add(listener);
}

function notifyPlaybackChange() {
  for (const listener of playbackListeners) listener();
}

export function isPlaying() {
  return !paused && !manuallyPaused;
}

/* ---------- Transitions ---------- */

function showWarning(reason) {
  if (paused || warningReason === reason) return;
  warningReason = reason;
  ui.showVeil(`warning.${reason}`, { warning: true });
}

function clearWarning() {
  if (paused || !warningReason) return;
  warningReason = null;
  ui.hideVeil();
}

function pauseFilm(reason) {
  if (paused) return;
  paused = true;
  warningReason = null;
  player.pause();
  ui.showVeil(`paused.${reason}`, { lost: reason === REASON.AWAY });
  notifyPlaybackChange();
}

function resumeFilm() {
  if (!paused) return;
  paused = false;
  warningReason = null;
  ui.hideVeil();
  ui.flashReward();
  player.play();
  notifyPlaybackChange();
}

/* ---------- Manual override ----------
   A manual pause suspends mouth control entirely: the film stays put until an
   adult starts it again, whatever the child's lips do. */

export function togglePlayback() {
  if (!player.isPlayable()) return;

  if (paused || manuallyPaused) {
    manuallyPaused = false;
    paused = false;
    warningReason = null;
    ui.hideVeil();
    resetTimers(); // fresh delays, so an open mouth is not punished instantly
    player.play();
  } else {
    manuallyPaused = true;
    paused = true;
    warningReason = null;
    player.pause();
    ui.setStatus("status.paused");
    ui.showVeil("veil.manual");
  }

  notifyPlaybackChange();
}

function resetTimers() {
  const now = performance.now();
  for (const key of Object.keys(enteredAt)) enteredAt[key] = now;
}

/**
 * Opens a newly chosen film in the paused state, so it starts the way every
 * other resume does: by closing the mouth.
 */
export function armForNewFilm() {
  manuallyPaused = false;
  warningReason = null;
  paused = true;
  ui.showVeil("veil.start");
  notifyPlaybackChange();
}

/* ---------- Frame handling ---------- */

/** Records entry into a state and returns how long we have been in it. */
function timeInState(state, now) {
  if (currentState !== state) {
    currentState = state;
    enteredAt[state] = now;
  }
  return now - enteredAt[state];
}

/** Warn once the delay passes, pause once the warning has had its time. */
function applyDelays(elapsed, reason, delay) {
  if (elapsed > delay + settings.pauseDelay) pauseFilm(reason);
  else if (elapsed > delay) showWarning(reason);
}

function handleReading(reading, now) {
  if (!reading.faceVisible) {
    ui.setStatus(`status.${REASON.AWAY}`, false);
    ui.resetGauge();
    applyDelays(timeInState(REASON.AWAY, now), REASON.AWAY, TIMING.FACE_LOST);
    return;
  }
  if (warningReason === REASON.AWAY) clearWarning();

  const { openness } = reading;
  ui.setGauge(openness / (settings.openThreshold * 2), openness > settings.openThreshold);

  if (reading.handsOnMouth) {
    ui.setStatus(`status.${REASON.COVERED}`, false);
    applyDelays(timeInState(REASON.COVERED, now), REASON.COVERED, settings.warningDelay);

  } else if (reading.pacifier) {
    ui.setStatus(`status.${REASON.PACIFIER}`, false);
    if (warningReason === REASON.COVERED) clearWarning();
    applyDelays(timeInState(REASON.PACIFIER, now), REASON.PACIFIER, settings.warningDelay);

  } else if (openness > settings.openThreshold) {
    ui.setStatus(`status.${REASON.OPEN}`, false);
    if (warningReason === REASON.COVERED || warningReason === REASON.PACIFIER) clearWarning();
    applyDelays(timeInState(REASON.OPEN, now), REASON.OPEN, settings.warningDelay);

  } else if (openness < settings.openThreshold * DETECTION.CLOSE_FACTOR) {
    // Between the two thresholds the previous state is kept: that dead band is
    // what stops the film flickering when the lips hover at the limit.
    ui.setStatus("status.closed", true);
    if (warningReason) clearWarning();
    if (paused && timeInState(CLOSED, now) > TIMING.RESUME) resumeFilm();
  }
}

function tick() {
  if (!running) return;
  requestAnimationFrame(tick);

  if (manuallyPaused) return; // the mouth drives nothing while paused by hand
  if (!isReady()) return;

  const reading = readFrame();
  if (reading) handleReading(reading, performance.now());
}

/* ---------- Lifecycle ---------- */

export function isRunning() {
  return running;
}

/**
 * Loads the models, opens the camera, and starts the detection loop.
 * Safe to call more than once; only the first call does the work.
 *
 * @returns {Promise<boolean>} whether monitoring is now running.
 */
export async function startMonitoring() {
  if (running) return true;
  running = true;

  ui.setStatus("status.loading");
  try {
    await Promise.all([initDetector(), startCamera()]);
  } catch (error) {
    console.error(error);
    running = false;
    ui.setStatus("status.error");
    ui.markCameraFailed();
    alert(`${t("alerts.startFailed")} ${error.message}${t("alerts.startFailedHint")}`);
    return false;
  }

  ui.setStatus("status.ready");
  ui.markCameraReady();

  // The film starts the way every resume does: by closing the mouth.
  paused = true;
  ui.showVeil("veil.start");
  notifyPlaybackChange();

  requestAnimationFrame(tick);
  return true;
}

/** Returns to the idle state after a source is dropped. */
export function reset() {
  paused = false;
  manuallyPaused = false;
  warningReason = null;
  ui.hideVeil();
  notifyPlaybackChange();
}
