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

/** For a control that appears more than once — the language pill does. */
const all = (selector) => {
  const nodes = [...document.querySelectorAll(selector)];
  if (!nodes.length) throw new Error(`No element matches ${selector}`);
  return nodes;
};

export const el = {
  // Shell
  cinema: byId("cinema"),
  topbar: byId("topbar"),
  minimal: byId("minimal"),
  minimalLed: byId("minimalLed"),
  exitFullscreenButton: byId("exitFullscreenButton"),

  // Status
  statusStrip: byId("statusStrip"),
  cameraBadge: byId("cameraBadge"),
  cameraLed: byId("cameraLed"),
  mouthBadge: byId("mouthBadge"),
  mouthLed: byId("mouthLed"),
  mouthStatus: byId("mouthStatus"),

  // Stage
  stage: byId("stage"),
  video: byId("localVideo"),
  youtubeWrap: byId("youtubeWrap"),
  demoBackdrop: byId("demoBackdrop"),

  // Veils
  veil: byId("veil"),
  veilMascot: byId("veilMascot"),
  veilTitle: byId("veilTitle"),
  veilText: byId("veilText"),
  veilCause: byId("veilCause"),
  warningRing: byId("warningRing"),
  adultPause: byId("adultPause"),
  adultMascot: byId("adultMascot"),
  resumeButton: byId("resumeButton"),

  // Reward
  reward: byId("reward"),
  rewardMascot: byId("rewardMascot"),
  rewardText: byId("rewardText"),

  // Welcome
  welcome: byId("welcome"),
  welcomeMascot: byId("welcomeMascot"),
  welcomeForm: byId("welcomeForm"),
  welcomeUrl: byId("welcomeUrl"),
  filePicker: byId("filePicker"),
  chooseFileButton: byId("chooseFileButton"),
  demoButton: byId("demoButton"),

  // Quick change bar
  quickBarButton: byId("quickBarButton"),
  quickBar: byId("quickBar"),
  quickUrl: byId("quickUrl"),
  quickFileButton: byId("quickFileButton"),

  // Top bar actions
  fullscreenButton: byId("fullscreenButton"),
  fullscreenLabel: byId("fullscreenLabel"),
  closeFilmButton: byId("closeFilmButton"),
  settingsButton: byId("settingsButton"),
  langOptions: all(".lang__option"),

  // Adult panel
  settingsPanel: byId("settingsPanel"),
  sensitivity: byId("sensitivity"),
  sensitivityValue: byId("sensitivityValue"),
  warningDelay: byId("warningDelay"),
  warningDelayValue: byId("warningDelayValue"),
  pauseDelay: byId("pauseDelay"),
  pauseDelayValue: byId("pauseDelayValue"),
  mirrorToggle: byId("mirrorToggle"),
  resetButton: byId("resetButton"),
  panelLinkButton: byId("panelLinkButton"),

  // Mirror
  mirror: byId("mirror"),
  cameraVideo: byId("cameraVideo"),
  gaugeTrack: byId("gaugeTrack"),
  gauge: byId("gauge"),

  // Playback bar
  playbackBar: byId("playbackBar"),
  playButton: byId("playButton"),
  progress: byId("progress"),
  timeLabel: byId("timeLabel"),
  muteButton: byId("muteButton"),
  volume: byId("volume")
};
