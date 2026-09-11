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

/**
 * How much evidence each state has, in milliseconds: a state gains while the
 * reading says so and loses while the reading says anything else. Per state
 * rather than one running candidate, because three-cornered flicker — an open
 * mouth the pacifier heuristic keeps misreading — would otherwise have each
 * contender wiping the other's score and none of them ever winning.
 */
const evidence = { [CLOSED]: 0, [REASON.OPEN]: 0, [REASON.AWAY]: 0, [REASON.COVERED]: 0, [REASON.PACIFIER]: 0 };
let lastFrameAt = 0;
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
  for (const key of Object.keys(evidence)) evidence[key] = 0;
  lastFrameAt = now;
}

/* ---------- Frame handling ---------- */

/**
 * What this frame says the mouth is doing — or `null` inside the dead band,
 * between the two thresholds, where the reading is not decisive and whatever
 * was decided last still stands.
 */
function classify(reading) {
  if (!reading.faceVisible) return REASON.AWAY;
  if (reading.handsOnMouth) return REASON.COVERED;
  if (reading.pacifier) return REASON.PACIFIER;
  if (reading.openness > settings.openThreshold) return REASON.OPEN;
  if (reading.openness < settings.openThreshold * DETECTION.CLOSE_FACTOR) return CLOSED;
  return null;
}

/**
 * Hysteresis in time, laid over the dead band's hysteresis in value: a state
 * has to be worth `TIMING.SETTLE` of evidence before it displaces the current
 * one, and every frame that says otherwise gives some of that back.
 *
 * Without this a single contrary frame restarted the clock of whatever it
 * flipped to — and the lip landmarks jitter, while the hand and pacifier
 * heuristics are coarser still. A mouth held anywhere near the limit reset the
 * warning delay several times a second, so the warning never arrived at all and
 * the badge blinked between the two states saying so.
 *
 * Evidence rather than an unbroken run, because an unbroken run is exactly what
 * a jittering reading never gives: at fourteen flips a second neither side ever
 * holds for long enough, and the machine would sit frozen on whichever state it
 * happened to be in. What decides it here is which reading is in the majority.
 *
 * Promotion dates the clock back over the evidence that earned it, so the
 * delays stay the length they claim to be.
 */
function settle(state, now) {
  // Frames arrive irregularly — in some front ends the loop is a timer that can
  // be throttled — so evidence is weighed in milliseconds, never in frames. A
  // long gap means we know nothing, so it counts for no more than a whole
  // settling and the fresh reading wins.
  const step = Math.min(now - lastFrameAt, TIMING.SETTLE);
  lastFrameAt = now;

  for (const key of Object.keys(evidence)) {
    evidence[key] = key === state
      ? Math.min(evidence[key] + step, TIMING.SETTLE)
      : Math.max(evidence[key] - step, 0);
  }

  // `null` is the dead band, where the reading is not decisive: every state
  // alike loses ground and whatever is current simply stays.
  if (state === null || state === currentState) return;
  if (evidence[state] < TIMING.SETTLE) return;

  currentState = state;
  enteredAt[state] = now - evidence[state];
}

/** Warn once the delay passes, pause once the warning has had its time. */
function applyDelays(elapsed, reason, delay) {
  if (elapsed > delay + settings.pauseDelay) pauseVideo(reason);
  else if (elapsed > delay) showWarning(reason);
}

function handleReading(reading, now) {
  settle(classify(reading), now);
  const elapsed = now - enteredAt[currentState];

  if (currentState === REASON.AWAY) {
    sink.ui.setStatus(`status.${REASON.AWAY}`, false);
    sink.ui.resetGauge();
    applyDelays(elapsed, REASON.AWAY, TIMING.FACE_LOST);
    return;
  }

  // The gauge follows the raw reading rather than the settled state: it is a
  // meter to read, not a decision. A frame with no face leaves it where it was.
  if (reading.faceVisible) {
    const ratio = reading.openness / (settings.openThreshold * 2);
    sink.ui.setGauge(ratio, reading.openness > settings.openThreshold);
  }

  if (currentState === CLOSED) {
    // Between the two thresholds the previous state is held: that dead band is
    // what stops the video flickering when the lips hover at the limit.
    sink.ui.setStatus("status.closed", true);
    if (warningReason) clearWarning();
    if (paused && elapsed > TIMING.RESUME) resumeVideo();
    return;
  }

  sink.ui.setStatus(`status.${currentState}`, false);
  if (warningReason && warningReason !== currentState) clearWarning();
  applyDelays(elapsed, currentState, settings.warningDelay);
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
