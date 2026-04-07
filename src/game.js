import * as THREE from 'three';
import { handL, handR } from './tracker.js';
import { playPaddleHit, playWallHit, playScore, playWin } from './audio.js';

// Game constants
const WIN_SCORE   = 7;
const BALL_SPEED  = 0.018;
const SPEED_INC   = 0.0008;
const PADDLE_H    = 0.28;
const PADDLE_W    = 0.025;
const PADDLE_X    = 0.82;
const MAX_TRAILS  = 18;

// Three.js instances
let scene, camera, renderer;
let paddleLeft, paddleRight, ball;
let trails = [];
let trailHistory = [];
let particles = []; // For collision explosions

// Game State
export let gameRunning = false;
export let scoreL = 0, scoreR = 0, volley = 0;
let ballPos = new THREE.Vector2(0, 0);
let ballDir = new THREE.Vector2(1, 0.3).normalize();
let ballSpeed = BALL_SPEED;
let paddleYL = 0, paddleYR = 0;

// Callbacks (to update UI)
let onScoreUpdate = null;
let onGameOver = null;
let onFlash = null;

// Initialize the Three.js scene
export function initGame(canvasId, scoreCb, overCb, flashCb) {
  onScoreUpdate = scoreCb;
  onGameOver = overCb;
  onFlash = flashCb;

  const canvas = document.getElementById(canvasId);
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setClearColor(0x000000, 0);

  scene = new THREE.Scene();
  
  // To keep paddle positions reliable regardless of screen resolution, 
  // we'll preserve an aspect ratio correction inside the logic or camera.
  // Using orthographic bounds fixed at -1 to 1 for y, and -aspect to aspect for x.
  const aspect = window.innerWidth / window.innerHeight;
  camera = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0.1, 10);
  camera.position.z = 5;

  setupObjects();

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    const newAspect = window.innerWidth / window.innerHeight;
    camera.left = -newAspect;
    camera.right = newAspect;
    camera.top = 1;
    camera.bottom = -1;
    camera.updateProjectionMatrix();
    
    // adjust paddle X based on aspect (keep them near the edges)
    const newPaddleX = newAspect - 0.15;
    paddleLeft.position.set(-newPaddleX, paddleYL, 0);
    paddleRight.position.set(newPaddleX, paddleYR, 0);
  });
  
  // Initial size
  renderer.setSize(window.innerWidth, window.innerHeight);
  const curAspect = window.innerWidth / window.innerHeight;
  paddleLeft.position.set(-(curAspect - 0.15), 0, 0);
  paddleRight.position.set((curAspect - 0.15), 0, 0);

  // Start loop
  requestAnimationFrame(animate);
}

function makeGlowRect(w, h, color, emissiveColor) {
  const geo = new THREE.PlaneGeometry(w, h);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 });
  const mesh = new THREE.Mesh(geo, mat);
  const glowGeo = new THREE.PlaneGeometry(w * 4, h * 1.5);
  const glowMat = new THREE.MeshBasicMaterial({
    color: emissiveColor || color,
    transparent: true,
    opacity: 0.18,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  mesh.add(glow);
  return mesh;
}

function setupObjects() {
  paddleLeft  = makeGlowRect(PADDLE_W, PADDLE_H * 2, 0x00ff88, 0x00ff88);
  paddleRight = makeGlowRect(PADDLE_W, PADDLE_H * 2, 0x00e5ff, 0x00e5ff);
  scene.add(paddleLeft, paddleRight);

  const ballGeo = new THREE.CircleGeometry(0.022, 32);
  const ballMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  ball = new THREE.Mesh(ballGeo, ballMat);

  const ballGlowGeo = new THREE.CircleGeometry(0.065, 32);
  const ballGlowMat = new THREE.MeshBasicMaterial({
    color: 0x00e5ff, transparent: true, opacity: 0.22,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  const ballGlow = new THREE.Mesh(ballGlowGeo, ballGlowMat);
  ball.add(ballGlow);
  scene.add(ball);

  for (let i = 0; i < MAX_TRAILS; i++) {
    const tg = new THREE.CircleGeometry(0.022, 16);
    const tm = new THREE.MeshBasicMaterial({
      color: 0x00e5ff, transparent: true, opacity: 0.0,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const t = new THREE.Mesh(tg, tm);
    scene.add(t);
    trails.push(t);
  }

  // Dash line
  const pts = [];
  const N = 40;
  for (let i = 0; i <= N; i++) {
    const y = -1 + (2 * i / N);
    if (i % 2 === 0) {
      pts.push(new THREE.Vector3(0, y, 0));
      pts.push(new THREE.Vector3(0, y + 2 / N * 0.6, 0));
    }
  }
  const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
  const lineMat = new THREE.LineBasicMaterial({ color: 0x444466, transparent: true, opacity: 0.5 });
  scene.add(new THREE.LineSegments(lineGeo, lineMat));
}

// Particle System
function createExplosion(x, y, colorHex) {
  const count = 15;
  for(let i=0; i<count; i++) {
    const geo = new THREE.CircleGeometry(0.015, 8);
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, 0);
    
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.02 + Math.random() * 0.03;
    const velocity = new THREE.Vector2(Math.cos(angle) * speed, Math.sin(angle) * speed);
    
    scene.add(mesh);
    particles.push({ mesh, velocity, life: 1.0 });
  }
}

function updateParticles() {
  for(let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= 0.04;
    if(p.life <= 0) {
      scene.remove(p.mesh);
      particles.splice(i, 1);
      continue;
    }
    p.mesh.position.x += p.velocity.x;
    p.mesh.position.y += p.velocity.y;
    p.mesh.material.opacity = p.life;
    p.mesh.scale.setScalar(p.life);
  }
}

// Control API
export function startMatch() {
  scoreL = scoreR = volley = 0;
  onScoreUpdate(scoreL, scoreR, volley);
  resetBall(Math.random() > 0.5);
  gameRunning = true;
}

export function stopMatch() {
  gameRunning = false;
}

function resetBall(toRight) {
  ballPos.set(0, (Math.random() - 0.5) * 0.5);
  const angle = (Math.random() * 0.5 - 0.25);
  const dx = toRight ? 1 : -1;
  ballDir.set(dx, Math.sin(angle)).normalize();
  ballSpeed = BALL_SPEED;
  volley = 0;
  onScoreUpdate(scoreL, scoreR, volley);
  trailHistory = [];
}

// Game Loop
const circularBuffer = new Array(MAX_TRAILS).fill(null).map(() => new THREE.Vector2());
let trailIdx = 0;

function addScreenShake() {
  document.getElementById('container').classList.add('shake');
  setTimeout(() => document.getElementById('container').classList.remove('shake'), 300);
}

function animate() {
  requestAnimationFrame(animate);
  if (gameRunning) gameTick();
  updateParticles();
  renderer.render(scene, camera);
}

function gameTick() {
  ballPos.x += ballDir.x * ballSpeed;
  ballPos.y += ballDir.y * ballSpeed;

  const aspect = window.innerWidth / window.innerHeight;
  const boundX = aspect + 0.1; 

  // Top/bottom bounce
  if (ballPos.y > 0.97) { ballPos.y = 0.97; ballDir.y *= -1; playWallHit(); }
  if (ballPos.y < -0.97) { ballPos.y = -0.97; ballDir.y *= -1; playWallHit(); }

  // Dynamic paddle X based on resize
  const pxL = paddleLeft.position.x;
  const pxR = paddleRight.position.x;
  const pHalf = PADDLE_H;

  // Left paddle
  if (ballDir.x < 0 && ballPos.x <= pxL + PADDLE_W && ballPos.x >= pxL - PADDLE_W) {
    if (Math.abs(ballPos.y - paddleYL) < pHalf) {
      const rel = (ballPos.y - paddleYL) / pHalf;
      const angle = rel * Math.PI / 3;
      ballDir.set(1, Math.sin(angle)).normalize();
      ballPos.x = pxL + PADDLE_W + 0.005;
      ballSpeed = Math.min(ballSpeed + SPEED_INC, 0.06);
      volley++;
      onScoreUpdate(scoreL, scoreR, volley);
      onFlash('#00ff88aa');
      playPaddleHit();
      createExplosion(pxL + PADDLE_W, ballPos.y, 0x00ff88);
    }
  }

  // Right paddle
  if (ballDir.x > 0 && ballPos.x >= pxR - PADDLE_W && ballPos.x <= pxR + PADDLE_W) {
    if (Math.abs(ballPos.y - paddleYR) < pHalf) {
      const rel = (ballPos.y - paddleYR) / pHalf;
      const angle = rel * Math.PI / 3;
      ballDir.set(-1, Math.sin(angle)).normalize();
      ballPos.x = pxR - PADDLE_W - 0.005;
      ballSpeed = Math.min(ballSpeed + SPEED_INC, 0.06);
      volley++;
      onScoreUpdate(scoreL, scoreR, volley);
      onFlash('#00e5ffaa');
      playPaddleHit();
      createExplosion(pxR - PADDLE_W, ballPos.y, 0x00e5ff);
    }
  }

  // Score
  if (ballPos.x < -boundX) {
    scoreR++;
    onScoreUpdate(scoreL, scoreR, volley);
    onFlash('#ff2dff88');
    addScreenShake();
    
    if (scoreR >= WIN_SCORE) {
      playWin();
      gameRunning = false;
      onGameOver('R', `${scoreL} - ${scoreR}`);
      return;
    } else {
      playScore();
      resetBall(false);
    }
  }
  if (ballPos.x > boundX) {
    scoreL++;
    onScoreUpdate(scoreL, scoreR, volley);
    onFlash('#ff2dff88');
    addScreenShake();

    if (scoreL >= WIN_SCORE) {
      playWin();
      gameRunning = false;
      onGameOver('L', `${scoreL} - ${scoreR}`);
      return;
    } else {
      playScore();
      resetBall(true);
    }
  }

  // Hand tracking input
  if (handL) {
    const targetY = 1 - handL.y * 2;
    paddleYL += (targetY - paddleYL) * 0.25;
  }
  if (handR) {
    const targetY = 1 - handR.y * 2;
    paddleYR += (targetY - paddleYR) * 0.25;
  }

  paddleYL = Math.max(-1 + pHalf, Math.min(1 - pHalf, paddleYL));
  paddleYR = Math.max(-1 + pHalf, Math.min(1 - pHalf, paddleYR));

  paddleLeft.position.y  = paddleYL;
  paddleRight.position.y = paddleYR;
  ball.position.set(ballPos.x, ballPos.y, 0);

  // Trails (Circular buffer)
  circularBuffer[trailIdx].copy(ballPos);
  
  for(let i=0; i<MAX_TRAILS; i++) {
    // trailIdx is newest, (trailIdx - i + MAX) % MAX is older
    const idx = (trailIdx - i + MAX_TRAILS) % MAX_TRAILS;
    const mesh = trails[i];
    const pos = circularBuffer[idx];
    if(pos.x === 0 && pos.y === 0 && trails[i].material.opacity === 0) continue; // skip uninit
    
    mesh.position.set(pos.x, pos.y, 0);
    const scale = Math.max(0, 1 - (i / MAX_TRAILS));
    mesh.scale.set(scale, scale, 1);
    mesh.material.opacity = scale * 0.55;
  }
  
  trailIdx = (trailIdx + 1) % MAX_TRAILS;
}
