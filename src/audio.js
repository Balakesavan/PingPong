// Simple audio synthesis using Web Audio API for retro SFX

let audioCtx = null;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function playTone(freq, type, duration, vol = 0.1) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
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
  playTone(600, 'square', 0.1, 0.1);
  setTimeout(() => playTone(800, 'square', 0.1, 0.1), 100);
  setTimeout(() => playTone(1200, 'square', 0.2, 0.1), 200);
}

export function playWin() {
  initAudio();
  playTone(400, 'square', 0.2, 0.15);
  setTimeout(() => playTone(600, 'square', 0.2, 0.15), 200);
  setTimeout(() => playTone(800, 'square', 0.4, 0.15), 400);
}

export function resumeAudio() {
  initAudio();
}
