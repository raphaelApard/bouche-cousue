/**
 * Choosing what to watch: the welcome screen, the quick-change bar, and the
 * local file picker.
 *
 * This module owns the transitions between "nothing chosen" and "a film is
 * loaded"; the mouth logic itself lives in `mouth-monitor.js`.
 */

import { el } from "./dom.js";
import { SOURCE } from "./config.js";
import { t } from "./i18n.js";
import * as player from "./player.js";
import * as ui from "./ui.js";
import { armForNewFilm, isRunning, reset, startMonitoring } from "./mouth-monitor.js";
import { getSoundSettings, refreshPlaybackBar } from "./playback-controls.js";

/**
 * Called once a source is ready: boots detection the first time, and simply
 * re-arms it for every film after that.
 */
async function enterCinema() {
  if (isRunning()) {
    armForNewFilm();
    return;
  }

  const started = await startMonitoring();
  if (started) ui.showFullscreenCoach();
  else backToWelcome();   // no camera, no cinema
}

/* ---------- Local file ---------- */

function openFilePicker() {
  el.filePicker.click();
}

function handleChosenFile(file) {
  player.loadFile(file);
  player.applySound(getSoundSettings());
  ui.hideWelcome();
  refreshPlaybackBar();
  enterCinema();
}

/* ---------- YouTube ---------- */

/**
 * Single entry point for every YouTube request, wherever the link came from.
 * @param {string} rawLink
 * @param {() => void} [afterSuccess]
 */
async function openYoutube(rawLink, afterSuccess = () => {}) {
  const videoId = player.extractYoutubeId(rawLink);
  if (!videoId) {
    alert(t("alerts.invalidLink"));
    return;
  }
  if (!player.canEmbedYoutube()) {
    alert(t("alerts.needsServer"));
    return;
  }

  const wasRunning = isRunning();
  ui.hideWelcome();

  try {
    await player.loadYoutube(videoId);
  } catch (error) {
    console.error(error);
    alert(`${t("alerts.youtubeFailed")}\n${error.message}`);
    backToWelcome();
    return;
  }

  refreshPlaybackBar();
  afterSuccess();

  // Swapping the video of a running session should not re-show the start veil.
  if (!wasRunning) enterCinema();
}

function backToWelcome() {
  player.clearSource();
  reset();
  ui.showWelcome();
  refreshPlaybackBar();
}

/* ---------- Setup ---------- */

export function initSourcePicker() {
  el.welcomeForm.addEventListener("submit", event => {
    event.preventDefault();
    openYoutube(el.welcomeUrl.value);
  });

  el.quickBar.addEventListener("submit", event => {
    event.preventDefault();
    openYoutube(el.quickUrl.value, () => el.quickUrl.blur());
  });

  el.chooseFileButton.addEventListener("click", openFilePicker);
  el.quickFileButton.addEventListener("click", openFilePicker);

  el.filePicker.addEventListener("change", event => {
    const [file] = event.target.files ?? [];
    event.target.value = ""; // allows picking the same file again
    if (file) handleChosenFile(file);
  });

  el.video.addEventListener("error", () => {
    if (player.getSource() === SOURCE.FILE) alert(t("alerts.unplayableVideo"));
  });

  el.demoButton.addEventListener("click", () => {
    player.startDemo();
    ui.hideWelcome();
    refreshPlaybackBar();
    enterCinema();
  });
}
