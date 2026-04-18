import * as THREE from 'three';
import { handL, handR } from './tracker.js';
import { playSlashHit, playSlashMiss } from './audio.js';

const BLOCK_SIZE      = 0.25;
const ARROW_S         = 0.075;
const SPAWN_SCALE     = 0.08;
const HIT_SCALE_MIN   = 0.65;
const HIT_SCALE_MAX   = 1.15;
const MISS_SCALE      = 1.45;
const APPROACH_SPEED  = 0.007; // scale units per normalised frame
const SLASH_THRESHOLD = 0.028; // world-unit delta to register a slash
const MAX_LIVES       = 3;

const DIRS    = ['up', 'down', 'left', 'right'];
const COLOR_L = 0x00ff88; // green — left hand
const COLOR_R = 0x00e5ff; // cyan  — right hand

let scene, camera, containerEl;
let cachedAspect = 1;

let blocks         = [];
let activeParticles = [];
let particlePool   = [];
let handMeshL, handMeshR;
let slashFlashL = 0, slashFlashR = 0;
let prevHandL = null, prevHandR = null;
let lastTime  = 0;

export let gameRunning = false;
export let score  = 0;
export let combo  = 0;
export let lives  = MAX_LIVES;
let spawnTimer    = 0;
let spawnInterval = 90; // frames at 60 fps ≈ 1.5 s

let onScoreUpdate = null, onGameOver = null, onLivesUpdate = null;

// ─── Init ────────────────────────────────────────────────────────────────────

export function initBeatSaber(scoreCb, overCb, livesCb) {
  onScoreUpdate = scoreCb;
  onGameOver    = overCb;
  onLivesUpdate = livesCb;

  containerEl  = document.getElementById('container');
  cachedAspect = window.innerWidth / window.innerHeight;

  scene  = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-cachedAspect, cachedAspect, 1, -1, 0.1, 10);
  camera.position.z = 5;

  // Pre-allocate particle pool
  const pGeo = new THREE.CircleGeometry(0.013, 8);
  for (let i = 0; i < 80; i++) {
    const mat  = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const mesh = new THREE.Mesh(pGeo, mat);
    mesh.visible = false;
    scene.add(mesh);
    particlePool.push(mesh);
  }

  handMeshL = makeRing(COLOR_L);
  handMeshR = makeRing(COLOR_R);
  scene.add(handMeshL, handMeshR);
}

function makeRing(color) {
  const geo = new THREE.RingGeometry(0.04, 0.075, 32);
  const mat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
  });
  return new THREE.Mesh(geo, mat);
}

export function getScene()  { return scene;  }
export function getCamera() { return camera; }

export function onResize() {
  cachedAspect  = window.innerWidth / window.innerHeight;
  camera.left   = -cachedAspect;
  camera.right  =  cachedAspect;
  camera.updateProjectionMatrix();
}

// ─── Match control ───────────────────────────────────────────────────────────

export function startBeatSaber() {
  blocks.forEach(b => scene.remove(b.group));
  blocks = [];
  activeParticles.forEach(p => { p.mesh.visible = false; particlePool.push(p.mesh); });
  activeParticles = [];

  score = 0; combo = 0; lives = MAX_LIVES;
  spawnTimer = 0; spawnInterval = 90;
  prevHandL = prevHandR = null;
  slashFlashL = slashFlashR = 0;
  lastTime = 0;

  onScoreUpdate(score, combo);
  onLivesUpdate(lives);
  gameRunning = true;
}

export function stopBeatSaber() { gameRunning = false; }

// ─── Block spawning ──────────────────────────────────────────────────────────

function makeArrowShape(dir) {
  const s     = ARROW_S;
  const shape = new THREE.Shape();
  if (dir === 'up') {
    shape.moveTo(0, s);    shape.lineTo(-s * 0.65, -s * 0.55); shape.lineTo(s * 0.65, -s * 0.55);
  } else if (dir === 'down') {
    shape.moveTo(0, -s);   shape.lineTo(-s * 0.65,  s * 0.55); shape.lineTo(s * 0.65,  s * 0.55);
  } else if (dir === 'left') {
    shape.moveTo(-s, 0);   shape.lineTo( s * 0.55,  s * 0.65); shape.lineTo(s * 0.55, -s * 0.65);
  } else {
    shape.moveTo(s, 0);    shape.lineTo(-s * 0.55,  s * 0.65); shape.lineTo(-s * 0.55, -s * 0.65);
  }
  shape.closePath();
  return shape;
}

function spawnBlock() {
  const isLeft = Math.random() > 0.5;
  const color  = isLeft ? COLOR_L : COLOR_R;
  const dir    = DIRS[Math.floor(Math.random() * DIRS.length)];
  const x      = (Math.random() * 1.1 - 0.55) * cachedAspect;
  const y      = Math.random() * 1.3 - 0.65;

  const group = new THREE.Group();

  // Body
  const bodyMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0 });
  const body    = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK_SIZE, BLOCK_SIZE), bodyMat);
  group.add(body);

  // Glow halo
  const glowMat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK_SIZE * 2.2, BLOCK_SIZE * 2.2), glowMat);
  glow.position.z = -0.01;
  group.add(glow);

  // Direction arrow
  const arrowMat  = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
  const arrowMesh = new THREE.Mesh(new THREE.ShapeGeometry(makeArrowShape(dir)), arrowMat);
  arrowMesh.position.z = 0.01;
  group.add(arrowMesh);

  group.position.set(x, y, 0);
  group.scale.setScalar(SPAWN_SCALE);
  scene.add(group);

  blocks.push({ group, body, glow, arrowMesh, x, y, dir, isLeft, color, scale: SPAWN_SCALE, hit: false });
}

// ─── Slash detection ─────────────────────────────────────────────────────────

function detectSlash(curr, prev) {
  if (!curr || !prev) return null;
  const cx = (curr.x * 2 - 1) * cachedAspect, cy = 1 - curr.y * 2;
  const px = (prev.x * 2 - 1) * cachedAspect, py = 1 - prev.y * 2;
  const dx = cx - px, dy = cy - py;
  const speed = Math.hypot(dx, dy);
  if (speed < SLASH_THRESHOLD) return null;
  const dir = Math.abs(dx) > Math.abs(dy)
    ? (dx > 0 ? 'right' : 'left')
    : (dy > 0 ? 'up'    : 'down');
  return { worldX: cx, worldY: cy, dir, speed };
}

function checkSlash(slash, isLeft) {
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i];
    if (b.hit || b.isLeft !== isLeft) continue;
    if (b.scale < HIT_SCALE_MIN || b.scale > HIT_SCALE_MAX) continue;

    if (Math.hypot(slash.worldX - b.x, slash.worldY - b.y) < BLOCK_SIZE * b.scale * 0.85) {
      const perfect = slash.dir === b.dir;
      score += (perfect ? 100 : 50) * Math.max(1, combo);
      combo++;
      b.hit = true;

      createExplosion(b.x, b.y, b.color, 14);
      scene.remove(b.group);
      blocks.splice(i, 1);

      playSlashHit(perfect);
      onScoreUpdate(score, combo);

      if (isLeft) slashFlashL = 1.0; else slashFlashR = 1.0;
      return;
    }
  }
}

// ─── Particles ───────────────────────────────────────────────────────────────

function createExplosion(x, y, colorHex, count = 12) {
  const n = Math.min(count, particlePool.length);
  for (let i = 0; i < n; i++) {
    const mesh = particlePool.pop();
    mesh.material.color.setHex(colorHex);
    mesh.material.opacity = 0.9;
    mesh.position.set(x, y, 0);
    mesh.scale.setScalar(1);
    mesh.visible = true;
    const angle = (i / n) * Math.PI * 2 + Math.random() * 0.4;
    const sp    = 0.025 + Math.random() * 0.035;
    activeParticles.push({ mesh, vx: Math.cos(angle) * sp, vy: Math.sin(angle) * sp, life: 1.0 });
  }
}

function updateParticles(dt) {
  for (let i = activeParticles.length - 1; i >= 0; i--) {
    const p = activeParticles[i];
    p.life -= 0.034 * dt;
    if (p.life <= 0) {
      p.mesh.visible = false; p.mesh.material.opacity = 0;
      particlePool.push(p.mesh); activeParticles.splice(i, 1); continue;
    }
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.material.opacity = p.life * 0.9;
    p.mesh.scale.setScalar(Math.max(0.05, p.life));
  }
}

// ─── Hand visuals ────────────────────────────────────────────────────────────

function updateHandVisuals(slashL, slashR) {
  const update = (mesh, hand, slash) => {
    if (!hand) { mesh.material.opacity = 0; return; }
    mesh.position.set((hand.x * 2 - 1) * cachedAspect, 1 - hand.y * 2, 0);
    mesh.material.opacity = slash ? 1.0 : 0.45;
    mesh.scale.setScalar(slash ? 1.5 + slash.speed * 6 : 1.0);
  };
  update(handMeshL, handL, slashL);
  update(handMeshR, handR, slashR);
  slashFlashL = Math.max(0, slashFlashL - 0.12);
  slashFlashR = Math.max(0, slashFlashR - 0.12);
}

// ─── Main tick (called by master loop in main.js) ────────────────────────────

export function tick(now) {
  const dt = lastTime > 0 ? Math.min((now - lastTime) / 16.667, 3) : 1;
  lastTime = now;

  const slashL = detectSlash(handL, prevHandL);
  const slashR = detectSlash(handR, prevHandR);

  if (gameRunning) {
    // Spawn
    spawnTimer += dt;
    if (spawnTimer >= spawnInterval) {
      spawnTimer -= spawnInterval;
      spawnBlock();
      spawnInterval = Math.max(36, spawnInterval - 0.35);
    }

    // Slash checks
    if (slashL) checkSlash(slashL, true);
    if (slashR) checkSlash(slashR, false);

    // Approach blocks
    for (let i = blocks.length - 1; i >= 0; i--) {
      const b = blocks[i];
      b.scale += APPROACH_SPEED * dt;
      b.group.scale.setScalar(b.scale);

      const op = Math.min(0.92, (b.scale - SPAWN_SCALE) * 2.5);
      b.body.material.opacity      = op;
      b.glow.material.opacity      = op * 0.2;
      b.arrowMesh.material.opacity = op;

      if (b.scale >= MISS_SCALE) {
        lives = Math.max(0, lives - 1);
        combo = 0;
        onLivesUpdate(lives);
        onScoreUpdate(score, combo);
        playSlashMiss();
        containerEl.classList.add('shake');
        setTimeout(() => containerEl.classList.remove('shake'), 300);
        scene.remove(b.group);
        blocks.splice(i, 1);

        if (lives <= 0) {
          gameRunning = false;
          blocks.forEach(b2 => scene.remove(b2.group));
          blocks = [];
          onGameOver(score);
          return;
        }
      }
    }
  }

  updateParticles(dt);
  updateHandVisuals(slashL, slashR);

  prevHandL = handL ? { x: handL.x, y: handL.y } : null;
  prevHandR = handR ? { x: handR.x, y: handR.y } : null;
}
