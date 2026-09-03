/**
 * Every element the app touches, resolved once.
 *
 * Keeping the lookups in one place means a renamed id breaks here loudly,
 * rather than as a scattered `null` somewhere deep in an event handler.
 */

const byId = (id) => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node;
};

export const el = {
  // Chrome
  marquee: byId("marquee"),
  cameraLed: byId("cameraLed"),
  mouthLed: byId("mouthLed"),
  mouthStatus: byId("mouthStatus"),

  // Stage
  stage: byId("stage"),
  video: byId("localVideo"),
  youtubeWrap: byId("youtubeWrap"),
  welcome: byId("welcome"),
  veil: byId("veil"),
  veilTitle: byId("veilTitle"),
  veilText: byId("veilText"),
  reward: byId("reward"),

  // Source pickers
  welcomeForm: byId("welcomeForm"),
  welcomeUrl: byId("welcomeUrl"),
  filePicker: byId("filePicker"),
  chooseFileButton: byId("chooseFileButton"),
  demoButton: byId("demoButton"),
  quickBar: byId("quickBar"),
  quickUrl: byId("quickUrl"),
  quickFileButton: byId("quickFileButton"),

  // Playback bar
  playbackBar: byId("playbackBar"),
  playButton: byId("playButton"),
  progress: byId("progress"),
  timeLabel: byId("timeLabel"),
  muteButton: byId("muteButton"),
  volume: byId("volume"),

  // Camera preview
  cameraBox: byId("cameraBox"),
  cameraVideo: byId("cameraVideo"),
  gauge: byId("gauge"),

  // Footer
  sensitivity: byId("sensitivity"),
  warningDelay: byId("warningDelay"),
  warningDelayValue: byId("warningDelayValue"),
  pauseDelay: byId("pauseDelay"),
  pauseDelayValue: byId("pauseDelayValue"),
  fullscreenButton: byId("fullscreenButton"),
  fullscreenCoach: byId("fullscreenCoach"),
  cameraButton: byId("cameraButton")
};
