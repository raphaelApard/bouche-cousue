/**
 * Shared constants.
 *
 * Nothing in here depends on the DOM or on any other module, so it is safe to
 * import from anywhere.
 *
 * The detection constants below are the rule itself and are deliberately
 * identical to the ones the other front ends carry. A change to the rule
 * belongs in all of them; a change to the look belongs only here.
 */

/** Playback sources the app can drive. */
export const SOURCE = Object.freeze({
  YOUTUBE: "youtube",
  FILE: "file",
  DEMO: "demo"
});

/**
 * Why the film stopped. These values double as translation key segments
 * (`warning.<reason>.title`, `paused.<reason>.text`, `status.<reason>`,
 * `cause.<reason>`), so renaming one means renaming it in every locale file
 * too. They are also the mascot expressions listed in `MASCOT`.
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

/**
 * localStorage keys. Preferences, the date the adult agreed to load YouTube,
 * and which catalogue episodes were watched — none of it ever leaves the
 * browser.
 */
export const STORAGE_KEYS = Object.freeze({
  sensitivity: "p4l.sensitivity",
  warningDelay: "p4l.warningDelay",
  pauseDelay: "p4l.pauseDelay",
  volume: "p4l.volume",
  muted: "p4l.muted",
  locale: "p4l.locale",
  mirror: "p4l.mirror",
  youtubeConsent: "p4l.youtubeConsent",
  watched: "p4l.watched"
});

/** The cartoon catalogue: one generated file per locale, under this folder. */
export const CATALOG = Object.freeze({
  PATH: "catalog",
  /** Medium thumbnail, 320×180. `{id}` is the YouTube video id. */
  THUMBNAIL: "https://i.ytimg.com/vi/{id}/mqdefault.jpg",
  /** Ceiling for a view counter, so a corrupted value cannot grow without bound. */
  MAX_VIEWS: 9999,
  /** Episodes per page of a series: divides evenly into 2, 3, 4 or 6 columns. */
  PAGE_SIZE: 24
});

/**
 * Loading YouTube hands the visitor's address to Google and lets it set its own
 * trackers, so it waits for an adult's agreement. The agreement is kept for
 * six months — the CNIL's guideline for remembering a consent choice — and can
 * be withdrawn from the settings at any time.
 */
export const CONSENT = Object.freeze({
  MAX_AGE: 182 * 24 * 60 * 60 * 1000
});

export const DETECTION = Object.freeze({
  /**
   * Hysteresis. The mouth counts as open above `openThreshold` and as closed
   * only below `openThreshold * CLOSE_FACTOR`. Between the two the previous
   * state is held, which stops the film flickering when the lips hover right
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
  RESUME: 700,           // mouth closed before the film resumes
  FACE_LOST: 1800,       // no face before the warning appears
  REWARD_COOLDOWN: 3000, // minimum gap between two "well done" flashes
  REWARD_FLASH: 1200     // how long the sparkles stay on the film
});

export const MEDIAPIPE = Object.freeze({
  VISION_WASM: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm",
  FACE_MODEL: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
  HAND_MODEL: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
});

export const CAMERA = Object.freeze({ width: 480, height: 360 });

/**
 * One language on screen at a time. Both files are loaded at startup so the
 * FR/EN control can switch without a fetch, and the choice is remembered.
 */
export const I18N = Object.freeze({
  LOCALES: Object.freeze(["fr", "en"]),
  DEFAULT: "fr",
  PATH: "locales"
});

/** Mascot expressions. The four `REASON` values are all valid names here too. */
export const MASCOT = Object.freeze({
  NEUTRAL: "neutral",
  WARNING: "warning",
  PAUSED: "paused",
  DELIGHTED: "delighted",
  COVERED: "covered",
  PACIFIER: "pacifier",
  GONE: "gone"
});

/**
 * Which face the cat pulls for each reason the film stopped. `open` has no
 * entry of its own: an open mouth is what `paused` and `warning` already draw.
 */
export const MASCOT_FOR_REASON = Object.freeze({
  [REASON.AWAY]: MASCOT.GONE,
  [REASON.COVERED]: MASCOT.COVERED,
  [REASON.PACIFIER]: MASCOT.PACIFIER,
  [REASON.OPEN]: MASCOT.PAUSED
});
