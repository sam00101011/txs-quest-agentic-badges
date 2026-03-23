(function() {
  var NAV_LINK_SELECTOR = ".about-nav-link, .build-nav-link";
  var NAVIGATION_DELAY_MS = 48;
  var NAV_CLICK_PROFILE = {
    brightness: 4100,
    duration: 0.011,
    volume: 0.17,
    decay: 0.015
  };
  var audioContext = null;
  var masterGain = null;
  var clickBuffer = null;

  function getAudioContextCtor() {
    return window.AudioContext || window.webkitAudioContext || null;
  }

  function getDeviceMasterGain() {
    var baseGain = 0.34;
    var hasCoarsePointer =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(any-pointer: coarse)").matches;
    var hasTouchPoints =
      typeof navigator !== "undefined" && Number(navigator.maxTouchPoints || 0) > 0;

    return baseGain * (hasCoarsePointer || hasTouchPoints ? 1.15 : 1.3);
  }

  function createClickBuffer(context) {
    var bufferDuration = 0.03;
    var buffer = context.createBuffer(
      1,
      Math.ceil(context.sampleRate * bufferDuration),
      context.sampleRate
    );
    var channel = buffer.getChannelData(0);
    for (var index = 0; index < channel.length; index += 1) {
      channel[index] = (Math.random() * 2 - 1) * Math.exp(-index / 42);
    }
    return buffer;
  }

  function ensureAudioReady() {
    var AudioContextCtor = getAudioContextCtor();
    if (!AudioContextCtor) {
      return Promise.resolve(false);
    }

    if (!audioContext) {
      audioContext = new AudioContextCtor();
      masterGain = audioContext.createGain();
      masterGain.gain.value = getDeviceMasterGain();
      masterGain.connect(audioContext.destination);
      clickBuffer = createClickBuffer(audioContext);
    }

    if (audioContext.state === "suspended") {
      return audioContext.resume().then(function() {
        return audioContext.state === "running";
      }).catch(function() {
        return false;
      });
    }

    return Promise.resolve(audioContext.state === "running");
  }

  function scheduleClick(profile) {
    if (!audioContext || audioContext.state !== "running" || !masterGain || !clickBuffer) {
      return;
    }

    var startTime = audioContext.currentTime;
    var stopTime = startTime + profile.duration + profile.decay;
    var source = audioContext.createBufferSource();
    var filter = audioContext.createBiquadFilter();
    var gainNode = audioContext.createGain();

    source.buffer = clickBuffer;
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(profile.brightness, startTime);
    filter.Q.setValueAtTime(0.8, startTime);
    gainNode.gain.setValueAtTime(0.0001, startTime);
    gainNode.gain.linearRampToValueAtTime(profile.volume, startTime + 0.0015);
    gainNode.gain.exponentialRampToValueAtTime(
      0.0001,
      startTime + profile.duration + profile.decay
    );

    source.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(masterGain);
    source.start(startTime);
    source.stop(stopTime + 0.01);
  }

  function handlePlainNavClick(event) {
    var link = event.currentTarget;
    if (!link || event.defaultPrevented) {
      return;
    }

    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      link.target === "_blank"
    ) {
      return;
    }

    event.preventDefault();
    ensureAudioReady().then(function(isReady) {
      if (isReady) {
        scheduleClick(NAV_CLICK_PROFILE);
      }
    });

    window.setTimeout(function() {
      window.location.assign(link.href);
    }, NAVIGATION_DELAY_MS);
  }

  document.querySelectorAll(NAV_LINK_SELECTOR).forEach(function(link) {
    link.addEventListener("pointerdown", function() {
      void ensureAudioReady();
    }, { passive: true });
    link.addEventListener("click", handlePlainNavClick);
  });
})();
