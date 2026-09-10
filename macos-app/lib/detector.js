/**
 * Camera access and per-frame face analysis.
 *
 * Produces plain readings; it never touches the interface and never decides
 * anything. The camera stream is analysed in memory and discarded — no frame
 * is stored, and nothing leaves the Mac.
 *
 * It runs in the engine window, which is never shown: a hidden window still
 * decodes the camera it opened, and the panel is sent still frames rather than
 * the stream itself.
 *
 * The runtime and the models are the copies under `vendor/`, downloaded once
 * by `fetch-vendor.sh` — a packaged app has no CDN to rely on, and the whole
 * point is that it keeps working with the network off.
 */

import { FaceLandmarker, HandLandmarker, FilesetResolver }
  from "../vendor/tasks-vision/vision_bundle.mjs";

import { CAMERA, DETECTION, LANDMARK, MEDIAPIPE } from "./config.js";

let faceLandmarker = null;
let handLandmarker = null;
let video = null;
let stream = null;
let lastFrameTime = -1;

/** Offscreen canvas used to sample colours around the mouth. */
const sampler = document.createElement("canvas");
const samplerContext = sampler.getContext("2d", { willReadFrequently: true });


/**
 * @typedef {object} Reading
 * @property {boolean} faceVisible
 * @property {number}  openness      lip gap over face height, 0 when no face
 * @property {boolean} handsOnMouth
 * @property {boolean} pacifier
 */

export async function initDetector() {
  if (faceLandmarker) return;

  const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE.VISION_WASM);

  faceLandmarker = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: MEDIAPIPE.FACE_MODEL,
      delegate: "GPU"
    },
    runningMode: "VIDEO",
    numFaces: 1
  });

  // Hand detection is a bonus: if the model fails to load, everything else works.
  try {
    handLandmarker = await HandLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: MEDIAPIPE.HAND_MODEL,
        delegate: "GPU"
      },
      runningMode: "VIDEO",
      numHands: 2
    });
  } catch (error) {
    console.warn("Hand model unavailable — covered-mouth detection disabled.", error);
    handLandmarker = null;
  }
}

/** @param {HTMLVideoElement} element  where the camera preview is shown. */
export async function startCamera(element) {
  stream = await navigator.mediaDevices.getUserMedia({
    video: { width: CAMERA.width, height: CAMERA.height, facingMode: "user" },
    audio: false
  });
  video = element;
  video.srcObject = stream;
  await video.play();
}

/** Releases the camera, so its indicator goes out the moment we stop watching. */
export function stopCamera() {
  stream?.getTracks().forEach(track => track.stop());
  if (video) video.srcObject = null;
  stream = null;
  video = null;
  lastFrameTime = -1;
}

export function isReady() {
  return stream !== null && faceLandmarker !== null;
}

function distanceBetween(points, a, b) {
  return Math.hypot(points[a].x - points[b].x, points[a].y - points[b].y);
}

function mouthCentre(points) {
  return {
    x: (points[LANDMARK.UPPER_LIP].x + points[LANDMARK.LOWER_LIP].x) / 2,
    y: (points[LANDMARK.UPPER_LIP].y + points[LANDMARK.LOWER_LIP].y) / 2
  };
}

function detectHandsOnMouth(points, faceHeight, timestamp) {
  if (!handLandmarker) return false;

  const hands = handLandmarker.detectForVideo(video, timestamp);
  if (!hands.landmarks?.length) return false;

  const centre = mouthCentre(points);
  const reach = faceHeight * DETECTION.HAND_REACH;

  return hands.landmarks.some(hand =>
    hand.some(point => Math.hypot(point.x - centre.x, point.y - centre.y) < reach)
  );
}

/**
 * Colour heuristic: a pacifier is a vivid, saturated object in front of the
 * mouth, whereas lips are a soft, low-saturation red. Samples a box around the
 * mouth and reports the share of vivid, non-lip-coloured pixels.
 */
function detectPacifier(points) {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return false;

  if (sampler.width !== width || sampler.height !== height) {
    sampler.width = width;
    sampler.height = height;
  }
  try {
    samplerContext.drawImage(video, 0, 0, width, height);
  } catch {
    return false;
  }

  const centre = mouthCentre(points);
  const mouthWidth =
    Math.abs(points[LANDMARK.MOUTH_RIGHT].x - points[LANDMARK.MOUTH_LEFT].x) * width;

  const boxWidth = Math.max(20, mouthWidth * 1.6);
  const boxHeight = Math.max(20, mouthWidth * 1.2);
  const left = Math.max(0, Math.round(centre.x * width - boxWidth / 2));
  const top = Math.max(0, Math.round(centre.y * height - boxHeight / 2));
  const boxRight = Math.min(width - left, Math.round(boxWidth));
  const boxBottom = Math.min(height - top, Math.round(boxHeight));
  if (boxRight < 4 || boxBottom < 4) return false;

  let pixels;
  try {
    pixels = samplerContext.getImageData(left, top, boxRight, boxBottom).data;
  } catch {
    return false;
  }

  let vivid = 0;
  let total = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max === 0 ? 0 : (max - min) / max;
    const looksLikeLips = r > g + 15 && r > b + 15;

    if (saturation > 0.35 && max > 90 && !looksLikeLips) vivid++;
    total++;
  }

  return total > 0 && vivid / total > DETECTION.PACIFIER_RATIO;
}

/**
 * Analyses the current camera frame.
 *
 * @returns {Reading|null} null when the frame has already been analysed, so
 *   the caller can skip a tick that carries no new information.
 */
export function readFrame() {
  if (!isReady()) return null;
  if (video.currentTime === lastFrameTime) return null;
  lastFrameTime = video.currentTime;

  const timestamp = performance.now();
  const result = faceLandmarker.detectForVideo(video, timestamp);
  const points = result.faceLandmarks?.[0];

  if (!points) {
    return { faceVisible: false, openness: 0, handsOnMouth: false, pacifier: false };
  }

  // Normalising by face height keeps the measure scale-invariant, so leaning
  // towards the camera does not read as opening the mouth.
  const faceHeight = distanceBetween(points, LANDMARK.FOREHEAD, LANDMARK.CHIN);
  const openness = distanceBetween(points, LANDMARK.UPPER_LIP, LANDMARK.LOWER_LIP) / faceHeight;

  const handsOnMouth = detectHandsOnMouth(points, faceHeight, timestamp);

  return {
    faceVisible: true,
    openness,
    handsOnMouth,
    pacifier: !handsOnMouth && detectPacifier(points)
  };
}
