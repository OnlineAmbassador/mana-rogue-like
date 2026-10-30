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

// Pause-screen switch for input-adaptive enemy tactics (see BALANCE.md).
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
  const image = new Image();
  image.src = `${root}/${path}`;
  image.onerror = () => {
    messageEl.textContent = `Could not load artwork: ${root}/${path}`;
  };
  return image;
}

function soundUrl(path) {
  return path.startsWith('som:') ? `${somSoundRoot}/${path.slice(4)}` : `${soundRoot}/${path}`;
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

function itemEffectTagsFor(item) {
  if (item.effects) {
    return Object.entries(item.effects).map(([key, value]) =>
      `${value > 1 ? '+' : '-'}${effectKeyLabels[key] || key.toUpperCase()}`);
  }
  if (item.id.startsWith('heart-vessel-')) return ['+MAX HEART'];
  if (item.id.startsWith('luck-up-')) return ['+LUCK'];
  if (item.id.startsWith('sanctum-blessing')) return ['+MAX HEART', '+ATTACK'];
  if (item.chaos) return [item.chaos === 'room' ? '?RANDOM STATUS EACH ROOM' : '?RANDOM STATUS EVERY FEW SECONDS'];
  return itemEffectTags[item.id] || [item.description || ''].filter(Boolean);
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
      ctx.beginPath();
      ctx.moveTo(cx, cy + 6);
      ctx.bezierCurveTo(cx - 9, cy, cx - 6, cy - 8, cx, cy - 3);
      ctx.bezierCurveTo(cx + 6, cy - 8, cx + 9, cy, cx, cy + 6);
      ctx.fill();
      ctx.restore();
    } else if (pop.icon === 'key') {
      ctx.beginPath();
      ctx.arc(cx - 3, cy, 3, 0, Math.PI * 2);
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + 7, cy);
      ctx.moveTo(cx + 5, cy);
      ctx.lineTo(cx + 5, cy + 3);
      ctx.stroke();
    } else if (pop.icon === 'bomb') {
      ctx.beginPath();
      ctx.arc(cx, cy + 2, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx + 3, cy - 3);
      ctx.lineTo(cx + 6, cy - 7);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fill();
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
  const audio = new Audio(`assets/audio/intro-${card.key.replace(':', '-')}.ogg`);
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
  const items = [...equipped, ...supplies];
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
  let label = `Inventory  /  Equipped ${equipped.length}  /  Supplies ${supplies.length}`;
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
    if (item.count > 0) {
      ctx.font = `bold ${Math.max(7, Math.min(10, cell / 3))}px Arial`;
      ctx.textAlign = 'right';
      ctx.fillStyle = '#fff4d5';
      ctx.fillText(String(item.count), x + cell - 4, y + cell - 5);
    }
    if (hovered) label = item.name + (item.count > 0 ? ` (${item.count})` : '');
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

// The wall band is the existing 64px collision boundary; open doorways cut a 96px gap through it.
const ROOM_WALL_BAND = 64;
const DOOR_OPENING_HALF_WIDTH = 48;

function clipRoomWallBand() {
  const band = ROOM_WALL_BAND;
  const half = DOOR_OPENING_HALF_WIDTH;
  ctx.beginPath();
  ctx.rect(0, 0, ROOM_W, ROOM_H);
  ctx.rect(band, band, ROOM_W - band * 2, ROOM_H - band * 2);
  for (const { name } of directions) {
    const secretDoor = currentRoom.secretExit?.direction === name && !currentRoom.secretExit.room.hidden;
    if (!currentRoom.cleared || currentRoom.lockedDoors[name] ||
        !(currentRoom.links[name] || secretDoor)) continue;
    if (name === 'up' || name === 'down') {
      ctx.rect(ROOM_W / 2 - half, name === 'up' ? 0 : ROOM_H - band, half * 2, band);
    } else {
      ctx.rect(name === 'left' ? 0 : ROOM_W - band, ROOM_H / 2 - half, band, half * 2);
    }
  }
  ctx.clip('evenodd');
}

function drawCastleWalls() {
  if (!castleWallTiles.complete || castleWallTiles.naturalWidth < 512 ||
      castleWallTiles.naturalHeight < 192) return;
  const tile = (id, x, y, width, height) => {
    ctx.drawImage(castleWallTiles, id % 16 * 32, Math.floor(id / 16) * 32, 32, 32,
      x, y, width, height);
  };
  ctx.save();
  clipRoomWallBand();
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
  ctx.restore();
}

function drawRoomFloor() {
  const theme = currentFloorTheme();
  if (currentRoom.type === 'secret' && sacredRoomTiles.complete && sacredRoomTiles.naturalWidth > 0) {
    ctx.fillStyle = '#16131b';
    ctx.fillRect(0, 0, ROOM_W, ROOM_H);
    for (let y = 64; y < ROOM_H - 64; y += 32) {
      for (let x = 64; x < ROOM_W - 64; x += 32) {
        const variation = (Math.floor(x / 32) + Math.floor(y / 32) * 3) % sacredRoomFloorTileIds.length;
        const tileId = sacredRoomFloorTileIds[variation];
        const sourceX = (tileId % 16) * 32;
        const sourceY = Math.floor(tileId / 16) * 32;
        ctx.drawImage(sacredRoomTiles, sourceX, sourceY, 32, 32, x, y, 32, 32);
      }
    }
    ctx.fillStyle = 'rgba(22, 18, 25, 0.74)';
    ctx.fillRect(64, 64, ROOM_W - 128, 32);
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
      let terrainBackground = terrainBackgroundCache.get(terrainKey);
      if (!terrainBackground) {
        terrainBackground = document.createElement('canvas');
        terrainBackground.width = ROOM_W;
        terrainBackground.height = ROOM_H;
        const terrainContext = terrainBackground.getContext('2d');
        terrainContext.fillStyle = theme.wall;
        terrainContext.fillRect(0, 0, ROOM_W, ROOM_H);
        terrainContext.save();
        if (regionId === 'graveyard') {
          terrainContext.filter = 'saturate(0.28) brightness(0.52)';
        } else if (regionId === 'artis' || regionId === 'candor') {
          terrainContext.filter = 'hue-rotate(205deg) saturate(0.75) brightness(0.72)';
        }
        const tileColumns = Math.floor(image.naturalWidth / 32);
        for (let row = 2; row * 32 < ROOM_H - 64; row += 1) {
          for (let column = 2; column * 32 < ROOM_W - 64; column += 1) {
            const tileId = terrainTileAt(terrain, column - 2, row - 2);
            const sourceX = (tileId % tileColumns) * 32;
            const sourceY = Math.floor(tileId / tileColumns) * 32;
            terrainContext.drawImage(image, sourceX, sourceY, 32, 32, column * 32, row * 32, 32, 32);
          }
        }
        terrainContext.restore();
        if (desert) drawDesertGround(terrainContext, image);
        if (terrainBackgroundCache.size >= 12) {
          terrainBackgroundCache.delete(terrainBackgroundCache.keys().next().value);
        }
        terrainBackgroundCache.set(terrainKey, terrainBackground);
      }
      ctx.drawImage(terrainBackground, 0, 0);
      if (desert) {
        drawSandstoneWalls();
      } else {
        drawCastleWalls();
      }
      ctx.save();
      const shade = ctx.createLinearGradient(0, 64, 0, 112);
      shade.addColorStop(0, 'rgba(62, 43, 24, 0.24)');
      shade.addColorStop(1, 'rgba(62, 43, 24, 0)');
      ctx.fillStyle = shade;
      ctx.fillRect(64, 64, ROOM_W - 128, 48);
      ctx.restore();
    } else {
      ctx.fillStyle = theme.wall;
      ctx.fillRect(0, 0, ROOM_W, ROOM_H);
    }
  }

  ctx.strokeStyle = 'rgba(113, 86, 45, 0.36)';
  ctx.lineWidth = 1;
  ctx.strokeRect(63, 63, ROOM_W - 126, ROOM_H - 126);

  for (const direction of directions) {
    const secretDoor = currentRoom.secretExit?.direction === direction.name &&
      !currentRoom.secretExit.room.hidden;
    const hasDoor = currentRoom.links[direction.name] || secretDoor;
    if (!hasDoor) continue;
    const locked = currentRoom.lockedDoors[direction.name] === true;
    const sealed = !currentRoom.cleared;
    const vertical = direction.name === 'up' || direction.name === 'down';
    const centerX = vertical ? ROOM_W / 2 : direction.name === 'left' ? 32 : ROOM_W - 32;
    const centerY = vertical ? (direction.name === 'up' ? 32 : ROOM_H - 32) : ROOM_H / 2;
    ctx.save();
    ctx.translate(centerX, centerY);
    if (!vertical) ctx.rotate(Math.PI / 2);
    // Door is drawn as a 96x56 panel facing "up"; sealed and locked doors are solid, open doors are a green archway.
    if (sealed || locked) {
      ctx.fillStyle = sealed ? '#4a2a2a' : '#6b4a26';
      ctx.fillRect(-48, -28, 96, 56);
      ctx.strokeStyle = sealed ? '#b55a5a' : '#e0b45e';
      ctx.lineWidth = 3;
      ctx.strokeRect(-47, -27, 94, 54);
      ctx.strokeStyle = sealed ? '#2a1515' : '#3d2a14';
      ctx.lineWidth = 2;
      for (let bar = -30; bar <= 30; bar += 20) {
        ctx.beginPath();
        ctx.moveTo(bar, -26);
        ctx.lineTo(bar, 26);
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
      ctx.fillRect(-42, -28, 84, 56);
      ctx.strokeStyle = '#8cae7a';
      ctx.lineWidth = 3;
      ctx.strokeRect(-42, -28, 84, 56);
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
      ctx.strokeRect(-52, -32, 104, 64);
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(120, 10, 20, 0.45)';
      ctx.fillRect(-48, -28, 96, 56);
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
    const labelX = vertical ? ROOM_W / 2 : direction.name === 'left' ? 78 : ROOM_W - 78;
    const labelY = vertical ? (direction.name === 'up' ? 78 : ROOM_H - 70) : ROOM_H / 2 + 4;
    ctx.fillText(doorLabel, labelX, labelY);
  }

  if (currentRoom.secretExit?.room.hidden) {
    const direction = currentRoom.secretExit.direction;
    ctx.strokeStyle = '#b78f69';
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (direction === 'up' || direction === 'down') {
      const y = direction === 'up' ? 38 : ROOM_H - 38;
      ctx.moveTo(ROOM_W / 2 - 26, y - 8);
      ctx.lineTo(ROOM_W / 2 + 26, y + 8);
      ctx.moveTo(ROOM_W / 2 + 18, y - 8);
      ctx.lineTo(ROOM_W / 2 - 18, y + 8);
    } else {
      const x = direction === 'left' ? 38 : ROOM_W - 38;
      ctx.moveTo(x - 8, ROOM_H / 2 - 24);
      ctx.lineTo(x + 8, ROOM_H / 2 + 24);
      ctx.moveTo(x - 8, ROOM_H / 2 + 18);
      ctx.lineTo(x + 8, ROOM_H / 2 - 18);
    }
    ctx.stroke();
  }
}

function drawPlayerMagicMark(x, y, color) {
  ctx.save();
  ctx.globalAlpha = 0.95;
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x, y - 7);
  ctx.lineTo(x + 6, y);
  ctx.lineTo(x, y + 7);
  ctx.lineTo(x - 6, y);
  ctx.closePath();
  ctx.stroke();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
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
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.beginPath();
    ctx.ellipse(enemy.x, enemy.y + 3, enemy.radius * (1 + height / 150), enemy.radius * 0.4,
      0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = enemy.manaSlam.color || '#adceff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(enemy.x - enemy.radius, enemy.y - height - 20);
    ctx.lineTo(enemy.x - enemy.radius, enemy.y - 5);
    ctx.moveTo(enemy.x + enemy.radius, enemy.y - height - 20);
    ctx.lineTo(enemy.x + enemy.radius, enemy.y - 5);
    ctx.stroke();
    ctx.translate(0, -height);
    drawEnemyBody(enemy);
    ctx.restore();
    return;
  }
  if (enemy.manaBomb) {
    ctx.save();
    drawEnemyBody(enemy);
    const pulse = 0.5 + Math.sin(elapsed * (18 + (1 - enemy.manaBomb.timer / enemy.manaBomb.duration) * 22)) * 0.5;
    ctx.fillStyle = `rgba(255, 35, 25, ${0.2 + pulse * 0.55})`;
    ctx.beginPath();
    ctx.ellipse(enemy.x, enemy.y - enemy.radius * 0.7, enemy.radius, enemy.radius * 1.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff3da';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('!', enemy.x, enemy.y - enemy.radius * 2 - 8);
    ctx.restore();
    return;
  }
  const rift = enemy.manaRift;
  if (!rift) {
    drawEnemyBody(enemy);
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
  drawEnemyBody(enemy);
  ctx.restore();
}

function drawEnemyBody(enemy) {
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
    ctx.save();
    ctx.strokeStyle = `rgba(218, 243, 255, ${0.35 + strength * 0.5})`;
    ctx.fillStyle = '#e8f7ff';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (let index = -1; index <= 1; index += 1) {
      const offset = index * 0.36;
      const startX = enemy.x + Math.cos(angle + offset) * (enemy.radius + 9);
      const startY = enemy.y + Math.sin(angle + offset) * (enemy.radius + 9);
      const endX = startX + Math.cos(angle + offset) * (44 + (1 - strength) * 28);
      const endY = startY + Math.sin(angle + offset) * (44 + (1 - strength) * 28);
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.lineTo(endX - Math.cos(angle + offset - 0.55) * 10,
        endY - Math.sin(angle + offset - 0.55) * 10);
      ctx.moveTo(endX, endY);
      ctx.lineTo(endX - Math.cos(angle + offset + 0.55) * 10,
        endY - Math.sin(angle + offset + 0.55) * 10);
      ctx.stroke();
    }
    ctx.restore();
  }
  const sprite = monsterSprites[enemy.kind];
  if (!sprite.image.complete || sprite.image.naturalWidth === 0) {
    ctx.fillStyle = enemy.freezeTimer > 0 ? '#56cfff'
      : enemy.slowTimer > 0 ? '#7ebee8' : enemy.color;
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
    ctx.fill();
  } else {
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
    const scale = sprite.scale * (enemy.boss && enemy.kind !== 'jacko' ? 1.4 : 1) *
      (enemy.miniBoss && !enemy.boss ? 1.5 : 1) *
      (enemy.isOffspring ? 0.58 : 1);
    const width = sprite.frameWidth * scale;
    const height = sprite.frameHeight * scale;
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
    ctx.save();
    ctx.translate(enemy.x, enemy.y - hop);
    if (enemy.archetype === 'charger' && enemy.behavior === 'roll' ||
      enemy.linkDash && enemy.linkDash.windup <= 0 && enemy.linkDash.kind === 'roll' ||
      enemy.kind === 'jacko' && enemy.behavior === 'jacko-roll') {
      ctx.rotate(elapsed * 18);
    }
    const frostAffected = enemy.freezeTimer > 0 || enemy.slowTimer > 0;
    if (frostAffected) {
      ctx.filter = 'hue-rotate(155deg) saturate(1.8) brightness(1.2)';
      ctx.shadowColor = '#59d7ff';
      ctx.shadowBlur = enemy.freezeTimer > 0 ? 22 : 14;
    } else if (enemy.kind === 'slime-mother') {
      // The sprite is grayscale, so sepia first to give hue-rotate something to shift.
      ctx.filter = enemy.phase >= 2
        ? 'sepia(1) saturate(7) hue-rotate(-38deg) brightness(1.1)'
        : 'sepia(1) saturate(6) hue-rotate(-38deg)';
    } else if (enemy.kind === 'jacko') {
      ctx.shadowColor = '#ff8e38';
      ctx.shadowBlur = enemy.phase >= 2 ? 30 : 16;
      if (enemy.phase >= 2) ctx.filter = 'saturate(1.5) brightness(1.25)';
    }
    // A brief bright flash confirms the hit without fading the sprite out.
    if (enemy.hitFlash > 0) ctx.filter = 'brightness(2.6) saturate(0.3)';
    ctx.drawImage(sprite.image, sourceX, sourceY, sprite.frameWidth, sprite.frameHeight,
      -width / 2, -height / 2, width, height);
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
      ctx.drawImage(banditBowImage, (bowFrame % bowColumns) * 128,
        Math.floor(bowFrame / bowColumns) * 128, 128, 128, -32, -16, 64, 64);
    }
    ctx.restore();
  }
  if (enemy.burnTimer > 0) {
    ctx.save();
    if (Math.floor(elapsed * 14) % 2 === 0) {
      ctx.fillStyle = 'rgba(255, 111, 52, 0.85)';
      ctx.beginPath();
      ctx.moveTo(enemy.x - 5, enemy.y - enemy.radius + 8);
      ctx.lineTo(enemy.x - 2, enemy.y - enemy.radius - 4 - Math.sin(elapsed * 19) * 3);
      ctx.lineTo(enemy.x + 1, enemy.y - enemy.radius + 5);
      ctx.lineTo(enemy.x + 5, enemy.y - enemy.radius - 2 - Math.cos(elapsed * 17) * 3);
      ctx.lineTo(enemy.x + 7, enemy.y - enemy.radius + 9);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
  if (enemy.kind === 'spider-queen' && enemy.behavior === 'spider-pounce-windup' &&
    enemy.spiderPounceTarget) {
    ctx.save();
    ctx.strokeStyle = 'rgba(231, 143, 198, 0.85)';
    ctx.fillStyle = 'rgba(231, 143, 198, 0.16)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(enemy.spiderPounceTarget.x, enemy.spiderPounceTarget.y,
      24 + Math.sin(elapsed * 14) * 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(enemy.x, enemy.y);
    ctx.lineTo(enemy.spiderPounceTarget.x, enemy.spiderPounceTarget.y);
    ctx.stroke();
    ctx.restore();
  }
  if (enemy.kind === 'jacko' && enemy.behavior === 'jacko-ground-pound-windup' && enemy.groundPoundTarget) {
    ctx.save();
    ctx.fillStyle = 'rgba(255, 78, 40, 0.22)';
    ctx.strokeStyle = 'rgba(255, 174, 66, 0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(enemy.groundPoundTarget.x, enemy.groundPoundTarget.y,
      38 + clamp(1 - enemy.stateTimer / 0.35, 0, 1) * 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  if (enemy.kind === 'golem' && enemy.behavior === 'golem-slam-windup' && enemy.slamTarget) {
    ctx.save();
    ctx.fillStyle = 'rgba(235, 133, 79, 0.18)';
    ctx.strokeStyle = 'rgba(255, 191, 111, 0.92)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(enemy.slamTarget.x, enemy.slamTarget.y,
      (enemy.phase >= 2 ? 112 : 74) * clamp(1 - enemy.stateTimer * 0.12, 0, 1), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (enemy.boss) {
      ctx.fillStyle = '#fff0d1';
      ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('HEAVY - 2 HEARTS', enemy.slamTarget.x, enemy.slamTarget.y - 85);
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
    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.strokeStyle = signatureColor;
    ctx.lineWidth = 3;
    ctx.shadowColor = signatureColor;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, enemy.radius + 8 + Math.sin(elapsed * 15) * 3, 0, Math.PI * 2);
    ctx.stroke();
    if (enemy.signatureTarget && ['yeti-slam', 'reaper-charge', 'slime-trail'].includes(enemy.signature)) {
      ctx.globalAlpha = 0.34;
      ctx.beginPath();
      ctx.arc(enemy.signatureTarget.x, enemy.signatureTarget.y,
        enemy.signature === 'yeti-slam' ? 72 : 24, 0, Math.PI * 2);
      ctx.stroke();
    }
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
    ctx.save();
    ctx.fillStyle = 'rgba(255, 116, 54, 0.16)';
    ctx.strokeStyle = 'rgba(255, 178, 90, 0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(enemy.bombTarget.x, enemy.bombTarget.y, 16 + Math.sin(elapsed * 14) * 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  if (enemy.behavior === 'windup' || enemy.behavior === 'leap-windup' ||
    enemy.behavior === 'stalker-windup' || enemy.behavior === 'shoot-windup' ||
    enemy.behavior === 'spider-web-windup' || enemy.behavior === 'spider-pounce-windup' ||
    enemy.behavior === 'golem-slam-windup' ||
    enemy.behavior === 'jacko-roll-windup' ||
    enemy.behavior === 'jacko-jump-windup' || enemy.behavior === 'jacko-shot-windup' || enemy.spitFlash > 0) {
    ctx.strokeStyle = enemy.archetype === 'charger' || enemy.kind === 'jacko' || enemy.kind === 'golem'
      ? 'rgba(255, 191, 95, 0.8)' : 'rgba(202, 164, 255, 0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, enemy.radius + 6 + Math.sin(elapsed * 18) * 2, 0, Math.PI * 2);
    ctx.stroke();
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
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = '#f4d474';
    ctx.shadowColor = '#f4d474';
    ctx.shadowBlur = 9;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, enemy.radius + 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  if (enemy.hp < enemy.maxHp) {
    ctx.fillStyle = '#160f13';
    ctx.fillRect(enemy.x - enemy.radius, enemy.y - enemy.radius - 11, enemy.radius * 2, 5);
    ctx.fillStyle = enemy.boss ? '#e376bd' : '#9be08d';
    ctx.fillRect(enemy.x - enemy.radius, enemy.y - enemy.radius - 11,
      (enemy.hp / enemy.maxHp) * enemy.radius * 2, 5);
  }
  if (enemy.boss || enemy.miniBoss) {
    ctx.fillStyle = '#f5debd';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(enemy.boss
      ? `${enemy.title}${enemy.phase >= 3 ? ' - PHASE III' : enemy.phase >= 2 ? ' - PHASE II' : ''}`
      : 'MINI-BOSS',
      enemy.x, enemy.y - enemy.radius - 18);
  }
}

function drawCompanion(companion) {
  if (companion.hp <= 0) return;
  const sprite = monsterSprites[companion.kind];
  if (!sprite.image.complete || sprite.image.naturalWidth === 0) return;
  const scale = Math.min(sprite.scale || 1, 42 / Math.max(sprite.frameWidth, sprite.frameHeight));
  const width = sprite.frameWidth * scale;
  const height = sprite.frameHeight * scale;
  const frame = companion.kind === 'wisp' ? Math.floor(elapsed * 5) % 5 : 0;
  const columns = Math.floor(sprite.image.naturalWidth / sprite.frameWidth);
  const glow = companion.kind === 'wisp' ? '#c8a6ff' : companion.color || '#a8e39c';
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
  ctx.drawImage(
    sprite.image,
    (frame % columns) * sprite.frameWidth,
    Math.floor(frame / columns) * sprite.frameHeight,
    sprite.frameWidth,
    sprite.frameHeight,
    companion.x - width / 2,
    companion.y - height / 2,
    width,
    height,
  );
  ctx.restore();
}

function drawPlayer() {
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
  drawOrbitGuard();
  ctx.fillStyle = 'rgba(14, 16, 20, 0.28)';
  ctx.beginPath();
  ctx.ellipse(player.x, player.y - 1, 24, 9.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(14, 16, 20, 0.34)';
  ctx.beginPath();
  ctx.ellipse(player.x, player.y - 1, 16, 6.5, 0, 0, Math.PI * 2);
  ctx.fill();
  if (player.chargeFraction > 0.02) {
    ctx.save();
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.arc(player.x, player.y - 34, 34, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = player.chargeFraction >= 1 ? '#fff2a0' : '#7fd8ff';
    ctx.beginPath();
    ctx.arc(player.x, player.y - 34, 34, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * player.chargeFraction);
    ctx.stroke();
    ctx.restore();
  }
  ctx.save();
  if (player.chargeFraction >= 1 && Math.floor(elapsed * 16) % 2 === 0) {
    ctx.filter = 'brightness(2.2) saturate(0.6)';
    ctx.shadowColor = '#fff2a0';
    ctx.shadowBlur = 22;
  }
  if (player.damageFlashTimer > 0) {
    ctx.filter = 'sepia(0.8) saturate(3.5) hue-rotate(305deg)';
    ctx.shadowColor = '#ff4058';
    ctx.shadowBlur = 18;
  }
  if (player.invuln > 0 && Math.floor(player.invuln * 14) % 2 === 0) ctx.globalAlpha = 0.4;
  const pulse = player.attackPulse / 0.14;
  ctx.translate(player.x, player.y);
  ctx.scale(1 + pulse * 0.08, 1 - pulse * 0.045);
  if (player.swordParryFlash > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = clamp(player.swordParryFlash / 0.24, 0, 1) * 0.42;
    ctx.filter = 'brightness(2.4) saturate(0.35)';
    ctx.shadowColor = '#dffcff';
    ctx.shadowBlur = 22;
    drawHumanoid(sprite.image, bodyFrameIndex, 0, 0, 1.45, character.hue);
    ctx.restore();
  }
  drawHumanoid(sprite.image, bodyFrameIndex, 0, 0, 1.45, character.hue);
  for (const slot of ['legs', 'chest']) {
    const clothing = equippedClothing[slot];
    if (clothing) drawClothing(clothing, bodyFrameIndex, 0, 0, 1.45);
  }
  const heldStyle = currentAttackStyle();
  const glowColor = styleGlowColor(heldStyle);
  const visibleWeapon = meleeWeapons.has('sword') ? 'ironSword'
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
  if (heldStyle === 'bow' && banditBowImage.complete && banditBowImage.naturalWidth >= 128) {
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
    ctx.drawImage(banditBowImage, (bowFrame % bowColumns) * 128,
      Math.floor(bowFrame / bowColumns) * 128, 128, 128, -60, -96, 120, 120);
    ctx.restore();
  }
  if (heldStyle === 'magic') drawCastingHands(direction, glowColor || magicElementPalette.bubble);
  drawHead(character.hairStyle, direction, 0, 0, 1.45, wornHat());
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
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5 + Math.sin(elapsed * 8) * 0.12;
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sx, -41.5);
    ctx.lineTo(sx, -38.5);
    ctx.stroke();
    ctx.restore();
    return;
  }
  if (direction !== 'down') return;
  const flare = 1 + (player.attackPulse > 0 ? 0.8 : 0);
  const hands = [[0, -40]];
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const [hx, hy] of hands) {
    const radius = (2.6 + Math.sin(elapsed * 8) * 0.4) * flare;
    const glow = ctx.createRadialGradient(hx, hy, 0, hx, hy, radius);
    glow.addColorStop(0, '#ffffff');
    glow.addColorStop(0.5, color);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(hx, hy, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
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
  ctx.drawImage(
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
    ctx.drawImage(correctedFrame, x - size / 2, y - size + 6, size, size);
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
  ctx.drawImage(image, frame * 32, 0, 32, 64, x - 16 * scale, headY - 12 * scale, 32 * scale, 64 * scale);
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
    ctx.drawImage(
      correctedFrame,
      destinationX,
      destinationY,
      width,
      height,
    );
  } catch (error) {
    if (!isPixelReadbackSecurityError(error)) return;
    ctx.drawImage(
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

function drawSoulMenhir() {
  const position = soulMenhirPosition();
  const t = prefersReducedMotion() ? 0 : elapsed;
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
  ctx.fillText('SOUL MENHIR  ·  E TO TALK', position.x, position.y + 22);
  ctx.restore();
}

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
      ctx.fillStyle = active ? (mode === 'memory' ? '#83dfcf' : '#f0d98a') : '#514e67';
      ctx.strokeStyle = near ? '#fff1c4' : active ? '#fff1c4' : '#292837';
      ctx.lineWidth = near ? 4 : 2;
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = active ? 16 : 3;
      ctx.beginPath();
      ctx.arc(node.x, node.y, active ? 20 : 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff6db';
      ctx.font = 'bold 12px Arial';
      ctx.fillText(String(node.index + 1), node.x, node.y + 4);
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

function drawElementalMenhir() {
  const { x, y } = elementalShrinePosition();
  const element = currentRoom.shrineElement;
  const color = magicElementPalette[element] || '#d8d0bc';
  const t = performance.now() / 1000;
  const active = !currentRoom.shrineUsed;
  ctx.save();
  const glow = ctx.createRadialGradient(x, y - 28, 8, x, y - 28, 100);
  glow.addColorStop(0, `${color}${active ? '66' : '33'}`);
  glow.addColorStop(1, `${color}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(x - 110, y - 140, 220, 220);

  ctx.fillStyle = '#494943';
  ctx.strokeStyle = '#bdb7a5';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x - 34, y + 36);
  ctx.lineTo(x - 29, y - 38);
  ctx.lineTo(x - 12, y - 69);
  ctx.lineTo(x + 13, y - 75);
  ctx.lineTo(x + 31, y - 43);
  ctx.lineTo(x + 35, y + 36);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = active ? color : '#77746e';
  ctx.fillStyle = active ? `${color}44` : 'rgba(80, 80, 76, 0.35)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y - 23, 21, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.save();
  ctx.translate(x, y - 23);
  ctx.strokeStyle = active ? '#fff4dc' : '#aaa69c';
  ctx.fillStyle = active ? '#fff4dc' : '#aaa69c';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (element === 'bubble') {
    for (const [bx, by, radius] of [[-7, 5, 5], [5, 0, 7], [9, -10, 3]]) {
      ctx.beginPath();
      ctx.arc(bx, by, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (element === 'fire') {
    ctx.beginPath();
    ctx.moveTo(-11, 10);
    ctx.lineTo(-8, -1);
    ctx.lineTo(-2, -13);
    ctx.lineTo(1, -3);
    ctx.lineTo(8, -12);
    ctx.lineTo(11, 2);
    ctx.lineTo(7, 11);
    ctx.closePath();
    ctx.fill();
  } else if (element === 'lightning') {
    ctx.beginPath();
    ctx.moveTo(3, -14);
    ctx.lineTo(-9, 2);
    ctx.lineTo(-1, 2);
    ctx.lineTo(-4, 14);
    ctx.lineTo(10, -4);
    ctx.lineTo(2, -4);
    ctx.closePath();
    ctx.fill();
  } else if (element === 'gas') {
    for (const [bx, by, radius] of [[-7, 3, 6], [0, -4, 8], [8, 3, 6]]) {
      ctx.beginPath();
      ctx.arc(bx, by, radius, Math.PI, 0);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-12, 4);
    ctx.lineTo(12, 4);
    ctx.stroke();
  } else if (element === 'spore') {
    ctx.beginPath();
    ctx.arc(0, -3, 10, Math.PI, 0);
    ctx.lineTo(8, 1);
    ctx.lineTo(-8, 1);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(-2, 1, 4, 10);
    for (const dot of [[-5, -4], [1, -8], [6, -2]]) {
      ctx.beginPath();
      ctx.arc(dot[0], dot[1], 1.5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
  } else if (element === 'ice') {
    for (let arm = 0; arm < 3; arm += 1) {
      ctx.save();
      ctx.rotate(arm * Math.PI / 3);
      ctx.beginPath();
      ctx.moveTo(0, -13);
      ctx.lineTo(0, 13);
      ctx.moveTo(-4, -7);
      ctx.lineTo(0, -3);
      ctx.lineTo(4, -7);
      ctx.moveTo(-4, 7);
      ctx.lineTo(0, 3);
      ctx.lineTo(4, 7);
      ctx.stroke();
      ctx.restore();
    }
  } else if (element === 'wind') {
    for (let row = -5; row <= 5; row += 5) {
      ctx.beginPath();
      ctx.moveTo(-12, row);
      ctx.quadraticCurveTo(0, row - 5, 11, row);
      ctx.stroke();
    }
  } else {
    ctx.beginPath();
    ctx.moveTo(-12, 8);
    ctx.lineTo(-3, -8);
    ctx.lineTo(2, 0);
    ctx.lineTo(7, -12);
    ctx.lineTo(13, 8);
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();

  if (active) {
    for (let index = 0; index < 10; index += 1) {
      const phase = (t * 0.28 + index / 10) % 1;
      const angle = t * 0.55 + index * 2.4;
      const radius = 30 + (index % 3) * 7;
      ctx.globalAlpha = Math.sin(phase * Math.PI) * 0.85;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x + Math.cos(angle) * radius, y - 20 - phase * 80 + Math.sin(angle) * 8, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#f2e5c6';
  ctx.font = 'bold 13px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(active ? `${element.toUpperCase()} MENHIR` : 'MENHIR ATTUNED', x, y + 62);
  if (active && distanceBetween(player, { x, y }) < 92) {
    ctx.fillStyle = '#fff0bd';
    ctx.font = 'bold 12px Arial';
    ctx.fillText('[E] ATTUNE', x, y + 81);
  }
  ctx.restore();
}

function drawShopItemIcon(item, centerX, centerY) {
  const itemImage = shopItemIconImages[item.id];
  if (itemImage?.complete && itemImage.naturalWidth > 0) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(itemImage, centerX - 14, centerY - 14, 28, 28);
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

function drawMorphShape(shape, color) {
  ctx.fillStyle = color;
  ctx.strokeStyle = '#101612';
  ctx.lineWidth = 2.2;
  if (shape === 'ring') {
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.stroke();
    return;
  }
  ctx.beginPath();
  if (shape === 'diamond') {
    ctx.moveTo(13, 0);
    ctx.lineTo(0, -8);
    ctx.lineTo(-9, 0);
    ctx.lineTo(0, 8);
    ctx.closePath();
  } else {
    ctx.ellipse(0, 0, 10, 6, 0, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.beginPath();
  ctx.arc(2, -2, 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawGroundHazards() {
  for (const strike of bossStrikes) {
    const progress = 1 - strike.timer / strike.duration;
    ctx.save();
    ctx.fillStyle = `rgba(255, 40, 40, ${0.12 + progress * 0.22})`;
    ctx.strokeStyle = `rgba(255, 90, 70, ${0.55 + progress * 0.45})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(strike.x, strike.y, strike.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = `rgba(255, 70, 50, ${0.3 + progress * 0.4})`;
    ctx.beginPath();
    ctx.arc(strike.x, strike.y, strike.radius * progress, 0, Math.PI * 2);
    ctx.fill();
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
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = hazard.color;
    ctx.strokeStyle = hazard.color;
    ctx.lineWidth = 3;
    if (hazard.kind === 'web') {
      ctx.beginPath();
      ctx.arc(hazard.x, hazard.y, hazard.radius, 0, Math.PI * 2);
      ctx.stroke();
      for (let spoke = 0; spoke < 8; spoke += 1) {
        const angle = spoke * Math.PI / 4;
        ctx.beginPath();
        ctx.moveTo(hazard.x, hazard.y);
        ctx.lineTo(hazard.x + Math.cos(angle) * hazard.radius,
          hazard.y + Math.sin(angle) * hazard.radius);
        ctx.stroke();
      }
    } else {
      ctx.beginPath();
      ctx.ellipse(hazard.x, hazard.y, hazard.radius, hazard.radius * 0.58,
        Math.sin(elapsed + hazard.x) * 0.08, 0, Math.PI * 2);
      ctx.fill();
      if (hazard.kind === 'miasma') {
        ctx.strokeStyle = hazard.owner === 'player' ? hazard.color : 'rgba(228, 255, 152, 0.9)';
        ctx.lineWidth = 2;
        for (let puff = 0; puff < 3; puff += 1) {
          const angle = elapsed * 1.8 + puff * Math.PI * 2 / 3;
          const x = hazard.x + Math.cos(angle) * hazard.radius * 0.4;
          const y = hazard.y + Math.sin(angle) * hazard.radius * 0.22 -
            ((elapsed * 0.7 + puff / 3) % 1) * 28;
          ctx.fillStyle = hazard.owner === 'player' ? hazard.color : 'rgba(182, 222, 98, 0.4)';
          ctx.beginPath();
          ctx.arc(x, y, 12 + Math.sin(elapsed * 5 + puff) * 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      } else if (hazard.kind === 'lightning') {
        ctx.strokeStyle = hazard.color;
        ctx.lineWidth = hazard.damageCooldown <= 0 ? 5 : 1.5;
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.moveTo(hazard.x, hazard.y - 220);
        ctx.lineTo(hazard.x + 14, hazard.y - 150);
        ctx.lineTo(hazard.x - 12, hazard.y - 80);
        ctx.lineTo(hazard.x + 8, hazard.y);
        ctx.stroke();
      } else if (hazard.kind === 'fire') {
        ctx.fillStyle = hazard.owner === 'player' ? hazard.color : '#ffd36a';
        for (let flame = 0; flame < 3; flame += 1) {
          const x = hazard.x + (flame - 1) * hazard.radius * 0.45;
          const height = 26 + Math.sin(elapsed * 12 + flame + hazard.x) * 9;
          ctx.beginPath();
          ctx.moveTo(x - 9, hazard.y);
          ctx.quadraticCurveTo(x - 12, hazard.y - 12, x + 3, hazard.y - height);
          ctx.quadraticCurveTo(x, hazard.y - 12, x + 9, hazard.y);
          ctx.closePath();
          ctx.fill();
        }
      } else if (hazard.kind === 'acid') {
        ctx.beginPath();
        ctx.arc(hazard.x - 12, hazard.y - 4, 4, 0, Math.PI * 2);
        ctx.arc(hazard.x + 13, hazard.y + 6, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

function withTextOutline(fn) {
  const plainFillText = ctx.fillText;
  ctx.fillText = function outlinedFillText(text, x, y, maxWidth) {
    const args = maxWidth === undefined ? [text, x, y] : [text, x, y, maxWidth];
    this.save();
    this.strokeStyle = 'rgba(8, 6, 10, 0.92)';
    this.lineWidth = 3.5;
    this.lineJoin = 'round';
    this.strokeText(...args);
    this.restore();
    plainFillText.apply(this, args);
  };
  try {
    fn();
  } finally {
    ctx.fillText = plainFillText;
  }
}

function drawEnemyProjectile(projectile) {
  ctx.save();
  ctx.shadowColor = projectile.color;
  if (projectile.kind === 'arrow') {
    ctx.translate(projectile.x, projectile.y);
    ctx.rotate(Math.atan2(projectile.vy, projectile.vx));
    ctx.shadowBlur = 8;
    ctx.strokeStyle = '#704526';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-12, 0);
    ctx.lineTo(10, 0);
    ctx.stroke();
    ctx.fillStyle = '#d5c18b';
    ctx.beginPath();
    ctx.moveTo(13, 0);
    ctx.lineTo(6, -3.5);
    ctx.lineTo(6, 3.5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#d5c18b';
    ctx.beginPath();
    ctx.moveTo(-9, 0);
    ctx.lineTo(-14, -4);
    ctx.moveTo(-9, 0);
    ctx.lineTo(-14, 4);
    ctx.stroke();
  } else if (projectile.kind === 'spore-orb') {
    const pulse = 1 + Math.sin(elapsed * 14) * 0.12;
    ctx.shadowBlur = 20;
    ctx.fillStyle = projectile.color;
    ctx.beginPath();
    ctx.arc(projectile.x, projectile.y, projectile.radius * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(245, 211, 255, 0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(projectile.x, projectile.y, projectile.radius + 6 + Math.sin(elapsed * 12) * 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#f5d8fb';
    for (let seed = 0; seed < 4; seed += 1) {
      const angle = elapsed * 2 + seed * Math.PI / 2;
      ctx.beginPath();
      ctx.arc(projectile.x + Math.cos(angle) * 8, projectile.y + Math.sin(angle) * 8, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (projectile.kind === 'spore-shard') {
    ctx.translate(projectile.x, projectile.y);
    ctx.rotate(Math.atan2(projectile.vy, projectile.vx));
    ctx.shadowBlur = 12;
    ctx.fillStyle = projectile.color;
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-4, -3);
    ctx.lineTo(-8, 0);
    ctx.lineTo(-4, 3);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.shadowBlur = 13;
    ctx.fillStyle = projectile.color;
    ctx.beginPath();
    ctx.arc(projectile.x, projectile.y, projectile.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.arc(projectile.x - projectile.radius * 0.25, projectile.y - projectile.radius * 0.25,
      projectile.radius * 0.34, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawWorld() {
  drawRoomFloor();
  drawSandFootprints();
  drawDesertWind();
  drawDesertScenery();
  drawGroundHazards();
  drawRewardTrial();
  if (currentRoom.type === 'start') drawSoulMenhir();
  if (currentRoom.type === 'elemental-shrine') drawElementalMenhir();
  if (currentRoom.type === 'boss' && currentRoom.cleared) {
    ctx.fillStyle = '#a8d7b4';
    ctx.fillRect(ROOM_W * 0.72 - 30, ROOM_H / 2 - 8, 60, 16);
    ctx.strokeStyle = '#e1f4d1';
    ctx.lineWidth = 2;
    ctx.strokeRect(ROOM_W * 0.72 - 30, ROOM_H / 2 - 8, 60, 16);
    ctx.fillStyle = '#f2e5c6';
    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('DESCEND', ROOM_W * 0.72, ROOM_H / 2 - 18);
  }
  if (currentRoom.type === 'shop') {
    drawHumanoid(humanoidSprites.neutral.image, 0, ROOM_W / 2, ROOM_H / 2, 1.35, 40);
    drawHead('keeper', 'down', ROOM_W / 2, ROOM_H / 2, 1.35);
    ctx.fillStyle = '#f2e5c6';
    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('MERCHANT', ROOM_W / 2, ROOM_H / 2 - 28);
    ctx.fillStyle = '#d3c4a6';
    ctx.font = '12px Arial';
    ctx.fillText('Stand by an item and press E to buy', ROOM_W / 2, ROOM_H / 2 + 43);
    ctx.fillStyle = '#ab8058';
    ctx.fillRect(ROOM_W / 2 - 34, ROOM_H / 2 + 18, 68, 11);
    const stock = currentRoom.shopStock || [];
    stock.forEach((item, index) => {
      const spot = shopPedestalPosition(index);
      const x = spot.x - 105;
      const y = spot.y + 30;
      ctx.fillStyle = item.purchased ? 'rgba(63, 77, 63, 0.92)' : 'rgba(25, 22, 29, 0.94)';
      ctx.fillRect(x, y, 210, 64);
      ctx.strokeStyle = item.purchased ? '#77936a' : '#b79664';
      ctx.strokeRect(x, y, 210, 64);
      ctx.save();
      ctx.globalAlpha = item.purchased ? 0.4 : 1;
      ctx.fillStyle = 'rgba(16, 14, 19, 0.55)';
      ctx.strokeStyle = coins >= item.cost || item.purchased ? '#d9bd83' : '#9a6666';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(spot.x, spot.y, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      drawShopItemIcon(item, spot.x, spot.y);
      ctx.restore();
      ctx.globalAlpha = 1;
      ctx.fillStyle = item.purchased ? '#9bb38e' : '#f2dfa9';
      ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'left';
      ctx.fillText(`${item.name} · ${item.cost}z`, x + 12, y + 24, 186);
      ctx.fillStyle = '#d4c7ae';
      ctx.font = '10px Arial';
      ctx.fillText(item.purchased ? 'SOLD' : item.description, x + 12, y + 43, 186);
      ctx.textAlign = 'center';
      if (nearestShopSlot() === index) {
        ctx.fillStyle = '#fff0a8';
        ctx.font = 'bold 13px Arial';
        ctx.fillText('[E] BUY', spot.x, spot.y - 40);
      }
    });
  }
  if (hasVault(currentRoom)) {
    ctx.fillStyle = '#f4d78e';
    ctx.font = 'bold 18px Georgia';
    ctx.textAlign = 'center';
    ctx.fillText('Zeny Vault', ROOM_W / 2, 118);
    ctx.fillStyle = '#f2e5c6';
    ctx.font = '14px Arial';
    ctx.fillText(`Carried: ${coins}  ·  Stored: ${save.bankedZeny}`, ROOM_W / 2, 142);
    ctx.font = '12px Arial';
    ctx.fillText('Step on a pad  ·  Shift+E / B withdraw all', ROOM_W / 2, 164);
    for (const withdraw of [false, true]) {
      const pad = bankPadPosition(withdraw);
      ctx.fillStyle = withdraw ? 'rgba(120, 170, 120, 0.35)' : 'rgba(200, 160, 80, 0.35)';
      ctx.strokeStyle = withdraw ? '#9fd39a' : '#d7b66e';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(pad.x, pad.y, 40, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
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
    const columns = hasImage ? Math.floor(sprite.image.naturalWidth / sprite.frameWidth) : 1;
    const sourceX = (rock.frame % columns) * sprite.frameWidth;
    const sourceY = Math.floor(rock.frame / columns) * sprite.frameHeight;
    const width = sprite.frameWidth * sprite.scale;
    const height = sprite.frameHeight * sprite.scale;
    if (hasImage) {
      ctx.save();
      if (rock.type === 'solid') ctx.filter = 'grayscale(0.85) brightness(0.7) saturate(0.65)';
      else if (rock.type === 'bomb-only') ctx.filter = 'sepia(0.45) saturate(1.5)';
      else if (rock.type === 'regenerating') ctx.filter = 'hue-rotate(45deg) saturate(1.2)';
      if (rock.regenerating && rock.regenStage < rock.regenSteps) {
        ctx.globalAlpha = 0.62 + rock.regenStage * 0.12;
      }
      ctx.drawImage(
        sprite.image,
        sourceX,
        sourceY,
        sprite.frameWidth,
        sprite.frameHeight,
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
      ctx.fillStyle = '#ffe08b';
      ctx.beginPath();
      ctx.moveTo(rock.x, rock.y - rock.radius - 13);
      ctx.lineTo(rock.x + 4, rock.y - rock.radius - 9);
      ctx.lineTo(rock.x, rock.y - rock.radius - 5);
      ctx.lineTo(rock.x - 4, rock.y - rock.radius - 9);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
  for (const bomb of bombs) {
    const inFlight = bomb.flightTimer > 0;
    const progress = inFlight ? 1 - bomb.flightTimer / bomb.flightDuration : 1;
    const renderY = bomb.y - (inFlight ? Math.sin(progress * Math.PI) * 36 : 0);
    if (bomb.owner === 'enemy') {
      ctx.save();
      ctx.fillStyle = 'rgba(255, 108, 54, 0.18)';
      ctx.strokeStyle = 'rgba(255, 157, 73, 0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(bomb.targetX, bomb.targetY, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.beginPath();
      ctx.ellipse(bomb.x, bomb.y, 9, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = bomb.fuse < 0.45 ? '#f1785e'
      : bomb.owner === 'enemy' ? '#573027' : '#26252a';
    ctx.beginPath();
    ctx.arc(bomb.x, renderY, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffce67';
    ctx.fillRect(bomb.x + 4, renderY - 14, 3, 5);
  }
  for (const pickup of pickups) {
    if (pickup.kind === 'lore-relic') {
      const bob = Math.sin(elapsed * 3 + pickup.x) * 3;
      ctx.save();
      ctx.translate(pickup.x, pickup.y + bob);
      ctx.shadowColor = '#a8f0d7';
      ctx.shadowBlur = 16;
      ctx.fillStyle = 'rgba(27, 68, 61, 0.88)';
      ctx.strokeStyle = '#b7f4df';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#d7fff0';
      ctx.beginPath();
      ctx.moveTo(0, -11);
      ctx.lineTo(7, 0);
      ctx.lineTo(0, 11);
      ctx.lineTo(-7, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#effff7';
      ctx.font = 'bold 10px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('INTERACT', 0, 30);
      ctx.restore();
      continue;
    }
    if (pickup.guaranteedTreasure) {
      ctx.strokeStyle = 'rgba(255, 224, 139, 0.88)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pickup.x, pickup.y, 15 + Math.sin(elapsed * 4) * 2, 0, Math.PI * 2);
      ctx.stroke();
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
      ctx.strokeStyle = auraColor;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(16, 14, 19, 0.48)';
      if (itemIcon?.complete && itemIcon.naturalWidth > 0) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(itemIcon, bubbleX - 16, bubbleY - 29, 32, 32);
      } else {
        ctx.translate(bubbleX, bubbleY - 8);
        ctx.scale(1, 1);
        drawShopItemIcon(pickup.item, 0, 0);
      }
      ctx.textAlign = 'center';
      ctx.font = 'bold 12px Arial';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(16, 14, 19, 0.9)';
      ctx.strokeText(pickup.item.name, bubbleX, bubbleY + 31, 82);
      ctx.fillStyle = '#fff4d5';
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
      } else {
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
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.lineCap = 'round';
      ctx.strokeStyle = projectile.color;
      ctx.shadowColor = projectile.color;
      ctx.shadowBlur = 18;
      ctx.lineWidth = projectile.beamWidth;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#fff4d8';
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      if (projectile.beamExplosionTimer > 0) {
        ctx.fillStyle = '#fff3ce';
        ctx.beginPath();
        ctx.arc(projectile.beamExplosionX, projectile.beamExplosionY,
          projectile.beamWidth * 0.75, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      continue;
    }
    const size = 18 * (projectile.size || 1);
    ctx.save();
    if (projectile.wildEffect) {
      ctx.save();
      ctx.strokeStyle = projectile.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, projectile.radius + 3 + Math.sin(elapsed * 18) * 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (projectiles.length <= 24) {
      ctx.shadowColor = projectile.color;
      ctx.shadowBlur = 14 * (projectile.size || 1);
    }
    ctx.lineJoin = 'round';
    // Ballistic drop: the shot sinks toward its ground shadow and lands where its range ends.
    // Level shots fall straight down the screen toward the feet line; vertical shots instead
    // pull their shadow in until it matches the shot. Charged arrows fly flatter.
    const flown = clamp(1 - projectile.ttl / (projectile.ttl0 || projectile.ttl || 1), 0, 1);
    const fall = Math.pow(flown, projectile.dropCurve || 2.4);
    const flightAngle = Math.atan2(projectile.vy, projectile.vx);
    const sideways = Math.abs(Math.cos(flightAngle));
    const vertical = 1 - sideways;
    const bodyHeight = 34;
    const shadowRadius = size * 0.5 * ((0.45 + 0.55 * fall) * sideways + (1.7 - 0.7 * fall) * vertical);
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.fillStyle = `rgba(0, 0, 0, ${0.18 + 0.2 * fall})`;
    ctx.beginPath();
    ctx.ellipse(projectile.x, projectile.y + bodyHeight * (1 - vertical * fall), shadowRadius * 1.25, shadowRadius * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.translate(0, bodyHeight * sideways * fall);
    // Launch flash: a ring expands from the muzzle while the shot itself keeps a constant size.
    const launchAge = projectile.born === undefined ? 1 : elapsed - projectile.born;
    if (launchAge >= 0 && launchAge < 0.22) {
      const t = launchAge / 0.22;
      ctx.save();
      ctx.globalAlpha = 0.6 * (1 - t);
      ctx.strokeStyle = projectile.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, size * (0.5 + t * 0.9), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (projectile.type === 'arrow') {
      const angle = Math.atan2(projectile.vy, projectile.vx);
      ctx.translate(projectile.x, projectile.y);
      ctx.rotate(angle);
      const arrowElement = projectile.glow || projectile.element;
      if (arrowElement) {
        const tint = magicElementPalette[arrowElement];
        const s = projectile.size || 1;
        ctx.shadowColor = tint;
        ctx.shadowBlur = 18;
        ctx.fillStyle = tint;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        if (arrowElement === 'fire') {
          // Flickering flame trailing off the arrow.
          const flick = Math.sin(elapsed * 40 + projectile.x) * 3;
          ctx.moveTo(8 * s, 0);
          ctx.quadraticCurveTo(-4 * s, -8 * s - flick, -26 * s, flick * 0.5);
          ctx.quadraticCurveTo(-4 * s, 8 * s + flick, 8 * s, 0);
        } else if (arrowElement === 'lightning') {
          ctx.moveTo(10 * s, 0);
          ctx.lineTo(-2 * s, -6 * s);
          ctx.lineTo(-6 * s, 2 * s);
          ctx.lineTo(-22 * s, -3 * s);
          ctx.lineTo(-8 * s, 4 * s);
          ctx.lineTo(-2 * s, 0);
        } else {
          ctx.ellipse(-6 * s, 0, 18 * s, 6 * s, 0, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = '#101612';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-10 * (projectile.size || 1), 0);
      ctx.lineTo(10 * (projectile.size || 1), 0);
      ctx.stroke();
      ctx.strokeStyle = '#c59a58';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-10 * (projectile.size || 1), 0);
      ctx.lineTo(10 * (projectile.size || 1), 0);
      ctx.stroke();
      ctx.fillStyle = '#f0d8a0';
      ctx.strokeStyle = '#101612';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(12 * (projectile.size || 1), 0);
      ctx.lineTo(5 * (projectile.size || 1), -4 * (projectile.size || 1));
      ctx.lineTo(5 * (projectile.size || 1), 4 * (projectile.size || 1));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#c59a58';
      ctx.beginPath();
      ctx.moveTo(-10 * (projectile.size || 1), 0);
      ctx.lineTo(-15 * (projectile.size || 1), -4 * (projectile.size || 1));
      ctx.lineTo(-13 * (projectile.size || 1), 0);
      ctx.lineTo(-15 * (projectile.size || 1), 4 * (projectile.size || 1));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (projectile.type === 'elemental' && projectile.shape) {
      const pulseScale = projectile.size || 1;
      ctx.translate(projectile.x, projectile.y);
      ctx.rotate(Math.atan2(projectile.vy, projectile.vx));
      ctx.scale(pulseScale, pulseScale);
      drawMorphShape(projectile.shape, projectile.color);
    } else if (projectile.type === 'elemental') {
      const angle = Math.atan2(projectile.vy, projectile.vx);
      const element = projectile.element || 'bubble';
      ctx.translate(projectile.x, projectile.y);
      ctx.rotate(angle);
      ctx.fillStyle = magicElementPalette[element] || magicElementPalette.bubble;
      ctx.strokeStyle = '#101612';
      ctx.lineWidth = 2.5;
      if (element === 'bubble') {
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(245, 255, 255, 0.9)';
        ctx.beginPath();
        ctx.arc(-3, -4, 3, 0, Math.PI * 2);
        ctx.fill();
      } else if (element === 'fire') {
        ctx.beginPath();
        ctx.moveTo(12, 0);
        ctx.quadraticCurveTo(2, -5, 0, -11);
        ctx.quadraticCurveTo(-3, -3, -10, -3);
        ctx.quadraticCurveTo(-8, 7, 0, 10);
        ctx.quadraticCurveTo(7, 8, 12, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ffe68c';
        ctx.beginPath();
        ctx.moveTo(6, 0);
        ctx.quadraticCurveTo(0, -2, 0, -6);
        ctx.quadraticCurveTo(-4, 1, -1, 6);
        ctx.quadraticCurveTo(4, 5, 6, 0);
        ctx.fill();
      } else if (element === 'lightning') {
        ctx.beginPath();
        ctx.moveTo(4, -13);
        ctx.lineTo(-8, 1);
        ctx.lineTo(-1, 1);
        ctx.lineTo(-5, 13);
        ctx.lineTo(9, -4);
        ctx.lineTo(2, -4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (element === 'ice' || element === 'earth') {
        ctx.beginPath();
        ctx.moveTo(13, 0);
        ctx.lineTo(1, -9);
        ctx.lineTo(-9, -5);
        ctx.lineTo(-11, 5);
        ctx.lineTo(1, 9);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-6, -3);
        ctx.lineTo(7, 0);
        ctx.lineTo(-5, 5);
        ctx.stroke();
      } else if (element === 'wind') {
        ctx.strokeStyle = magicElementPalette.wind;
        ctx.lineWidth = 3;
        for (let gust = -1; gust <= 1; gust += 1) {
          ctx.beginPath();
          ctx.moveTo(-12, gust * 6);
          ctx.quadraticCurveTo(14, gust * 10, 8, gust * 3);
          ctx.stroke();
        }
      } else if (element === 'spore') {
        ctx.beginPath();
        ctx.arc(0, -2, 10, Math.PI, Math.PI * 2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillRect(-3, -2, 6, 12);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-5, -7, 2, 2);
        ctx.fillRect(3, -6, 2, 2);
      } else {
        ctx.beginPath();
        ctx.arc(-5, 3, 6, 0, Math.PI * 2);
        ctx.arc(2, 0, 8, 0, Math.PI * 2);
        ctx.arc(8, 4, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(234, 255, 184, 0.85)';
        ctx.beginPath();
        ctx.arc(-3, 2, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (projectile.type === 'spore-shard') {
      const angle = Math.atan2(projectile.vy, projectile.vx);
      ctx.translate(projectile.x, projectile.y);
      ctx.rotate(angle);
      ctx.shadowBlur = 12;
      ctx.fillStyle = projectile.color;
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.lineTo(-4, -3);
      ctx.lineTo(-8, 0);
      ctx.lineTo(-4, 3);
      ctx.closePath();
      ctx.fill();
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
  for (const particle of particles) {
    ctx.globalAlpha = clamp(particle.ttl / particle.maxTtl, 0, 1);
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    if (particle.streak) {
      ctx.ellipse(particle.x, particle.y, particle.radius * 0.65, particle.radius * 1.8,
        Math.atan2(particle.vy, particle.vx), 0, Math.PI * 2);
    } else {
      ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const markedAngles = new Set();
  for (const swing of player.meleeSwings) {
    const progress = 1 - swing.timer / swing.maxTimer;
    if (!markedAngles.has(swing.angle)) {
      markedAngles.add(swing.angle);
      // Full hit marker: the whole area the swing can strike, with a sweeping leading edge.
      const fade = 1 - progress;
      const arc = swing.arc || 0.95;
      const sweep = swing.angle - arc + progress * arc * 2;
      const markerColor = swing.charged ? '255, 242, 160' : '255, 255, 255';
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(player.x, player.y - 34);
      ctx.arc(player.x, player.y - 34, swing.hitReach, swing.angle - arc, swing.angle + arc);
      ctx.closePath();
      ctx.fillStyle = `rgba(${markerColor}, ${0.16 * fade})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(${markerColor}, ${0.5 * fade})`;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(player.x, player.y - 34);
      ctx.lineTo(player.x + Math.cos(sweep) * swing.hitReach, player.y - 34 + Math.sin(sweep) * swing.hitReach);
      ctx.strokeStyle = `rgba(${markerColor}, ${0.9 * fade})`;
      ctx.lineWidth = 3;
      ctx.stroke();
      const deflectX = player.x + Math.cos(swing.angle) * swing.reach * 0.68;
      const deflectY = player.y - 34 + Math.sin(swing.angle) * swing.reach * 0.68;
      ctx.globalAlpha = 0.55 * fade;
      ctx.strokeStyle = '#ffffff';
      ctx.fillStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(deflectX, deflectY, 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(deflectX, deflectY, 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    const swingColor = swing.element ? magicElementPalette[swing.element]
      : swing.weapon === 'sword' ? combatPalette.sword
        : swing.weapon === 'daggers' ? combatPalette.daggers : combatPalette.melee;
    ctx.save();
    ctx.globalAlpha = 0.8 * (1 - progress);
    ctx.strokeStyle = '#101612';
    ctx.lineWidth = (swing.weapon === 'sword' ? 7 : swing.weapon === 'daggers' ? 5 : 8) + 3;
    ctx.lineCap = 'round';
    ctx.shadowColor = swing.weapon === 'sword' ? combatPalette.arcane : combatPalette.melee;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    const ribbonCenter = swing.spin ? swing.angle + progress * Math.PI * 2 - 0.9 : swing.angle;
    const ribbonSpan = swing.spin ? 1.1 : 0.85;
    ctx.arc(player.x, player.y - 34, swing.reach + progress * 12,
      ribbonCenter - ribbonSpan, ribbonCenter + ribbonSpan);
    ctx.stroke();
    ctx.strokeStyle = swingColor;
    ctx.lineWidth -= 3;
    ctx.stroke();
    ctx.restore();
  }
  for (const arc of lightningArcs) {
    ctx.save();
    ctx.globalAlpha = clamp(arc.ttl / 0.18, 0, 1);
    ctx.strokeStyle = arc.color || '#ffe45c';
    ctx.lineWidth = arc.castTrail ? 2 : 5;
    ctx.shadowColor = arc.color || '#ffe45c';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(arc.x1, arc.y1);
    const midX = (arc.x1 + arc.x2) / 2;
    const midY = (arc.y1 + arc.y2) / 2;
    ctx.lineTo(midX + Math.sin(elapsed * 95 + arc.y1) * 9, midY + Math.cos(elapsed * 83 + arc.x2) * 9);
    ctx.lineTo(arc.x2, arc.y2);
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }
  for (const enemy of enemies) drawEnemy(enemy);
  for (const companion of companions) drawCompanion(companion);
  drawPlayer();
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
    shrine: 'Shrine', 'elemental-shrine': 'Menhir', riskShrine: 'Altars', trial: 'Trial', secret: 'Secret' }[room.type] || 'Room';
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
      ctx.drawImage(slot.icon, cx - 13, cy - 13, 26, 26);
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
    const locked = !styleUnlocked(style.id);
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
    if (style.id === 'melee') {
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
    const mod = activeWeaponMod(style.id);
    ctx.textAlign = 'center';
    ctx.font = selected ? 'bold 10px Arial' : '9px Arial';
    ctx.fillStyle = selected ? '#ffffff' : '#a9a28f';
    ctx.fillText(mod ? mod.name : style.label, x + size / 2, y + size + 3);
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
  drawManaPanel(3, rightHud.y + 3, 54, 94);
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
  ctx.textBaseline = 'alphabetic';
  ctx.restore();

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
    ctx.fillText(entry.description || 'A newly recorded discovery.', 116, y + 30, 620);
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
      ['Grow stronger', 'Kills give XP and you level up, which raises your weapon pools. Items, weapon mods and boons make each run different. If you fall, unlocks and banked zeny carry over.'],
    ] },
    { title: 'CONTROLS', sections: [
      ['Move and aim', pad
        ? `Left stick moves. Right stick aims and fires, or hold ${p.rt} to fire. The D-pad never moves you in play.`
        : lastInputMode === 'touch'
          ? 'Drag the left area to move. Hold Attack to target the nearest live enemy. With no enemies in the room, drag Attack to aim freely, or hold without dragging to fire where you face.'
          : 'W A S D moves. The mouse aims and left click fires. Hold to keep attacking.'],
      ['Fight', `${b('dash')} dashes. ${b('nextWeapon')} cycles weapons${pad ? '' : `, ${b('weapon1')}/${b('weapon2')}/${b('weapon3')} pick melee/bow/magic`}. ${b('shock')} unleashes a shockwave; discover the Mana Familiar Sigil to replace it with orbiting weapon guards. Firing follows your controller right stick, touch auto-target (manual aim/facing with no enemies), or mouse cursor. ${b('ability')} uses your class ability.`],
      ['Use things', `${b('interact')} interacts: buy, talk, open doors. ${b('bomb')} drops a bomb. ${b('item')} uses a consumable.`],
      ['Menus', `${b('map')} map, ${b('journal')} journal, ${pad ? p.menu : 'P'} pause. Change controls in Controls (${pad ? 'Back on the pause screen' : 'C on the title or pause screen'}). Weapon upgrades may also change how that weapon fires.`],
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
      ['Weapon upgrades', 'Weapon-specific upgrades can change your firing style as a side effect. Watch the pickup banner to see when an upgrade changes how your weapon fires.'],
      ['Deflect and elements', 'Bat shots out of the air anywhere along your visible melee sweep. The first clean intercept per swing has a 40% chance to heal half a heart. Late body-contact deflections still hurt. Charged releases deflect nearby shots outward. Returned shots keep their original appearance.'],
      ['Arrow returns', 'Shoot enemy projectiles away with the forgiving area around an arrow tip. Clashes accelerate shots and scatter them widely, retaining their original look. An arrow-returned shot has one 40% chance to heal half a heart when it first damages an enemy. Interception alone never heals.'],
      ['Spore Bloom', 'Collect mushroom spores to make magic shots split into eight slowing projectiles when they hit an enemy, object, or wall. The smaller spores do not split again. Collecting it also unlocks Sporeling for future runs.'],
      ['Wild magic', 'Mage starts with random elemental magic; other classes start with water. Items no longer reroll your element; find an elemental menhir and interact to attune. Element sigils grant their named element. Magic effects share your element color. White diamond marks identify friendly effects. Mage surprises: 40% enemy, 20% object, 6% special shot; others: 10%, 5%, 1%. Bosses cannot be lifted or teleported.'],
    ] },
    { title: 'CONSUMABLES, BOMBS, MANA GUARD', sections: [
      ['Consumables', `Break scenery to uncover stored consumables, or buy them in shops. Press ${b('item')} to use one. The Item chip shows what is ready and how many you have.`],
      ['Bombs', `Press ${b('bomb')} to drop a bomb. Shots from either side push grounded bombs; they slide and bounce off scenery without resetting the fuse. Explosions hurt nearby foes and open sealed rooms. Stay out of the blast.`],
      ['Shockwave and Mana familiars', `Your shockwave clears hostile shots and pushes foes away. Find the Mana Familiar Sigil to replace it: each room clear fills one charge, up to eight. Five charges summon up to three weapon icons that orbit 32 pixels away; each blocks one hostile hit or strikes one enemy, then disappears. The orbit caps at 13; if it is full, charge is kept.`],
      ['Frost and class ability', `Frost is automatic: once found it chills nearby foes by itself until you attune at an elemental menhir. Your class ability (${b('ability')}) has a cooldown; its chip shows when it is ready.`],
    ] },
    { title: 'SHOPS, ZENY AND KEYS', sections: [
      ['Zeny', 'Enemies and rooms drop zeny. Spend it in shops, or bank it so it stays with you after a run ends.'],
      ['Shops', `Walk up to an item and press ${b('interact')} to buy it. Walking over an item never buys it. A shop is also a bank.`],
      ['Bank', `Step on the vault pad to deposit what you carry. ${pad ? p.b : 'Shift+' + b('interact')} near it withdraws your savings.`],
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
      ['Spend zeny', 'Buy potions and items. Keep a few coins in the bank so a bad run does not cost you everything.'],
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
