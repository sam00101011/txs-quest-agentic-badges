import { WebHaptics } from "web-haptics";

const FEEDBACK_WINDOW_MS = 1800;
const SELECTION_COOLDOWN_MS = 80;
const OUTCOME_COOLDOWN_MS = 450;
const SPECIAL_CUE_COOLDOWN_MS = 1200;
const LOOKUP_POSITIVE_CUE_COOLDOWN_MS = 900;
const SUCCESS_STATUS_PATTERN =
  /^(Copied|Downloaded|Minted|Registered|Authorized|Connected|Saved|Reset|Generated|Issued|Defined|Loaded|Resolved|Set)\b/i;
const CLAIM_BUTTON_SELECTOR = "#open-claim-assistant";
const NAV_CLICK_SELECTOR = ".site-nav-link";
const BADGE_CLICK_SELECTOR = ".badge-tile[data-view-pin], .badge-tile[data-view-badge]";
const INTERACTIVE_TARGET_SELECTOR = [
  "button",
  "a[href]",
  "[role=\"button\"]",
  "[data-view-claim]",
  "[data-view-profile]",
  "[data-view-pin]",
  "[data-open-share]",
  "[data-copy-share]"
].join(", ");

function getAudioContextCtor() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.AudioContext || window.webkitAudioContext || null;
}

function getDeviceMasterGain() {
  const baseGain = 0.34;
  if (typeof window === "undefined") {
    return baseGain;
  }

  const hasCoarsePointer = window.matchMedia?.("(any-pointer: coarse)").matches ?? false;
  const hasTouchPoints =
    typeof navigator !== "undefined" && Number(navigator.maxTouchPoints || 0) > 0;

  return baseGain * (hasCoarsePointer || hasTouchPoints ? 1.15 : 1.3);
}

class InteractionFeedbackController {
  constructor() {
    this.haptics = typeof window !== "undefined" ? new WebHaptics() : null;
    this.audioContext = null;
    this.masterGain = null;
    this.clickBuffer = null;
    this.installed = false;
    this.lastInteractionAt = 0;
    this.lastSelectionAt = 0;
    this.lastOutcomeAt = 0;
    this.lastSpecialCueAt = 0;
    this.lastLookupCueAt = 0;
    this.lastStatusSignature = "";
    this.soundEnabled = typeof window !== "undefined";

    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleSubmit = this.handleSubmit.bind(this);
    this.handlePageHide = this.handlePageHide.bind(this);
  }

  install(root = document) {
    if (this.installed || !root?.addEventListener) {
      return;
    }

    this.installed = true;
    root.addEventListener("pointerdown", this.handlePointerDown, {
      capture: true,
      passive: true
    });
    root.addEventListener("keydown", this.handleKeyDown, true);
    root.addEventListener("submit", this.handleSubmit, true);
    window.addEventListener("pagehide", this.handlePageHide, { once: true });
  }

  noteStatus(message, { isError = false } = {}) {
    const normalizedMessage = String(message ?? "").trim();
    if (!normalizedMessage || !this.hasRecentInteraction()) {
      return;
    }

    const now = Date.now();
    const signature = `${isError ? "error" : "success"}:${normalizedMessage}`;
    if (
      signature === this.lastStatusSignature &&
      now - this.lastOutcomeAt < FEEDBACK_WINDOW_MS
    ) {
      return;
    }

    if (now - this.lastOutcomeAt < OUTCOME_COOLDOWN_MS) {
      return;
    }

    if (isError) {
      this.playErrorCue();
    } else if (SUCCESS_STATUS_PATTERN.test(normalizedMessage)) {
      this.playSuccessCue();
    } else {
      return;
    }

    this.lastStatusSignature = signature;
    this.lastOutcomeAt = now;
  }

  hasRecentInteraction() {
    return Date.now() - this.lastInteractionAt < FEEDBACK_WINDOW_MS;
  }

  markInteraction() {
    this.lastInteractionAt = Date.now();
    void this.primeAudio();
  }

  handlePointerDown(event) {
    if (event.button !== 0 || !this.isInteractiveTarget(event.target)) {
      return;
    }

    this.markInteraction();
    this.playSelectionCue(event.target);
  }

  handleKeyDown(event) {
    if (event.repeat || (event.key !== "Enter" && event.key !== " ")) {
      return;
    }

    if (!this.isInteractiveTarget(event.target)) {
      return;
    }

    this.markInteraction();
    this.playSelectionCue(event.target);
  }

  handleSubmit(event) {
    this.markInteraction();
    this.playSelectionCue(event?.target);
  }

  handlePageHide() {
    try {
      this.haptics?.destroy();
    } catch {
      // Ignore cleanup failures while the page is unloading.
    }

    if (this.audioContext?.state !== "closed") {
      void this.audioContext?.close().catch(() => {});
    }
  }

  isInteractiveTarget(target) {
    if (!(target instanceof Element)) {
      return false;
    }

    const interactiveTarget = target.closest(INTERACTIVE_TARGET_SELECTOR);
    if (!interactiveTarget) {
      return false;
    }

    return !(interactiveTarget instanceof HTMLButtonElement && interactiveTarget.disabled);
  }

  async primeAudio() {
    const AudioContextCtor = getAudioContextCtor();
    if (!AudioContextCtor) {
      return;
    }

    if (!this.audioContext) {
      this.audioContext = new AudioContextCtor();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = getDeviceMasterGain();
      this.masterGain.connect(this.audioContext.destination);
      this.clickBuffer = this.createClickBuffer(this.audioContext);
    }

    if (this.audioContext.state === "suspended") {
      try {
        await this.audioContext.resume();
      } catch {
        // Autoplay policies can still block resume; we keep the rest of the app silent.
      }
    }
  }

  playSelectionCue(target) {
    const now = Date.now();
    if (now - this.lastSelectionAt < SELECTION_COOLDOWN_MS) {
      return;
    }

    this.lastSelectionAt = now;
    this.triggerHaptics("selection", 0.4);

    if (!this.soundEnabled) {
      return;
    }

    const soundProfile = this.getSelectionSoundProfile(target);

    void this.primeAudio().then(() => {
      if (soundProfile.kind === "tone") {
        this.scheduleTone(soundProfile);
        return;
      }

      this.scheduleClick(soundProfile);
    });
  }

  playSuccessCue() {
    this.triggerHaptics("success", 0.55);
    void this.primeAudio().then(() => {
      this.scheduleClick({
        brightness: 2800,
        duration: 0.016,
        volume: 0.1,
        decay: 0.022
      });
      this.scheduleClick({
        brightness: 3600,
        duration: 0.015,
        volume: 0.12,
        decay: 0.02,
        delay: 0.052
      });
    });
  }

  playErrorCue() {
    this.triggerHaptics("error", 0.65);
    void this.primeAudio().then(() => {
      this.scheduleClick({
        brightness: 1800,
        duration: 0.018,
        volume: 0.098,
        decay: 0.024
      });
      this.scheduleClick({
        brightness: 1450,
        duration: 0.02,
        volume: 0.09,
        decay: 0.028,
        delay: 0.07
      });
    });
  }

  playClaimReadyCue() {
    const now = Date.now();
    if (!this.hasRecentInteraction() || now - this.lastSpecialCueAt < SPECIAL_CUE_COOLDOWN_MS) {
      return;
    }

    this.lastSpecialCueAt = now;
    this.triggerHaptics("success", 0.65);
    void this.primeAudio().then(() => {
      this.scheduleClick({
        brightness: 2600,
        duration: 0.013,
        volume: 0.055,
        decay: 0.018
      });
      this.scheduleTone({
        frequency: 659.25,
        type: "triangle",
        duration: 0.038,
        volume: 0.076
      });
      this.scheduleTone({
        frequency: 783.99,
        type: "triangle",
        duration: 0.04,
        volume: 0.082,
        delay: 0.05
      });
      this.scheduleTone({
        frequency: 1046.5,
        type: "triangle",
        duration: 0.044,
        volume: 0.09,
        delay: 0.102
      });
      this.scheduleTone({
        frequency: 1318.51,
        type: "sine",
        duration: 0.06,
        volume: 0.102,
        delay: 0.162,
        release: 0.06
      });
    });
  }

  playLookupPositiveCue() {
    const now = Date.now();
    if (!this.hasRecentInteraction() || now - this.lastLookupCueAt < LOOKUP_POSITIVE_CUE_COOLDOWN_MS) {
      return;
    }

    this.lastLookupCueAt = now;
    this.triggerHaptics("success", 0.5);
    void this.primeAudio().then(() => {
      this.scheduleClick({
        brightness: 3000,
        duration: 0.012,
        volume: 0.062,
        decay: 0.018
      });
      this.scheduleTone({
        frequency: 880,
        type: "sine",
        duration: 0.026,
        volume: 0.055,
        attack: 0.002,
        release: 0.03,
        delay: 0.018
      });
      this.scheduleTone({
        frequency: 1108.73,
        type: "triangle",
        duration: 0.028,
        volume: 0.06,
        attack: 0.002,
        release: 0.034,
        delay: 0.052
      });
    });
  }

  triggerHaptics(pattern, intensity) {
    if (!this.haptics) {
      return;
    }

    try {
      void this.haptics.trigger(pattern, { intensity });
    } catch {
      // Haptics are progressive enhancement; failures should stay invisible.
    }
  }

  createClickBuffer(audioContext) {
    const bufferDuration = 0.03;
    const buffer = audioContext.createBuffer(
      1,
      Math.ceil(audioContext.sampleRate * bufferDuration),
      audioContext.sampleRate
    );
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < channel.length; index += 1) {
      channel[index] = (Math.random() * 2 - 1) * Math.exp(-index / 42);
    }
    return buffer;
  }

  getSelectionSoundProfile(target) {
    if (target instanceof Element && target.closest(CLAIM_BUTTON_SELECTOR)) {
      return {
        kind: "tone",
        frequency: 1320,
        type: "sine",
        duration: 0.022,
        volume: 0.09,
        attack: 0.0015,
        release: 0.028
      };
    }

    if (target instanceof Element && target.closest(NAV_CLICK_SELECTOR)) {
      return {
        kind: "click",
        brightness: 4100,
        duration: 0.011,
        volume: 0.17,
        decay: 0.015
      };
    }

    if (target instanceof Element && target.closest(BADGE_CLICK_SELECTOR)) {
      return {
        kind: "click",
        brightness: 2350,
        duration: 0.02,
        volume: 0.24,
        decay: 0.026
      };
    }

    return {
      kind: "click",
      brightness: 3200,
      duration: 0.014,
      volume: 0.11,
      decay: 0.018
    };
  }

  scheduleClick({
    brightness = 2800,
    duration = 0.016,
    volume = 0.09,
    decay = 0.022,
    delay = 0
  }) {
    if (
      !this.audioContext ||
      this.audioContext.state !== "running" ||
      !this.masterGain ||
      !this.clickBuffer
    ) {
      return;
    }

    const startTime = this.audioContext.currentTime + delay;
    const stopTime = startTime + duration + decay;
    const source = this.audioContext.createBufferSource();
    const filter = this.audioContext.createBiquadFilter();
    const gainNode = this.audioContext.createGain();

    source.buffer = this.clickBuffer;
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(brightness, startTime);
    filter.Q.setValueAtTime(0.8, startTime);
    gainNode.gain.setValueAtTime(0.0001, startTime);
    gainNode.gain.linearRampToValueAtTime(volume, startTime + 0.0015);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration + decay);

    source.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.masterGain);
    source.start(startTime);
    source.stop(stopTime + 0.01);
  }

  scheduleTone({
    frequency,
    type = "sine",
    duration = 0.04,
    volume = 0.06,
    attack = 0.003,
    release = 0.045,
    delay = 0
  }) {
    if (!this.audioContext || this.audioContext.state !== "running" || !this.masterGain) {
      return;
    }

    const startTime = this.audioContext.currentTime + delay;
    const stopTime = startTime + duration + release;
    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startTime);
    gainNode.gain.setValueAtTime(0.0001, startTime);
    gainNode.gain.linearRampToValueAtTime(volume, startTime + attack);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration + release);

    oscillator.connect(gainNode);
    gainNode.connect(this.masterGain);
    oscillator.start(startTime);
    oscillator.stop(stopTime + 0.01);
  }
}

const interactionFeedback = new InteractionFeedbackController();

export function installInteractionFeedback(root = document) {
  interactionFeedback.install(root);
}

export function noteInteractionStatus(message, options) {
  interactionFeedback.noteStatus(message, options);
}

export function playClaimReadyCue() {
  interactionFeedback.playClaimReadyCue();
}

export function playLookupPositiveCue() {
  interactionFeedback.playLookupPositiveCue();
}
