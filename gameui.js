/* Rendering, HUD, menus, and presentation controls. */

function musicTargetGain() {
  return gameMusic.enabled ? 0.3 * audioSettings.volume : 0;
}

function applyAudioSettings() {
  if (gameMusic.gain && gameMusic.context) {
    gameMusic.gain.gain.setTargetAtTime(musicTargetGain(), gameMusic.context.currentTime, 0.05);
  }
  try {
    localStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify(audioSettings));
  } catch (error) {
    // Storage may be unavailable; settings simply won't persist.
  }
}

function volumeSliderBounds() {
  return { x: 24, y: 40, width: 170, height: 14 };
}

function sfxSliderBounds() {
  return { x: 24, y: 76, width: 170, height: 14 };
}

function ttsButtonBounds() {
  return { x: 24, y: 100, width: 170, height: 22 };
}

function ttsPromptBounds(yes) {
  return { x: VIEW_W / 2 + (yes ? -190 : 30), y: 330, width: 160, height: 44 };
}

function setVolumeFromPointer(px, which = audioSliderDragging) {
  const bounds = which === 'sfx' ? sfxSliderBounds() : volumeSliderBounds();
  const value = Math.min(1, Math.max(0, (px - bounds.x) / bounds.width));
  if (which === 'sfx') audioSettings.sfxVolume = value;
  else audioSettings.volume = value;
  applyAudioSettings();
}

function setTextToSpeech(enabled) {
  audioSettings.tts = enabled;
  applyAudioSettings();
  if (!enabled) {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    stopPrologueNarration();
    stopChapterNarration();
  } else if (mode === 'prologue') {
    startPrologueNarration();
  } else if (mode === 'chapter' && activeChapter) {
    startChapterNarration(activeChapter);
  }
}

function sliderHitBounds(bounds) {
  return { x: bounds.x - 6, y: bounds.y - 20, width: bounds.width + 12, height: bounds.height + 24 };
}

function adjustAudioVolume(which, delta) {
  const key = which === 'sfx' ? 'sfxVolume' : 'volume';
  audioSettings[key] = Math.round(Math.min(1, Math.max(0, audioSettings[key] + delta)) * 20) / 20;
  applyAudioSettings();
  if (which === 'sfx') playSound('weapons/axe/hit.ogg', 0.25);
}

function handleAudioPanelPointerDown(px, py) {
  if (pointInBounds(sliderHitBounds(volumeSliderBounds()), px, py)) {
    audioSliderDragging = 'music';
    setVolumeFromPointer(px);
    return true;
  }
  if (pointInBounds(sliderHitBounds(sfxSliderBounds()), px, py)) {
    audioSliderDragging = 'sfx';
    setVolumeFromPointer(px);
    return true;
  }
  if (NARRATION_ENABLED && pointInBounds(ttsButtonBounds(), px, py)) {
    setTextToSpeech(audioSettings.tts !== true);
    return true;
  }
  return false;
}

function pointerOverAudioPanel() {
  return pointInBounds(sliderHitBounds(volumeSliderBounds())) ||
    pointInBounds(sliderHitBounds(sfxSliderBounds())) || pointInBounds(ttsButtonBounds());
}

function stepAudioFocus(vertical) {
  const index = AUDIO_FOCUS_ORDER.indexOf(audioFocus);
  if (audioFocus === null) audioFocus = vertical < 0 ? 'tts' : null;
  else if (index + vertical >= AUDIO_FOCUS_ORDER.length) audioFocus = null;
  else audioFocus = AUDIO_FOCUS_ORDER[Math.max(0, index + vertical)];
}

function handleAudioPanelPad(horizontal, confirmPressed) {
  const previousHorizontal = handleAudioPanelPad.previousHorizontal;
  handleAudioPanelPad.previousHorizontal = horizontal;
  if (!audioFocus) return false;
  if (audioFocus === 'tts') {
    if (confirmPressed) setTextToSpeech(audioSettings.tts !== true);
    return confirmPressed || horizontal !== 0;
  }
  if (horizontal === 0) return false;
  const now = performance.now();
  const fresh = horizontal !== previousHorizontal;
  if (fresh || now >= audioAdjustRepeatAt) {
    adjustAudioVolume(audioFocus, horizontal * 0.05);
    audioAdjustRepeatAt = now + (fresh ? 380 : 90);
  }
  return true;
}

// Pause-screen switch for input-adaptive enemy tactics (see docs/BALANCE.md).
function adaptiveToggleBounds() {
  return { x: 24, y: ttsButtonBounds().y + (NARRATION_ENABLED ? 32 : 0), width: 190, height: 22 };
}

function toggleAdaptiveEnemies() {
  gameSettings.adaptiveEnemies = !gameSettings.adaptiveEnemies;
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(gameSettings));
  } catch (error) {
    // Storage may be unavailable; the choice then lasts for this session only.
  }
}

function adaptiveToggleKeyLabel() {
  if (lastInputMode !== 'controller') return 'E';
  return gamepadInput.family === 'ps' ? '△' : 'Y';
}

function drawAdaptiveToggle() {
  const bounds = adaptiveToggleBounds();
  const on = gameSettings.adaptiveEnemies;
  const reading = { touch: 'touch', keyboard: 'keyboard and mouse', controller: 'gamepad' }[inputAI.mode];
  ctx.save();
  ctx.fillStyle = on ? '#30443b' : '#4a2f2f';
  ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
  ctx.strokeStyle = on ? '#a5c79b' : '#c98a8a';
  ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
  ctx.fillStyle = '#f0f0e0';
  ctx.textAlign = 'center';
  ctx.font = 'bold 11px Arial';
  ctx.fillText(`ADAPTIVE ENEMIES [${adaptiveToggleKeyLabel()}]: ${on ? 'ON' : 'OFF'}`,
    bounds.x + bounds.width / 2, bounds.y + 15);
  ctx.textAlign = 'left';
  ctx.font = '10px Arial';
  ctx.fillStyle = '#d6d0be';
  ctx.fillText(on ? (reading ? `Enemies are adapting to ${reading} play` : 'Enemies adapt to how you play')
    : 'Original enemy tactics', bounds.x, bounds.y + bounds.height + 13);
  ctx.restore();
}

function drawTtsPrompt() {
  ctx.save();
  ctx.fillStyle = 'rgba(8, 10, 9, 0.92)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f2e3c4';
  ctx.font = 'bold 28px Georgia';
  ctx.fillText('Read the story aloud?', VIEW_W / 2, 230);
  ctx.fillStyle = '#d6d0be';
  ctx.font = '16px Arial';
  ctx.fillText('Turn on text-to-speech narration for the prologue and chapter intros.', VIEW_W / 2, 268);
  ctx.fillText('You can change this later with the narration button.', VIEW_W / 2, 292);
  for (const [yes, label] of [[true, 'YES (Y)'], [false, 'NO (N)']]) {
    const bounds = ttsPromptBounds(yes);
    ctx.fillStyle = yes ? '#30443b' : '#4a3a2a';
    ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
    ctx.strokeStyle = '#d9bd83';
    ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
    ctx.fillStyle = '#fff0d1';
    ctx.font = 'bold 15px Arial';
    ctx.fillText(label, bounds.x + bounds.width / 2, bounds.y + 28);
  }
  ctx.restore();
}

function ttsPromptActive() {
  return NARRATION_ENABLED && audioSettings.tts === null && mode === 'prologue';
}

function drawAudioPanel() {
  const slider = volumeSliderBounds();
  const sfxSlider = sfxSliderBounds();
  const tts = ttsButtonBounds();
  ctx.save();
  ctx.textAlign = 'left';
  ctx.font = 'bold 11px Arial';
  for (const [label, bounds, value] of [
    ['MUSIC', slider, audioSettings.volume],
    ['SFX (shots & monsters)', sfxSlider, audioSettings.sfxVolume],
  ]) {
    ctx.fillStyle = '#d9c796';
    ctx.fillText(`${label}  ${Math.round(value * 100)}%`, bounds.x, bounds.y - 8);
    ctx.fillStyle = '#2b2f2c';
    ctx.fillRect(bounds.x, bounds.y + 4, bounds.width, 6);
    ctx.fillStyle = '#e9c57e';
    ctx.fillRect(bounds.x, bounds.y + 4, bounds.width * value, 6);
    ctx.fillStyle = '#fff0d1';
    ctx.fillRect(bounds.x + bounds.width * value - 4, bounds.y, 8, bounds.height);
  }
  if (!NARRATION_ENABLED) {
    ctx.restore();
    return;
  }
  const ttsOn = audioSettings.tts === true;
  ctx.fillStyle = ttsOn ? '#30443b' : '#4a2f2f';
  ctx.fillRect(tts.x, tts.y, tts.width, tts.height);
  ctx.strokeStyle = ttsOn ? '#a5c79b' : '#c98a8a';
  ctx.strokeRect(tts.x, tts.y, tts.width, tts.height);
  ctx.fillStyle = '#f0f0e0';
  ctx.textAlign = 'center';
  ctx.fillText(`NARRATION (TTS) [T]: ${ttsOn ? 'ON' : 'OFF'}`, tts.x + tts.width / 2, tts.y + 15);
  if (lastInputMode === 'controller' && audioFocus) {
    const focused = { music: sliderHitBounds(slider), sfx: sliderHitBounds(sfxSlider), tts }[audioFocus];
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(focused.x - 3, focused.y - 3, focused.width + 6, focused.height + 6);
    ctx.fillStyle = '#fff0d1';
    ctx.textAlign = 'left';
    ctx.font = '11px Arial';
    const hint = audioFocus === 'tts' ? `${gamepadInput.family === 'ps' ? '✕' : 'A'}: toggle` : 'D-pad ◄ ► adjust';
    ctx.fillText(hint, focused.x + focused.width + 10, focused.y + focused.height / 2 + 4);
  }
  ctx.restore();
}

function loadAsset(path, root = assetRoot) {
  const url = versionedAssetUrl(`${root}/${path}`);
  if (artwork.images.has(url)) return artwork.images.get(url);
  const image = new Image();
  artwork.images.set(url, image);
  // Deferred art (see loadDeferredAsset) waits in a queue and never holds the loading screen.
  const deferred = Boolean(artwork.deferNext) && !artwork.started;
  image.decoding = 'async';
  let retries = 0;
  const fail = (error) => {
    if (retries++ === 0) {
      console.warn(`Retrying artwork: ${url}`, error);
      setTimeout(start, 500);
      return;
    }
    artwork.pending.delete(url);
    artwork.failed.add(url);
    console.error(`Could not load artwork: ${url}`, error);
  };
  const start = () => {
    artwork.failed.delete(url);
    if (!deferred) artwork.pending.add(url);
    image.src = url;
  };
  image.onload = () => {
    const ready = () => artwork.pending.delete(url);
    if (typeof image.decode === 'function') image.decode().then(ready, fail);
    else ready();
  };
  image.onerror = fail;
  if (deferred) {
    artwork.deferred.add(url);
    artwork.queue.push(start);
  } else {
    start();
  }
  return image;
}

// For art first needed after startup (boss sheets, effect sprites): the download starts only once the startup art
// has loaded, so it neither competes with it for connections nor holds up the loading screen. Until it arrives the
// drawing code skips it or draws its fallback, as it does for any art still loading.
function loadDeferredAsset(path, root = assetRoot) {
  artwork.deferNext = true;
  try {
    return loadAsset(path, root);
  } finally {
    artwork.deferNext = false;
  }
}

// Maps the grey pixels of a TMW icon onto a gradient of evenly spaced colors, as the TMW client does for the
// `|W:` dye of an item. Coloured and transparent pixels are left alone.
function dyeGreyPixels(data, stops) {
  const colors = stops.map((stop) => {
    const hex = stop.replace('#', '');
    return [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
  });
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] === 0 || data[index] !== data[index + 1] || data[index + 1] !== data[index + 2]) continue;
    const position = (data[index] / 255) * (colors.length - 1);
    const segment = Math.min(colors.length - 2, Math.floor(position));
    const blend = position - segment;
    for (let channel = 0; channel < 3; channel += 1) {
      data[index + channel] = Math.round(colors[segment][channel] +
        (colors[segment + 1][channel] - colors[segment][channel]) * blend);
    }
  }
  return data;
}

// The PNG on disk stays unmodified; the dyed copy is made once the source has loaded. Browsers that block pixel
// readback for local files keep the grey icon.
function loadDyedAsset(path, stops, root = assetRoot) {
  const dyed = new Image();
  const source = loadAsset(path, root);
  source.addEventListener('load', () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = source.naturalWidth;
      canvas.height = source.naturalHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(source, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      dyeGreyPixels(pixels.data, stops);
      context.putImageData(pixels, 0, 0);
      dyed.src = canvas.toDataURL();
    } catch {
      dyed.src = source.src;
    }
  });
  return dyed;
}

function retryFailedArtwork() {
  for (const url of artwork.failed) {
    const image = artwork.images.get(url);
    artwork.pending.add(url);
    image.src = url;
  }
  artwork.failed.clear();
}

// Only startup and failed downloads block play; art that finishes loading mid-run just appears when ready.
function artworkBlocking() {
  return artwork.failed.size > 0 || (!artwork.started && artwork.pending.size > 0);
}

function updateArtworkLoading() {
  if (!artwork.pending.size && !artwork.failed.size) artwork.started = true;
  if (artwork.started && artwork.queue.length) for (const start of artwork.queue.splice(0)) start();
  const busy = artworkBlocking();
  const panel = document.getElementById('artwork-loading');
  if (panel.hidden === busy) {
    panel.hidden = !busy;
    if (busy) {
      resetTouchInput();
      pointer.down = false;
      for (const key of Object.keys(keys)) keys[key] = false;
    }
  }
  if (busy) {
    const failed = artwork.failed.size;
    const text = failed
      ? `Could not load ${failed} artwork file(s). Check your connection and retry. ${artwork.failed.values().next().value}`
      : `Loading artwork: ${artwork.images.size - artwork.deferred.size - artwork.pending.size} / ${artwork.images.size - artwork.deferred.size}`;
    const status = document.getElementById('artwork-status');
    if (status.textContent !== text) status.textContent = text;
    document.getElementById('artwork-retry').hidden = !failed;
  }
  return busy;
}

function soundUrl(path) {
  return versionedAssetUrl(path.startsWith('som:') ? `${somSoundRoot}/${path.slice(4)}` : `${soundRoot}/${path}`);
}

// Fetches and decodes a sound effect once. A failed fetch or decode leaves the HTMLAudio pool as the fallback.
function loadSoundBuffer(path) {
  const context = gameMusic.context;
  if (!context || typeof fetch !== 'function' || soundBuffers.has(path)) return;
  soundBuffers.set(path, 'loading');
  fetch(soundUrl(path))
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.arrayBuffer();
    })
    .then((data) => new Promise((resolve, reject) => context.decodeAudioData(data, resolve, reject)))
    .then((buffer) => soundBuffers.set(path, buffer))
    .catch(() => soundBuffers.set(path, 'failed'));
}

function preloadSounds(paths) {
  for (const path of paths) loadSoundBuffer(path);
}

// Decodes the cues this room can play (its enemies' hit, death and attack sounds, its breakables, the kill-streak
// fanfare) on entry. Otherwise the first bomb that breaks crates and kills several foes opens a fresh audio element
// per sound in one frame, a visible hitch on phones.
function preloadRoomSounds() {
  if (typeof gameMusic === 'undefined' || !gameMusic.context) return;
  const paths = new Set(['special/fanfare.ogg', 'monsters/zombie/zombiedie.ogg']);
  for (const enemy of enemies) {
    for (const event of ['hit', 'death', 'attack', 'dodge']) {
      const path = enemySound(enemy, event);
      if (path) paths.add(path);
    }
  }
  for (const obstacle of breakables) {
    if (obstacle.sprite?.sound?.break) paths.add(obstacle.sprite.sound.break);
  }
  preloadSounds(paths);
}

// Builds the bomb aftermath and ground-warning textures in idle time at the start of a run, so the first blast
// doesn't build them mid-fight.
function prewarmCombatEffects() {
  const work = [
    () => scorchImage(0), () => scorchImage(1), () => scorchImage(2),
    () => ['#ff5a46', '#ff2a1a', '#ff9d49', '#ffcf6a', '#ffbf6f', '#ffae42', '#ffb25a', '#9fe7f3'].forEach(strikeWaveImage),
    () => effectImageReady(effectArt.smoke) && tintedEffectImage(effectArt.smoke, '#3a3330'),
    () => ['#ffd38a', '#ff8a3a', '#140d08'].forEach((color) => normalLightFalloff(color)),
  ];
  const schedule = typeof requestIdleCallback === 'function'
    ? (callback) => requestIdleCallback(callback, { timeout: 500 }) : (callback) => setTimeout(callback, 16);
  const step = () => {
    const next = work.shift();
    if (!next) return;
    next();
    schedule(step);
  };
  schedule(step);
}

function playSoundBuffer(buffer, volume) {
  const context = gameMusic.context;
  const source = context.createBufferSource();
  const gain = context.createGain();
  source.buffer = buffer;
  gain.gain.value = volume;
  source.connect(gain);
  gain.connect(context.destination);
  source.start();
}

function playSound(path, volume = 0.4) {
  if (audioSettings.sfxVolume <= 0) return;
  volume *= audioSettings.sfxVolume;
  const context = gameMusic.context;
  if (context && context.state === 'running') {
    const entry = soundBuffers.get(path);
    if (entry && entry !== 'loading' && entry !== 'failed') {
      playSoundBuffer(entry, volume);
      return;
    }
    if (!entry) loadSoundBuffer(path);
    // Still decoding: play this one cue through a throwaway element instead of building a pool.
    if (entry !== 'failed' && typeof Audio !== 'undefined') {
      const audio = new Audio(soundUrl(path));
      audio.volume = volume;
      audio.play().catch(() => {});
      return;
    }
  }
  if (typeof Audio === 'undefined') return;
  let pool = soundPools.get(path);
  if (!pool) {
    const url = soundUrl(path);
    pool = Array.from({ length: 4 }, () => {
      const audio = new Audio(url);
      audio.preload = 'auto';
      return audio;
    });
    soundPools.set(path, pool);
  }
  const audio = pool.find((entry) => entry.paused || entry.ended) || pool[0];
  audio.currentTime = 0;
  audio.volume = volume;
  audio.play().catch(() => {});
}

// Pickups and obstacle hits can arrive in clusters, so each cue has a minimum gap between plays.
const throttledSoundTimes = new Map();

function playThrottledSound(path, volume, minGapMs = 70) {
  const now = performance.now();
  if (now - (throttledSoundTimes.get(path) || 0) < minGapMs) return;
  throttledSoundTimes.set(path, now);
  playSound(path, volume);
}

function playPickupSound(name, volume, minGapMs = 70) {
  playThrottledSound(`som:alteration/${name}.ogg`, volume, minGapMs);
}

function scheduleMusicNote(midiNote, startTime, duration, volume, waveform) {
  const oscillator = gameMusic.context.createOscillator();
  const envelope = gameMusic.context.createGain();
  oscillator.type = waveform;
  oscillator.frequency.value = 440 * 2 ** ((midiNote - 69) / 12);
  envelope.gain.setValueAtTime(0.0001, startTime);
  envelope.gain.exponentialRampToValueAtTime(volume, startTime + 0.035);
  envelope.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  oscillator.connect(envelope);
  envelope.connect(gameMusic.gain);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.02);
}

function scheduleGameMusic() {
  if (!gameMusic.enabled || !gameMusic.context || gameMusic.context.state !== 'running') return;
  const beatLength = 60 / 82;
  const scheduleUntil = gameMusic.context.currentTime + 0.2;
  while (gameMusic.nextBeat < scheduleUntil) {
    const step = gameMusic.step % musicMelody.length;
    const chord = musicChords[Math.floor(step / 4)];
    if (step % 4 === 0) {
      scheduleMusicNote(chord[0] - 12, gameMusic.nextBeat, beatLength * 2, 0.12, 'triangle');
      for (const note of chord) {
        scheduleMusicNote(note + 12, gameMusic.nextBeat, beatLength * 3.5, 0.045, 'sine');
      }
    }
    scheduleMusicNote(musicMelody[step], gameMusic.nextBeat, beatLength * 0.42, 0.09, 'triangle');
    gameMusic.nextBeat += beatLength;
    gameMusic.step += 1;
  }
}

function startGameMusic() {
  if (!gameMusic.enabled) return;
  const AudioContextType = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextType) return;
  if (!gameMusic.context) {
    gameMusic.context = new AudioContextType();
    gameMusic.gain = gameMusic.context.createGain();
    gameMusic.gain.gain.value = musicTargetGain();
    gameMusic.gain.connect(gameMusic.context.destination);
  }
  if (gameMusic.timer !== null || gameMusic.starting) return;
  gameMusic.starting = true;
  gameMusic.context.resume().then(() => {
    gameMusic.starting = false;
    preloadSounds(commonSoundEffects);
    if (typeof preloadRoomSounds === 'function' && typeof enemies !== 'undefined') preloadRoomSounds();
    if (!gameMusic.enabled || gameMusic.timer !== null) return;
    gameMusic.nextBeat = gameMusic.context.currentTime + 0.06;
    scheduleGameMusic();
    gameMusic.timer = window.setInterval(scheduleGameMusic, 100);
  }).catch(() => {
    gameMusic.starting = false;
  });
}

function pickNarratorVoice() {
  if (narratorVoiceCache) return narratorVoiceCache;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;
  narratorVoiceCache = voices.find((voice) => voice.lang.startsWith('en') &&
    /andrew|brian|roger|ryan|guy|christopher|natural/i.test(voice.name)) ||
    voices.find((voice) => voice.lang.startsWith('en')) || voices[0];
  return narratorVoiceCache;
}

function speakWithNarrator(utterance, onReady) {
  const speak = () => {
    const voice = pickNarratorVoice();
    if (voice) utterance.voice = voice;
    onReady?.();
    window.speechSynthesis.speak(utterance);
  };
  if (pickNarratorVoice() || window.speechSynthesis.getVoices().length > 0) {
    speak();
    return;
  }
  let done = false;
  const once = () => {
    if (done) return;
    done = true;
    window.speechSynthesis.removeEventListener('voiceschanged', once);
    speak();
  };
  window.speechSynthesis.addEventListener('voiceschanged', once);
  setTimeout(once, 600);
}

function startPrologueSpeechFallback(pageIndex) {
  if (!narrationActive()) return false;
  if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return false;
  if (prologueSpeechFallbackActive && window.speechSynthesis.speaking) return true;
  window.speechSynthesis.cancel();
  const page = prologuePages[pageIndex];
  const utterance = new SpeechSynthesisUtterance(`${page.heading}. ${page.title}. ${page.text}`);
  utterance.lang = 'en-US';
  utterance.rate = 0.94;
  utterance.pitch = 1;
  utterance.volume = 0.9;
  utterance.onstart = () => {
    prologueNarrationNeedsGesture = false;
    prologueSpeechFallbackActive = true;
  };
  utterance.onend = () => {
    if (activePrologueSpeech === utterance) prologueSpeechFallbackActive = false;
  };
  utterance.onerror = () => {
    if (activePrologueSpeech === utterance) prologueSpeechFallbackActive = false;
  };
  activePrologueSpeech = utterance;
  prologueSpeechFallbackActive = true;
  speakWithNarrator(utterance, () => {
    if (activePrologueSpeech !== utterance || mode !== 'prologue') utterance.text = '';
  });
  return true;
}

function startPrologueNarration() {
  if (mode !== 'prologue' || !narrationActive()) return false;
  const audio = prologueNarrations[prologuePage];
  if (activePrologueNarration !== prologuePage) stopPrologueNarration();
  activePrologueNarration = prologuePage;
  if (prologueSpeechFallbackActive && window.speechSynthesis?.speaking) return true;
  if (!audio.paused) return true;
  if (audio.error && startPrologueSpeechFallback(prologuePage)) return true;
  const playback = audio.play();
  if (playback && typeof playback.then === 'function') {
    playback.then(() => {
      prologueNarrationNeedsGesture = false;
    }).catch(() => {
      // Autoplay was blocked: wait for a gesture and retry the recorded voice rather than mixing in a second voice.
      prologueNarrationNeedsGesture = true;
      if (mode !== 'prologue' || activePrologueNarration !== prologuePage) return;
      if (audio.error && startPrologueSpeechFallback(prologuePage)) return;
      showMessage('Press a key or click to start the narration.', 4);
    });
  } else {
    prologueNarrationNeedsGesture = false;
  }
  return !audio.paused;
}

function stopPrologueNarration() {
  for (const audio of prologueNarrations) {
    audio.pause();
    audio.currentTime = 0;
  }
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  activePrologueSpeech = null;
  prologueSpeechFallbackActive = false;
  activePrologueNarration = -1;
}

function elementDisplayName(element) {
  return element === 'bubble' ? 'water' : element;
}

// Signed whole-percent change of a multiplier: 1.5 is '+50%' and 0.9 is '-10%'.
function formatGain(multiplier) {
  const percent = Math.round((multiplier - 1) * 100);
  return `${percent < 0 ? '-' : '+'}${Math.abs(percent)}%`;
}

const bonusStatLabels = { damage: 'Attack', speed: 'Speed', fire: 'Fire rate' };

// The bonus lines shown for an item on shop cards, toasts, the pause grid and the codex. Higher is always better for a
// '+' line: rates are shown as rates, not delays. Numbers come from ITEM_TUNING, the item's own `effects` or clothing
// multipliers and `attackMorphs`; a saved shop stall keeps an old copy of the item, so the live catalogue entry wins.
function itemEffectTagsFor(item) {
  const live = shopItemCatalog.find((entry) => entry.id === item.id) || item;
  const gain = (multiplier, label) => `${formatGain(multiplier)} ${label}`;
  if (live.effects) {
    return Object.entries(live.effects).map(([key, value]) => gain(value, bonusStatLabels[key] || key));
  }
  if (live.kind === 'clothing') {
    return [
      ...(live.speedMul && live.speedMul !== 1 ? [gain(live.speedMul, 'Speed')] : []),
      ...(live.armorBonus ? [`+${live.armorBonus} Armor`] : []),
    ];
  }
  if (live.id.startsWith('heart-vessel-')) return ['+1 Max heart'];
  if (live.id.startsWith('luck-up-')) return ['+1 Luck'];
  if (live.id.startsWith('sanctum-blessing')) return ['+1 Max heart', '+1 Attack'];
  const tuning = ITEM_TUNING;
  switch (live.id) {
    case 'pearl': return [gain(tuning.pearlSize, 'Shot size'), '+1 Attack'];
    case 'prism':
      return [`${PRISM_SHOT_COUNT}-way fan`, `${Math.round(PRISM_TOTAL_DAMAGE / PRISM_SHOT_COUNT * 100)}% damage each`];
    case 'feather': return [gain(tuning.featherFireRate, 'Fire rate'), gain(tuning.featherShotSpeed, 'Shot speed')];
    case 'range-lens': case 'range-lens-ii':
      return [gain(tuning.rangeLens, 'Range'), gain(1 + MELEE_REACH_PER_LENS, 'Melee reach')];
    case 'range-lens-iii':
      return [gain(tuning.rangeLens, 'Range'), gain(1 + MELEE_REACH_PER_LENS, 'Melee reach'), 'Shots pierce walls'];
    case 'mod-windup': return [gain(tuning.chargeSpeed, 'Charge speed'), 'Melee charge mode'];
    case 'mod-draw': return [gain(tuning.chargeSpeed, 'Charge speed'), 'Bow charge mode'];
    case 'mod-quiver': return [gain(tuning.quiverFireRate, 'Fire rate'), gain(tuning.quiverDamage, 'Arrow damage')];
    case 'mod-flurry': return [gain(FLURRY_SWING_RATE, 'Swing rate'), gain(1 / MELEE_BASE_SCALE, 'Hit damage')];
    case 'swift-daggers':
      return ['+1 Melee attack', gain(1 / DAGGER_COOLDOWN_SCALE, 'Swing rate'), '-20% Melee reach'];
    default: break;
  }
  if (live.chaos) return itemEffectTags[live.id] || [];
  const tags = [];
  const morph = attackMorphs[live.id];
  if (morph?.damageMul) tags.push(gain(morph.damageMul, 'Shot damage'));
  if (morph?.speedMul) tags.push(gain(morph.speedMul, 'Shot speed'));
  if (morph?.sizeMul) tags.push(gain(morph.sizeMul, 'Shot size'));
  tags.push(...(itemEffectTags[live.id] || []));
  return tags.length ? tags : [live.description || ''].filter(Boolean);
}

function popOverPlayer({ icon, color = '#ffe38a', image = null }) {
  if (overheadPops.length >= 4) overheadPops.shift();
  overheadPops.push({ icon, color, image, born: elapsed });
}

function addDamageNumber(x, y, amount) {
  if (!(amount >= 1) || quality.low || prefersReducedMotion()) return;
  if (damageNumbers.length >= MAX_DAMAGE_NUMBERS) damageNumbers.shift();
  damageNumbers.push({
    x: x + (Math.random() - 0.5) * 12,
    y,
    text: String(Math.round(amount)),
    heavy: amount >= 10,
    born: elapsed,
  });
}

function drawDamageNumbers() {
  for (let i = damageNumbers.length - 1; i >= 0; i -= 1) {
    const age = elapsed - damageNumbers[i].born;
    if (age < 0 || age > DAMAGE_NUMBER_LIFE) damageNumbers.splice(i, 1);
  }
  if (damageNumbers.length === 0) return;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(12, 10, 14, 0.85)';
  for (const number of damageNumbers) {
    const age = elapsed - number.born;
    ctx.globalAlpha = Math.min(1, (DAMAGE_NUMBER_LIFE - age) / 0.25);
    ctx.font = number.heavy ? 'bold 17px Arial' : 'bold 13px Arial';
    ctx.fillStyle = number.heavy ? '#ffd27a' : '#f4f1e6';
    const y = number.y - Math.min(1, age / 0.3) * 14 - age * 10;
    ctx.strokeText(number.text, number.x, y);
    ctx.fillText(number.text, number.x, y);
  }
  ctx.restore();
}

function showPickupBanner(title, tags) {
  pickupBanner.title = title;
  pickupBanner.tags = tags;
  pickupBanner.timer = 5;
  const gains = tags.filter((tag) => tag.startsWith('+')).length;
  const losses = tags.filter((tag) => tag.startsWith('-')).length;
  if (gains) popOverPlayer({ icon: 'up', color: '#8fe39a' });
  if (losses) popOverPlayer({ icon: 'down', color: '#f08a8a' });
}

function drawOverheadPops() {
  const life = 1.8;
  for (let i = overheadPops.length - 1; i >= 0; i -= 1) {
    if (elapsed - overheadPops[i].born > life) overheadPops.splice(i, 1);
  }
  overheadPops.forEach((pop, index) => {
    const age = elapsed - pop.born;
    const fade = Math.min(1, (life - age) / 0.5, age / 0.12 + 0.6);
    const cx = player.x + (index - (overheadPops.length - 1) / 2) * 26;
    const cy = player.y - 82 - Math.min(1, age / 0.35) * 10 - age * 8;
    ctx.save();
    ctx.globalAlpha = Math.max(0, fade);
    ctx.fillStyle = 'rgba(8, 10, 12, 0.85)';
    ctx.strokeStyle = pop.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = pop.color;
    ctx.strokeStyle = pop.color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.2;
    const icon = pop.image?.complete && pop.image.naturalWidth > 0 ? pop.image : null;
    if (icon) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(icon, cx - 8, cy - 8, 16, 16);
    } else if (pop.icon === 'up' || pop.icon === 'down') {
      const dir = pop.icon === 'up' ? -1 : 1;
      ctx.beginPath();
      ctx.moveTo(cx, cy + dir * -6);
      ctx.lineTo(cx - 6, cy + dir * 1);
      ctx.lineTo(cx + 6, cy + dir * 1);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(cx - 2, cy + (dir < 0 ? 0 : -6), 4, 6);
    } else if (pop.icon === 'unlock') {
      ctx.strokeRect(cx - 5, cy - 1, 10, 7);
      ctx.beginPath();
      ctx.arc(cx + 1, cy - 2, 4, Math.PI, Math.PI * 1.9);
      ctx.stroke();
    } else if (pop.icon === 'heart' || pop.icon === 'half-heart') {
      ctx.save();
      if (pop.icon === 'half-heart') {
        ctx.beginPath();
        ctx.rect(cx - 9, cy - 8, 9, 14);
        ctx.clip();
      }
      drawEffect('heart', 0, cx, cy, { width: 15 });
      ctx.restore();
    } else if (pop.icon === 'key') {
      drawEffect('key', 0, cx, cy, { width: 20 });
    } else if (pop.icon === 'bomb') {
      ctx.beginPath();
      ctx.arc(cx, cy + 2, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx + 3, cy - 3);
      ctx.lineTo(cx + 6, cy - 7);
      ctx.stroke();
    } else {
      drawEffect('star', 0, cx, cy, { width: 14, tint: pop.color });
    }
    ctx.restore();
  });
}

function stopChapterNarration() {
  if (chapterAudio) {
    chapterAudio.pause();
    chapterAudio = null;
  }
  if (window.speechSynthesis) window.speechSynthesis.cancel();
}

function speakChapter(text) {
  if (!narrationActive()) return;
  if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 0.94;
  utterance.volume = 0.9;
  speakWithNarrator(utterance, () => {
    if (mode !== 'chapter') utterance.text = '';
  });
}

function startChapterNarration(card) {
  stopChapterNarration();
  if (!narrationActive()) return;
  const audio = new Audio(versionedAssetUrl(`assets/audio/intro-${card.key.replace(':', '-')}.ogg`));
  audio.volume = 0.76;
  chapterAudio = audio;
  const fallBack = () => {
    if (chapterAudio !== audio) return;
    chapterAudio = null;
    speakChapter(`${card.title}. ${card.text}`);
  };
  audio.addEventListener('error', fallBack, { once: true });
  audio.play().catch(fallBack);
}

function openChapter() {
  if (activeChapter || chapterQueue.length === 0) return;
  activeChapter = chapterQueue.shift();
  chapterReturnMode = mode;
  clearHeldInputs();
  mode = 'chapter';
  startChapterNarration(activeChapter);
  updateHud();
}

function closeChapter() {
  if (mode !== 'chapter') return;
  stopChapterNarration();
  activeChapter = null;
  mode = chapterReturnMode;
  updateHud();
}

function resetRunStats(saved = {}) {
  runStats.seconds = Number(saved.seconds) || 0;
  runStats.kills = Number(saved.kills) || 0;
  runStats.guardians = Number(saved.guardians) || 0;
  runStats.zenyFound = Number(saved.zenyFound ?? saved.zennyFound) || 0;
  runStats.lastHitBy = typeof saved.lastHitBy === 'string' ? saved.lastHitBy : '';
  runStats.unlocked = Array.isArray(saved.unlocked) ? saved.unlocked.filter((id) => typeof id === 'string') : [];
}

function padLabels() {
  return gamepadInput.family === 'ps'
    ? { a: '✕', b: '○', x: '□', y: '△', lb: 'L1', rb: 'R1', lt: 'L2', rt: 'R2', menu: 'Options' }
    : { a: 'A', b: 'B', x: 'X', y: 'Y', lb: 'LB', rb: 'RB', lt: 'LT', rt: 'RT', menu: 'Menu' };
}

function keyLabel(key) {
  if (!key) return '—';
  const names = { ' ': 'SPACE', shift: 'SHIFT', tab: 'TAB', control: 'CTRL', alt: 'ALT', arrowup: '↑',
    arrowdown: '↓', arrowleft: '←', arrowright: '→', enter: 'ENTER' };
  return names[key] || key.toUpperCase();
}

function padButtonLabel(index) {
  const p = padLabels();
  const names = [p.a, p.b, p.x, p.y, p.lb, p.rb, p.lt, p.rt, gamepadInput.family === 'ps' ? 'Share' : 'Back',
    p.menu, 'L3', 'R3', 'D-Up', 'D-Down', 'D-Left', 'D-Right'];
  return names[index] || `Btn ${index}`;
}

function bindLabel(id, long = false) {
  if (lastInputMode === 'controller') {
    const button = bindings.pad[id];
    return button === null || button === undefined ? '—' : padButtonLabel(button);
  }
  const base = keyLabel(bindings.key[id]);
  if (!long) return base;
  if (id === 'ability') return `${base} / Right-Click`;
  if (id === 'nextWeapon') return `${base} / Mouse Wheel`;
  return base;
}

function updateControlsHint() {
  if (!controlsEl) return;
  controlsEl.hidden = !controlsHelpVisible;
  hudEl?.classList.toggle('help-hidden', !controlsHelpVisible);
  let lines;
  if (lastInputMode === 'touch') {
    lines = [];
  } else if (mode === 'playing' || mode === 'paused') {
    const hasItem = consumables.some((item) => item.count > 0);
    const sig = classSignature()?.active ? classSignature().label : null;
    const pad = lastInputMode === 'controller';
    const defenseLabel = ownedItems.has('orbiting-projectiles')
      ? `Mana Guard (${orbitGuardChargeUps}/${ORBIT_GUARD_CHARGE_REQUIREMENT})`
      : `Shockwave (${blanksHeld})`;
    const b = (id) => bindLabel(id, true);
    lines = [
      `${pad ? `LS Move · RS Aim+Fire (or ${padLabels().rt})` : 'WASD Move · Mouse Aim + Left-Click Attack'} · ${b('dash')} Dash · ` +
        `${b('nextWeapon')} Weapon · ${b('interact')} Interact`,
      [`${b('item')} Item${hasItem ? '' : ' (none)'}`, `${b('shock')} ${defenseLabel}`, `${b('bomb')} Bomb (${bombsHeld})`,
        sig ? `${b('ability')} ${sig}` : null, `${b('map')} Map`, pad ? `${padLabels().menu} Pause` : 'P Pause'].filter(Boolean).join(' · '),
    ];
  } else if (mode === 'controls') {
    lines = lastInputMode === 'controller'
      ? ['D-Pad Move · A Rebind · X Clear · LB/RB Switch Tab · B Back']
      : ['↑/↓ Choose · Enter Rebind · Del Clear · ←/→ Switch Tab · Esc Back'];
  } else if (mode === 'prologue') {
    lines = lastInputMode === 'controller'
      ? ['D-Pad / LS Read · A/Start Continue']
      : ['←/→ Read · Enter Continue'];
  } else if (mode === 'chapter') {
    lines = lastInputMode === 'controller'
      ? ['A / Start Continue']
      : ['Enter / Space / Click Continue'];
  } else if (mode === 'codex') {
    lines = lastInputMode === 'controller'
      ? ['D-Pad Browse · LB/RB Change Tab · B Close']
      : ['↑/↓ Browse · ←/→ Change Tab · K/ESC Close'];
  } else if (mode === 'tutorial') {
    lines = lastInputMode === 'controller'
      ? ['D-Pad / A Change Page · B Back']
      : ['←/→ Change Page · H/ESC Back'];
  } else {
    lines = lastInputMode === 'controller'
      ? ['D-Pad ←/→ Delver · ↑/↓ Menu · X Select · RB Codex · Y How to Play · Back Controls · LB Prologue']
      : ['←/→ Select · Enter Descend · K Codex · H How to Play · C Controls · P Prologue'];
  }
  const hintText = lines.join('\n');
  if (controlsEl.textContent !== hintText) controlsEl.textContent = hintText;
}

function updateHud() {
  if (!character) {
    statsEl.textContent = mode === 'prologue' ? 'Tulimshar · Hurnscald · Artis Ruins' : 'Choose a delver';
    updateControlsHint();
    return;
  }
  // updateHud runs every frame; only touch the DOM when the text changes.
  const stats =
    `${currentFloorTheme().name} · ${character.className} • Lead: ${activeCombatStyle} | Zeny: ${coins} | Bank: ${save.bankedZeny}`;
  if (statsEl.textContent !== stats) statsEl.textContent = stats;
  updateControlsHint();
}

const MAX_MESSAGE_TOASTS = 3;

function showMessage(text, seconds = 2.5) {
  messageEl.textContent = text;
  messageTimer = seconds;
  // During play, notices also stack on the canvas so they are seen and don't overwrite each other.
  if (mode !== 'playing' || seconds > 60) return;
  const existing = messageToasts.findIndex((toast) => toast.text === text);
  if (existing >= 0) messageToasts.splice(existing, 1);
  messageToasts.unshift({ text, timer: clamp(seconds, 1.5, 4) });
  messageToasts.length = Math.min(messageToasts.length, MAX_MESSAGE_TOASTS);
}

function toggleControlsHelp() {
  controlsHelpVisible = !controlsHelpVisible;
  try {
    localStorage.setItem(HELP_VISIBILITY_STORAGE_KEY, String(controlsHelpVisible));
  } catch (error) {
    // Keep the preference for this session if storage is unavailable.
  }
  updateControlsHint();
}

function recordStory(title, text) {
  if (!text || storyLog.some((entry) => entry.title === title && entry.text === text)) return;
  storyLog.push({ title, text });
  if (storyLog.length > 18) storyLog.shift();
}

// The user's reduced-motion preference. The query is created once; its `matches` flag stays live.
function prefersReducedMotion() {
  if (prefersReducedMotion.query === undefined) {
    try {
      prefersReducedMotion.query = window.matchMedia('(prefers-reduced-motion: reduce)');
    } catch (error) {
      prefersReducedMotion.query = null;
    }
  }
  return prefersReducedMotion.query?.matches === true;
}

function drawManaPanel(x, y, width, height, accent = '#c9a65a') {
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(28, 29, 25, 0.93)';
  ctx.beginPath();
  ctx.moveTo(x + 8, y);
  ctx.lineTo(x + width - 8, y);
  ctx.lineTo(x + width, y + 8);
  ctx.lineTo(x + width, y + height - 8);
  ctx.lineTo(x + width - 8, y + height);
  ctx.lineTo(x + 8, y + height);
  ctx.lineTo(x, y + height - 8);
  ctx.lineTo(x, y + 8);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#211c13';
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(245, 220, 155, 0.24)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 4.5, y + 4.5, width - 9, height - 9);
  if (width > 100 && height > 60) {
    ctx.fillStyle = '#34362e';
    ctx.fillRect(x + 9, y + 7, width - 18, 19);
    ctx.fillStyle = accent;
    for (const cornerX of [x + 7, x + width - 7]) {
      ctx.beginPath();
      ctx.moveTo(cornerX, y + 3);
      ctx.lineTo(cornerX + 4, y + 7);
      ctx.lineTo(cornerX, y + 11);
      ctx.lineTo(cornerX - 4, y + 7);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawPauseEquipment() {
  const equipped = shopItemCatalog.filter((item) => ownedItems.has(item.id));
  const supplies = consumables.filter((item) => item.count > 0);
  const carried = Object.keys(materialCatalog).filter((key) => materials[key] > 0)
    .map((key) => ({ id: materialCatalog[key].id, name: materialCatalog[key].name, count: materials[key] }));
  const items = [...equipped, ...supplies, ...carried];
  const panel = { x: 104, y: 400, width: VIEW_W - 208, height: VIEW_H - 412 };
  const gridWidth = panel.width - 24;
  const gridHeight = panel.height - 38;
  let cell = 36;
  while (Math.floor(gridWidth / cell) * Math.floor(gridHeight / cell) < items.length && cell > 10) cell -= 1;
  const columns = Math.floor(gridWidth / cell);
  ctx.save();
  drawManaPanel(panel.x, panel.y, panel.width, panel.height);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = 'bold 12px Georgia';
  ctx.fillStyle = '#e9d39f';
  let label = `Inventory  /  Equipped ${equipped.length}  /  Supplies ${supplies.length}` +
    (carried.length ? `  /  Materials ${carried.reduce((total, stack) => total + stack.count, 0)}` : '');
  items.forEach((item, index) => {
    const x = panel.x + 12 + (index % columns) * cell;
    const y = panel.y + 32 + Math.floor(index / columns) * cell;
    const hovered = lastInputMode === 'keyboard' &&
      pointer.x >= x && pointer.x < x + cell && pointer.y >= y && pointer.y < y + cell;
    drawManaPanel(x + 1, y + 1, cell - 3, cell - 3, hovered ? '#f0d486' : '#796b47');
    ctx.save();
    ctx.translate(x + (cell - 1) / 2, y + (cell - 1) / 2);
    ctx.scale((cell - 9) / 28, (cell - 9) / 28);
    drawShopItemIcon(item, 0, 0);
    ctx.restore();
    const gates = item.count > 0 ? [] : branchesForItem(item.id);
    const dormant = gates.length > 0 && item.id !== character?.startingAbility &&
      !gates.some((branch) => branchLoadout(branch.style).includes(branch.id));
    if (dormant) {
      ctx.fillStyle = 'rgba(10, 10, 14, 0.55)';
      ctx.fillRect(x + 2, y + 2, cell - 5, cell - 5);
    }
    if (item.count > 0) {
      ctx.font = `bold ${Math.max(7, Math.min(10, cell / 3))}px Arial`;
      ctx.textAlign = 'right';
      ctx.fillStyle = '#fff4d5';
      ctx.fillText(String(item.count), x + cell - 4, y + cell - 5);
    }
    if (hovered) {
      const bonuses = itemEffectTagsFor(item).filter((tag) => tag !== item.description);
      label = item.name + (item.count > 0 ? ` (${item.count})` : '') + (bonuses.length ? `:  ${bonuses.join(', ')}` : '') +
        (dormant ? `  (needs the ${gates.map((branch) => branch.name).join(' or ')} branch)` : '');
    }
  });
  ctx.textAlign = 'left';
  ctx.font = 'bold 12px Georgia';
  ctx.fillStyle = '#e9d39f';
  ctx.fillText(label, panel.x + 14, panel.y + 21, gridWidth);
  if (!items.length) {
    ctx.font = '12px Arial';
    ctx.fillStyle = '#bbb49d';
    ctx.fillText('Equipment and supplies collected during this descent appear here.', panel.x + 14, panel.y + 58, gridWidth);
  }
  ctx.restore();
}

function terrainTileAt(terrain, column, row) {
  if (terrain.tilePattern) {
    const patternRow = terrain.tilePattern[row % terrain.tilePattern.length];
    return patternRow[column % patternRow.length];
  }
  return terrain.tileIds[(column * 7 + row * 13) % terrain.tileIds.length];
}

// Tulimshar reserves extra room for a wall-top path behind its facade.
const ROOM_WALL_BAND = 64;
const DOOR_OPENING_HALF_WIDTH = 48;

function roomWallBand(room = currentRoom) {
  return currentRegionId() === 'tulimshar' && room?.type !== 'secret' ? DESERT_ART.wallBand : ROOM_WALL_BAND;
}

function clipRoomWallBand(target = ctx) {
  const band = roomWallBand();
  const half = DOOR_OPENING_HALF_WIDTH;
  target.beginPath();
  target.rect(0, 0, ROOM_W, ROOM_H);
  target.rect(band, band, ROOM_W - band * 2, ROOM_H - band * 2);
  for (const { name } of directions) {
    const secretDoor = currentRoom.secretExit?.direction === name && !currentRoom.secretExit.room.hidden;
    if (!currentRoom.cleared || currentRoom.lockedDoors[name] ||
        !(currentRoom.links[name] || secretDoor)) continue;
    if (name === 'up' || name === 'down') {
      target.rect(ROOM_W / 2 - half, name === 'up' ? 0 : ROOM_H - band, half * 2, band);
    } else {
      target.rect(name === 'left' ? 0 : ROOM_W - band, ROOM_H / 2 - half, band, half * 2);
    }
  }
  target.clip('evenodd');
}

function drawCastleWalls(target = ctx) {
  if (!castleWallTiles.complete || castleWallTiles.naturalWidth < 512 ||
      castleWallTiles.naturalHeight < 192) return;
  const tile = (id, x, y, width, height) => {
    target.drawImage(castleWallTiles, id % 16 * 32, Math.floor(id / 16) * 32, 32, 32,
      x, y, width, height);
  };
  target.save();
  clipRoomWallBand(target);
  // 001-3 / Over 2 (102,100)..(105,104): vertical edges 32/34, not facade 65/81.
  for (let y = 64; y < ROOM_H - 64; y += 32) {
    const height = Math.min(32, ROOM_H - 64 - y);
    tile(32, 0, y, 64, height);
    tile(34, ROOM_W - 64, y, 64, height);
  }
  const course = (left, middle, right, y, height) => {
    tile(left, 0, y, 64, height);
    for (let x = 64; x < ROOM_W - 64; x += 32) {
      tile(middle, x, y, Math.min(32, ROOM_W - 64 - x), height);
    }
    tile(right, ROOM_W - 64, y, 64, height);
  };
  course(0, 1, 2, 0, 32);
  course(16, 17, 18, 32, 32);
  // The authored lower cap continues into the face and its base; fit depth into collision.
  course(48, 49, 50, ROOM_H - 64, 64 / 3);
  course(64, 65, 66, ROOM_H - 64 + 64 / 3, 64 / 3);
  course(80, 81, 82, ROOM_H - 64 / 3, 64 / 3);
  target.restore();
}

function drawCachedRoomWalls(desert) {
  const image = desert ? tulimsharCastleTiles : castleWallTiles;
  if (!image.complete || image.naturalWidth === 0) return;
  const openings = directions.map(({ name }) => {
    const secret = currentRoom.secretExit?.direction === name && !currentRoom.secretExit.room.hidden;
    return currentRoom.cleared && !currentRoom.lockedDoors[name] && (currentRoom.links[name] || secret) ? 1 : 0;
  }).join('');
  const jambs = desert ? directions.map(({ name }) => {
    const secret = currentRoom.secretExit?.direction === name && !currentRoom.secretExit.room.hidden;
    return currentRoom.links[name] || secret ? 1 : 0;
  }).join('') : '';
  const key = `${desert}:${ROOM_W}:${ROOM_H}:${roomWallBand()}:${openings}:${jambs}:${image.naturalWidth}:${image.naturalHeight}`;
  if (drawCachedRoomWalls.key !== key) {
    const layer = document.createElement('canvas');
    layer.width = ROOM_W;
    layer.height = ROOM_H;
    const target = layer.getContext('2d');
    target.imageSmoothingEnabled = false;
    if (desert) drawTulimsharCastleWalls(target);
    else drawCastleWalls(target);
    // Keep only the current wall layer, not a second full room cache.
    drawCachedRoomWalls.layer = layer;
    drawCachedRoomWalls.key = key;
  }
  ctx.drawImage(drawCachedRoomWalls.layer, 0, 0);
}

function drawTulimsharCastleWalls(target = ctx) {
  if (!tulimsharCastleTiles.complete || tulimsharCastleTiles.naturalWidth < 96 ||
      tulimsharCastleTiles.naturalHeight < 128) return;
  const columns = Math.floor(tulimsharCastleTiles.naturalWidth / 32);
  const tile = (column, row, x, y, width = 32, height = 32) => {
    const id = row * columns + column;
    target.drawImage(tulimsharCastleTiles, id % columns * 32, Math.floor(id / columns) * 32,
      width, height, x, y, width, height);
  };
  target.save();
  clipRoomWallBand(target);
  for (let y = 32; y < ROOM_H - 32; y += 32) {
    const height = Math.min(32, ROOM_H - 32 - y);
    tile(0, 2, 0, y, 32, height);
    tile(2, 2, ROOM_W - 32, y, 32, height);
  }
  for (const [row, y] of [[0, 0], [3, ROOM_H - 32]]) {
    tile(0, row, 0, y);
    for (let x = 32; x < ROOM_W - 32; x += 32) {
      tile(1, row, x, y, Math.min(32, ROOM_W - 32 - x));
    }
    tile(2, row, ROOM_W - 32, y);
  }
  target.restore();
  drawTulimsharDoorJambs(target);
}

function drawTulimsharDoorJambs(target = ctx) {
  if (!tulimsharCastleTiles.complete || tulimsharCastleTiles.naturalWidth < 96 ||
      tulimsharCastleTiles.naturalHeight < 704) return;
  const size = 32;
  const half = DOOR_OPENING_HALF_WIDTH;
  target.save();
  for (const { name } of directions) {
    const secret = currentRoom.secretExit?.direction === name && !currentRoom.secretExit.room.hidden;
    if (!(currentRoom.links[name] || secret)) continue;
    const vertical = name === 'up' || name === 'down';
    const x = vertical ? ROOM_W / 2 : name === 'left' ? size / 2 : ROOM_W - size / 2;
    const y = vertical ? name === 'up' ? size / 2 : ROOM_H - size / 2 : ROOM_H / 2;
    const degrees = { down: 0, up: 180, right: 90, left: 270 }[name];
    target.save();
    target.translate(x, y);
    // Canvas angles run clockwise; the approved south-facing pair turns counterclockwise.
    target.rotate(-degrees * Math.PI / 180);
    for (const [sx, offset] of [[32, -half - size], [64, half]]) {
      target.clearRect(offset, -size / 2, size, size);
      target.drawImage(tulimsharCastleTiles, sx, 640, size, size,
        offset, -size / 2, size, size);
    }
    target.restore();
  }
  target.restore();
}

function drawRoomFloor() {
  const theme = currentFloorTheme();
  const band = roomWallBand();
  if (currentRoom.type === 'secret' && sacredRoomTiles.complete && sacredRoomTiles.naturalWidth > 0) {
    const drawSacredFloor = (target) => {
      target.fillStyle = '#16131b';
      target.fillRect(0, 0, ROOM_W, ROOM_H);
      for (let y = 64; y < ROOM_H - 64; y += 32) {
        for (let x = 64; x < ROOM_W - 64; x += 32) {
          const variation = (Math.floor(x / 32) + Math.floor(y / 32) * 3) % sacredRoomFloorTileIds.length;
          const tileId = sacredRoomFloorTileIds[variation];
          const sourceX = (tileId % 16) * 32;
          const sourceY = Math.floor(tileId / 16) * 32;
          target.drawImage(sacredRoomTiles, sourceX, sourceY, 32, 32, x, y, 32, 32);
        }
      }
    };
    drawSacredFloor(ctx);
    requestRoomNormalMap(`secret:${ROOM_W}x${ROOM_H}:${sacredRoomTiles.naturalWidth}x${sacredRoomTiles.naturalHeight}`,
      drawSacredFloor);
    ctx.fillStyle = '#ead8ac';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('SACRED HIDDEN SANCTUM', ROOM_W / 2, 61);
  } else {
    const terrain = terrainTiles[currentRegionId()] || terrainTiles.tulimshar;
    const image = terrain.image;
    if (image.complete && image.naturalWidth >= 32 && image.naturalHeight >= 32) {
      const regionId = currentRegionId();
      const desert = isDesertRegion();
      const layoutKey = desert ? desertLayoutKey(desertPavingReady()) : '';
      const terrainKey = `${regionId}:${ROOM_W}x${ROOM_H}${layoutKey}`;
      const drawTerrain = (terrainContext) => {
        terrainContext.fillStyle = theme.wall;
        terrainContext.fillRect(0, 0, ROOM_W, ROOM_H);
        const tiles = filteredTileset(image, regionId === 'graveyard' ? 'saturate(0.28) brightness(0.52)'
          : regionId === 'artis' || regionId === 'candor' ? 'hue-rotate(205deg) saturate(0.75) brightness(0.72)' : null);
        const tileColumns = Math.floor(image.naturalWidth / 32);
        for (let row = band / 32; row * 32 < ROOM_H - band; row += 1) {
          for (let column = band / 32; column * 32 < ROOM_W - band; column += 1) {
            const tileId = terrainTileAt(terrain, column - band / 32, row - band / 32);
            const sourceX = (tileId % tileColumns) * 32;
            const sourceY = Math.floor(tileId / tileColumns) * 32;
            terrainContext.drawImage(tiles, sourceX, sourceY, 32, 32, column * 32, row * 32, 32, 32);
          }
        }
        if (desert) drawDesertGround(terrainContext, image);
      };
      let terrainBackground = terrainBackgroundCache.get(terrainKey);
      if (!terrainBackground) {
        terrainBackground = document.createElement('canvas');
        terrainBackground.width = ROOM_W;
        terrainBackground.height = ROOM_H;
        drawTerrain(terrainBackground.getContext('2d'));
        if (terrainBackgroundCache.size >= 12) {
          terrainBackgroundCache.delete(terrainBackgroundCache.keys().next().value);
        }
        terrainBackgroundCache.set(terrainKey, terrainBackground);
      }
      ctx.drawImage(terrainBackground, 0, 0);
      drawCachedRoomWalls(desert);
      requestRoomNormalMap(`${terrainKey}:${drawCachedRoomWalls.key || 'no-walls'}`, (target) => {
        drawTerrain(target);
        if (desert) drawTulimsharCastleWalls(target);
        else drawCastleWalls(target);
      });
    } else {
      ctx.fillStyle = theme.wall;
      ctx.fillRect(0, 0, ROOM_W, ROOM_H);
    }
  }

    ctx.strokeStyle = 'rgba(113, 86, 45, 0.36)';
    ctx.lineWidth = 1;
    ctx.strokeRect(band - 1, band - 1, ROOM_W - band * 2 + 2, ROOM_H - band * 2 + 2);

  for (const direction of directions) {
    const secretDoor = currentRoom.secretExit?.direction === direction.name &&
      !currentRoom.secretExit.room.hidden;
    const hasDoor = currentRoom.links[direction.name] || secretDoor;
    if (!hasDoor) continue;
    const locked = currentRoom.lockedDoors[direction.name] === true;
    const sealed = !currentRoom.cleared;
    const vertical = direction.name === 'up' || direction.name === 'down';
    const centerX = vertical ? ROOM_W / 2 : direction.name === 'left' ? band / 2 : ROOM_W - band / 2;
    const centerY = vertical ? (direction.name === 'up' ? band / 2 : ROOM_H - band / 2) : ROOM_H / 2;
    ctx.save();
    ctx.translate(centerX, centerY);
    if (!vertical) ctx.rotate(Math.PI / 2);
    // Doors keep their width while their depth follows the surrounding wall.
    const doorHalfDepth = band / 2 - 4;
    if (sealed || locked) {
      ctx.fillStyle = sealed ? '#4a2a2a' : '#6b4a26';
      ctx.fillRect(-48, -doorHalfDepth, 96, doorHalfDepth * 2);
      ctx.strokeStyle = sealed ? '#b55a5a' : '#e0b45e';
      ctx.lineWidth = 3;
      ctx.strokeRect(-47, -doorHalfDepth + 1, 94, doorHalfDepth * 2 - 2);
      ctx.strokeStyle = sealed ? '#2a1515' : '#3d2a14';
      ctx.lineWidth = 2;
      for (let bar = -30; bar <= 30; bar += 20) {
        ctx.beginPath();
        ctx.moveTo(bar, -doorHalfDepth + 2);
        ctx.lineTo(bar, doorHalfDepth - 2);
        ctx.stroke();
      }
      ctx.fillStyle = sealed ? '#d98a8a' : '#f1cf7a';
      ctx.fillRect(-9, -4, 18, 15);
      ctx.strokeStyle = sealed ? '#d98a8a' : '#f1cf7a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, -4, 6, Math.PI, 0);
      ctx.stroke();
      ctx.fillStyle = '#211e25';
      ctx.fillRect(-1.5, 1, 3, 6);
    } else {
      ctx.fillStyle = 'rgba(14, 18, 12, 0.85)';
      ctx.fillRect(-42, -doorHalfDepth, 84, doorHalfDepth * 2);
      ctx.strokeStyle = '#8cae7a';
      ctx.lineWidth = 3;
      ctx.strokeRect(-42, -doorHalfDepth, 84, doorHalfDepth * 2);
    }
    const bossDoor = currentRoom.type !== 'boss' && rooms.some((candidate) => candidate.type === 'boss' &&
      candidate.x === currentRoom.x + direction.dx && candidate.y === currentRoom.y + direction.dy);
    if (bossDoor) {
      // Pulsing crimson frame and skull so the boss entrance is unmistakable.
      const pulse = 0.55 + Math.sin(elapsed * 4) * 0.25;
      ctx.shadowColor = `rgba(255, 60, 60, ${pulse})`;
      ctx.shadowBlur = 22;
      ctx.strokeStyle = `rgba(255, 70, 70, ${0.6 + pulse * 0.4})`;
      ctx.lineWidth = 5;
      ctx.strokeRect(-52, -doorHalfDepth - 4, 104, doorHalfDepth * 2 + 8);
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(120, 10, 20, 0.45)';
      ctx.fillRect(-48, -doorHalfDepth, 96, doorHalfDepth * 2);
      ctx.fillStyle = '#f4ecec';
      ctx.beginPath();
      ctx.arc(0, -2, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(-6, 4, 12, 9);
      ctx.fillStyle = '#3a0c12';
      ctx.beginPath();
      ctx.arc(-4, -3, 2.6, 0, Math.PI * 2);
      ctx.arc(4, -3, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(-0.8, 6, 1.6, 6);
    }
    ctx.restore();
    ctx.fillStyle = bossDoor ? '#ff9a9a' : sealed ? '#ffd4d4' : locked ? '#fff0bd' : '#dce8c8';
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'center';
    const doorLabel = bossDoor ? (sealed ? 'BOSS · SEALED' : locked ? 'BOSS · KEY' : 'BOSS')
      : sealed ? 'SEALED' : locked ? (keysHeld > 0 ? 'KEY' : 'LOCKED') : 'OPEN';
    const labelX = vertical ? ROOM_W / 2 : direction.name === 'left' ? band + 14 : ROOM_W - band - 14;
    const labelY = vertical ? (direction.name === 'up' ? band + 14 : ROOM_H - band - 6) : ROOM_H / 2 + 4;
    ctx.fillText(doorLabel, labelX, labelY);
  }

  if (currentRoom.secretExit?.room.hidden) {
    const direction = currentRoom.secretExit.direction;
    ctx.strokeStyle = '#b78f69';
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (direction === 'up' || direction === 'down') {
      const y = direction === 'up' ? band / 2 + 6 : ROOM_H - band / 2 - 6;
      ctx.moveTo(ROOM_W / 2 - 26, y - 8);
      ctx.lineTo(ROOM_W / 2 + 26, y + 8);
      ctx.moveTo(ROOM_W / 2 + 18, y - 8);
      ctx.lineTo(ROOM_W / 2 - 18, y + 8);
    } else {
      const x = direction === 'left' ? band / 2 + 6 : ROOM_W - band / 2 - 6;
      ctx.moveTo(x - 8, ROOM_H / 2 - 24);
      ctx.lineTo(x + 8, ROOM_H / 2 + 24);
      ctx.moveTo(x - 8, ROOM_H / 2 + 18);
      ctx.lineTo(x + 8, ROOM_H / 2 - 18);
    }
    ctx.stroke();
  }
}

// TMW star particle in the spell's colour.
function drawPlayerMagicMark(x, y, color) {
  drawEffect('star', 0, x, y, { width: 18, tint: color, alpha: 0.95, rotation: elapsed * 2 });
}

function drawEnemy(enemy) {
  const magicStatus = enemy.manaSlam || enemy.manaBomb || enemy.manaRift;
  if (magicStatus || enemy.manaRotTimer > 0) {
    drawPlayerMagicMark(enemy.x, enemy.y - enemy.radius * 2 - 20,
      magicStatus?.color || enemy.manaRotColor || '#62d9ee');
  }
  if (enemy.manaSlam) {
    const progress = 1 - enemy.manaSlam.timer / enemy.manaSlam.duration;
    const height = progress < 0.35 ? progress / 0.35 * 85 : progress < 0.7 ? 85
      : (1 - progress) / 0.3 * 85;
    ctx.save();
    ctx.strokeStyle = enemy.manaSlam.color || '#adceff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(enemy.x - enemy.radius, enemy.y - height - 20);
    ctx.lineTo(enemy.x - enemy.radius, enemy.y - 5);
    ctx.moveTo(enemy.x + enemy.radius, enemy.y - height - 20);
    ctx.lineTo(enemy.x + enemy.radius, enemy.y - 5);
    ctx.stroke();
    ctx.translate(0, -height);
    drawEnemyBody(enemy, false);
    ctx.restore();
    return;
  }
  if (enemy.manaBomb) {
    ctx.save();
    drawEnemyBody(enemy, false);
    const pulse = 0.5 + Math.sin(elapsed * (18 + (1 - enemy.manaBomb.timer / enemy.manaBomb.duration) * 22)) * 0.5;
    drawEffect('glow', 0, enemy.x, enemy.y - enemy.radius * 0.7, { width: enemy.radius * 3, height: enemy.radius * 3.6,
      tint: '#ff2319', alpha: 0.35 + pulse * 0.6, smooth: true });
    drawEffect('surprise', 0, enemy.x, enemy.y - enemy.radius * 2 - 14, { width: 20 });
    ctx.restore();
    return;
  }
  const rift = enemy.manaRift;
  if (!rift) {
    drawEnemyBody(enemy, false);
    return;
  }
  const progress = 1 - rift.timer / rift.duration;
  const visible = Math.abs(progress * 2 - 1);
  ctx.save();
  ctx.beginPath();
  ctx.rect(enemy.x - enemy.radius * 4, enemy.y - enemy.radius * 6, enemy.radius * 8, enemy.radius * 6 + 4);
  ctx.clip();
  ctx.translate(enemy.x, enemy.y + (1 - visible) * 24);
  ctx.scale(1, Math.max(0.02, visible));
  ctx.translate(-enemy.x, -enemy.y);
  ctx.globalAlpha *= visible;
  drawEnemyBody(enemy, false);
  ctx.restore();
}

function mobDrawScale(enemy, sprite) {
  const original = sprite.scale * (enemy.boss && enemy.kind !== 'jacko' ? 1.4 : 1) *
    (enemy.miniBoss && !enemy.boss ? 1.5 : 1) * (enemy.isOffspring ? 0.58 : 1);
  return (original + Math.max(1, Math.ceil(original * 1.15))) / 2;
}

// Which frame a mob shows and where it sits; shared by its shadow (drawn in the shadow pass) and its body.
function enemySpritePose(enemy) {
  const sprite = monsterSprites[enemy.kind];
  if (!sprite.image.complete || sprite.image.naturalWidth === 0) return null;
  let frame = 0;
  if (enemy.kind === 'ratto') {
    const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    const directionIndex = (Math.round(angle / (Math.PI / 4)) + 8) % 8;
    const direction = [6, 7, 0, 1, 2, 3, 4, 5][directionIndex];
    const frameSets = [[22, 23, 24, 21], [15, 16, 17, 14], [8, 9, 10, 7], [57, 58, 59, 56],
      [50, 51, 52, 49], [43, 44, 45, 42], [36, 37, 38, 35], [29, 30, 31, 28]];
    const set = frameSets[direction];
    frame = set[Math.floor(elapsed * 7) % set.length];
  } else if (enemy.kind === 'croc') {
    const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    const directionIndex = (Math.round(angle / (Math.PI / 4)) + 8) % 8;
    const direction = [6, 7, 0, 1, 2, 3, 4, 5][directionIndex];
    const frameSets = [[49, 48, 50, 48], [57, 56, 58, 56], [1, 0, 2, 0], [9, 8, 10, 8],
      [17, 16, 18, 16], [25, 24, 26, 24], [33, 32, 34, 32], [41, 40, 42, 40]];
    const set = frameSets[direction];
    frame = set[Math.floor(elapsed * 5) % set.length];
  } else if (['slime-mother', 'banditlord'].includes(enemy.kind)) {
    const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    const direction = Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle))
      ? Math.cos(angle) < 0 ? 1 : 3
      : Math.sin(angle) < 0 ? 2 : 0;
    const bases = [0, 18, 36, 54];
    const attackBases = enemy.kind === 'banditlord' ? [13, 31, 49, 67] : [9, 27, 45, 63];
    const attackFrameCount = enemy.kind === 'banditlord' ? 5 : 4;
    const moving = Math.hypot(player.x - enemy.x, player.y - enemy.y) > enemy.radius + player.radius + 4;
    const attacking = enemy.behavior !== 'jacko-idle';
    if (attacking) frame = attackBases[direction] + Math.floor(elapsed * 13) % attackFrameCount;
    else if (moving) frame = bases[direction] + 1 + Math.floor(elapsed * 13) % 6;
    else frame = bases[direction];
  } else if (enemy.kind === 'reaper') {
    const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    const direction = Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle))
      ? Math.cos(angle) < 0 ? 1 : 3
      : Math.sin(angle) < 0 ? 2 : 0;
    const walkFrames = [[25, 26, 25, 24], [28, 27, 28, 27], [19, 20, 19, 18], [22, 21, 22, 21]];
    const attackFrames = [[0, 1, 2, 3, 4, 5, 4, 3, 2, 1], [17, 16, 15, 16, 17],
      [6, 7, 8, 9, 10, 11, 10, 9, 8, 7], [12, 13, 14, 13, 12]];
    const frames = enemy.behavior !== 'jacko-idle' ? attackFrames[direction] : walkFrames[direction];
    frame = frames[Math.floor(elapsed * (enemy.behavior !== 'jacko-idle' ? 12 : 8)) % frames.length];
  } else if (enemy.kind === 'serqet') {
    const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    const direction = Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle))
      ? Math.cos(angle) < 0 ? 1 : 3
      : Math.sin(angle) < 0 ? 0 : 2;
    const standFrames = [[22, 23], [11, 12], [33, 34], [0, 1]];
    const walkFrames = [[24, 25, 26, 27], [13, 14, 15, 16], [35, 36, 37, 38], [2, 3, 4, 5]];
    const attackFrames = [[28, 29], [17, 18], [39, 40], [6, 7]];
    const attacking = enemy.behavior !== 'jacko-idle';
    const frames = attacking ? attackFrames[direction]
      : Math.hypot(player.x - enemy.x, player.y - enemy.y) > enemy.radius + player.radius + 4
        ? walkFrames[direction] : standFrames[direction];
    frame = frames[Math.floor(elapsed * (attacking ? 12 : 8)) % frames.length];
  } else if (enemy.kind === 'yetiking') {
    const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    const direction = Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle))
      ? Math.cos(angle) < 0 ? 1 : 3
      : Math.sin(angle) < 0 ? 0 : 2;
    const standFrames = [[3], [10], [31], [20]];
    const walkFrames = [[1, 2, 3, 4], [11, 12, 13, 14], [31, 32, 33, 34], [21, 22, 23, 24]];
    const attackFrames = [[5, 6, 7, 8], [15, 16, 17, 18], [35, 36, 37, 38], [25, 26, 27, 28]];
    const attacking = enemy.behavior !== 'jacko-idle';
    const frames = attacking ? attackFrames[direction]
      : Math.hypot(player.x - enemy.x, player.y - enemy.y) > enemy.radius + player.radius + 4
        ? walkFrames[direction] : standFrames[direction];
    frame = frames[Math.floor(elapsed * (attacking ? 14 : 9)) % frames.length];
  } else if (['forestdragon', 'nightdragon'].includes(enemy.kind)) {
    const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    const direction = Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle))
      ? Math.cos(angle) < 0 ? 3 : 2
      : Math.sin(angle) < 0 ? 1 : 0;
    const base = [0, 8, 16, 24][direction];
    const attacking = enemy.behavior !== 'jacko-idle';
    frame = attacking ? base + 2 + Math.floor(elapsed * 11) % 6
      : base + (Math.floor(elapsed * 2) % 5 === 0 ? 1 : 0);
  } else if (enemy.kind === 'spider-queen') {
    const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    const directionIndex = (Math.round(angle / (Math.PI / 4)) + 8) % 8;
    const standFrames = [36, 18, 0, 126, 108, 90, 72, 54];
    const base = standFrames[directionIndex];
    const attacking = enemy.behavior !== 'jacko-idle' && enemy.behavior !== 'jacko-ground-pound-hidden';
    frame = attacking
      ? base + 9 + Math.floor(elapsed * (enemy.phase >= 2 ? 12 : 8)) % 9
      : base + Math.floor(elapsed * 6) % 9;
  } else if (enemy.kind === 'golem' || enemy.kind === 'snowman-boss') {
    const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    const directionIndex = (Math.round(angle / (Math.PI / 4)) + 8) % 8;
    const xmlDirection = [2, 1, 0, 7, 6, 5, 4, 3][directionIndex];
    const walkStarts = [12, 24, 36, 48, 60, 72, 84, 96];
    const attacking = enemy.behavior !== 'jacko-idle' && enemy.behavior !== 'jacko-ground-pound-hidden';
    const attackStarts = [108, 120, 132, 144, 156, 168, 180, 192];
    const start = attacking ? attackStarts[xmlDirection] : walkStarts[xmlDirection];
    const frameCount = attacking ? 11 : 12;
    frame = start + Math.floor(elapsed * (enemy.phase >= 2 ? 12 : 7)) % frameCount;
    if (enemy.behavior === 'jacko-idle') frame = xmlDirection;
  } else if (enemy.kind === 'jacko') {
    const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    const direction = Math.abs(angle) < Math.PI / 4 ? 1
      : angle > Math.PI / 4 && angle < Math.PI * 3 / 4 ? 0
        : Math.abs(angle) > Math.PI * 3 / 4 ? 2 : 3;
    const animationFrame = Math.floor(elapsed * 7) % 3;
    frame = (enemy.behavior === 'jacko-idle' ? 0 : 12) + direction * 3 + animationFrame;
  } else if (enemy.kind === 'spore-sower' && enemy.behavior === 'cluster-windup') {
    frame = 5 + Math.floor(elapsed * 8) % 4;
  } else {
    const frames = sprite.frames || [0, 1, 2, 3];
    frame = frames[Math.floor(elapsed * (enemy.phase >= 2 ? 10 : 6)) % frames.length];
  }
  const columns = Math.floor(sprite.image.naturalWidth / sprite.frameWidth);
  const sourceX = (frame % columns) * sprite.frameWidth;
  const sourceY = Math.floor(frame / columns) * sprite.frameHeight;
  const scale = mobDrawScale(enemy, sprite);
  const width = sprite.frameWidth * scale;
  const height = sprite.frameHeight * scale;
  const sourceHeight = sprite.cropHeight || sprite.frameHeight;
  const visibleHeight = sourceHeight * scale;
  const flightHeight = sprite.cropHeight ? Math.max(0, height / 2 - visibleHeight) : 0;
  const hop = enemy.linkDash && enemy.linkDash.windup <= 0
    ? Math.sin(Math.min(1, enemy.linkDash.t) * Math.PI) * 38
    : enemy.archetype === 'leaper' && enemy.behavior === 'leap'
    ? Math.sin((enemy.leapDuration - enemy.stateTimer) / enemy.leapDuration * Math.PI) * enemy.leapHeight
    : enemy.kind === 'spider-queen' && enemy.behavior === 'spider-pounce'
      ? Math.sin(((enemy.phase >= 2 ? 0.34 : 0.48) - enemy.stateTimer) /
        (enemy.phase >= 2 ? 0.34 : 0.48) * Math.PI) * (enemy.phase >= 2 ? 72 : 54)
    : enemy.kind === 'jacko' && enemy.behavior === 'jacko-jump'
      ? Math.sin(((enemy.phase >= 2 ? 0.7 : 0.85) - enemy.stateTimer) /
        (enemy.phase >= 2 ? 0.7 : 0.85) * Math.PI) * (enemy.phase >= 2 ? 86 : 56)
      : enemy.kind === 'wisp' ? Math.sin(elapsed * 5 + enemy.x) * 5 : 0;
  const slam = enemy.manaSlam;
  const progress = slam ? 1 - slam.timer / slam.duration : 0;
  const lift = slam ? progress < 0.35 ? progress / 0.35 * 85 : progress < 0.7 ? 85
    : (1 - progress) / 0.3 * 85 : 0;
  const rolling = enemy.archetype === 'charger' && enemy.behavior === 'roll' ||
    enemy.linkDash && enemy.linkDash.windup <= 0 && enemy.linkDash.kind === 'roll' ||
    enemy.kind === 'jacko' && enemy.behavior === 'jacko-roll';
  return { sprite, sourceX, sourceY, width, height, sourceHeight, visibleHeight, flightHeight, hop, lift, rolling };
}

function drawEnemyShadow(enemy, pose = enemySpritePose(enemy)) {
  if (!pose || (enemy.boss && enemy.behavior === 'jacko-ground-pound-hidden') ||
      (enemy.boss && (enemy.x < 0 || enemy.x > ROOM_W || enemy.y < 0 || enemy.y > ROOM_H))) return;
  const { sprite, sourceX, sourceY, width, height, sourceHeight, visibleHeight, flightHeight, hop, lift, rolling } = pose;
  ctx.save();
  if (enemy.manaRift) {
    const progress = 1 - enemy.manaRift.timer / enemy.manaRift.duration;
    const visible = Math.abs(progress * 2 - 1);
    ctx.beginPath();
    ctx.rect(enemy.x - enemy.radius * 4, enemy.y - enemy.radius * 6, enemy.radius * 8, enemy.radius * 6 + 4);
    ctx.clip();
    ctx.translate(enemy.x, enemy.y + (1 - visible) * 24);
    ctx.scale(1, Math.max(0.02, visible));
    ctx.translate(-enemy.x, -enemy.y);
    ctx.globalAlpha *= visible;
  }
  drawSunSpriteShadow(sprite.image, sourceX, sourceY, sprite.frameWidth, sourceHeight,
    enemy.x, enemy.y - height / 2 + visibleHeight + flightHeight, width, visibleHeight,
    flightHeight + Math.max(0, hop) + lift, 1, rolling ? elapsed * 18 : 0, sprite.shadowAnchorY ?? null);
  ctx.restore();
}

function drawEnemyBody(enemy, drawShadow = true) {
  if (enemy.linkId) {
    const twin = enemies.find((candidate) => candidate !== enemy && candidate.linkId === enemy.linkId);
    if (twin && enemies.indexOf(enemy) < enemies.indexOf(twin)) {
      ctx.save();
      ctx.strokeStyle = 'rgba(160, 205, 255, 0.55)';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(enemy.x, enemy.y);
      ctx.lineTo(twin.x, twin.y);
      ctx.stroke();
      ctx.restore();
    }
  }
  if (player.hook) {
    const hooker = enemies.find((candidate) => candidate.kind === player.hook.kind);
    if (hooker === enemy) {
      ctx.save();
      ctx.strokeStyle = '#b79a6c';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(enemy.x, enemy.y);
      ctx.lineTo(player.x, player.y - 20);
      ctx.stroke();
      ctx.restore();
    }
  }
  if (enemy.boss && enemy.kind === 'jacko' &&
    (enemy.behavior === 'jacko-ground-pound-hidden' ||
      enemy.x < 0 || enemy.x > ROOM_W || enemy.y < 0 || enemy.y > ROOM_H)) return;
  if (enemy.linkId) {
    const twin = enemies.find((candidate) => candidate !== enemy && candidate.linkId === enemy.linkId);
    if (twin) {
      ctx.save();
      ctx.globalAlpha = 0.38;
      ctx.strokeStyle = '#f4d474';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(enemy.x, enemy.y);
      ctx.lineTo(twin.x, twin.y);
      ctx.stroke();
      ctx.restore();
    }
    if (enemy.linkShieldCharges > 0) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.shadowColor = '#b9d5ff';
      ctx.shadowBlur = 8;
      if (linkedShieldImage.complete && linkedShieldImage.naturalWidth > 0) {
        ctx.drawImage(linkedShieldImage, enemy.x - enemy.radius - 9, enemy.y - enemy.radius - 13, 20, 20);
      } else {
        ctx.fillStyle = '#b9d5ff';
        ctx.beginPath();
        ctx.arc(enemy.x - enemy.radius, enemy.y - enemy.radius, 7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff2c9';
      ctx.font = 'bold 9px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(String(enemy.linkShieldCharges), enemy.x - enemy.radius + 1, enemy.y - enemy.radius - 1);
      ctx.restore();
    }
  }
  if (enemy.gustVisualTimer > 0) {
    const angle = enemy.gustVisualAngle;
    const strength = enemy.gustVisualTimer / 1.1;
    // SoM sonic wave arcs travelling out along the gust.
    for (let index = 0; index < 3; index += 1) {
      const distance = enemy.radius + 14 + index * 18 + (1 - strength) * 28;
      drawEffect('sonicWave', index + (strength < 0.5 ? 1 : 0), enemy.x + Math.cos(angle) * distance,
        enemy.y + Math.sin(angle) * distance, { height: 34 + index * 8, rotation: angle,
          tint: '#daf3ff', alpha: 0.35 + strength * 0.6 });
    }
  }
  const pose = enemySpritePose(enemy);
  const sprite = monsterSprites[enemy.kind];
  if (!pose) {
    ctx.fillStyle = enemy.freezeTimer > 0 ? '#56cfff'
      : enemy.slowTimer > 0 ? '#7ebee8' : enemy.color;
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const { sprite, sourceX, sourceY, width, height, sourceHeight, visibleHeight, hop, rolling } = pose;
    if (drawShadow) drawEnemyShadow(enemy, pose);
    ctx.save();
    ctx.translate(enemy.x, enemy.y - hop);
    if (rolling) {
      ctx.rotate(elapsed * 18);
    }
    const frostAffected = enemy.freezeTimer > 0 || enemy.slowTimer > 0;
    let tint = null;
    if (frostAffected) {
      tint = 'hue-rotate(155deg) saturate(1.8) brightness(1.2)';
      ctx.shadowColor = '#59d7ff';
      ctx.shadowBlur = enemy.freezeTimer > 0 ? 22 : 14;
    } else if (enemy.kind === 'slime-mother') {
      // The sprite is grayscale, so sepia first to give hue-rotate something to shift.
      tint = enemy.phase >= 2
        ? 'sepia(1) saturate(7) hue-rotate(-38deg) brightness(1.1)'
        : 'sepia(1) saturate(6) hue-rotate(-38deg)';
    } else if (enemy.kind === 'jacko') {
      ctx.shadowColor = '#ff8e38';
      ctx.shadowBlur = enemy.phase >= 2 ? 30 : 16;
      if (enemy.phase >= 2) tint = 'saturate(1.5) brightness(1.25)';
    }
    // A brief bright flash confirms the hit without fading the sprite out.
    if (enemy.hitFlash > 0) tint = 'brightness(2.6) saturate(0.3)';
    const spriteEffect = { filter: tint, lift: worldLightExposure(enemy.x, enemy.y) };
    drawSpriteImage(sprite.image, sourceX, sourceY, sprite.frameWidth, sourceHeight,
      -width / 2, -height / 2, width, visibleHeight, spriteEffect);
    if ((enemy.kind === 'bandit' || enemy.kind === 'banditlord') &&
      banditBowImage.complete && banditBowImage.naturalWidth >= 128) {
      const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
      const direction = Math.abs(angle) < Math.PI / 4 ? 'right'
        : angle > Math.PI / 4 && angle < Math.PI * 3 / 4 ? 'down'
          : Math.abs(angle) > Math.PI * 3 / 4 ? 'left' : 'up';
      const rowStart = { down: 0, left: 18, up: 36, right: 54 }[direction];
      const attacking = enemy.behavior === 'shoot-windup' || enemy.spitFlash > 0;
      const bowFrame = rowStart + (attacking ? 13 + Math.floor(elapsed * 14) % 5
        : 1 + Math.floor(elapsed * 7) % 6);
      const bowColumns = Math.floor(banditBowImage.naturalWidth / 128);
      drawSpriteImage(banditBowImage, (bowFrame % bowColumns) * 128,
        Math.floor(bowFrame / bowColumns) * 128, 128, 128, -32, -16, 64, 64, spriteEffect);
    }
    ctx.restore();
  }
  if (enemy.burnTimer > 0) {
    drawEffect('fire', effectFrameAt('fire', elapsed + enemy.x * 0.01, 12), enemy.x, enemy.y - enemy.radius + 8,
      { anchorY: 0.9, width: 22, alpha: 0.9 });
  }
  if (enemy.kind === 'spider-queen' && enemy.behavior === 'spider-pounce-windup' &&
    enemy.spiderPounceTarget) {
    drawEffectCircle(enemy.spiderPounceTarget.x, enemy.spiderPounceTarget.y, 24 + Math.sin(elapsed * 14) * 4,
      '#e78fc6', { fill: 0.4, alpha: 0.85 });
    ctx.save();
    ctx.strokeStyle = 'rgba(231, 143, 198, 0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(enemy.x, enemy.y);
    ctx.lineTo(enemy.spiderPounceTarget.x, enemy.spiderPounceTarget.y);
    ctx.stroke();
    ctx.restore();
  }
  if (enemy.kind === 'jacko' && enemy.groundPoundTarget &&
    (enemy.behavior === 'jacko-ground-pound-windup' || enemy.behavior === 'jacko-ground-pound-charge')) {
    // Jacko lands where the charge ends, so the front follows how much of the charge is left, not the clock.
    windupProgress(enemy);
    let progress = 0;
    if (enemy.behavior === 'jacko-ground-pound-charge') {
      const remaining = distanceBetween(enemy, enemy.groundPoundTarget);
      enemy.telegraphDistance ??= Math.max(1, remaining);
      progress = 1 - remaining / enemy.telegraphDistance;
    }
    drawStrikeWave(enemy.groundPoundTarget.x, enemy.groundPoundTarget.y, JACKO_POUND_RADIUS, progress, '#ffae42');
  }
  if (enemy.kind === 'golem' && enemy.behavior === 'golem-slam-windup' && enemy.slamTarget) {
    const slamRadius = golemSlamRadius(enemy);
    drawStrikeWave(enemy.slamTarget.x, enemy.slamTarget.y, slamRadius, windupProgress(enemy), '#ffbf6f');
    ctx.save();
    if (enemy.boss) {
      ctx.fillStyle = '#fff0d1';
      ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('HEAVY - 2 HEARTS', enemy.slamTarget.x, enemy.slamTarget.y - slamRadius - 10);
    }
    ctx.restore();
  }
  if (enemy.kind === 'golem' && enemy.behavior === 'golem-charge-windup' && enemy.slamTarget) {
    ctx.save();
    ctx.globalAlpha = 0.42;
    ctx.strokeStyle = '#f3c27a';
    ctx.lineWidth = 18;
    ctx.lineCap = 'round';
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(enemy.x, enemy.y);
    ctx.lineTo(enemy.slamTarget.x, enemy.slamTarget.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
  if (enemy.behavior === 'signature-windup') {
    const signatureColor = enemy.signature === 'slime-trail' ? '#9de37f'
      : enemy.signature === 'venom-fan' ? '#b6e75c'
        : enemy.signature === 'arrow-barrage' ? '#e9bd79'
          : enemy.signature === 'ice-burst' || enemy.signature === 'yeti-slam' ? '#9fe7f3'
            : '#b79be7';
    drawEffectCircle(enemy.x, enemy.y, enemy.radius + 8 + Math.sin(elapsed * 15) * 3, signatureColor,
      { alpha: 0.8, ring: 'castStar', rotation: elapsed * 2 });
    if (enemy.signatureTarget && enemy.signature === 'yeti-slam') {
      drawStrikeWave(enemy.signatureTarget.x, enemy.signatureTarget.y, yetiSlamRadius(enemy), windupProgress(enemy),
        signatureColor);
    } else if (enemy.signatureTarget && ['reaper-charge', 'slime-trail'].includes(enemy.signature)) {
      drawEffectCircle(enemy.signatureTarget.x, enemy.signatureTarget.y, 24, signatureColor, { alpha: 0.45 });
    }
    ctx.save();
    ctx.strokeStyle = signatureColor;
    if (enemy.signatureTarget && ['slime-charge', 'bandit-charge'].includes(enemy.signature)) {
      ctx.globalAlpha = 0.28;
      ctx.lineWidth = 16;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ROOM_WALL_THICKNESS, enemy.y);
      ctx.lineTo(ROOM_W - ROOM_WALL_THICKNESS, enemy.y);
      ctx.stroke();
    } else if (enemy.signatureTarget && ['reaper-charge', 'snow-charge'].includes(enemy.signature)) {
      ctx.globalAlpha = 0.28;
      ctx.lineWidth = 16;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(enemy.x, ROOM_WALL_THICKNESS);
      ctx.lineTo(enemy.x, ROOM_H - ROOM_WALL_THICKNESS);
      ctx.stroke();
    } else if (enemy.signatureTarget && ['venom-charge', 'yeti-charge', 'forest-charge', 'void-charge'].includes(enemy.signature)) {
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 12;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(enemy.x, enemy.y);
      ctx.lineTo(enemy.signatureTarget.x, enemy.signatureTarget.y);
      ctx.stroke();
    }
    ctx.restore();
  }
  if (enemy.behavior === 'signature-laser-windup' || enemy.behavior === 'signature-laser') {
    const beamLength = Math.max(ROOM_W, ROOM_H);
    const beamX = enemy.x + Math.cos(enemy.laserAngle) * beamLength;
    const beamY = enemy.y + Math.sin(enemy.laserAngle) * beamLength;
    ctx.save();
    ctx.strokeStyle = enemy.behavior === 'signature-laser'
      ? 'rgba(190, 133, 255, 0.92)' : 'rgba(190, 133, 255, 0.38)';
    ctx.lineWidth = enemy.behavior === 'signature-laser' ? 12 : 3;
    ctx.shadowColor = '#b58cff';
    ctx.shadowBlur = enemy.behavior === 'signature-laser' ? 18 : 5;
    ctx.beginPath();
    ctx.moveTo(enemy.x, enemy.y);
    ctx.lineTo(beamX, beamY);
    ctx.stroke();
    if (enemy.behavior === 'signature-laser') {
      ctx.strokeStyle = 'rgba(248, 231, 255, 0.95)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(enemy.x, enemy.y);
      ctx.lineTo(beamX, beamY);
      ctx.stroke();
    }
    ctx.restore();
  }
  if (enemy.behavior === 'bomb-windup' && enemy.bombTarget) {
    drawEffectCircle(enemy.bombTarget.x, enemy.bombTarget.y, 16 + Math.sin(elapsed * 14) * 3, '#ffb25a',
      { fill: 0.4, alpha: 0.9 });
    drawStrikeWave(enemy.bombTarget.x, enemy.bombTarget.y, enemy.bombRadius || 86, 0, '#ffb25a', 0.6);
  }
  if (enemy.behavior === 'windup' || enemy.behavior === 'leap-windup' ||
    enemy.behavior === 'stalker-windup' || enemy.behavior === 'shoot-windup' ||
    enemy.behavior === 'spider-web-windup' || enemy.behavior === 'spider-pounce-windup' ||
    enemy.behavior === 'golem-slam-windup' ||
    enemy.behavior === 'jacko-roll-windup' ||
    enemy.behavior === 'jacko-jump-windup' || enemy.behavior === 'jacko-shot-windup' || enemy.spitFlash > 0) {
    drawEffectCircle(enemy.x, enemy.y, enemy.radius + 6 + Math.sin(elapsed * 18) * 2,
      enemy.archetype === 'charger' || enemy.kind === 'jacko' || enemy.kind === 'golem' ? '#ffbf5f' : '#caa4ff',
      { alpha: 0.85 });
  }
  if (enemy.behavior === 'shoot-windup' && enemy.shotTarget) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 207, 135, 0.65)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.moveTo(enemy.x, enemy.y);
    ctx.lineTo(enemy.shotTarget.x, enemy.shotTarget.y);
    ctx.stroke();
    ctx.restore();
  }
  if (enemy.behavior === 'laser-charge' || enemy.behavior === 'laser') {
    const length = Math.max(ROOM_W, ROOM_H);
    const beamX = enemy.x + Math.cos(enemy.laserAngle) * length;
    const beamY = enemy.y + Math.sin(enemy.laserAngle) * length;
    ctx.save();
    ctx.strokeStyle = enemy.behavior === 'laser' ? 'rgba(255, 75, 120, 0.9)' : 'rgba(255, 120, 150, 0.4)';
    ctx.lineWidth = enemy.behavior === 'laser' ? 14 : 3;
    ctx.shadowColor = '#ff315f';
    ctx.shadowBlur = enemy.behavior === 'laser' ? 20 : 5;
    ctx.beginPath();
    ctx.moveTo(enemy.x, enemy.y);
    ctx.lineTo(beamX, beamY);
    ctx.stroke();
    if (enemy.behavior === 'laser') {
      ctx.strokeStyle = 'rgba(255, 230, 225, 0.95)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(enemy.x, enemy.y);
      ctx.lineTo(beamX, beamY);
      ctx.stroke();
    }
    ctx.restore();
  }
  if (enemy.elite) {
    ctx.save();
    ctx.globalAlpha = 0.58;
    ctx.strokeStyle = enemy.eliteMutation === 'swift' ? '#d7c2ff' : '#f1c77d';
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 10;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, enemy.radius + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (eliteHatImage.complete && eliteHatImage.naturalWidth > 0) {
      ctx.drawImage(eliteHatImage, enemy.x - 14, enemy.y - enemy.radius - 28, 28, 28);
    }
    ctx.restore();
  }
  if (enemy.linkEnraged) {
    drawEffectCircle(enemy.x, enemy.y, enemy.radius + 7, '#f4d474', { alpha: 0.7, ring: 'castRunes', rotation: -elapsed });
  }
  const labelTop = enemy.y - Math.max(enemy.radius, sprite.frameHeight * mobDrawScale(enemy, sprite) / 2);
  if (enemy.hp < enemy.maxHp) {
    ctx.fillStyle = '#160f13';
    ctx.fillRect(enemy.x - enemy.radius, labelTop - 11, enemy.radius * 2, 5);
    ctx.fillStyle = enemy.boss ? '#e376bd' : '#9be08d';
    ctx.fillRect(enemy.x - enemy.radius, labelTop - 11,
      (enemy.hp / enemy.maxHp) * enemy.radius * 2, 5);
  }
  if (enemy.boss || enemy.miniBoss) {
    ctx.fillStyle = '#f5debd';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(enemy.boss
      ? `${enemy.title}${enemy.phase >= 3 ? ' - PHASE III' : enemy.phase >= 2 ? ' - PHASE II' : ''}`
      : 'MINI-BOSS',
      enemy.x, labelTop - 18);
  }
}

function drawCompanion(companion, shadowOnly = null) {
  if (companion.hp <= 0) return;
  const sprite = monsterSprites[companion.kind];
  if (!sprite.image.complete || sprite.image.naturalWidth === 0) return;
  const originalScale = Math.min(sprite.scale || 1, 42 / Math.max(sprite.frameWidth, sprite.frameHeight));
  const enlargedScale = Math.max(1, Math.ceil(Math.min((sprite.scale || 1) * 1.15, 48 / Math.max(sprite.frameWidth, sprite.frameHeight))));
  const scale = (originalScale + enlargedScale) / 2;
  const width = sprite.frameWidth * scale;
  const height = sprite.frameHeight * scale;
  const sourceHeight = sprite.cropHeight || sprite.frameHeight;
  const visibleHeight = sourceHeight * scale;
  const flightHeight = sprite.cropHeight ? Math.max(0, height / 2 - visibleHeight) : 0;
  const frame = companion.kind === 'wisp' ? Math.floor(elapsed * 5) % 5 : 0;
  const columns = Math.floor(sprite.image.naturalWidth / sprite.frameWidth);
  const glow = companion.kind === 'wisp' ? '#c8a6ff' : companion.color || '#a8e39c';
  if (shadowOnly !== false) drawSunSpriteShadow(sprite.image, (frame % columns) * sprite.frameWidth,
    Math.floor(frame / columns) * sprite.frameHeight, sprite.frameWidth, sourceHeight,
    companion.x, companion.y - height / 2 + visibleHeight + flightHeight, width, visibleHeight,
    flightHeight + (companion.kind === 'wisp' ? 10 : 0), 1, 0, sprite.shadowAnchorY ?? null);
  if (shadowOnly === true) return;
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = glow;
  ctx.lineWidth = 2;
  ctx.shadowColor = glow;
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.arc(companion.x, companion.y, Math.max(width, height) * 0.42, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  drawSpriteImage(
    sprite.image,
    (frame % columns) * sprite.frameWidth,
    Math.floor(frame / columns) * sprite.frameHeight,
    sprite.frameWidth,
    sourceHeight,
    companion.x - width / 2,
    companion.y - height / 2,
    width,
    visibleHeight,
    { lift: worldLightExposure(companion.x, companion.y) },
  );
  ctx.restore();
}

function drawPlayer(shadowOnly = null) {
  if (player.dashMove === 'weapon-form' && typeof dashTimer !== 'undefined' && dashTimer > 0) {
    if (shadowOnly !== true) drawWeaponForm();
    return;
  }
  if (shadowOnly !== true && player.dashMove === 'earthshaker' && typeof dashTimer !== 'undefined' && dashTimer > 0) {
    // The landing ring shows exactly where the smash will hit.
    const landX = player.x + dashVector.x * 360 * dashTimer;
    const landY = player.y + dashVector.y * 360 * dashTimer;
    ctx.save();
    ctx.strokeStyle = 'rgba(232, 196, 130, 0.85)';
    ctx.fillStyle = 'rgba(120, 84, 40, 0.18)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(landX, landY, EARTHSHAKER_RADIUS, EARTHSHAKER_RADIUS * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  const sprite = humanoidSprites[character.sprite];
  const direction = Math.abs(player.lookX) >= Math.abs(player.lookY)
    ? player.lookX < 0 ? 'left' : 'right'
    : player.lookY < 0 ? 'up' : 'down';
  const directionRow = { down: 0, left: 1, up: 2, right: 3 }[direction];
  let frame = player.moving ? 1 + Math.floor(elapsed * 10) % 6 : 0;
  if (player.attackAnimationTimer > 0) {
    const isBowAttack = player.attackAnimationStyle === 'bow';
    const duration = isBowAttack ? 0.4 : 0.32;
    const progress = clamp(1 - player.attackAnimationTimer / duration, 0, 0.999);
    frame = isBowAttack ? 11 + Math.floor(progress * 5) : 7 + Math.floor(progress * 4);
  }
  const bodyFrameIndex = directionRow * sprite.framesPerDirection + frame;
  const pulse = player.attackPulse / 0.14;
  const pulseX = 1 + pulse * 0.08;
  const pulseY = 1 - pulse * 0.045;
  if (shadowOnly !== true) drawOrbitGuard();
  const bodyColumns = Math.floor(sprite.image.naturalWidth / 64);
  if (shadowOnly !== false) drawSunSpriteShadow(sprite.image, bodyFrameIndex % bodyColumns * 64,
    Math.floor(bodyFrameIndex / bodyColumns) * 64, 64, 64,
    player.x, player.y + 6 * pulseY, 64 * 1.45 * pulseX, 64 * 1.45 * pulseY);
  if (shadowOnly === true) return;
  if (player.chargeFraction > 0.02) {
    // A dark SoM magic circle, revealed in colour clockwise from the top as the charge builds.
    const chargeColor = player.chargeFraction >= 1 ? '#fff2a0' : '#7fd8ff';
    drawEffectCircle(player.x, player.y - 34, 34, '#202020', { alpha: 0.5 });
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(player.x, player.y - 34);
    ctx.arc(player.x, player.y - 34, 48, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * player.chargeFraction);
    ctx.closePath();
    ctx.clip();
    drawEffectCircle(player.x, player.y - 34, 34, chargeColor);
    ctx.restore();
  }
  ctx.save();
  let flash = null;
  if (player.chargeFraction >= 1 && Math.floor(elapsed * 16) % 2 === 0) {
    flash = 'brightness(2.2) saturate(0.6)';
    ctx.shadowColor = '#fff2a0';
    ctx.shadowBlur = 22;
  }
  if (player.damageFlashTimer > 0) {
    flash = 'sepia(0.8) saturate(3.5) hue-rotate(305deg)';
    ctx.shadowColor = '#ff4058';
    ctx.shadowBlur = 18;
  }
  if (player.invuln > 0 && Math.floor(player.invuln * 14) % 2 === 0) ctx.globalAlpha = 0.4;
  const playerEffect = { filter: flash, lift: worldLightExposure(player.x, player.y) };
  ctx.translate(player.x, player.y);
  ctx.imageSmoothingEnabled = false;
  ctx.scale(pulseX, pulseY);
  if (player.swordParryFlash > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = clamp(player.swordParryFlash / 0.24, 0, 1) * 0.42;
    ctx.shadowColor = '#dffcff';
    ctx.shadowBlur = 22;
    drawSpriteImage.effect = { filter: 'brightness(2.4) saturate(0.35)' };
    drawHumanoid(sprite.image, bodyFrameIndex, 0, 0, 1.45, character.hue);
    ctx.restore();
  }
  drawSpriteImage.effect = playerEffect;
  drawHumanoid(sprite.image, bodyFrameIndex, 0, 0, 1.45, character.hue);
  for (const slot of ['legs', 'chest']) {
    const clothing = equippedClothing[slot];
    if (clothing) drawClothing(clothing, bodyFrameIndex, 0, 0, 1.45);
  }
  const heldStyle = currentAttackStyle();
  const glowColor = styleGlowColor(heldStyle);
  // Found weapons have no worn sprite; they show as icons in the HUD weapon slots instead of on the character.
  const mainVariant = weaponShape(heldStyle).variant;
  const visibleWeapon = mainVariant ? null : meleeWeapons.has('sword') ? 'ironSword'
    : meleeWeapons.has('daggers') ? 'daggers' : nativeStyle() === 'melee' ? 'ironSword' : null;
  if (heldStyle === 'melee' && visibleWeapon) {
    ctx.save();
    ctx.shadowColor = glowColor || (visibleWeapon === 'ironSword' ? '#c4e8ff' : '#fff0b0');
    ctx.shadowBlur = player.swordParryFlash > 0
      ? 24 + Math.sin(elapsed * 45) * 6
      : glowColor ? 18 + Math.sin(elapsed * 9) * 4 : 8 + Math.sin(elapsed * 5) * 2;
    if (player.swordParryFlash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.55 + Math.sin(elapsed * 50) * 0.2;
    }
    drawClothing({ sprite: visibleWeapon }, bodyFrameIndex, 0, 0, 1.45);
    ctx.restore();
  }
  if (heldStyle === 'bow' && !mainVariant && banditBowImage.complete && banditBowImage.naturalWidth >= 128) {
    const rowStart = { down: 0, left: 18, up: 36, right: 54 }[direction];
    const drawing = player.attackAnimationTimer > 0 && player.attackAnimationStyle === 'bow';
    const bowFrame = drawing
      ? rowStart + 13 + Math.min(4, Math.floor((1 - player.attackAnimationTimer / 0.4) * 5))
      : rowStart + 1;
    const bowColumns = Math.floor(banditBowImage.naturalWidth / 128);
    ctx.save();
    if (glowColor) {
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 16;
    }
    drawSpriteImage(banditBowImage, (bowFrame % bowColumns) * 128,
      Math.floor(bowFrame / bowColumns) * 128, 128, 128, -60, -96, 120, 120);
    ctx.restore();
  }
  if (heldStyle === 'magic') drawCastingHands(direction, glowColor || magicElementPalette.bubble);
  drawHead(character.hairStyle, direction, 0, 0, 1.45, wornHat());
  drawSpriteImage.effect = null;
  ctx.restore();
}

// Weapon Form: while dashing the player becomes their main weapon, a glowing streak along the dash.
function drawWeaponForm() {
  const art = shopItemIconImages[`weapon-${weaponHands.main}`];
  const angle = Math.atan2(dashVector.y, dashVector.x);
  const glow = styleGlowColor(currentAttackStyle()) || '#fff2a0';
  ctx.save();
  ctx.translate(player.x, player.y - 20);
  ctx.rotate(angle);
  ctx.globalCompositeOperation = 'lighter';
  const trail = ctx.createLinearGradient(-90, 0, 0, 0);
  trail.addColorStop(0, 'rgba(255, 242, 160, 0)');
  trail.addColorStop(1, 'rgba(255, 242, 160, 0.55)');
  ctx.fillStyle = trail;
  ctx.fillRect(-90, -9, 90, 18);
  ctx.globalCompositeOperation = 'source-over';
  ctx.shadowColor = glow;
  ctx.shadowBlur = 20;
  ctx.imageSmoothingEnabled = false;
  if (art?.complete && art.naturalWidth) {
    ctx.rotate(Math.PI / 4);
    ctx.drawImage(art, -24, -24, 48, 48);
  } else {
    ctx.fillStyle = '#fff2a0';
    ctx.beginPath();
    ctx.moveTo(26, 0);
    ctx.lineTo(-18, -6);
    ctx.lineTo(-18, 6);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawOrbitGuard() {
  if (orbitGuards.length === 0) return;
  ctx.save();
  for (const guard of orbitGuards) {
    ctx.save();
    ctx.translate(guard.x, guard.y);
    ctx.rotate(guard.kind === 'mana' ? 0 : guard.angle + Math.PI / 2);
    const icon = orbitGuardIcons[guard.kind];
    if (icon?.complete && icon.naturalWidth > 0) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(icon, -16, -16, 32, 32);
    }
    ctx.restore();
  }
  ctx.restore();
}

function styleGlowColor(style) {
  if (style === 'magic') return magicElementPalette[getActiveAttackElement() || 'bubble'];
  if (style === 'bow') return null;
  return activeWeaponMod('melee')?.id === 'mod-cinder' ? magicElementPalette.fire : null;
}

function drawCastingHands(direction, color) {
  if (direction === 'left' || direction === 'right') {
    // Side view: only a faint sliver of the chest glow peeks past the torso.
    const sx = direction === 'left' ? -6 : 6;
    drawEffect('orbGlow', 0, sx, -40, { width: 3, height: 7, tint: color, composite: 'lighter',
      alpha: 0.5 + Math.sin(elapsed * 8) * 0.12, smooth: true });
    return;
  }
  if (direction !== 'down') return;
  // SoM glow orb on the chest, brighter while attacking.
  const flare = 1 + (player.attackPulse > 0 ? 0.8 : 0);
  const radius = (2.6 + Math.sin(elapsed * 8) * 0.4) * flare;
  drawEffect('orbGlow', 0, 0, -40, { width: radius * 3, tint: color, composite: 'lighter', smooth: true });
}

function drawClothing(clothing, frameIndex, x, y, scale) {
  const sprite = clothingSprites[clothing.sprite];
  const isFemale = ['female', 'elfFemale', 'raijin'].includes(character.sprite);
  const image = isFemale && sprite.femaleImage ? sprite.femaleImage : sprite.image;
  if (!image.complete || image.naturalWidth === 0) return;
  const columns = Math.floor(image.naturalWidth / sprite.frameWidth);
  const sourceX = (frameIndex % columns) * sprite.frameWidth;
  const sourceY = Math.floor(frameIndex / columns) * sprite.frameHeight;
  const width = sprite.frameWidth * scale;
  const height = sprite.frameHeight * scale;
  drawSpriteImage(
    image,
    sourceX,
    sourceY,
    sprite.frameWidth,
    sprite.frameHeight,
    x - width / 2,
    y - height + 6,
    width,
    height,
  );
}

function correctSkinTone(context, width, height) {
  const pixels = context.getImageData(0, 0, width, height);
  for (let index = 0; index < pixels.data.length; index += 4) {
    const red = pixels.data[index];
    const green = pixels.data[index + 1];
    const blue = pixels.data[index + 2];
    if (pixels.data[index + 3] === 0 || Math.max(red, green, blue) - Math.min(red, green, blue) > 30) continue;
    const luminance = red * 0.299 + green * 0.587 + blue * 0.114;
    pixels.data[index] = Math.min(255, luminance * 1.16);
    pixels.data[index + 1] = Math.min(255, luminance * 0.96);
    pixels.data[index + 2] = Math.min(255, luminance * 0.78);
  }
  context.putImageData(pixels, 0, 0);
}

function getCorrectedHumanoidFrame(sheet, frameIndex, hue) {
  let frames = correctedHumanoidFrames.get(sheet);
  if (!frames) {
    frames = new Map();
    correctedHumanoidFrames.set(sheet, frames);
  }
  const key = `${frameIndex}:${hue}`;
  if (frames.has(key)) return frames.get(key);

  const frameSize = 64;
  const columns = Math.floor(sheet.naturalWidth / frameSize);
  const corrected = document.createElement('canvas');
  corrected.width = frameSize;
  corrected.height = frameSize;
  const correctedContext = corrected.getContext('2d', { willReadFrequently: true });
  correctedContext.filter = `hue-rotate(${hue}deg) saturate(1.15)`;
  correctedContext.drawImage(
    sheet,
    (frameIndex % columns) * frameSize,
    Math.floor(frameIndex / columns) * frameSize,
    frameSize,
    frameSize,
    0,
    0,
    frameSize,
    frameSize,
  );
  correctSkinTone(correctedContext, frameSize, frameSize);
  frames.set(key, corrected);
  return corrected;
}

function getCorrectedHeadFrame(image, sourceX, sourceY, width, height) {
  let frames = correctedHeadFrames.get(image);
  if (!frames) {
    frames = new Map();
    correctedHeadFrames.set(image, frames);
  }
  const key = `${sourceX}:${sourceY}:${width}:${height}`;
  if (frames.has(key)) return frames.get(key);

  const corrected = document.createElement('canvas');
  corrected.width = width;
  corrected.height = height;
  const correctedContext = corrected.getContext('2d', { willReadFrequently: true });
  correctedContext.drawImage(image, sourceX, sourceY, width, height, 0, 0, width, height);
  correctSkinTone(correctedContext, width, height);
  frames.set(key, corrected);
  return corrected;
}

function isPixelReadbackSecurityError(error) {
  if (error instanceof DOMException && error.name === 'SecurityError') {
    if (!pixelCorrectionWarningShown) {
      console.warn('Sprite color correction is unavailable for local file images in this browser; drawing original TMW sprites.', error);
      pixelCorrectionWarningShown = true;
    }
    return true;
  }
  throw error;
}

function drawHumanoid(sheet, frameIndex, x, y, scale = 1, hue = 0) {
  if (!sheet.complete || sheet.naturalWidth === 0) {
    ctx.fillStyle = '#75d8ff';
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const frameSize = 64;
  const size = frameSize * scale;
  try {
    const correctedFrame = getCorrectedHumanoidFrame(sheet, frameIndex, hue);
    drawSpriteImage(correctedFrame, 0, 0, frameSize, frameSize, x - size / 2, y - size + 6, size, size);
  } catch (error) {
    if (!isPixelReadbackSecurityError(error)) return;
    const columns = Math.floor(sheet.naturalWidth / frameSize);
    ctx.save();
    ctx.filter = `hue-rotate(${hue}deg) saturate(1.15)`;
    ctx.drawImage(
      sheet,
      (frameIndex % columns) * frameSize,
      Math.floor(frameIndex / columns) * frameSize,
      frameSize,
      frameSize,
      x - size / 2,
      y - size + 6,
      size,
      size,
    );
    ctx.restore();
  }
}

function hatImage(id) {
  if (!hatImages[id]) hatImages[id] = loadAsset(`sprites/equipment/head/${id}.png`);
  return hatImages[id];
}

function wornHat(entry = character, powerHat = player.powerHat) {
  if (entry?.id === 'world-edge-pilgrim') return null;
  const baseHat = entry?.hat || classHats[entry?.className] || null;
  if (entry?.className === 'Sporeling') return shroomHatByItem[powerHat?.item] || baseHat;
  return powerHat?.hat || baseHat;
}

function drawHat(hat, direction, x, headY, scale) {
  if (!hat) return;
  const image = hatImage(hat);
  if (!image.complete || image.naturalWidth === 0) return;
  const frame = { down: 0, left: 1, up: 2, right: 3 }[direction] ?? 0;
  drawSpriteImage(image, frame * 32, 0, 32, 64, x - 16 * scale, headY - 12 * scale, 32 * scale, 64 * scale);
}

function drawHead(style, direction, x, y, scale = 1, hat = null) {
  drawHeadSprite(style, direction, x, y, scale);
  drawHat(hat, direction, x, y - 84 * scale + 12 - (direction === 'up' ? 2 * scale : 0), scale);
}

function drawHeadSprite(style, direction, x, y, scale = 1) {
  const head = headSprites[style] || headSprites.wanderer;
  if (!head.image.complete || head.image.naturalWidth === 0) return;
  const directionFrame = { down: 0, left: 1, up: 2, right: 3 }[direction];
  const width = head.frameWidth * scale;
  const height = head.frameHeight * scale;
  const sourceX = directionFrame * head.frameWidth;
  const destinationX = x - width / 2;
  const directionOffsetY = direction === 'up' ? 4 * scale : 0;
  const destinationY = y - 84 * scale + 12 + directionOffsetY;
  try {
    const correctedFrame = getCorrectedHeadFrame(
      head.image,
      sourceX,
      0,
      head.frameWidth,
      head.frameHeight,
    );
    drawSpriteImage(
      correctedFrame,
      0,
      0,
      head.frameWidth,
      head.frameHeight,
      destinationX,
      destinationY,
      width,
      height,
    );
  } catch (error) {
    if (!isPixelReadbackSecurityError(error)) return;
    drawSpriteImage(
      head.image,
      sourceX,
      0,
      head.frameWidth,
      head.frameHeight,
      destinationX,
      destinationY,
      width,
      height,
    );
  }
}

function drawFallbackBreakable(rock, width, height) {
  ctx.save();
  if (rock.type === 'solid') {
    ctx.fillStyle = '#76563d';
    ctx.fillRect(rock.x - width * 0.42, rock.y - height * 0.22, width * 0.84, height * 0.44);
    ctx.strokeStyle = '#c09664';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(rock.x - width * 0.3, rock.y, width * 0.12, height * 0.2, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (rock.type === 'bomb-only') {
    ctx.fillStyle = '#9c5548';
    ctx.beginPath();
    ctx.arc(rock.x, rock.y, Math.min(width, height) * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e4b980';
    ctx.beginPath();
    ctx.arc(rock.x - 4, rock.y - 4, 4, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.strokeStyle = '#a6d978';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(rock.x, rock.y + height * 0.3);
    ctx.lineTo(rock.x, rock.y - height * 0.18);
    ctx.stroke();
    ctx.fillStyle = '#6db46a';
    ctx.beginPath();
    ctx.ellipse(rock.x - 7, rock.y - height * 0.12, 8, 4, -0.5, 0, Math.PI * 2);
    ctx.ellipse(rock.x + 7, rock.y - height * 0.24, 8, 4, 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ctx.filter costs milliseconds per draw on phone GPUs, so sprite tints are baked once per frame and
// cached, and light brightening is an additive redraw: brightness(1 + e) equals sprite + e × sprite.
function filteredSpriteFrame(image, sx, sy, sw, sh, filter) {
  const cache = filteredSpriteFrame.cache || (filteredSpriteFrame.cache = new WeakMap());
  let frames = cache.get(image);
  if (!frames) {
    frames = new Map();
    cache.set(image, frames);
  }
  const key = `${filter}|${sx},${sy},${sw},${sh}`;
  let frame = frames.get(key);
  if (frame) return frame;
  frame = document.createElement('canvas');
  frame.width = Math.max(1, Math.ceil(sw));
  frame.height = Math.max(1, Math.ceil(sh));
  const target = frame.getContext('2d');
  target.filter = filter;
  target.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
  if (frames.size >= 96) frames.delete(frames.keys().next().value);
  frames.set(key, frame);
  return frame;
}

// effect: { filter, lift }. Without an argument, the effect set on drawSpriteImage.effect applies.
function drawSpriteImage(image, sx, sy, sw, sh, dx, dy, dw, dh, effect = drawSpriteImage.effect) {
  const baked = effect?.filter ? filteredSpriteFrame(image, sx, sy, sw, sh, effect.filter) : null;
  const source = baked || image;
  const sourceX = baked ? 0 : sx;
  const sourceY = baked ? 0 : sy;
  ctx.drawImage(source, sourceX, sourceY, sw, sh, dx, dy, dw, dh);
  if (effect?.lift > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha *= Math.min(1, effect.lift);
    ctx.shadowBlur = 0;
    ctx.drawImage(source, sourceX, sourceY, sw, sh, dx, dy, dw, dh);
    ctx.restore();
  }
}

function getBreakableFrame(sprite, frame, type) {
  const cache = getBreakableFrame.cache || (getBreakableFrame.cache = new WeakMap());
  let frames = cache.get(sprite.image);
  if (!frames) {
    frames = new Map();
    cache.set(sprite.image, frames);
  }
  const key = `${sprite.frameWidth}:${sprite.frameHeight}:${frame}:${type}`;
  if (frames.has(key)) return frames.get(key);
  const layer = document.createElement('canvas');
  layer.width = sprite.frameWidth;
  layer.height = sprite.frameHeight;
  const target = layer.getContext('2d');
  const filters = {
    solid: 'grayscale(0.85) brightness(0.7) saturate(0.65)',
    'bomb-only': 'sepia(0.45) saturate(1.5)',
    regenerating: 'hue-rotate(45deg) saturate(1.2)',
  };
  target.filter = filters[type] || 'none';
  const columns = Math.floor(sprite.image.naturalWidth / sprite.frameWidth);
  target.drawImage(sprite.image, frame % columns * sprite.frameWidth,
    Math.floor(frame / columns) * sprite.frameHeight, sprite.frameWidth, sprite.frameHeight,
    0, 0, sprite.frameWidth, sprite.frameHeight);
  frames.set(key, layer);
  return layer;
}

function drawSoulMenhir(shadowOnly = null) {
  const position = soulMenhirPosition();
  const t = prefersReducedMotion() ? 0 : elapsed;
  if (shadowOnly !== false) drawTrunkShadow(position.x, position.y - 28, 80, 64, 1, 0.5);
  if (shadowOnly === true) return;
  ctx.save();
  const glow = ctx.createRadialGradient(position.x, position.y - 34, 4, position.x, position.y - 34, 74);
  glow.addColorStop(0, `rgba(143, 211, 255, ${0.22 + Math.sin(t * 2) * 0.06})`);
  glow.addColorStop(1, 'rgba(143, 211, 255, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(position.x - 80, position.y - 110, 160, 160);
  ctx.restore();
  if (soulMenhirImage.complete && soulMenhirImage.naturalWidth >= 64 && soulMenhirImage.naturalHeight >= 64) {
    ctx.drawImage(soulMenhirImage, 0, 0, 64, 64, position.x - 32, position.y - 60, 64, 64);
  } else {
    ctx.fillStyle = '#9c9b9b';
    ctx.beginPath();
    ctx.moveTo(position.x - 23, position.y + 3);
    ctx.lineTo(position.x - 18, position.y - 40);
    ctx.lineTo(position.x, position.y - 58);
    ctx.lineTo(position.x + 19, position.y - 37);
    ctx.lineTo(position.x + 24, position.y + 3);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#eee0b8';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.save();
  for (let i = 0; i < 9; i += 1) {
    const phase = (t * 0.35 + i / 9) % 1;
    const px = position.x + Math.sin(t * 1.3 + i * 2.1) * (16 + (i % 3) * 8);
    const py = position.y + 6 - phase * 90;
    ctx.globalAlpha = Math.sin(phase * Math.PI) * 0.85;
    ctx.fillStyle = i % 2 ? '#d9ccff' : '#8fe3ff';
    ctx.beginPath();
    ctx.arc(px, py, 1.6 + (i % 3) * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#26352d';
  ctx.font = 'bold 12px Arial';
  ctx.textAlign = 'center';
  const talkPrompt = lastInputMode === 'touch' ? 'TAP USE TO TALK' : `${bindLabel('interact').toUpperCase()} TO TALK`;
  ctx.fillText(`SOUL MENHIR  ·  ${talkPrompt}`, position.x, position.y + 22);
  ctx.restore();
}

// TMW lettered runestones for the trial nodes, one per node.
const TRIAL_RUNESTONES = ['runeA', 'runeL', 'runeN', 'runeT', 'runeW'];

function drawRewardTrial() {
  if (currentRoom.type !== 'trial' || currentRoom.trialCompleted) return;
  const mode = currentRoom.trialMode;
  if (mode === 'memory' || mode === 'relay') {
    const nodes = rewardTrialNodes();
    const progress = currentRoom.trialProgress;
    const expectedIndex = mode === 'memory'
      ? currentRoom.trialSequence[Math.floor(elapsed / 0.72) % currentRoom.trialSequence.length]
      : progress;
    ctx.save();
    ctx.textAlign = 'center';
    for (const node of nodes) {
      const active = mode === 'memory'
        ? node.index === expectedIndex
        : node.index === expectedIndex;
      const near = mode === 'memory' && distanceBetween(player, node) < 70;
      // A TMW runestone on a SoM magic circle; the circle lights up on the rune to trace.
      const glowColor = active ? (mode === 'memory' ? '#83dfcf' : '#f0d98a') : '#514e67';
      drawEffectCircle(node.x, node.y, active ? 24 : 20, glowColor,
        { fill: active ? 0.7 : 0.2, alpha: near || active ? 1 : 0.6, ring: 'castRunes' });
      drawEffect(TRIAL_RUNESTONES[node.index % TRIAL_RUNESTONES.length], 0, node.x, node.y,
        { width: active ? 36 : 30, alpha: active || near ? 1 : 0.75 });
      ctx.fillStyle = '#fff6db';
      ctx.font = 'bold 12px Arial';
      ctx.fillText(String(node.index + 1), node.x + 14, node.y + 16);
      if (near && active) {
        ctx.fillStyle = '#fff1c4';
        ctx.fillText('[E] TRACE', node.x, node.y - 28);
      }
    }
    ctx.fillStyle = '#d7e6d2';
    ctx.font = 'bold 13px Arial';
    ctx.fillText(
      mode === 'memory'
        ? `WATCH THE RUNES, THEN REPEAT THE SEQUENCE  ${progress}/${currentRoom.trialSequence.length}`
        : `CHASE THE MOVING SPARKS IN ORDER  ${progress}/3`,
      ROOM_W / 2,
      ROOM_WALL_THICKNESS + 26,
    );
    ctx.restore();
    return;
  }
  const mirrors = rewardTrialMirrors();
  const source = rewardTrialSource();
  const receiver = rewardTrialReceiver();
  const points = [source, ...mirrors, receiver];
  let beamActive = true;
  ctx.save();
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  for (let index = 0; index < points.length - 1; index += 1) {
    if (index > 0 && mirrors[index - 1]?.orientation !== mirrors[index - 1]?.solution) {
      beamActive = false;
    }
    ctx.beginPath();
    ctx.moveTo(points[index].x, points[index].y);
    ctx.lineTo(points[index + 1].x, points[index + 1].y);
    ctx.strokeStyle = index < 3 && beamActive ? '#80e7e4' : 'rgba(138, 150, 150, 0.24)';
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = beamActive && index < 3 ? 10 : 0;
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#d9c68d';
  ctx.beginPath();
  ctx.arc(source.x, source.y, 13, 0, Math.PI * 2);
  ctx.fill();
  for (const mirror of mirrors) {
    const active = mirror.orientation === mirror.solution;
    const near = distanceBetween(player, mirror) < 70;
    ctx.fillStyle = active ? '#7bd5cd' : '#9a657a';
    ctx.strokeStyle = near ? '#fff1c4' : '#322b34';
    ctx.lineWidth = near ? 4 : 2;
    ctx.beginPath();
    ctx.arc(mirror.x, mirror.y, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#fff0cc';
    ctx.lineWidth = 5;
    ctx.beginPath();
    if (mirror.orientation === '/') {
      ctx.moveTo(mirror.x - 10, mirror.y + 10);
      ctx.lineTo(mirror.x + 10, mirror.y - 10);
    } else {
      ctx.moveTo(mirror.x - 10, mirror.y - 10);
      ctx.lineTo(mirror.x + 10, mirror.y + 10);
    }
    ctx.stroke();
  }
  ctx.fillStyle = beamActive && mirrors.every((mirror) => mirror.orientation === mirror.solution)
    ? '#f4d58c' : '#675b68';
  ctx.strokeStyle = '#fff1c4';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(receiver.x, receiver.y, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#edf0dc';
  ctx.font = 'bold 12px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('LIGHT', source.x, source.y - 24);
  ctx.fillText('RECEIVER', receiver.x, receiver.y - 28);
  for (const mirror of mirrors) {
    if (distanceBetween(player, mirror) < 70) {
      ctx.fillStyle = '#fff1c4';
      ctx.fillText('[E] TURN', mirror.x, mirror.y - 34);
      break;
    }
  }
  ctx.fillStyle = '#d7e6d2';
  ctx.font = 'bold 13px Arial';
  ctx.fillText('TURN THE LENSES TO GUIDE LIGHT INTO THE RECEIVER', ROOM_W / 2, ROOM_WALL_THICKNESS + 26);
  ctx.restore();
}

// One TMW menhir per element (soulmenhirs_x2.png has nine stones; the ninth is a gem, not used).
const ELEMENTAL_MENHIR_FRAMES = { wind: 0, lightning: 1, ice: 2, fire: 3, bubble: 4, gas: 5, spore: 6, earth: 7 };

// The element's own effect sprite, drawn as the glyph on the stone.
function drawElementGlyph(element, x, y, size, alpha = 1) {
  const tint = magicElementPalette[element];
  if (element === 'fire') drawEffect('fire', effectFrameAt('fire', elapsed, 10), x, y, { width: size, alpha });
  else if (element === 'lightning') drawEffect('sparks', effectFrameAt('sparks', elapsed, 16), x, y, { width: size, tint, alpha });
  else if (element === 'bubble') drawEffect('bubble', effectFrameAt('bubble', elapsed, 6), x, y, { width: size * 0.8, alpha });
  else if (element === 'gas') drawEffect('smoke', 0, x, y, { width: size, tint, alpha, smooth: true });
  else if (element === 'spore') drawEffect('sporeBubble', effectFrameAt('sporeBubble', elapsed, 8), x, y, { width: size * 0.8, alpha });
  else if (element === 'ice') drawEffect('snowflake', 0, x, y, { width: size * 0.8, alpha });
  else if (element === 'wind') drawEffect('sonicWave', 2, x, y, { height: size, tint, alpha });
  else drawEffect('star', 0, x, y, { width: size, tint: tint || '#d8d0bc', alpha });
}

function drawElementalMenhir(shadowOnly = null) {
  const { x, y } = elementalShrinePosition();
  const element = currentRoom.shrineElement;
  const color = magicElementPalette[element] || '#d8d0bc';
  const t = performance.now() / 1000;
  const active = !currentRoom.shrineUsed;
  const frame = ELEMENTAL_MENHIR_FRAMES[element] ?? 7;
  const [sx, sy] = effectFrameRect(EFFECT_SHEETS.menhirs, frame);
  const size = 112;
  if (shadowOnly !== false) drawSunSpriteShadow(effectArt.menhirs, sx, sy, 64, 64, x, y + 36, size, size);
  if (shadowOnly === true) return;
  ctx.save();
  drawEffect('glow', 0, x, y - 28, { width: 220, tint: color, alpha: active ? 0.55 : 0.25, smooth: true });
  drawEffect('menhirs', frame, x, y + 36, { width: size, anchorY: 1, alpha: active ? 1 : 0.8 });
  drawElementGlyph(element, x, y - 18, 26, active ? 1 : 0.4);

  if (active) {
    for (let index = 0; index < 10; index += 1) {
      const phase = (t * 0.28 + index / 10) % 1;
      const angle = t * 0.55 + index * 2.4;
      const radius = 30 + (index % 3) * 7;
      drawEffect('star', 0, x + Math.cos(angle) * radius, y - 20 - phase * 80 + Math.sin(angle) * 8,
        { width: 9, tint: color, alpha: Math.sin(phase * Math.PI) * 0.85 });
    }
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#f2e5c6';
  ctx.font = 'bold 13px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(active ? `${magicElementName(element).toUpperCase()} OBELISK` : 'OBELISK ATTUNED', x, y + 62);
  if (active && distanceBetween(player, { x, y }) < 92) {
    ctx.fillStyle = '#fff0bd';
    ctx.font = 'bold 12px Arial';
    ctx.fillText('[E] ATTUNE', x, y + 81);
  }
  ctx.restore();
}

function outlinedItemTexture(image) {
  if (!outlinedItemTexture.images) outlinedItemTexture.images = new WeakMap();
  if (outlinedItemTexture.images.has(image)) return outlinedItemTexture.images.get(image);
  const layer = document.createElement('canvas');
  layer.width = image.naturalWidth || image.width;
  layer.height = image.naturalHeight || image.height;
  // CPU-backed: reading pixels back from a GPU canvas stalls the frame for tens of milliseconds on phones.
  const tint = layer.getContext('2d', { willReadFrequently: true });
  tint.drawImage(image, 0, 0);
  let bounds = { x: 0, y: 0, width: layer.width, height: layer.height };
  try {
    const { data } = tint.getImageData(0, 0, layer.width, layer.height);
    let left = layer.width, right = -1, top = layer.height, bottom = -1;
    for (let y = 0; y < layer.height; y += 1) {
      for (let x = 0; x < layer.width; x += 1) {
        if (data[(y * layer.width + x) * 4 + 3] < 32) continue;
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
    if (right >= left) bounds = { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
  } catch (error) {
    if (error.name !== 'SecurityError') throw error;
    if (!outlinedItemTexture.readbackWarning) {
      console.warn('Item padding cannot be cropped for local-file artwork; serving over HTTP enables tight item outlines.', error);
      outlinedItemTexture.readbackWarning = true;
    }
  }
  tint.globalCompositeOperation = 'source-in';
  tint.fillStyle = '#0e0868';
  tint.fillRect(0, 0, layer.width, layer.height);
  const outline = document.createElement('canvas');
  outline.width = bounds.width + 2;
  outline.height = bounds.height + 2;
  const target = outline.getContext('2d');
  target.imageSmoothingEnabled = false;
  for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) {
    target.drawImage(layer, bounds.x, bounds.y, bounds.width, bounds.height,
      1 + dx, 1 + dy, bounds.width, bounds.height);
  }
  target.drawImage(image, bounds.x, bounds.y, bounds.width, bounds.height,
    1, 1, bounds.width, bounds.height);
  outlinedItemTexture.images.set(image, outline);
  return outline;
}

// Builds item outlines a few at a time while the browser is idle, so a shop or loot drop never pays for them mid-frame.
function prewarmItemOutlines(images = Object.values(shopItemIconImages)) {
  const pending = [...new Set(images)];
  const idle = window.requestIdleCallback || ((callback) => setTimeout(() => callback({ timeRemaining: () => 4 }), 50));
  const step = (deadline) => {
    while (pending.length && deadline.timeRemaining() > 2) {
      const image = pending.shift();
      if (image?.complete && image.naturalWidth > 0) outlinedItemTexture(image);
    }
    if (pending.length) idle(step);
  };
  idle(step);
}

function drawOutlinedItemImage(image, x, y, width, height) {
  if (!image?.complete || image.naturalWidth === 0) return;
  const texture = outlinedItemTexture(image);
  const scale = Math.max(1, Math.round(Math.min(width / (texture.width - 2), height / (texture.height - 2))));
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.shadowBlur = 0;
  ctx.drawImage(texture, Math.round(x + width / 2 - texture.width * scale / 2),
    Math.round(y + height / 2 - texture.height * scale / 2), texture.width * scale, texture.height * scale);
  ctx.restore();
}

function drawShopStockIcon(item, centerX, centerY) {
  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.scale(0.875, 0.875);
  drawShopItemIcon(item, 0, 0);
  ctx.restore();
}

function drawShopItemIcon(item, centerX, centerY) {
  const image = shopItemIconImages[item.icon || item.id];
  if (image?.complete && image.naturalWidth > 0) {
    drawOutlinedItemImage(image, centerX - 16, centerY - 16, 32, 32);
    return;
  }
  if (!drawShopItemIcon.cache) drawShopItemIcon.cache = new Map();
  const key = [item.id, item.kind, item.element, item.style, item.weapon].join(':');
  let texture = drawShopItemIcon.cache.get(key);
  if (!texture) {
    texture = document.createElement('canvas');
    texture.width = texture.height = 40;
    drawShopItemIconArt(item, 20, 20, texture.getContext('2d'));
    texture = outlinedItemTexture(texture);
    if (drawShopItemIcon.cache.size >= 128) drawShopItemIcon.cache.delete(drawShopItemIcon.cache.keys().next().value);
    drawShopItemIcon.cache.set(key, texture);
  }
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(texture, Math.round(centerX - texture.width / 2), Math.round(centerY - texture.height / 2));
  ctx.restore();
}

function drawShopItemIconArt(item, centerX, centerY, ctx) {
  const itemImage = shopItemIconImages[item.id];
  if (itemImage?.complete && itemImage.naturalWidth > 0) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(itemImage, centerX - 14, centerY - 14, 28, 28);
    ctx.restore();
    return;
  }
  // Items without their own icon borrow a TMW or SoM icon for their kind; the drawn glyphs below are left only
  // for kinds no icon covers (prism, clothing, bombs, the generic mark).
  const borrowed = item.kind === 'lore' ? ['spellBook']
    : item.kind === 'element' && item.element === 'fire' ? ['fireIcon']
      : item.kind === 'element' && item.element === 'lightning' ? ['lightningOrb']
        : item.kind === 'element' && item.element === 'gas' ? ['smoke', magicElementPalette.gas]
          : item.id === 'frost-rune' ? ['snowflake']
            : item.kind === 'passive' && item.id === 'feather' ? ['feather']
              : item.kind === 'passive' && item.id !== 'prism' ? ['manaBall']
                : (item.kind === 'weapon' || item.kind === 'skill') && (item.style === 'bow' || item.weapon === 'daggers') ? ['bowIcon']
                  : (item.kind === 'weapon' || item.kind === 'skill') && item.style === 'magic' ? ['spellIcon']
                    : item.kind === 'weapon' || item.kind === 'skill' ? ['swordIcon']
                      : item.kind === 'companion' ? ['meow']
                        : item.id === 'mana-tonic' ? ['flask'] : null;
  if (borrowed && effectImageReady(effectArt[borrowed[0]])) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tintedEffectImage(effectArt[borrowed[0]], borrowed[1]), centerX - 14, centerY - 14, 28, 28);
    ctx.restore();
    return;
  }
  const colors = {
    passive: '#79d3dc', skill: '#c3a7e7', weapon: '#e0bb78', clothing: '#9dce9a',
    ability: '#86dce8', mod: '#ffb35a', lore: '#a8f0d7', element: magicElementPalette[item.element],
    'shop-bomb': '#f2c774',
    companion: '#e7b877', consumable: '#e89676',
  };
  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.strokeStyle = colors[item.kind] || '#ded2bc';
  ctx.fillStyle = colors[item.kind] || '#ded2bc';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (item.kind === 'lore') {
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(6, 0);
    ctx.lineTo(0, 9);
    ctx.lineTo(-6, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(0, -11);
    ctx.moveTo(14, 0);
    ctx.lineTo(11, 0);
    ctx.moveTo(0, 14);
    ctx.lineTo(0, 11);
    ctx.moveTo(-14, 0);
    ctx.lineTo(-11, 0);
    ctx.stroke();
  } else if (item.kind === 'element' && item.element === 'fire') {
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.quadraticCurveTo(2, -5, 8, -3);
    ctx.quadraticCurveTo(14, 7, 0, 12);
    ctx.quadraticCurveTo(-13, 8, -7, -2);
    ctx.quadraticCurveTo(-3, -6, 0, -13);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#fff0c4';
    ctx.beginPath();
    ctx.moveTo(0, 7);
    ctx.quadraticCurveTo(-4, 1, 1, -5);
    ctx.quadraticCurveTo(2, 1, 5, 3);
    ctx.stroke();
  } else if (item.kind === 'element' && item.element === 'lightning') {
    ctx.beginPath();
    ctx.moveTo(3, -13);
    ctx.lineTo(-7, 1);
    ctx.lineTo(0, 1);
    ctx.lineTo(-4, 13);
    ctx.lineTo(8, -4);
    ctx.lineTo(1, -4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (item.kind === 'element' && item.element === 'gas') {
    ctx.beginPath();
    ctx.arc(-6, 3, 6, 0, Math.PI * 2);
    ctx.arc(2, -1, 8, 0, Math.PI * 2);
    ctx.arc(8, 4, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (item.id === 'frost-rune') {
    for (let spoke = 0; spoke < 3; spoke += 1) {
      ctx.rotate(Math.PI / 3);
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.lineTo(10, 0);
      ctx.moveTo(5, -4);
      ctx.lineTo(10, 0);
      ctx.lineTo(5, 4);
      ctx.moveTo(-5, -4);
      ctx.lineTo(-10, 0);
      ctx.lineTo(-5, 4);
      ctx.stroke();
    }
  } else if (item.kind === 'passive' && item.id === 'prism') {
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(11, 8);
    ctx.lineTo(-11, 8);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-5, 3);
    ctx.lineTo(0, -5);
    ctx.lineTo(5, 3);
    ctx.stroke();
  } else if (item.kind === 'passive' && item.id === 'feather') {
    ctx.beginPath();
    ctx.moveTo(-9, 10);
    ctx.quadraticCurveTo(-12, -8, 10, -11);
    ctx.quadraticCurveTo(8, 8, -9, 10);
    ctx.moveTo(-7, 7);
    ctx.lineTo(7, -7);
    ctx.moveTo(-3, 2);
    ctx.lineTo(-5, -4);
    ctx.moveTo(2, -3);
    ctx.lineTo(7, -3);
    ctx.stroke();
  } else if (item.kind === 'passive') {
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-3, -3, 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (item.kind === 'weapon' || item.kind === 'skill') {
    if (item.style === 'bow' || item.weapon === 'daggers') {
      ctx.beginPath();
      ctx.arc(-5, 0, 10, -Math.PI / 2, Math.PI / 2);
      ctx.moveTo(-5, -10);
      ctx.lineTo(10, 0);
      ctx.lineTo(-5, 10);
      ctx.stroke();
    } else if (item.style === 'magic') {
      ctx.beginPath();
      for (let point = 0; point < 8; point += 1) {
        const angle = -Math.PI / 2 + point * Math.PI / 4;
        const radius = point % 2 ? 4 : 11;
        const px = Math.cos(angle) * radius;
        const py = Math.sin(angle) * radius;
        if (point === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(0, -12);
      ctx.lineTo(0, 7);
      ctx.moveTo(-7, 1);
      ctx.lineTo(7, 1);
      ctx.moveTo(-4, 8);
      ctx.lineTo(4, 8);
      ctx.stroke();
    }
  } else if (item.kind === 'clothing') {
    ctx.beginPath();
    ctx.moveTo(-9, -9);
    ctx.lineTo(-4, -12);
    ctx.lineTo(0, -8);
    ctx.lineTo(4, -12);
    ctx.lineTo(9, -9);
    ctx.lineTo(6, -2);
    ctx.lineTo(5, 10);
    ctx.lineTo(-5, 10);
    ctx.lineTo(-6, -2);
    ctx.closePath();
    ctx.stroke();
  } else if (item.kind === 'companion') {
    ctx.beginPath();
    ctx.arc(0, 1, 8, 0, Math.PI * 2);
    ctx.moveTo(-6, -5);
    ctx.lineTo(-9, -11);
    ctx.lineTo(-2, -7);
    ctx.moveTo(6, -5);
    ctx.lineTo(9, -11);
    ctx.lineTo(2, -7);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-3, 0, 1, 0, Math.PI * 2);
    ctx.arc(3, 0, 1, 0, Math.PI * 2);
    ctx.fill();
  } else if (item.id === 'bomb-bundle' || item.id === 'shop-bomb') {
    ctx.beginPath();
    ctx.arc(0, 2, 8, 0, Math.PI * 2);
    ctx.moveTo(3, -6);
    ctx.lineTo(7, -11);
    ctx.lineTo(10, -9);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(11, -10, 1.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (item.id === 'mana-tonic') {
    ctx.beginPath();
    ctx.moveTo(-4, -11);
    ctx.lineTo(4, -11);
    ctx.lineTo(4, -7);
    ctx.lineTo(8, -3);
    ctx.lineTo(7, 10);
    ctx.lineTo(-7, 10);
    ctx.lineTo(-8, -3);
    ctx.lineTo(-4, -7);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-5, 3);
    ctx.lineTo(5, 3);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.moveTo(-12, 0);
    ctx.lineTo(12, 0);
    ctx.moveTo(0, -12);
    ctx.lineTo(0, 12);
    ctx.stroke();
  }
  ctx.restore();
}

function drawDropIcon(x, y, drawIcon, scale = 0.8) {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.translate(-x, -y);
  const result = drawIcon();
  ctx.restore();
  return result;
}

function drawPickupItem(pickup) {
  if (['upgrade', 'lore-relic'].includes(pickup.kind)) return false;
  const bob = prefersReducedMotion() ? 0 : pickup.kind === 'xp' ? Math.sin(elapsed * 6 + pickup.x) * 1.5
    : ['coin', 'curio'].includes(pickup.kind) ? Math.sin(elapsed * (pickup.kind === 'coin' ? 5 : 4) + pickup.x) * 2 : 0;
  if (pickup.item) {
    if (pickup.kind === 'weapon' || pickup.kind === 'rune') {
      // Weapon caches and runes are rare: a soft pulse marks them so they read apart from ordinary loot.
      drawEffect('glow', 0, pickup.x, pickup.y, { width: 58 + Math.sin(elapsed * 4) * 6,
        tint: pickup.kind === 'rune' ? '#c8a8ff' : '#ffe38a', alpha: 0.55, composite: 'lighter', smooth: true });
    }
    drawShopItemIcon(pickup.item, Math.round(pickup.x), Math.round(pickup.y + bob));
    return true;
  }
  if (pickup.kind === 'heart' && heartImage.complete && heartImage.naturalWidth > 0) {
    drawOutlinedItemImage(heartImage, pickup.x - 16, pickup.y - 16, 32, 32);
    return true;
  }
  if (!drawPickupItem.cache) drawPickupItem.cache = new Map();
  const kind = ['key', 'bomb', 'coin', 'xp', 'heart'].includes(pickup.kind) ? pickup.kind : 'item';
  // TMW icons for keys, zeny and gems; the drawn textures below stay as the fallback and for bombs.
  const icon = { key: effectArt.key, coin: effectArt.coins, xp: effectArt.diamond, item: effectArt.diamond }[kind];
  if (effectImageReady(icon)) {
    const size = kind === 'xp' ? 24 : 32;
    drawOutlinedItemImage(icon, Math.round(pickup.x - size / 2), Math.round(pickup.y + bob - size / 2), size, size);
    return true;
  }
  let texture = drawPickupItem.cache.get(kind);
  if (!texture) {
    const icon = document.createElement('canvas');
    icon.width = icon.height = 16;
    const target = icon.getContext('2d');
    target.lineWidth = 1;
    target.lineJoin = 'round';
    target.strokeStyle = '#0e0868';
    target.fillStyle = kind === 'xp' ? '#7ee8ff' : '#f2bd46';
    target.beginPath();
    if (kind === 'key') {
      target.arc(4, 6, 3, 0, Math.PI * 2);
      target.fill();
      target.fillRect(6, 5, 8, 2);
      target.fillRect(10, 6, 2, 3);
      target.fillRect(13, 6, 2, 4);
      target.fillStyle = '#0e0868';
      target.fillRect(3, 5, 2, 2);
    } else if (kind === 'bomb') {
      target.fillStyle = '#333341';
      target.arc(7, 9, 5, 0, Math.PI * 2);
      target.fill();
      target.fillStyle = '#ffce67';
      target.fillRect(9, 2, 2, 3);
    } else if (kind === 'heart') {
      target.fillStyle = '#e95e72';
      target.moveTo(8, 14);
      target.bezierCurveTo(0, 9, 0, 1, 5, 3);
      target.lineTo(8, 5);
      target.bezierCurveTo(16, -2, 17, 9, 8, 14);
      target.fill();
    } else if (kind === 'coin') {
      target.arc(8, 8, 6, 0, Math.PI * 2);
      target.fill();
      target.stroke();
      target.fillStyle = '#665128';
      target.font = 'bold 10px Arial';
      target.textAlign = 'center';
      target.fillText('Z', 8, 12);
    } else {
      target.moveTo(8, 2);
      target.lineTo(14, 8);
      target.lineTo(8, 14);
      target.lineTo(2, 8);
      target.closePath();
      target.fill();
    }
    texture = outlinedItemTexture(icon);
    drawPickupItem.cache.set(kind, texture);
  }
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.shadowBlur = 0;
  ctx.drawImage(texture, Math.round(pickup.x - texture.width), Math.round(pickup.y + bob - texture.height),
    texture.width * 2, texture.height * 2);
  ctx.restore();
  return true;
}

// A burn mark baked once per variant: a sooty core, ragged blotches and blast streaks, transparent at the rim.
function scorchImage(variant) {
  const cache = scorchImage.cache || (scorchImage.cache = []);
  if (cache[variant]) return cache[variant];
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  let seed = 9301 + variant * 4973;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const blot = (x, y, radius, alpha) => {
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(18, 11, 7, ${alpha})`);
    gradient.addColorStop(1, 'rgba(18, 11, 7, 0)');
    context.fillStyle = gradient;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  };
  blot(64, 64, 46, 0.85);
  for (let index = 0; index < 28; index += 1) {
    const angle = random() * Math.PI * 2;
    const distance = Math.sqrt(random()) * 44;
    blot(64 + Math.cos(angle) * distance, 64 + Math.sin(angle) * distance, 6 + random() * 14, 0.3 + random() * 0.35);
  }
  context.strokeStyle = 'rgba(14, 9, 6, 0.4)';
  context.lineCap = 'round';
  for (let index = 0; index < 14; index += 1) {
    const angle = random() * Math.PI * 2;
    const start = 18 + random() * 10;
    const end = 44 + random() * 18;
    context.lineWidth = 1.5 + random() * 3;
    context.beginPath();
    context.moveTo(64 + Math.cos(angle) * start, 64 + Math.sin(angle) * start);
    context.lineTo(64 + Math.cos(angle) * end, 64 + Math.sin(angle) * end);
    context.stroke();
  }
  cache[variant] = canvas;
  return canvas;
}

// The char left on the ground by each blast; drawn right after the floor so light and shadow fall on it.
function drawBombScorchMarks() {
  for (const scorch of bombScorches) {
    const { char } = bombAftermath(scorch.age);
    if (char <= 0) continue;
    const size = scorch.radius * 1.7;
    ctx.save();
    ctx.globalAlpha = 0.8 * char;
    ctx.translate(scorch.x, scorch.y);
    ctx.rotate(scorch.seed);
    ctx.drawImage(scorchImage(Math.floor(scorch.seed) % 3), -size / 2, -size / 2, size, size);
    ctx.restore();
  }
}

// Fire across the blast area, each flame burning out at its own time, under rising dark smoke.
function drawBombAftermath() {
  for (const scorch of bombScorches) {
    const { fire, smoke } = bombAftermath(scorch.age);
    if (fire <= 0 && smoke <= 0) continue;
    for (let flame = 0; fire > 0 && flame < 6; flame += 1) {
      const random = (Math.sin(scorch.seed * 12.9898 + flame * 78.233) * 43758.5453) % 1;
      const spread = Math.abs(random);
      const strength = clamp(fire * 1.5 - spread * 0.5, 0, 1);
      if (strength <= 0) continue;
      const angle = scorch.seed + flame * 2.4;
      const distance = scorch.radius * (0.12 + spread * 0.45);
      drawEffect('flames', effectFrameAt('flames', elapsed + flame * 0.23 + spread, 12),
        scorch.x + Math.cos(angle) * distance, scorch.y + Math.sin(angle) * distance * 0.6,
        { anchorY: 0.85, width: (24 + spread * 18) * (0.5 + strength * 0.5), alpha: strength });
    }
    for (let puff = 0; smoke > 0 && puff < 4; puff += 1) {
      const rise = (scorch.age * 0.35 + puff / 4) % 1;
      const angle = scorch.seed + puff * 1.7;
      drawEffect('smoke', 0, scorch.x + Math.cos(angle) * scorch.radius * 0.35 + rise * 10,
        scorch.y + Math.sin(angle) * scorch.radius * 0.2 - rise * 46,
        { width: 40 + rise * 36, alpha: smoke * 0.6 * (1 - rise * 0.7), tint: '#3a3330', smooth: true });
    }
  }
}

// How far through its current windup an enemy is (0..1), measured against the timer it had when the state began.
function windupProgress(enemy) {
  if (enemy.telegraphState !== enemy.behavior) {
    enemy.telegraphState = enemy.behavior;
    enemy.telegraphTotal = Math.max(0.01, enemy.stateTimer || 0);
    enemy.telegraphDistance = null;
  }
  return clamp(1 - (enemy.stateTimer || 0) / enemy.telegraphTotal, 0, 1);
}

function drawGroundHazards() {
  for (const strike of bossStrikes) {
    const progress = clamp(1 - strike.timer / strike.duration, 0, 1);
    // The whole danger area throbs red, faster and stronger as the strike nears (about 1.5 beats a second rising
    // to 6.5), and the runes spin up with it, so the timing reads at a glance even on a huge pulse.
    const beats = strike.duration * (progress * 1.5 + progress * progress * 2.5);
    const throb = 0.5 + 0.5 * Math.sin(beats * Math.PI * 2 - Math.PI / 2);
    ctx.save();
    ctx.globalAlpha = (0.12 + progress * 0.28) * (0.35 + throb * 0.65);
    ctx.drawImage(strikeWaveImage('#ff2a1a'), strike.x - strike.radius, strike.y - strike.radius,
      strike.radius * 2, strike.radius * 2);
    ctx.restore();
    // The exact hit circle, with a front sweeping out to it as the strike charges; SoM runes turn over the top.
    drawStrikeWave(strike.x, strike.y, strike.radius, progress, '#ff5a46');
    drawEffectCircle(strike.x, strike.y, strike.radius, '#ff5a46',
      { alpha: 0.22 + progress * 0.22, ring: 'castRunes', rotation: elapsed * 0.6 + progress * progress * 5 });
    ctx.save();
    if (strike.dashCheck) {
      ctx.fillStyle = '#fff0d1';
      ctx.font = 'bold 16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(strike.timer <= ADAPTIVE_AI_TUNING.pulse.dashCueSeconds ? 'DASH NOW' : 'WIDE PULSE - PREPARE TO DASH',
        strike.x, strike.y - 28);
      if (strike.damage >= 2) {
        ctx.font = 'bold 12px Arial';
        ctx.fillText('HEAVY - 2 HEARTS', strike.x, strike.y - 8);
      }
    } else if (strike.damage >= 2) {
      ctx.fillStyle = '#fff0d1';
      ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('HEAVY - 2 HEARTS', strike.x, strike.y - strike.radius - 8);
    }
    ctx.restore();
  }
  for (const hazard of groundHazards) {
    if (hazard.owner === 'player') {
      drawPlayerMagicMark(hazard.x, hazard.y - hazard.radius * 0.6 - 10, hazard.color);
    }
    const alpha = Math.min(0.68, hazard.ttl / 2.5);
    const wobble = Math.sin(elapsed + hazard.x) * 0.08;
    // TMW shadow under every hazard; a SoM web, or a TMW glow flattened into a pool and tinted to the hazard colour.
    drawEffect('shadow', 0, hazard.x + 2, hazard.y + 2, { width: hazard.radius * 2.1, height: hazard.radius * 1.25,
      alpha: alpha * 0.5, smooth: true });
    if (hazard.kind === 'web') {
      drawEffect('web', 0, hazard.x, hazard.y, { width: hazard.radius * 3.2, alpha: Math.min(1, alpha * 1.4),
        tint: hazard.owner === 'player' ? hazard.color : null });
      continue;
    }
    drawEffect('glow', 0, hazard.x, hazard.y, { width: hazard.radius * 2.8, height: hazard.radius * 1.6,
      rotation: wobble, tint: hazard.color, alpha: Math.min(1, alpha * 1.4), smooth: true });
    if (hazard.kind === 'water' || hazard.kind === 'slush' || hazard.kind === 'charged') {
      drawWaterReflections(hazard, Math.min(1, alpha * 1.4));
    }
    if (hazard.kind === 'charged') {
      // Jagged sparks that re-roll a few times a second so the pool reads as live current.
      const seed = Math.floor(elapsed * 9);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(255, 246, 160, ${Math.min(0.9, alpha * 1.3)})`;
      ctx.lineWidth = 1.5;
      for (let spark = 0; spark < 3; spark += 1) {
        const angle = ((seed * 7 + spark * 13 + hazard.x) % 31) / 31 * Math.PI * 2;
        let px = hazard.x + Math.cos(angle) * hazard.radius * 0.2;
        let py = hazard.y + Math.sin(angle) * hazard.radius * 0.12;
        ctx.beginPath();
        ctx.moveTo(px, py);
        for (let step = 1; step <= 3; step += 1) {
          px += Math.cos(angle + (step % 2 ? 0.7 : -0.7)) * hazard.radius * 0.24;
          py += Math.sin(angle + (step % 2 ? 0.7 : -0.7)) * hazard.radius * 0.14;
          ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
    if (hazard.kind === 'miasma') {
      for (let puff = 0; puff < 3; puff += 1) {
        const angle = elapsed * 1.8 + puff * Math.PI * 2 / 3;
        const rise = (elapsed * 0.7 + puff / 3) % 1;
        drawEffect('smoke', 0, hazard.x + Math.cos(angle) * hazard.radius * 0.4,
          hazard.y + Math.sin(angle) * hazard.radius * 0.22 - rise * 28,
          { width: 30 + Math.sin(elapsed * 5 + puff) * 6, alpha: alpha * (1 - rise * 0.6), smooth: true,
            tint: hazard.owner === 'player' ? hazard.color : '#b6de62' });
      }
    } else if (hazard.kind === 'lightning') {
      drawEffect('lightning', 0, hazard.x, hazard.y, { anchorY: 1, height: 230, tint: hazard.color,
        alpha: hazard.damageCooldown <= 0 ? 1 : 0.45, composite: 'lighter' });
    } else if (hazard.kind === 'fire') {
      for (let flame = 0; flame < 3; flame += 1) {
        drawEffect('flames', effectFrameAt('flames', elapsed + flame * 0.31, 12),
          hazard.x + (flame - 1) * hazard.radius * 0.45, hazard.y + 4,
          { anchorY: 0.85, width: 40, tint: hazard.owner === 'player' ? hazard.color : null });
      }
    } else if (hazard.kind === 'acid') {
      drawEffect('bubble', effectFrameAt('bubble', elapsed, 8), hazard.x - 12, hazard.y - 4,
        { width: 14, tint: hazard.color });
      drawEffect('bubble', effectFrameAt('bubble', elapsed + 0.4, 8), hazard.x + 13, hazard.y + 4,
        { width: 11, tint: hazard.color });
    }
  }
}

function withTextOutline(fn, color = 'rgba(8, 6, 10, 0.92)', width = 3.5, font = null) {
  const plainFillText = ctx.fillText;
  const originalFillText = plainFillText.originalFillText || plainFillText;
  ctx.fillText = function outlinedFillText(text, x, y, maxWidth) {
    const args = maxWidth === undefined ? [text, x, y] : [text, x, y, maxWidth];
    this.save();
    if (font) this.font = font;
    this.strokeStyle = color;
    this.lineWidth = width;
    this.lineJoin = 'round';
    this.strokeText(...args);
    originalFillText.apply(this, args);
    this.restore();
  };
  ctx.fillText.originalFillText = originalFillText;
  try {
    fn();
  } finally {
    ctx.fillText = plainFillText;
  }
}

// Spinning spells wind up as they near their landing point (about 4.6x the base rate at the end of the flight),
// so the spin itself tells the player where and when the spell comes down.
function spellSpin(projectile, rate) {
  if (!(projectile.spinTtl0 > 0)) projectile.spinTtl0 = projectile.ttl0 || projectile.ttl || 1;
  const total = projectile.spinTtl0;
  const age = Math.max(0, total - (Number.isFinite(projectile.ttl) ? projectile.ttl : total));
  const flown = Math.min(1, age / total);
  return rate * (age + total * 1.2 * flown * flown * flown);
}

function drawEnemyProjectile(projectile) {
  const angle = Math.atan2(projectile.vy, projectile.vx);
  if (projectile.kind === 'arrow') {
    drawEffect('arrow', 0, projectile.x, projectile.y, { width: 28, rotation: angle });
  } else if (projectile.kind === 'spore-orb') {
    // TMW spore bubble inside a SoM glow, with four SoM sparkle seeds circling it.
    const pulse = 1 + Math.sin(elapsed * 14) * 0.12;
    drawEffect('orbGlow', 0, projectile.x, projectile.y, { width: (projectile.radius + 8) * 2.4 * pulse,
      tint: projectile.color, smooth: true });
    drawEffect('sporeBubble', effectFrameAt('sporeBubble', elapsed, 12), projectile.x, projectile.y,
      { width: projectile.radius * 2.4 * pulse });
    for (let seed = 0; seed < 4; seed += 1) {
      const seedAngle = spellSpin(projectile, 2) + seed * Math.PI / 2;
      drawEffect('star', 0, projectile.x + Math.cos(seedAngle) * 9, projectile.y + Math.sin(seedAngle) * 9,
        { width: 8, tint: '#f5d8fb' });
    }
  } else if (projectile.kind === 'spore-shard') {
    drawEffect('sporeSplash', effectFrameAt('sporeSplash', elapsed, 12), projectile.x, projectile.y,
      { width: 20, tint: projectile.color, rotation: angle });
  } else {
    drawEffect('orbGlow', 0, projectile.x, projectile.y, { width: projectile.radius * 3.2, tint: projectile.color,
      smooth: true });
    drawEffect('manaBall', 0, projectile.x, projectile.y, { width: projectile.radius * 2, tint: projectile.color });
  }
}

function drawWorldGroundShadows() {
  const band = roomWallBand();
  ctx.save();
  ctx.beginPath();
  ctx.rect(band, band, ROOM_W - band * 2, ROOM_H - band * 2);
  ctx.clip();
  for (const projectile of projectiles) drawProjectileGroundShadow(projectile);
  for (const projectile of enemyProjectiles) drawProjectileGroundShadow(projectile);
  if (currentRoom.type === 'start') drawSoulMenhir(true);
  if (currentRoom.type === 'elemental-shrine') drawElementalMenhir(true);
  for (const rock of breakables) {
    if (rock.broken) continue;
    const sprite = rock.sprite;
    if (!sprite.image.complete || sprite.image.naturalWidth === 0) continue;
    const width = sprite.frameWidth * sprite.scale;
    const height = sprite.frameHeight * sprite.scale;
    if (rock.x + width / 2 < camera.x - 64 || rock.x - width / 2 > camera.x + VIEW_W + 64 ||
        rock.y + height / 2 < camera.y - 64 || rock.y - height / 2 > camera.y + VIEW_H + 64) continue;
    const opacity = rock.regenerating && rock.regenStage < rock.regenSteps
      ? 0.62 + rock.regenStage * 0.12 : 1;
    if (sprite.trunkShadow) {
      drawTrunkShadow(rock.x, rock.y, width, height, opacity);
    } else {
      const columns = Math.floor(sprite.image.naturalWidth / sprite.frameWidth);
      drawSunSpriteShadow(sprite.image, rock.frame % columns * sprite.frameWidth,
        Math.floor(rock.frame / columns) * sprite.frameHeight, sprite.frameWidth, sprite.frameHeight,
        rock.x, rock.y + height / 2, width, height, 0, opacity);
    }
  }
  for (const bomb of bombs) {
    const progress = bomb.flightTimer > 0 ? 1 - bomb.flightTimer / bomb.flightDuration : 1;
    drawSunGroundShadow(bomb.x, bomb.y, 11, bomb.flightTimer > 0 ? Math.sin(progress * Math.PI) * 36 : 0);
  }
  for (const pickup of pickups) drawSunGroundShadow(pickup.x, pickup.y, 9.6);
  for (const enemy of enemies) drawEnemyShadow(enemy);
  for (const companion of companions) drawCompanion(companion, true);
  for (const summon of elementalSummons) drawCompanion(summon, true);
  drawPlayer(true);
  ctx.restore();
}

function drawWorld() {
  drawRoomFloor();
  drawBombScorchMarks();
  collectWorldLights();
  beginWaterReflections();
  advanceRoomNormalMap(quality.low ? 4000 : 8000);
  drawRoomSunlight();
  drawWorldLightSources();
  drawWorldGroundShadows();
  drawSandFootprints();
  drawDesertWind();
  drawGroundHazards();
  drawRewardTrial();
  if (currentRoom.type === 'start') drawSoulMenhir(false);
  if (currentRoom.type === 'elemental-shrine') drawElementalMenhir(false);
  if (currentRoom.type === 'boss' && currentRoom.cleared) {
    // The descent pad is the 40 px circle the walk-on check uses: a turning SoM magic circle.
    drawEffectCircle(ROOM_W * 0.72, ROOM_H / 2, 40, '#a8d7b4', { fill: 0.5, ring: 'castStar', rotation: elapsed * 0.8 });
    ctx.fillStyle = '#f2e5c6';
    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('DESCEND', ROOM_W * 0.72, ROOM_H / 2 - 18);
  }
  if (currentRoom.type === 'shop') drawShopRoom();
  if (hasVault(currentRoom)) {
    ctx.fillStyle = '#f4d78e';
    ctx.font = 'bold 18px Georgia';
    ctx.textAlign = 'center';
    ctx.fillText('Zeny Vault', ROOM_W / 2, 118);
    ctx.fillStyle = '#f2e5c6';
    ctx.font = '14px Arial';
    ctx.fillText(`Carried: ${coins}  ·  Stored: ${save.bankedZeny}`, ROOM_W / 2, 142);
    ctx.font = '12px Arial';
    const vaultHint = lastInputMode === 'touch' ? 'Stand on a pad and tap Use (the Attack button)'
      : lastInputMode === 'controller' ? `Stand on a pad and press ${bindLabel('interact')}  ·  ${padLabels().b} withdraws all`
        : `Stand on a pad and press ${bindLabel('interact')}  ·  Shift+${bindLabel('interact')} withdraws all`;
    ctx.fillText(vaultHint, ROOM_W / 2, 164);
    for (const withdraw of [false, true]) {
      const pad = bankPadPosition(withdraw);
      drawEffectCircle(pad.x, pad.y, 40, withdraw ? '#9fd39a' : '#d7b66e', { fill: 0.35, ring: 'castCross' });
      ctx.fillStyle = '#f2e5c6';
      ctx.font = 'bold 13px Arial';
      ctx.fillText(withdraw ? 'WITHDRAW' : 'DEPOSIT', pad.x, pad.y + 5);
    }
  }
  if (currentRoom.type === 'shrine') {
    ctx.save();
    ctx.fillStyle = 'rgba(17, 16, 25, 0.76)';
    ctx.strokeStyle = currentRoom.cleared ? '#a8d8a0' : '#cc92e7';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(ROOM_W / 2, ROOM_H / 2, 86, 48, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = currentRoom.cleared ? '#c6e7a8' : '#e1b8ef';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ROOM_W / 2, ROOM_H / 2 - 8, 24 + Math.sin(elapsed * 3) * 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#e5d4f1';
    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(currentRoom.cleared ? 'SHRINE OFFERING' : 'GUARDIAN SHRINE', ROOM_W / 2, ROOM_H / 2 + 76);
    ctx.restore();
  }
  if (currentRoom.type === 'riskShrine') drawRiskShrine();

  for (const rock of breakables) {
    if (rock.broken) continue;
    const sprite = rock.sprite;
    const hasImage = sprite.image.complete && sprite.image.naturalWidth > 0;
    const width = sprite.frameWidth * sprite.scale;
    const height = sprite.frameHeight * sprite.scale;
    if (rock.x + width / 2 < camera.x - 64 || rock.x - width / 2 > camera.x + VIEW_W + 64 ||
        rock.y + height / 2 < camera.y - 64 || rock.y - height / 2 > camera.y + VIEW_H + 64) continue;
    if (hasImage) {
      ctx.save();
      if (rock.regenerating && rock.regenStage < rock.regenSteps) {
        ctx.globalAlpha = 0.62 + rock.regenStage * 0.12;
      }
      ctx.drawImage(
        getBreakableFrame(sprite, rock.frame, rock.type),
        rock.x - width / 2,
        rock.y - height / 2,
        width,
        height,
      );
      ctx.restore();
    } else {
      drawFallbackBreakable(rock, width, height);
    }

    ctx.save();
    if (rock.type !== 'solid' && rock.hp < rock.maxHp) {
      ctx.strokeStyle = rock.type === 'bomb-only' ? '#ff8c42'
        : rock.type === 'regenerating' ? '#b5f08f' : 'rgba(255, 220, 177, 0.95)';
      ctx.lineWidth = 2;
      for (let crack = 0; crack < rock.maxHp - rock.hp; crack += 1) {
        const offset = (crack - (rock.maxHp - rock.hp - 1) / 2) * 7;
        ctx.beginPath();
        ctx.moveTo(rock.x + offset - 3, rock.y - 8);
        ctx.lineTo(rock.x + offset + 2, rock.y - 1);
        ctx.lineTo(rock.x + offset - 1, rock.y + 3);
        ctx.lineTo(rock.x + offset + 3, rock.y + 9);
        ctx.stroke();
      }
    }
    if (rock.guaranteedDrop) {
      drawEffect('twinkle', 0, rock.x, rock.y - rock.radius - 9, { width: 18, tint: '#ffe08b',
        rotation: elapsed * 1.5, smooth: true });
    }
    ctx.restore();
  }
  for (const bomb of bombs) {
    const inFlight = bomb.flightTimer > 0;
    const progress = inFlight ? 1 - bomb.flightTimer / bomb.flightDuration : 1;
    const renderY = bomb.y - (inFlight ? Math.sin(progress * Math.PI) * 36 : 0);
    // Everyone inside the blast radius is hit, the thrower included, so every bomb shows its wave.
    drawStrikeWave(inFlight ? bomb.targetX : bomb.x, inFlight ? bomb.targetY : bomb.y, bomb.radius,
      inFlight ? 0 : 1 - bomb.fuse / (bomb.fuseTotal || 1.7), bomb.owner === 'enemy' ? '#ff9d49' : '#ffcf6a',
      bomb.owner === 'enemy' ? 1 : 0.7);
    if (bomb.owner === 'enemy') {
      drawEffectCircle(bomb.targetX, bomb.targetY, 15, '#ff9d49', { fill: 0.4, alpha: 0.85 });
    }
    ctx.fillStyle = bomb.fuse < 0.45 ? '#f1785e'
      : bomb.owner === 'enemy' ? '#573027' : '#26252a';
    ctx.beginPath();
    ctx.arc(bomb.x, renderY, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0e0868';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ffce67';
    ctx.fillRect(bomb.x + 4, renderY - 14, 3, 5);
  }
  for (const pickup of pickups) {
    if (drawDropIcon(pickup.x, pickup.y, () => drawPickupItem(pickup), pickup.kind === 'heart' ? 0.6 : 0.8)) {
      if (pickup.guaranteedTreasure) {
        drawEffect('twinkle', 0, pickup.x, pickup.y, { width: (22 + Math.sin(elapsed * 4) * 2) * 2.2,
          tint: '#ffe08b', rotation: elapsed, alpha: 0.8, smooth: true });
      }
      continue;
    }
    if (pickup.kind === 'lore-relic') {
      const bob = Math.sin(elapsed * 3 + pickup.x) * 3;
      ctx.save();
      ctx.translate(pickup.x, pickup.y + bob);
      // TMW spell book in a teal TMW glow.
      drawEffect('glow', 0, 0, 0, { width: 64, tint: '#a8f0d7', alpha: 0.8, smooth: true });
      if (effectImageReady(effectArt.spellBook)) drawOutlinedItemImage(effectArt.spellBook, -16, -16, 32, 32);
      ctx.fillStyle = '#effff7';
      ctx.font = 'bold 10px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('INTERACT', 0, 30);
      ctx.restore();
      continue;
    }
    if (pickup.guaranteedTreasure) {
      drawEffect('twinkle', 0, pickup.x, pickup.y, { width: (15 + Math.sin(elapsed * 4) * 2) * 2.2,
        tint: '#ffe08b', rotation: elapsed, alpha: 0.88, smooth: true });
    }
    if (pickup.kind === 'upgrade') {
      const bob = Math.sin(elapsed * 4 + pickup.x) * 2;
      const radius = 46;
      let bubbleY = pickup.y + bob;
      const bubbleX = clamp(pickup.x, radius + 6, ROOM_W - radius - 6);
      const bubbleScreenX = bubbleX - camera.x;
      const itemIcon = shopItemIconImages[pickup.item.id];
      const auraColor = pickup.item.kind === 'element'
        ? magicElementPalette[pickup.item.element] || '#8fe0bd'
        : pickup.item.kind === 'ability' ? '#86dce8' : '#a8e39c';
      if (bubbleScreenX + radius > VIEW_W - 154 && bubbleY - camera.y - radius < 154) {
        bubbleY = camera.y + 154 + radius + 6;
      }
      ctx.save();
      ctx.shadowColor = auraColor;
      ctx.shadowBlur = 10;
      ctx.fillStyle = 'rgba(16, 14, 19, 0.48)';
      ctx.beginPath();
      ctx.arc(bubbleX, bubbleY, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 0.68;
      ctx.strokeStyle = '#0e0868';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(16, 14, 19, 0.48)';
      if (itemIcon?.complete && itemIcon.naturalWidth > 0) {
        ctx.imageSmoothingEnabled = false;
        drawDropIcon(bubbleX, bubbleY - 13, () =>
          drawOutlinedItemImage(itemIcon, bubbleX - 16, bubbleY - 29, 32, 32),
          pickup.item.id === 'guardian-heart' ? 0.6 : 0.8);
      } else {
        drawDropIcon(bubbleX, bubbleY - 8, () => drawShopItemIcon(pickup.item, bubbleX, bubbleY - 8),
          pickup.item.id === 'guardian-heart' ? 0.6 : 0.8);
      }
      ctx.textAlign = 'center';
      ctx.font = '14px Arial';
      ctx.fillStyle = '#e4e9f2';
      ctx.fillText(pickup.item.name, bubbleX, bubbleY + 31, 82);
      ctx.restore();
    } else if (pickup.kind === 'curio') {
      const bob = Math.sin(elapsed * 4 + pickup.x) * 2;
      const icon = shopItemIconImages[pickup.item.id];
      ctx.save();
      ctx.shadowColor = '#ffb35a';
      ctx.shadowBlur = 14;
      ctx.fillStyle = 'rgba(30, 20, 8, 0.7)';
      ctx.beginPath();
      ctx.arc(pickup.x, pickup.y + bob, 17, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#ffd37a';
      ctx.lineWidth = 2;
      ctx.stroke();
      if (icon?.complete && icon.naturalWidth > 0) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(icon, pickup.x - 12, pickup.y + bob - 12, 24, 24);
      } else if (!drawEffect('question', 0, pickup.x, pickup.y + bob, { width: 26 })) {
        ctx.fillStyle = '#ffd37a';
        ctx.font = 'bold 18px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', pickup.x, pickup.y + bob);
      }
      ctx.restore();
    } else if (pickup.kind === 'consumable') {
      const icon = shopItemIconImages[pickup.item.id];
      ctx.save();
      ctx.fillStyle = '#ffe38a';
      if (icon?.complete && icon.naturalWidth > 0) {
        ctx.drawImage(icon, pickup.x - 12, pickup.y - 12, 24, 24);
      } else {
        ctx.fillRect(pickup.x - 7, pickup.y - 9, 14, 18);
      }
      ctx.restore();
    } else if (pickup.kind === 'material' && materialCatalog[pickup.material]) {
      // A small shadow and soft glow keep a dull grey-brown ore readable on every floor tile.
      const icon = shopItemIconImages[materialCatalog[pickup.material].id];
      const bob = prefersReducedMotion() ? 0 : Math.sin(elapsed * 4 + pickup.x) * 1.5;
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.beginPath();
      ctx.ellipse(pickup.x, pickup.y + 11, 9, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
      const glow = { darkCrystal: 'rgba(186, 114, 236, 0.8)', lifeStone: 'rgba(240, 240, 120, 0.85)' };
      const fallback = { darkCrystal: '#923eda', lifeStone: '#d8d850' };
      ctx.shadowColor = glow[pickup.material] || 'rgba(255, 224, 160, 0.55)';
      ctx.shadowBlur = 9;
      ctx.imageSmoothingEnabled = false;
      if (icon?.complete && icon.naturalWidth > 0) {
        ctx.drawImage(icon, pickup.x - 13, pickup.y - 13 + bob, 26, 26);
      } else {
        ctx.fillStyle = fallback[pickup.material] || '#a8765a';
        ctx.fillRect(pickup.x - 6, pickup.y - 8 + bob, 12, 16);
      }
      ctx.restore();
    } else if (pickup.kind === 'xp') {
      const bob = Math.sin(elapsed * 6 + pickup.x) * 1.5;
      ctx.save();
      ctx.translate(pickup.x, pickup.y + bob);
      ctx.shadowColor = 'rgba(110, 230, 255, 0.8)';
      ctx.shadowBlur = 8;
      ctx.fillStyle = '#7ee8ff';
      ctx.strokeStyle = '#1b4a66';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(5, 0);
      ctx.lineTo(0, 6);
      ctx.lineTo(-5, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    } else if (pickup.kind === 'heart') {
      if (heartImage.complete && heartImage.naturalWidth > 0) {
        ctx.drawImage(heartImage, pickup.x - 12, pickup.y - 12, 24, 24);
      } else {
        ctx.save();
        ctx.translate(pickup.x, pickup.y);
        ctx.scale(1, 1);
        ctx.fillStyle = '#e95e72';
        ctx.strokeStyle = '#29181b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 10);
        ctx.bezierCurveTo(-3, 7, -11, 1, -10, -5);
        ctx.bezierCurveTo(-9, -12, -2, -12, 0, -7);
        ctx.bezierCurveTo(3, -12, 10, -12, 10, -5);
        ctx.bezierCurveTo(11, 1, 3, 7, 0, 10);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    } else if (pickup.kind === 'coin') {
      const bob = Math.sin(elapsed * 5 + pickup.x) * 2;
      ctx.save();
      ctx.translate(pickup.x, pickup.y + bob);
      ctx.shadowColor = 'rgba(242, 189, 70, 0.72)';
      ctx.shadowBlur = 12;
      ctx.fillStyle = 'rgba(242, 189, 70, 0.18)';
      ctx.beginPath();
      ctx.arc(0, 0, 21, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#17201b';
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f2bd46';
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff0ab';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 8.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#49330f';
      ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Z', 0, 0.5);
      ctx.restore();
    } else if (pickup.kind === 'bomb') {
      ctx.fillStyle = '#25232a';
      ctx.beginPath();
      ctx.arc(pickup.x, pickup.y, 9, 0, Math.PI * 2);
      ctx.fill();
    } else if (pickup.kind === 'key') {
      ctx.fillStyle = '#fbd96f';
      ctx.strokeStyle = '#fbd96f';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(pickup.x - 5, pickup.y - 2, 4, 0, Math.PI * 2);
      ctx.moveTo(pickup.x - 1, pickup.y - 2);
      ctx.lineTo(pickup.x + 8, pickup.y - 2);
      ctx.lineTo(pickup.x + 8, pickup.y + 2);
      ctx.moveTo(pickup.x + 4, pickup.y - 2);
      ctx.lineTo(pickup.x + 4, pickup.y + 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#f5e6ce';
      ctx.beginPath();
      ctx.arc(pickup.x, pickup.y, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (const projectile of projectiles) {
    if (projectile.type === 'reflected') {
      drawEnemyProjectile(projectile);
      continue;
    }
    if (projectile.type === 'charge-beam') {
      const startX = projectile.originX;
      const startY = projectile.originY;
      const endX = projectile.beamEndX ?? startX + projectile.vx * projectile.beamRange;
      const endY = projectile.beamEndY ?? startY + projectile.vy * projectile.beamRange;
      const pulse = 0.85 + Math.sin(elapsed * 32) * 0.15;
      // TMW glow stretched along the beam (tinted), a narrower untinted core, and the beam-crit burst on impact.
      drawEffectBetween('glow', 0, startX, startY, endX, endY, projectile.beamWidth * 2.4,
        { tint: projectile.color, alpha: pulse, composite: 'lighter', smooth: true });
      drawEffectBetween('glow', 0, startX, startY, endX, endY, projectile.beamWidth * 0.7,
        { alpha: pulse, composite: 'lighter', smooth: true });
      if (projectile.beamExplosionTimer > 0) {
        drawEffect('beamCrit', effectFrameAt('beamCrit', elapsed, 16), projectile.beamExplosionX, projectile.beamExplosionY,
          { width: projectile.beamWidth * 2.4, tint: projectile.color });
      }
      continue;
    }
    const size = 18 * (projectile.size || 1);
    ctx.save();
    if (projectile.wildEffect) {
      drawEffect('castStar', 0, projectile.x, projectile.y, {
        width: (projectile.radius + 3 + Math.sin(elapsed * 18) * 2) * 2.4,
        rotation: spellSpin(projectile, 4), tint: projectile.color, smooth: true,
      });
    }
    if (projectiles.length <= 24) {
      ctx.shadowColor = projectile.color;
      ctx.shadowBlur = 14 * (projectile.size || 1);
    }
    ctx.lineJoin = 'round';
    const visual = projectileArcState(projectile);
    ctx.translate(0, visual.y - projectile.y);
    // Launch flash: a ring expands from the muzzle while the shot itself keeps a constant size.
    const launchAge = projectile.born === undefined ? 1 : elapsed - projectile.born;
    if (launchAge >= 0 && launchAge < 0.22) {
      const t = launchAge / 0.22;
      drawEffect('sparkles', t * 4, projectile.x, projectile.y,
        { width: size * (1 + t * 1.8), tint: projectile.color, alpha: 0.85 * (1 - t) });
    }
    if (projectile.type === 'arrow') {
      const angle = Math.atan2(projectile.vy, projectile.vx);
      const s = projectile.size || 1;
      const arrowElement = projectile.glow || projectile.element;
      if (arrowElement) {
        // The element trails behind the arrow: SoM flames, TMW sparks, or a tinted TMW glow.
        const backX = projectile.x - Math.cos(angle) * 12 * s;
        const backY = projectile.y - Math.sin(angle) * 12 * s;
        if (arrowElement === 'fire') {
          drawEffect('fire', effectFrameAt('fire', elapsed, 14), backX, backY,
            { width: 30 * s, rotation: angle - Math.PI / 2, alpha: 0.9 });
        } else if (arrowElement === 'lightning') {
          drawEffect('sparks', effectFrameAt('sparks', elapsed, 24), backX, backY,
            { width: 30 * s, tint: magicElementPalette.lightning, rotation: angle });
        } else {
          drawEffect('glow', 0, backX, backY, { width: 44 * s, height: 18 * s, rotation: angle,
            tint: magicElementPalette[arrowElement], composite: 'lighter', smooth: true });
        }
      }
      const kunaiArt = projectile.weaponVariant === 'kunai' ? shopItemIconImages['weapon-kunai'] : null;
      if (kunaiArt?.complete && kunaiArt.naturalWidth > 0) {
        ctx.save();
        ctx.translate(projectile.x, projectile.y);
        // The kunai icon points up-right; turn it to face its flight.
        ctx.rotate(angle + Math.PI / 4);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(kunaiArt, -13 * s, -13 * s, 26 * s, 26 * s);
        ctx.restore();
      } else {
        drawEffect('arrow', 0, projectile.x, projectile.y, { width: 30 * s, rotation: angle });
      }
    } else if (projectile.type === 'elemental' && projectile.shape) {
      const sprite = projectile.shape === 'ring' ? 'orbGlow' : projectile.shape === 'diamond' ? 'manaBall' : 'orbOval';
      drawEffect(sprite, 0, projectile.x, projectile.y, { width: 24 * (projectile.size || 1),
        rotation: Math.atan2(projectile.vy, projectile.vx), tint: projectile.color });
    } else if (projectile.type === 'elemental') {
      const angle = Math.atan2(projectile.vy, projectile.vx);
      const element = projectile.element || 'bubble';
      const tint = magicElementPalette[element] || magicElementPalette.bubble;
      const { x, y } = projectile;
      if (element === 'bubble') {
        drawEffect('bubble', effectFrameAt('bubble', elapsed, 8), x, y, { width: 24 });
      } else if (element === 'fire') {
        drawEffect('fire', effectFrameAt('fire', elapsed, 14), x, y, { width: 30, rotation: angle - Math.PI / 2 });
      } else if (element === 'lightning') {
        drawEffect('sparks', effectFrameAt('sparks', elapsed, 24), x, y, { width: 30, tint });
      } else if (element === 'ice') {
        drawEffect('snowflake', 0, x, y, { width: 22, rotation: spellSpin(projectile, 6) });
      } else if (element === 'earth') {
        drawEffect('glow', 0, x, y, { width: 30, tint, smooth: true });
        if (stoneImage.complete && stoneImage.naturalWidth > 0) ctx.drawImage(stoneImage, x - 10, y - 10, 20, 20);
      } else if (element === 'wind') {
        drawEffect('sonicWave', effectFrameAt('sonicWave', elapsed, 12), x, y, { height: 30, rotation: angle, tint });
      } else if (element === 'spore') {
        drawEffect('orbGlow', 0, x, y, { width: 30, tint, smooth: true });
        drawEffect('sporeBubble', effectFrameAt('sporeBubble', elapsed, 12), x, y, { width: 22 });
      } else {
        drawEffect('smoke', 0, x, y, { width: 34, rotation: spellSpin(projectile, 2), tint, smooth: true });
      }
    } else if (projectile.type === 'spore-shard') {
      drawEffect('sporeSplash', effectFrameAt('sporeSplash', elapsed, 12), projectile.x, projectile.y,
        { width: 20, tint: projectile.color, rotation: Math.atan2(projectile.vy, projectile.vx) });
    } else if (stoneImage.complete && stoneImage.naturalWidth > 0) {
      ctx.strokeStyle = '#101612';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, size * 0.57, 0, Math.PI * 2);
      ctx.stroke();
      ctx.drawImage(stoneImage, projectile.x - size / 2, projectile.y - size / 2, size, size);
    } else {
      ctx.fillStyle = projectile.color;
      ctx.strokeStyle = '#101612';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, projectile.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
  drawBombAftermath();
  for (const particle of particles) {
    // SoM soft orb for sparks and dust, the SoM arc streak (drawn diagonally in its file) for hit streaks.
    const fade = clamp(particle.ttl / particle.maxTtl, 0, 1);
    if (particle.effect) {
      // A burst plays its sheet once over its lifetime; a single-frame sheet (the shockwave circle) grows instead.
      const frames = EFFECT_SHEETS[particle.effect].frames || 1;
      const grow = frames === 1 ? 0.3 + (1 - fade) * 0.7 : 1;
      drawEffect(particle.effect, Math.min(frames - 1, Math.floor((1 - fade) * frames)), particle.x, particle.y,
        { width: particle.size * grow, tint: particle.color, alpha: frames === 1 ? fade : Math.min(1, fade * 2),
          smooth: frames === 1 });
    } else if (particle.streak) {
      drawEffect('arc', 0, particle.x, particle.y, { width: particle.radius * 3, alpha: fade,
        tint: particle.color, rotation: Math.atan2(particle.vy, particle.vx) - Math.PI / 4 });
    } else {
      drawEffect('orbGlow', 0, particle.x, particle.y, { width: particle.radius * 3, alpha: fade,
        tint: particle.color, smooth: true });
    }
  }
  const markedAngles = new Set();
  for (const swing of player.meleeSwings) {
    const progress = 1 - swing.timer / swing.maxTimer;
    const frame = Math.min(5, Math.floor(progress * 6));
    const centerY = player.y - 34;
    if (!markedAngles.has(swing.angle)) {
      markedAngles.add(swing.angle);
      // Hit marker: a faint TMW swipe the size of the area the swing can strike, and a star where it deflects.
      const fade = 1 - progress;
      drawEffect('swipe', frame, player.x + Math.cos(swing.angle) * swing.hitReach * 0.5,
        centerY + Math.sin(swing.angle) * swing.hitReach * 0.5,
        { height: swing.hitReach * 2, rotation: swing.angle, alpha: 0.45 * fade, tint: swing.charged ? '#fff2a0' : null });
      drawEffect('star', 0, player.x + Math.cos(swing.angle) * swing.reach * 0.68,
        centerY + Math.sin(swing.angle) * swing.reach * 0.68, { width: 12, alpha: 0.7 * fade });
    }
    const swingColor = swing.element ? magicElementPalette[swing.element]
      : swing.offhand ? '#9fd8ff'
        : swing.weapon === 'sword' ? combatPalette.sword
          : swing.weapon === 'daggers' ? combatPalette.daggers : combatPalette.melee;
    const ribbonAngle = swing.spin ? swing.angle + progress * Math.PI * 2 - 0.9 : swing.angle;
    const reach = swing.reach + progress * 12;
    drawEffect('swipe', frame, player.x + Math.cos(ribbonAngle) * reach * 0.55, centerY + Math.sin(ribbonAngle) * reach * 0.55,
      { height: reach * 1.8, rotation: ribbonAngle, tint: swingColor, alpha: 0.9 * (1 - progress) });
  }
  for (const arc of lightningArcs) {
    // TMW bolt image stretched between the two points; its length runs down the file.
    drawEffectBetween('lightning', 0, arc.x1, arc.y1, arc.x2, arc.y2, arc.castTrail ? 14 : 34, {
      along: 'y', tint: arc.color || '#ffe45c', alpha: clamp(arc.ttl / 0.18, 0, 1), composite: 'lighter',
    });
  }
  for (const enemy of enemies) drawEnemy(enemy);
  for (const companion of companions) drawCompanion(companion, false);
  for (const summon of elementalSummons) {
    drawEffect('glow', 0, summon.x, summon.y + 10, { width: 54, height: 22, tint: summon.color, alpha: 0.55, smooth: true });
    drawCompanion(summon, false);
  }
  drawPlayer(false);
  // Enemy shots draw above the delver so the sprite never hides an incoming hit.
  for (const projectile of enemyProjectiles) drawEnemyProjectile(projectile);
  drawOverheadPops();
  drawDamageNumbers();
  drawLaserBeams();
  drawSporePods();
  if (streakCallout.timer > 0) {
    const progress = 1 - streakCallout.timer / streakCallout.duration;
    ctx.save();
    ctx.globalAlpha = Math.min(1, streakCallout.timer * 2.5);
    ctx.fillStyle = '#fff0bd';
    ctx.strokeStyle = '#283b3b';
    ctx.lineWidth = 3;
    ctx.font = `bold ${14 + Math.sin(progress * Math.PI) * 2}px Arial`;
    ctx.textAlign = 'center';
    const y = streakCallout.y - progress * 18;
    ctx.strokeText(streakCallout.text, streakCallout.x, y);
    ctx.fillText(streakCallout.text, streakCallout.x, y);
    ctx.restore();
  }
}

function drawRoomLeftovers(room, x, y, cell, radius) {
  const kinds = roomLeftoverKinds(room);
  const mark = (cx, cy, fill, stroke) => {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  };
  const inset = radius + 1;
  if (kinds.has('heart')) mark(x + inset, y + inset, '#e85d6f', '#fff0f0');
  if (kinds.has('coin')) mark(x + cell - inset, y + inset, '#f4cf5c', '#6b5217');
  if (kinds.has('bomb')) mark(x + inset, y + cell - inset, '#2b2b33', '#d9d9e0');
  if (kinds.has('upgrade')) mark(x + cell - inset, y + cell - inset, '#b98cf0', '#ffffff');
}

// Two altars: the left trades a heart for an upgrade, the right starts an ambush that pays a heart vessel.
function drawRiskShrine() {
  const labels = {
    offering: ['HEART OFFERING', '-1 HEART, +1 UPGRADE', '#e58a9a'],
    ambush: ['AMBUSH ALTAR', 'FIGHT FOR A HEART', '#cc92e7'],
  };
  const used = Boolean(currentRoom.riskShrineChoice);
  ctx.save();
  ctx.textAlign = 'center';
  for (const altar of riskShrineAltars()) {
    const [title, detail, color] = labels[altar.id];
    const chosen = currentRoom.riskShrineChoice === altar.id;
    const spent = used && !(chosen && !currentRoom.riskShrineDone);
    ctx.fillStyle = 'rgba(17, 16, 25, 0.76)';
    ctx.strokeStyle = spent ? '#6f6a78' : color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(altar.x, altar.y, 54, 32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (!spent) {
      ctx.beginPath();
      ctx.arc(altar.x, altar.y - 6, 16 + Math.sin(elapsed * 3) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = spent ? '#8d8896' : '#f2e5f7';
    ctx.font = 'bold 12px Arial';
    ctx.fillText(title, altar.x, altar.y + 52);
    ctx.font = '11px Arial';
    ctx.fillText(chosen && !currentRoom.riskShrineDone ? 'SURVIVE' : used ? 'SPENT' : detail, altar.x, altar.y + 66);
    if (!used && distanceBetween(player, altar) < RISK_SHRINE_RANGE) {
      ctx.fillStyle = '#fff0bd';
      ctx.font = 'bold 12px Arial';
      ctx.fillText('[E] CHOOSE', altar.x, altar.y + 84);
    }
  }
  ctx.restore();
}

function roomMapColor(room, explored) {
  if (!explored) return room.type === 'boss' ? '#9b2b3c' : '#4a4650';
  if (room === currentRoom) return '#8ee0cf';
  return room.type === 'boss' ? '#bb7181' : room.type === 'miniboss' ? '#d78c69'
    : room.type === 'shop' ? '#edc878' : room.type === 'bank' ? '#e4ca75'
      : room.type === 'shrine' ? '#c69be5'
        : room.type === 'riskShrine' ? '#e58a9a'
        : room.type === 'elemental-shrine' ? magicElementPalette[room.shrineElement] || '#80d9d2'
          : room.type === 'trial' ? '#d27a70'
            : room.type === 'secret' ? '#c69be5' : '#aaa19a';
}

function roomMapLetter(room) {
  return { boss: 'B', miniboss: '!', shop: '$', bank: 'Z', shrine: 'S',
    'elemental-shrine': 'E', riskShrine: 'R', trial: 'T', secret: '?' }[room.type] || '';
}

function roomMapLabel(room) {
  return { start: 'Start', boss: 'Guardian', miniboss: 'Mini-boss', shop: 'Shop', bank: 'Bank',
    shrine: 'Shrine', 'elemental-shrine': 'Obelisk', riskShrine: 'Altars', trial: 'Trial', secret: 'Secret' }[room.type] || 'Room';
}

const MAP_AREA = { x: 36, y: 92, w: 724, h: 372 };

// Fits the revealed part of the 7×7 grid into the map area, so small floors draw large.
function mapLayout() {
  const shown = rooms.filter(roomIsRevealed);
  const xs = shown.map((room) => room.x);
  const ys = shown.map((room) => room.y);
  const minX = Math.min(...xs, currentRoom.x);
  const maxX = Math.max(...xs, currentRoom.x);
  const minY = Math.min(...ys, currentRoom.y);
  const maxY = Math.max(...ys, currentRoom.y);
  const cols = maxX - minX + 1;
  const rows = maxY - minY + 1;
  const cell = Math.min(130, MAP_AREA.w / (cols + 0.3), MAP_AREA.h / (rows + 0.3));
  return {
    cell,
    originX: MAP_AREA.x + (MAP_AREA.w - cols * cell) / 2 - minX * cell,
    originY: MAP_AREA.y + (MAP_AREA.h - rows * cell) / 2 - minY * cell,
  };
}

function mapRoomAt(x, y) {
  const layout = mapLayout();
  return rooms.find((room) => {
    if (!roomIsRevealed(room)) return false;
    const rect = roomMapRect(room, layout.originX + room.x * layout.cell, layout.originY + room.y * layout.cell, layout.cell);
    return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
  }) || null;
}

function mapRoomPath(x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawMapLeftoverIcon(kind, x, y, size) {
  ctx.save();
  ctx.translate(x, y);
  const s = size / 20;
  ctx.scale(s, s);
  ctx.lineWidth = 2;
  if (kind === 'heart') {
    // Drawn rather than the heart sprite, whose padding leaves it too small at map size.
    ctx.fillStyle = '#e95e72';
    ctx.strokeStyle = '#fff0f0';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 8);
    ctx.bezierCurveTo(-3, 5, -9, 0, -8, -4);
    ctx.bezierCurveTo(-7, -10, -2, -10, 0, -6);
    ctx.bezierCurveTo(2, -10, 7, -10, 8, -4);
    ctx.bezierCurveTo(9, 0, 3, 5, 0, 8);
    ctx.fill();
    ctx.stroke();
  } else if (kind === 'coin') {
    ctx.fillStyle = '#17201b';
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f2bd46';
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#49330f';
    ctx.font = 'bold 9px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Z', 0, 0.5);
  } else if (kind === 'bomb') {
    ctx.fillStyle = '#25232a';
    ctx.strokeStyle = '#d9d9e0';
    ctx.beginPath();
    ctx.arc(-1, 1, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#f2bd46';
    ctx.beginPath();
    ctx.moveTo(3, -4);
    ctx.lineTo(7, -8);
    ctx.stroke();
  } else if (kind === 'key') {
    ctx.strokeStyle = '#fbd96f';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(-5, 0, 4, 0, Math.PI * 2);
    ctx.moveTo(-1, 0);
    ctx.lineTo(8, 0);
    ctx.lineTo(8, 4);
    ctx.moveTo(4, 0);
    ctx.lineTo(4, 4);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#b98cf0';
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(7, 0);
    ctx.lineTo(0, 8);
    ctx.lineTo(-7, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

const MAP_LEFTOVER_ORDER = [
  ['heart', 'heart'], ['coin', 'zeny'], ['bomb', 'bomb'], ['key', 'key'], ['upgrade', 'upgrade'],
];

function mapLeftovers(room) {
  const kinds = roomLeftoverKinds(room);
  if (kinds.has('curio')) kinds.add('upgrade');
  return MAP_LEFTOVER_ORDER.filter(([kind]) => kinds.has(kind));
}

function drawMapPadlock(x, y, size) {
  ctx.save();
  ctx.translate(x, y);
  const s = size / 14;
  ctx.scale(s, s);
  ctx.fillStyle = '#211b14';
  ctx.beginPath();
  ctx.arc(0, 0, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fbd96f';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, -2, 3.5, Math.PI, 0);
  ctx.stroke();
  ctx.fillStyle = '#fbd96f';
  ctx.fillRect(-5, -2, 10, 7);
  ctx.restore();
}

function drawMapDelver(x, y, cell) {
  if (typeof character === 'undefined' || !character) return;
  const sheet = humanoidSprites[character.sprite]?.image;
  if (!sheet) return;
  ctx.save();
  // Draw at the select screen's scale, then shrink, so head and body stay aligned.
  const k = Math.min(1, cell / 160);
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.fillStyle = 'rgba(14, 16, 20, 0.4)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 16, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  drawHumanoid(sheet, 0, 0, 0, 0.95, character.hue);
  drawHead(character.hairStyle, 'down', 0, 0, 0.95, wornHat());
  ctx.restore();
}

function drawMap() {
  const appear = clamp((elapsed - mapOpenedAt) / 0.15, 0, 1);
  const routes = mapTravelRoutes();
  const travelReady = mapTravelAvailable();
  const layout = mapLayout();
  const { cell, originX, originY } = layout;
  const roomPos = (room) => ({ x: originX + room.x * cell, y: originY + room.y * cell });
  const shown = rooms.filter(roomIsRevealed);

  ctx.save();
  ctx.globalAlpha = appear;
  ctx.fillStyle = 'rgba(6, 6, 10, 0.55)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const grow = 0.96 + appear * 0.04;
  ctx.translate(VIEW_W / 2, VIEW_H / 2);
  ctx.scale(grow, grow);
  ctx.translate(-VIEW_W / 2, -VIEW_H / 2);

  // Panel
  mapRoomPath(16, 16, VIEW_W - 32, VIEW_H - 32, 14);
  ctx.fillStyle = 'rgba(16, 14, 22, 0.95)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#8a6d45';
  ctx.stroke();
  mapRoomPath(23, 23, VIEW_W - 46, VIEW_H - 46, 10);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(217, 189, 131, 0.35)';
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
  mapRoomPath(MAP_AREA.x - 8, MAP_AREA.y - 8, MAP_AREA.w + 16, MAP_AREA.h + 16, 10);
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#f3e9d8';
  ctx.font = 'bold 22px Georgia';
  ctx.fillText('SANCTUM MAP', MAP_AREA.x + MAP_AREA.w / 2, 52);
  ctx.fillStyle = '#c9b48d';
  ctx.font = '13px Arial';
  ctx.fillText(`${currentFloorTheme().name} · Floor ${currentFloor}`, MAP_AREA.x + MAP_AREA.w / 2, 72);

  // Corridors
  const drawn = new Set();
  for (const room of shown) {
    const a = roomPos(room);
    for (const direction of directions) {
      const secretLink = room.secretExit?.direction === direction.name && !room.secretExit.room.hidden;
      const returnLink = room.type === 'secret' && room.returnDirection === direction.name;
      if (!room.links[direction.name] && !secretLink) continue;
      const other = secretLink ? room.secretExit.room : returnLink ? room.returnTo
        : rooms.find((candidate) => candidate.x === room.x + direction.dx && candidate.y === room.y + direction.dy);
      if (!other || !roomIsRevealed(other)) continue;
      const pairKey = [roomKey(room), roomKey(other)].sort().join('|');
      if (drawn.has(pairKey)) continue;
      drawn.add(pairKey);
      const b = roomPos(other);
      const ax = a.x + cell / 2;
      const ay = a.y + cell / 2;
      const bx = b.x + cell / 2;
      const by = b.y + cell / 2;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#2a2530';
      ctx.lineWidth = Math.max(6, cell * 0.16);
      if (secretLink || returnLink) ctx.setLineDash([cell * 0.08, cell * 0.08]);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.strokeStyle = secretLink || returnLink ? '#a98cc7' : '#908572';
      ctx.lineWidth = Math.max(3, cell * 0.08);
      ctx.stroke();
      ctx.restore();
      if (room.lockedDoors[direction.name] || other.lockedDoors[oppositeDirection[direction.name]]) {
        drawMapPadlock((ax + bx) / 2, (ay + by) / 2, Math.max(9, cell * 0.13));
      }
    }
  }

  // Rooms
  for (const room of shown) {
    const { x, y } = roomPos(room);
    const explored = room.visited || room === currentRoom;
    const rect = roomMapRect(room, x, y, cell);
    const radius = cell * 0.08;
    ctx.save();
    if (!explored) {
      mapRoomPath(rect.x, rect.y, rect.w, rect.h, radius);
      // Opaque so corridors don't show through rooms you haven't entered.
      ctx.fillStyle = '#25222b';
      ctx.fill();
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = room.type === 'boss' ? '#d65a6c' : '#8a8291';
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = room.type === 'boss' ? '#ffd8dc' : '#b8b0bf';
      ctx.font = `bold ${Math.round(cell * 0.2)}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(room.type === 'boss' ? 'B' : '?', x + cell / 2, y + cell / 2);
      ctx.restore();
      continue;
    }
    mapRoomPath(rect.x, rect.y, rect.w, rect.h, radius);
    ctx.fillStyle = roomMapColor(room, true);
    ctx.fill();
    const shade = ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.h);
    shade.addColorStop(0, 'rgba(255, 255, 255, 0.18)');
    shade.addColorStop(1, 'rgba(0, 0, 0, 0.32)');
    ctx.fillStyle = shade;
    ctx.fill();
    if (!room.cleared) {
      ctx.fillStyle = `rgba(200, 30, 40, ${0.35 + Math.sin(elapsed * 4) * 0.1})`;
      ctx.fill();
    }
    ctx.lineWidth = !room.cleared ? 2.5 : rect.larger ? 2 : 1.5;
    ctx.strokeStyle = !room.cleared ? '#ff6b6b' : rect.larger ? '#f4e3b0' : 'rgba(255, 244, 222, 0.55)';
    ctx.stroke();
    if (routes.has(room)) {
      mapRoomPath(rect.x - 3, rect.y - 3, rect.w + 6, rect.h + 6, radius + 3);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(142, 224, 207, 0.45)';
      ctx.stroke();
    }
    const letter = roomMapLetter(room);
    if (letter && room !== currentRoom) {
      const badge = Math.max(9, cell * 0.15);
      ctx.fillStyle = 'rgba(20, 18, 26, 0.78)';
      ctx.beginPath();
      ctx.arc(x + cell / 2, y + cell / 2 - cell * 0.04, badge, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = room.type === 'boss' ? '#ffb3bd' : '#f3e9d8';
      ctx.font = `bold ${Math.round(badge * 1.25)}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(letter, x + cell / 2, y + cell / 2 - cell * 0.04 + 1);
    }
    const leftovers = mapLeftovers(room);
    if (leftovers.length > 0) {
      // Icons shrink to fit the room's width, on a dark strip so they read on any room colour.
      const spacing = 1.1;
      const iconSize = Math.min(clamp(cell * 0.2, 11, 20), (rect.w - 6) / (leftovers.length * spacing));
      const stripW = leftovers.length * iconSize * spacing + 4;
      const stripY = rect.y + rect.h - iconSize - 6;
      mapRoomPath(x + cell / 2 - stripW / 2, stripY, stripW, iconSize + 4, (iconSize + 4) / 2);
      ctx.fillStyle = 'rgba(16, 14, 22, 0.72)';
      ctx.fill();
      leftovers.forEach(([kind], index) => {
        const iconX = x + cell / 2 + (index - (leftovers.length - 1) / 2) * iconSize * spacing;
        drawMapLeftoverIcon(kind, iconX, stripY + iconSize / 2 + 2, iconSize);
      });
    }
    ctx.restore();
  }

  // You are here
  {
    const { x, y } = roomPos(currentRoom);
    const rect = roomMapRect(currentRoom, x, y, cell);
    ctx.save();
    ctx.strokeStyle = `rgba(255, 241, 215, ${0.6 + Math.sin(elapsed * 5) * 0.35})`;
    ctx.lineWidth = 2;
    mapRoomPath(rect.x - 2, rect.y - 2, rect.w + 4, rect.h + 4, cell * 0.08 + 2);
    ctx.stroke();
    ctx.restore();
    drawMapDelver(x + cell / 2, y + cell / 2 + cell * 0.12, cell);
  }

  // Selection
  const selected = mapCursor && rooms.includes(mapCursor) && roomIsRevealed(mapCursor) ? mapCursor : currentRoom;
  if (selected !== currentRoom) {
    const { x, y } = roomPos(selected);
    const rect = roomMapRect(selected, x, y, cell);
    ctx.save();
    ctx.strokeStyle = routes.has(selected) ? '#8ee0cf' : '#d9bd83';
    ctx.lineWidth = 2.5 + Math.sin(elapsed * 6) * 0.8;
    mapRoomPath(rect.x - 5, rect.y - 5, rect.w + 10, rect.h + 10, cell * 0.08 + 5);
    ctx.stroke();
    ctx.restore();
  }

  drawMapSidebar(selected, routes, travelReady, shown);
  ctx.restore();
}

function drawMapSidebar(selected, routes, travelReady, shown) {
  const x = 784;
  const width = VIEW_W - 36 - x;
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
  mapRoomPath(x - 10, MAP_AREA.y - 8, width + 20, MAP_AREA.h + 16, 10);
  ctx.fill();

  // Selected room
  const explored = selected.visited || selected === currentRoom;
  ctx.fillStyle = '#d9bd83';
  ctx.font = 'bold 11px Arial';
  ctx.fillText(selected === currentRoom ? 'YOU ARE HERE' : 'SELECTED', x, MAP_AREA.y + 10);
  ctx.fillStyle = '#f3e9d8';
  ctx.font = 'bold 17px Georgia';
  ctx.fillText(explored ? roomMapLabel(selected) : 'Unexplored', x, MAP_AREA.y + 32);
  ctx.font = '12px Arial';
  ctx.fillStyle = '#c9bfb0';
  const leftovers = explored ? mapLeftovers(selected) : [];
  let lineY = MAP_AREA.y + 52;
  if (leftovers.length > 0) {
    leftovers.forEach(([kind, label], index) => {
      const row = Math.floor(index / 2);
      const col = index % 2;
      drawMapLeftoverIcon(kind, x + 7 + col * 70, lineY + row * 20 - 4, 12);
      ctx.fillStyle = '#c9bfb0';
      ctx.fillText(label, x + 18 + col * 70, lineY + row * 20);
    });
    lineY += Math.ceil(leftovers.length / 2) * 20;
  } else if (explored) {
    ctx.fillText('Nothing left here', x, lineY);
    lineY += 20;
  }
  const status = selected === currentRoom
    ? (travelReady ? 'Pick a room to travel' : 'Clear this room to travel')
    : routes.has(selected) ? 'Ready to travel'
      : !travelReady ? 'Clear this room to travel'
        : !explored ? 'Not yet explored'
          : !selected.cleared ? 'Foes remain there'
            : { foes: 'Foes block the way', locked: 'A locked door is in the way',
              both: 'Foes and a locked door are in the way' }[mapRouteBlocker(selected)] || 'No open path';
  ctx.fillStyle = selected !== currentRoom && routes.has(selected) ? '#8ee0cf' : '#a99f93';
  ctx.font = 'italic 12px Arial';
  let statusLine = '';
  for (const word of status.split(' ')) {
    const next = statusLine ? `${statusLine} ${word}` : word;
    if (statusLine && ctx.measureText(next).width > width) {
      ctx.fillText(statusLine, x, lineY + 2);
      lineY += 15;
      statusLine = word;
    } else {
      statusLine = next;
    }
  }
  ctx.fillText(statusLine, x, lineY + 2);

  // Legend: only room kinds on this floor's revealed map
  const legendTop = MAP_AREA.y + 150;
  ctx.strokeStyle = 'rgba(217, 189, 131, 0.25)';
  ctx.beginPath();
  ctx.moveTo(x, legendTop - 18);
  ctx.lineTo(x + width, legendTop - 18);
  ctx.stroke();
  ctx.fillStyle = '#d9bd83';
  ctx.font = 'bold 11px Arial';
  ctx.fillText('LEGEND', x, legendTop);
  const entries = [{ label: 'You', color: roomMapColor(currentRoom, true) }];
  const seenTypes = new Set();
  for (const room of shown) {
    const explored = room.visited || room === currentRoom;
    // The start room looks like any other room, so it shares the Room entry.
    const type = room.type === 'start' ? 'normal' : room.type;
    if (!explored || room === currentRoom || seenTypes.has(type)) continue;
    seenTypes.add(type);
    entries.push({ label: roomMapLabel({ type }), color: roomMapColor(room, true), letter: roomMapLetter(room) });
  }
  if (shown.some((room) => !room.visited && room !== currentRoom)) entries.push({ label: 'Unexplored', dashed: true });
  if (shown.some((room) => room.visited && !room.cleared)) entries.push({ label: 'Foes remain', color: '#c8323c', hostile: true });
  entries.slice(0, 11).forEach((entry, index) => {
    const y = legendTop + 14 + index * 19;
    mapRoomPath(x, y, 16, 14, 3);
    if (entry.dashed) {
      ctx.setLineDash([3, 2]);
      ctx.strokeStyle = '#8a8291';
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.fillStyle = entry.color;
      ctx.fill();
      if (entry.hostile) {
        ctx.strokeStyle = '#ff6b6b';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
    ctx.fillStyle = '#e6dccb';
    ctx.font = '12px Arial';
    ctx.fillText(entry.letter ? `${entry.letter}  ${entry.label}` : entry.label, x + 24, y + 11);
  });
  ctx.restore();

  // Footer prompt
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ded4c4';
  ctx.font = '14px Arial';
  const mapKey = bindLabel('map');
  const p = padLabels();
  const prompt = lastInputMode === 'controller'
    ? `D-pad · Select   ${p.a} · Travel   ${p.b} or ${mapKey} · Close`
    : lastInputMode === 'touch'
      ? 'Tap a room to select it, tap again to travel · Map · Close'
      : `Click a room or use arrows + Enter to travel · ${mapKey} or Esc · Close`;
  ctx.fillText(prompt, VIEW_W / 2, VIEW_H - 32);
  ctx.restore();
}

function roomMapRect(room, x, y, cell) {
  const sizeKey = room.visited || room === currentRoom ? room.sizeKey : 'small';
  const [fw, fh] = { large: [0.95, 0.85], wide: [0.95, 0.6], tall: [0.6, 0.95] }[sizeKey] || [0.6, 0.6];
  const w = Math.round(cell * fw);
  const h = Math.round(cell * fh);
  return { x: Math.round(x + (cell - w) / 2), y: Math.round(y + (cell - h) / 2), w, h, larger: fw !== fh || fw > 0.9 };
}

function drawMinimap() {
  const panel = { x: VIEW_W - 154, y: 12, width: 142, height: 142 };
  const cell = 16;
  const originX = panel.x + 14;
  const originY = panel.y + 25;
  const hostile = !currentRoom.cleared;
  drawManaPanel(panel.x, panel.y, panel.width, panel.height, hostile ? '#cf8172' : '#c9a65a');
  ctx.fillStyle = '#e6d8bd';
  ctx.font = 'bold 11px Arial';
  ctx.textAlign = 'left';
  ctx.fillText(`${currentFloorTheme().name}  [M]`, panel.x + 9, panel.y + 15);

  for (const room of rooms) {
    if (!roomIsRevealed(room)) continue;
    const x = originX + room.x * cell;
    const y = originY + room.y * cell;
    for (const direction of directions) {
      const connectedRoom = rooms.find((candidate) =>
        candidate.x === room.x + direction.dx && candidate.y === room.y + direction.dy,
      );
      const secretConnected = room.secretExit?.direction === direction.name &&
        !room.secretExit.room.hidden ? room.secretExit.room : null;
      const linked = room.links[direction.name] ? connectedRoom : secretConnected;
      if (!linked || !roomIsRevealed(linked)) continue;
      const otherX = originX + linked.x * cell + cell / 2;
      const otherY = originY + linked.y * cell + cell / 2;
      ctx.strokeStyle = '#908572';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + cell / 2, y + cell / 2);
      ctx.lineTo(otherX, otherY);
      ctx.stroke();
    }
  }

  for (const room of rooms) {
    if (!roomIsRevealed(room)) continue;
    const x = originX + room.x * cell;
    const y = originY + room.y * cell;
    const explored = room.visited || room === currentRoom;
    const rect = roomMapRect(room, x, y, cell);
    ctx.fillStyle = roomMapColor(room, explored);
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    if (explored && rect.larger) {
      ctx.strokeStyle = '#f4e3b0';
      ctx.lineWidth = 1;
      ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
    }
    if (room.type === 'boss') {
      ctx.strokeStyle = `rgba(255, 90, 90, ${0.6 + Math.sin(elapsed * 4) * 0.3})`;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(rect.x - 1.5, rect.y - 1.5, rect.w + 3, rect.h + 3);
    }
    if ((explored && roomMapLetter(room)) || room.type === 'boss') {
      ctx.fillStyle = room.type === 'boss' ? '#fff0f0' : '#211e25';
      ctx.font = 'bold 9px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(roomMapLetter(room), x + cell / 2, y + cell / 2 + 3);
    }
    if (room === currentRoom) {
      ctx.strokeStyle = '#fff1d7';
      ctx.lineWidth = 1;
      ctx.strokeRect(rect.x - 1, rect.y - 1, rect.w + 2, rect.h + 2);
    }
    if (explored) drawRoomLeftovers(room, x, y, cell, 2.5);
  }
}

// Bottom-left 1/2/3 weapon slots; the active one is enlarged, glowing and tagged.
// Bottom action bar: every non-weapon button, with its key, live count and cooldown.
// Mirrors the page's text lines (message + controls hint) into the canvas so they are visible without scrolling.
function drawInGameCommentary() {
  const calm = enemies.length === 0;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  // Recent messages stack upward from the commentary line, newest at the bottom.
  ctx.font = 'bold 14px Arial';
  messageToasts.forEach((toast, index) => {
    // In the shop the line sits near the top, so the stack grows downward there.
    const y = currentRoom?.type === 'shop' ? 78 + index * 30 : 408 - index * 30;
    const width = Math.min(VIEW_W - 40, ctx.measureText(toast.text).width + 28);
    ctx.globalAlpha = Math.min(1, toast.timer / 0.6) * (index === 0 ? 1 : 0.85);
    drawManaPanel(VIEW_W / 2 - width / 2, y, width, 26);
    ctx.fillStyle = '#f4e8c8';
    ctx.fillText(toast.text.slice(0, 120), VIEW_W / 2, y + 18, VIEW_W - 48);
  });
  if (calm && controlsHelpVisible) {
    const hint = (controlsEl.textContent || '').replace(/\n/g, ' · ');
    ctx.globalAlpha = 0.85;
    ctx.font = '11px Arial';
    ctx.fillStyle = 'rgba(8, 10, 12, 0.7)';
    ctx.fillRect(0, VIEW_H - 20, VIEW_W, 20);
    ctx.fillStyle = '#d8d2b8';
    ctx.fillText(hint, VIEW_W / 2, VIEW_H - 6, VIEW_W - 16);
  }
  ctx.restore();
}

function drawActionBar() {
  const pad = lastInputMode === 'controller';
  const activeItem = consumables.find((item) => item.count > 0);
  const itemTotal = consumables.reduce((sum, item) => sum + Math.max(0, item.count), 0);
  const slots = [
    { id: 'dash', key: bindLabel('dash'), label: 'DASH', color: '#cfe8ff',
      cooldown: dashCooldown, cooldownMax: character?.className === 'Scout' ? 0.42 : 0.85 },
    { id: 'item', key: bindLabel('item'), label: activeItem ? activeItem.name.toUpperCase().slice(0, 9) : 'ITEM',
      color: '#e89676', count: itemTotal, icon: activeItem ? shopItemIconImages[activeItem.id] : null },
    { id: 'shock', key: bindLabel('shock'),
      label: ownedItems.has('orbiting-projectiles') ? 'MANA GUARD' : 'SHOCKWAVE',
      color: ownedItems.has('orbiting-projectiles') ? '#62d9ee' : '#ffffff',
      icon: ownedItems.has('orbiting-projectiles') ? orbitGuardIcons[orbitGuardStyle().kind] : null,
      count: ownedItems.has('orbiting-projectiles') ? undefined : blanksHeld,
      chargeUps: ownedItems.has('orbiting-projectiles') ? orbitGuardChargeUps : undefined,
      chargeRequired: ownedItems.has('orbiting-projectiles') ? ORBIT_GUARD_CHARGE_REQUIREMENT : undefined },
    { id: 'bomb', key: bindLabel('bomb'), label: 'BOMB', color: '#f2c774', count: bombsHeld },
  ];
  if (frostActive && ownedItems.has('frost-rune')) {
    slots.push({ id: 'frost', key: 'AUTO', label: 'FROST', color: '#9fd7ff', icon: shopItemIconImages['frost-rune'] });
  }
  const sig = classSignature();
  if (sig?.active) {
    slots.push({ id: 'ability', key: pad ? bindLabel('ability') : 'R-CLICK', label: sig.label.toUpperCase().slice(0, 9),
      color: sig.color, cooldown: player.signatureCooldown, cooldownMax: sig.cooldown });
  }
  {
    const elementKey = magicElements.has(activeMagicElement) ? activeMagicElement : 'bubble';
    slots.push({ id: 'element', key: 'AUTO', label: elementDisplayName(elementKey).toUpperCase().slice(0, 9),
      color: magicElementPalette[elementKey] || '#62d9ee', element: elementKey });
  }
  const gap = 4;
  const size = Math.min(36, Math.floor(268 / slots.length) - gap);
  const baseX = 536;
  const baseY = 2;
  ctx.save();
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.font = 'bold 9px Arial';
  ctx.fillStyle = '#bdb59f';
  slots.forEach((slot, index) => {
    const x = baseX + index * (size + gap);
    const empty = (slot.count !== undefined && slot.count <= 0) ||
      (slot.chargeUps !== undefined && slot.chargeUps <= 0) || (slot.id === 'item' && !activeItem);
    const cooling = slot.cooldown > 0;
    ctx.globalAlpha = empty ? 0.45 : 1;
    drawManaPanel(x, baseY, size, size, cooling || empty ? '#80765b' : '#c9a65a');
    const cx = x + size / 2;
    const cy = baseY + size / 2 + 3;
    ctx.save();
    ctx.strokeStyle = slot.color;
    ctx.fillStyle = slot.color;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    if (slot.icon?.complete && slot.icon.naturalWidth > 0) {
      ctx.imageSmoothingEnabled = false;
      drawOutlinedItemImage(slot.icon, cx - 13, cy - 13, 26, 26);
    } else if (slot.id === 'dash') {
      for (const offset of [-7, 3]) {
        ctx.beginPath();
        ctx.moveTo(cx + offset - 4, cy - 8);
        ctx.lineTo(cx + offset + 4, cy);
        ctx.lineTo(cx + offset - 4, cy + 8);
        ctx.stroke();
      }
    } else if (slot.id === 'shock') {
      if (!ownedItems.has('orbiting-projectiles')) {
        ctx.beginPath();
        ctx.arc(cx, cy, 9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx - 13, cy);
        ctx.lineTo(cx + 13, cy);
        ctx.moveTo(cx, cy - 13);
        ctx.lineTo(cx, cy + 13);
        ctx.stroke();
      }
    } else if (slot.id === 'element') {
      // Element glyph: droplet (bubble), flame (fire), bolt (lightning), cloud (gas).
      const e = slot.element;
      ctx.beginPath();
      if (e === 'fire') {
        ctx.moveTo(cx, cy - 12); ctx.quadraticCurveTo(cx + 12, cy, cx, cy + 11);
        ctx.quadraticCurveTo(cx - 12, cy, cx, cy - 12);
        ctx.fill();
      } else if (e === 'lightning') {
        ctx.moveTo(cx + 3, cy - 12); ctx.lineTo(cx - 6, cy + 1); ctx.lineTo(cx, cy + 1);
        ctx.lineTo(cx - 3, cy + 12); ctx.lineTo(cx + 7, cy - 2); ctx.lineTo(cx + 1, cy - 2);
        ctx.closePath(); ctx.fill();
      } else if (e === 'gas') {
        for (const [ox, oy, r] of [[-6, 3, 6], [3, 0, 8], [8, 5, 5]]) {
          ctx.beginPath(); ctx.arc(cx + ox, cy + oy, r, 0, Math.PI * 2); ctx.fill();
        }
      } else {
        ctx.moveTo(cx, cy - 12); ctx.quadraticCurveTo(cx + 11, cy + 2, cx, cy + 11);
        ctx.quadraticCurveTo(cx - 11, cy + 2, cx, cy - 12);
        ctx.fill();
      }
    } else if (slot.id === 'bomb') {
      ctx.beginPath();
      ctx.arc(cx, cy + 2, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx + 5, cy - 6);
      ctx.lineTo(cx + 10, cy - 12);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(cx, cy, 10, 0, Math.PI * 2);
      ctx.globalAlpha *= 0.85;
      ctx.fill();
    }
    ctx.restore();
    if (cooling) {
      const fraction = clamp(slot.cooldown / (slot.cooldownMax || 1), 0, 1);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(x + 1, baseY + 1, size - 2, (size - 2) * fraction);
    }
    ctx.font = 'bold 9px Arial';
    ctx.fillStyle = '#ffe38a';
    ctx.textAlign = 'left';
    ctx.fillText(slot.key, x + 3, baseY + 3);
    if (slot.count !== undefined) {
      ctx.textAlign = 'right';
      ctx.font = 'bold 12px Arial';
      ctx.fillStyle = slot.count > 0 ? '#ffffff' : '#e06a6a';
      ctx.fillText(String(slot.count), x + size - 3, baseY + size - 14);
    }
    if (slot.chargeUps !== undefined) {
      ctx.textAlign = 'right';
      ctx.font = 'bold 8px Arial';
      ctx.fillStyle = slot.chargeUps >= slot.chargeRequired ? '#fff0a0' : '#ffffff';
      ctx.fillText(`${slot.chargeUps}/${slot.chargeRequired}`, x + size - 3, baseY + 4);
      const pipWidth = 5;
      const pipGap = 2;
      const pipsWidth = slot.chargeRequired * pipWidth + (slot.chargeRequired - 1) * pipGap;
      const pipsX = x + (size - pipsWidth) / 2;
      for (let pip = 0; pip < slot.chargeRequired; pip += 1) {
        ctx.fillStyle = pip < slot.chargeUps ? slot.color : 'rgba(220, 220, 220, 0.25)';
        ctx.fillRect(pipsX + pip * (pipWidth + pipGap), baseY + size - 4, pipWidth, 2);
      }
    }
    ctx.textAlign = 'center';
    ctx.font = '8px Arial';
    ctx.fillStyle = '#a9a28f';
    ctx.fillText(slot.label, x + size / 2, baseY + size + 3);
    ctx.globalAlpha = 1;
  });
  ctx.restore();
}

function drawStyleSlots() {
  const styles = [
    { id: 'melee', key: '1', label: 'SWORD' },
    { id: 'bow', key: '2', label: 'BOW' },
    { id: 'magic', key: '3', label: 'MAGIC' },
  ];
  const size = 36;
  const gap = 8;
  const slotCount = 3 + (classSignature()?.active ? 1 : 0);
  const baseX = 424 - (slotCount * size + (slotCount - 1) * gap);
  const baseY = 2;
  const active = currentAttackStyle();
  ctx.save();
  styles.forEach((style, index) => {
    const selected = style.id === active;
    const locked = !styleUnlocked(style.id) ||
      ![weaponHands.main, weaponHands.off].some((id) => weaponById(id)?.family === style.id);
    const x = baseX + index * (size + gap);
    const y = baseY;
    ctx.save();
    ctx.globalAlpha = selected ? 1 : locked ? 0.4 : 0.85;
    if (selected) {
      ctx.shadowColor = '#ffe38a';
      ctx.shadowBlur = 14;
    }
    drawManaPanel(x, y, size, size, selected ? '#f0d486' : '#988254');
    if (selected) {
      ctx.fillStyle = 'rgba(164, 128, 48, 0.18)';
      ctx.fillRect(x + 4, y + 4, size - 8, size - 8);
    }
    ctx.shadowBlur = 0;
    ctx.translate(x + size / 2, y + size / 2 + 3);
    ctx.scale(0.78, 0.78);
    ctx.strokeStyle = selected ? '#fff2c0' : '#cfc6b2';
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    // The weapon each hand holds shows as its icon here, instead of being drawn on the walking character.
    const slotHand = [weaponHands.main, weaponHands.off].find((id) => weaponById(id)?.family === style.id);
    const slotArt = slotHand && shopItemIconImages[`weapon-${slotHand}`];
    if (slotArt?.complete && slotArt.naturalWidth) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(slotArt, -17, -21, 34, 34);
    } else if (style.id === 'melee') {
      ctx.moveTo(-11, 11);
      ctx.lineTo(10, -10);
      ctx.moveTo(-3, 5);
      ctx.lineTo(3, 11);
      ctx.stroke();
    } else if (style.id === 'bow') {
      ctx.arc(-4, 0, 14, -1.1, 1.1);
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-4 + Math.cos(-1.1) * 14, Math.sin(-1.1) * 14);
      ctx.lineTo(-4 + Math.cos(1.1) * 14, Math.sin(1.1) * 14);
      ctx.moveTo(-10, 0);
      ctx.lineTo(13, 0);
      ctx.stroke();
    } else {
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.arc(-3, -3, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.save();
    // After a swap the other slots stay greyed out; the wedge shrinks as the cooldown runs out.
    if (!selected && weaponSwapCooldown > 0) {
      ctx.save();
      const centerX = x + size / 2;
      const centerY = y + size / 2;
      ctx.beginPath();
      ctx.rect(x, y, size, size);
      ctx.clip();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.66)';
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, size, -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * Math.min(1, weaponSwapCooldown / WEAPON_SWAP_COOLDOWN));
      ctx.closePath();
      ctx.fill();
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(String(Math.ceil(weaponSwapCooldown)), centerX, centerY + 1);
      ctx.restore();
    }
    ctx.font = 'bold 11px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = selected ? '#ffe38a' : '#bdb59f';
    ctx.fillText(style.key, x + 4, y + 3);
    const handId = [weaponHands.main, weaponHands.off].find((id) => weaponById(id)?.family === style.id);
    const handVariant = handId && !weaponById(handId).base ? weaponById(handId) : null;
    const hand = handId ? weaponHandOf(handId) : null;
    if (hand) {
      // Hand tag: gold M for the main hand; blue O for the off hand, lit while Dual Grip has it attacking.
      const tagX = x + size - 6;
      const tagY = y + 6;
      ctx.fillStyle = hand === 'main' ? '#ffe38a' : offhandActive() ? '#9fd8ff' : '#5f7d8c';
      ctx.beginPath();
      ctx.arc(tagX, tagY, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = 'bold 8px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#1b1408';
      ctx.fillText(hand === 'main' ? 'M' : 'O', tagX, tagY + 0.5);
      if (handId && weaponProficiency(handId) < 1) {
        // Not learned yet: the weapon hits weaker, shown as its power in the corner.
        ctx.font = 'bold 8px Arial';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = '#e0a868';
        ctx.fillText(`${Math.round(weaponProficiency(handId) * 100)}%`, x + size - 2, y + size - 1);
      }
    }
    const mod = activeWeaponMod(style.id);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = selected ? 'bold 10px Arial' : '9px Arial';
    ctx.fillStyle = selected ? '#ffffff' : '#a9a28f';
    ctx.fillText(handVariant ? handVariant.name.toUpperCase() : mod ? mod.name : style.label, x + size / 2, y + size + 3);
    ctx.restore();
  });
  const sig = classSignature();
  if (sig?.active) {
    const x = baseX + 3 * (size + gap);
    const ready = !(player.signatureCooldown > 0);
    drawManaPanel(x, baseY, size, size, ready ? '#c9a65a' : '#80765b');
    ctx.fillStyle = sig.color;
    ctx.globalAlpha = ready ? 0.9 : 0.25;
    ctx.beginPath();
    ctx.arc(x + size / 2, baseY + size / 2 + 2, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = ready ? sig.color : 'rgba(220, 210, 190, 0.5)';
    ctx.lineWidth = ready ? 3 : 1.5;
    ctx.strokeRect(x + 0.5, baseY + 0.5, size - 1, size - 1);
    ctx.font = 'bold 11px Arial';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffe38a';
    ctx.fillText('4', x + 4, baseY + 3);
    if (!ready) {
      ctx.textAlign = 'center';
      ctx.font = 'bold 14px Arial';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(String(Math.ceil(player.signatureCooldown)), x + size / 2, baseY + size / 2 - 5);
    }
    ctx.textAlign = 'center';
    ctx.font = '9px Arial';
    ctx.fillStyle = '#a9a28f';
    ctx.fillText(sig.label, x + size / 2, baseY + size + 3);
  }
  ctx.restore();
}

function drawHealthHeart(x, y, fill) {
  const heartPath = () => {
    ctx.beginPath();
    ctx.moveTo(x + 8.5, y + 16);
    ctx.bezierCurveTo(x + 5, y + 14, x, y + 10, x + 1, y + 5);
    ctx.bezierCurveTo(x + 2, y, x + 7, y, x + 8.5, y + 4);
    ctx.bezierCurveTo(x + 10, y, x + 16, y, x + 16, y + 5);
    ctx.bezierCurveTo(x + 17, y + 10, x + 11, y + 14, x + 8.5, y + 16);
  };
  ctx.save();
  ctx.shadowBlur = 0;
  heartPath();
  ctx.fillStyle = '#281c22';
  ctx.fill();
  ctx.strokeStyle = '#101612';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 243, 223, 0.98)';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  if (fill > 0) {
    ctx.save();
    // The heart icon is drawn smaller than its source, so it keeps smoothing.
    ctx.imageSmoothingEnabled = true;
    ctx.beginPath();
    ctx.rect(x, y, fill * 17, 17);
    ctx.clip();
    if (heartImage.complete && heartImage.naturalWidth > 0) {
      ctx.drawImage(heartImage, x, y, 17, 17);
    } else {
      heartPath();
      ctx.fillStyle = '#df7180';
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.beginPath();
  ctx.moveTo(x + 8.5, y + 4);
  ctx.lineTo(x + 8.5, y + 16);
  ctx.strokeStyle = 'rgba(16, 22, 18, 0.75)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function drawGameHud() {
  if (!character) return;
  const theme = currentFloorTheme();
  const activeConsumable = consumables.find((item) => item.count > 0);
  const activeCompanions = companions.filter((companion) => companion.hp > 0).length;
  const leftHud = { x: 32, y: 2 };
  const rightHud = { x: -4, y: 62 };
  ctx.save();
  drawManaPanel(leftHud.x, leftHud.y + 4, Math.max(170, player.maxHp * 20 + 58), 56);
  const carriedMaterials = Object.keys(materialCatalog).filter((key) => materials[key] > 0);
  drawManaPanel(3, rightHud.y + 3, 54, 94 + carriedMaterials.length * 21);
  const drawIndicatorBorder = (x, y, width, height) => {
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(7, 10, 8, 0.84)';
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = 'rgba(249, 225, 174, 0.96)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
    ctx.restore();
  };
  ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
  ctx.shadowBlur = 4;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 10px Arial';
  ctx.fillStyle = theme.detail;
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#000000';
  ctx.strokeText(`${theme.name} · Floor ${currentFloor}`, leftHud.x + 10, leftHud.y + 16);
  ctx.fillText(`${theme.name} · Floor ${currentFloor}`, leftHud.x + 10, leftHud.y + 16);
  const healthX = leftHud.x + 10;
  for (let index = 0; index < player.maxHp; index += 1) {
    const x = healthX + index * 20;
    drawHealthHeart(x, leftHud.y + 34, clamp(player.hp - index, 0, 1));
  }

  const armorX = healthX + player.maxHp * 20 + 14;
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.lineJoin = 'round';
  ctx.fillStyle = '#e4f1ff';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(armorX + 6, leftHud.y + 34);
  ctx.lineTo(armorX + 13, leftHud.y + 37);
  ctx.lineTo(armorX + 12, leftHud.y + 45);
  ctx.lineTo(armorX + 6, leftHud.y + 52);
  ctx.lineTo(armorX, leftHud.y + 45);
  ctx.lineTo(armorX - 1, leftHud.y + 37);
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
  for (let index = 0; index < player.armor; index += 1) {
    const x = armorX + 18 + index * 14;
    ctx.beginPath();
    ctx.moveTo(x + 5, leftHud.y + 35);
    ctx.lineTo(x + 10, leftHud.y + 42);
    ctx.lineTo(x + 5, leftHud.y + 50);
    ctx.lineTo(x, leftHud.y + 42);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
  }
  ctx.restore();

  const resourcesX = rightHud.x + 12;
  ctx.fillStyle = '#ffe18b';
  ctx.beginPath();
  ctx.arc(resourcesX + 7, rightHud.y + 17, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#101612';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#3f3021';
  ctx.font = 'bold 9px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Z', resourcesX + 7, rightHud.y + 17);
  ctx.textAlign = 'left';
  ctx.font = 'bold 12px Arial';
  ctx.fillStyle = '#ffe18b';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3;
  ctx.strokeText(coins, resourcesX + 18, rightHud.y + 17);
  ctx.fillText(coins, resourcesX + 18, rightHud.y + 17);

  const keyX = resourcesX + 2;
  ctx.translate(0, 21);
  ctx.beginPath();
  ctx.arc(keyX + 5, rightHud.y + 15, 4, 0, Math.PI * 2);
  ctx.moveTo(keyX + 9, rightHud.y + 15);
  ctx.lineTo(keyX + 18, rightHud.y + 15);
  ctx.lineTo(keyX + 18, rightHud.y + 20);
  ctx.strokeStyle = '#101612';
  ctx.lineWidth = 4.5;
  ctx.stroke();
  ctx.strokeStyle = '#ffe18b';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.fillStyle = '#ffe18b';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3;
  ctx.strokeText(keysHeld, keyX + 22, rightHud.y + 17);
  ctx.fillText(keysHeld, keyX + 22, rightHud.y + 17);

  const bombX = resourcesX;
  ctx.translate(0, 21);
  ctx.fillStyle = '#e7f0f1';
  ctx.beginPath();
  ctx.arc(bombX + 7, rightHud.y + 18, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#101612';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#f2c774';
  ctx.fillRect(bombX + 9, rightHud.y + 8, 3, 6);
  ctx.fillStyle = '#f4e6c4';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3;
  ctx.strokeText(bombsHeld, bombX + 18, rightHud.y + 17);
  ctx.fillText(bombsHeld, bombX + 18, rightHud.y + 17);

  const familiarX = resourcesX;
  ctx.translate(0, 21);
  ctx.fillStyle = '#8fe0bd';
  ctx.beginPath();
  ctx.arc(familiarX + 7, rightHud.y + 17, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#101612';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#302538';
  ctx.beginPath();
  ctx.arc(familiarX + 5, rightHud.y + 16, 1.4, 0, Math.PI * 2);
  ctx.arc(familiarX + 9, rightHud.y + 16, 1.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#baf3d6';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3;
  ctx.strokeText(activeCompanions, familiarX + 18, rightHud.y + 17);
  ctx.fillText(activeCompanions, familiarX + 18, rightHud.y + 17);

  // Carried ore and crystals appear beneath the other counts only while there are any.
  ctx.shadowBlur = 0;
  ctx.imageSmoothingEnabled = false;
  for (const key of carriedMaterials) {
    const icon = shopItemIconImages[materialCatalog[key].id];
    ctx.translate(0, 21);
    if (icon?.complete && icon.naturalWidth > 0) ctx.drawImage(icon, familiarX - 1, rightHud.y + 8, 18, 18);
    ctx.fillStyle = '#f4e6c4';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.strokeText(materials[key], familiarX + 20, rightHud.y + 17);
    ctx.fillText(materials[key], familiarX + 20, rightHud.y + 17);
  }
  ctx.textBaseline = 'alphabetic';
  ctx.restore();

  const regen = player.lifestoneRegen;
  if (regen && regen.ticks > 0) {
    const regenIcon = shopItemIconImages.lifestone;
    const panelRight = leftHud.x + Math.max(170, player.maxHp * 20 + 58);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffa0';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    const label = `+${regen.ticks} in ${Math.ceil(regen.timer)}s`;
    ctx.strokeText(label, panelRight - 10, leftHud.y + 16);
    ctx.fillText(label, panelRight - 10, leftHud.y + 16);
    if (regenIcon?.complete && regenIcon.naturalWidth > 0) {
      ctx.drawImage(regenIcon, panelRight - 14 - ctx.measureText(label).width - 14, leftHud.y + 8, 16, 16);
    }
    ctx.restore();
  }

  const boss = enemies.find((enemy) => enemy.boss || enemy.miniBoss);
  if (boss) {
    const width = boss.boss ? 380 : 300;
    const x = (VIEW_W - width) / 2;
    const y = 46;
    drawManaPanel(x, y, width, 29, boss.boss ? '#cf8172' : '#c9a65a');
    ctx.fillStyle = '#372d32';
    ctx.fillRect(x + 8, y + 19, width - 16, 6);
    ctx.fillStyle = boss.boss ? '#d16e84' : '#d99868';
    ctx.fillRect(x + 8, y + 19, (width - 16) * clamp(boss.hp / boss.maxHp, 0, 1), 6);
    ctx.fillStyle = '#f5e8d8';
    ctx.font = 'bold 11px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(boss.boss
      ? `${boss.title}${boss.phase >= 3 ? ' - PHASE III' : boss.phase >= 2 ? ' - PHASE II' : ''}`
      : boss.title || 'MINI-BOSS', VIEW_W / 2, y + 12);
  }
}

function characterCardBounds(pageIndex) {
  return { x: 29 + pageIndex * 180, y: 150, width: 164, height: 238 };
}

function characterStartBounds() {
  return { x: VIEW_W / 2 - 100, y: 490, width: 200, height: 36 };
}

function menuFocusEntries() {
  return [...AUDIO_FOCUS_ORDER, 'help', ...(hasSavedRun() ? ['resume', 'start', 'reset'] : ['start', 'reset'])];
}

function moveMenuFocus(delta) {
  const entries = menuFocusEntries();
  const index = Math.max(0, entries.indexOf(menuFocus));
  menuFocus = entries[(index + delta + entries.length) % entries.length];
  audioFocus = AUDIO_FOCUS_ORDER.includes(menuFocus) ? menuFocus : null;
}

function activateMenuFocus() {
  if (AUDIO_FOCUS_ORDER.includes(menuFocus)) {
    if (menuFocus === 'tts') setTextToSpeech(audioSettings.tts !== true);
    return;
  }
  if (menuFocus === 'help') toggleControlsHelp();
  else if (menuFocus === 'resume' && hasSavedRun()) restoreRun();
  else if (menuFocus === 'reset') requestProgressReset();
  else requestNewRun();
}

function defaultMenuFocus() {
  return hasSavedRun() ? 'resume' : 'start';
}

// Starting over replaces the saved descent, so that takes a second press.
function requestNewRun() {
  if (hasSavedRun() && isCharacterUnlocked(characterRoster[selectedIndex]) && newRunConfirmTimer <= 0) {
    newRunConfirmTimer = 4;
    showMessage('Start a new descent? Your saved descent will be lost. Select Descend again to confirm.', 4);
    return;
  }
  newRunConfirmTimer = 0;
  beginRun();
}

function openPrologue() {
  if (mode !== 'select') return;
  stopPrologueNarration();
  prologuePage = 0;
  mode = 'prologue';
  updateHud();
}

// Below the music and effects controls on the delver ledger.
function prologueReplayBounds() {
  return { x: 24, y: 124, width: 170, height: 22 };
}

// In the margins beside the row of delver cards.
function rosterPageButtonBounds(direction) {
  return { x: direction < 0 ? 2 : VIEW_W - 26, y: 247, width: 24, height: 44 };
}

function changeRosterPage(direction) {
  const pageCount = Math.ceil(characterRoster.length / rosterPageSize);
  const page = (Math.floor(selectedIndex / rosterPageSize) + direction + pageCount) % pageCount;
  selectedIndex = page * rosterPageSize;
  updateHud();
}

function resetButtonBounds() {
  return { x: 29, y: 498, width: 190, height: 28 };
}

function requestProgressReset() {
  if (mode !== 'select') return;
  if (resetConfirmTimer > 0) {
    resetAllProgress();
    return;
  }
  resetConfirmTimer = 5;
  showMessage('Click RESET again within 5 seconds to erase every unlock, coin, and saved run.', 5);
}

function codexButtonBounds() {
  return { x: VIEW_W - 174, y: 80, width: 150, height: 30 };
}

function openCodex() {
  if (mode !== 'select') return;
  mode = 'codex';
  codexTab = 'items';
  codexScroll = 0;
  updateHud();
}

function closeCodex() {
  if (mode !== 'codex') return;
  mode = 'select';
  updateHud();
}

function toggleCodexTab(direction = 1) {
  const tabs = ['items', 'enemies', 'lore'];
  codexTab = tabs[(tabs.indexOf(codexTab) + direction + tabs.length) % tabs.length];
  codexScroll = 0;
}

function codexEntries() {
  if (codexTab === 'items') {
    return shopItemCatalog.filter((item) => save.discoveredItemIds.includes(item.id) ||
      save.unlockedItemIds.includes(item.id));
  }
  if (codexTab === 'lore') return manaLoreRelics.map((relic) => ({ ...relic, kind: 'lore' }));
  const enemyMoves = {
    bandit: ['arrow-shot'],
    banditlord: ['arrow-shot', 'fire-burst'],
    jacko: ['fire-burst'],
    wisp: ['lightning-shot'],
    'spore-sower': ['spore-burst'],
  };
  const moveNames = {
    'arrow-shot': 'Arrow volley',
    'fire-burst': 'Fire burst',
    'lightning-shot': 'Lightning shot',
    'spore-burst': 'Spore burst',
  };
  return save.discoveredEnemyIds.map((kind) => ({
    id: kind,
    name: monsterDisplayName(kind),
    description: [({
      bandit: 'A road fighter. Study their arrows to unlock the Trail-Worn Bow.',
      'banditlord': 'Captain of the road bandits, who answers any threat with a spreading burst of fire.',
      wisp: 'A drifting spirit that hurls crackling bolts of lightning.',
      'spore-sower': 'A fungal caster whose seed orbs burst into a ring of spores.',
    }[kind] || 'Encountered during a descent.'),
    ...((enemyMoves[kind] || []).filter((abilityId) => save.discoveredEnemyAbilityIds.includes(abilityId))
      .map((abilityId) => `Witnessed: ${moveNames[abilityId]}.`))].join(' '),
    kind: 'enemy',
  }));
}

function resumeRunBounds() {
  return { x: VIEW_W / 2 - 120, y: 451, width: 240, height: 30 };
}

function prologueButtonBounds(direction) {
  return { x: direction < 0 ? 94 : VIEW_W - 214, y: 458, width: 120, height: 38 };
}

function advancePrologue(direction) {
  if (mode !== 'prologue' || ttsPromptActive()) return;
  if (direction > 0 && prologuePage === prologuePages.length - 1) {
    stopPrologueNarration();
    // Later visits open on the delver ledger; the prologue stays available from there.
    if (!save.introducedChapters.includes('prologue')) {
      save.introducedChapters.push('prologue');
      persistSave();
    }
    mode = 'select';
    menuFocus = defaultMenuFocus();
    updateHud();
    showMessage('Prologue complete. Choose a delver to begin.', 2.5);
    return;
  }
  if (prologueNarrationNeedsGesture) {
    const started = startPrologueNarration();
    if (started || prologueSpeechFallbackActive) {
      showMessage('Narration started. Continue when ready.', 3);
      return;
    }
  }
  const nextPage = clamp(prologuePage + direction, 0, prologuePages.length - 1);
  if (nextPage === prologuePage) {
    startPrologueNarration();
    return;
  }
  stopPrologueNarration();
  prologuePage = nextPage;
  startPrologueNarration();
}

function countWrappedLines(text, maxWidth) {
  let line = '';
  let count = 1;
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      line = word;
      count += 1;
    } else {
      line = candidate;
    }
  }
  return count;
}

function wrapCanvasText(text, x, y, maxWidth, lineHeight) {
  const words = text.split(/\s+/);
  let line = '';
  let lineNumber = 0;
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      ctx.fillText(line, x, y + lineNumber * lineHeight);
      line = word;
      lineNumber += 1;
    } else {
      line = candidate;
    }
  }
  if (line) ctx.fillText(line, x, y + lineNumber * lineHeight);
  return lineNumber + 1;
}

function drawPrologue() {
  const page = prologuePages[prologuePage];
  ctx.fillStyle = '#161b1a';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = '#283a31';
  ctx.fillRect(0, 0, VIEW_W, 98);
  ctx.fillStyle = '#d9bd83';
  ctx.font = 'bold 13px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(`THE MANA WORLD  /  ${page.heading}`, VIEW_W / 2, 54);
  ctx.fillStyle = '#f2e3c4';
  ctx.font = 'bold 30px Georgia';
  ctx.fillText(page.title, VIEW_W / 2, 150);
  ctx.fillStyle = '#d6d0be';
  ctx.font = '18px Arial';
  ctx.textAlign = 'left';
  wrapCanvasText(page.text, 140, 218, 680, 32);
  ctx.fillStyle = '#b9c8b3';
  ctx.font = '13px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(`${prologuePage + 1} / ${prologuePages.length}`, VIEW_W / 2, 425);
  const previous = prologueButtonBounds(-1);
  const next = prologueButtonBounds(1);
  for (const [bounds, label] of [[previous, 'BACK'], [next, prologuePage === prologuePages.length - 1 ? 'DELVER ROSTER' : 'CONTINUE']]) {
    ctx.fillStyle = '#55452e';
    ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
    ctx.strokeStyle = '#d9bd83';
    ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
    ctx.fillStyle = '#fff0d1';
    ctx.font = 'bold 13px Arial';
    ctx.fillText(label, bounds.x + bounds.width / 2, bounds.y + 24);
  }
  ctx.fillStyle = '#c5b9a6';
  ctx.font = '12px Arial';
  ctx.fillText('Use ← / →, A / D, or the controller D-pad to read the prologue.', VIEW_W / 2, 520);
  drawAudioPanel();
  if (ttsPromptActive()) drawTtsPrompt();
}

function drawChapter() {
  const card = activeChapter;
  if (!card) return;
  ctx.fillStyle = '#161b1a';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = '#283a31';
  ctx.fillRect(0, 0, VIEW_W, 98);
  ctx.fillStyle = '#d9bd83';
  ctx.font = 'bold 13px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(`${card.kind === 'region' ? 'NEW MAP DISCOVERED' : 'NEW DELVER UNLOCKED'}  /  ${card.heading}`, VIEW_W / 2, 54);
  ctx.fillStyle = '#f2e3c4';
  ctx.font = 'bold 30px Georgia';
  ctx.fillText(card.title, VIEW_W / 2, 150);
  ctx.fillStyle = '#d6d0be';
  ctx.font = '18px Arial';
  ctx.textAlign = 'left';
  wrapCanvasText(card.text, 140, 218, 680, 32);
  const next = prologueButtonBounds(1);
  ctx.fillStyle = '#55452e';
  ctx.fillRect(next.x, next.y, next.width, next.height);
  ctx.strokeStyle = '#d9bd83';
  ctx.strokeRect(next.x, next.y, next.width, next.height);
  ctx.fillStyle = '#fff0d1';
  ctx.font = 'bold 13px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('CONTINUE', next.x + next.width / 2, next.y + 24);
  ctx.fillStyle = '#c5b9a6';
  ctx.font = '12px Arial';
  ctx.fillText(narrationActive()
    ? 'Enter, Space, a click, or A continues. The narrator reads each entry aloud.'
    : 'Enter, Space, a click, or A continues.', VIEW_W / 2, 520);
}

// The weapon a class fights with, as an icon in its card's corner (a ? for the random delver).
const CLASS_WEAPON_COLORS = { melee: '#e58a64', bow: '#94d47e', magic: '#7fc8ff' };

function drawClassWeaponBadge(entry, x, y) {
  const size = 34;
  const color = entry.random ? '#d9c796' : CLASS_WEAPON_COLORS[entry.startingStyle] || '#d9c796';
  ctx.save();
  ctx.fillStyle = 'rgba(12, 14, 12, 0.85)';
  ctx.fillRect(x, y, size, size);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);
  const id = weaponCatalog.find((weapon) => weapon.base && weapon.family === entry.startingStyle)?.id;
  const art = !entry.random && id ? shopItemIconImages[`weapon-${id}`] : null;
  if (art?.complete && art.naturalWidth) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(art, x + 3, y + 3, size - 6, size - 6);
  } else {
    ctx.fillStyle = color;
    ctx.font = 'bold 20px Georgia';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(entry.random ? '?' : BRANCH_HEART_ICONS[entry.startingStyle] || '?', x + size / 2, y + size / 2 + 1);
  }
  ctx.restore();
}

function drawCharacterSelect() {
  ctx.fillStyle = '#20221d';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  drawManaPanel(16, 18, VIEW_W - 32, 104);
  ctx.fillStyle = '#efd4a0';
  ctx.font = 'bold 29px Georgia';
  ctx.textAlign = 'center';
  ctx.fillText('THE MANA WORLD  /  DELVER LEDGER', VIEW_W / 2, 72);
  ctx.fillStyle = '#c8cbbd';
  ctx.font = '14px Arial';
  const pageStart = Math.floor(selectedIndex / rosterPageSize) * rosterPageSize;
  const pageNumber = Math.floor(pageStart / rosterPageSize);
  ctx.fillText(`Page ${pageNumber + 1} / ${Math.ceil(characterRoster.length / rosterPageSize)}  •  ← / → selects delvers`, VIEW_W / 2, 105);
  if (lastInputMode === 'touch') {
    ctx.font = 'bold 32px Arial';
    ctx.fillText('‹', 35, 270);
    ctx.fillText('›', VIEW_W - 35, 270);
  }
  // Touch shows its own swipe arrows; mouse and controller get the page buttons.
  if (lastInputMode !== 'touch') for (const direction of [-1, 1]) {
    const pageButton = rosterPageButtonBounds(direction);
    ctx.fillStyle = pointInBounds(pageButton) ? '#52664f' : '#30443b';
    ctx.fillRect(pageButton.x, pageButton.y, pageButton.width, pageButton.height);
    ctx.strokeStyle = '#a5c79b';
    ctx.lineWidth = 1;
    ctx.strokeRect(pageButton.x, pageButton.y, pageButton.width, pageButton.height);
    ctx.fillStyle = '#e4f0d7';
    ctx.font = 'bold 18px Arial';
    ctx.fillText(direction < 0 ? '‹' : '›', pageButton.x + pageButton.width / 2, pageButton.y + 28);
  }
  const prologueButton = prologueReplayBounds();
  ctx.fillStyle = pointInBounds(prologueButton) ? '#52664f' : '#30443b';
  ctx.fillRect(prologueButton.x, prologueButton.y, prologueButton.width, prologueButton.height);
  ctx.strokeStyle = '#a5c79b';
  ctx.lineWidth = 1;
  ctx.strokeRect(prologueButton.x, prologueButton.y, prologueButton.width, prologueButton.height);
  ctx.fillStyle = '#e4f0d7';
  ctx.font = 'bold 11px Arial';
  ctx.fillText(lastInputMode === 'controller' ? 'PROLOGUE  [LB]' : 'PROLOGUE  [P]',
    prologueButton.x + prologueButton.width / 2, prologueButton.y + 15);
  ctx.font = '14px Arial';
  const codexButton = codexButtonBounds();
  ctx.fillStyle = pointer.x >= codexButton.x && pointer.x <= codexButton.x + codexButton.width &&
    pointer.y >= codexButton.y && pointer.y <= codexButton.y + codexButton.height ? '#52664f' : '#30443b';
  ctx.fillRect(codexButton.x, codexButton.y, codexButton.width, codexButton.height);
  ctx.strokeStyle = '#a5c79b';
  ctx.lineWidth = 1;
  ctx.strokeRect(codexButton.x, codexButton.y, codexButton.width, codexButton.height);
  ctx.fillStyle = '#e4f0d7';
  ctx.font = 'bold 12px Arial';
  ctx.fillText('FIELD CODEX  [K]', codexButton.x + codexButton.width / 2, codexButton.y + 20);
  const tutorialButton = tutorialButtonBounds();
  const overTutorial = pointer.x >= tutorialButton.x && pointer.x <= tutorialButton.x + tutorialButton.width &&
    pointer.y >= tutorialButton.y && pointer.y <= tutorialButton.y + tutorialButton.height;
  ctx.fillStyle = overTutorial ? '#7a6a3a' : '#5a4d2a';
  ctx.fillRect(tutorialButton.x, tutorialButton.y, tutorialButton.width, tutorialButton.height);
  ctx.strokeStyle = '#e0c77c';
  ctx.strokeRect(tutorialButton.x, tutorialButton.y, tutorialButton.width, tutorialButton.height);
  ctx.fillStyle = '#fff1c9';
  ctx.fillText(lastInputMode === 'controller' ? `HOW TO PLAY  [${padLabels().y}]` : 'HOW TO PLAY  [H]',
    tutorialButton.x + tutorialButton.width / 2, tutorialButton.y + 20);
  const controlsBtn = controlsButtonBounds();
  ctx.fillStyle = pointInBounds(controlsBtn) ? '#52664f' : '#30443b';
  ctx.fillRect(controlsBtn.x, controlsBtn.y, controlsBtn.width, controlsBtn.height);
  ctx.strokeStyle = '#a5c79b';
  ctx.strokeRect(controlsBtn.x, controlsBtn.y, controlsBtn.width, controlsBtn.height);
  ctx.fillStyle = '#e4f0d7';
  ctx.font = 'bold 12px Arial';
  ctx.fillText(lastInputMode === 'controller' ? `CONTROLS  [${padLabels().back || 'Back'}]` : 'CONTROLS  [C]',
    controlsBtn.x + controlsBtn.width / 2, controlsBtn.y + 19);
  const helpBtn = helpButtonBounds();
  ctx.fillStyle = pointInBounds(helpBtn) ? '#52664f' : '#30443b';
  ctx.fillRect(helpBtn.x, helpBtn.y, helpBtn.width, helpBtn.height);
  ctx.strokeStyle = '#a5c79b';
  ctx.strokeRect(helpBtn.x, helpBtn.y, helpBtn.width, helpBtn.height);
  ctx.fillStyle = '#e4f0d7';
  ctx.font = 'bold 12px Arial';
  ctx.fillText(`HELP: ${controlsHelpVisible ? 'ON' : 'OFF'}`, helpBtn.x + helpBtn.width / 2, helpBtn.y + 19);

  characterRoster.slice(pageStart, pageStart + rosterPageSize).forEach((entry, pageIndex) => {
    const index = pageStart + pageIndex;
    const unlocked = isCharacterUnlocked(entry);
    const bounds = characterCardBounds(pageIndex);
    const x = bounds.x + bounds.width / 2;
    const y = 238;
    const hovered = pointer.x >= bounds.x && pointer.x <= bounds.x + bounds.width &&
      pointer.y >= bounds.y && pointer.y <= bounds.y + bounds.height;
    ctx.fillStyle = index === selectedIndex ? '#3a493d' : '#252b27';
    ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
    ctx.strokeStyle = index === selectedIndex || hovered ? '#e9c57e' : '#68776b';
    ctx.lineWidth = 2;
    ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
    ctx.globalAlpha = unlocked ? 1 : 0.38;
    drawClassWeaponBadge(entry, bounds.x + 6, bounds.y + 6);
    drawHumanoid(humanoidSprites[entry.sprite].image, 0, x, y, 0.95, entry.hue);
    drawHead(entry.hairStyle, 'down', x, y, 0.95, wornHat(entry, null));
    ctx.fillStyle = '#f2e8d8';
    ctx.font = 'bold 13px Arial';
    ctx.fillText(entry.name, x, y + 49);
    ctx.font = '11px Arial';
    ctx.fillText(`${entry.className}  •  ${entry.styleLabel}`, x, y + 67);
    const profile = characterProfile(entry);
    const rating = (value) => (value >= 1.3 ? '★★★' : value >= 1.1 ? '★★' : value >= 0.95 ? '★' : '·');
    ctx.fillText(`HP ${startingHearts(entry)}  •  DMG ${entry.damage}  •  SPEED ${Math.round(entry.speed)}`, x, y + 84);
    ctx.font = '10px Arial';
    ctx.fillText(`⚔${rating(profile.melee)} 🏹${rating(Math.max(profile.bow, profile.bowRate))} ✦${rating(profile.magic)}`, x, y + 98);
    ctx.font = '11px Arial';
    ctx.fillStyle = '#d9c796';
    ctx.fillText(entry.trait, x, y + 113, bounds.width - 12);
    ctx.fillStyle = unlocked ? '#a8d39b' : '#dfa5a2';
    ctx.font = 'bold 10px Arial';
    ctx.fillText(unlocked ? 'UNLOCKED' : entry.unlock.toUpperCase(), x, y + 130);
    ctx.globalAlpha = 1;
  });
  ctx.fillStyle = '#d9c796';
  ctx.font = 'bold 12px Arial';
  const selected = characterRoster[selectedIndex];
  const selectedSignature = classSignature(selected);
  ctx.fillText(isCharacterUnlocked(selected)
    ? `${selected.trait}${selectedSignature ? `  ·  ${selectedSignature.label}: ${selectedSignature.desc}` : ''}`
    : `LOCKED  /  ${selected.unlock}`, VIEW_W / 2, 416);
  const ancestry = raceProfiles[selected.raceHead];
  ctx.font = '11px Arial';
  if (!selected.random && ancestry) ctx.fillText(`${ancestry.name}: ${ancestry.trait}`, VIEW_W / 2, 434);
  if (hasSavedRun()) {
    const resume = resumeRunBounds();
    const hoveredResume = pointer.x >= resume.x && pointer.x <= resume.x + resume.width &&
      pointer.y >= resume.y && pointer.y <= resume.y + resume.height;
    ctx.fillStyle = hoveredResume ? '#78603c' : '#55452e';
    ctx.fillRect(resume.x, resume.y, resume.width, resume.height);
    ctx.strokeStyle = '#e9c57e';
    ctx.strokeRect(resume.x, resume.y, resume.width, resume.height);
    ctx.fillStyle = '#fff0d1';
    ctx.font = 'bold 13px Arial';
    ctx.fillText('RESUME SAVED DESCENT', VIEW_W / 2, resume.y + 21);
    if (lastInputMode === 'controller' && menuFocus === 'resume') {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.strokeRect(resume.x - 3, resume.y - 3, resume.width + 6, resume.height + 6);
    }
  } else {
    ctx.fillStyle = '#c5b9a6';
    ctx.font = '12px Arial';
    ctx.fillText('Learn styles and weapons; all your attacks stack. Break cracked walls with bombs.', VIEW_W / 2, 462);
  }
  const start = characterStartBounds();
  const hoveredStart = pointer.x >= start.x && pointer.x <= start.x + start.width &&
    pointer.y >= start.y && pointer.y <= start.y + start.height;
  ctx.fillStyle = hoveredStart ? '#80633a' : '#55452e';
  ctx.fillRect(start.x, start.y, start.width, start.height);
  ctx.strokeStyle = '#e9c57e';
  ctx.lineWidth = 2;
  ctx.strokeRect(start.x, start.y, start.width, start.height);
  ctx.fillStyle = '#fff0d1';
  ctx.font = 'bold 15px Arial';
  ctx.fillText(newRunConfirmTimer > 0 ? 'CONFIRM NEW DESCENT' : 'DESCEND', VIEW_W / 2, start.y + 25);
  const focusBounds = {
    start,
    reset: resetButtonBounds(),
    resume: resumeRunBounds(),
    help: helpButtonBounds(),
  }[menuFocus];
  if (lastInputMode === 'controller' && focusBounds && menuFocus !== 'resume') {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.strokeRect(focusBounds.x - 3, focusBounds.y - 3, focusBounds.width + 6, focusBounds.height + 6);
  }
  const reset = resetButtonBounds();
  ctx.fillStyle = resetConfirmTimer > 0 ? '#6b2b2b' : '#2b2f2c';
  ctx.fillRect(reset.x, reset.y, reset.width, reset.height);
  ctx.strokeStyle = resetConfirmTimer > 0 ? '#e08a8a' : '#68776b';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(reset.x, reset.y, reset.width, reset.height);
  ctx.fillStyle = '#f0d8d8';
  ctx.font = 'bold 11px Arial';
  ctx.fillText(resetConfirmTimer > 0 ? 'SELECT AGAIN TO ERASE ALL' : 'RESET ALL PROGRESS  [Del]', reset.x + reset.width / 2, reset.y + 18);
  drawAudioPanel();
}

function drawCodex() {
  ctx.fillStyle = '#111714';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  drawManaPanel(42, 28, VIEW_W - 84, VIEW_H - 56);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#d9bd83';
  ctx.font = 'bold 13px Arial';
  ctx.fillText('DISCOVERY LEDGER', 70, 58);
  ctx.fillStyle = '#eef0df';
  ctx.font = 'bold 28px Georgia';
  ctx.fillText('Field Codex', 70, 94);
  ctx.fillStyle = '#c4cbbd';
  ctx.font = '12px Arial';
  ctx.fillText(`Descent time ${Math.floor(save.playtimeSeconds / 60)}m ${Math.floor(save.playtimeSeconds % 60)}s`, 70, 116);

  const tabs = [
    { id: 'items', label: 'ITEMS' },
    { id: 'enemies', label: 'ENEMIES' },
    { id: 'lore', label: 'MANA ECHOES' },
  ];
  tabs.forEach((tab, index) => {
    const x = 70 + index * 132;
    ctx.fillStyle = codexTab === tab.id ? '#49634d' : '#28352d';
    ctx.fillRect(x, 132, 112, 28);
    ctx.strokeStyle = codexTab === tab.id ? '#a5c79b' : '#63796a';
    ctx.strokeRect(x, 132, 112, 28);
    ctx.fillStyle = '#e5eadc';
    ctx.font = 'bold 11px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(tab.label, x + 56, 150);
  });

  const entries = codexEntries();
  const visibleEntries = entries.slice(codexScroll, codexScroll + 7);
  if (entries.length === 0) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#bec9bd';
    ctx.font = '15px Arial';
    ctx.fillText(codexTab === 'items'
      ? 'Find an item in a descent to record it here.'
      : codexTab === 'lore' ? 'Recover Mana echoes in each region to unlock a new delver.'
        : 'Meet a creature during a descent to record it here.', 72, 210);
  }
  visibleEntries.forEach((entry, index) => {
    const y = 172 + index * 43;
    ctx.fillStyle = 'rgba(8, 12, 10, 0.6)';
    ctx.fillRect(68, y, VIEW_W - 136, 38);
    if (entry.kind !== 'enemy') drawShopItemIcon(entry, 91, y + 19);
    else {
      ctx.fillStyle = '#98c98e';
      ctx.beginPath();
      ctx.arc(91, y + 19, 10, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f0e8d5';
    ctx.font = 'bold 12px Arial';
    ctx.fillText(entry.name, 116, y + 15, 390);
    ctx.fillStyle = '#c0cbbd';
    ctx.font = '11px Arial';
    const bonuses = entry.kind === 'enemy' || entry.kind === 'lore' ? [] :
      itemEffectTagsFor(entry).filter((tag) => tag !== entry.description);
    ctx.fillText(`${entry.description || 'A newly recorded discovery.'}${bonuses.length ? `  |  ${bonuses.join(', ')}` : ''}`,
      116, y + 30, 620);
    if (entry.kind !== 'enemy') {
      const found = entry.kind === 'lore'
        ? (save.loreRelics || []).includes(entry.id)
        : save.discoveredItemIds.includes(entry.id);
      const status = found ? 'FOUND' : entry.kind === 'lore' ? 'UNFOUND' : 'READY TO FIND';
      ctx.textAlign = 'right';
      ctx.fillStyle = found ? '#a9d79e' : '#e0c77c';
      ctx.font = 'bold 10px Arial';
      ctx.fillText(status, VIEW_W - 78, y + 23);
    }
  });

  ctx.textAlign = 'center';
  ctx.fillStyle = '#c5cebf';
  ctx.font = '12px Arial';
  const collectionProgress = codexTab === 'lore'
    ? ` · ${(save.loreRelics || []).length}/${manaLoreRelics.length} collected` : '';
  ctx.fillText(`${entries.length === 0 ? 0 : codexScroll + 1}-${Math.min(entries.length, codexScroll + 7)} / ${entries.length}${collectionProgress}  ·  ↑/↓ Browse  ·  ←/→ Change tab`, VIEW_W / 2, 480);
  ctx.fillStyle = '#a5c79b';
  ctx.fillText('K / ESC / B  ·  Close', VIEW_W / 2, 500);
}

function controlsActionList() {
  return controlsTab === 'key' ? bindingActions : bindingActions.filter((action) => !action.keyOnly);
}

function controlsTabBounds(tab) {
  return { x: tab === 'key' ? 70 : 230, y: 112, width: 150, height: 24 };
}

function controlsRowBounds(index) {
  return { x: 70, y: 150 + index * CONTROLS_ROW_H, width: 820, height: CONTROLS_ROW_H - 2 };
}

function controlsBackBounds() {
  return { x: VIEW_W / 2 - 65, y: 468, width: 130, height: 28 };
}

function controlsButtonBounds() {
  return { x: VIEW_W - 334, y: 114, width: 150, height: 28 };
}

function helpButtonBounds() {
  return { x: VIEW_W - 494, y: 114, width: 150, height: 28 };
}

function pointInBounds(bounds, x = pointer.x, y = pointer.y) {
  return x >= bounds.x && x <= bounds.x + bounds.width && y >= bounds.y && y <= bounds.y + bounds.height;
}

// ---- Weapon branch screen (opened from a cleared room) and the level-up boon picker ----
const BRANCH_TIER_NUMERALS = ['I', 'II', 'III'];
let branchTab = 'magic';
let branchNotice = '';
let branchNoticeUntil = 0;

function branchEditAllowed() {
  return deathTimer <= 0 && enemies.length === 0;
}

function openBranchScreen() {
  if (mode !== 'playing' || deathTimer > 0) return false;
  if (!branchEditAllowed()) {
    showMessage('Clear the room before changing weapon branches.', 2);
    return false;
  }
  showMap = false;
  showStoryJournal = false;
  const style = currentAttackStyle();
  branchTab = BRANCH_STYLES.includes(style) ? style : 'magic';
  resetBranchMap();
  branchNotice = '';
  for (const key of Object.keys(keys)) keys[key] = false;
  pointer.down = false;
  mode = 'branches';
  branchGuide = null;
  startBranchTour();
  return true;
}

function closeBranchScreen() {
  if (mode !== 'branches') return;
  mode = 'playing';
  branchGuide = null;
  branchTour = null;
  for (const key of Object.keys(keys)) keys[key] = false;
  suppressHeldAttackInput();
  updateHud();
  saveRunState();
  persistSave();
}

// The branch map: each weapon is a cross-section of growth rings. The weapon's heart sits in the middle, its five
// branches swirl outward as root paths of three tier nodes, synergy gems sit between the branches they join, and
// the character walks node to node. Drag or pinch to look around, wheel or +/- to zoom.
const BRANCH_MAP_RINGS = [0, 72, 128, 184];
const BRANCH_MAP_SWIRL = 0.1;
// Spoke order keeps synergy partners side by side; Flurry + Cinder is the one pair that has to reach around Riposte.
const BRANCH_MAP_ORDER = {
  magic: ['prism', 'conduit', 'focus', 'impact', 'miasma'],
  bow: ['quickdraw', 'volley', 'piercer', 'longdraw', 'stormstring'],
  melee: ['windup', 'cleave', 'flurry', 'riposte', 'cinder'],
};
const BRANCH_HEART_ICONS = { melee: '⚔', bow: '➶', magic: '✦' };
const BRANCH_HEART_COLORS = { melee: '#e58a64', bow: '#94d47e' };
const BRANCH_MAP_VIEW = { x: 34, y: 72, width: 620, height: 404 };
const BRANCH_ZOOM_MIN = 0.5;
const BRANCH_ZOOM_MAX = 2.4;
const BRANCH_DRAG_SLOP = 7;
// The Confluence tab lays the three weapon maps out as one, bridged through the middle toward the Trinity.
// Same order as BRANCH_STYLES in playermanager.js (a literal so gameui can load without it in tests).
const BRANCH_TABS = ['melee', 'bow', 'magic', 'confluence'];
const CONFLUENCE_HEARTS = { magic: { x: 0, y: -416 }, melee: { x: -360, y: 208 }, bow: { x: 360, y: 208 } };
const CONFLUENCE_ZOOM_MIN = 0.25;
const CONFLUENCE_START_ZOOM = 0.7;
const CONFLUENCE_PART_ORDER = ['g1', 's1', 's2', 'fusion', 's3', 's4', 'g2'];
const branchMapCache = new Map();
const branchCam = { x: 0, y: 0, zoom: 1 };
let branchCamTarget = null;
let branchMapFocus = 'heart';
const branchToken = { x: 0, y: 0, fromX: 0, fromY: 0, toX: 0, toY: 0, t: 1, duration: 0.2, row: 0 };
const branchPointers = new Map();
let branchDrag = null;
let branchPinch = null;
let branchLastFrame = 0;

function branchMapNodes(style = branchTab) {
  return allBranchMapNodes(style);
}

// Every weapon hangs on an outer rack in the gaps between the spokes, turned against the gem swirl so their paths
// clear the synergy gems; Dual Grip is a small node just below the heart.
const BRANCH_WEAPON_GAPS = [-0.3, 0.1, 0.9, 1.3, 0.5];
const BRANCH_WEAPON_RING = 236;

function allBranchMapNodes(style = branchTab) {
  if (branchMapCache.has(style)) return branchMapCache.get(style);
  if (style === 'confluence') {
    const nodes = confluenceMapNodes();
    branchMapCache.set(style, nodes);
    return nodes;
  }
  const order = BRANCH_MAP_ORDER[style] || skillBranches.filter((branch) => branch.style === style).map((branch) => branch.id);
  const spoke = (index) => -Math.PI / 2 + index * (Math.PI * 2 / order.length);
  const at = (angle, radius) => ({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
  const nodes = [{ id: 'heart', kind: 'heart', x: 0, y: 0, links: [] }];
  nodes.push({ id: 'grip', kind: 'grip', ...at(Math.PI / 2, 45), links: ['heart'] });
  weaponCatalog.filter((entry) => entry.family === style && !entry.base).forEach((entry, index) => {
    const angle = BRANCH_WEAPON_GAPS[index % BRANCH_WEAPON_GAPS.length] * Math.PI - 0.12;
    nodes.push({ id: `weapon:${entry.id}`, kind: 'weapon', weapon: entry, angle,
      ...at(angle, BRANCH_WEAPON_RING), links: ['heart'] });
  });
  order.forEach((id, index) => {
    const branch = branchById(id);
    if (!branch) return;
    for (let tier = 1; tier <= 3; tier += 1) {
      const angle = spoke(index) + BRANCH_MAP_SWIRL * (tier - 1);
      nodes.push({ id: `${id}:${tier}`, kind: 'tier', branch, tier, angle, ...at(angle, BRANCH_MAP_RINGS[tier]),
        links: [tier === 1 ? 'heart' : `${id}:${tier - 1}`] });
    }
  });
  for (const synergy of branchSynergies.filter((entry) => entry.style === style)) {
    const [a, b] = synergy.branches.map((id) => order.indexOf(id));
    if (a < 0 || b < 0) continue;
    const gap = Math.abs(a - b);
    const adjacent = gap === 1 || gap === order.length - 1;
    const mid = Math.atan2(Math.sin(spoke(a)) + Math.sin(spoke(b)), Math.cos(spoke(a)) + Math.cos(spoke(b)));
    // Neighbours meet between their second rings; a pair that has to reach around another branch sits outside it.
    const point = adjacent ? at(mid + BRANCH_MAP_SWIRL, 158) : at(mid - 0.16, 250);
    const tier = adjacent ? 2 : 3;
    nodes.push({ id: `syn:${synergy.id}`, kind: 'synergy', synergy, ...point, outer: !adjacent,
      links: synergy.branches.map((id) => `${id}:${tier}`) });
  }
  branchMapCache.set(style, nodes);
  return nodes;
}

// Map id of a node on the current tab: on the Confluence tab weapon-map nodes carry their style as a prefix.
function branchMapId(style, id) {
  return branchTab === 'confluence' ? `${style}/${id}` : id;
}

// The three weapon maps around their hearts, Dual Grip left out (it has its own spot on every weapon tab), then each
// bridge's seven nodes (a seal at each end) evenly spaced between its two tier III ends, its move pushed outward from its fusion, and the
// Trinity in the middle. Bridge links point back along the chain so each segment is drawn once.
function confluenceMapNodes() {
  const nodes = [];
  for (const style of BRANCH_STYLES) {
    const center = CONFLUENCE_HEARTS[style];
    for (const node of allBranchMapNodes(style)) {
      if (node.kind === 'grip') continue;
      nodes.push({ ...node, id: `${style}/${node.id}`, style, x: node.x + center.x, y: node.y + center.y,
        links: node.links.map((link) => `${style}/${link}`) });
    }
  }
  const tierNodeId = (branchId) => `${branchById(branchId).style}/${branchId}:3`;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const bridge of CONFLUENCE_BRIDGES) {
    const from = byId.get(tierNodeId(bridge.ends[0]));
    const to = byId.get(tierNodeId(bridge.ends[1]));
    if (!from || !to) continue;
    const part = (name) => `cf:${bridge.id}:${name}`;
    CONFLUENCE_PART_ORDER.forEach((name, index) => {
      const t = (index + 1) / (CONFLUENCE_PART_ORDER.length + 1);
      const links = [index === 0 ? from.id : part(CONFLUENCE_PART_ORDER[index - 1])];
      if (index === CONFLUENCE_PART_ORDER.length - 1) links.push(to.id);
      nodes.push({ id: part(name), kind: 'cf', cf: confluenceNode(part(name)),
        x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, links });
    });
    const fusion = nodes.find((node) => node.id === part('fusion'));
    const out = Math.hypot(fusion.x, fusion.y) || 1;
    nodes.push({ id: part('move'), kind: 'cf', cf: confluenceNode(part('move')),
      x: fusion.x + fusion.x / out * 78, y: fusion.y + fusion.y / out * 78, links: [fusion.id] });
  }
  nodes.push({ id: 'cf:trinity', kind: 'cf', cf: confluenceNode('cf:trinity'), x: 0, y: 0,
    links: CONFLUENCE_BRIDGES.map((bridge) => `cf:${bridge.id}:fusion`) });
  return nodes;
}

function branchZoomMin() {
  return branchTab === 'confluence' ? CONFLUENCE_ZOOM_MIN : BRANCH_ZOOM_MIN;
}

function branchMapNode(id, style = branchTab) {
  return branchMapNodes(style).find((node) => node.id === id) || null;
}

// Fits every node, keeping the bottom clear of the socket bar.
function branchMapFitZoom(style = branchTab) {
  const center = branchMapCenter();
  const room = {
    x: BRANCH_MAP_VIEW.width / 2 - 46,
    top: center.y - BRANCH_MAP_VIEW.y - 30,
    bottom: 428 - 40 - center.y,
  };
  let zoom = BRANCH_ZOOM_MAX;
  for (const node of branchMapNodes(style)) {
    if (node.x) zoom = Math.min(zoom, room.x / Math.abs(node.x));
    if (node.y) zoom = Math.min(zoom, (node.y > 0 ? room.bottom : room.top) / Math.abs(node.y));
  }
  return clamp(zoom, branchZoomMin(), BRANCH_ZOOM_MAX);
}

function branchMapCenter() {
  return { x: BRANCH_MAP_VIEW.x + BRANCH_MAP_VIEW.width / 2, y: BRANCH_MAP_VIEW.y + BRANCH_MAP_VIEW.height / 2 - 14 };
}

function branchWorldToScreen(x, y) {
  const center = branchMapCenter();
  return { x: center.x + (x - branchCam.x) * branchCam.zoom, y: center.y + (y - branchCam.y) * branchCam.zoom };
}

function branchScreenToWorld(x, y) {
  const center = branchMapCenter();
  return { x: branchCam.x + (x - center.x) / branchCam.zoom, y: branchCam.y + (y - center.y) / branchCam.zoom };
}

function resetBranchMap() {
  branchMapFocus = 'heart';
  Object.assign(branchToken, { x: 0, y: 0, fromX: 0, fromY: 0, toX: 0, toY: 0, t: 1, row: 0 });
  fitBranchMap();
  if (branchTab === 'confluence') {
    // Start on the main hand's heart, close enough to read; the magnifier button shows the whole grid.
    const family = weaponById(weaponHands.main)?.family;
    const style = BRANCH_STYLES.includes(family) ? family : 'magic';
    const heart = CONFLUENCE_HEARTS[style];
    branchMapFocus = `${style}/heart`;
    Object.assign(branchToken, { x: heart.x, y: heart.y, fromX: heart.x, fromY: heart.y, toX: heart.x, toY: heart.y });
    Object.assign(branchCam, { x: heart.x * 0.5, y: heart.y * 0.5, zoom: CONFLUENCE_START_ZOOM });
    clampBranchCam();
  }
  branchPointers.clear();
  branchDrag = null;
  branchPinch = null;
}

function fitBranchMap() {
  branchCam.x = 0;
  branchCam.y = 0;
  branchCam.zoom = branchMapFitZoom();
  branchCamTarget = null;
}

function zoomBranchMap(factor, screenX = branchMapCenter().x, screenY = branchMapCenter().y) {
  const anchor = branchScreenToWorld(screenX, screenY);
  branchCam.zoom = clamp(branchCam.zoom * factor, branchZoomMin(), BRANCH_ZOOM_MAX);
  const center = branchMapCenter();
  branchCam.x = anchor.x - (screenX - center.x) / branchCam.zoom;
  branchCam.y = anchor.y - (screenY - center.y) / branchCam.zoom;
  branchCamTarget = null;
  clampBranchCam();
}

// Keeps some of the map in view however far the player drags.
function clampBranchCam() {
  const limit = branchMapNodes().reduce((max, node) => Math.max(max, Math.hypot(node.x, node.y)), 0);
  branchCam.x = clamp(branchCam.x, -limit, limit);
  branchCam.y = clamp(branchCam.y, -limit, limit);
}

function focusBranchNode(id, follow = false) {
  const node = branchMapNode(id);
  if (!node) return false;
  branchMapFocus = id;
  const dx = node.x - branchToken.x;
  const dy = node.y - branchToken.y;
  const distance = Math.hypot(dx, dy);
  if (distance > 1) {
    Object.assign(branchToken, { fromX: branchToken.x, fromY: branchToken.y, toX: node.x, toY: node.y, t: 0,
      duration: clamp(distance / 380, 0.14, 0.42),
      row: Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 1 : 3) : (dy < 0 ? 2 : 0) });
  }
  if (follow) branchCamTarget = { x: node.x, y: node.y };
  return true;
}

// Picks the nearest node roughly in the pressed direction, so the stick or D-pad walks the paths.
function moveBranchMapFocus(dx, dy) {
  const nodes = branchMapNodes();
  const from = branchMapNode(branchMapFocus) || nodes[0];
  const length = Math.hypot(dx, dy);
  if (!length) return;
  let best = null;
  let bestScore = Infinity;
  for (const node of nodes) {
    if (node === from) continue;
    const vx = node.x - from.x;
    const vy = node.y - from.y;
    const distance = Math.hypot(vx, vy);
    const cos = (vx * dx + vy * dy) / (distance * length);
    if (cos < 0.34) continue;
    const linked = node.links.includes(from.id) || from.links.includes(node.id);
    const score = distance * (1 + (1 - cos) * 3) * (linked ? 0.8 : 1);
    if (score < bestScore) {
      best = node;
      bestScore = score;
    }
  }
  if (best) focusBranchNode(best.id, true);
}

function focusedMapBranch() {
  return branchMapNode(branchMapFocus)?.branch || null;
}

function branchMapLayout() {
  return {
    tabs: BRANCH_TABS.map((style, index) => ({ style, bounds: { x: 330 + index * 122, y: 26, width: 114, height: 34 } })),
    close: { x: 820, y: 26, width: 96, height: 34 },
    view: BRANCH_MAP_VIEW,
    zoomOut: { x: 44, y: 430, width: 38, height: 36 },
    zoomIn: { x: 88, y: 430, width: 38, height: 36 },
    fit: { x: 132, y: 430, width: 50, height: 36 },
    sockets: Array.from({ length: BRANCH_SLOTS }, (_, index) => ({ x: 284 + index * 44, y: 428, width: 38, height: 38 })),
    toggle: { x: 676, y: 410, width: 112, height: 52 },
    unlock: { x: 796, y: 410, width: 112, height: 52 },
    unweave: { x: 676, y: 368, width: 232, height: 34 },
  };
}

function branchNodeRadius(node) {
  if (node.kind === 'cf') return { stat: 11, seal: 12, fusion: 16, move: 15, trinity: 24 }[node.cf.kind] || 12;
  return node.kind === 'heart' ? 22 : node.kind === 'synergy' ? 11 : node.kind === 'grip' ? 12
    : node.kind === 'weapon' ? 16 : node.tier === 1 ? 16 : 13;
}

function branchNodeAt(x, y) {
  const view = BRANCH_MAP_VIEW;
  if (x < view.x || x > view.x + view.width || y < view.y || y > view.y + view.height) return null;
  let best = null;
  let bestDistance = Infinity;
  for (const node of branchMapNodes()) {
    const screen = branchWorldToScreen(node.x, node.y);
    const distance = Math.hypot(screen.x - x, screen.y - y);
    if (distance < Math.max(22, branchNodeRadius(node) + 8) && distance < bestDistance) {
      best = node;
      bestDistance = distance;
    }
  }
  return best;
}

function branchItemNames(branch) {
  return branch.items.map((id) => shopItemCatalog.find((item) => item.id === id)?.name || id);
}

function setBranchNotice(text) {
  branchNotice = text;
  branchNoticeUntil = performance.now() + 3200;
  branchGuide = null;
}

// Guidance spotlight: when something can't be done (or on the first visit, as a short tour), the rest of the screen
// dims slightly and a bobbing arrow points at what is needed. A target is a screen rect or a map node id.
const BRANCH_GUIDE_MS = 3600;
const BRANCH_GUIDE_RECTS = {
  status: { x: 36, y: 482, width: 294, height: 20 },
  sockets: { x: 280, y: 424, width: 134, height: 46 },
  needs: { x: 670, y: 104, width: 240, height: 20 },
};
let branchGuide = null;
let branchTour = null;

function pointBranchGuide(target, label) {
  const now = performance.now();
  branchGuide = { ...target, label, start: now, until: target.hold ? Infinity : now + BRANCH_GUIDE_MS };
  if (target.node) {
    const node = branchMapNode(target.node);
    if (node) branchCamTarget = { x: node.x, y: node.y };
  }
}

function dismissBranchGuide() {
  if (branchTour) return advanceBranchTour();
  branchGuide = null;
}

// First visit: the token, the suggested path, the highlight button and the grow button, one tap at a time.
function branchTourSteps() {
  const layout = branchMapLayout();
  const first = branchSuggestion[0] || suggestedPath(branchTab)[0];
  return [
    { node: branchMapFocus, label: 'This is you. Tap a node (or walk) to look at it.' },
    first ? { node: first.mapId, label: 'Gold numbers are a suggested path for how you play. Any other node is fine too.' } : null,
    { rect: layout.toggle, label: 'ON/OFF highlights a branch. Only highlighted branches (up to 3) work.' },
    { rect: layout.unlock, label: 'Grow: stats cost ore, crystal or zeny. Padlocked abilities cost Life Stones.' },
    { rect: BRANCH_GUIDE_RECTS.status, label: 'Your career XP, bank and pouch. Growing needs enough XP first.' },
  ].filter(Boolean);
}

function startBranchTour() {
  if (branchState().guided) return;
  branchTour = { step: -1, steps: branchTourSteps() };
  advanceBranchTour();
}

function advanceBranchTour() {
  if (!branchTour) return;
  branchTour.step += 1;
  const step = branchTour.steps[branchTour.step];
  if (!step) {
    branchTour = null;
    branchGuide = null;
    branchState().guided = true;
    persistBranchState();
    return;
  }
  pointBranchGuide({ ...step, hold: true }, `${step.label}  (${branchTour.step + 1}/${branchTour.steps.length})`);
}

// The map node a locked Confluence node is waiting on: an unowned link (a tier III end or bridge node).
function confluenceBlockerMapId(cf) {
  const links = cf.kind === 'trinity' ? cf.links.filter((id) => !confluenceOwned(id)) : cf.links;
  const id = links.find((link) => !confluenceOwned(link)) || links[0];
  if (!id) return null;
  if (!id.startsWith('tier:')) return id;
  const branch = branchById(id.slice(5));
  return branch ? `${branch.style}/${branch.id}:3` : null;
}

function guideGrowthBlock(cost) {
  const block = growthBlock(cost);
  if (block === 'gate') pointBranchGuide({ rect: BRANCH_GUIDE_RECTS.status }, `Need ${growthXpRequirement()} career XP: earn it in runs`);
  else if (block === 'short') {
    const pouch = carriedMaterials() || {};
    const missing = COST_PARTS.filter(([key]) => (cost[key] || 0) > (key === 'zeny' ? bankedZenyBalance() : pouch[key] || 0))
      .map(([key, one, many]) => `${cost[key]} ${cost[key] === 1 ? one : many}`);
    pointBranchGuide({ rect: BRANCH_GUIDE_RECTS.status }, `Short: need ${missing.join(' + ')}`);
  }
}

function setBranchTab(style) {
  if (!BRANCH_TABS.includes(style) || style === branchTab) return;
  branchTab = style;
  branchGuide = null;
  resetBranchMap();
}

function stepBranchTab(direction) {
  const index = BRANCH_TABS.indexOf(branchTab);
  setBranchTab(BRANCH_TABS[(index + direction + BRANCH_TABS.length) % BRANCH_TABS.length]);
}

function branchBaseWeaponId(style = branchTab) {
  return weaponCatalog.find((entry) => entry.base && entry.family === style)?.id || null;
}

// The weapon a focused node stands for: the heart is the family's base weapon.
function focusedWeaponId() {
  const node = branchMapNode(branchMapFocus);
  if (node?.kind === 'heart') return branchBaseWeaponId(node.style || branchTab);
  return node?.kind === 'weapon' ? node.weapon.id : null;
}

function weaponPowerText(id) {
  const rank = weaponProficiencyRank(id);
  if (rank === 'learned') return 'full power';
  return `${Math.round(WEAPON_PROFICIENCY[rank] * 100)}% power until ${rank === 'unfound' ? 'found and learned' : 'learned'}`;
}

function setFocusedWeaponHand(slot) {
  const id = focusedWeaponId();
  const entry = weaponById(id);
  if (!entry) return;
  if (weaponHands[slot] === id) {
    setBranchNotice(`${entry.name} is already in your ${slot === 'main' ? 'main' : 'off'} hand.`);
    return;
  }
  setWeaponHand(slot, id);
  const power = weaponProficiency(id) < 1 ? ` (${weaponPowerText(id)})` : '';
  setBranchNotice(slot === 'main' ? `${entry.name} in your main hand${power}.`
    : dualGripOwned() ? `${entry.name} in your off hand${power}: it attacks on its own at foes you look at.`
      : `${entry.name} in your off hand${power}, sheathed. Swap to use it, or grow Dual Grip to wield both.`);
  playSound('som:alteration/skillup.ogg', 0.18);
}

// Found but not yet learned: the weapon's secondary action is Learn.
function focusedLearnableWeapon() {
  const id = focusedWeaponId();
  return id && weaponFound(id) && !weaponLearned(id) ? weaponById(id) : null;
}

function learnFocusedWeapon() {
  const entry = focusedLearnableWeapon();
  if (!entry) return;
  const result = learnWeapon(entry.id);
  if (result === 'learned') {
    setBranchNotice(`${entry.name} learned: full power.`);
    playSound('som:alteration/skillup.ogg', 0.3);
  } else if (result === 'gate' || result === 'short') {
    setBranchNotice(growthBlockedNotice(WEAPON_LEARN_COST, `Learning the ${entry.name}`));
    guideGrowthBlock(WEAPON_LEARN_COST);
  }
}

function toggleFocusedBranch() {
  const node = branchMapNode(branchMapFocus);
  if (focusedWeaponId()) return setFocusedWeaponHand('main');
  if (node?.kind === 'grip') {
    setBranchNotice(dualGripOwned() ? 'Dual Grip grown: your off hand attacks on its own.' : 'Grow Dual Grip to wield both hands at once.');
    return;
  }
  if (node?.kind === 'cf') {
    setBranchNotice('Confluence nodes need no slot: once grown they always count.');
    return;
  }
  const branch = focusedMapBranch();
  if (!branch) {
    setBranchNotice('Walk onto a branch to highlight it.');
    return;
  }
  const result = toggleBranch(branch.id);
  if (result === 'full') {
    setBranchNotice(`All ${BRANCH_SLOTS} ${BRANCH_STYLE_NAMES[branch.style]} slots are in use. Turn one off first.`);
    pointBranchGuide({ rect: BRANCH_GUIDE_RECTS.sockets }, 'Slots full: tap one here, then turn it OFF');
  } else if (result === 'on') {
    setBranchNotice(branchPowered(branch) ? `${branch.name} highlighted.`
      : `${branch.name} highlighted. Dormant until you find ${branchItemNames(branch).join(' or ')}.`);
    if (!branchPowered(branch)) pointBranchGuide({ rect: BRANCH_GUIDE_RECTS.needs }, 'Dormant: find this item in a run to power it');
    playSound('som:alteration/skillup.ogg', 0.18);
  } else if (result === 'off') {
    setBranchNotice(`${branch.name} turned off.`);
  }
}

const COST_PARTS = [
  ['ironOre', 'Iron Ore', 'Iron Ore', 'ore'],
  ['darkCrystal', 'Dark Crystal', 'Dark Crystals', 'crystal'],
  ['lifeStone', 'Life Stone', 'Life Stones', 'stone'],
  ['zeny', 'zeny', 'zeny', 'z'],
];

// "2 Iron Ore + 40 zeny", or "2 ore 40 z" on a button.
function costLabel(cost, short = false) {
  return COST_PARTS.filter(([key]) => cost?.[key]).map(([key, one, many, abbreviation]) =>
    `${cost[key]} ${short ? abbreviation : cost[key] === 1 ? one : many}`).join(short ? ' ' : ' + ');
}

// Why a growth could not be paid: the career XP gate, or the price in carried materials and banked zeny.
function growthBlockedNotice(cost, what) {
  if (growthBlock(cost) === 'gate') {
    return `${what} needs ${growthXpRequirement()} career XP (you have ${Math.floor(branchState().xp)}).`;
  }
  if (cost.lifeStone) return `${what} is an ability lock: it takes ${costLabel(cost)}. Elites, minibosses, caches and boss relics drop them.`;
  return `${what} costs ${costLabel(cost)}. Ore and crystals come from your pouch, zeny from the bank.`;
}

function confluenceNodeName(cf) {
  if (cf.kind === 'stat') return CONFLUENCE_STATS[cf.stat].name;
  if (cf.kind === 'seal') return CONFLUENCE_SEAL.name;
  if (cf.kind === 'fusion') return cf.fusion.name;
  if (cf.kind === 'move') return cf.move.name;
  return CONFLUENCE_TRINITY.name;
}

function confluenceNodeIcon(cf) {
  if (cf.kind === 'stat') return CONFLUENCE_STATS[cf.stat].icon;
  if (cf.kind === 'seal') return CONFLUENCE_SEAL.icon;
  if (cf.kind === 'fusion') return cf.fusion.icon;
  if (cf.kind === 'move') return cf.move.icon;
  return CONFLUENCE_TRINITY.icon;
}

function growFocusedConfluence(cf) {
  const name = confluenceNodeName(cf);
  const result = growConfluenceNode(cf.id);
  if (result === 'grown') {
    setBranchNotice(cf.kind === 'trinity' ? 'The Trinity is yours: every fusion now works whatever you hold.'
      : cf.kind === 'seal' ? 'Bridge Seal unsealed: the bridge is open.' : `${name} grown!`);
    playSound('som:alteration/skillup.ogg', 0.3);
  } else if (result === 'known') setBranchNotice(`${name} is already grown.`);
  else if (result === 'locked') {
    setBranchNotice(cf.kind === 'trinity' ? 'The Trinity needs all three fusions grown.'
      : `Grow a linked node first. Bridges start from a tier III ${cf.bridge.styles.map((style) => BRANCH_STYLE_NAMES[style]).join(' or ')} branch.`);
    const blocker = confluenceBlockerMapId(cf);
    if (blocker) pointBranchGuide({ node: blocker }, cf.kind === 'trinity' ? 'Grow this fusion first' : 'Grow this first');
  } else if (result === 'gate' || result === 'short') {
    setBranchNotice(growthBlockedNotice(cf.cost, name));
    guideGrowthBlock(cf.cost);
  }
}

function unlockFocusedBranch() {
  const node = branchMapNode(branchMapFocus);
  if (node?.kind === 'cf') return growFocusedConfluence(node.cf);
  const weaponId = focusedWeaponId();
  if (weaponId) return setFocusedWeaponHand('off');
  if (node?.kind === 'grip') {
    const result = growDualGrip();
    if (result === 'learned') {
      setBranchNotice('Dual Grip grown! Your off hand now attacks foes you look toward.');
      playSound('som:alteration/skillup.ogg', 0.3);
    } else if (result === 'gate' || result === 'short') {
      setBranchNotice(growthBlockedNotice(DUAL_GRIP_COST, 'Dual Grip'));
      guideGrowthBlock(DUAL_GRIP_COST);
    } else {
      setBranchNotice('Dual Grip is already grown.');
    }
    return;
  }
  const branch = focusedMapBranch();
  if (!branch) {
    setBranchNotice('Walk onto a branch to grow it.');
    return;
  }
  const cost = nextBranchTierCost(branch.id);
  const result = unlockBranchTier(branch.id);
  if (result === 'unlocked') {
    const tier = branchTier(branch.id);
    setBranchNotice(`${branch.name} tier ${BRANCH_TIER_NUMERALS[tier - 1]} unlocked!`);
    focusBranchNode(branchMapId(branch.style, `${branch.id}:${tier}`), true);
    playSound('som:alteration/skillup.ogg', 0.3);
  } else if (result === 'gate' || result === 'short') {
    setBranchNotice(growthBlockedNotice(cost, `${branch.name} tier ${BRANCH_TIER_NUMERALS[branchTier(branch.id)]}`));
    guideGrowthBlock(cost);
  } else {
    setBranchNotice(`${branch.name} is fully grown.`);
  }
}

// The button under the info panel: Learn on a found weapon, otherwise Unweave when a rune can undo the node.
function branchSecondaryShown() {
  return Boolean(focusedLearnableWeapon()) || (weaponState().runes > 0 && Boolean(focusedUnweave()));
}

// What an Unweaving Rune would undo on the focused node, or null.
function focusedUnweave() {
  const node = branchMapNode(branchMapFocus);
  const target = (kind, id, name) => {
    const found = unweaveTarget(kind, id);
    return found ? { kind, id, name, blocked: Boolean(found.blocked) } : null;
  };
  if (node?.kind === 'tier') return target('tier', node.branch.id, node.branch.name);
  if (node?.kind === 'weapon') return target('weapon', node.weapon.id, node.weapon.name);
  if (node?.kind === 'grip') return target('grip', 'grip', 'Dual Grip');
  if (node?.kind === 'cf') return target('confluence', node.cf.id, confluenceNodeName(node.cf));
  return null;
}

function unweaveFocusedNode() {
  if (focusedLearnableWeapon()) return learnFocusedWeapon();
  const target = focusedUnweave();
  if (!(weaponState().runes > 0)) {
    setBranchNotice('Unweaving needs an Unweaving Rune. They rarely drop in reward rooms and from guardians.');
    return;
  }
  if (!target) {
    setBranchNotice('Walk onto a grown tier, a learned weapon, Dual Grip or a Confluence node to unweave it.');
    return;
  }
  if (target.blocked) {
    setBranchNotice(`Confluence nodes still grow from ${target.name}. Unweave the ones further out first.`);
    return;
  }
  const tierBefore = target.kind === 'tier' ? branchTier(target.id) : 0;
  if (unweaveNode(target.kind, target.id) !== 'done') return;
  setBranchNotice(target.kind === 'tier'
    ? `${target.name} tier ${BRANCH_TIER_NUMERALS[tierBefore - 1]} unwoven and refunded.`
    : `${target.name} unwoven and refunded.`);
  if (target.kind === 'tier') focusBranchNode(branchMapId(branchById(target.id).style, `${target.id}:${branchTier(target.id)}`), true);
  playSound('som:alteration/skillup.ogg', 0.2);
}

function branchTourActive() {
  return Boolean(branchTour);
}

function skipBranchTour() {
  if (!branchTour) return;
  branchTour.step = branchTour.steps.length;
  advanceBranchTour();
}

function handleBranchKey(event, key) {
  if (branchTour) {
    if (event.key === 'Escape') skipBranchTour();
    else advanceBranchTour();
    return;
  }
  branchGuide = null;
  if (event.key === 'Escape' || actionForKey(key) === 'branches') closeBranchScreen();
  else if (event.key === 'ArrowUp' || key === 'w') moveBranchMapFocus(0, -1);
  else if (event.key === 'ArrowDown' || key === 's') moveBranchMapFocus(0, 1);
  else if (event.key === 'ArrowLeft' || key === 'a') moveBranchMapFocus(-1, 0);
  else if (event.key === 'ArrowRight' || key === 'd') moveBranchMapFocus(1, 0);
  else if (key === 'q' || key === '[') stepBranchTab(-1);
  else if (key === 'e' || key === ']') stepBranchTab(1);
  else if (key === '-' || key === '_') zoomBranchMap(1 / 1.25);
  else if (key === '=' || key === '+') zoomBranchMap(1.25);
  else if (key === '0' || key === 'f') fitBranchMap();
  else if (event.key === 'Enter' || event.key === ' ') toggleFocusedBranch();
  else if (key === 'u') unlockFocusedBranch();
  else if (key === 'r') unweaveFocusedNode();
}

// Buttons act on press; inside the map a press starts a drag that becomes a tap if it barely moves.
function handleBranchPointerDown(id, x, y) {
  if (branchTour) {
    if (branchPointers.size === 0) advanceBranchTour();
    return;
  }
  if (branchPointers.size === 0) branchGuide = null;
  branchPointers.set(id, { x, y });
  if (branchPointers.size === 2) {
    const [a, b] = [...branchPointers.values()];
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    branchPinch = { distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), zoom: branchCam.zoom,
      anchor: branchScreenToWorld(midX, midY) };
    branchDrag = null;
    return;
  }
  if (branchPointers.size > 2) return;
  const layout = branchMapLayout();
  if (pointInBounds(layout.close, x, y)) return closeBranchScreen();
  const tab = layout.tabs.find((entry) => pointInBounds(entry.bounds, x, y));
  if (tab) return setBranchTab(tab.style);
  if (pointInBounds(layout.toggle, x, y)) return toggleFocusedBranch();
  if (pointInBounds(layout.unlock, x, y)) return unlockFocusedBranch();
  if (branchSecondaryShown() && pointInBounds(layout.unweave, x, y)) return unweaveFocusedNode();
  if (pointInBounds(layout.zoomOut, x, y)) return zoomBranchMap(1 / 1.25);
  if (pointInBounds(layout.zoomIn, x, y)) return zoomBranchMap(1.25);
  if (pointInBounds(layout.fit, x, y)) return fitBranchMap();
  const socket = branchTab === 'confluence' ? -1 : layout.sockets.findIndex((bounds) => pointInBounds(bounds, x, y));
  if (socket >= 0) {
    const id = branchLoadout(branchTab)[socket];
    if (id) focusBranchNode(`${id}:${branchTier(id)}`, true);
    return;
  }
  if (!pointInBounds(BRANCH_MAP_VIEW, x, y)) return;
  branchDrag = { id, startX: x, startY: y, camX: branchCam.x, camY: branchCam.y, moved: false };
}

function handleBranchPointerMove(id, x, y) {
  if (!branchPointers.has(id)) return;
  branchPointers.set(id, { x, y });
  if (branchPinch && branchPointers.size >= 2) {
    const [a, b] = [...branchPointers.values()];
    const center = branchMapCenter();
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    branchCam.zoom = clamp(branchPinch.zoom * Math.hypot(a.x - b.x, a.y - b.y) / branchPinch.distance,
      branchZoomMin(), BRANCH_ZOOM_MAX);
    branchCam.x = branchPinch.anchor.x - (midX - center.x) / branchCam.zoom;
    branchCam.y = branchPinch.anchor.y - (midY - center.y) / branchCam.zoom;
    branchCamTarget = null;
    clampBranchCam();
    return;
  }
  if (!branchDrag || branchDrag.id !== id) return;
  const dx = x - branchDrag.startX;
  const dy = y - branchDrag.startY;
  if (!branchDrag.moved && Math.hypot(dx, dy) < BRANCH_DRAG_SLOP) return;
  branchDrag.moved = true;
  branchCam.x = branchDrag.camX - dx / branchCam.zoom;
  branchCam.y = branchDrag.camY - dy / branchCam.zoom;
  branchCamTarget = null;
  clampBranchCam();
}

function handleBranchPointerUp(id, x, y) {
  if (!branchPointers.delete(id)) return;
  if (branchPinch) {
    if (branchPointers.size < 2) branchPinch = null;
    branchDrag = null;
    return;
  }
  const drag = branchDrag;
  branchDrag = null;
  if (!drag || drag.id !== id || drag.moved) return;
  const node = branchNodeAt(x, y);
  if (node) focusBranchNode(node.id);
}

function cancelBranchPointer(id) {
  branchPointers.delete(id);
  if (branchPointers.size < 2) branchPinch = null;
  if (branchDrag?.id === id) branchDrag = null;
}

function handleBranchWheel(deltaY, x, y) {
  if (!deltaY) return;
  const inside = pointInBounds(BRANCH_MAP_VIEW, x, y);
  zoomBranchMap(deltaY < 0 ? 1.15 : 1 / 1.15, inside ? x : undefined, inside ? y : undefined);
}

function branchMapCursor(x, y) {
  if (branchDrag?.moved) return 'grabbing';
  const layout = branchMapLayout();
  const buttons = [layout.close, layout.toggle, layout.unlock, layout.zoomOut, layout.zoomIn, layout.fit,
    ...layout.tabs.map((tab) => tab.bounds), ...layout.sockets,
    ...(branchSecondaryShown() ? [layout.unweave] : [])];
  if (branchNodeAt(x, y) || buttons.some((bounds) => pointInBounds(bounds, x, y))) return 'pointer';
  return pointInBounds(BRANCH_MAP_VIEW, x, y) ? 'grab' : 'default';
}

function updateBranchMap(now) {
  const dt = branchLastFrame ? clamp((now - branchLastFrame) / 1000, 0, 0.1) : 0;
  branchLastFrame = now;
  if (branchToken.t < 1) {
    branchToken.t = Math.min(1, branchToken.t + dt / branchToken.duration);
    const ease = branchToken.t * (2 - branchToken.t);
    branchToken.x = branchToken.fromX + (branchToken.toX - branchToken.fromX) * ease;
    branchToken.y = branchToken.fromY + (branchToken.toY - branchToken.fromY) * ease;
  }
  if (branchCamTarget && !branchDrag?.moved && !branchPinch) {
    const blend = 1 - Math.exp(-dt * 7);
    branchCam.x += (branchCamTarget.x - branchCam.x) * blend;
    branchCam.y += (branchCamTarget.y - branchCam.y) * blend;
    if (Math.hypot(branchCamTarget.x - branchCam.x, branchCamTarget.y - branchCam.y) < 0.5) branchCamTarget = null;
  }
}

function drawBranchButton(bounds, label, sub, accent, active) {
  drawManaPanel(bounds.x, bounds.y, bounds.width, bounds.height, accent);
  if (!label) return;
  ctx.textAlign = 'center';
  ctx.fillStyle = active ? '#fff4d5' : '#9c967f';
  ctx.font = label.length === 1 ? 'bold 22px Georgia' : 'bold 14px Georgia';
  ctx.fillText(label, bounds.x + bounds.width / 2, bounds.y + (sub ? 22 : bounds.height / 2 + (label.length === 1 ? 7 : 5)), bounds.width - 8);
  if (sub) {
    ctx.font = '11px Arial';
    ctx.fillText(sub, bounds.x + bounds.width / 2, bounds.y + 38, bounds.width - 8);
  }
}

// The spotlight: one even-odd fill dims everything but the target, then a bobbing arrow and a label point at it.
// The label is wrapped once per guide, so a frame allocates nothing new.
function drawBranchGuide(now) {
  const guide = branchGuide;
  if (!guide) return;
  if (now > guide.until) {
    branchGuide = null;
    return;
  }
  let hole = guide.rect;
  let round = null;
  if (guide.node) {
    const node = branchMapNode(guide.node);
    if (!node) {
      branchGuide = null;
      return;
    }
    const p = branchWorldToScreen(node.x, node.y);
    const r = branchNodeRadius(node) + 12;
    round = { x: p.x, y: p.y, r };
    hole = { x: p.x - r, y: p.y - r, width: r * 2, height: r * 2 };
  }
  if (!hole) return;
  const pad = 4;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, (now - guide.start) / 180, (guide.until - now) / 350));
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.beginPath();
  ctx.rect(0, 0, VIEW_W, VIEW_H);
  if (round) {
    ctx.moveTo(round.x + round.r, round.y);
    ctx.arc(round.x, round.y, round.r, 0, Math.PI * 2);
  } else ctx.rect(hole.x - pad, hole.y - pad, hole.width + pad * 2, hole.height + pad * 2);
  ctx.fill('evenodd');
  const pulse = 0.5 + Math.sin(now / 200) * 0.5;
  ctx.strokeStyle = `rgba(255, 214, 110, ${0.55 + pulse * 0.4})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (round) ctx.arc(round.x, round.y, round.r + pulse * 2, 0, Math.PI * 2);
  else ctx.rect(hole.x - pad, hole.y - pad, hole.width + pad * 2, hole.height + pad * 2);
  ctx.stroke();

  ctx.font = 'bold 12px Arial';
  if (!guide.lines) {
    guide.lines = [];
    let current = '';
    for (const word of String(guide.label || '').split(' ')) {
      const next = current ? `${current} ${word}` : word;
      if (ctx.measureText(next).width > 340 && current) {
        guide.lines.push(current);
        current = word;
      } else current = next;
    }
    if (current) guide.lines.push(current);
    guide.textWidth = Math.max(0, ...guide.lines.map((text) => ctx.measureText(text).width));
  }
  const centerX = hole.x + hole.width / 2;
  const below = hole.y < 170;
  const bob = Math.sin(now / 150) * 4;
  const tipY = below ? hole.y + hole.height + pad + 6 + bob : hole.y - pad - 6 - bob;
  const dir = below ? 1 : -1;
  ctx.fillStyle = '#ffd66e';
  ctx.beginPath();
  ctx.moveTo(centerX, tipY);
  ctx.lineTo(centerX - 10, tipY + dir * 14);
  ctx.lineTo(centerX - 4, tipY + dir * 14);
  ctx.lineTo(centerX - 4, tipY + dir * 24);
  ctx.lineTo(centerX + 4, tipY + dir * 24);
  ctx.lineTo(centerX + 4, tipY + dir * 14);
  ctx.lineTo(centerX + 10, tipY + dir * 14);
  ctx.closePath();
  ctx.fill();
  if (guide.lines.length) {
    const boxW = guide.textWidth + 20;
    const boxH = guide.lines.length * 16 + 10;
    const boxX = clamp(centerX - boxW / 2, 30, VIEW_W - 30 - boxW);
    const boxY = below ? tipY + 28 : tipY - 28 - boxH;
    ctx.fillStyle = 'rgba(24, 18, 8, 0.94)';
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeStyle = '#ffd66e';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(boxX + 0.5, boxY + 0.5, boxW - 1, boxH - 1);
    ctx.fillStyle = '#fff4d5';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    guide.lines.forEach((text, index) => ctx.fillText(text, boxX + boxW / 2, boxY + 18 + index * 16));
  }
  ctx.restore();
}

// Zoom-out-to-everything: a magnifying glass with a minus in the lens.
function drawMagnifierIcon(x, y, radius) {
  ctx.save();
  ctx.strokeStyle = '#fff4d5';
  ctx.lineCap = 'round';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.moveTo(x + radius * 0.72, y + radius * 0.72);
  ctx.lineTo(x + radius * 1.6, y + radius * 1.6);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - radius * 0.5, y);
  ctx.lineTo(x + radius * 0.5, y);
  ctx.stroke();
  ctx.restore();
}

function branchHeartColor(style = branchTab) {
  return style === 'magic' ? magicElementPalette[activeMagicElement] || '#7fc8ff' : BRANCH_HEART_COLORS[style];
}

// owned: the tier is grown; lit: owned and its branch is highlighted (gold when powered, amber when dormant).
function branchNodeState(node, loadout) {
  const style = node.style || branchTab;
  if (node.style) loadout = branchLoadout(node.style);
  if (node.kind === 'cf') {
    const owned = confluenceOwned(node.cf.id);
    const working = node.cf.kind === 'fusion' ? confluenceFusionActive(node.cf.fusion.id) : owned;
    return { owned, lit: working, half: owned && !working, next: !owned && confluenceReachable(node.cf),
      color: node.cf.bridge?.color || '#fff2a0' };
  }
  if (node.kind === 'heart') return { owned: true, lit: loadout.length > 0, color: branchHeartColor(style) };
  if (node.kind === 'grip') {
    const owned = dualGripOwned();
    return { owned, lit: owned, next: !owned, color: '#7fd0e8' };
  }
  if (node.kind === 'weapon') {
    const owned = weaponLearned(node.weapon.id);
    const held = weaponHandOf(node.weapon.id);
    return { owned, lit: Boolean(held), next: !owned, color: held === 'main' ? '#ffe38a' : held ? '#9fd8ff' : '#d8b98a' };
  }
  if (node.kind === 'synergy') {
    const on = node.synergy.branches.filter((id) => loadout.includes(id)).length;
    const awake = activeBranchSynergies(style).includes(node.synergy);
    return { owned: awake, lit: awake, half: on > 0 && !awake, color: '#c9a0ff' };
  }
  const owned = node.tier <= branchTier(node.branch.id);
  const on = loadout.includes(node.branch.id);
  const powered = branchPowered(node.branch);
  return { owned, lit: owned && on, dormant: on && !powered, next: node.tier === branchTier(node.branch.id) + 1,
    color: on ? (powered ? '#f0c75a' : '#c98a3c') : '#8fae86' };
}

function drawBranchMap(loadout, now) {
  const view = BRANCH_MAP_VIEW;
  const nodes = branchMapNodes();
  const zoom = branchCam.zoom;
  const pulse = 0.5 + Math.sin(now / 260) * 0.5;
  ctx.save();
  ctx.beginPath();
  ctx.rect(view.x, view.y, view.width, view.height);
  ctx.clip();
  const heart = branchWorldToScreen(0, 0);
  const backdrop = ctx.createRadialGradient(heart.x, heart.y, 10, heart.x, heart.y, 340 * zoom + 60);
  backdrop.addColorStop(0, '#1d2219');
  backdrop.addColorStop(1, '#0b0d0a');
  ctx.fillStyle = backdrop;
  ctx.fillRect(view.x, view.y, view.width, view.height);
  ctx.lineWidth = 1;
  const ringCenters = branchTab === 'confluence' ? Object.values(CONFLUENCE_HEARTS).map((center) => branchWorldToScreen(center.x, center.y)) : [heart];
  for (const center of ringCenters) {
    for (let ring = 1; ring < BRANCH_MAP_RINGS.length + 2; ring += 1) {
      ctx.strokeStyle = `rgba(201, 166, 90, ${ring % 2 ? 0.1 : 0.06})`;
      ctx.beginPath();
      ctx.arc(center.x, center.y, (ring * 56 + 18) * zoom, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  const states = new Map(nodes.map((node) => [node.id, branchNodeState(node, loadout)]));
  for (const node of nodes) {
    const to = branchWorldToScreen(node.x, node.y);
    const state = states.get(node.id);
    for (const linkId of node.links) {
      const link = branchMapNode(linkId);
      if (!link) continue;
      const from = branchWorldToScreen(link.x, link.y);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      if (node.kind === 'synergy') {
        const nodeLoadout = node.style ? branchLoadout(node.style) : loadout;
        ctx.setLineDash([3, 5]);
        ctx.strokeStyle = state.lit ? '#d9b8ff' : state.half && nodeLoadout.includes(link.branch?.id) ? '#8a70b0' : '#3d3549';
        ctx.lineWidth = state.lit ? 2.5 : 1.5;
        // Pairs that reach around another branch bow outward so they never cut through it.
        if (node.outer) {
          const bend = branchWorldToScreen((link.x + node.x) * 0.66, (link.y + node.y) * 0.66);
          ctx.quadraticCurveTo(bend.x, bend.y, to.x, to.y);
        } else ctx.lineTo(to.x, to.y);
      } else if (node.kind === 'cf') {
        // Bridges glow in their own colour once grown; reachable steps pulse.
        ctx.setLineDash(state.owned ? [] : [5, 6]);
        ctx.strokeStyle = state.owned ? node.cf.bridge?.color || '#fff2a0' : state.next ? '#7a6a46' : '#34322a';
        ctx.lineWidth = state.owned ? 4 : 2;
        ctx.lineTo(to.x, to.y);
      } else {
        const lit = state.lit;
        ctx.setLineDash(state.owned ? [] : [4, 6]);
        ctx.strokeStyle = lit ? (state.dormant ? '#b07a34' : '#e9c46a') : state.owned ? '#5d6b52' : '#34322a';
        ctx.lineWidth = lit ? 4 : state.owned ? 3 : 2;
        ctx.lineTo(to.x, to.y);
      }
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);
  branchSuggestion = suggestedPath(branchTab);
  drawSuggestedTrail(states, now);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const node of nodes) {
    const { x, y } = branchWorldToScreen(node.x, node.y);
    const radius = branchNodeRadius(node);
    if (x < view.x - 60 || x > view.x + view.width + 60 || y < view.y - 40 || y > view.y + view.height + 40) continue;
    const state = states.get(node.id);
    const focused = node.id === branchMapFocus;
    if (state.lit) drawEffect('glow', 0, x, y, { width: radius * 4.2, tint: state.color, alpha: 0.32 + pulse * 0.12, smooth: true });
    ctx.beginPath();
    if (node.kind === 'synergy' || node.cf?.kind === 'fusion') {
      ctx.moveTo(x, y - radius - 3);
      ctx.lineTo(x + radius, y);
      ctx.lineTo(x, y + radius + 3);
      ctx.lineTo(x - radius, y);
      ctx.closePath();
    } else ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = state.lit ? state.color : state.half ? '#4a3d5c' : state.owned ? '#2c3527' : '#151612';
    if (node.kind === 'heart' || node.kind === 'weapon') ctx.fillStyle = '#1f241b';
    ctx.fill();
    ctx.lineWidth = focused ? 3 : 2;
    ctx.strokeStyle = focused ? '#fff4d5' : node.kind === 'heart' ? state.color
      : state.lit ? '#ffe9a8' : state.next ? `rgba(240, 212, 134, ${0.45 + pulse * 0.4})` : state.owned ? state.color : '#4a4536';
    ctx.stroke();
    const nodeStyle = node.style || branchTab;
    const named = zoom >= 0.6 || focused;
    const hand = node.kind === 'heart' ? weaponHandOf(branchBaseWeaponId(nodeStyle)) : node.kind === 'weapon' ? weaponHandOf(node.weapon.id) : null;
    if (hand) {
      // Hand badge: M for the main hand, O for the off hand.
      const bx = x + radius * 0.78;
      const by = y - radius * 0.78;
      ctx.beginPath();
      ctx.arc(bx, by, 7, 0, Math.PI * 2);
      ctx.fillStyle = hand === 'main' ? '#ffe38a' : '#9fd8ff';
      ctx.fill();
      ctx.font = 'bold 9px Arial';
      ctx.fillStyle = '#1b1408';
      ctx.fillText(hand === 'main' ? 'M' : 'O', bx, by + 0.5);
    }
    ctx.fillStyle = state.lit ? '#21170a' : state.owned ? '#e6dcc0' : '#6f6a58';
    if (node.kind === 'heart') {
      ctx.font = 'bold 22px Georgia';
      ctx.fillStyle = state.color;
      ctx.fillText(BRANCH_HEART_ICONS[nodeStyle], x, y + 1);
    } else if (node.kind === 'cf') {
      const cf = node.cf;
      if (cf.kind === 'seal') {
        drawPadlock(x, y + 1, 6, state.owned, state.lit ? '#21170a' : state.next ? '#f0c8ff' : '#8c7f9a');
      } else {
        ctx.font = cf.kind === 'trinity' ? 'bold 24px Georgia' : cf.kind === 'stat' ? 'bold 11px Georgia' : 'bold 15px Georgia';
        ctx.fillStyle = state.lit ? '#21170a' : state.owned ? '#e6dcc0' : state.next ? '#cfc6aa' : '#6f6a58';
        ctx.fillText(confluenceNodeIcon(cf), x, y + 1);
      }
      if (zoom >= 0.8 || focused || (cf.kind !== 'stat' && cf.kind !== 'seal' && named)) {
        ctx.font = cf.kind === 'stat' ? '9px Arial' : 'bold 11px Georgia';
        ctx.fillStyle = state.lit ? '#fff0c0' : state.owned ? '#cfc6aa' : '#8c866f';
        ctx.fillText(cf.kind === 'stat' ? CONFLUENCE_STATS[cf.stat].short : cf.kind === 'seal' ? 'SEAL' : confluenceNodeName(cf), x, y + radius + 11);
      }
    } else if (node.kind === 'grip') {
      ctx.font = 'bold 13px Georgia';
      ctx.fillStyle = state.owned ? '#21170a' : '#9fd8e8';
      ctx.fillText('⚯', x, y + 1);
      if (zoom >= 1.15 || focused) {
        ctx.font = '11px Georgia';
        ctx.fillStyle = state.owned ? '#bfeaf5' : '#8aa6ad';
        ctx.fillText('Dual Grip', x, y + radius + 12);
      }
    } else if (node.kind === 'weapon') {
      const art = shopItemIconImages[`weapon-${node.weapon.id}`];
      ctx.save();
      // Brighter the more you know it: unfound, found, learned.
      ctx.globalAlpha = { unfound: 0.4, found: 0.72, learned: 1 }[weaponProficiencyRank(node.weapon.id)];
      if (art?.complete && art.naturalWidth > 0) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(art, Math.round(x - 12), Math.round(y - 12), 24, 24);
      } else {
        ctx.font = 'bold 15px Georgia';
        ctx.fillStyle = '#e6dcc0';
        ctx.fillText(node.weapon.icon, x, y + 1);
      }
      ctx.restore();
      if (named) {
        ctx.font = state.lit ? 'bold 11px Georgia' : '11px Georgia';
        ctx.fillStyle = state.lit ? state.color : state.owned ? '#cfc6aa' : '#8c866f';
        ctx.fillText(node.weapon.name, x, y + radius + 11);
      }
    } else if (node.kind === 'tier') {
      // Tier I shows the branch; later tiers show what they add, like a stat sphere.
      const badge = node.tier === 1 ? null : branchFxBadge(node.branch.tiers[node.tier - 1].fx);
      ctx.font = node.tier === 1 ? 'bold 16px Georgia' : 'bold 12px Georgia';
      ctx.fillText(node.tier === 1 ? node.branch.icon : badge.icon, x, y + 1);
      if (badge && (zoom >= 1 || focused)) {
        ctx.font = '9px Arial';
        ctx.fillStyle = state.owned ? '#cfc6aa' : '#8c866f';
        ctx.fillText(badge.label, x, y + radius + 9);
      }
      if (node.tier === 3 && named) {
        const out = 30;
        const nodeLoadout = branchLoadout(node.branch.style);
        ctx.font = nodeLoadout.includes(node.branch.id) ? 'bold 12px Georgia' : '12px Georgia';
        ctx.fillStyle = nodeLoadout.includes(node.branch.id) ? '#ffe38a' : '#cfc6aa';
        ctx.fillText(node.branch.name, x + Math.cos(node.angle) * out, y + Math.sin(node.angle) * (out - 8));
      }
    } else if (zoom >= 1.15 || focused) {
      ctx.font = '11px Georgia';
      ctx.fillStyle = state.lit ? '#e7d2ff' : '#9a8fae';
      ctx.fillText(node.synergy.name, x, y + radius + 13);
    }
    if (focused) {
      ctx.strokeStyle = `rgba(255, 244, 213, ${0.35 + pulse * 0.4})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, radius + 6 + pulse * 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (node.cf?.kind !== 'seal' && branchNodeLocked(node)) {
      drawPadlock(x + radius * 0.8, y + radius * 0.8, 4, false, state.next ? '#e8c6ff' : '#9a8bb0');
    }
  }
  drawSuggestedBadges(pulse);
  drawBranchToken(now);
  ctx.restore();
}

// Ability nodes are Life Stone locks until grown: behaviour tiers, learning a weapon, Dual Grip, and the Confluence's
// seals, fusions, moves and Trinity.
function branchNodeLocked(node) {
  if (node.kind === 'tier') return node.tier > 1 && branchTierIsAbility(node.branch.id, node.tier) && branchTier(node.branch.id) < node.tier;
  if (node.kind === 'weapon') return !weaponLearned(node.weapon.id);
  if (node.kind === 'grip') return !dualGripOwned();
  if (node.kind === 'cf') return node.cf.kind !== 'stat' && !confluenceOwned(node.cf.id);
  return false;
}

function drawPadlock(x, y, size, open, color) {
  ctx.save();
  ctx.fillStyle = '#120f16';
  ctx.beginPath();
  ctx.arc(x, y, size * 1.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1.2, size * 0.32);
  ctx.beginPath();
  ctx.arc(x + (open ? size * 0.5 : 0), y - size * 0.2, size * 0.55, Math.PI, open ? Math.PI * 1.9 : 0);
  ctx.stroke();
  ctx.fillRect(x - size * 0.8, y - size * 0.2, size * 1.6, size * 1.1);
  ctx.restore();
}

// The suggested path: a moving gold trail from what you own through the next few growths that fit how you play,
// each numbered. Only a hint; every other reachable node can still be grown.
let branchSuggestion = [];

function suggestionStep(mapId) {
  const index = branchSuggestion.findIndex((step) => step.mapId === mapId);
  return index < 0 ? null : { ...branchSuggestion[index], number: index + 1 };
}

function drawSuggestedTrail(states, now) {
  if (!branchSuggestion.length) return;
  const first = branchMapNode(branchSuggestion[0].mapId);
  if (!first) return;
  const start = branchMapNode(first.links.find((id) => states.get(id)?.owned) || first.links[0]);
  const points = [start, ...branchSuggestion.map((step) => branchMapNode(step.mapId))].filter(Boolean)
    .map((node) => branchWorldToScreen(node.x, node.y));
  if (points.length < 2) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255, 214, 110, 0.85)';
  ctx.lineWidth = 3;
  ctx.setLineDash([2, 9]);
  ctx.lineDashOffset = -(now / 40) % 11;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
  ctx.stroke();
  ctx.restore();
}

function drawSuggestedBadges(pulse) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  branchSuggestion.forEach((step, index) => {
    const node = branchMapNode(step.mapId);
    if (!node) return;
    const { x, y } = branchWorldToScreen(node.x, node.y);
    const radius = branchNodeRadius(node);
    if (index === 0) {
      ctx.strokeStyle = `rgba(255, 214, 110, ${0.5 + pulse * 0.45})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(x, y, radius + 9 + pulse * 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    const bx = x - radius * 0.8;
    const by = y - radius * 0.8;
    ctx.fillStyle = index === 0 ? '#ffd66e' : 'rgba(255, 214, 110, 0.7)';
    ctx.beginPath();
    ctx.arc(bx, by, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = 'bold 9px Arial';
    ctx.fillStyle = '#1b1408';
    ctx.fillText(String(index + 1), bx, by + 0.5);
  });
  ctx.restore();
}

// One line for the info panel: why the focused node is suggested, or where the suggestion points.
function suggestionLine(mapId) {
  const step = suggestionStep(mapId);
  if (step) return { text: `★ Suggested ${step.number}: ${step.reason}.`, color: '#ffd66e' };
  const next = branchSuggestion[0];
  if (!next) return null;
  const node = branchMapNode(next.mapId);
  const name = node?.kind === 'cf' ? confluenceNodeName(node.cf) : node?.branch ? `${node.branch.name} ${BRANCH_TIER_NUMERALS[node.tier - 1]}` : '';
  return name ? { text: `Suggested next: ${name} · ${next.reason}. Any open node is yours to pick.`, color: '#b8a466' } : null;
}

function drawBranchToken(now) {
  const sprite = humanoidSprites[character?.sprite];
  const { x, y } = branchWorldToScreen(branchToken.x, branchToken.y);
  const feetY = y - 14;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.ellipse(x, feetY + 1, 10, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  if (!sprite?.image) return;
  const walking = branchToken.t < 1;
  const frame = walking ? 1 + Math.floor(now / 90) % 6 : 0;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  drawSpriteImage.effect = null;
  drawHumanoid(sprite.image, branchToken.row * sprite.framesPerDirection + frame, x, feetY, 0.74, character.hue);
  ctx.restore();
}

function drawBranchInfo(layout, loadout) {
  const node = branchMapNode(branchMapFocus);
  const style = node?.style || (BRANCH_STYLES.includes(branchTab) ? branchTab : 'magic');
  loadout = branchLoadout(style);
  drawManaPanel(662, 72, 256, 404, '#796b47');
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const line = (text, y, font, color, width = 228) => {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.fillText(text, 676, y, width);
  };
  const wrap = (text, y, font, color, maxLines = 3) => {
    ctx.font = font;
    const words = String(text).split(' ');
    let current = '';
    let lines = 0;
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (ctx.measureText(next).width > 226 && current) {
        line(current, y + lines * 15, font, color);
        lines += 1;
        current = word;
        if (lines >= maxLines) return y + lines * 15;
      } else current = next;
    }
    if (current) line(current, y + lines * 15, font, color), lines += 1;
    return y + lines * 15;
  };
  const branch = node?.branch;
  if (branch) {
    const tier = branchTier(branch.id);
    const on = loadout.includes(branch.id);
    const powered = branchPowered(branch);
    line(`${branch.icon} ${branch.name}`, 98, 'bold 17px Georgia', '#fff4d5');
    ctx.font = 'bold 14px Georgia';
    ctx.fillStyle = '#f0d486';
    ctx.textAlign = 'right';
    ctx.fillText('◆'.repeat(tier) + '◇'.repeat(3 - tier), 904, 98);
    ctx.textAlign = 'left';
    let y = wrap(branch.items.length ? `Needs: ${branchItemNames(branch).join(' or ')}` : 'Technique: no item needed', 118,
      '11px Arial', '#bbb49d', 2);
    branch.tiers.forEach((entryTier, index) => {
      const owned = index < tier;
      const here = node.tier === index + 1;
      const cost = branchTierCost(branch.id, index + 1);
      line(`${here ? '▸' : ' '}${BRANCH_TIER_NUMERALS[index]}`, y + 14, 'bold 12px Georgia', owned ? '#f0d486' : '#6f6a58');
      ctx.font = '12px Arial';
      ctx.fillStyle = owned ? '#e6dcc0' : '#8c866f';
      ctx.fillText(entryTier.text, 704, y + 14, 200);
      y += 20;
      if (!owned && cost) {
        const ability = branchTierIsAbility(branch.id, index + 1);
        line(`   ${ability ? 'ability lock' : 'stat'}: ${costLabel(cost)}`, y + 8, '10px Arial', ability ? '#c9a8e8' : '#8c866f');
        y += 13;
      }
    });
    y += 10;
    const status = !on ? 'Off. Highlight it to use it.'
      : powered ? (branch.items.length ? `Powered by ${branchItemNames(branch).filter((_, i) => ownedItems.has(branch.items[i])).join(', ')}` : 'Highlighted and working.')
        : `Dormant: find ${branchItemNames(branch).join(' or ')}.`;
    wrap(status, y + 8, 'bold 11px Arial', !on ? '#9c967f' : powered ? '#8fdca6' : '#e0a868', 2);
    const partners = branchSynergies.filter((synergy) => synergy.branches.includes(branch.id));
    if (partners.length) {
      wrap(`Synergies: ${partners.map((synergy) => synergy.name).join(', ')}`, y + 42, '11px Arial', '#b9a3d8', 2);
    }
    drawBranchButton(layout.toggle, on ? 'ON' : 'OFF', on ? 'highlighted' : `${loadout.length}/${BRANCH_SLOTS} slots`,
      on ? '#7fd29a' : '#796b47', true);
    const cost = nextBranchTierCost(branch.id);
    if (cost && growthBlock(cost) === 'gate') {
      line(`Career XP ${Math.floor(branchState().xp)}/${growthXpRequirement()} to grow`, y + 74, 'bold 11px Arial', '#e0a868');
    }
    const affordable = cost && canAfford(cost);
    drawBranchButton(layout.unlock, cost ? `Grow ${BRANCH_TIER_NUMERALS[tier]}` : 'MAX',
      cost ? costLabel(cost, true) : 'fully grown',
      affordable ? '#f0d486' : '#796b47', Boolean(affordable));
  } else if (node?.kind === 'cf') {
    drawConfluenceInfo(node.cf, layout, line, wrap);
  } else if (node?.kind === 'synergy') {
    const { synergy } = node;
    const active = activeBranchSynergies(style).includes(synergy);
    line(`${active ? '★' : '☆'} ${synergy.name}`, 98, 'bold 17px Georgia', active ? '#ffe38a' : '#e7d2ff');
    line('Synergy', 118, '11px Arial', '#bbb49d');
    let y = wrap(synergy.text, 144, '13px Arial', '#e6dcc0', 3);
    y = wrap(`Highlight both ${synergy.branches.map((id) => branchById(id)?.name).join(' and ')} with their items found to awaken it.`, y + 14,
      '11px Arial', '#bbb49d', 3);
    synergy.branches.forEach((id, index) => {
      const entry = branchById(id);
      const on = loadout.includes(id);
      const label = !on ? '' : branchPowered(entry) ? ' (on)' : ' (on, dormant)';
      line(`${on ? '●' : '○'} ${entry?.name}${label}`, y + 18 + index * 18, '12px Arial',
        !on ? '#8c866f' : branchPowered(entry) ? '#8fdca6' : '#e0a868');
    });
    line(active ? 'Awake.' : 'Asleep.', y + 64, 'bold 12px Arial', active ? '#ffe38a' : '#9c967f');
  } else if (node?.kind === 'weapon') {
    const entry = node.weapon;
    const rank = weaponProficiencyRank(entry.id);
    line(`${entry.icon} ${entry.name}`, 98, 'bold 17px Georgia', '#fff4d5');
    line(`${BRANCH_STYLE_NAMES[entry.family]} weapon · ${rank === 'unfound' ? 'not found yet' : rank}`, 118, '11px Arial', '#bbb49d');
    let y = wrap(entry.text, 144, '13px Arial', '#e6dcc0', 3);
    y = wrap(`Uses the ${BRANCH_STYLE_NAMES[entry.family]} branches you highlight here.`, y + 10, '11px Arial', '#bbb49d', 2);
    const traits = weaponTraitText(entry);
    if (traits) y = wrap(traits, y + 10, '11px Arial', '#d8c48f', 3);
    const power = rank === 'learned' ? 'Full power.'
      : rank === 'found' ? `Hits at ${Math.round(WEAPON_PROFICIENCY.found * 100)}%. Learn it for full power (${costLabel(WEAPON_LEARN_COST)}).`
        : `Hits at ${Math.round(WEAPON_PROFICIENCY.unfound * 100)}%. Find it in a weapon cache (${Math.round(WEAPON_PROFICIENCY.found * 100)}%), then learn it for full power.`;
    y = wrap(power, y + 10, 'bold 11px Arial', rank === 'learned' ? '#8fdca6' : '#e0a868', 3);
    drawWeaponHandButtons(layout, entry.id, y - 4);
    if (rank === 'found') {
      const affordable = canAfford(WEAPON_LEARN_COST);
      drawBranchButton(layout.unweave, `Learn · ${costLabel(WEAPON_LEARN_COST, true)}`, '', affordable ? '#f0d486' : '#796b47', affordable);
    }
  } else if (node?.kind === 'grip') {
    const owned = dualGripOwned();
    line('⚯ Dual Grip', 98, 'bold 17px Georgia', '#bfeaf5');
    line(`Shared by every weapon · ${owned ? 'grown' : 'not grown'}`, 118, '11px Arial', '#bbb49d');
    let y = wrap('Wield both hands at once. Attack uses your main hand; your off hand attacks on its own, only at a foe close to where you are looking.', 144,
      '12px Arial', '#e6dcc0', 5);
    y = wrap('The off hand follows its own map: with Wind-Up, Longdraw or Focus highlighted it charges and releases, otherwise it taps at a slower pace and hits a little lighter.',
      y + 10, '11px Arial', '#bbb49d', 5);
    drawBranchButton(layout.toggle, owned ? 'ON' : 'OFF', owned ? 'grown' : 'not grown', owned ? '#7fd0e8' : '#796b47', true);
    const affordable = !owned && canAfford(DUAL_GRIP_COST);
    drawBranchButton(layout.unlock, owned ? 'MAX' : 'Grow', owned ? 'grown' : costLabel(DUAL_GRIP_COST, true),
      affordable ? '#f0d486' : '#796b47', affordable);
  } else {
    line(`${BRANCH_HEART_ICONS[style]} ${BRANCH_STYLE_NAMES[style]} heart`, 98, 'bold 17px Georgia', branchHeartColor(style));
    let y = wrap(`Highlight up to ${BRANCH_SLOTS} branches. Walk out along a branch to grow it. Found items only work in a highlighted branch.`,
      120, '11px Arial', '#bbb49d', 4);
    line(`Highlighted ${loadout.length}/${BRANCH_SLOTS}`, y + 16, 'bold 12px Georgia', '#e9d39f');
    loadout.forEach((id, index) => {
      const entry = branchById(id);
      line(`${entry?.icon} ${entry?.name}  ${'◆'.repeat(branchTier(id))}`, y + 36 + index * 18, '12px Arial',
        branchPowered(entry) ? '#f0c75a' : '#c98a3c');
    });
    const synergies = activeBranchSynergies(style);
    line('Awake synergies', y + 104, 'bold 12px Georgia', '#e9d39f');
    if (!synergies.length) line('None yet. Pair neighbouring branches.', y + 122, '11px Arial', '#8c866f');
    synergies.forEach((synergy, index) => line(`★ ${synergy.name}: ${synergy.text}`, y + 122 + index * 16, '11px Arial', '#e7d2ff'));
    drawWeaponHandButtons(layout, branchBaseWeaponId(style), null);
  }
  const unweave = focusedUnweave();
  const runes = weaponState().runes || 0;
  if (runes > 0 && unweave) {
    drawBranchButton(layout.unweave, `Unweave (${runes} rune${runes === 1 ? '' : 's'})`, '', '#b48fe0', true);
  }
}

// Info for a Confluence node: what it does, whether a fusion is working right now, and what growing it takes.
function drawConfluenceInfo(cf, layout, line, wrap) {
  const owned = confluenceOwned(cf.id);
  const reachable = confluenceReachable(cf);
  const color = cf.bridge?.color || '#fff2a0';
  const bridgeNames = cf.bridge ? cf.bridge.styles.map((style) => BRANCH_STYLE_NAMES[style]).join(' + ') : 'Blade + Bow + Magic';
  const kindName = { stat: 'Stat', seal: 'Lock', fusion: 'Fusion · ability lock', move: 'Move · ability lock', trinity: 'Capstone · lock' }[cf.kind];
  line(`${confluenceNodeIcon(cf)} ${confluenceNodeName(cf)}`, 98, 'bold 17px Georgia', color);
  line(`${kindName} · ${bridgeNames} · ${owned ? (cf.kind === 'seal' ? 'unsealed' : 'grown') : 'not grown'}`, 118, '11px Arial', '#bbb49d');
  const text = cf.kind === 'stat' ? CONFLUENCE_STATS[cf.stat].text : cf.kind === 'seal' ? CONFLUENCE_SEAL.text
    : cf.kind === 'fusion' ? cf.fusion.text : cf.kind === 'move' ? cf.move.text : CONFLUENCE_TRINITY.text;
  let y = wrap(text, 144, '13px Arial', '#e6dcc0', 4);
  if (cf.kind === 'fusion') {
    const active = confluenceFusionActive(cf.fusion.id);
    const status = !owned ? `Works while a ${bridgeNames.replace(' + ', ' or ')} weapon is in your main hand.`
      : confluenceOwned('cf:trinity') ? 'Working with any weapon (Trinity).'
        : active ? 'Working: your main hand is one of its weapons.' : `Asleep: put a ${bridgeNames.replace(' + ', ' or ')} weapon in your main hand.`;
    y = wrap(status, y + 10, 'bold 11px Arial', owned && active ? '#8fdca6' : '#e0a868', 3);
  } else if (cf.kind === 'stat') {
    y = wrap('Counts for every weapon, in either hand.', y + 10, '11px Arial', '#bbb49d', 2);
  } else if (cf.kind === 'move') {
    y = wrap('Always ready once grown, whatever you hold.', y + 10, '11px Arial', '#bbb49d', 2);
  }
  if (!owned) {
    const how = reachable ? `${cf.kind === 'seal' ? 'Unseal' : 'Grow'} for ${costLabel(cf.cost)}.`
      : cf.kind === 'trinity' ? 'Grow all three fusions first.'
        : 'Grow a linked node first. Each bridge starts from a tier III branch.';
    y = wrap(how, y + 12, 'bold 11px Arial', reachable ? '#f0d486' : '#9c967f', 3);
    if (reachable && growthBlock(cf.cost) === 'gate') {
      line(`Career XP ${Math.floor(branchState().xp)}/${growthXpRequirement()} to grow`, y + 14, 'bold 11px Arial', '#e0a868');
    }
  }
  drawBranchButton(layout.toggle, '—', owned ? 'always on' : 'no slot needed', owned ? color : '#4a4536', owned);
  const affordable = !owned && reachable && canAfford(cf.cost);
  drawBranchButton(layout.unlock, owned ? 'MAX' : cf.kind === 'seal' ? 'Unseal' : 'Grow', owned ? 'grown' : costLabel(cf.cost, true),
    affordable ? '#f0d486' : '#796b47', affordable);
}

// A tier's stat as an icon and a short label for its node on the map.
function branchFxBadge(fx = {}) {
  const percent = (value) => `${Math.round(Math.abs(value - 1) * 100)}%`;
  if (fx.shots) return { icon: '⋔', label: `+${fx.shots} SHOT` };
  if (fx.chain) return { icon: 'ϟ', label: `+${fx.chain} ARC` };
  if (fx.pierce) return { icon: '➶', label: `PIERCE +${fx.pierce}` };
  if (fx.explode) return { icon: '✸', label: fx.damage ? `BURST +${percent(fx.damage)}` : 'BIG BURST' };
  if (fx.linger) return { icon: '☁', label: fx.linger === 'long' ? '5s CLOUD' : 'CLOUD' };
  if (fx.fireWall) return { icon: '♨', label: 'ELEMENT WALL' };
  if (fx.arc) return { icon: '⟷', label: 'WIDE' };
  if (fx.parryDamage) return { icon: '⟲', label: `PARRY +${percent(fx.parryDamage)}` };
  if (fx.chargeSpeed) return { icon: '◎', label: `+${percent(fx.chargeSpeed)} CHG` };
  if (fx.rate) return { icon: '»', label: `${percent(fx.rate)} FAST` };
  if (fx.reach) return { icon: '⟷', label: `+${percent(fx.reach)} RCH` };
  if (fx.damage) return { icon: '⚔', label: `+${percent(fx.damage)} DMG` };
  return { icon: '✦', label: '' };
}

function weaponTraitText(entry) {
  const fx = entry.fx || {};
  const percent = (value) => `${value > 1 ? '+' : '−'}${Math.round(Math.abs(value - 1) * 100)}%`;
  const parts = [];
  if (fx.damage && fx.damage !== 1) parts.push(`${percent(fx.damage)} damage`);
  if (fx.rate && fx.rate !== 1) parts.push(fx.rate > 1 ? `${Math.round((fx.rate - 1) * 100)}% slower` : `${Math.round((1 - fx.rate) * 100)}% faster`);
  if (fx.reach && fx.reach !== 1) parts.push(`${percent(fx.reach)} reach`);
  if (fx.arc) parts.push(fx.arc > 0 ? 'wider swings' : 'narrow swings');
  if (fx.knockback) parts.push('heavy knockback');
  if (fx.stun) parts.push('stuns');
  if (fx.speed && fx.speed !== 1) parts.push(fx.speed > 1 ? 'fast shots' : 'slower shots');
  if (fx.range && fx.range !== 1) parts.push(`${percent(fx.range)} range`);
  if (fx.size && fx.size !== 1) parts.push('bigger shots');
  if (fx.homing) parts.push('curves toward foes');
  return parts.join(', ');
}

// Main / Off hand buttons for a learned weapon (the heart is its family's base weapon).
function drawWeaponHandButtons(layout, id, y) {
  const hand = weaponHandOf(id);
  if (y !== null) {
    const handText = hand === 'main' ? 'In your main hand.' : hand === 'off'
      ? (dualGripOwned() ? 'In your off hand: attacks on its own.' : 'In your off hand (sheathed until you Swap).') : 'Not in a hand.';
    ctx.textAlign = 'left';
    ctx.font = 'bold 11px Arial';
    ctx.fillStyle = hand ? '#8fdca6' : '#9c967f';
    ctx.fillText(handText, 676, y + 16, 228);
  }
  drawBranchButton(layout.toggle, 'Main', hand === 'main' ? 'in hand' : 'set main hand', hand === 'main' ? '#f0d486' : '#796b47', true);
  drawBranchButton(layout.unlock, 'Off', hand === 'off' ? 'in hand' : 'set off hand', hand === 'off' ? '#9fd8ff' : '#796b47', true);
}

function drawBranchScreen() {
  const now = performance.now();
  updateBranchMap(now);
  const layout = branchMapLayout();
  const state = branchState();
  const onConfluence = branchTab === 'confluence';
  const loadout = onConfluence ? [] : branchLoadout(branchTab);
  ctx.save();
  ctx.fillStyle = 'rgba(6, 8, 12, 0.78)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  drawManaPanel(26, 16, 908, 512, '#c9a65a');
  drawBranchMap(loadout, now);
  ctx.strokeStyle = '#4f4632';
  ctx.lineWidth = 1;
  ctx.strokeRect(BRANCH_MAP_VIEW.x + 0.5, BRANCH_MAP_VIEW.y + 0.5, BRANCH_MAP_VIEW.width - 1, BRANCH_MAP_VIEW.height - 1);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.font = 'bold 20px Georgia';
  ctx.fillStyle = '#f0d486';
  ctx.fillText('WEAPON BRANCHES', 42, 52);
  for (const tab of layout.tabs) {
    const selected = tab.style === branchTab;
    const label = tab.style === 'confluence'
      ? `✦ Confluence ${confluenceState().length}/${confluenceNodes().length}`
      : `${BRANCH_STYLE_NAMES[tab.style]} ${branchLoadout(tab.style).length}/${BRANCH_SLOTS}`;
    drawBranchButton(tab.bounds, label, '', selected ? '#f0d486' : '#796b47', selected);
  }
  drawBranchButton(layout.close, 'Close', '', '#796b47', true);
  drawBranchButton(layout.zoomOut, '−', '', '#796b47', true);
  drawBranchButton(layout.zoomIn, '+', '', '#796b47', true);
  drawBranchButton(layout.fit, '', '', '#796b47', true);
  drawMagnifierIcon(layout.fit.x + layout.fit.width / 2 - 2, layout.fit.y + layout.fit.height / 2 - 2, 8);
  if (!onConfluence) layout.sockets.forEach((bounds, index) => {
    const entry = branchById(loadout[index]);
    drawManaPanel(bounds.x, bounds.y, bounds.width, bounds.height, entry ? (branchPowered(entry) ? '#f0c75a' : '#c98a3c') : '#4a4536');
    ctx.textAlign = 'center';
    ctx.font = 'bold 18px Georgia';
    ctx.fillStyle = entry ? '#fff4d5' : '#4a4536';
    ctx.fillText(entry ? entry.icon : '·', bounds.x + bounds.width / 2, bounds.y + 26);
  });
  drawBranchInfo(layout, loadout);

  ctx.textAlign = 'left';
  ctx.font = 'bold 11px Arial';
  ctx.fillStyle = '#e9d39f';
  const runeCount = weaponState().runes || 0;
  const pouch = carriedMaterials() || {};
  ctx.fillText(`XP ${Math.floor(state.xp)}/${growthXpRequirement()} · ${bankedZenyBalance()}z bank · Ore ${pouch.ironOre || 0} ` +
    `Crystal ${pouch.darkCrystal || 0} Stone ${pouch.lifeStone || 0}${runeCount ? ` · Runes ${runeCount}` : ''}`, 42, 496, 284);
  if (branchNotice && performance.now() < branchNoticeUntil) {
    ctx.font = 'bold 12px Arial';
    ctx.fillStyle = '#ffe38a';
    ctx.fillText(branchNotice, 336, 496, 582);
  } else {
    const suggestion = suggestionLine(branchMapFocus);
    if (suggestion) {
      ctx.font = 'bold 11px Arial';
      ctx.fillStyle = suggestion.color;
      ctx.fillText(suggestion.text, 336, 496, 582);
    }
  }
  ctx.font = '11px Arial';
  ctx.fillStyle = '#bbb49d';
  const hint = lastInputMode === 'controller'
    ? 'Stick/D-pad: walk · A: on/off or main hand · Y: grow or off hand · X: learn or unweave · LB/RB: tab · LT/RT: zoom · B: close'
    : lastInputMode === 'touch'
      ? 'Drag to look around, pinch or +/− to zoom. Tap a node, then use the buttons on the right. Gold numbers suggest a path.'
      : 'WASD: walk · Enter: on/off or main · U: grow or off · R: learn or unweave · Q/E: tab · wheel: zoom · Esc: close';
  ctx.fillText(hint, 42, 514, 876);
  drawBranchGuide(now);
  ctx.restore();
}

function boonCardBounds(index) {
  return { x: VIEW_W / 2 - 360 + index * 248, y: 170, width: 224, height: 200 };
}

function moveBoonFocus(direction) {
  const count = boonChoices?.length || 0;
  if (count) boonFocus = (boonFocus + direction + count) % count;
}

function confirmBoonChoice(index = boonFocus) {
  if (performance.now() < boonInputGuardUntil) return false;
  return chooseBoon(index);
}

function handleBoonKey(event, key) {
  if (['1', '2', '3'].includes(key)) confirmBoonChoice(Number(key) - 1);
  else if (event.key === 'ArrowLeft' || key === 'a') moveBoonFocus(-1);
  else if (event.key === 'ArrowRight' || key === 'd') moveBoonFocus(1);
  else if (event.key === 'Enter' || event.key === ' ' || key === 'e') confirmBoonChoice();
}

function handleBoonPointer() {
  (boonChoices || []).forEach((_, index) => {
    if (!pointInBounds(boonCardBounds(index))) return;
    boonFocus = index;
    confirmBoonChoice(index);
  });
}

function drawBoonChoice() {
  if (!boonChoices) return;
  ctx.save();
  ctx.fillStyle = 'rgba(6, 8, 12, 0.66)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = 'bold 26px Georgia';
  ctx.fillStyle = '#7ee8ff';
  ctx.fillText(`LEVEL ${xpLevel - pendingBoonPicks + 1}: choose a boon`, VIEW_W / 2, 132);
  if (pendingBoonPicks > 1) {
    ctx.font = '13px Arial';
    ctx.fillStyle = '#bbb49d';
    ctx.fillText(`${pendingBoonPicks - 1} more after this one`, VIEW_W / 2, 154);
  }
  boonChoices.forEach((boon, index) => {
    const bounds = boonCardBounds(index);
    const hovered = lastInputMode === 'keyboard' && pointInBounds(bounds);
    const focused = index === boonFocus || hovered;
    drawManaPanel(bounds.x, bounds.y, bounds.width, bounds.height, focused ? '#7ee8ff' : '#796b47');
    const centerX = bounds.x + bounds.width / 2;
    ctx.font = 'bold 44px Georgia';
    ctx.fillStyle = focused ? '#bff4ff' : '#d8cfb2';
    ctx.fillText(boon.icon, centerX, bounds.y + 96);
    ctx.font = 'bold 20px Georgia';
    ctx.fillStyle = '#fff4d5';
    ctx.fillText(boon.name, centerX, bounds.y + 140, bounds.width - 20);
    ctx.font = '14px Arial';
    ctx.fillStyle = '#e6dcc0';
    ctx.fillText(boon.text, centerX, bounds.y + 166, bounds.width - 20);
    if (lastInputMode === 'keyboard') {
      ctx.font = 'bold 12px Arial';
      ctx.fillStyle = '#9c967f';
      ctx.fillText(`[${index + 1}]`, centerX, bounds.y + 22);
    }
  });
  ctx.font = '13px Arial';
  ctx.fillStyle = '#bbb49d';
  const hint = lastInputMode === 'controller' ? 'D-pad left/right to pick · A to take it'
    : lastInputMode === 'touch' ? 'Tap a boon to take it'
      : '1-3 or ←/→ then Enter · click a card';
  ctx.fillText(hint, VIEW_W / 2, 404);
  ctx.restore();
}

function elementCardBounds(index) {
  const column = index % 4;
  const row = Math.floor(index / 4);
  return { x: VIEW_W / 2 - 404 + column * 206, y: 150 + row * 138, width: 190, height: 124 };
}

// Every element is shown so players see what is still out there; only unlocked ones can be picked.
function elementPickerSlots() {
  return Object.keys(magicElementPalette).map((element) => ({ element, unlocked: Boolean(elementChoices?.includes(element)) }));
}

function moveElementFocus(dx, dy = 0) {
  if (!elementChoices?.length) return;
  const slots = elementPickerSlots();
  let index = slots.findIndex((slot) => slot.element === elementChoices[elementFocus]);
  for (let step = 0; step < slots.length; step += 1) {
    index = dy ? (index + dy * 4 + slots.length) % slots.length : (index + dx + slots.length) % slots.length;
    const found = elementChoices.indexOf(slots[index].element);
    if (found >= 0) {
      elementFocus = found;
      return;
    }
    if (dy) dy = 0, dx = Math.sign(dx) || 1;
  }
}

function confirmElementChoice(index = elementFocus) {
  if (performance.now() < elementInputGuardUntil) return false;
  return chooseElement(index);
}

function handleElementKey(event, key) {
  const number = Number(key);
  if (number >= 1 && number <= 8) {
    const found = elementChoices?.indexOf(elementPickerSlots()[number - 1]?.element) ?? -1;
    if (found >= 0) confirmElementChoice(found);
  } else if (event.key === 'ArrowLeft' || key === 'a') moveElementFocus(-1);
  else if (event.key === 'ArrowRight' || key === 'd') moveElementFocus(1);
  else if (event.key === 'ArrowUp' || key === 'w') moveElementFocus(0, -1);
  else if (event.key === 'ArrowDown' || key === 's') moveElementFocus(0, 1);
  else if (event.key === 'Enter' || event.key === ' ' || key === 'e') confirmElementChoice();
}

function handleElementPointer() {
  elementPickerSlots().forEach((slot, index) => {
    if (!pointInBounds(elementCardBounds(index))) return;
    const found = elementChoices.indexOf(slot.element);
    if (found < 0) {
      showMessage(`${magicElementName(slot.element)} is locked. Use an obelisk during this run to unlock it.`, 2.5);
      return;
    }
    elementFocus = found;
    confirmElementChoice(found);
  });
}

function drawElementChoice() {
  if (!elementChoices) return;
  ctx.save();
  ctx.fillStyle = 'rgba(6, 8, 12, 0.72)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = 'bold 26px Georgia';
  ctx.fillStyle = '#f0d486';
  ctx.fillText(elementPickSource === 'start' ? 'Choose your element for this run' : 'The obelisk offers every element you know',
    VIEW_W / 2, 108);
  ctx.font = '13px Arial';
  ctx.fillStyle = '#bbb49d';
  ctx.fillText('It stays locked in until you reach an obelisk.', VIEW_W / 2, 132);
  const focusedElement = elementChoices[elementFocus];
  elementPickerSlots().forEach((slot, index) => {
    const { element, unlocked } = slot;
    const bounds = elementCardBounds(index);
    const color = magicElementPalette[element];
    const hovered = unlocked && lastInputMode === 'keyboard' && pointInBounds(bounds);
    const focused = unlocked && (element === focusedElement || hovered);
    drawManaPanel(bounds.x, bounds.y, bounds.width, bounds.height, focused ? '#ffe38a' : unlocked ? color : '#3f3b30');
    const centerX = bounds.x + bounds.width / 2;
    if (unlocked) {
      drawEffect('glow', 0, centerX, bounds.y + 50, { width: focused ? 120 : 90, tint: color, alpha: focused ? 0.5 : 0.28, smooth: true });
      drawElementGlyph(element, centerX, bounds.y + 50, focused ? 44 : 36);
    }
    ctx.globalAlpha = 1;
    ctx.font = 'bold 18px Georgia';
    ctx.fillStyle = unlocked ? (focused ? '#fff4d5' : '#e6dcc0') : '#6f6a58';
    ctx.fillText(magicElementName(element), centerX, bounds.y + 98, bounds.width - 16);
    ctx.font = '11px Arial';
    ctx.fillStyle = unlocked ? '#9c967f' : '#5f5a4a';
    ctx.fillText(unlocked ? (element === activeMagicElement && elementPickSource !== 'start' ? 'current' : '')
      : 'locked', centerX, bounds.y + 115);
    if (unlocked && lastInputMode === 'keyboard') {
      ctx.font = 'bold 12px Arial';
      ctx.fillStyle = '#9c967f';
      ctx.fillText(`[${index + 1}]`, bounds.x + 18, bounds.y + 20);
    }
  });
  ctx.font = '13px Arial';
  ctx.fillStyle = '#bbb49d';
  const hint = lastInputMode === 'controller' ? 'D-pad to pick · A to attune'
    : lastInputMode === 'touch' ? 'Tap an element to attune'
      : '1-8 or arrows then Enter · click an element';
  ctx.fillText(hint, VIEW_W / 2, 446);
  ctx.restore();
}

function startingWeaponBounds(index) {
  return { x: VIEW_W / 2 - 330 + index * 224, y: 190, width: 212, height: 156 };
}

function moveStartingWeaponFocus(direction) {
  startingWeaponFocus = (startingWeaponFocus + direction + STARTING_WEAPON_STYLES.length) % STARTING_WEAPON_STYLES.length;
}

function confirmStartingWeaponChoice(index = startingWeaponFocus) {
  if (performance.now() < startingWeaponGuardUntil) return false;
  return chooseStartingWeapon(index);
}

function handleStartingWeaponKey(event, key) {
  if (event.key === 'ArrowLeft' || key === 'a') moveStartingWeaponFocus(-1);
  else if (event.key === 'ArrowRight' || key === 'd') moveStartingWeaponFocus(1);
  else if (['1', '2', '3'].includes(key)) confirmStartingWeaponChoice(Number(key) - 1);
  else if (event.key === 'Enter' || event.key === ' ' || key === 'e') confirmStartingWeaponChoice();
}

function handleStartingWeaponPointer() {
  const index = STARTING_WEAPON_STYLES.findIndex((style, slot) => pointInBounds(startingWeaponBounds(slot)));
  if (index < 0) return;
  startingWeaponFocus = index;
  confirmStartingWeaponChoice(index);
}

function drawStartingWeaponChoice() {
  ctx.save();
  ctx.fillStyle = 'rgba(6, 8, 12, 0.82)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.font = 'bold 26px Georgia';
  ctx.fillStyle = '#f2e5c6';
  ctx.fillText('CHOOSE YOUR STARTING WEAPON', VIEW_W / 2, 142);
  const names = ['Sword', 'Arrows', 'Magic'];
  const descriptions = ['Close-range strikes and parries', 'Tap shots and charged arrows', 'Bubble spells; visit obelisks'];
  STARTING_WEAPON_STYLES.forEach((style, index) => {
    const bounds = startingWeaponBounds(index);
    const focused = index === startingWeaponFocus || pointInBounds(bounds);
    drawManaPanel(bounds.x, bounds.y, bounds.width, bounds.height, focused ? '#7ee8ff' : '#796b47');
    const centerX = bounds.x + bounds.width / 2;
    const item = weaponById(BASE_WEAPON_FOR_STYLE[style]);
    drawShopItemIcon({ id: `weapon-${item.id}`, icon: `weapon-${item.id}`, kind: 'weapon' }, centerX, bounds.y + 48);
    ctx.fillStyle = '#fff4d5';
    ctx.font = 'bold 20px Georgia';
    ctx.fillText(names[index], centerX, bounds.y + 96);
    ctx.font = '12px Arial';
    ctx.fillStyle = '#d9c796';
    ctx.fillText(descriptions[index], centerX, bounds.y + 126, bounds.width - 12);
  });
  ctx.font = '13px Arial';
  ctx.fillStyle = '#d9c796';
  ctx.fillText(lastInputMode === 'controller' ? 'D-pad left/right, then A'
    : lastInputMode === 'touch' ? 'Tap a weapon to start'
      : '1-3, click, or Left/Right then Enter', VIEW_W / 2, 392);
  ctx.restore();
}

// ---- Starting-ability picker (before the final weapon choice) ----
function abilitySlotBounds(slot) {
  const x = VIEW_W / 2 - 396 + slot.column * 268;
  if (slot.row >= START_ABILITY_ROWS) return { x, y: 404, width: 256, height: 44 };
  return { x, y: 160 + slot.row * 58, width: 256, height: 50 };
}

function confirmAbilityChoice(index = abilityFocus) {
  if (performance.now() < abilityInputGuardUntil) return false;
  return chooseStartAbility(index);
}

function skipAbilityChoice() {
  const index = abilitySlots?.findIndex((slot) => slot.kind === 'skip') ?? -1;
  return index >= 0 && confirmAbilityChoice(index);
}

function handleAbilityKey(event, key) {
  if (event.key === 'ArrowLeft' || key === 'a') moveAbilityFocus(-1);
  else if (event.key === 'ArrowRight' || key === 'd') moveAbilityFocus(1);
  else if (event.key === 'ArrowUp' || key === 'w') moveAbilityFocus(0, -1);
  else if (event.key === 'ArrowDown' || key === 's') moveAbilityFocus(0, 1);
  else if (event.key === 'Enter' || event.key === ' ' || key === 'e') confirmAbilityChoice();
  else if (event.key === 'Escape') skipAbilityChoice();
}

function handleAbilityPointer() {
  const index = abilitySlots?.findIndex((slot) => pointInBounds(abilitySlotBounds(slot))) ?? -1;
  if (index < 0) return;
  abilityFocus = index;
  confirmAbilityChoice(index);
}

// A solid element-coloured disc so the mark reads even when the element sprite is faint at small sizes.
function drawAbilityElementBadge(element, color, x, y, radius) {
  ctx.save();
  ctx.fillStyle = 'rgba(8, 10, 14, 0.85)';
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius - 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  drawElementGlyph(element, x, y, radius * 2.2);
}

function drawAbilityChoice() {
  if (!abilitySlots) return;
  const element = getActiveAttackElement();
  const elementColor = magicElementPalette[element] || '#bff4ff';
  ctx.save();
  ctx.fillStyle = 'rgba(6, 8, 12, 0.72)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = 'bold 26px Georgia';
  ctx.fillStyle = '#f0d486';
  ctx.fillText('Choose a starting ability', VIEW_W / 2, 92);
  ctx.font = '13px Arial';
  ctx.fillStyle = '#bbb49d';
  ctx.fillText('Any weapon. Its branch lights up and the weapon goes in your hand. Find more in the descent.', VIEW_W / 2, 116);
  BRANCH_STYLES.forEach((style, column) => {
    const x = VIEW_W / 2 - 396 + column * 268 + 128;
    const base = weaponById(BASE_WEAPON_FOR_STYLE[style]);
    ctx.font = 'bold 17px Georgia';
    ctx.fillStyle = '#e6dcc0';
    ctx.fillText(`${base?.icon || ''} ${BRANCH_STYLE_NAMES[style]}`, x, 148);
    if (!abilitySlots.some((slot) => slot.kind === 'item' && slot.style === style)) {
      ctx.font = 'italic 12px Arial';
      ctx.fillStyle = '#6f6a58';
      ctx.fillText('None found yet', x, 190);
    }
  });
  abilitySlots.forEach((slot, index) => {
    const bounds = abilitySlotBounds(slot);
    const hovered = lastInputMode === 'keyboard' && pointInBounds(bounds);
    const focused = index === abilityFocus || hovered;
    const accent = slot.kind === 'random' ? elementColor : slot.kind === 'skip' ? '#5f5a4a' : '#796b47';
    drawManaPanel(bounds.x, bounds.y, bounds.width, bounds.height, focused ? '#ffe38a' : accent);
    const midY = bounds.y + bounds.height / 2;
    if (slot.kind === 'skip') {
      ctx.textAlign = 'center';
      ctx.font = 'bold 15px Georgia';
      ctx.fillStyle = focused ? '#fff4d5' : '#bbb49d';
      ctx.fillText('Skip: start without one', bounds.x + bounds.width / 2, midY + 5);
      return;
    }
    ctx.textAlign = 'left';
    if (slot.kind === 'random') {
      if (element) {
        drawAbilityElementBadge(element, elementColor, bounds.x + 28, midY, 16);
      }
      ctx.font = 'bold 15px Georgia';
      ctx.fillStyle = focused ? '#fff4d5' : '#e6dcc0';
      ctx.fillText(`Random ${element ? magicElementName(element) : ''} ability`, bounds.x + 52, midY - 3, bounds.width - 62);
      ctx.font = '11px Arial';
      ctx.fillStyle = '#9c967f';
      ctx.fillText('Suits your element; may be one not found yet', bounds.x + 52, midY + 13, bounds.width - 62);
      return;
    }
    drawShopItemIcon(slot.item, bounds.x + 28, midY);
    ctx.font = 'bold 15px Georgia';
    ctx.fillStyle = focused ? '#fff4d5' : '#e6dcc0';
    ctx.fillText(slot.item.name, bounds.x + 52, midY - 3, bounds.width - 84);
    ctx.font = '11px Arial';
    ctx.fillStyle = '#9c967f';
    ctx.fillText(slot.item.description.replace(/^\w+: /, ''), bounds.x + 52, midY + 13, bounds.width - 62);
    if (element && abilitySuitsElement(slot.item, element)) {
      drawAbilityElementBadge(element, elementColor, bounds.x + bounds.width - 16, bounds.y + 15, 10);
    }
  });
  ctx.textAlign = 'center';
  ctx.font = '13px Arial';
  ctx.fillStyle = '#bbb49d';
  const hint = lastInputMode === 'controller' ? 'D-pad to pick · A to take it · B to skip'
    : lastInputMode === 'touch' ? 'Tap an ability to take it'
      : 'Arrows then Enter · Esc to skip · click a card';
  ctx.fillText(hint, VIEW_W / 2, 476);
  if (element) {
    ctx.font = '11px Arial';
    ctx.fillStyle = elementColor;
    const anyMarked = abilitySlots.some((slot) => slot.kind === 'item' && abilitySuitsElement(slot.item, element));
    const lead = anyMarked ? `Marked abilities suit ${magicElementName(element)}.` : `Random may find a ${magicElementName(element)} ability.`;
    ctx.fillText(`${lead} Every ability takes on your element.`, VIEW_W / 2, 494);
  }
  ctx.restore();
}

function openControls(from) {
  if (mode !== 'select' && mode !== 'paused') return;
  controlsReturnMode = from;
  controlsTab = lastInputMode === 'controller' ? 'pad' : 'key';
  controlsRow = 0;
  controlsCapture = false;
  mode = 'controls';
  updateHud();
}

function closeControls() {
  if (mode !== 'controls') return;
  controlsCapture = false;
  mode = controlsReturnMode;
  updateHud();
}

function activateControlsRow() {
  const actions = controlsActionList();
  if (controlsRow >= actions.length) {
    resetBindings(controlsTab);
    saveBindings();
    showMessage(`${controlsTab === 'key' ? 'Keyboard' : 'Controller'} controls reset to defaults.`, 2);
    return;
  }
  controlsCapture = true;
}

function clearControlsRow() {
  const action = controlsActionList()[controlsRow];
  if (!action) return;
  assignBinding(controlsTab, action.id, controlsTab === 'key' ? '' : null);
}

function moveControlsRow(delta) {
  const count = controlsActionList().length + 1;
  controlsRow = (controlsRow + delta + count) % count;
}

function switchControlsTab() {
  controlsTab = controlsTab === 'key' ? 'pad' : 'key';
  controlsRow = Math.min(controlsRow, controlsActionList().length);
}

function handleControlsKey(event, key) {
  if (controlsCapture) {
    if (controlsTab !== 'key' || key === 'escape') {
      controlsCapture = false;
    } else if (reservedKeys.has(key)) {
      showMessage(`${keyLabel(key)} is reserved. Pick another key.`, 2);
    } else {
      bindCaptured('key', key);
    }
    return;
  }
  if (key === 'escape') closeControls();
  else if (key === 'arrowup') moveControlsRow(-1);
  else if (key === 'arrowdown') moveControlsRow(1);
  else if (key === 'arrowleft' || key === 'arrowright') switchControlsTab();
  else if (key === 'enter' || key === ' ') activateControlsRow();
  else if (key === 'delete' || key === 'backspace') clearControlsRow();
}

function updateControlsPad(wasPressed) {
  if (controlsCapture) {
    if (controlsTab !== 'pad') {
      if (wasPressed(1)) controlsCapture = false;
      return;
    }
    for (let button = 0; button < 16; button += 1) {
      if (!wasPressed(button)) continue;
      if (button === 9) controlsCapture = false;
      else if (reservedPadButtons.has(button)) showMessage(`${padButtonLabel(button)} is reserved for firing. Pick another button.`, 2);
      else bindCaptured('pad', button);
      break;
    }
    return;
  }
  if (wasPressed(12)) moveControlsRow(-1);
  else if (wasPressed(13)) moveControlsRow(1);
  else if (wasPressed(14) || wasPressed(15) || wasPressed(4) || wasPressed(5)) switchControlsTab();
  else if (wasPressed(0)) activateControlsRow();
  else if (wasPressed(2)) clearControlsRow();
  else if (wasPressed(1) || wasPressed(9)) closeControls();
}

function handleControlsPointer() {
  if (controlsCapture) {
    controlsCapture = false;
    return;
  }
  for (const tab of ['key', 'pad']) {
    if (pointInBounds(controlsTabBounds(tab)) && controlsTab !== tab) switchControlsTab();
  }
  if (pointInBounds(controlsBackBounds())) {
    closeControls();
    return;
  }
  const count = controlsActionList().length + 1;
  for (let index = 0; index < count; index += 1) {
    if (!pointInBounds(controlsRowBounds(index))) continue;
    controlsRow = index;
    activateControlsRow();
  }
}

function drawControls() {
  const actions = controlsActionList();
  controlsRow = Math.min(controlsRow, actions.length);
  ctx.fillStyle = '#111714';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  drawManaPanel(42, 28, VIEW_W - 84, VIEW_H - 56);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#d9bd83';
  ctx.font = 'bold 13px Arial';
  ctx.fillText('CUSTOMISE', 70, 58);
  ctx.fillStyle = '#eef0df';
  ctx.font = 'bold 28px Georgia';
  ctx.fillText('Controls', 70, 94);

  ctx.font = 'bold 12px Arial';
  ctx.textAlign = 'center';
  for (const tab of ['key', 'pad']) {
    const b = controlsTabBounds(tab);
    ctx.fillStyle = controlsTab === tab ? '#49634d' : '#28352d';
    ctx.fillRect(b.x, b.y, b.width, b.height);
    ctx.strokeStyle = controlsTab === tab ? '#a5c79b' : '#63796a';
    ctx.lineWidth = 1;
    ctx.strokeRect(b.x, b.y, b.width, b.height);
    ctx.fillStyle = '#e4f0d7';
    ctx.fillText(tab === 'key' ? 'KEYBOARD' : 'CONTROLLER', b.x + b.width / 2, b.y + 16);
  }
  ctx.textAlign = 'left';
  ctx.fillStyle = '#9fb59f';
  ctx.font = '11px Arial';
  ctx.fillText(controlsTab === 'key'
    ? 'Fixed: WASD move · mouse aim · left-click attack · wheel next weapon · right-click ability · P pause'
    : `Fixed: left stick move · right stick aim · ${padButtonLabel(7)} or ${padButtonLabel(2)} fire · ${padButtonLabel(9)} pause`, 400, 128);

  actions.forEach((action, index) => {
    const b = controlsRowBounds(index);
    const selected = controlsRow === index;
    ctx.fillStyle = selected ? '#2f4636' : index % 2 ? '#1d2922' : '#202d25';
    ctx.fillRect(b.x, b.y, b.width, b.height);
    if (selected) {
      ctx.strokeStyle = '#a5c79b';
      ctx.strokeRect(b.x, b.y, b.width, b.height);
    }
    ctx.textAlign = 'left';
    ctx.font = 'bold 13px Arial';
    ctx.fillStyle = '#e4ebd8';
    ctx.fillText(action.label, b.x + 12, b.y + 15);
    const boxX = b.x + 240;
    ctx.fillStyle = selected && controlsCapture ? '#5a4d2a' : '#0e1411';
    ctx.fillRect(boxX, b.y + 2, 170, b.height - 4);
    ctx.strokeStyle = selected && controlsCapture ? '#e0c77c' : '#4e6455';
    ctx.strokeRect(boxX, b.y + 2, 170, b.height - 4);
    ctx.textAlign = 'center';
    ctx.fillStyle = selected && controlsCapture ? '#fff1c9' : '#ffe38a';
    const value = controlsTab === 'key' ? keyLabel(bindings.key[action.id])
      : bindings.pad[action.id] === null ? '—' : padButtonLabel(bindings.pad[action.id]);
    ctx.fillText(selected && controlsCapture ? (controlsTab === 'key' ? 'PRESS A KEY…' : 'PRESS A BUTTON…') : value,
      boxX + 85, b.y + 15);
    ctx.textAlign = 'left';
    ctx.font = '12px Arial';
    ctx.fillStyle = '#a9b8a5';
    ctx.fillText(action.desc, boxX + 190, b.y + 15);
  });
  const resetBounds = controlsRowBounds(actions.length);
  ctx.fillStyle = controlsRow === actions.length ? '#4a3a2a' : '#2a2520';
  ctx.fillRect(resetBounds.x, resetBounds.y, resetBounds.width, resetBounds.height);
  if (controlsRow === actions.length) {
    ctx.strokeStyle = '#e0c77c';
    ctx.strokeRect(resetBounds.x, resetBounds.y, resetBounds.width, resetBounds.height);
  }
  ctx.fillStyle = '#f0d9a8';
  ctx.font = 'bold 13px Arial';
  ctx.fillText(`Reset ${controlsTab === 'key' ? 'keyboard' : 'controller'} to defaults`, resetBounds.x + 12, resetBounds.y + 15);

  const back = controlsBackBounds();
  ctx.fillStyle = pointInBounds(back) ? '#52664f' : '#30443b';
  ctx.fillRect(back.x, back.y, back.width, back.height);
  ctx.strokeStyle = '#a5c79b';
  ctx.strokeRect(back.x, back.y, back.width, back.height);
  ctx.fillStyle = '#e4f0d7';
  ctx.textAlign = 'center';
  ctx.font = 'bold 12px Arial';
  ctx.fillText('BACK', back.x + back.width / 2, back.y + 19);
  ctx.fillStyle = '#9fb59f';
  ctx.font = '11px Arial';
  ctx.fillText('Changes save automatically and update the tutorial and on-screen prompts. A key or button already in use swaps places.',
    VIEW_W / 2, 508);
}

function tutorialButtonBounds() {
  return { x: VIEW_W - 174 - 160, y: 80, width: 150, height: 30 };
}

function tutorialNavBounds(which) {
  if (which === 'prev') return { x: 70, y: 468, width: 130, height: 30 };
  if (which === 'next') return { x: VIEW_W - 200, y: 468, width: 130, height: 30 };
  return { x: VIEW_W / 2 - 65, y: 468, width: 130, height: 30 };
}

function openTutorial() {
  if (mode !== 'select') return;
  mode = 'tutorial';
  tutorialPage = 0;
  updateHud();
}

function closeTutorial() {
  if (mode !== 'tutorial') return;
  mode = 'select';
  updateHud();
}

function stepTutorial(direction) {
  tutorialPage = clamp(tutorialPage + direction, 0, tutorialPages().length - 1);
}

function tutorialPages() {
  const pad = lastInputMode === 'controller';
  const p = padLabels();
  const k = (keyboard, controller) => (pad ? controller : keyboard);
  const b = (id) => bindLabel(id, true);
  return [
    { title: 'THE GOAL', sections: [
      ['Descend the Sanctum', 'Each floor is a chain of up to 10 rooms. Clear a floor, find its boss room, defeat the boss and step onto the descent pad to go deeper. Every floor brings stronger foes.'],
      ['Clear rooms to move on', 'Doors are shut while enemies live. Kill everything in a room and its doors open. A locked door needs a key instead, and shows a lock on the wall.'],
      ['Stay alive', 'Start with four hearts at the top left, each split into two hit points. Direct enemy contact costs a full heart; ordinary projectiles and splash cost half a heart. Telegraphed boss heavy slams cost TWO hearts. Floor hearts heal a full heart.'],
      ['Grow stronger', 'Kills give XP. Each level-up lets you pick 1 of 3 boons once the room is clear. Items, weapon branches and boons make each run different. If you fall, unlocks, branch tiers and banked zeny carry over.'],
    ] },
    { title: 'CONTROLS', sections: [
      ['Move and aim', pad
        ? `Left stick moves. Right stick aims and fires, or hold ${p.rt} to fire. The D-pad never moves you in play.`
        : lastInputMode === 'touch'
          ? 'Drag the left area to move. Hold Attack to target the nearest live enemy. With no enemies in the room, drag Attack to aim freely, or hold without dragging to fire where you face.'
          : 'W A S D moves. The mouse aims and left click fires. Hold to keep attacking.'],
      ...(lastInputMode === 'touch' ? [
        ['Fight', 'Dash sits just above and right of Attack; Bomb and Wave sit to its left (counts show what is left). Switch cycles weapons. Skill appears only for classes with an active skill (Sapper, Scribe, Keeper) and counts down its cooldown.'],
        ['Use things', 'Near a shop stall, pad, menhir, obelisk or altar with no enemies left, Attack glows gold and reads Use: tap it to buy, talk or activate. Walk into an open doorway to go through. Item appears once you carry a consumable from a broken pot or crate.'],
        ['Menus', 'Map, Story and Build (cleared rooms) are on the left (top in portrait); Pause is on the right. The pause screen has Resume and Save & exit buttons.'],
      ] : [
      ['Fight', `${b('dash')} dashes. ${b('nextWeapon')} cycles weapons${pad ? '' : `, ${b('weapon1')}/${b('weapon2')}/${b('weapon3')} pick melee/bow/magic`}. ${b('shock')} unleashes a shockwave; discover Betsanc to replace it with orbiting weapon guards. Firing follows your controller right stick, touch auto-target (manual aim/facing with no enemies), or mouse cursor. ${b('ability')} uses your class ability.`],
      ['Use things', `${b('interact')} interacts: buy, talk, open doors. ${b('bomb')} drops a bomb. ${b('item')} uses a consumable.`],
      ['Menus', `${b('map')} map, ${b('journal')} journal, ${b('branches')} weapon branches (cleared rooms), ${pad ? p.menu : 'P'} pause.       Change controls in Controls (${pad ? 'Back on the pause screen' : 'C on the title or pause screen'}).${pad ? '' : ' The buttons beside the game (Pause on the right) do the same with a click.'}`],
            ]),
          ] },
    { title: 'READING THE SCREEN', sections: [
      ['Top: weapons', 'Three slots: melee, bow and magic. The lit slot is your active weapon. Every weapon is always ready, no ammo needed.'],
      ['Bottom: action bar', `One chip per action with its ${k('key', 'button')} in the corner, a count, and a dark shade for cooldown. Dim means you have none. AUTO means it fires by itself.`],
      ['Pause screen', 'Pausing shows an icon for every item you carry, so you can check your build at any time.'],
    ] },
    { title: 'WEAPONS', sections: [
      ['Three weapon types', 'Melee swings a blade, the bow fires arrows and magic casts bolts. Your class hits hardest with one, but every weapon is always ready.'],
      ['No ammo, no waiting', 'There is nothing to refill or recharge. Swap weapons freely to fit the fight and just keep attacking.'],
      ['Foes adapt', 'Ordinary foes adjust their tactics to the weapon you have been using for the past few seconds. Melee, bow and magic each draw a different response; bosses are unaffected.'],
      ['Deflect and elements', 'Bat shots out of the air anywhere along your visible melee sweep. The first clean intercept per swing has a 40% chance to heal half a heart. Late body-contact deflections still hurt. Charged releases deflect nearby shots outward. Arrow tips knock a shot away 50% of the time (75% for charged arrows). Returned shots keep their original appearance.'],
      ['Arrow returns', 'Shoot enemy projectiles away with the forgiving area around an arrow tip. Clashes accelerate shots and scatter them widely, retaining their original look. An arrow-returned shot has one 40% chance to heal half a heart when it first damages an enemy. Interception alone never heals.'],
      ['Spore Bloom', 'Collect mushroom spores to make magic shots split into eight slowing projectiles when they hit an enemy, object, or wall. The smaller spores do not split again. Collecting it also unlocks Sporeling for future runs.'],
      ['Wild magic', 'Every class starts each run with Bubble (Water), regardless of profile discoveries. Only an obelisk unlocks another element during the run and lets you choose among the elements reached in that descent. Sigils never bypass this lock. Choose Sword, Arrows or Magic at the start. Magic effects share your element color. White diamond marks identify friendly effects. Mage surprises: 40% enemy, 20% object, 6% special shot; others: 10%, 5%, 1%. Bosses cannot be lifted or teleported.'],
    ] },
    { title: 'BUILD', sections: [
      ['Weapon branches', `Build (${b('branches')}, cleared rooms) opens a map for each weapon: its heart in the middle, five branches growing outward and synergy gems between partners. Drag or pinch to look around, zoom with the wheel or +/−, and walk your character node to node. Highlight up to 3 branches per weapon. Behaviour items such as Prism or the bow and blade mods only work while a highlighted branch of the held weapon lists them, and an item branch stays dormant until you find its item. Two powered, highlighted partners awaken their synergy. Tier II and III nodes show their stat as an icon. Your picks are remembered between runs.`],
      ['Growing', 'Every growth needs career XP past a gate (XP is never spent, but each growth raises the next gate), plus a price by kind. Stats cost what suits them: form stats (shots, arcs, pierce, reach, bursts) Iron Ore, power stats (damage) Dark Crystals, speed stats (attack, charge, parry timing) banked zeny. Abilities are padlocked lock nodes paid with Life Stones: behaviour tiers such as Fire Wall, learning a weapon (1), Dual Grip (2), and the Confluence seals, fusions, moves and Trinity. Life Stones drop from elites, minibosses, caches and the boss Lifestone. If something cannot be grown, the screen dims and an arrow points at what is missing.'],
      ['Found weapons and hands', 'Any weapon (axe, halberd, kunai and more) can be set as your main or off hand from its family\'s map at any time. Unfound weapons hit at 70%, weapons found in caches at 85%, and learned weapons at full power. The HUD weapon icons show what each hand holds (M main, O off) and its power. Grow Dual Grip and the off hand attacks foes in front of you on its own, charging only if its own map has a charge branch. Unweaving Runes undo one growth for a full refund.'],
      ['Suggested path', 'Gold numbers on each map suggest the next three growths, based on what you highlight, grow and attack with (holding to charge or tapping fast). It is only a hint: any node can still be chosen.'],
    ] },
    { title: 'THE CONFLUENCE', sections: [
      ['The Confluence', 'Once branches reach tier III, the Confluence tab joins the Blade, Bow and Magic maps. Each bridge starts and ends with a Bridge Seal (a lock opened with a Life Stone), then has stat nodes, a fusion that works while either of its weapons is in your main hand, and a move: Weapon Form (dash through foes), Earthshaker (dash while holding attack to smash the ground) or Elemental Call (two creatures of your element join each fight). The Trinity at the centre wakes every fusion.'],
      ['Element ground effects', 'Lightning charges water into pools that shock foes, ice leaves slush that slows them and puts fire out, and fire boils puddles away.'],
    ] },
    { title: 'CONSUMABLES, BOMBS, MANA GUARD', sections: [
      ['Consumables', `Break scenery to uncover stored consumables. Press ${b('item')} to use one. The Item chip shows what is ready and how many you have.`],
      ['Bombs', `Press ${b('bomb')} to drop a bomb. Shots from either side push grounded bombs; they slide and bounce off scenery without resetting the fuse. Explosions hurt nearby foes and open sealed rooms. Stay out of the blast.`],
      ['Shockwave and Mana familiars', `Your shockwave clears hostile shots and pushes foes away. Find Betsanc to replace it: each room clear fills one charge, up to eight. Five charges summon up to three weapon icons that orbit 32 pixels away; each blocks one hostile hit or strikes one enemy, then disappears. The orbit caps at 13; if it is full, charge is kept.`],
      ['Frost and class ability', `Frost is automatic: once found it chills nearby foes by itself until you attune at an obelisk. Your class ability (${b('ability')}) has a cooldown; its chip shows when it is ready.`],
    ] },
    { title: 'SHOPS, ZENY AND KEYS', sections: [
      ['Zeny', `Enemies and rooms drop zeny. Spend it in shops, or bank it so it stays with you after a run ends. Iron Ore and Dark Crystals drop from foes too: stand on the shop’s left pad and press ${b('interact')} to sell them for zeny.`],
      ['Shops', `Walk up to an item and press ${b('interact')} to buy it. Walking over an item never buys it. A shop is also a bank.`],
      ['Bank', `Stand on the vault pad and press ${b('interact')} to deposit what you carry, or on the withdraw pad to take your savings. ${pad ? p.b : 'Shift+' + b('interact')} near the vault withdraws too.`],
      ['Keys and chests', 'Keys open locked doors and chests. You will never be offered an item you already own.'],
    ] },
    { title: 'ROOMS, MAP AND ENEMIES', sections: [
      ['The minimap', `Top right. Bright rooms are visited. A dark room is one you have seen a door to but not entered. Press ${b('map')} for the full map. A bigger room is drawn bigger. From a cleared room, pick another cleared room on the full map to travel there.`],
      ['Doors', 'A shut door is locked until the room is clear, or needs a key. An open door is free to use. Bombed entrances stay hidden until you find them.'],
      ['Enemies', 'Foes adapt to your input after about 2.5 seconds: touch draws close-range jukes, gamepads draw stronger flanking and staggered overlaps, and mouse/keyboard draws more predictive aim. Enemies steer around cover. Ranged windups show a locked aim line: change direction after they commit. Later floors also mix in mini boss moves.'],
      ['Bosses', 'Bosses have three distinct phases. Reaching a new phase restores up to TWO hearts. Watch fixed ground warnings: heavy slams cost TWO hearts. Bosses also mark your path and use wide pulses in later phases. Bosses resist slowing, but have readable windups and recovery windows. When defeated, their summoned attacks clear and the descent opens.'],
      ['Wide pulses', `A large marked circle warns before the blast and is too wide to walk out of in time. Ordinary mobs can use it too. Press ${b('dash')} at DASH NOW to use your brief invulnerability. Dashing too early may leave you exposed. These checks only begin from the second floor, with Dash ready and no competing hostile shots or nearby ground hazards. They can be turned off with Adaptive enemies on the pause screen.`],
      ['Altar rooms', `Some floors have an unlocked side room with two altars (R on the map). Stand at one and press ${b('interact')}. The left altar takes one heart container for an upgrade. The right altar seals the doors and starts an ambush; clearing it gives a heart vessel. Each room allows one choice.`],
      ['Optional trials', 'Key-locked trial rooms are enemy-free mini-games: route light with mirrors, repeat a rune sequence, or chase moving sparks. Complete one for a collectible reward; an uncollected regional Codex appears most of the time.'],
    ] },
    { title: 'TIPS FOR A GOOD RUN', sections: [
      ['Keep moving', `Dash with ${b('dash')} to slip out of danger. Strafe around foes instead of standing still.`],
      ['Know your base weapon', 'Your class weapon hits hardest, but swapping to another weapon for range or crowds is always free.'],
      ['Spend zeny', 'Buy items, or stand on the shop’s right pad and interact to repair armor. Keep a few coins in the bank so a bad run does not cost you everything.'],
      ['Make it yours', 'Open Controls to rebind keys and buttons. This guide updates to match. Enjoy the descent.'],
    ] },
  ];
}

function drawTutorial() {
  const pages = tutorialPages();
  tutorialPage = clamp(tutorialPage, 0, pages.length - 1);
  const page = pages[tutorialPage];
  const pad = lastInputMode === 'controller';
  ctx.fillStyle = '#111714';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  drawManaPanel(42, 28, VIEW_W - 84, VIEW_H - 56);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#d9bd83';
  ctx.font = 'bold 13px Arial';
  ctx.fillText(`HOW TO PLAY  ·  ${tutorialPage + 1} / ${pages.length}`, 70, 58);
  ctx.fillStyle = '#eef0df';
  ctx.font = 'bold 28px Georgia';
  ctx.fillText(page.title, 70, 94);
  ctx.strokeStyle = '#3d5546';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(70, 108);
  ctx.lineTo(VIEW_W - 70, 108);
  ctx.stroke();

  const colWidth = 390;
  const colY = [132, 132];
  page.sections.forEach(([heading, body], index) => {
    const col = index % 2;
    const x = 70 + col * (colWidth + 20);
    ctx.fillStyle = '#a5c79b';
    ctx.font = 'bold 16px Arial';
    ctx.fillText(heading, x, colY[col]);
    ctx.fillStyle = '#d6dccd';
    ctx.font = '15px Arial';
    const lines = wrapCanvasText(body, x, colY[col] + 23, colWidth, 20);
    colY[col] += 23 + lines * 20 + 24;
  });

  ctx.textAlign = 'center';
  ctx.font = 'bold 12px Arial';
  for (const which of ['prev', 'close', 'next']) {
    const b = tutorialNavBounds(which);
    const disabled = (which === 'prev' && tutorialPage === 0) || (which === 'next' && tutorialPage === pages.length - 1);
    const hover = pointer.x >= b.x && pointer.x <= b.x + b.width && pointer.y >= b.y && pointer.y <= b.y + b.height;
    ctx.globalAlpha = disabled ? 0.35 : 1;
    ctx.fillStyle = hover && !disabled ? '#52664f' : '#30443b';
    ctx.fillRect(b.x, b.y, b.width, b.height);
    ctx.strokeStyle = '#a5c79b';
    ctx.strokeRect(b.x, b.y, b.width, b.height);
    ctx.fillStyle = '#e4f0d7';
    ctx.fillText(which === 'prev' ? '◀  PREVIOUS' : which === 'next' ? 'NEXT  ▶' : 'BACK', b.x + b.width / 2, b.y + 20);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = '#9fb59f';
  ctx.font = '11px Arial';
  ctx.fillText(pad ? `D-Pad ←/→ Page  ·  ${padLabels().b} Back` : '←/→ Page  ·  Esc Back', VIEW_W / 2, 508);
}

function drawRunSummary(title) {
  const centerX = VIEW_W / 2;
  ctx.save();
  ctx.fillStyle = 'rgba(10, 9, 14, 0.88)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f1dec1';
  ctx.font = 'bold 38px Georgia';
  ctx.fillText(title, centerX, 112);

  const minutes = Math.floor(runStats.seconds / 60);
  const seconds = String(Math.floor(runStats.seconds % 60)).padStart(2, '0');
  const lines = [
    `${character?.name || 'Delver'}  •  Level ${xpLevel}  •  Floor ${currentFloor} of ${finalFloor}  •  ${minutes}:${seconds}`,
    `Score ${score}  •  Foes defeated ${runStats.kills}  •  Guardians ${runStats.guardians}  •  Zeny found ${runStats.zenyFound}`,
  ];
  if (mode === 'gameover' && runStats.lastHitBy) lines.push(`Last hit: ${runStats.lastHitBy}`);
  ctx.font = '16px Arial';
  lines.forEach((line, index) => ctx.fillText(line, centerX, 158 + index * 26));

  const routeY = 158 + lines.length * 26 + 14;
  ctx.fillStyle = '#c8cbbd';
  ctx.font = '13px Arial';
  const route = mapOrder.slice(0, currentFloor).map((id) => floorThemes[id]?.name || id).join('  →  ');
  const routeLines = wrapCanvasText(route, centerX, routeY, 780, 18);

  const items = shopItemCatalog.filter((item) => ownedItems.has(item.id));
  const iconsY = routeY + routeLines * 18 + 34;
  const perRow = 18;
  items.forEach((item, index) => {
    const row = Math.floor(index / perRow);
    const rowCount = Math.min(perRow, items.length - row * perRow);
    const x = centerX + (index % perRow - (rowCount - 1) / 2) * 36;
    drawShopItemIcon(item, x, iconsY + row * 38);
  });

  const unlockedNames = runStats.unlocked
    .map((id) => characterRoster.find((entry) => entry.id === id)?.name).filter(Boolean);
  if (unlockedNames.length > 0) {
    ctx.fillStyle = '#a8d39b';
    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'center';
    wrapCanvasText(`Unlocked: ${unlockedNames.join(', ')}`, centerX, 440, 780, 18);
  }

  ctx.fillStyle = '#f1dec1';
  ctx.font = '17px Arial';
  ctx.textAlign = 'center';
  ctx.globalAlpha = endScreenDelay > 0 ? 0.35 : 1;
  ctx.fillText(lastInputMode === 'controller' ? 'Press A to choose a delver'
    : 'Press Enter or click to choose a delver', centerX, 500);
  ctx.restore();
}

function returnToCharacterSelect() {
  if (endScreenDelay > 0) return;
  mode = 'select';
  // Stay on the delver who just descended instead of jumping back to the first card.
  selectedIndex = Math.max(0, characterRoster.indexOf(character));
  menuFocus = defaultMenuFocus();
  updateHud();
}

function drawStoryJournal() {
  ctx.save();
  drawManaPanel(72, 35, VIEW_W - 144, VIEW_H - 70);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#d9bd83';
  ctx.font = 'bold 13px Arial';
  ctx.fillText(`FIELD JOURNAL  /  ${currentFloorTheme().name}`, 104, 78);
  ctx.fillStyle = '#f2e3c4';
  ctx.font = 'bold 25px Georgia';
  ctx.fillText('Roadside notes', 104, 116);
  // Keep the newest entries that fit, then draw them oldest first.
  const textWidth = VIEW_W - 212;
  const top = 157;
  const bottom = VIEW_H - 85;
  ctx.font = '14px Arial';
  const visible = [];
  let height = 0;
  for (const entry of storyLog.slice().reverse()) {
    const lines = countWrappedLines(entry.text, textWidth);
    const entryHeight = 22 + lines * 20 + 18;
    if (top + height + entryHeight - 38 > bottom) break;
    visible.unshift(entry);
    height += entryHeight;
  }
  let y = top;
  for (const entry of visible) {
    ctx.fillStyle = '#d9bd83';
    ctx.font = 'bold 14px Arial';
    ctx.fillText(entry.title, 106, y);
    y += 22;
    ctx.fillStyle = '#d6d0be';
    ctx.font = '14px Arial';
    const lines = wrapCanvasText(entry.text, 106, y, textWidth, 20);
    y += lines * 20 + 18;
  }
  ctx.fillStyle = '#b9c8b3';
  ctx.font = '12px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('J / left-stick click · Close journal', VIEW_W / 2, VIEW_H - 68);
  ctx.restore();
}
