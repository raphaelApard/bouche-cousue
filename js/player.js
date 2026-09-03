/**
 * Media control, independent of the mouth logic.
 *
 * Handles the two playback sources — a local file in a `<video>` element and a
 * YouTube embed — behind one small interface: `play`, `pause`, `setVolume`.
 * Nothing here decides *when* to play; that is the state machine's job.
 */

import { el } from "./dom.js";
import { SOURCE } from "./config.js";
import { t } from "./i18n.js";

let source = null;
let youtubePlayer = null;
let objectUrl = null; // current local file, revoked when it is replaced

export function getSource() {
  return source;
}

export function isPlayable() {
  return source === SOURCE.FILE || source === SOURCE.YOUTUBE;
}

/* ---------- Transport ---------- */

export function play() {
  if (source === SOURCE.YOUTUBE) {
    youtubePlayer?.playVideo?.();
  } else if (source === SOURCE.FILE) {
    el.video.play().catch(error => console.warn("Playback refused:", error));
  }
}

export function pause() {
  if (source === SOURCE.YOUTUBE) youtubePlayer?.pauseVideo?.();
  else if (source === SOURCE.FILE) el.video.pause();
}

/**
 * Only drives the local video: YouTube keeps its own volume control, and the
 * playback bar is hidden for it.
 */
export function applySound({ volume, muted }) {
  el.video.volume = volume / 100;
  el.video.muted = muted;
}

/* ---------- Local file ---------- */

/** Releases the current object URL and empties the video element. */
function releaseFile() {
  if (!objectUrl) return;
  el.video.pause();
  el.video.removeAttribute("src");
  el.video.load();
  URL.revokeObjectURL(objectUrl);
  objectUrl = null;
}

export function loadFile(file) {
  destroyYoutube();
  releaseFile();

  objectUrl = URL.createObjectURL(file);
  el.video.src = objectUrl;
  el.video.hidden = false;
  source = SOURCE.FILE;
}

function stopFile() {
  if (source !== SOURCE.FILE) return;
  releaseFile();
  el.video.hidden = true;
}

/* ---------- YouTube ---------- */

export function extractYoutubeId(input) {
  const text = String(input ?? "").trim();
  if (!text) return null;
  if (/^[\w-]{11}$/.test(text)) return text;

  const pattern = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/)|youtu\.be\/)([\w-]{11})/;
  return text.match(pattern)?.[1] ?? null;
}

/** YouTube refuses to play from a `file://` page, so warn before trying. */
export function canEmbedYoutube() {
  return location.protocol === "http:" || location.protocol === "https:";
}

function loadYoutubeApi() {
  return new Promise(resolve => {
    if (window.YT?.Player) return resolve();
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.head.append(script);
    window.onYouTubeIframeAPIReady = () => resolve();
  });
}

function destroyYoutube() {
  try {
    youtubePlayer?.destroy?.();
  } catch {
    /* Already gone. */
  }
  youtubePlayer = null;
  el.youtubeWrap.innerHTML = '<div id="youtubeFrame"></div>';
  el.youtubeWrap.hidden = true;
}

function youtubeErrorMessage(code) {
  switch (Number(code)) {
    case 2: return t("youtube.invalidLink");
    case 5: return t("youtube.playerError");
    case 100: return t("youtube.notFound");
    case 101:
    case 150: return t("youtube.embeddingDenied");
    case 153: return t("youtube.blockedHere");
    default: return `${t("youtube.otherError")} ${code}.`;
  }
}

/**
 * Loads a video into the embed, reusing the existing player when there is one.
 * @returns {Promise<void>} rejects with a translated message on failure.
 */
export async function loadYoutube(videoId) {
  if (source === SOURCE.YOUTUBE && youtubePlayer?.loadVideoById) {
    youtubePlayer.loadVideoById(videoId);
    return;
  }

  stopFile();
  await loadYoutubeApi();
  destroyYoutube();
  el.youtubeWrap.hidden = false;
  source = SOURCE.YOUTUBE;

  await new Promise((resolve, reject) => {
    youtubePlayer = new YT.Player("youtubeFrame", {
      videoId,
      host: "https://www.youtube-nocookie.com",
      playerVars: {
        autoplay: 0,
        controls: 1,
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
        enablejsapi: 1,
        origin: window.location.origin
      },
      events: {
        onReady: () => resolve(),
        onError: event => reject(new Error(youtubeErrorMessage(event.data)))
      }
    });
  });
}

/* ---------- Demo ---------- */

export function startDemo() {
  stopFile();
  destroyYoutube();
  source = SOURCE.DEMO;
}

/** Tears every source down, back to the state before any film was chosen. */
export function clearSource() {
  stopFile();
  destroyYoutube();
  source = null;
}
