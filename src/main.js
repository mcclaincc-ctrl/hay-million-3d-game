import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const HAY_COUNT = 10000;
const HAY_PER_STRAND = 100;
const TOTAL_HAY = HAY_COUNT * HAY_PER_STRAND;
const DEFAULT_BRUSH_RADIUS = 1.8;
const DEFAULT_CLEARING_POWER = 8;

let hayRemaining = TOTAL_HAY;
let coins = 0;
let brushRadius = DEFAULT_BRUSH_RADIUS;
let clearingPower = DEFAULT_CLEARING_POWER;
let autoRakeCount = 0;
let radiusCost = 25;
let powerCost = 30;
let autoCost = 80;
let dragging = false;
let won = false;
let lastPointer = null;

const app = document.querySelector('#app');
app.innerHTML = `
  <div class="hud">
    <div class="title-block">
      <h1>🌾 Hay! One Million! 🌾</h1>
      <p>Clear a massive hay pile, collect coins, and uncover the silver needle.</p>
    </div>
    <div class="stats">
      <div class="stat-box">
        <span class="label">Hay Remaining</span>
        <span id="hay-count" class="value">1,000,000</span>
      </div>
      <div class="stat-box">
        <span class="label">Coins</span>
        <span id="coin-count" class="value">0</span>
      </div>
    </div>
    <div class="layout">
      <div class="viewport-shell">
        <canvas id="scene"></canvas>
        <div id="win-overlay" class="win-overlay hidden">
          <div class="win-card">
            <h2>🎉 You found it!</h2>
            <p>The silver needle was hidden beneath the hay. You win!</p>
          </div>
        </div>
      </div>
      <aside class="shop">
        <h2>Tool Shop</h2>
        <button id="radius-upgrade" class="shop-button">
          <span>Brush Radius</span>
          <small id="radius-detail"></small>
        </button>
        <button id="power-upgrade" class="shop-button">
          <span>Clearing Power</span>
          <small id="power-detail"></small>
        </button>
        <button id="auto-upgrade" class="shop-button">
          <span>Auto-Rake</span>
          <small id="auto-detail"></small>
        </button>
        <p class="shop-note">
          Click or drag the hay pile to clear strands. Each cleared strand removes 100 hay,
          and rarely drops a gold coin.
        </p>
      </aside>
    </div>
    <div id="status-text" class="status-text">Click or drag the mound to start clearing hay.</div>
  </div>
`;

const canvas = document.querySelector('#scene');
const hayCountEl = document.querySelector('#hay-count');
const coinCountEl = document.querySelector('#coin-count');
const statusTextEl = document.querySelector('#status-text');
const radiusUpgradeEl = document.querySelector('#radius-upgrade');
const powerUpgradeEl = document.querySelector('#power-upgrade');
const autoUpgradeEl = document.querySelector('#auto-upgrade');
const radiusDetailEl = document.querySelector('#radius-detail');
const powerDetailEl = document.querySelector('#power-detail');
const autoDetailEl = document.querySelector('#auto-detail');
const winOverlayEl = document.querySelector('#win-overlay');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0xbfe9ff);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbfe9ff);
scene.fog = new THREE.Fog(0xbfe9ff, 18, 56);

const camera = new THREE.PerspectiveCamera(52, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
camera.position.set(8, 11, 16);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 8;
controls.maxDistance = 26;
controls.maxPolarAngle = Math.PI * 0.48;
controls.target.set(0, 2.2, 0);

const hemi = new THREE.HemisphereLight(0xffffef, 0x4c7c42, 1.5);
scene.add(hemi);

const dirLight = new THREE.DirectionalLight(0xfff4cc, 1.6);
dirLight.position.set(8, 16, 6);
dirLight.castShadow = false;
scene.add(dirLight);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(22, 80),
  new THREE.MeshStandardMaterial({ color: 0x7fc65f, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.03;
scene.add(ground);

const brushRing = new THREE.Mesh(
  new THREE.RingGeometry(0.8, 1.05, 40),
  new THREE.MeshBasicMaterial({
    color: 0xfff4c4,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.7,
  })
);
brushRing.rotation.x = -Math.PI / 2;
brushRing.position.y = 0.06;
brushRing.visible = false;
scene.add(brushRing);

const hayGeometry = new THREE.CylinderGeometry(0.065, 0.09, 0.9, 6);
const hayMaterial = new THREE.MeshStandardMaterial({
  color: 0xf2c650,
  roughness: 0.9,
  metalness: 0.08,
});
const hayInstanced = new THREE.InstancedMesh(hayGeometry, hayMaterial, HAY_COUNT);
hayInstanced.castShadow = false;
hayInstanced.receiveShadow = false;
scene.add(hayInstanced);

const hayStates = new Array(HAY_COUNT).fill(true);
const needlePosition = new THREE.Vector3();
const revealRadius = 1.6;
const needle = new THREE.Mesh(
  new THREE.CylinderGeometry(0.045, 0.045, 0.9, 10),
  new THREE.MeshStandardMaterial({
    color: 0xdfe7ee,
    metalness: 1,
    roughness: 0.2,
  })
);
needle.rotation.z = Math.PI / 2;
needle.visible = false;
needle.position.set(0, 0.45, 0);
scene.add(needle);

function generateHayPositions() {
  const matrices = [];
  const radiusMax = 9.8;
  let placed = 0;

  while (placed < HAY_COUNT) {
    const angle = Math.random() * Math.PI * 2;
    const spread = Math.random() * radiusMax;
    const x = Math.cos(angle) * spread;
    const z = Math.sin(angle) * spread;
    const r2 = x * x + z * z;

    if (r2 > radiusMax * radiusMax) continue;

    const y = 0.3 + Math.random() * 3.5 + (radiusMax - Math.sqrt(r2)) * 0.18;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * 0.6)
    );
    const scale = new THREE.Vector3(1, 0.8 + Math.random() * 1.8, 1);
    matrix.compose(new THREE.Vector3(x, y, z), quaternion, scale);
    matrices.push(matrix);
    placed += 1;
  }

  for (let i = 0; i < HAY_COUNT; i++) {
    hayInstanced.setMatrixAt(i, matrices[i]);
  }
  hayInstanced.instanceMatrix.needsUpdate = true;
}

function placeNeedle() {
  const offsetX = (Math.random() - 0.5) * 14;
  const offsetZ = (Math.random() - 0.5) * 14;
  needlePosition.set(offsetX, 0.5, offsetZ);
  needle.position.copy(needlePosition);
}

function updateHud() {
  hayCountEl.textContent = hayRemaining.toLocaleString();
  coinCountEl.textContent = coins.toLocaleString();

  radiusDetailEl.textContent = `${brushRadius.toFixed(1)}m • ${radiusCost} coins`;
  powerDetailEl.textContent = `${clearingPower} strands • ${powerCost} coins`;
  autoDetailEl.textContent = `${autoRakeCount} owned • ${autoCost} coins`;

  radiusUpgradeEl.disabled = coins < radiusCost || won;
  powerUpgradeEl.disabled = coins < powerCost || won;
  autoUpgradeEl.disabled = coins < autoCost || won;
}

function bringToFront(instanceIndex, targetPosition) {
  const hiddenMatrix = new THREE.Matrix4();
  hiddenMatrix.compose(
    new THREE.Vector3(targetPosition.x, -50, targetPosition.z),
    new THREE.Quaternion(),
    new THREE.Vector3(0.0001, 0.0001, 0.0001)
  );
  hayInstanced.setMatrixAt(instanceIndex, hiddenMatrix);
}

function getHayPosition(instanceIndex) {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  hayInstanced.getMatrixAt(instanceIndex, matrix);
  matrix.decompose(position, new THREE.Quaternion(), new THREE.Vector3());
  return position;
}

function countNearbyHay(x, z, radius) {
  let count = 0;
  for (let i = 0; i < HAY_COUNT; i++) {
    if (!hayStates[i]) continue;
    const pos = getHayPosition(i);
    const dx = pos.x - x;
    const dz = pos.z - z;
    if (dx * dx + dz * dz <= radius * radius) {
      count += 1;
    }
  }
  return count;
}

function revealNeedleIfReady() {
  if (won) return;
  const count = countNearbyHay(needlePosition.x, needlePosition.z, revealRadius);
  if (count === 0) {
    needle.visible = true;
    statusTextEl.textContent = 'The silver needle is uncovered! Click it to win.';
  }
}

function spawnCoin(x, z) {
  const coinMaterial = new THREE.MeshStandardMaterial({
    color: 0xf6cd4d,
    emissive: 0x7e5e12,
    metalness: 0.9,
    roughness: 0.3,
  });
  const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 16), coinMaterial);
  coin.rotation.x = Math.PI / 2;
  coin.position.set(x, 0.6, z);
  scene.add(coin);

  const data = { coin, startTime: performance.now(), rise: 0 };
  coin.userData = data;
}

function clearAt(x, z, radius = brushRadius, power = clearingPower) {
  if (won) return 0;

  let cleared = 0;
  for (let i = 0; i < HAY_COUNT && cleared < power; i++) {
    if (!hayStates[i]) continue;
    const pos = getHayPosition(i);
    const dx = pos.x - x;
    const dz = pos.z - z;
    if (dx * dx + dz * dz <= radius * radius) {
      hayStates[i] = false;
      bringToFront(i, pos);
      hayRemaining -= HAY_PER_STRAND;
      cleared += 1;

      if (Math.random() < 0.025) {
        spawnCoin(pos.x, pos.z);
        coins += 1;
      }
    }
  }

  if (cleared > 0) {
    statusTextEl.textContent = cleared > 0 ? 'Hay cleared!' : statusTextEl.textContent;
    revealNeedleIfReady();
  }

  updateHud();
  return cleared;
}

function buyUpgrade(type) {
  if (won) return;

  if (type === 'radius' && coins >= radiusCost) {
    coins -= radiusCost;
    brushRadius += 0.6;
    radiusCost = Math.ceil(radiusCost * 1.7);
    statusTextEl.textContent = 'Brush radius increased.';
  }

  if (type === 'power' && coins >= powerCost) {
    coins -= powerCost;
    clearingPower += 8;
    powerCost = Math.ceil(powerCost * 1.75);
    statusTextEl.textContent = 'Clearing power increased.';
  }

  if (type === 'auto' && coins >= autoCost) {
    coins -= autoCost;
    autoRakeCount += 1;
    autoCost = Math.ceil(autoCost * 1.8);
    statusTextEl.textContent = 'Auto-Rake added.';
  }

  updateHud();
}

function applyAutoRake() {
  if (won || autoRakeCount === 0) return;
  const angle = Math.random() * Math.PI * 2;
  const radius = 6 + Math.random() * 4;
  const x = Math.cos(angle) * radius;
  const z = Math.sin(angle) * radius;
  clearAt(x, z, Math.max(1.8, brushRadius * 0.9), Math.max(4, clearingPower));
}

function pointerToGround(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  const pointer = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );

  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(pointer, camera);

  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const target = new THREE.Vector3();
  raycaster.ray.intersectPlane(plane, target);
  return target;
}

function handlePointerHit(event) {
  if (won) return;
  const hitPoint = pointerToGround(event);
  lastPointer = hitPoint;
  brushRing.visible = true;
  brushRing.position.set(hitPoint.x, 0.08, hitPoint.z);
  brushRing.scale.setScalar(1);

  if (needle.visible) {
    const distance = hitPoint.distanceTo(needle.position);
    if (distance < 0.9) {
      won = true;
      winOverlayEl.classList.remove('hidden');
      statusTextEl.textContent = 'You found the silver needle!';
      updateHud();
      return;
    }
  }

  if (dragging || event.type === 'pointerdown') {
    clearAt(hitPoint.x, hitPoint.z);
  }
}

renderer.domElement.addEventListener('pointerdown', (event) => {
  dragging = true;
  handlePointerHit(event);
});

renderer.domElement.addEventListener('pointermove', (event) => {
  const point = pointerToGround(event);
  lastPointer = point;
  brushRing.visible = true;
  brushRing.position.set(point.x, 0.08, point.z);
  brushRing.scale.setScalar(brushRadius * 0.8);

  if (dragging && !won) {
    clearAt(point.x, point.z);
  }
});

window.addEventListener('pointerup', () => {
  dragging = false;
});

window.addEventListener('pointerleave', () => {
  dragging = false;
  brushRing.visible = false;
});

radiusUpgradeEl.addEventListener('click', () => buyUpgrade('radius'));
powerUpgradeEl.addEventListener('click', () => buyUpgrade('power'));
autoUpgradeEl.addEventListener('click', () => buyUpgrade('auto'));

function animateCoins() {
  const coinsToRemove = [];
  scene.children.forEach((child) => {
    if (child.userData && child.userData.coin) {
      const data = child.userData;
      const elapsed = (performance.now() - data.startTime) / 1000;
      child.position.y = 0.6 + Math.sin(elapsed * 5) * 0.2 + elapsed * 0.8;
      child.rotation.y += 0.08;
      if (elapsed > 1.2) {
        coinsToRemove.push(child);
      }
    }
  });

  coinsToRemove.forEach((coin) => {
    scene.remove(coin);
  });
}

function animate() {
  controls.update();
  animateCoins();

  if (lastPointer) {
    brushRing.position.x = lastPointer.x;
    brushRing.position.z = lastPointer.z;
    brushRing.visible = !won;
  }

  if (!won && autoRakeCount > 0 && Math.random() < 0.018) {
    applyAutoRake();
  }

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

generateHayPositions();
placeNeedle();
updateHud();
animate();
setInterval(() => {
  if (!won && autoRakeCount > 0) {
    applyAutoRake();
  }
}, 1000);
