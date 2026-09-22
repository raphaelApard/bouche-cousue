/**
 * Everything the user sees, apart from the playback bar.
 *
 * The veil, the status badge and the reward remember *which translation keys*
 * they are showing rather than the rendered text, so switching language
 * rewrites what is on screen instead of leaving a stale sentence behind. That
 * is also why `onLocaleChange()` below is the first-render path:
 * `translateDocument()` fires it once at startup.
 */

import { el } from "./dom.js";
import { t, getLocale, onLocaleChange, setLocale, translateDocument } from "./i18n.js";
import { DETECTION, MASCOT, MASCOT_FOR_REASON, REASON, TIMING } from "./config.js";
import { mount, setExpression } from "./mascot.js";

/** Full circle of the countdown ring: 2πr for the r = 70 drawn in the markup. */
const RING_LENGTH = 440;

/**
 * What the veil is currently saying, in keys rather than sentences.
 * @type {{title: string, text: string, cause: string|null, expression: string, warning: boolean}|null}
 */
let veilState = null;

let statusKey = "status.waiting";
/**
 * -Infinity, not 0: `performance.now()` is milliseconds since the page loaded,
 * so a zero here reads as "a reward was given at load" and swallows the first
 * real one for a whole cooldown.
 */
let lastRewardAt = -Infinity;
let rewardTimer = 0;

let monitoring = false;
let mirrorWanted = true;

/** @type {Record<string, SVGElement>} the mounted copies of the cat. */
const cats = {};

/* ---------- Veil ---------- */

function paint(state) {
  veilState = state;

  el.veil.classList.toggle("veil--warning", state.warning);
  el.veil.classList.toggle("veil--paused", !state.warning);
  el.veil.classList.add("is-visible");
  document.body.classList.add("is-veiled");

  setExpression(cats.veil, state.expression);
  refreshVeil();
}

/**
 * The film is still running: this is the last word before it stops.
 * @param {string} reason one of `REASON`
 */
export function showWarning(reason) {
  paint({
    title: `warning.${reason}.title`,
    text: `warning.${reason}.text`,
    cause: null,
    // An open mouth is what the warning face already draws; the other three
    // reasons are better told by the cat doing that very thing.
    expression: reason === REASON.OPEN ? MASCOT.WARNING : MASCOT_FOR_REASON[reason] ?? MASCOT.WARNING,
    warning: true
  });
  setWarningProgress(0);
}

/**
 * The film has stopped, and the cat says why.
 * @param {string} reason one of `REASON`
 */
export function showPause(reason) {
  paint({
    title: `paused.${reason}.title`,
    text: `paused.${reason}.text`,
    cause: reason,
    expression: MASCOT_FOR_REASON[reason] ?? MASCOT.PAUSED,
    warning: false
  });
}

/** A film has been chosen but not started: the same ask, with no blame in it. */
export function showStartVeil() {
  paint({
    title: "veil.start.title",
    text: "veil.start.text",
    cause: null,
    expression: MASCOT.PAUSED,
    warning: false
  });
}

export function hideVeil() {
  veilState = null;
  el.veil.classList.remove("is-visible", "veil--warning", "veil--paused");
  document.body.classList.remove("is-veiled");
}

/** @param {number} ratio 0 when the warning appears, 1 when the film stops. */
export function setWarningProgress(ratio) {
  const clamped = Math.min(1, Math.max(0, ratio));
  el.warningRing.style.strokeDashoffset = String(RING_LENGTH * (1 - clamped));
}

function refreshVeil() {
  if (!veilState) return;

  el.veilTitle.textContent = t(veilState.title);
  el.veilText.textContent = t(veilState.text);

  el.veilCause.hidden = veilState.cause === null;
  if (veilState.cause === null) {
    delete el.veilCause.dataset.reason; // no stale colour left on a hidden pill
    return;
  }
  el.veilCause.textContent = t(`cause.${veilState.cause}`);
  el.veilCause.dataset.reason = veilState.cause;
}

/* ---------- The adult's pause ---------- */

export function showAdultPause() {
  setExpression(cats.adult, MASCOT.NEUTRAL);
  el.adultPause.hidden = false;
  // `is-veiled` holds the top bar at full opacity: an adult reading this one
  // is the adult who will be reaching for it. The paper covers the film, and
  // only the film — `css/chrome.css` says what that leaves standing.
  document.body.classList.add("is-veiled", "is-adult-paused");
}

export function hideAdultPause() {
  el.adultPause.hidden = true;
  document.body.classList.remove("is-adult-paused");
  if (!veilState) document.body.classList.remove("is-veiled");
}

/* ---------- Status badges ---------- */

/**
 * @param {string} key         translation key, e.g. `status.closed`
 * @param {boolean|null} [ok]  lamp colour; null leaves it untouched
 */
export function setStatus(key, ok = null) {
  statusKey = key;
  el.mouthStatus.textContent = t(key);

  if (ok === null) return;
  for (const lamp of [el.mouthLed, el.minimalLed]) {
    lamp.classList.toggle("is-ok", ok);
    lamp.classList.toggle("is-alert", !ok);
  }
  el.mouthBadge.classList.toggle("is-ok", ok);
  el.mouthBadge.classList.toggle("is-alert", !ok);
}

export function markCameraReady() {
  el.cameraLed.classList.add("is-ok");
  el.minimalLed.classList.add("is-ok");
}

export function markCameraFailed() {
  el.cameraLed.classList.add("is-alert");
  el.cameraBadge.classList.add("is-alert");
}

/** Detection is running: the badges and the mirror have something to report. */
export function markMonitoring() {
  monitoring = true;
  el.statusStrip.hidden = false;
  refreshMirror();
}

/**
 * Detection has stopped: the badges have nothing left to say, and the lamps
 * are wiped so a failed session does not colour the next one.
 */
export function markIdle() {
  monitoring = false;
  el.statusStrip.hidden = true;
  refreshMirror();

  for (const lamp of [el.cameraLed, el.mouthLed, el.minimalLed]) {
    lamp.classList.remove("is-ok", "is-alert");
  }
  for (const badge of [el.cameraBadge, el.mouthBadge]) {
    badge.classList.remove("is-ok", "is-alert");
  }
  setStatus("status.waiting");
  resetGauge();
}

/* ---------- Mirror ---------- */

function refreshMirror() {
  el.mirror.hidden = !(monitoring && mirrorWanted);
  document.body.classList.toggle("is-mirrorless", !mirrorWanted);
}

export function setMirrorWanted(wanted) {
  mirrorWanted = wanted;
  refreshMirror();
}

/**
 * Draws how open the mouth is. The scale runs to twice the threshold, so the
 * mark in the middle of the track is exactly the point the film stops at.
 *
 * @param {number} ratio openness over twice the threshold; 0.5 is the limit
 */
export function setGauge(ratio) {
  const clamped = Math.min(1, Math.max(0, ratio));
  el.gauge.style.width = `${clamped * 100}%`;

  const closed = clamped < 0.5 * DETECTION.CLOSE_FACTOR;
  const open = clamped > 0.5;
  el.gauge.style.background = open ? "var(--coral)" : closed ? "var(--green)" : "var(--amber)";
}

export function resetGauge() {
  el.gauge.style.width = "0%";
}

/* ---------- Reward ---------- */

/** Flashes "well done" over a film that is already playing, once per cooldown. */
export function flashReward() {
  const now = performance.now();
  if (now - lastRewardAt <= TIMING.REWARD_COOLDOWN) return;
  lastRewardAt = now;

  el.reward.classList.add("is-visible");
  clearTimeout(rewardTimer);
  rewardTimer = setTimeout(() => el.reward.classList.remove("is-visible"), TIMING.REWARD_FLASH);
}

/* ---------- Welcome ---------- */

export function hideWelcome() {
  el.welcome.hidden = true;
  el.quickBarButton.hidden = false;
  // The way out takes the place the language pill holds on the welcome screen.
  el.closeFilmButton.hidden = false;
  document.body.classList.remove("is-idle");
  document.body.classList.add("is-watching");
}

export function showWelcome() {
  el.welcome.hidden = false;
  el.quickBarButton.hidden = true;
  el.quickBar.hidden = true;
  el.closeFilmButton.hidden = true;
  document.body.classList.add("is-idle");
  document.body.classList.remove("is-watching");
}

/* ---------- Language ---------- */

/* The pill appears twice — in the top bar and, on a phone, inside the panel. */
function refreshLang() {
  const current = getLocale();
  for (const button of el.langOptions) {
    button.setAttribute("aria-pressed", String(button.dataset.locale === current));
  }
}

function wireLang() {
  for (const button of el.langOptions) {
    button.addEventListener("click", () => setLocale(button.dataset.locale));
  }
}

/* ---------- Full screen ---------- */

/*
  Full screen shows the film and two things: the lamp saying whether the rule is
  happy, and the way back out. Every other control belongs to the windowed view.
*/

function refreshFullscreenLabel() {
  el.fullscreenLabel.textContent = document.fullscreenElement
    ? t("buttons.exitFullscreen")
    : t("buttons.fullscreen");
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (el.cinema.requestFullscreen) await el.cinema.requestFullscreen();
    else if (el.cinema.webkitRequestFullscreen) await el.cinema.webkitRequestFullscreen();
  } catch (error) {
    console.error(error);
  }
}

function wireFullscreen() {
  for (const button of [el.fullscreenButton, el.exitFullscreenButton]) {
    button.addEventListener("click", toggleFullscreen);
  }

  document.addEventListener("fullscreenchange", () => {
    document.body.classList.toggle("is-fullscreen", Boolean(document.fullscreenElement));
    refreshFullscreenLabel();
  });
}

/* ---------- Setup ---------- */

export function initUi() {
  cats.welcome = mount(el.welcomeMascot, MASCOT.NEUTRAL);
  cats.veil = mount(el.veilMascot, MASCOT.PAUSED);
  cats.adult = mount(el.adultMascot, MASCOT.NEUTRAL);
  cats.reward = mount(el.rewardMascot, MASCOT.DELIGHTED);

  setWarningProgress(0);
  showWelcome();
  wireLang();
  wireFullscreen();

  onLocaleChange(() => {
    refreshVeil();
    setStatus(statusKey);
    refreshFullscreenLabel();
    refreshLang();
    el.rewardText.textContent = t("reward");
  });

  translateDocument();
}
