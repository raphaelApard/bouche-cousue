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
import { closePanel } from "./settings.js";
import { armForNewFilm, isRunning, startMonitoring, stopMonitoring } from "./mouth-monitor.js";
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
  if (!started) leaveFilm();   // no camera, no cinema
}

/* ---------- Browser history ----------

   Watching is an entry of its own, pushed the moment the welcome screen is
   left. The back button then closes the film instead of leaving the site —
   which is what a child pressing it, or a parent swiping back on a phone,
   means by it. Swapping films while watching pushes nothing: it is the same
   entry, showing something else.
*/

const HOME = "home";
const WATCHING = "watching";

/** Whether the entry we are on is the one we pushed for a running film. */
function onWatchingEntry() {
  return history.state?.p4l === WATCHING;
}

/** Leaves the welcome screen, and records that in the history. */
function enterWatchingEntry() {
  ui.hideWelcome();
  if (!onWatchingEntry()) history.pushState({ p4l: WATCHING }, "");
}

/**
 * The one way back to the welcome screen. It goes through the history when the
 * film has an entry of its own, so the button, the close control and the
 * failure paths all leave exactly one entry behind — the home one.
 */
function leaveFilm() {
  if (onWatchingEntry()) history.back(); // `popstate` does the rest
  else backToWelcome();
}

function wireHistory() {
  history.replaceState({ p4l: HOME }, "");

  window.addEventListener("popstate", () => {
    if (!onWatchingEntry()) {
      backToWelcome();
      return;
    }
    // Forward, onto a film that was closed and cannot be brought back: keep
    // the welcome screen and stop the entry claiming otherwise.
    if (!player.isPlayable()) history.replaceState({ p4l: HOME }, "");
  });
}

/* ---------- The quick-change bar ---------- */

function openQuickBar() {
  closePanel();
  el.quickBar.hidden = false;
  el.quickUrl.focus();
}

function closeQuickBar() {
  el.quickBar.hidden = true;
}

/**
 * Anything that opens the bar has to be excluded from the outside-click check,
 * or the closing press and the reopening click would cancel each other out.
 */
function opensQuickBar(node) {
  return el.quickBarButton.contains(node) || el.panelLinkButton.contains(node);
}

function wireQuickBarDismissal() {
  document.addEventListener("pointerdown", event => {
    if (el.quickBar.hidden) return;
    const target = event.target;
    if (target instanceof Node && !el.quickBar.contains(target) && !opensQuickBar(target)) {
      closeQuickBar();
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !el.quickBar.hidden) closeQuickBar();
  });
}

/* ---------- Local file ---------- */

function openFilePicker() {
  el.filePicker.click();
}

function handleChosenFile(file) {
  player.loadFile(file);
  player.applySound(getSoundSettings());
  enterWatchingEntry();
  closeQuickBar();
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
  enterWatchingEntry();

  try {
    await player.loadYoutube(videoId);
  } catch (error) {
    console.error(error);
    alert(`${t("alerts.youtubeFailed")}\n${error.message}`);
    leaveFilm();
    return;
  }

  refreshPlaybackBar();
  afterSuccess();

  // Swapping the video of a running session should not re-show the start veil.
  if (!wasRunning) enterCinema();
}

/** Tears the session down: no film, no camera, back to the first screen. */
function backToWelcome() {
  player.clearSource();
  stopMonitoring();
  closeQuickBar();
  closePanel();
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
    openYoutube(el.quickUrl.value, () => {
      el.quickUrl.blur();
      closeQuickBar();
    });
  });

  for (const button of [el.quickBarButton, el.panelLinkButton]) {
    button.addEventListener("click", () => {
      if (el.quickBar.hidden) openQuickBar();
      else closeQuickBar();
    });
  }

  wireQuickBarDismissal();
  wireHistory();

  el.closeFilmButton.addEventListener("click", leaveFilm);

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
    enterWatchingEntry();
    refreshPlaybackBar();
    enterCinema();
  });
}
