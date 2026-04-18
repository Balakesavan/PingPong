// Web Audio API — retro SFX synthesis

let audioCtx = null;

function initAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playTone(freq, type, duration, vol = 0.1) {
  if (!audioCtx) return;
  const osc  = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
  gain.gain.setValueAtTime(vol, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

function playNoise(duration, vol = 0.08, filterFreq = 2000) {
  if (!audioCtx) return;
  const bufSize = audioCtx.sampleRate * duration;
  const buf     = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
  const data    = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;

  const src    = audioCtx.createBufferSource();
  src.buffer   = buf;
  const filter = audioCtx.createBiquadFilter();
  filter.type  = 'bandpass';
  filter.frequency.value = filterFreq;
  const gain   = audioCtx.createGain();
  gain.gain.setValueAtTime(vol, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);
  src.start();
}

// ─── Pong sounds ─────────────────────────────────────────────────────────────

export function playPaddleHit() {
  initAudio();
  playTone(440, 'square', 0.1, 0.1);
  setTimeout(() => playTone(880, 'square', 0.1, 0.1), 50);
}

export function playWallHit() {
  initAudio();
  playTone(220, 'triangle', 0.1, 0.1);
}

export function playScore() {
  initAudio();
  playTone(600,  'square', 0.1, 0.1);
  setTimeout(() => playTone(800,  'square', 0.1,  0.1), 100);
  setTimeout(() => playTone(1200, 'square', 0.2,  0.1), 200);
}

export function playWin() {
  initAudio();
  playTone(400, 'square', 0.2, 0.15);
  setTimeout(() => playTone(600, 'square', 0.2, 0.15), 200);
  setTimeout(() => playTone(800, 'square', 0.4, 0.15), 400);
}

// ─── Beat Saber sounds ───────────────────────────────────────────────────────

export function playSlashHit(perfect = true) {
  initAudio();
  if (perfect) {
    // Clean metallic clash
    playTone(880,  'square',   0.08, 0.12);
    playTone(1320, 'triangle', 0.1,  0.09);
    playNoise(0.06, 0.07, 3000);
  } else {
    // Duller thud
    playTone(440, 'square', 0.1, 0.09);
    playNoise(0.08, 0.05, 1200);
  }
}

export function playSlashMiss() {
  initAudio();
  playTone(180, 'sawtooth', 0.18, 0.1);
  playNoise(0.15, 0.06, 400);
}

export function playComboMilestone(n) {
  initAudio();
  const freqs = [400, 500, 640, 800, 1000];
  freqs.slice(0, Math.min(n, freqs.length)).forEach((f, i) => {
    setTimeout(() => playTone(f, 'square', 0.12, 0.1), i * 80);
  });
}

export function resumeAudio() {
  initAudio();
}
