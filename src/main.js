import { initGame, startMatch, stopMatch } from './game.js';
import { initTracker, populateCameras, startCamera } from './tracker.js';
import { resumeAudio } from './audio.js';

// DOM Elements
const hudVolley = document.getElementById('volley');
const hudScoreL = document.getElementById('scoreLeft');
const hudScoreR = document.getElementById('scoreRight');
const statusMsg = document.getElementById('statusMsg');
const pointFlash = document.getElementById('pointFlash');

const startScreen = document.getElementById('startScreen');
const countdownScreen = document.getElementById('countdownScreen');
const countdownText = document.getElementById('countdownText');
const gameOverScr = document.getElementById('gameOverScreen');
const winnerText = document.getElementById('winnerText');
const finalScoreTx = document.getElementById('finalScore');
const camSelect = document.getElementById('camSelect');
const startBtn = document.getElementById('startBtn');
const restartBtn = document.getElementById('restartBtn');

// UI Callbacks
function updateHUD(scoreL, scoreR, volley) {
  hudScoreL.textContent = scoreL;
  hudScoreR.textContent = scoreR;
  hudVolley.textContent = `VOLLEY: ${volley}`;
}

function handleGameOver(winner, finalScoreStr) {
  winnerText.textContent = winner === 'L' ? '🟢 LEFT WINS!' : '🔵 RIGHT WINS!';
  finalScoreTx.textContent = finalScoreStr;
  gameOverScr.classList.remove('hidden');
}

function flashPoint(color) {
  pointFlash.style.background = color;
  pointFlash.style.opacity = '0.35';
  setTimeout(() => { pointFlash.style.opacity = '0'; }, 200);
}

// 3-2-1 Countdown Logic
function doCountdown(callback) {
  let count = 3;
  countdownScreen.classList.remove('hidden');
  countdownText.textContent = count;
  
  const interval = setInterval(() => {
    count--;
    if(count > 0) {
      countdownText.textContent = count;
    } else if (count === 0) {
      countdownText.textContent = 'START!';
    } else {
      clearInterval(interval);
      countdownScreen.classList.add('hidden');
      callback();
    }
  }, 1000);
}

// Start sequence
async function playSequence() {
  startBtn.disabled = true;
  restartBtn.disabled = true;
  
  resumeAudio(); // Ensure audio context is ready
  
  try {
    await startCamera(camSelect.value);
  } catch (err) {
    console.error(err);
    alert('Failed to start camera');
    startBtn.disabled = false;
    restartBtn.disabled = false;
    return;
  }
  
  startScreen.classList.add('hidden');
  gameOverScr.classList.add('hidden');
  
  doCountdown(() => {
    startBtn.disabled = false;
    restartBtn.disabled = false;
    startMatch();
  });
}

// Init
window.addEventListener('DOMContentLoaded', () => {
  initTracker();
  populateCameras();
  initGame('threeCanvas', updateHUD, handleGameOver, flashPoint);
  
  startBtn.addEventListener('click', playSequence);
  restartBtn.addEventListener('click', playSequence);
});
