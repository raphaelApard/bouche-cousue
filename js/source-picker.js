/**
 * Choosing what to watch: the welcome screen, the cartoon catalogue, the
 * quick-change bar, and the local file picker.
 *
 * This module owns the transitions between "nothing chosen" and "a film is
 * loaded", and the browser history that mirrors them; the mouth logic itself
 * lives in `mouth-monitor.js`, and the catalogue's drawing in `catalog.js`.
 */

import { el } from "./dom.js";
import { SOURCE, STORAGE_KEYS } from "./config.js";
import { t } from "./i18n.js";
import * as player from "./player.js";
import * as ui from "./ui.js";
import { closePanel } from "./settings.js";
import { readOneOf, writeBoolean } from "./storage.js";
import { askYoutubeConsent, hasYoutubeConsent, revokeYoutubeConsent } from "./consent.js";
import * as catalog from "./catalog.js";
import { clearHistory, hasHistory, recordEnd, recordStart } from "./watch-history.js";
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

   Every screen is an entry of its own: home, the catalogue's series, one
   series' episodes, and the film. Back then goes one screen back — from a
   film to the list it was picked from, from the list to the series, from the
   series to home — which is what a child pressing it, or a parent swiping back on
   a phone, means by it. Swapping films while watching pushes nothing: it is
   the same entry, showing something else.

   A film always sits on top of the idle screen it was opened from. That
   screen is remembered in `screen`, so closing the film can return to it.
*/

const HOME = "home";
const CATALOG = "catalog";
const SERIES = "series";
const WATCHING = "watching";

/** The idle screen on display, or behind the film when one is playing. */
let screen = { p4l: HOME };

/**
 * The catalogue episode on screen, if the film came from the catalogue. Only
 * that film counts towards the episode's views when it reaches its end.
 * @type {{seriesId: string, videoId: string} | null}
 */
let currentEpisode = null;

/** Whether the entry we are on is the one we pushed for a running film. */
function onWatchingEntry() {
  return history.state?.p4l === WATCHING;
}

function isScreenState(state) {
  return state?.p4l === HOME
    || state?.p4l === CATALOG
    || (state?.p4l === SERIES && typeof state.series === "string");
}

/** Leaves the idle screen for the film, and records that in the history. */
function enterWatchingEntry() {
  catalog.hideCatalog();
  ui.hideWelcome();
  if (!onWatchingEntry()) history.pushState({ p4l: WATCHING }, "");
}

/**
 * Draws one idle screen. The catalogue is made of YouTube thumbnails, so
 * without the agreement — withdrawn since, or never given on this device
 * before a forward button brought it back — it falls back to home.
 */
function showScreen(state) {
  if (state.p4l !== HOME && !hasYoutubeConsent()) {
    state = { p4l: HOME };
    if (!onWatchingEntry()) history.replaceState(state, "");
  }
  screen = state;

  if (state.p4l === CATALOG) {
    ui.showCatalogScreen();
    catalog.showSeriesList();
  } else if (state.p4l === SERIES) {
    ui.showCatalogScreen();
    catalog.showEpisodes(state.series);
  } else {
    catalog.hideCatalog();
    ui.showWelcome();
  }
}

/** Moves forward to a new idle screen. */
function pushScreen(state) {
  history.pushState(state, "");
  showScreen(state);
}

/**
 * The one way out of a film. It goes through the history when the film has an
 * entry of its own, so the button, the end of an episode and the failure paths
 * all leave exactly the screen it was opened from.
 */
function leaveFilm() {
  if (onWatchingEntry()) history.back(); // `popstate` does the rest
  else backToScreen(screen);
}

function wireHistory() {
  history.replaceState(screen, "");

  window.addEventListener("popstate", () => {
    const state = history.state;
    if (state?.p4l !== WATCHING) {
      backToScreen(isScreenState(state) ? state : { p4l: HOME });
      return;
    }
    // Forward, onto a film that was closed and cannot be brought back: keep
    // the screen on display and stop the entry claiming otherwise.
    if (!player.isPlayable()) history.replaceState(screen, "");
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
  currentEpisode = null;
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
 * @param {{seriesId: string, videoId: string} | null} [episode] set when the
 *   video was picked in the catalogue, so its end is counted.
 */
async function openYoutube(rawLink, afterSuccess = () => {}, episode = null) {
  const videoId = player.extractYoutubeId(rawLink);
  if (!videoId) {
    alert(t("alerts.invalidLink"));
    return;
  }
  if (!player.canEmbedYoutube()) {
    alert(t("alerts.needsServer"));
    return;
  }
  // Nothing is requested from YouTube before the adult has agreed to it.
  if (!(await askYoutubeConsent())) return;

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

  currentEpisode = episode;
  refreshPlaybackBar();
  afterSuccess();

  // Swapping the video of a running session should not re-show the start veil.
  if (!wasRunning) enterCinema();
}

/* ---------- Catalogue ---------- */

/** The settings' "clear" button only shows when there is something to clear. */
function refreshHistoryButton() {
  el.clearHistoryButton.hidden = !hasHistory();
}

async function openCatalog() {
  if (!(await askYoutubeConsent())) return;
  pushScreen({ p4l: CATALOG });
}

function playEpisode(seriesId, videoId) {
  openYoutube(videoId, () => {
    recordStart(videoId);
    catalog.markPlayed(seriesId, videoId);
    refreshHistoryButton();
  }, { seriesId, videoId });
}

/**
 * An episode that plays to its end counts as seen. Then either the next one
 * in the list starts — when "play back to back" is ticked — or the child is
 * handed back the list; never YouTube's end screen, which suggests videos
 * nobody chose. A pasted link or a file simply stops at its end, as before.
 *
 * The next episode replaces the film on the same history entry, so Back still
 * leads to the list, however many episodes went by.
 */
async function handleFilmEnded() {
  if (!currentEpisode) return;
  const { seriesId, videoId } = currentEpisode;
  if (player.getYoutubeVideoId() !== videoId) return;

  recordEnd(videoId);
  refreshHistoryButton();

  const next = el.catalogAutoplay.checked ? await catalog.episodeAfter(seriesId, videoId) : null;
  // The film may have been closed or swapped while the list was read.
  if (currentEpisode?.videoId !== videoId) return;
  if (next) playEpisode(seriesId, next);
  else leaveFilm();
}

/* ---------- Teardown ---------- */

/** Tears the session down: no film, no camera, then the given idle screen. */
function backToScreen(state) {
  currentEpisode = null;
  player.clearSource();
  stopMonitoring();
  closeQuickBar();
  closePanel();
  showScreen(state);
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

  // Withdrawing the agreement also stops what it allowed: a YouTube film on
  // screen is closed rather than left playing on a consent that no longer
  // exists.
  el.revokeConsentButton.addEventListener("click", () => {
    revokeYoutubeConsent();
    if (player.getSource() === SOURCE.YOUTUBE) leaveFilm();
    else if (!onWatchingEntry()) showScreen(screen); // a catalogue on display goes too
  });

  catalog.initCatalog({
    onPickSeries: seriesId => pushScreen({ p4l: SERIES, series: seriesId }),
    onPickEpisode: playEpisode,
    onBack: () => history.back()
  });
  el.catalogButton.addEventListener("click", openCatalog);

  // Off unless it was explicitly turned on: a child should not be handed an
  // endless stream by default.
  el.catalogAutoplay.checked = readOneOf(STORAGE_KEYS.autoplay, ["0", "1"]) === "1";
  el.catalogAutoplay.addEventListener("change", () => {
    writeBoolean(STORAGE_KEYS.autoplay, el.catalogAutoplay.checked);
  });
  player.onEnded(handleFilmEnded);

  el.clearHistoryButton.addEventListener("click", () => {
    clearHistory();
    refreshHistoryButton();
    if (!el.catalog.hidden) showScreen(screen); // redraw the badges away
  });
  refreshHistoryButton();

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
    currentEpisode = null;
    player.startDemo();
    enterWatchingEntry();
    refreshPlaybackBar();
    enterCinema();
  });
}
