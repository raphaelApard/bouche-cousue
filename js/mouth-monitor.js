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

/**
 * How much evidence each state has, in milliseconds: a state gains while the
 * reading says so and loses while the reading says anything else. Per state
 * rather than one running candidate, because three-cornered flicker — an open
 * mouth the pacifier heuristic keeps misreading — would otherwise have each
 * contender wiping the other's score and none of them ever winning.
 */
const evidence = { [CLOSED]: 0, [REASON.OPEN]: 0, [REASON.AWAY]: 0, [REASON.COVERED]: 0, [REASON.PACIFIER]: 0 };
let lastFrameAt = 0;

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
  for (const key of Object.keys(evidence)) evidence[key] = 0;
  lastFrameAt = now;
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
  if (elapsed > delay + settings.pauseDelay) pauseFilm(reason);
  else if (elapsed > delay) showWarning(reason);
}

function handleReading(reading, now) {
  settle(classify(reading), now);
  const elapsed = now - enteredAt[currentState];

  if (currentState === REASON.AWAY) {
    ui.setStatus(`status.${REASON.AWAY}`, false);
    ui.resetGauge();
    applyDelays(elapsed, REASON.AWAY, TIMING.FACE_LOST);
    return;
  }

  // The gauge follows the raw reading rather than the settled state: it is a
  // meter to read, not a decision. A frame with no face leaves it where it was.
  if (reading.faceVisible) {
    const ratio = reading.openness / (settings.openThreshold * 2);
    ui.setGauge(ratio, reading.openness > settings.openThreshold);
  }

  if (currentState === CLOSED) {
    // Between the two thresholds the previous state is held: that dead band is
    // what stops the film flickering when the lips hover at the limit.
    ui.setStatus("status.closed", true);
    if (warningReason) clearWarning();
    if (paused && elapsed > TIMING.RESUME) resumeFilm();
    return;
  }

  ui.setStatus(`status.${currentState}`, false);
  if (warningReason && warningReason !== currentState) clearWarning();
  applyDelays(elapsed, currentState, settings.warningDelay);
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
