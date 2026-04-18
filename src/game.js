import * as THREE from 'three';
import { handL, handR } from './tracker.js';
import { playPaddleHit, playWallHit, playScore, playWin } from './audio.js';

// Game constants
const WIN_SCORE   = 7;
const BALL_SPEED  = 0.018;
const SPEED_INC   = 0.0008;
const PADDLE_H    = 0.28;
const PADDLE_W    = 0.025;
const MAX_TRAILS  = 18;

// Three.js instances
let scene, camera;
let paddleLeft, paddleRight, ball;
let ballGlowMesh;
let handDotL, handDotR;
let trails = [];
let activeParticles = [];
let particlePool = [];
let paddleHitFlashL = 0, paddleHitFlashR = 0;

let containerEl;
let cachedAspect = 1;
let lastTime = 0;

// Game State
export let gameRunning = false;
export let scoreL = 0, scoreR = 0, volley = 0;
let ballPos = new THREE.Vector2(0, 0);
let ballDir = new THREE.Vector2(1, 0.3).normalize();
let ballSpeed = BALL_SPEED;
let paddleYL = 0, paddleYR = 0;

let onScoreUpdate = null;
let onGameOver = null;
let onFlash = null;

export function initGame(canvasId, scoreCb, overCb, flashCb) {
  onScoreUpdate = scoreCb;
  onGameOver = overCb;
  onFlash = flashCb;

  const canvas = document.getElementById(canvasId);
  containerEl = canvas.parentElement;

  cachedAspect = window.innerWidth / window.innerHeight;
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-cachedAspect, cachedAspect, 1, -1, 0.1, 10);
  camera.position.z = 5;

  setupObjects();

  paddleLeft.position.set(-(cachedAspect - 0.15), 0, 0);
  paddleRight.position.set((cachedAspect - 0.15), 0, 0);
}

export function getScene()  { return scene;  }
export function getCamera() { return camera; }

export function onResize() {
  cachedAspect = window.innerWidth / window.innerHeight;
  camera.left   = -cachedAspect;
  camera.right  =  cachedAspect;
  camera.top    = 1;
  camera.bottom = -1;
  camera.updateProjectionMatrix();
  if (paddleLeft) {
    paddleLeft.position.set(-(cachedAspect - 0.15), paddleYL, 0);
    paddleRight.position.set((cachedAspect - 0.15), paddleYR, 0);
  }
}

function makeGlowRect(w, h, color, emissiveColor) {
  const geo = new THREE.PlaneGeometry(w, h);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 });
  const mesh = new THREE.Mesh(geo, mat);
  const glowGeo = new THREE.PlaneGeometry(w * 4, h * 1.5);
  const glowMat = new THREE.MeshBasicMaterial({
    color: emissiveColor || color,
    transparent: true, opacity: 0.18,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  mesh.add(new THREE.Mesh(glowGeo, glowMat));
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
  ballGlowMesh = new THREE.Mesh(ballGlowGeo, ballGlowMat);
  ball.add(ballGlowMesh);
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
  const lineMat = new THREE.LineBasicMaterial({ color: 0x3355cc, transparent: true, opacity: 0.7 });
  scene.add(new THREE.LineSegments(lineGeo, lineMat));

  const ringGeoL = new THREE.RingGeometry(0.032, 0.048, 32);
  const ringMatL = new THREE.MeshBasicMaterial({
    color: 0x00ff88, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
  });
  handDotL = new THREE.Mesh(ringGeoL, ringMatL);
  scene.add(handDotL);

  const ringGeoR = new THREE.RingGeometry(0.032, 0.048, 32);
  const ringMatR = new THREE.MeshBasicMaterial({
    color: 0x00e5ff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
  });
  handDotR = new THREE.Mesh(ringGeoR, ringMatR);
  scene.add(handDotR);

  const pGeo = new THREE.CircleGeometry(0.015, 8);
  for (let i = 0; i < 60; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const mesh = new THREE.Mesh(pGeo, mat);
    mesh.visible = false;
    scene.add(mesh);
    particlePool.push(mesh);
  }
}

function createExplosion(x, y, colorHex) {
  const count = Math.min(12, particlePool.length);
  for (let i = 0; i < count; i++) {
    const mesh = particlePool.pop();
    mesh.material.color.setHex(colorHex);
    mesh.material.opacity = 0.8;
    mesh.position.set(x, y, 0);
    mesh.scale.setScalar(1);
    mesh.visible = true;
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.02 + Math.random() * 0.03;
    activeParticles.push({ mesh, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1.0 });
  }
}

function updateParticles(dt) {
  for (let i = activeParticles.length - 1; i >= 0; i--) {
    const p = activeParticles[i];
    p.life -= 0.04 * dt;
    if (p.life <= 0) {
      p.mesh.visible = false;
      p.mesh.material.opacity = 0;
      particlePool.push(p.mesh);
      activeParticles.splice(i, 1);
      continue;
    }
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.material.opacity = p.life;
    p.mesh.scale.setScalar(p.life);
  }
}

export function startMatch() {
  scoreL = scoreR = volley = 0;
  onScoreUpdate(scoreL, scoreR, volley);
  resetBall(Math.random() > 0.5);
  gameRunning = true;
  lastTime = 0;
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
}

const circularBuffer = new Array(MAX_TRAILS).fill(null).map(() => new THREE.Vector2());
let trailIdx = 0;

function addScreenShake() {
  containerEl.classList.add('shake');
  setTimeout(() => containerEl.classList.remove('shake'), 300);
}

function updateHandDots() {
  if (handL) {
    handDotL.position.set((handL.x * 2 - 1) * cachedAspect, 1 - handL.y * 2, 0);
    handDotL.material.opacity = 0.8;
  } else {
    handDotL.material.opacity = 0;
  }
  if (handR) {
    handDotR.position.set((handR.x * 2 - 1) * cachedAspect, 1 - handR.y * 2, 0);
    handDotR.material.opacity = 0.8;
  } else {
    handDotR.material.opacity = 0;
  }
}

// Called from the master RAF loop in main.js
export function tick(now) {
  const dt = lastTime > 0 ? Math.min((now - lastTime) / 16.667, 3) : 1;
  lastTime = now;

  if (gameRunning) gameTick(dt);
  updateParticles(dt);
  updateHandDots();
}

function gameTick(dt) {
  ballPos.x += ballDir.x * ballSpeed * dt;
  ballPos.y += ballDir.y * ballSpeed * dt;

  const boundX = cachedAspect + 0.1;

  if (ballPos.y > 0.97)  { ballPos.y = 0.97;  ballDir.y *= -1; playWallHit(); }
  if (ballPos.y < -0.97) { ballPos.y = -0.97; ballDir.y *= -1; playWallHit(); }

  const pxL = paddleLeft.position.x;
  const pxR = paddleRight.position.x;
  const pHalf = PADDLE_H;

  if (ballDir.x < 0 && ballPos.x <= pxL + PADDLE_W && ballPos.x >= pxL - PADDLE_W) {
    if (Math.abs(ballPos.y - paddleYL) < pHalf) {
      const rel = (ballPos.y - paddleYL) / pHalf;
      ballDir.set(1, Math.sin(rel * Math.PI / 3)).normalize();
      ballPos.x = pxL + PADDLE_W + 0.005;
      ballSpeed = Math.min(ballSpeed + SPEED_INC, 0.06);
      volley++;
      paddleHitFlashL = 1.0;
      onScoreUpdate(scoreL, scoreR, volley);
      onFlash('#00ff88aa');
      playPaddleHit();
      createExplosion(pxL + PADDLE_W, ballPos.y, 0x00ff88);
    }
  }

  if (ballDir.x > 0 && ballPos.x >= pxR - PADDLE_W && ballPos.x <= pxR + PADDLE_W) {
    if (Math.abs(ballPos.y - paddleYR) < pHalf) {
      const rel = (ballPos.y - paddleYR) / pHalf;
      ballDir.set(-1, Math.sin(rel * Math.PI / 3)).normalize();
      ballPos.x = pxR - PADDLE_W - 0.005;
      ballSpeed = Math.min(ballSpeed + SPEED_INC, 0.06);
      volley++;
      paddleHitFlashR = 1.0;
      onScoreUpdate(scoreL, scoreR, volley);
      onFlash('#00e5ffaa');
      playPaddleHit();
      createExplosion(pxR - PADDLE_W, ballPos.y, 0x00e5ff);
    }
  }

  if (ballPos.x < -boundX) {
    scoreR++;
    onScoreUpdate(scoreL, scoreR, volley);
    onFlash('#ff2dff88');
    addScreenShake();
    if (scoreR >= WIN_SCORE) {
      playWin(); gameRunning = false; onGameOver('R', `${scoreL} - ${scoreR}`);
    } else { playScore(); resetBall(false); }
  }
  if (ballPos.x > boundX) {
    scoreL++;
    onScoreUpdate(scoreL, scoreR, volley);
    onFlash('#ff2dff88');
    addScreenShake();
    if (scoreL >= WIN_SCORE) {
      playWin(); gameRunning = false; onGameOver('L', `${scoreL} - ${scoreR}`);
    } else { playScore(); resetBall(true); }
  }

  if (handL) {
    const targetY = 1 - handL.y * 2;
    paddleYL += (targetY - paddleYL) * Math.min(1, 0.25 * dt);
  }
  if (handR) {
    const targetY = 1 - handR.y * 2;
    paddleYR += (targetY - paddleYR) * Math.min(1, 0.25 * dt);
  }

  paddleYL = Math.max(-1 + pHalf, Math.min(1 - pHalf, paddleYL));
  paddleYR = Math.max(-1 + pHalf, Math.min(1 - pHalf, paddleYR));

  paddleLeft.position.y  = paddleYL;
  paddleRight.position.y = paddleYR;
  ball.position.set(ballPos.x, ballPos.y, 0);

  circularBuffer[trailIdx].copy(ballPos);
  for (let i = 0; i < MAX_TRAILS; i++) {
    const idx  = (trailIdx - i + MAX_TRAILS) % MAX_TRAILS;
    const mesh = trails[i];
    const pos  = circularBuffer[idx];
    if (pos.x === 0 && pos.y === 0 && mesh.material.opacity === 0) continue;
    mesh.position.set(pos.x, pos.y, 0);
    const scale = Math.max(0, 1 - (i / MAX_TRAILS));
    mesh.scale.set(scale, scale, 1);
    mesh.material.opacity = scale * 0.55;
    const t = i / MAX_TRAILS;
    mesh.material.color.setRGB(t, 1 - t * 0.9, 1);
  }
  trailIdx = (trailIdx + 1) % MAX_TRAILS;

  const speedRatio = Math.min(1, (ballSpeed - BALL_SPEED) / (0.06 - BALL_SPEED));
  ballGlowMesh.scale.setScalar(1 + speedRatio * 2.5);
  ballGlowMesh.material.opacity = 0.22 + speedRatio * 0.35;

  if (paddleHitFlashL > 0) {
    paddleHitFlashL = Math.max(0, paddleHitFlashL - 0.08);
    paddleLeft.children[0].material.opacity = 0.18 + paddleHitFlashL * 0.6;
  }
  if (paddleHitFlashR > 0) {
    paddleHitFlashR = Math.max(0, paddleHitFlashR - 0.08);
    paddleRight.children[0].material.opacity = 0.18 + paddleHitFlashR * 0.6;
  }
}
