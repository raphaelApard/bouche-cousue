/**
 * The rule the whole app exists for: the video plays while the mouth stays
 * closed.
 *
 * Runs one detection per tick, decides what the mouth is doing, and turns that
 * into a warning, a pause, or a resume. It measures nothing and displays
 * nothing: every side effect goes through the two sinks handed to
 * `startMonitoring` — `ui` for what the adult sees, `page` for what happens to
 * the video.
 *
 * This file is the extensions' `lib/mouth-monitor.js`, unchanged but for this
 * comment: the rule is the same rule, and only the sinks differ. Here `ui` is
 * the panel under the menu bar, reached through the main process, and `page`
 * is whichever player is running on the Mac — see `main/media-control.js`.
 */

import { DETECTION, LOOP, REASON, TIMING } from "./config.js";
import { initDetector, isReady, readFrame, startCamera, stopCamera } from "./detector.js";
import { settings } from "./settings.js";

const CLOSED = "closed";

let currentState = CLOSED;
/** When the current state was entered, keyed by state name. */
const enteredAt = { [CLOSED]: 0, [REASON.OPEN]: 0, [REASON.AWAY]: 0, [REASON.COVERED]: 0, [REASON.PACIFIER]: 0 };

let paused = false;
let manuallyPaused = false;
let running = false;
let warningReason = null;
let timer = null;
let lastHeartbeat = 0;

/** @type {{ui: object, page: object}} */
let sink = null;

const playbackListeners = new Set();

/** Notifies the popup, if one is open, so its ▶/⏸ button matches reality. */
export function onPlaybackChange(listener) {
  playbackListeners.add(listener);
}

function notifyPlaybackChange() {
  for (const listener of playbackListeners) listener();
}

export function isPlaying() {
  return !paused && !manuallyPaused;
}

export function isRunning() {
  return running;
}

/* ---------- Transitions ---------- */

function showWarning(reason) {
  if (paused || warningReason === reason) return;
  warningReason = reason;
  sink.page.showVeil(`warning.${reason}`, { warning: true });
}

function clearWarning() {
  if (paused || !warningReason) return;
  warningReason = null;
  sink.page.hideVeil();
}

function pauseVideo(reason) {
  if (paused) return;
  paused = true;
  warningReason = null;
  sink.page.pause(`paused.${reason}`, { lost: reason === REASON.AWAY });
  notifyPlaybackChange();
}

function resumeVideo() {
  if (!paused) return;
  paused = false;
  warningReason = null;
  sink.page.play({ reward: true });
  notifyPlaybackChange();
}

/* ---------- Manual override ----------
   A manual pause suspends mouth control entirely: the video stays put until an
   adult starts it again, whatever the child's lips do. */

export function togglePlayback() {
  if (!running) return;

  if (paused || manuallyPaused) {
    manuallyPaused = false;
    paused = false;
    warningReason = null;
    resetTimers(); // fresh delays, so an open mouth is not punished instantly
    sink.page.play({ reward: false });
  } else {
    manuallyPaused = true;
    paused = true;
    warningReason = null;
    sink.ui.setStatus("status.paused", null);
    sink.page.pause("veil.manual");
  }

  notifyPlaybackChange();
}

function resetTimers() {
  const now = performance.now();
  for (const key of Object.keys(enteredAt)) enteredAt[key] = now;
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
  if (elapsed > delay + settings.pauseDelay) pauseVideo(reason);
  else if (elapsed > delay) showWarning(reason);
}

function handleReading(reading, now) {
  if (!reading.faceVisible) {
    sink.ui.setStatus(`status.${REASON.AWAY}`, false);
    sink.ui.resetGauge();
    applyDelays(timeInState(REASON.AWAY, now), REASON.AWAY, TIMING.FACE_LOST);
    return;
  }
  if (warningReason === REASON.AWAY) clearWarning();

  const { openness } = reading;
  sink.ui.setGauge(openness / (settings.openThreshold * 2), openness > settings.openThreshold);

  if (reading.handsOnMouth) {
    sink.ui.setStatus(`status.${REASON.COVERED}`, false);
    applyDelays(timeInState(REASON.COVERED, now), REASON.COVERED, settings.warningDelay);

  } else if (reading.pacifier) {
    sink.ui.setStatus(`status.${REASON.PACIFIER}`, false);
    if (warningReason === REASON.COVERED) clearWarning();
    applyDelays(timeInState(REASON.PACIFIER, now), REASON.PACIFIER, settings.warningDelay);

  } else if (openness > settings.openThreshold) {
    sink.ui.setStatus(`status.${REASON.OPEN}`, false);
    if (warningReason === REASON.COVERED || warningReason === REASON.PACIFIER) clearWarning();
    applyDelays(timeInState(REASON.OPEN, now), REASON.OPEN, settings.warningDelay);

  } else if (openness < settings.openThreshold * DETECTION.CLOSE_FACTOR) {
    // Between the two thresholds the previous state is kept: that dead band is
    // what stops the video flickering when the lips hover at the limit.
    sink.ui.setStatus("status.closed", true);
    if (warningReason) clearWarning();
    if (paused && timeInState(CLOSED, now) > TIMING.RESUME) resumeVideo();
  }
}

/**
 * One pass of the loop. Driven by a timer rather than by animation frames,
 * which never arrive in an unpainted background page — see `LOOP` in config.
 */
function tick() {
  if (!running) return;

  // Told regularly that the engine is alive, the pages pause themselves if
  // this ever stops arriving rather than play on unwatched. Once a second is
  // frequent enough for a watchdog measured in seconds.
  const now = performance.now();
  if (now - lastHeartbeat > LOOP.HEARTBEAT) {
    lastHeartbeat = now;
    sink.page.heartbeat();
  }

  if (manuallyPaused) return; // the mouth drives nothing while paused by hand
  if (!isReady()) return;

  const reading = readFrame();
  if (reading) handleReading(reading, performance.now());
}

/* ---------- Lifecycle ---------- */

/**
 * Loads the models, opens the camera, and starts the detection loop.
 * Safe to call more than once; only the first call does the work.
 *
 * @param {{ui: object, page: object}} sinks
 * @returns {Promise<boolean>} whether monitoring is now running.
 */
export async function startMonitoring(sinks) {
  if (running) return true;
  sink = sinks;
  running = true;

  sink.ui.setStatus("status.loading", null);
  try {
    await Promise.all([initDetector(), startCamera(sink.ui.cameraVideo)]);
  } catch (error) {
    console.error(error);
    running = false;
    sink.ui.failed(error);
    return false;
  }

  sink.ui.setStatus("status.ready", null);

  // The video starts the way every resume does: by closing the mouth.
  paused = true;
  manuallyPaused = false;
  warningReason = null;
  resetTimers();
  sink.page.pause("veil.start");
  notifyPlaybackChange();

  timer = setInterval(tick, LOOP.TICK);
  return true;
}

/** Stops watching and hands the pages back to the child. */
export function stopMonitoring() {
  if (!running) return;
  running = false;
  clearInterval(timer);
  timer = null;

  stopCamera();
  reset();
  sink.page.release();
  sink.ui.idle();
}

/** Returns to the idle state without touching the camera. */
export function reset() {
  paused = false;
  manuallyPaused = false;
  warningReason = null;
  currentState = CLOSED;
  notifyPlaybackChange();
}
