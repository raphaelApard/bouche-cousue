/**
 * The playback bar under the stage: play/pause, position, sound.
 *
 * Shown for local files only — a YouTube embed keeps its own controls, and
 * driving its volume from here would hide a remembered mute behind a control
 * the user cannot see.
 *
 * There is deliberately no separate "play" affordance beyond this button:
 * playback belongs to the mouth, and this bar is the adult's override.
 */

import { el } from "./dom.js";
import { SOURCE, STORAGE_KEYS } from "./config.js";
import { readBoolean, readNumberInRange, writeBoolean, writeRaw } from "./storage.js";
import { t, onLocaleChange } from "./i18n.js";
import * as player from "./player.js";
import { isPlaying, onPlaybackChange, togglePlayback } from "./mouth-monitor.js";

const sound = { volume: 100, muted: false };
let scrubbing = false; // the user is dragging: do not fight their handle

/* ---------- Play / pause ---------- */

function refreshPlayButton() {
  const playing = isPlaying();
  el.playButton.textContent = playing ? "⏸" : "▶";

  const label = playing ? t("controls.pause") : t("controls.play");
  el.playButton.setAttribute("aria-label", label);
  el.playButton.title = label;
}

/* ---------- Position ---------- */

function formatTime(seconds) {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${String(Math.floor(safe % 60)).padStart(2, "0")}`;
}

function refreshTime() {
  el.timeLabel.textContent =
    `${formatTime(el.video.currentTime)} / ${formatTime(el.video.duration)}`;
}

function wirePosition() {
  el.video.addEventListener("loadedmetadata", () => {
    el.progress.max = Number.isFinite(el.video.duration) ? el.video.duration : 0;
    el.progress.value = 0;
    refreshTime();
  });

  el.video.addEventListener("timeupdate", () => {
    if (!scrubbing) el.progress.value = el.video.currentTime;
    refreshTime();
  });

  el.progress.addEventListener("pointerdown", () => { scrubbing = true; });
  el.progress.addEventListener("pointerup", () => { scrubbing = false; });
  el.progress.addEventListener("change", () => { scrubbing = false; });
  el.progress.addEventListener("input", () => {
    el.video.currentTime = Number(el.progress.value);
    refreshTime();
  });
}

/* ---------- Sound ---------- */

function refreshSoundButton() {
  el.volume.value = sound.volume;

  const silent = sound.muted || sound.volume === 0;
  el.muteButton.textContent = silent ? "🔇" : sound.volume < 50 ? "🔉" : "🔊";

  const label = sound.muted ? t("controls.unmute") : t("controls.mute");
  el.muteButton.setAttribute("aria-label", label);
  el.muteButton.title = label;
}

function applySound() {
  player.applySound(sound);
  refreshSoundButton();
}

function wireSound() {
  el.volume.addEventListener("input", () => {
    sound.volume = Number(el.volume.value);
    if (sound.volume > 0) sound.muted = false; // moving the slider unmutes
    applySound();
    writeRaw(STORAGE_KEYS.volume, sound.volume);
    writeBoolean(STORAGE_KEYS.muted, sound.muted);
  });

  el.muteButton.addEventListener("click", () => {
    sound.muted = !sound.muted;
    applySound();
    writeBoolean(STORAGE_KEYS.muted, sound.muted);
  });
}

function restoreSound() {
  const storedVolume = readNumberInRange(STORAGE_KEYS.volume, el.volume);
  if (storedVolume !== null) sound.volume = storedVolume;
  sound.muted = readBoolean(STORAGE_KEYS.muted);
  applySound();
}

/* ---------- Visibility ---------- */

/** Call whenever the source changes. */
export function refreshPlaybackBar() {
  el.playbackBar.classList.toggle("is-visible", player.getSource() === SOURCE.FILE);
  refreshPlayButton();
}

export function getSoundSettings() {
  return { ...sound };
}

export function initPlaybackControls() {
  wirePosition();
  wireSound();
  restoreSound();

  el.playButton.addEventListener("click", togglePlayback);
  onPlaybackChange(refreshPlayButton);
  onLocaleChange(() => {
    refreshPlayButton();
    refreshSoundButton();
    refreshTime();
  });
}
