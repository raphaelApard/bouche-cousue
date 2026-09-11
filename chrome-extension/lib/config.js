/**
 * Shared constants.
 *
 * Nothing in here depends on the DOM or on any other module, so it is safe to
 * import from anywhere. The detection values are the ones the web app uses;
 * keep the two in step.
 */

/**
 * Why the video stopped. These values double as translation key segments
 * (`warning.<reason>.title`, `paused.<reason>.text`, `status.<reason>`), so
 * renaming one means renaming it in `locales/fr.json` too.
 */
export const REASON = Object.freeze({
  AWAY: "away",
  COVERED: "covered",
  PACIFIER: "pacifier",
  OPEN: "open"
});

/**
 * Face landmark indices from the MediaPipe FaceLandmarker topology.
 * Changing these requires consulting that specification.
 */
export const LANDMARK = Object.freeze({
  UPPER_LIP: 13,
  LOWER_LIP: 14,
  FOREHEAD: 10,
  CHIN: 152,
  MOUTH_LEFT: 61,
  MOUTH_RIGHT: 291
});

/** `storage.local` keys. Only preferences are ever stored. */
export const STORAGE_KEYS = Object.freeze({
  sensitivity: "p4l.sensitivity",
  warningDelay: "p4l.warningDelay",
  pauseDelay: "p4l.pauseDelay"
});

export const DETECTION = Object.freeze({
  /**
   * Hysteresis. The mouth counts as open above `openThreshold` and as closed
   * only below `openThreshold * CLOSE_FACTOR`. Between the two the previous
   * state is held, which stops the video flickering when the lips hover right
   * at the limit. Do not collapse this into a single threshold.
   */
  CLOSE_FACTOR: 0.6,

  /** Sensitivity slider (15..90) maps to a threshold via `BASE - value/1000`. */
  SENSITIVITY_BASE: 0.095,

  /** A hand landmark closer than `faceHeight * this` counts as covering the mouth. */
  HAND_REACH: 0.35,

  /** Share of vivid pixels around the mouth above which a pacifier is assumed. */
  PACIFIER_RATIO: 0.3
});

/** Fixed timings, in milliseconds. The other two delays are user settings. */
export const TIMING = Object.freeze({
  /**
   * A reading has to hold for this long before it displaces the current state.
   * The dead band is hysteresis in value; this is hysteresis in time, and
   * without it one jittery frame restarts the delay it flips to.
   */
  SETTLE: 250,
  RESUME: 700,          // mouth closed before the video resumes
  FACE_LOST: 1800,      // no face before the warning appears
  REWARD_COOLDOWN: 3000 // minimum gap between two "well done" flashes
});

/**
 * The detection loop.
 *
 * `TICK` drives a timer rather than `requestAnimationFrame`: the loop runs in
 * the background page, which is never painted, so animation frames would never
 * arrive at all. Timers there can still be throttled, so the state machine is
 * written against the clock rather than against a tick count — a slowed loop
 * stays correct, only coarser.
 *
 * `HEARTBEAT` and `WATCHDOG` are the other half of that bargain: the pages
 * pause themselves if the engine goes quiet, so a suspended or crashed
 * background page can never leave a video running unwatched. The heartbeat
 * doubles as the keep-alive that stops Firefox suspending the event page —
 * see `pageSink` in `background.js`. The margin is wide enough that a loop
 * throttled to one tick per second never trips it.
 */
export const LOOP = Object.freeze({
  TICK: 80,
  HEARTBEAT: 1000,
  WATCHDOG: 8000
});

/** Vendored MediaPipe runtime and models, resolved through `runtime.getURL`. */
export const MEDIAPIPE = Object.freeze({
  VISION_WASM: "vendor/tasks-vision/wasm",
  FACE_MODEL: "vendor/models/face_landmarker.task",
  HAND_MODEL: "vendor/models/hand_landmarker.task"
});

export const CAMERA = Object.freeze({ width: 480, height: 360 });

export const I18N = Object.freeze({
  LOCALE: "fr",
  PATH: "locales"
});
