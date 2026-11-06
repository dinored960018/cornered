// 링과 경기장, 화면 후처리, 튀는 땀·피 입자.
// 싸움은 Z축 위에서 벌어지고, 링을 45도 돌려 그 축이 대각선이 되게 한다.
// 그래서 뒤로 밀리면 양옆의 로프가 진짜로 좁혀 들어온다.
import * as THREE from 'three';

export const RING = 3.0; // 링 한 변의 절반

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, 1); }
  return t;
}

export function buildWorld(scene) {
  scene.background = new THREE.Color(0x030305);
  scene.fog = new THREE.FogExp2(0x040406, 0.062);
  const ring = new THREE.Group();
  ring.rotation.y = Math.PI / 4;
  scene.add(ring);

  // 캔버스 바닥
  const floorTex = canvasTex(2048, 2048, (x, w) => {
    x.fillStyle = '#6e6a60';
    x.fillRect(0, 0, w, w);
    const img = x.getImageData(0, 0, w, w);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 16;
      img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
    }
    x.putImageData(img, 0, 0);
    // 코너쪽 색과 가운데 글자
    x.save();
    x.translate(w / 2, w / 2);
    x.strokeStyle = 'rgba(120,20,18,.75)';
    x.lineWidth = 10;
    x.beginPath(); x.arc(0, 0, 420, 0, Math.PI * 2); x.stroke();
    x.rotate(-Math.PI / 4);
    x.fillStyle = 'rgba(120,20,18,.78)';
    x.font = '900 190px "Arial Black", Impact, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText('CORNERED', 0, 0);
    x.restore();
    // 땀자국과 핏자국
    for (let i = 0; i < 90; i++) {
      x.fillStyle = `rgba(${Math.random() < 0.3 ? '90,10,8' : '40,34,28'},${0.05 + Math.random() * 0.14})`;
      x.beginPath();
      x.ellipse(Math.random() * w, Math.random() * w, 4 + Math.random() * 44, 3 + Math.random() * 26, Math.random() * 3, 0, Math.PI * 2);
      x.fill();
    }
    // 발 끌린 자국
    x.strokeStyle = 'rgba(30,26,22,.12)';
    for (let i = 0; i < 220; i++) {
      x.lineWidth = 2 + Math.random() * 9;
      const a = Math.random() * w, b = Math.random() * w;
      x.beginPath();
      x.moveTo(a, b);
      x.lineTo(a + (Math.random() - 0.5) * 170, b + (Math.random() - 0.5) * 170);
      x.stroke();
    }
  });
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(RING * 2 + 0.6, RING * 2 + 0.6),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.92 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  ring.add(floor);

  // 링 받침
  const apron = new THREE.Mesh(
    new THREE.BoxGeometry(RING * 2 + 0.8, 1.05, RING * 2 + 0.8),
    new THREE.MeshStandardMaterial({ color: 0x16171d, roughness: 0.85 })
  );
  apron.position.y = -0.53;
  ring.add(apron);

  // 코너 기둥과 패드
  const colors = [0xb31716, 0x1a43a3, 0xd9d6cc, 0xd9d6cc];
  const corners = [[1, 1], [-1, -1], [1, -1], [-1, 1]];
  // 내 쪽 코너: 링을 45도 돌렸으므로 +Z 방향이 (1,1) 코너
  corners.forEach(([sx, sz], i) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 1.55, 16), new THREE.MeshStandardMaterial({ color: 0x24252b, metalness: 0.75, roughness: 0.35 }));
    post.position.set(sx * RING, 0.76, sz * RING);
    post.castShadow = true;
    ring.add(post);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.27, 1.12, 0.27), new THREE.MeshPhysicalMaterial({ color: colors[i], roughness: 0.42, clearcoat: 0.4 }));
    pad.position.set(sx * (RING - 0.05), 0.82, sz * (RING - 0.05));
    pad.rotation.y = Math.PI / 4;
    pad.castShadow = true;
    ring.add(pad);
  });

  // 로프
  const ropeColors = [0xc81f1e, 0xe7e3d8, 0x1f4fbe];
  const sides = [
    [[1, 1], [1, -1]], [[1, -1], [-1, -1]], [[-1, -1], [-1, 1]], [[-1, 1], [1, 1]],
  ];
  const ropes = [];
  [0.58, 0.96, 1.34].forEach((y, row) => {
    const mat = new THREE.MeshPhysicalMaterial({ color: ropeColors[row], roughness: 0.38, clearcoat: 0.55 });
    for (const [[ax, az], [bx, bz]] of sides) {
      const path = new THREE.CatmullRomCurve3([
        new THREE.Vector3(ax * RING, y, az * RING),
        new THREE.Vector3((ax + bx) * 0.5 * RING, y - 0.05, (az + bz) * 0.5 * RING),
        new THREE.Vector3(bx * RING, y, bz * RING),
      ]);
      const r = new THREE.Mesh(new THREE.TubeGeometry(path, 24, 0.024, 10), mat);
      r.castShadow = true;
      ring.add(r);
      ropes.push(r);
    }
  });

  // 경기장 바닥
  const arena = new THREE.Mesh(new THREE.CircleGeometry(40, 48), new THREE.MeshStandardMaterial({ color: 0x08080b, roughness: 0.9 }));
  arena.rotation.x = -Math.PI / 2;
  arena.position.y = -1.05;
  scene.add(arena);

  // LED 광고판 (링 둘레)
  const boardTex = canvasTex(2048, 128, (x, w, h) => {
    x.fillStyle = '#08090e';
    x.fillRect(0, 0, w, h);
    const words = ['CORNERED', '도망칠 곳은 없다', 'NO WAY OUT', '링 위의 3분', 'KNOCKOUT', '로프 뒤는 없다'];
    x.font = '900 72px "Arial Black", "Malgun Gothic", sans-serif';
    x.textBaseline = 'middle';
    let cx = 20;
    let idx = 0;
    while (cx < w) {
      x.fillStyle = idx % 2 ? '#e0312c' : '#f2efe6';
      const word = words[idx % words.length];
      x.fillText(word, cx, h / 2 + 4);
      cx += x.measureText(word).width + 80;
      idx++;
    }
  }, 2);
  const boardMat = new THREE.MeshBasicMaterial({ map: boardTex, toneMapped: false, color: 0x8f8f8f });
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(RING * 2 + 4, 0.55), boardMat);
    const a = (i * Math.PI) / 2;
    b.position.set(Math.sin(a) * (RING + 2.2), -0.65, Math.cos(a) * (RING + 2.2));
    b.rotation.y = a + Math.PI;
    ring.add(b);
  }

  // 관중: 어둠 속에 다닥다닥 앉아 있는 실루엣. 머리 하나하나가 이쪽을 본다
  const crowdBody = new THREE.CapsuleGeometry(0.2, 0.42, 3, 8);
  const crowdHead = new THREE.SphereGeometry(0.115, 10, 8);
  const N = 2400;
  const bodies = new THREE.InstancedMesh(crowdBody, new THREE.MeshBasicMaterial(), N);
  const heads = new THREE.InstancedMesh(crowdHead, new THREE.MeshBasicMaterial(), N);
  const M = new THREE.Matrix4();
  const seats = [];
  const col = new THREE.Color();
  let n = 0;
  for (let row = 0; row < 26 && n < N; row++) {
    const dist = RING + 3.6 + row * 1.0;
    const y = -0.5 + row * 0.56;
    for (let side = 0; side < 4 && n < N; side++) {
      const span = dist * 2;
      for (let u = -span / 2; u < span / 2 && n < N; u += 0.72) {
        if (Math.random() < 0.06) continue;
        const a = (side * Math.PI) / 2;
        const lx = u + (Math.random() - 0.5) * 0.14, lz = dist + (Math.random() - 0.5) * 0.2;
        const x = Math.cos(a) * lx + Math.sin(a) * lz;
        const z = -Math.sin(a) * lx + Math.cos(a) * lz;
        const seat = { x, y: y + Math.random() * 0.08, z, ph: Math.random() * 6.28, sp: 1.2 + Math.random() * 1.6 };
        seats.push(seat);
        M.makeTranslation(x, seat.y, z);
        bodies.setMatrixAt(n, M);
        M.makeTranslation(x, seat.y + 0.5, z);
        heads.setMatrixAt(n, M);
        col.setHSL(0.02 + Math.random() * 0.1, 0.2, 0.004 + Math.random() * 0.012);
        bodies.setColorAt(n, col);
        col.setHSL(0.06, 0.3, 0.012 + Math.random() * 0.024);
        heads.setColorAt(n, col);
        n++;
      }
    }
  }
  bodies.count = n; heads.count = n;
  ring.add(bodies, heads);

  // 카메라 플래시
  const flashN = 240;
  const flashGeo = new THREE.BufferGeometry();
  const flashPos = new Float32Array(flashN * 3);
  const flashCol = new Float32Array(flashN * 3);
  const flashLife = new Float32Array(flashN);
  for (let i = 0; i < flashN; i++) {
    const s = seats[Math.floor(Math.random() * seats.length)];
    flashPos.set([s.x, s.y + 0.55, s.z], i * 3);
  }
  flashGeo.setAttribute('position', new THREE.BufferAttribute(flashPos, 3));
  flashGeo.setAttribute('color', new THREE.BufferAttribute(flashCol, 3));
  const flashes = new THREE.Points(flashGeo, new THREE.PointsMaterial({
    size: 0.5, vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
    map: canvasTex(64, 64, (x) => {
      const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.25, 'rgba(255,255,255,.5)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, 64, 64);
    }),
  }));
  flashes.frustumCulled = false;
  ring.add(flashes);

  // 트러스 조명: 위에서 내리꽂는 빛의 네모
  const truss = new THREE.Group();
  truss.position.y = 6.2;
  const lamp = new THREE.MeshBasicMaterial({ color: 0xfff3dd });
  const barMat = new THREE.MeshStandardMaterial({ color: 0x0c0c10, roughness: 0.6 });
  for (const [x, z, w, d] of [[0, 2.3, 5.2, 0.28], [0, -2.3, 5.2, 0.28], [2.3, 0, 0.28, 5.2], [-2.3, 0, 0.28, 5.2]]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, 0.28, d), barMat);
    bar.position.set(x, 0.2, z);
    truss.add(bar);
    const light = new THREE.Mesh(new THREE.BoxGeometry(w * 0.96, 0.04, d * 0.96), lamp);
    light.position.set(x, 0.04, z);
    truss.add(light);
  }
  ring.add(truss);

  // 빛기둥 (안개 속 볼륨)
  const coneTex = canvasTex(8, 128, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,240,215,.2)');
    g.addColorStop(1, 'rgba(255,240,215,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
  });
  const coneMat = new THREE.MeshBasicMaterial({ map: coneTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, opacity: 0.05, fog: false });
  for (const [x, z] of [[1.7, 1.7], [-1.7, 1.7], [1.7, -1.7], [-1.7, -1.7]]) {
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 2.1, 5.9, 24, 1, true), coneMat);
    cone.position.set(x, 3.2, z);
    ring.add(cone);
  }

  // 조명
  const hemi = new THREE.HemisphereLight(0x5c6078, 0x8a6a4c, 0.72);
  scene.add(hemi);
  const key = new THREE.SpotLight(0xfff1dc, 68, 15, 0.56, 0.5, 1.5);
  key.position.set(0, 6.4, 0.8);
  key.target.position.set(0, 1, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 2;
  key.shadow.camera.far = 11;
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.02;
  scene.add(key, key.target);
  // 복서 얼굴을 위에서 파내는 조명. 눈이 그늘에 잠기게 일부러 높게 둔다
  const faceFill = new THREE.SpotLight(0xffe7ca, 9, 8, 0.78, 1, 1.3);
  faceFill.position.set(0, 3.1, 1.6);
  scene.add(faceFill, faceFill.target);
  // 바닥에서 튀어 올라오는 빛. 턱 아래가 까맣게 뭉개지지 않게 한다
  const bounce = new THREE.PointLight(0xffc9a0, 2.4, 5, 1.6);
  bounce.position.set(0, 0.9, 1);
  scene.add(bounce);
  const rimL = new THREE.DirectionalLight(0xff4a35, 1.5);
  rimL.position.set(-4, 3, -5);
  const rimR = new THREE.DirectionalLight(0x4f7cff, 1.5);
  rimR.position.set(4, 3, -5);
  scene.add(rimL, rimR);

  return { ring, key, faceFill, bounce, hemi, rimL, rimR, flashGeo, flashLife, flashCol, flashN, seats, coneMat, boardTex, ropes };
}

/** 관중 플래시와 전광판 */
export function updateWorld(w, dt, excitement, oppZ, playerZ) {
  w.boardTex.offset.x -= dt * 0.02;
  const { flashLife, flashCol, flashN } = w;
  const rate = 3 + excitement * 45;
  const count = Math.random() < (rate * dt) % 1 ? Math.ceil(rate * dt) : Math.floor(rate * dt);
  for (let i = 0; i < count; i++) flashLife[Math.floor(Math.random() * flashN)] = 1;
  for (let i = 0; i < flashN; i++) {
    if (flashLife[i] > 0) {
      flashLife[i] = Math.max(0, flashLife[i] - dt * 11);
      const v = flashLife[i] * flashLife[i];
      flashCol[i * 3] = v; flashCol[i * 3 + 1] = v; flashCol[i * 3 + 2] = v;
    }
  }
  w.flashGeo.attributes.color.needsUpdate = true;
  // 조명이 싸움터를 따라간다
  const mid = (oppZ + playerZ) * 0.5;
  w.key.target.position.set(0, 1, mid);
  w.key.position.z = mid + 0.7;
  w.faceFill.position.z = playerZ + 0.2;
  w.faceFill.target.position.set(0, 1.6, oppZ);
  w.bounce.position.z = playerZ - 0.1;
}

/* ---------- 땀과 피 ---------- */
export class Particles {
  constructor(scene, count = 500) {
    this.n = count;
    this.p = new Float32Array(count * 3);
    this.c = new Float32Array(count * 3);
    this.v = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.i = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.c, 3));
    this.geo = g;
    // 네모난 점 대신 둥근 물방울
    const dot = document.createElement('canvas');
    dot.width = dot.height = 32;
    const dx = dot.getContext('2d');
    const dg = dx.createRadialGradient(16, 16, 0, 16, 16, 16);
    dg.addColorStop(0, 'rgba(255,255,255,1)');
    dg.addColorStop(0.45, 'rgba(255,255,255,.85)');
    dg.addColorStop(1, 'rgba(255,255,255,0)');
    dx.fillStyle = dg;
    dx.fillRect(0, 0, 32, 32);
    const dotTex = new THREE.CanvasTexture(dot);
    this.m = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.024, map: dotTex, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true, alphaTest: 0.02 }));
    this.m.frustumCulled = false;
    scene.add(this.m);
    this.p.fill(-100);
  }

  burst(pos, dir, n, kind) {
    for (let k = 0; k < n; k++) {
      const i = this.i;
      this.i = (i + 1) % this.n;
      this.p[i * 3] = pos.x + (Math.random() - 0.5) * 0.05;
      this.p[i * 3 + 1] = pos.y + (Math.random() - 0.5) * 0.05;
      this.p[i * 3 + 2] = pos.z + (Math.random() - 0.5) * 0.05;
      const sp = 0.8 + Math.random() * 2.8;
      this.v[i * 3] = dir.x * sp + (Math.random() - 0.5) * 1.8;
      this.v[i * 3 + 1] = dir.y * sp + (Math.random() - 0.2) * 1.7;
      this.v[i * 3 + 2] = dir.z * sp + (Math.random() - 0.5) * 1.8;
      this.life[i] = 0.5 + Math.random() * 0.6;
      if (kind === 'blood' && Math.random() < 0.55) { this.c[i * 3] = 0.42; this.c[i * 3 + 1] = 0.018; this.c[i * 3 + 2] = 0.01; }
      else { const b = 0.75 + Math.random() * 0.25; this.c[i * 3] = b; this.c[i * 3 + 1] = b; this.c[i * 3 + 2] = b * 1.04; }
    }
  }

  update(dt) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      this.v[i * 3 + 1] -= 7 * dt;
      this.p[i * 3] += this.v[i * 3] * dt;
      this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt;
      this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
      if (this.life[i] <= 0 || this.p[i * 3 + 1] < 0) { this.life[i] = 0; this.p[i * 3 + 1] = -100; }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

/* ---------- 타격 이펙트: 맞는 자리에 번쩍이는 섬광과 퍼지는 충격파 ---------- */
function fxTexture(draw) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  draw(c.getContext('2d'), 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const FX_TEX = {};
function fxTex(kind) {
  if (FX_TEX[kind]) return FX_TEX[kind];
  if (kind === 'star') {
    FX_TEX.star = fxTexture((x, r) => {
      const g = x.createRadialGradient(r, r, 0, r, r, r);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.18, 'rgba(255,244,214,.9)');
      g.addColorStop(0.5, 'rgba(255,190,120,.25)');
      g.addColorStop(1, 'rgba(255,160,90,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, r * 2, r * 2);
      // 뾰족한 빛살
      x.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + (i % 2) * 0.2;
        const len = r * (i % 2 ? 0.62 : 0.98);
        x.beginPath();
        x.moveTo(r + Math.cos(a - 0.09) * 6, r + Math.sin(a - 0.09) * 6);
        x.lineTo(r + Math.cos(a) * len, r + Math.sin(a) * len);
        x.lineTo(r + Math.cos(a + 0.09) * 6, r + Math.sin(a + 0.09) * 6);
        x.closePath();
        x.fillStyle = 'rgba(255,248,230,.85)';
        x.fill();
      }
    });
  } else if (kind === 'ring') {
    FX_TEX.ring = fxTexture((x, r) => {
      const g = x.createRadialGradient(r, r, r * 0.55, r, r, r);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.72, 'rgba(255,255,255,.75)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, r * 2, r * 2);
    });
  } else {
    // 땀이 튀는 물보라: 부드러운 점 여러 개
    FX_TEX.mist = fxTexture((x, r) => {
      for (let i = 0; i < 40; i++) {
        const a = Math.random() * Math.PI * 2, d = Math.random() * r * 0.8, s = 2 + Math.random() * 7;
        const g = x.createRadialGradient(r + Math.cos(a) * d, r + Math.sin(a) * d, 0, r + Math.cos(a) * d, r + Math.sin(a) * d, s);
        g.addColorStop(0, 'rgba(255,255,255,.7)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = g;
        x.fillRect(0, 0, r * 2, r * 2);
      }
    });
  }
  return FX_TEX[kind];
}

export class Impacts {
  constructor(scene, count = 28) {
    this.list = [];
    for (let i = 0; i < count; i++) {
      const m = new THREE.SpriteMaterial({ map: fxTex('star'), transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, opacity: 0 });
      const s = new THREE.Sprite(m);
      s.visible = false;
      s.renderOrder = 20;
      s.frustumCulled = false;
      scene.add(s);
      this.list.push({ s, t: 0, life: 0, size: 0, grow: 0, spin: 0, alpha: 1 });
    }
    this.i = 0;
  }

  /** kind: star(섬광) | ring(충격파) | mist(땀 물보라) */
  spawn(pos, { kind = 'star', size = 0.3, life = 0.13, grow = 1.6, color = 0xffffff, alpha = 1, spin = 0 } = {}) {
    const e = this.list[this.i];
    this.i = (this.i + 1) % this.list.length;
    e.s.material.map = fxTex(kind);
    e.s.material.color.setHex(color);
    e.s.material.blending = kind === 'mist' ? THREE.NormalBlending : THREE.AdditiveBlending;
    e.s.material.needsUpdate = true;
    e.s.material.rotation = Math.random() * Math.PI * 2;
    e.s.position.copy(pos);
    e.s.visible = true;
    Object.assign(e, { t: 0, life, size, grow, spin, alpha });
    this.update(0);
  }

  /** 한 번에 섬광 + 충격파 + 물보라 */
  hit(pos, power, { color = 0xffffff, mist = true } = {}) {
    const p = Math.min(1.6, power);
    this.spawn(pos, { kind: 'star', size: 0.16 + p * 0.2, life: 0.09 + p * 0.05, grow: 1.1, color, spin: 3 });
    this.spawn(pos, { kind: 'ring', size: 0.1 + p * 0.08, life: 0.18 + p * 0.08, grow: 3.4 + p * 2, color, alpha: 0.55 + p * 0.2 });
    if (mist && p > 0.9) this.spawn(pos, { kind: 'mist', size: 0.08 + p * 0.06, life: 0.22, grow: 1.8, color: 0xffffff, alpha: 0.35 });
  }

  update(dt) {
    for (const e of this.list) {
      if (!e.s.visible) continue;
      e.t += dt;
      const u = e.t / e.life;
      if (u >= 1) { e.s.visible = false; continue; }
      const out = 1 - Math.pow(1 - u, 3);
      e.s.scale.setScalar(e.size * (0.45 + e.grow * out));
      e.s.material.opacity = e.alpha * Math.pow(1 - u, 1.6);
      e.s.material.rotation += e.spin * dt;
    }
  }
}

/* ---------- 화면 후처리: 압박감 대부분이 여기서 나온다 ---------- */
const FRAG = /* glsl */`
precision highp float;
uniform sampler2D tex;
uniform float time, aberr, radial, tunnel, desat, red, blind, flash, fade, pulse, grain, sway, glow;
uniform vec2 res;
varying vec2 vUv;
float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + time*7.1)*43758.5453); }
vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.,1.); }
vec3 srgb(vec3 c){ return mix(c*12.92, 1.055*pow(max(c,vec3(0.0001)),vec3(1./2.4))-0.055, step(0.0031308,c)); }
void main(){
  vec2 uv = vUv;
  vec2 c = uv-0.5;
  float aspect = res.x/res.y;
  float r = length(c*vec2(aspect,1.));
  // 흔들리는 시야: 지치거나 맞으면 화면이 술 취한 듯 일렁인다
  uv += sway*vec2(sin(uv.y*7.+time*2.1), cos(uv.x*6.-time*1.7))*0.006;
  vec3 col;
  float ab = aberr*0.016*(0.3+r*2.0);
  vec2 dir = normalize(c+1e-5);
  if (radial > 0.002) {
    vec3 acc = vec3(0.); float tot = 0.;
    for (int i=0;i<10;i++){
      float t = float(i)/9.;
      float s = 1.0 - radial*0.11*t;
      vec2 u = 0.5 + (uv-0.5)*s;
      acc.r += texture2D(tex, u + dir*ab).r;
      acc.g += texture2D(tex, u).g;
      acc.b += texture2D(tex, u - dir*ab).b;
      tot += 1.;
    }
    col = acc/tot;
  } else {
    col = vec3(texture2D(tex, uv + dir*ab).r, texture2D(tex, uv).g, texture2D(tex, uv - dir*ab).b);
  }
  // 조명 번짐
  vec3 b = textureLod(tex, uv, 3.0).rgb*0.34 + textureLod(tex, uv, 5.0).rgb*0.42 + textureLod(tex, uv, 6.5).rgb*0.3;
  col += max(b-0.78, vec3(0.))*0.75*glow;
  // 눈 찔림: 뭉개지고 눈물로 하얗게 번진다
  if (blind > 0.001) {
    vec3 bl = textureLod(tex, uv + vec2(sin(time*3.+uv.y*6.),cos(time*2.4+uv.x*5.))*0.012*blind, 5.0*blind).rgb;
    col = mix(col, bl*1.22 + vec3(0.1,0.09,0.08)*blind, smoothstep(0.,0.45,blind));
  }
  col *= 1.0 + pulse*0.1;
  col = aces(col*1.1);
  // 색 빠짐
  float l = dot(col, vec3(.3,.59,.11));
  col = mix(col, vec3(l)*vec3(1.04,.97,.93), desat);
  col = pow(col, vec3(1.0 + tunnel*0.55)); // 몰릴수록 어두운 곳을 더 어둡게
  // 터널 시야
  float vr = mix(0.9, 0.5, tunnel) - pulse*0.045*tunnel; // 몰려도 가운데는 넉넉히 보이게
  float vig = smoothstep(vr, vr+0.56, r);
  col *= 1.0 - vig*(0.6+0.22*tunnel);
  // 가장자리 핏빛
  float rv = smoothstep(0.32, 0.94, r + (rnd(floor(uv*7.)+0.)*0.02));
  col = mix(col, col*vec3(.55,.05,.04)+vec3(.09,.0,.0), clamp(red*rv*(0.6+pulse*0.3),0.,0.7));
  // 맞는 순간
  col += vec3(1.0,0.82,0.74)*flash*0.72;
  // 필름 노이즈
  col += (rnd(uv*res.xy*0.5)-0.5)*grain*0.022;
  col *= 1.0-fade;
  gl_FragColor = vec4(srgb(clamp(col,0.,1.)),1.);
}`;

export class Post {
  constructor(renderer) {
    this.renderer = renderer;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.rt = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType, samples: 4, generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
    });
    this.u = {
      tex: { value: this.rt.texture }, time: { value: 0 }, res: { value: size.clone() },
      aberr: { value: 0 }, radial: { value: 0 }, tunnel: { value: 0 }, desat: { value: 0 }, red: { value: 0 },
      blind: { value: 0 }, flash: { value: 0 }, fade: { value: 0 }, pulse: { value: 0 }, grain: { value: 0.5 }, sway: { value: 0 }, glow: { value: 1 },
    };
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.u, fragmentShader: FRAG, depthTest: false, depthWrite: false, toneMapped: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }',
    });
    this.scene = new THREE.Scene();
    this.cam = new THREE.Camera();
    const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    q.frustumCulled = false;
    this.scene.add(q);
  }

  resize() {
    const s = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.rt.setSize(s.x, s.y);
    this.u.res.value.copy(s);
  }

  render(scene, camera, time) {
    this.u.time.value = time % 100;
    const r = this.renderer;
    r.setRenderTarget(this.rt);
    r.render(scene, camera);
    r.setRenderTarget(null);
    r.render(this.scene, this.cam);
  }
}
