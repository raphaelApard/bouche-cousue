/**
 * Entry point: loads translations, then wires the modules together.
 *
 * Import order matters only here — every other module depends on state being
 * initialised by this file.
 */

import { el } from "./dom.js";
import { initI18n } from "./i18n.js";
import { initUi } from "./ui.js";
import { initSettings } from "./settings.js";
import { initPlaybackControls } from "./playback-controls.js";
import { initSourcePicker } from "./source-picker.js";
import { togglePlayback } from "./mouth-monitor.js";

/**
 * Click on the film — or on the veil covering it — toggles playback.
 * Controls and the welcome screen keep their own behaviour.
 */
function wireStageClick() {
  el.stage.addEventListener("click", event => {
    const target = event.target;
    if (target instanceof Element && target.closest("button, input, a, .welcome")) return;
    togglePlayback();
  });
}

/** Space bar toggles playback, unless the user is typing or on a button. */
function wireSpaceBar() {
  document.addEventListener("keydown", event => {
    if (event.code !== "Space" && event.key !== " ") return;

    const target = event.target;
    const interactive = "input, textarea, select, button, [contenteditable]";
    if (target instanceof Element && target.closest(interactive)) return;

    event.preventDefault(); // stop the page scrolling
    togglePlayback();
  });
}

async function start() {
  await initI18n();

  initUi();
  initSettings();
  initPlaybackControls();
  initSourcePicker();
  wireStageClick();
  wireSpaceBar();
}

start().catch(error => {
  console.error(error);
  document.body.insertAdjacentHTML(
    "afterbegin",
    '<p role="alert" class="boot-error">The app could not start. Serve this page over http://localhost rather than opening the file directly, then reload.</p>'
  );
});
