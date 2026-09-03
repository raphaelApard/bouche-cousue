/**
 * Camera access and per-frame face analysis.
 *
 * Produces plain readings; it never touches the interface and never decides
 * anything. The camera stream is analysed in memory and discarded — no frame
 * is stored or sent anywhere.
 */

import { FaceLandmarker, HandLandmarker, FilesetResolver }
  from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

import { el } from "./dom.js";
import { CAMERA, DETECTION, LANDMARK, MEDIAPIPE } from "./config.js";

let faceLandmarker = null;
let handLandmarker = null;
let cameraReady = false;
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
  const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE.VISION_WASM);

  faceLandmarker = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MEDIAPIPE.FACE_MODEL, delegate: "GPU" },
    runningMode: "VIDEO",
    numFaces: 1
  });

  // Hand detection is a bonus: if the model fails to load, everything else works.
  try {
    handLandmarker = await HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MEDIAPIPE.HAND_MODEL, delegate: "GPU" },
      runningMode: "VIDEO",
      numHands: 2
    });
  } catch (error) {
    console.warn("Hand model unavailable — covered-mouth detection disabled.", error);
    handLandmarker = null;
  }
}

export async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: CAMERA.width, height: CAMERA.height, facingMode: "user" },
    audio: false
  });
  el.cameraVideo.srcObject = stream;
  await el.cameraVideo.play();
  cameraReady = true;
}

export function isReady() {
  return cameraReady && faceLandmarker !== null;
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

  const hands = handLandmarker.detectForVideo(el.cameraVideo, timestamp);
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
  const width = el.cameraVideo.videoWidth;
  const height = el.cameraVideo.videoHeight;
  if (!width || !height) return false;

  if (sampler.width !== width || sampler.height !== height) {
    sampler.width = width;
    sampler.height = height;
  }
  try {
    samplerContext.drawImage(el.cameraVideo, 0, 0, width, height);
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
 *   the caller can skip a render tick that carries no new information.
 */
export function readFrame() {
  if (!isReady()) return null;
  if (el.cameraVideo.currentTime === lastFrameTime) return null;
  lastFrameTime = el.cameraVideo.currentTime;

  const timestamp = performance.now();
  const result = faceLandmarker.detectForVideo(el.cameraVideo, timestamp);
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
