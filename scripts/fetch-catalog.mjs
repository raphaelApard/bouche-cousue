#!/usr/bin/env node
/**
 * Regenerate catalog/<locale>.json from the official channels listed in
 * scripts/catalog-sources.json.
 *
 *   YOUTUBE_API_KEY=… pnpm catalog
 *
 * Why a script and not a call from the page: the site stays static, the key
 * never ships, and a visitor's browser asks YouTube for nothing until the
 * adult has agreed to it — the catalogue itself is just a file on our server.
 *
 * Only official, verified channels belong in the sources file. Embedding an
 * upload you know to be unauthorised is not the same as embedding the rights
 * holder's own video, legally or otherwise.
 *
 * For each channel it walks the uploads playlist, newest first, and keeps a
 * video only if it can actually play in the app: public, embeddable, not
 * blocked in the configured region, and within the duration window — which is
 * what keeps Shorts and multi-hour compilations out. Costs a few quota units
 * per channel.
 *
 * It depends on nothing but Node 18's fetch.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SOURCES = path.join(ROOT, "scripts/catalog-sources.json");
const OUT_DIR = path.join(ROOT, "catalog");
const API = "https://www.googleapis.com/youtube/v3";
const PAGE = 50; // the API's maximum for both endpoints used here

const key = process.env.YOUTUBE_API_KEY;
if (!key) {
  console.error(
    "YOUTUBE_API_KEY is not set.\n" +
    "Create a key for the YouTube Data API v3 in the Google Cloud console, then:\n" +
    "  YOUTUBE_API_KEY=… pnpm catalog",
  );
  process.exit(1);
}

async function call(endpoint, params) {
  const url = new URL(`${API}/${endpoint}`);
  for (const [name, value] of Object.entries({ ...params, key })) url.searchParams.set(name, value);
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) {
    // Never print the URL: it carries the key.
    throw new Error(`${endpoint}: HTTP ${response.status} — ${body?.error?.message ?? "no message"}`);
  }
  return body;
}

/** "PT1H2M3S" → 3723. */
function seconds(isoDuration) {
  const match = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(isoDuration ?? "");
  if (!match) return 0;
  // An absent part is undefined, and Number(undefined) is NaN: count it as 0.
  const [d, h, m, s] = match.slice(1).map(part => Number(part ?? 0));
  return ((d * 24 + h) * 60 + m) * 60 + s;
}

/** Whether YouTube lets this video play in an embed seen from `region`. */
function playable(video, region) {
  const { status, contentDetails } = video;
  if (status?.privacyStatus !== "public" || status?.embeddable !== true) return false;
  if (status?.uploadStatus && status.uploadStatus !== "processed") return false;
  // Live and replayed streams: endless, or hours long, and never an episode.
  if (video.snippet?.liveBroadcastContent !== "none" || video.liveStreamingDetails) return false;

  const restriction = contentDetails?.regionRestriction;
  if (restriction?.blocked?.includes(region)) return false;
  if (restriction?.allowed && !restriction.allowed.includes(region)) return false;
  return true;
}

/** The newest uploads of one channel that pass every filter. */
async function episodesOf(source, options, region) {
  // Every channel's uploads playlist is its id with UC swapped for UU.
  const uploads = `UU${source.channelId.slice(2)}`;
  const exclude = new RegExp(options.exclude, "i");
  const kept = [];
  // Channels re-upload the same compilation under the same title.
  const titles = new Set();
  let pageToken;
  let scanned = 0;

  while (kept.length < options.maxEpisodes && scanned < options.scanLimit) {
    const page = await call("playlistItems", {
      part: "contentDetails",
      playlistId: uploads,
      maxResults: PAGE,
      ...(pageToken ? { pageToken } : {}),
    });
    const ids = page.items.map((item) => item.contentDetails.videoId);
    scanned += ids.length;
    if (ids.length === 0) break;

    const details = await call("videos", {
      part: "snippet,contentDetails,status,liveStreamingDetails",
      id: ids.join(","),
      maxResults: PAGE,
    });
    const byId = new Map(details.items.map((video) => [video.id, video]));

    for (const id of ids) {
      const video = byId.get(id);
      if (!video || !playable(video, region)) continue;
      const duration = seconds(video.contentDetails.duration);
      if (duration < options.minSeconds || duration > options.maxSeconds) continue;
      const title = video.snippet.title.trim();
      if (!title || exclude.test(title)) continue;
      const titleKey = title.toLowerCase();
      if (titles.has(titleKey)) continue;

      titles.add(titleKey);
      kept.push({ id, title, duration });
      if (kept.length >= options.maxEpisodes) break;
    }

    pageToken = page.nextPageToken;
    if (!pageToken) break;
  }
  return { kept, scanned };
}

const config = JSON.parse(await readFile(SOURCES, "utf8"));
await mkdir(OUT_DIR, { recursive: true });

for (const [locale, sources] of Object.entries(config.locales)) {
  console.log(`catalog/${locale}.json`);
  const series = [];

  for (const source of sources) {
    const options = { ...config.defaults, ...source };
    const { kept, scanned } = await episodesOf(source, options, config.region);
    console.log(`  ${source.name.padEnd(20)} ${String(kept.length).padStart(3)} kept of ${scanned} scanned`);
    if (kept.length === 0) continue; // an empty series would only be a dead card

    series.push({
      id: source.id,
      name: source.name,
      channelTitle: source.channelTitle,
      channelId: source.channelId,
      episodes: kept,
    });
  }

  const file = { generatedAt: new Date().toISOString(), series };
  await writeFile(path.join(OUT_DIR, `${locale}.json`), `${JSON.stringify(file, null, 2)}\n`);
}
