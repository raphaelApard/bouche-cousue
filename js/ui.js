/**
 * Everything the user sees, apart from the playback bar.
 *
 * The veil and the status badge remember *which translation keys* they are
 * showing rather than the rendered text, so switching language mid-pause
 * rewrites what is on screen instead of leaving a stale sentence behind.
 */

import { el } from "./dom.js";
import { t, onLocaleChange, setLocale, getLocale, translateDocument } from "./i18n.js";
import { TIMING } from "./config.js";

/** @type {{title: string, text: string}|null} */
let veilKeys = null;
let statusKey = "status.waiting";
let lastRewardAt = 0;

/* ---------- Decorative marquee ---------- */

function buildMarquee(bulbCount = 34) {
  for (let i = 0; i < bulbCount; i++) {
    const bulb = document.createElement("span");
    bulb.className = "bulb";
    bulb.style.animationDelay = `${(i % 6) * 0.12}s`;
    el.marquee.append(bulb);
  }
}

/* ---------- Veil ---------- */

/**
 * @param {string} prefix     translation prefix, e.g. `warning.open`
 * @param {object} [options]
 * @param {boolean} [options.warning]  translucent style — the film stays visible
 * @param {boolean} [options.lost]     "face gone" variant of the mascot
 */
export function showVeil(prefix, { warning = false, lost = false } = {}) {
  veilKeys = { title: `${prefix}.title`, text: `${prefix}.text` };
  el.veil.classList.toggle("veil--warning", warning);
  el.veil.classList.toggle("veil--lost", lost);
  el.veil.classList.add("is-visible");
  refreshVeil();
}

export function hideVeil() {
  veilKeys = null;
  el.veil.classList.remove("is-visible", "veil--warning", "veil--lost");
}

function refreshVeil() {
  if (!veilKeys) return;
  el.veilTitle.textContent = t(veilKeys.title);
  el.veilText.textContent = t(veilKeys.text);
}

/* ---------- Status badge ---------- */

/**
 * @param {string} key    translation key, e.g. `status.closed`
 * @param {boolean|null} [ok]  LED colour; null leaves it untouched
 */
export function setStatus(key, ok = null) {
  statusKey = key;
  el.mouthStatus.textContent = t(key);
  if (ok === null) return;
  el.mouthLed.classList.toggle("is-ok", ok);
  el.mouthLed.classList.toggle("is-alert", !ok);
}

export function markCameraReady() {
  el.cameraLed.classList.add("is-ok");
}

export function markCameraFailed() {
  el.cameraLed.classList.add("is-alert");
}

/* ---------- Openness gauge ---------- */

/**
 * @param {number} ratio  mouth openness relative to the threshold, 0..1+
 * @param {boolean} isOpen
 */
export function setGauge(ratio, isOpen) {
  el.gauge.style.width = `${Math.min(100, ratio * 100)}%`;
  el.gauge.style.background = isOpen ? "var(--coral)" : "var(--mint)";
}

export function resetGauge() {
  el.gauge.style.width = "0%";
}

/* ---------- Reward ---------- */

/** Flashes "well done", at most once per cooldown window. */
export function flashReward() {
  const now = performance.now();
  if (now - lastRewardAt <= TIMING.REWARD_COOLDOWN) return;
  lastRewardAt = now;

  el.reward.classList.remove("is-visible");
  void el.reward.offsetWidth; // restart the animation
  el.reward.classList.add("is-visible");
}

/* ---------- Welcome screen ---------- */

export function hideWelcome() {
  el.welcome.hidden = true;
  el.quickBar.classList.add("is-visible");
}

export function showWelcome() {
  el.welcome.hidden = false;
  el.quickBar.classList.remove("is-visible");
}

export function showFullscreenCoach() {
  el.fullscreenCoach.classList.add("is-visible");
}

/* ---------- Fullscreen ---------- */

function refreshFullscreenButton() {
  el.fullscreenButton.textContent = document.fullscreenElement
    ? t("buttons.exitFullscreen")
    : t("buttons.fullscreen");
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else if (el.stage.requestFullscreen) {
      await el.stage.requestFullscreen();
    } else if (el.stage.webkitRequestFullscreen) {
      await el.stage.webkitRequestFullscreen();
    }
    el.fullscreenCoach.classList.remove("is-visible"); // the point has landed
  } catch (error) {
    console.error(error);
  }
}

/* ---------- Camera preview ---------- */

function refreshCameraButton() {
  el.cameraButton.textContent = el.cameraBox.hidden
    ? t("buttons.showCamera")
    : t("buttons.hideCamera");
}

function toggleCameraPreview() {
  el.cameraBox.hidden = !el.cameraBox.hidden;
  refreshCameraButton();
}

/* ---------- Language switch ---------- */

function refreshLanguageButtons() {
  for (const button of document.querySelectorAll("[data-locale]")) {
    button.setAttribute("aria-pressed", String(button.dataset.locale === getLocale()));
  }
}

function wireLanguageButtons() {
  for (const button of document.querySelectorAll("[data-locale]")) {
    button.addEventListener("click", () => {
      setLocale(button.dataset.locale).catch(error => console.error(error));
    });
  }
}

/* ---------- Setup ---------- */

export function initUi() {
  buildMarquee();
  wireLanguageButtons();

  el.fullscreenButton.addEventListener("click", toggleFullscreen);
  document.addEventListener("fullscreenchange", refreshFullscreenButton);
  el.cameraButton.addEventListener("click", toggleCameraPreview);

  onLocaleChange(() => {
    refreshVeil();
    setStatus(statusKey);
    refreshFullscreenButton();
    refreshCameraButton();
    refreshLanguageButtons();
  });

  translateDocument();
}
