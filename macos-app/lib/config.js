/**
 * Shared constants.
 *
 * Nothing in here depends on the DOM or on Electron, so it is safe to import
 * from anywhere — the renderers and the main process both do. The detection
 * values are the ones the web app and the two extensions use; keep the four in
 * step, since they are all the same rule.
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

/** Keys in `settings.json`. Only preferences are ever stored. */
export const STORAGE_KEYS = Object.freeze({
  sensitivity: "p4l.sensitivity",
  warningDelay: "p4l.warningDelay",
  pauseDelay: "p4l.pauseDelay",
  target: "p4l.target",
  overlay: "p4l.overlay"
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
 * `TICK` drives a timer rather than `requestAnimationFrame`: the rule runs in
 * a window that is never shown, so animation frames would never arrive at all.
 * `backgroundThrottling` is off for that window, but the state machine is
 * still written against the clock rather than against a tick count — a slowed
 * loop stays correct, only coarser.
 *
 * `HEARTBEAT` and `WATCHDOG` are the other half of that bargain: the main
 * process parks the video if the engine goes quiet, so a wedged or crashed
 * engine can never leave a film running unwatched.
 */
export const LOOP = Object.freeze({
  TICK: 80,
  HEARTBEAT: 1000,
  WATCHDOG: 8000
});

/** Vendored MediaPipe runtime and models, served from the app:// root. */
export const MEDIAPIPE = Object.freeze({
  VISION_WASM: "/vendor/tasks-vision/wasm",
  FACE_MODEL: "/vendor/models/face_landmarker.task",
  HAND_MODEL: "/vendor/models/hand_landmarker.task"
});

export const CAMERA = Object.freeze({ width: 480, height: 360 });

/**
 * The camera picture shown in the panel.
 *
 * The engine window holds the stream and a `MediaStream` cannot cross between
 * two documents, so the panel is sent still frames instead — small, lossy, and
 * only while the panel is actually on screen. It is a viewfinder for aiming
 * the camera, not a video feed.
 */
export const PREVIEW = Object.freeze({
  WIDTH: 192,
  HEIGHT: 144,
  QUALITY: 0.45,
  INTERVAL: 120
});

/**
 * How often a film that is supposed to be stopped is checked on.
 *
 * The rule acts on transitions, which is enough when the video belongs to us:
 * a tab cannot restart itself. Here it can — the child presses space, or the
 * play button, and watches on with an open mouth. So while the film is meant
 * to be parked, the order is repeated at this interval to whichever player can
 * be told twice without harm.
 */
export const HOLD = Object.freeze({ INTERVAL: 1500 });

/**
 * The card the child reads. The reward flash is a moment, not a state: it puts
 * itself away, whereas a warning or a pause stays until the rule says
 * otherwise.
 */
export const OVERLAY = Object.freeze({ FLASH: 1600 });

/**
 * How the video gets stopped.
 *
 * `auto` picks a channel per command: the player in front, else one that is
 * merely open, else the play/pause key. The named players are driven by Apple
 * events, which say "pause" and mean it. The two key channels — `space`, typed
 * into the window in front, and `mediakey`, the keyboard's own play/pause —
 * are what reach a player nothing else can, Firefox among them, at the price
 * of an Accessibility permission and of being toggles. See
 * `main/media-control.js`.
 */
export const TARGETS = Object.freeze(["auto", "space", "mediakey", "safari", "chrome", "quicktime", "vlc"]);

export const DEFAULTS = Object.freeze({ target: "auto", overlay: true });

/** The app:// origin the windows are served from. See `main/protocol.js`. */
export const ORIGIN = "app://bouche-cousue";

export const I18N = Object.freeze({
  LOCALE: "fr",
  PATH: "locales"
});
