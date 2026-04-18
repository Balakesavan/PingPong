import * as THREE from 'three';
import {
  initGame, startMatch, stopMatch,
  getScene as getPongScene, getCamera as getPongCamera,
  tick as pongTick, onResize as pongResize
} from './game.js';
import {
  initBeatSaber, startBeatSaber, stopBeatSaber,
  getScene as getBSScene, getCamera as getBSCamera,
  tick as bsTick, onResize as bsResize
} from './beatsaber.js';
import { initTracker, populateCameras, startCamera } from './tracker.js';
import { resumeAudio, playComboMilestone } from './audio.js';

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const hudPong        = document.getElementById('hud');
const hudVolley      = document.getElementById('volley');
const hudScoreL      = document.getElementById('scoreLeft');
const hudScoreR      = document.getElementById('scoreRight');
const hudBS          = document.getElementById('bsHud');
const bsScoreElem    = document.getElementById('bsScore');
const bsComboElem    = document.getElementById('bsCombo');
const bsLivesElem    = document.getElementById('bsLives');

const statusMsg      = document.getElementById('statusMsg');
const pointFlash     = document.getElementById('pointFlash');
const startScreen    = document.getElementById('startScreen');
const countdownScreen = document.getElementById('countdownScreen');
const countdownText  = document.getElementById('countdownText');
const gameOverScr    = document.getElementById('gameOverScreen');
const winnerText     = document.getElementById('winnerText');
const finalScoreTx   = document.getElementById('finalScore');
const bsGameOverScr  = document.getElementById('bsGameOverScreen');
const bsFinalScore   = document.getElementById('bsFinalScore');
const bsHighScoreMsg = document.getElementById('bsHighScoreMsg');
const camSelect      = document.getElementById('camSelect');
const startBtn       = document.getElementById('startBtn');
const restartBtn     = document.getElementById('restartBtn');
const bsRestartBtn   = document.getElementById('bsRestartBtn');
const btnPong        = document.getElementById('btnPong');
const btnBeatSaber   = document.getElementById('btnBeatSaber');
const startTitle     = document.getElementById('startTitle');
const pongInstr      = document.getElementById('pongInstructions');
const bsInstr        = document.getElementById('bsInstructions');

// ─── Shared renderer ─────────────────────────────────────────────────────────
const canvas   = document.getElementById('threeCanvas');
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);

// ─── Mode state ───────────────────────────────────────────────────────────────
let activeMode = 'pong'; // 'pong' | 'beatsaber'
let bsHighScore = 0;

// ─── Pong callbacks ───────────────────────────────────────────────────────────
function updateHUD(scoreL, scoreR, volley) {
  hudScoreL.textContent = scoreL;
  hudScoreR.textContent = scoreR;
  hudVolley.textContent = `VOLLEY: ${volley}`;
}

function handleGameOver(winner, finalScoreStr) {
  winnerText.textContent = winner === 'L' ? '🟢 LEFT WINS!' : '🔵 RIGHT WINS!';
  finalScoreTx.textContent = finalScoreStr;
  gameOverScr.classList.remove('hidden');
  statusMsg.style.display = '';
}

function flashPoint(color) {
  pointFlash.style.background = color;
  pointFlash.style.opacity = '0.35';
  setTimeout(() => { pointFlash.style.opacity = '0'; }, 200);
}

// ─── Beat Saber callbacks ────────────────────────────────────────────────────
let prevCombo = 0;

function updateBSHUD(score, combo) {
  bsScoreElem.textContent = score.toLocaleString();
  bsComboElem.textContent = `×${combo}`;

  // Fire milestone sounds at 5, 10, 20, 30 ...
  if (combo > prevCombo && [5, 10, 20, 30, 50].includes(combo)) {
    playComboMilestone(Math.min(5, Math.floor(combo / 10) + 1));
  }
  prevCombo = combo;
}

function updateLives(lives) {
  const MAX = 3;
  bsLivesElem.textContent = '♥'.repeat(lives) + '♡'.repeat(MAX - lives);
}

function handleBSGameOver(finalScore) {
  const isHigh = finalScore > bsHighScore;
  if (isHigh) bsHighScore = finalScore;
  bsFinalScore.textContent  = `SCORE: ${finalScore.toLocaleString()}`;
  bsHighScoreMsg.textContent = isHigh ? '★ NEW HIGH SCORE!' : `BEST: ${bsHighScore.toLocaleString()}`;
  bsGameOverScr.classList.remove('hidden');
  hudBS.classList.add('hidden');
  statusMsg.style.display = '';
}

// ─── Mode switching ───────────────────────────────────────────────────────────
function setMode(mode) {
  activeMode = mode;
  btnPong.classList.toggle('active', mode === 'pong');
  btnBeatSaber.classList.toggle('active', mode === 'beatsaber');
  pongInstr.classList.toggle('hidden', mode !== 'pong');
  bsInstr.classList.toggle('hidden',   mode !== 'beatsaber');
  startTitle.textContent = mode === 'pong' ? 'REAL LIFE PONG' : 'BEAT SABER';
}

// ─── Countdown + start sequence ──────────────────────────────────────────────
function doCountdown(callback) {
  let count = 3;
  countdownScreen.classList.remove('hidden');
  countdownText.textContent = count;

  const interval = setInterval(() => {
    count--;
    if (count > 0) {
      countdownText.textContent = count;
    } else if (count === 0) {
      countdownText.textContent = 'GO!';
    } else {
      clearInterval(interval);
      countdownScreen.classList.add('hidden');
      callback();
    }
  }, 1000);
}

async function playSequence() {
  startBtn.disabled = restartBtn.disabled = bsRestartBtn.disabled = true;
  resumeAudio();

  try {
    await startCamera(camSelect.value);
  } catch (err) {
    console.error(err);
    alert('Failed to start camera');
    startBtn.disabled = restartBtn.disabled = bsRestartBtn.disabled = false;
    return;
  }

  startScreen.classList.add('hidden');
  gameOverScr.classList.add('hidden');
  bsGameOverScr.classList.add('hidden');
  statusMsg.style.display = 'none';
  prevCombo = 0;

  doCountdown(() => {
    startBtn.disabled = restartBtn.disabled = bsRestartBtn.disabled = false;

    if (activeMode === 'pong') {
      hudPong.classList.remove('hidden');
      hudBS.classList.add('hidden');
      startMatch();
    } else {
      hudBS.classList.remove('hidden');
      hudPong.classList.add('hidden');
      startBeatSaber();
    }
  });
}

// ─── Master render loop ───────────────────────────────────────────────────────
function masterLoop(now) {
  requestAnimationFrame(masterLoop);

  if (activeMode === 'pong') {
    pongTick(now);
    renderer.render(getPongScene(), getPongCamera());
  } else {
    bsTick(now);
    renderer.render(getBSScene(), getBSCamera());
  }
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  initTracker();
  populateCameras();

  initGame('threeCanvas', updateHUD, handleGameOver, flashPoint);
  initBeatSaber(updateBSHUD, handleBSGameOver, updateLives);

  renderer.setSize(window.innerWidth, window.innerHeight);

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    pongResize();
    bsResize();
  });

  // Mode buttons
  btnPong.addEventListener('click',      () => setMode('pong'));
  btnBeatSaber.addEventListener('click', () => setMode('beatsaber'));

  // Start / restart buttons
  startBtn.addEventListener('click',     playSequence);
  restartBtn.addEventListener('click',   () => { gameOverScr.classList.add('hidden'); startScreen.classList.remove('hidden'); });
  bsRestartBtn.addEventListener('click', playSequence);

  requestAnimationFrame(masterLoop);
});
