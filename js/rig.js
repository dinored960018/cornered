// 복서 3D 모델. 외부 에셋 없이 전부 코드로 깎는다.
// 몸통·팔은 단면을 이어 붙인 로프트 + 근육 변위, 얼굴은 구를 변형한 뒤 캔버스로 칠한다.
// 움직임은 뼈대 없이 2본 IK로 팔다리를 매 프레임 배치한다.
import * as THREE from 'three';
import { MOVES } from './fight.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const g = (v, c, s) => Math.exp(-((v - c) * (v - c)) / (2 * s * s));
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t) => t * t * (3 - 2 * t);
const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

function catmull(a, b, c, d, t) {
  return 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);
}

/** 단면 [{y, rx, rz, cx, cz}] 를 매끈하게 이어 메시로 만든다. shape(a, y, t)는 근육 변위(m). */
export function loft(secs, { radial = 32, along = null, shape = null, ao = 7 } = {}) {
  const M = along || (secs.length - 1) * 6;
  const N = radial;
  const pos = [], col = [], uv = [], idx = [];
  const rising = secs[secs.length - 1].y > secs[0].y;
  const n = secs.length - 1;
  const pick = (i, key) => {
    const s = secs[Math.max(0, Math.min(n, i))];
    return s[key] ?? 0;
  };
  for (let j = 0; j <= M; j++) {
    const f = (j / M) * n;
    const i = Math.min(n - 1, Math.floor(f));
    const t = f - i;
    const it = (key) => catmull(pick(i - 1, key), pick(i, key), pick(i + 1, key), pick(i + 2, key), t);
    const y = it('y'), rx = Math.max(0.0005, it('rx')), rz = Math.max(0.0005, it('rz')), cx = it('cx'), cz = it('cz');
    for (let k = 0; k <= N; k++) {
      const a = (k / N) * Math.PI * 2;
      const sx = Math.sin(a), cz2 = Math.cos(a);
      const d = shape ? shape(wrap(a), y, j / M) : 0;
      pos.push(cx + (rx + d) * sx, y, cz + (rz + d) * cz2);
      const c = Math.max(0.5, Math.min(1.12, 1 + d * ao));
      col.push(c, c, c);
      uv.push(k / N, j / M);
    }
  }
  for (let j = 0; j < M; j++) {
    for (let k = 0; k < N; k++) {
      const a = j * (N + 1) + k, b = a + N + 1;
      if (rising) idx.push(a, a + 1, b, b, a + 1, b + 1);
      else idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // 이음매 법선 맞추기
  const nrm = geo.attributes.normal;
  for (let j = 0; j <= M; j++) {
    const a = j * (N + 1), b = a + N;
    const x = nrm.getX(a) + nrm.getX(b), y = nrm.getY(a) + nrm.getY(b), z = nrm.getZ(a) + nrm.getZ(b);
    const l = Math.hypot(x, y, z) || 1;
    nrm.setXYZ(a, x / l, y / l, z / l);
    nrm.setXYZ(b, x / l, y / l, z / l);
  }
  // 양 끝 고리는 축 방향 법선으로 (뾰족한 끝의 검은 점 방지)
  const endN = (j, sign) => { for (let k = 0; k <= N; k++) nrm.setXYZ(j * (N + 1) + k, 0, sign, 0); };
  endN(0, rising ? -1 : 1);
  endN(M, rising ? 1 : -1);
  return geo;
}

const noiseTex = (() => {
  let t = null;
  return () => {
    if (t) return t;
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const x = c.getContext('2d');
    const id = x.createImageData(256, 256);
    for (let i = 0; i < id.data.length; i += 4) {
      const v = 118 + Math.random() * 20;
      id.data[i] = id.data[i + 1] = id.data[i + 2] = v;
      id.data[i + 3] = 255;
    }
    x.putImageData(id, 0, 0);
    t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(5, 5);
    return t;
  };
})();

function skinMat(color, extra = {}) {
  return new THREE.MeshPhysicalMaterial({
    color, roughness: 0.46, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.32,
    bumpMap: noiseTex(), bumpScale: 0.25, vertexColors: true, sheen: 0.3, sheenColor: new THREE.Color(0xff7755), sheenRoughness: 0.6, ...extra,
  });
}

const shadow = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };

/** 팔 한 쪽 + 글러브. 3인칭 복서와 1인칭 내 팔이 같이 쓴다. */
export function buildArm(look, k, hand) {
  const a = look.arm * k;
  const L1 = 0.31 * k * look.armLen;
  const L2 = 0.28 * k * look.armLen;
  const mat = skinMat(look.skin);
  const upperGeo = loft([
    { y: 0.078, rx: 0.0003, rz: 0.0003 },
    { y: 0.066, rx: 0.036 * a, rz: 0.036 * a },
    { y: 0.03, rx: 0.064 * a, rz: 0.064 * a },
    { y: -0.03, rx: 0.068 * a, rz: 0.069 * a },
    { y: -L1 * 0.32, rx: 0.058 * a, rz: 0.062 * a },
    { y: -L1 * 0.62, rx: 0.052 * a, rz: 0.058 * a },
    { y: -L1 * 0.9, rx: 0.043 * a, rz: 0.044 * a },
    { y: -L1 - 0.015, rx: 0.042 * a, rz: 0.042 * a },
    { y: -L1 - 0.04, rx: 0.015 * a, rz: 0.015 * a },
  ], {
    radial: 20,
    shape: (ang, y) => 0.012 * a * g(ang, 0, 0.8) * g(y, -L1 * 0.5, L1 * 0.22) + 0.008 * a * g(Math.abs(ang), Math.PI, 0.8) * g(y, -L1 * 0.45, L1 * 0.25),
  });
  const foreGeo = loft([
    { y: 0.03, rx: 0.015 * a, rz: 0.015 * a },
    { y: 0.008, rx: 0.042 * a, rz: 0.042 * a },
    { y: -L2 * 0.25, rx: 0.052 * a, rz: 0.05 * a },
    { y: -L2 * 0.55, rx: 0.043 * a, rz: 0.04 * a },
    { y: -L2 * 0.9, rx: 0.032 * a, rz: 0.03 * a },
    { y: -L2, rx: 0.03 * a, rz: 0.03 * a },
  ], { radial: 18 });
  const upper = shadow(new THREE.Mesh(upperGeo, mat));
  const fore = shadow(new THREE.Mesh(foreGeo, mat));

  const glove = new THREE.Group();
  const color = look.glove[hand === 'L' ? 0 : 1];
  const leather = new THREE.MeshPhysicalMaterial({ color, roughness: 0.46, clearcoat: 0.3, clearcoatRoughness: 0.45, vertexColors: true });
  const gs = 1.02 + (look.arm - 1) * 0.3;
  const body = shadow(new THREE.Mesh(loft([
    { y: 0.004, rx: 0.02, rz: 0.02 },
    { y: -0.008, rx: 0.046, rz: 0.044 },
    { y: -0.04, rx: 0.052, rz: 0.05 },
    { y: -0.075, rx: 0.07, rz: 0.058 },
    { y: -0.125, rx: 0.08, rz: 0.069, cz: 0.006 },
    { y: -0.18, rx: 0.08, rz: 0.075, cz: 0.012 },
    { y: -0.222, rx: 0.066, rz: 0.062, cz: 0.012 },
    { y: -0.246, rx: 0.042, rz: 0.04, cz: 0.012 },
    { y: -0.2565, rx: 0.02, rz: 0.019, cz: 0.012 },
    { y: -0.2595, rx: 0.0002, rz: 0.0002, cz: 0.012 },
  ], {
    radial: 28, along: 54,
    shape: (ang, y) => -0.0035 * g(y, -0.135, 0.007) * g(Math.abs(ang), Math.PI * 0.75, 0.55) + 0.003 * g(y, -0.18, 0.03),
    ao: 18,
  }), leather));
  body.scale.setScalar(gs);
  glove.add(body);
  const thumb = shadow(new THREE.Mesh(loft([
    { y: 0.002, rx: 0.002, rz: 0.002 },
    { y: -0.018, rx: 0.026, rz: 0.03 },
    { y: -0.06, rx: 0.028, rz: 0.033 },
    { y: -0.1, rx: 0.02, rz: 0.024 },
    { y: -0.112, rx: 0.002, rz: 0.002 },
  ], { radial: 14 }), leather));
  const side = hand === 'L' ? -1 : 1;
  thumb.position.set(0.058 * side * gs, -0.05 * gs, 0.045 * gs);
  thumb.rotation.set(0.42, 0, 0.32 * side);
  glove.add(thumb);
  const cuff = new THREE.Mesh(loft([
    { y: 0.012, rx: 0.038, rz: 0.036 },
    { y: -0.008, rx: 0.048, rz: 0.046 },
    { y: -0.028, rx: 0.054, rz: 0.052 },
  ], { radial: 22, along: 4 }), new THREE.MeshStandardMaterial({ color: 0xece7da, roughness: 0.92, side: THREE.DoubleSide, vertexColors: true }));
  cuff.scale.setScalar(gs);
  glove.add(cuff);
  return { upper, fore, glove, L1, L2, hand };
}

const _x = v3(), _y = v3(), _z = v3(), _m = new THREE.Matrix4();
/** from→to 방향이 메시의 -Y가 되도록 놓는다. pole로 비틀림을 고정한다 */
export function place(mesh, from, to, pole) {
  _y.subVectors(from, to).normalize();
  _z.copy(pole).addScaledVector(_y, -pole.dot(_y));
  if (_z.lengthSq() < 1e-6) _z.set(0, 0, 1).addScaledVector(_y, -_y.z);
  _z.normalize();
  _x.crossVectors(_y, _z).normalize();
  _m.makeBasis(_x, _y, _z);
  mesh.quaternion.setFromRotationMatrix(_m);
  mesh.position.copy(from);
}

const _d = v3(), _perp = v3();
/** 2본 IK: 어깨→손 목표에서 팔꿈치와 손목을 구한다 */
export function solveIK(a, target, L1, L2, pole, elbow, wrist) {
  _d.subVectors(target, a);
  const len = Math.min(Math.max(_d.length(), 0.05), L1 + L2 - 0.002);
  _d.normalize();
  const x = (L1 * L1 - L2 * L2 + len * len) / (2 * len);
  const h = Math.sqrt(Math.max(0, L1 * L1 - x * x));
  _perp.copy(pole).addScaledVector(_d, -pole.dot(_d)).normalize();
  elbow.copy(a).addScaledVector(_d, x).addScaledVector(_perp, h);
  wrist.copy(a).addScaledVector(_d, len);
}

/* ---------- 머리 ---------- */
function headPoint(dx, dy, dz, look) {
  const fr = Math.max(0, dz);
  const ax = Math.abs(dx);
  const jaw = clamp01((0.1 - dy) / 1.0);
  const j = look.jaw || 1;
  let px = dx * 0.087 * (1 - 0.2 * jaw * (2 - j));
  let py = dy * 0.118;
  let pz = dz * 0.1 * (1 - 0.06 * jaw);
  const br = look.brow || 1;
  // 이마·눈썹뼈
  pz += 0.0125 * br * g(dy, 0.3, 0.075) * fr * fr * (0.5 + 0.5 * g(dx, 0, 0.55));
  // 눈구멍
  pz -= 0.0135 * g(ax, 0.37, 0.15) * g(dy, 0.135, 0.075) * fr;
  // 콧대·코끝·콧방울
  pz += 0.018 * g(dx, 0, 0.08) * g(dy, 0.0, 0.17) * fr;
  pz += 0.018 * g(dx, 0, 0.1) * g(dy, -0.2, 0.075) * fr;
  pz += 0.006 * g(ax, 0.14, 0.05) * g(dy, -0.25, 0.05) * fr;
  // 광대
  pz += 0.0055 * g(ax, 0.58, 0.15) * g(dy, -0.1, 0.11) * fr;
  px += Math.sign(dx) * 0.003 * g(ax, 0.8, 0.2) * g(dy, -0.08, 0.14);
  // 입 주변, 입술 틈
  pz += 0.009 * g(dx, 0, 0.32) * g(dy, -0.5, 0.13) * fr;
  pz -= 0.0032 * g(dx, 0, 0.26) * g(dy, -0.5, 0.016) * fr;
  // 턱끝, 턱선
  pz += 0.012 * j * g(dx, 0, 0.26) * g(dy, -0.83, 0.1) * fr;
  py -= 0.008 * j * g(dx, 0, 0.45) * clamp01(-dy - 0.5);
  px += Math.sign(dx) * 0.006 * (j - 0.7) * g(dy, -0.62, 0.13) * g(ax, 0.8, 0.25);
  return [px, py, pz];
}

function buildHeadGeo(look) {
  const geo = new THREE.SphereGeometry(1, 96, 72);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const [x, y, z] = headPoint(p.getX(i), p.getY(i), p.getZ(i), look);
    p.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  // 구 이음매 법선 맞추기
  const n = geo.attributes.normal;
  for (let r = 0; r <= 72; r++) {
    const a = r * 97, b = a + 96;
    const x = n.getX(a) + n.getX(b), y = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b);
    const l = Math.hypot(x, y, z) || 1;
    n.setXYZ(a, x / l, y / l, z / l);
    n.setXYZ(b, x / l, y / l, z / l);
  }
  const col = new Float32Array(p.count * 3).fill(1);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

// 얼굴 캔버스 좌표: 구 방향벡터의 (dx, dy) → 텍스처
const FW = 1024, FH = 768;
const fx = (dx, dy) => {
  const st = Math.sqrt(Math.max(0.0001, 1 - dy * dy));
  return (0.25 + Math.asin(Math.max(-1, Math.min(1, dx / st))) / (Math.PI * 2)) * FW;
};
const fy = (dy) => (Math.acos(dy) / Math.PI) * FH;

function css(c, a = 1) {
  const col = new THREE.Color(c);
  return `rgba(${(col.r * 255) | 0},${(col.g * 255) | 0},${(col.b * 255) | 0},${a})`;
}
function shade(c, f) {
  const col = new THREE.Color(c).convertLinearToSRGB();
  col.r = Math.min(1, col.r * f); col.g = Math.min(1, col.g * f); col.b = Math.min(1, col.b * f);
  return `rgb(${(col.r * 255) | 0},${(col.g * 255) | 0},${(col.b * 255) | 0})`;
}
function blob(x, cx, cy, rx, ry, color, a) {
  const r = Math.max(rx, ry);
  x.save();
  x.translate(cx, cy);
  x.scale(rx / r, ry / r);
  const gr = x.createRadialGradient(0, 0, 0, 0, 0, r);
  gr.addColorStop(0, css(color, a));
  gr.addColorStop(1, css(color, 0));
  x.fillStyle = gr;
  x.fillRect(-r, -r, r * 2, r * 2);
  x.restore();
}

function paintFace(ctx, look, dmg) {
  const x = ctx;
  x.globalAlpha = 1;
  x.fillStyle = shade(look.skin, 1);
  x.fillRect(0, 0, FW, FH);
  const red = 0xb33a2a;
  blob(x, fx(-0.55, -0.14), fy(-0.14), 62, 44, red, 0.22);
  blob(x, fx(0.55, -0.14), fy(-0.14), 62, 44, red, 0.22);
  blob(x, fx(0, -0.2), fy(-0.2), 26, 24, red, 0.24);
  for (const s of [-1, 1]) {
    // 눈 그늘
    blob(x, fx(s * 0.36, 0.14), fy(0.14), 56, 30, 0x1a0c08, 0.55);
    // 눈썹
    x.strokeStyle = css(look.hairColor === 0xe8641b ? 0x2a1208 : look.hairColor === 0x7a3a15 ? 0x4a2410 : 0x120c08, 0.96);
    x.lineCap = 'round';
    x.lineWidth = 11 * (look.brow || 1);
    x.beginPath();
    x.moveTo(fx(s * 0.13, 0.215), fy(0.215));
    x.quadraticCurveTo(fx(s * 0.38, 0.3), fy(0.3), fx(s * 0.63, 0.29), fy(0.29));
    x.stroke();
  }
  // 콧구멍
  for (const s of [-1, 1]) blob(x, fx(s * 0.075, -0.285), fy(-0.285), 9, 6, 0x120805, 0.85);
  // 입
  x.strokeStyle = css(0x2a0f0b, 0.95);
  x.lineWidth = 5;
  x.beginPath();
  x.moveTo(fx(-0.25, -0.5), fy(-0.5));
  x.quadraticCurveTo(fx(0, -0.48), fy(-0.48), fx(0.25, -0.5), fy(-0.5));
  x.stroke();
  x.fillStyle = css(0x8a4438, 0.72);
  x.beginPath();
  x.ellipse(fx(0, -0.56), fy(-0.56), 44, 10, 0, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = css(0x8a4438, 0.5);
  x.beginPath();
  x.ellipse(fx(0, -0.455), fy(-0.455), 44, 6, 0, 0, Math.PI * 2);
  x.fill();
  if (look.scar) {
    x.strokeStyle = css(0xe4b0a4, 0.85);
    x.lineWidth = 4;
    x.beginPath();
    x.moveTo(fx(0.36, 0.42), fy(0.42));
    x.lineTo(fx(0.44, -0.08), fy(-0.08));
    x.stroke();
  }
  if (look.stubble || look.beard) {
    const a = look.beard ? 0.9 : 0.34;
    for (let i = 0; i < (look.beard ? 5200 : 2400); i++) {
      const u = (Math.random() - 0.5) * 1.5;
      const v = -0.3 - Math.random() * 0.7;
      if (Math.abs(u) < 0.22 && v > -0.62 && v < -0.42) continue;
      if (v > -0.42 && Math.abs(u) < 0.5) continue;
      x.fillStyle = css(look.hairColor, a * Math.random());
      x.fillRect(fx(u, v), fy(v), 2.4, 3.2);
    }
  }
  // 멍과 피. 많이 맞을수록 부어오른다
  if (dmg > 0.12) {
    const d = clamp01((dmg - 0.12) / 0.88);
    blob(x, fx(0.42, 0.14), fy(0.14), 68, 46, 0x431a4f, 0.72 * d);
    blob(x, fx(-0.55, -0.12), fy(-0.12), 62, 50, 0x5a1f3a, 0.62 * d);
    blob(x, fx(0, -0.1), fy(-0.1), 28, 40, 0x7a1a14, 0.55 * d);
    if (dmg > 0.4) {
      x.strokeStyle = css(0x6a0806, 0.62);
      x.lineWidth = 3.5;
      x.shadowColor = 'rgba(90,6,4,.7)';
      x.shadowBlur = 6;
      x.beginPath();
      x.moveTo(fx(-0.42, 0.3), fy(0.3));
      x.bezierCurveTo(fx(-0.47, 0.15), fy(0.15), fx(-0.4, 0.0), fy(0), fx(-0.46, -0.2), fy(-0.2));
      x.stroke();
      x.lineWidth = 3;
      x.beginPath();
      x.moveTo(fx(0.05, -0.3), fy(-0.3));
      x.lineTo(fx(0.08, -0.46), fy(-0.46));
      x.stroke();
      x.beginPath();
      x.moveTo(fx(-0.05, -0.3), fy(-0.3));
      x.lineTo(fx(-0.06, -0.52), fy(-0.52));
      x.stroke();
      x.shadowBlur = 0;
    }
  }
}

function paintHairShell(x, look) {
  x.clearRect(0, 0, FW, FH);
  const hc = look.hairColor;
  const hair = (density, test) => {
    for (let i = 0; i < density; i++) {
      const u = Math.random() * FW, v = Math.random() * FH;
      if (!test(u, v)) continue;
      x.fillStyle = css(hc, 0.55 + Math.random() * 0.45);
      x.fillRect(u, v, 2.2, 3.4);
    }
  };
  const faceCx = 0.25 * FW;
  const inHair = (u, v) => {
    let du = Math.abs(u - faceCx);
    if (du > FW / 2) du = FW - du;
    const lim = 168 + Math.pow(du / (FW / 2), 1.5) * 250; // 앞 이마는 높게, 옆·뒤로 갈수록 내려온다
    return v < lim;
  };
  if (look.hair === 'buzz' || look.hair === 'band' || look.hair === 'curly') {
    x.fillStyle = css(hc, 0.82);
    x.beginPath();
    x.moveTo(0, 0);
    for (let u = 0; u <= FW; u += 8) {
      let du = Math.abs(u - faceCx);
      if (du > FW / 2) du = FW - du;
      x.lineTo(u, 168 + Math.pow(du / (FW / 2), 1.5) * 250);
    }
    x.lineTo(FW, 0);
    x.closePath();
    x.fill();
    hair(26000, inHair);
  } else if (look.hair === 'slick') {
    x.fillStyle = css(hc, 0.97);
    x.beginPath();
    x.moveTo(0, 0);
    for (let u = 0; u <= FW; u += 8) {
      let du = Math.abs(u - faceCx);
      if (du > FW / 2) du = FW - du;
      x.lineTo(u, 158 + Math.pow(du / (FW / 2), 1.5) * 262);
    }
    x.lineTo(FW, 0);
    x.closePath();
    x.fill();
  } else if (look.hair === 'mohawk') {
    // 옆은 파르라니 깎은 자국만
    for (let i = 0; i < 16000; i++) {
      const u = Math.random() * FW, v = Math.random() * 400;
      if (!inHair(u, v)) continue;
      x.fillStyle = css(0x241812, 0.4);
      x.fillRect(u, v, 2, 3);
    }
  }
}

function clumpyHair(look) {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: look.hairColor });
  if (look.hair === 'curly') {
    const geo = new THREE.IcosahedronGeometry(0.024, 1);
    const n = 170;
    const inst = new THREE.InstancedMesh(geo, mat, n);
    const m = new THREE.Matrix4();
    let placed = 0;
    for (let i = 0; i < 2000 && placed < n; i++) {
      const dx = Math.random() * 2 - 1, dy = Math.random(), dz = Math.random() * 2 - 1;
      const l = Math.hypot(dx, dy, dz);
      if (l > 1 || l < 0.1) continue;
      const nx = dx / l, ny = dy / l, nz = dz / l;
      if (nz > 0.25 && ny < 0.62) continue;
      if (ny < 0.1) continue;
      const s = 0.8 + Math.random() * 0.8;
      m.makeScale(s, s, s);
      m.setPosition(nx * 0.094, ny * 0.122 + 0.002, nz * 0.106 - 0.004);
      inst.setMatrixAt(placed++, m);
    }
    inst.count = placed;
    inst.castShadow = true;
    group.add(inst);
  } else if (look.hair === 'mohawk') {
    const geo = new THREE.ConeGeometry(0.012, 0.075, 6);
    const n = 44;
    const inst = new THREE.InstancedMesh(geo, mat, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = v3(1, 1, 1), up = v3(0, 1, 0);
    for (let i = 0; i < n; i++) {
      const a = -0.5 + (i / (n - 1)) * 2.25;
      const off = ((i % 3) - 1) * 0.006;
      const nrm = v3(off * 4, Math.cos(a), Math.sin(-a + 0.12)).normalize();
      const p = v3(off, nrm.y * 0.118, nrm.z * 0.103).addScaledVector(nrm, 0.026);
      q.setFromUnitVectors(up, nrm);
      m.compose(p, q, s);
      inst.setMatrixAt(i, m);
    }
    inst.castShadow = true;
    group.add(inst);
  }
  return group;
}

function buildHead(look, k) {
  const head = new THREE.Group();
  const geo = buildHeadGeo(look);
  const cv = document.createElement('canvas');
  cv.width = FW; cv.height = FH;
  const ctx = cv.getContext('2d');
  paintFace(ctx, look, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.MeshPhysicalMaterial({
    map: tex, roughness: 0.44, clearcoat: 0.28, clearcoatRoughness: 0.34,
    sheen: 0.35, sheenColor: new THREE.Color(0xff7755), sheenRoughness: 0.55,
    bumpMap: noiseTex(), bumpScale: 0.12,
  });
  const skull = new THREE.Mesh(geo, mat);
  skull.castShadow = true; // 코·눈썹 그림자 경계가 주둥이처럼 보여서, 얼굴은 그림자를 받지 않는다
  head.add(skull);

  // 머리카락 껍질
  if (look.hair !== 'bald') {
    const hc = document.createElement('canvas');
    hc.width = FW; hc.height = FH;
    paintHairShell(hc.getContext('2d'), look);
    const ht = new THREE.CanvasTexture(hc);
    ht.colorSpace = THREE.SRGBColorSpace;
    const shell = new THREE.Mesh(geo, look.hair === 'slick' ? new THREE.MeshStandardMaterial({ map: ht, transparent: true, roughness: 0.42, depthWrite: false }) : new THREE.MeshLambertMaterial({ map: ht, transparent: true, depthWrite: false }));
    shell.scale.setScalar(1.012);
    head.add(shell);
    if (look.hair === 'curly' || look.hair === 'mohawk') head.add(clumpyHair(look));
    if (look.hair === 'band') {
      const band = new THREE.Mesh(
        new THREE.TorusGeometry(0.1, 0.0085, 10, 48),
        new THREE.MeshStandardMaterial({ color: look.trunks, roughness: 0.75 })
      );
      band.scale.set(0.88, 1.03, 1.0);
      band.rotation.x = Math.PI / 2 + 0.18;
      band.position.set(0, 0.055, 0.0);
      head.add(band);
    }
  }

  // 수염 덩어리
  if (look.beard) {
    const bm = new THREE.MeshStandardMaterial({ color: look.hairColor, roughness: 0.92 });
    const beard = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45), bm);
    beard.scale.set(0.083, 0.128, 0.099);
    beard.position.set(0, -0.012, 0.005);
    beard.castShadow = true;
    head.add(beard);
    for (const s of [-1, 1]) {
      const mo = new THREE.Mesh(new THREE.CapsuleGeometry(0.0075, 0.04, 4, 8), bm);
      mo.rotation.z = (Math.PI / 2) * s * 0.86;
      mo.position.set(s * 0.022, -0.048, 0.098);
      head.add(mo);
    }
  }

  // 귀
  for (const s of [-1, 1]) {
    const ear = shadow(new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), skinMat(look.skin)));
    const c = ear.geometry.attributes.position.count;
    ear.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(c * 3).fill(0.92), 3));
    ear.scale.set(0.0105, 0.031, 0.021);
    ear.position.set(s * 0.086, 0.002, -0.01);
    ear.rotation.y = s * 0.4;
    head.add(ear);
  }

  // 눈
  const eyes = [];
  const white = new THREE.MeshPhysicalMaterial({ color: 0xa89f90, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.12 });
  const iris = new THREE.MeshPhysicalMaterial({ color: 0x241108, roughness: 0.16, clearcoat: 1 });
  const lidMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(look.skin).multiplyScalar(0.46), roughness: 0.7 });
  const lid = [];
  for (const s of [-1, 1]) {
    const dir = v3(s * 0.37, 0.135, 0).setZ(Math.sqrt(1 - 0.37 * 0.37 - 0.135 * 0.135));
    const [ex, ey, ez] = headPoint(dir.x, dir.y, dir.z, look);
    const eye = new THREE.Group();
    eye.position.set(ex, ey - 0.001, ez - 0.0098);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.0128, 18, 14), white);
    const ir = new THREE.Mesh(new THREE.SphereGeometry(0.0068, 14, 10), iris);
    ir.position.z = 0.0082;
    ir.scale.z = 0.62;
    eye.add(ball, ir);
    head.add(eye);
    eyes.push(eye);
    // 위 눈꺼풀: 눈을 덮어 노려보는 눈매를 만든다
    const up = new THREE.Mesh(new THREE.SphereGeometry(0.0138, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.455), lidMat);
    up.position.copy(eye.position);
    up.rotation.set(0, 0, -s * 0.3);
    head.add(up);
    const low = new THREE.Mesh(new THREE.SphereGeometry(0.0138, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.3), lidMat);
    low.position.copy(eye.position);
    low.rotation.set(Math.PI - 0.5, 0, 0);
    head.add(low);
    lid.push(up);
  }

  head.scale.setScalar((1.08 + (k - 1) * 0.5) * (look.head || 1));
  return { head, eyes, ctx, tex, skull, look, lid };
}

/* ---------- 몸통 ---------- */
function buildTorso(look, k) {
  const sw = look.shoulder * k, ch = look.chest * k, wa = look.waist * k;
  const belly = look.belly || 0;
  const Y = (v) => v * k;
  const geo = loft([
    { y: Y(-0.09), rx: 0.15 * wa, rz: 0.105 * wa },
    { y: Y(0.02), rx: 0.138 * wa, rz: 0.098 * wa },
    { y: Y(0.13), rx: 0.144 * (wa * 0.5 + ch * 0.5), rz: 0.101 * (wa * 0.5 + ch * 0.5) },
    { y: Y(0.24), rx: 0.172 * ch, rz: 0.114 * ch },
    { y: Y(0.335), rx: 0.192 * ch, rz: 0.126 * ch },
    { y: Y(0.41), rx: 0.19 * sw, rz: 0.118 * ch },
    { y: Y(0.46), rx: 0.15 * sw, rz: 0.098 * ch },
    { y: Y(0.5), rx: 0.08 * sw, rz: 0.076 },
    { y: Y(0.52), rx: 0.035, rz: 0.035 },
  ], {
    radial: 64, along: 72, ao: 11,
    shape: (a, y0) => {
      const y = y0 / k;
      const front = g(a, 0, 1.15);
      const ab = Math.abs(a);
      let d = 0;
      // 대흉근
      d += 0.017 * ch * g(ab, 0.56, 0.36) * g(y, 0.345, 0.052);
      // 가슴 아래 주름
      d -= 0.0085 * g(ab, 0.5, 0.48) * g(y, 0.27, 0.012);
      // 가슴 가운데 골
      d -= 0.008 * g(a, 0, 0.055) * g(y, 0.33, 0.07);
      // 복근
      d -= 0.0058 * g(a, 0, 0.038) * g(y, 0.12, 0.11) * (belly ? 0.4 : 1);
      for (const row of [0.205, 0.135, 0.065, -0.005]) d -= 0.0042 * g(y, row, 0.0085) * g(ab, 0, 0.42) * (belly ? 0.35 : 1);
      d += 0.0035 * g(y, 0.1, 0.1) * g(ab, 0.24, 0.17);
      // 옆구리 외복사근
      d -= 0.003 * g(ab, 0.75, 0.1) * g(y, 0.12, 0.13);
      // 등골과 광배
      d -= 0.008 * g(Math.abs(wrap(a - Math.PI)), 0, 0.07) * g(y, 0.25, 0.2);
      d += 0.012 * g(Math.abs(wrap(a - Math.PI)), 0.9, 0.4) * g(y, 0.27, 0.1);
      // 쇄골
      d += 0.0034 * g(ab, 0.45, 0.32) * g(y, 0.452, 0.012) * front;
      // 뱃살
      d += belly * 1.35 * g(ab, 0, 0.95) * g(y, 0.07, 0.12);
      return d;
    },
  });
  const mat = skinMat(look.skin);
  const mesh = shadow(new THREE.Mesh(geo, mat));
  return { mesh, mat };
}

function trunks(look, k) {
  const wa = look.waist * k;
  const belly = look.belly || 0;
  const mat = new THREE.MeshStandardMaterial({ color: look.trunks, roughness: 0.5, vertexColors: true });
  const geo = loft([
    { y: 0.085 * k, rx: 0.153 * wa + belly * 0.6, rz: 0.108 * wa + belly },
    { y: 0.02 * k, rx: 0.157 * wa, rz: 0.116 * wa },
    { y: -0.06 * k, rx: 0.17 * wa, rz: 0.125 * wa },
    { y: -0.13 * k, rx: 0.182 * wa, rz: 0.128 * wa },
    { y: -0.18 * k, rx: 0.13 * wa, rz: 0.1 * wa },
  ], { radial: 36, along: 16 });
  const m = shadow(new THREE.Mesh(geo, mat));
  const band = new THREE.Mesh(loft([
    { y: 0.1 * k, rx: 0.155 * wa + belly * 0.6, rz: 0.111 * wa + belly },
    { y: 0.05 * k, rx: 0.158 * wa + belly * 0.3, rz: 0.114 * wa + belly * 0.6 },
  ], { radial: 36, along: 3 }), new THREE.MeshStandardMaterial({ color: look.trim, roughness: 0.6, vertexColors: true, side: THREE.DoubleSide }));
  m.add(band);
  return m;
}

function legPart(look, k, trunksColor, side) {
  const th = 0.46 * k, sh = 0.47 * k;
  const w = (look.chest * 0.45 + 0.55) * k;
  const skin = skinMat(look.skin);
  const thigh = shadow(new THREE.Mesh(loft([
    { y: 0.04, rx: 0.03, rz: 0.03 },
    { y: 0, rx: 0.085 * w, rz: 0.09 * w },
    { y: -th * 0.45, rx: 0.075 * w, rz: 0.08 * w },
    { y: -th * 0.9, rx: 0.052 * w, rz: 0.056 * w },
    { y: -th, rx: 0.05 * w, rz: 0.052 * w },
    { y: -th - 0.04, rx: 0.02, rz: 0.02 },
  ], { radial: 18 }), skin));
  const shin = shadow(new THREE.Mesh(loft([
    { y: 0.03, rx: 0.02, rz: 0.02 },
    { y: 0, rx: 0.048 * w, rz: 0.05 * w },
    { y: -sh * 0.3, rx: 0.05 * w, rz: 0.055 * w, cz: -0.008 },
    { y: -sh * 0.8, rx: 0.033 * w, rz: 0.035 * w },
    { y: -sh, rx: 0.03 * w, rz: 0.032 * w },
  ], { radial: 16 }), skin));
  const sleeve = shadow(new THREE.Mesh(loft([
    { y: 0.05, rx: 0.08 * w, rz: 0.085 * w },
    { y: -th * 0.3, rx: 0.098 * w, rz: 0.102 * w },
    { y: -th * 0.56, rx: 0.098 * w, rz: 0.1 * w },
  ], { radial: 22, along: 6 }), new THREE.MeshStandardMaterial({ color: trunksColor, roughness: 0.5, vertexColors: true, side: THREE.DoubleSide })));
  thigh.add(sleeve);
  const hem = new THREE.Mesh(loft([
    { y: -th * 0.52, rx: 0.1 * w, rz: 0.103 * w },
    { y: -th * 0.56, rx: 0.1 * w, rz: 0.103 * w },
  ], { radial: 22, along: 2 }), new THREE.MeshStandardMaterial({ color: look.trim, roughness: 0.6, vertexColors: true, side: THREE.DoubleSide }));
  thigh.add(hem);
  const boot = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.1 * k, 0.09 * k, 0.26 * k), new THREE.MeshStandardMaterial({ color: 0x14141a, roughness: 0.5 })));
  boot.geometry.translate(0, 0.04 * k, 0.05 * k);
  const ankle = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.052 * w, 0.05 * w, 0.18 * k, 12), boot.material));
  ankle.position.set(0, 0.13 * k, 0);
  boot.add(ankle);
  void side;
  return { thigh, shin, boot, th, sh };
}

/* ---------- 복서 ---------- */
export class Rig {
  constructor(def) {
    this.def = def;
    const look = def.look;
    this.look = look;
    const k = def.h / 1.8;
    this.k = k;
    this.group = new THREE.Group();
    this.hips = new THREE.Group();
    this.spine = new THREE.Group();
    this.neck = new THREE.Group();
    this.group.add(this.hips);
    this.hips.add(this.spine);
    this.spine.position.y = 0.08 * k;
    this.hipBase = 0.97 * k;

    this.hips.add(trunks(look, k));
    const t = buildTorso(look, k);
    this.torso = t.mesh;
    this.spine.add(t.mesh);
    if (look.tattoo) this.addTattoo(t.mesh, k);

    // 승모근과 목
    const neckR = 0.058 * look.neck * k;
    const neckMesh = shadow(new THREE.Mesh(loft([
      { y: 0.42 * k, rx: 0.13 * look.shoulder * k, rz: 0.075 * k },
      { y: 0.47 * k, rx: neckR * 1.55, rz: neckR * 1.2 },
      { y: 0.52 * k, rx: neckR * 1.05, rz: neckR * 1.06 },
      { y: 0.61 * k, rx: neckR * 0.95, rz: neckR * 1.02 },
      { y: 0.64 * k, rx: 0.03, rz: 0.03 },
    ], { radial: 22 }), skinMat(look.skin)));
    this.spine.add(neckMesh);

    this.neck.position.set(0, 0.54 * k, 0.014);
    this.spine.add(this.neck);
    const hd = buildHead(look, k);
    this.headParts = hd;
    this.head = hd.head;
    this.head.position.set(0, 0.092 * k, 0.012);
    this.neck.add(this.head);

    // 팔다리는 뼈대 없이 그룹 좌표에 직접 배치한다
    this.arms = { L: buildArm(look, k, 'L'), R: buildArm(look, k, 'R') };
    for (const a of Object.values(this.arms)) this.group.add(a.upper, a.fore, a.glove);
    this.legs = { L: legPart(look, k, look.trunks2 || look.trunks, 'L'), R: legPart(look, k, look.trunks, 'R') };
    for (const l of Object.values(this.legs)) this.group.add(l.thigh, l.shin, l.boot);

    this.shoulderLocal = { L: v3(0.205 * look.shoulder * k, 0.42 * k, 0), R: v3(-0.205 * look.shoulder * k, 0.42 * k, 0) };
    this.hipLocal = { L: v3(0.095 * k * (look.waist * 0.4 + 0.6), -0.1 * k, 0), R: v3(-0.095 * k * (look.waist * 0.4 + 0.6), -0.1 * k, 0) };
    this.feet = { L: v3(0.17 * k, 0, 0.2), R: v3(-0.17 * k, 0, -0.2) };
    this.handPos = { L: v3(), R: v3() };
    this.handInit = false;

    this.pose = { twist: 0, crouch: 0, lean: 0, side: 0, dropL: 0, dropR: 0 };
    this.snap = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
    this.downT = 0;
    this.time = Math.random() * 10;
    this.faceDmg = 0;
    this.sweat = 0;
    this.tmp = { s: v3(), e: v3(), w: v3(), t: v3(), c: v3(), hip: v3(), knee: v3(), ankle: v3() };
    this.headWorld = v3();
  }

  addTattoo(torso, k) {
    // 왼쪽 가슴과 어깨를 덮는 문신. 몸통 메시 위에 살짝 뜬 데칼로 칠한다
    const c = document.createElement('canvas');
    c.width = 512; c.height = 512;
    const x = c.getContext('2d');
    x.strokeStyle = 'rgba(18,20,34,.86)';
    x.lineWidth = 7;
    x.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      const cx = 118 + (i % 5) * 26, cy = 150 + Math.floor(i / 5) * 30;
      x.beginPath();
      x.moveTo(cx, cy);
      x.quadraticCurveTo(cx + 22, cy - 28, cx + 40, cy + 12);
      x.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(torso.geometry, new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, roughness: 0.6 }));
    torso.add(mesh);
    void k;
  }

  /** 맞았을 때 머리와 상체가 젖혀진다. x:위아래, y:좌우, z:기울기 */
  hit(x, y, z) {
    this.snap.vx += x; this.snap.vy += y; this.snap.vz += z;
  }

  setDamage(frac) {
    if (Math.abs(frac - this.faceDmg) < 0.08) return;
    this.faceDmg = frac;
    paintFace(this.headParts.ctx, this.look, frac);
    this.headParts.tex.needsUpdate = true;
  }

  /**
   * @param f   fight.js의 선수 상태
   * @param o   { z, target(Vector3: 노려볼 곳), down(0~1), idle }
   */
  update(dt, f, o) {
    const k = this.k;
    const P = this.pose;
    this.time += dt;
    const t = this.time;
    const look = this.look;
    const ai = this.def.ai;
    const fr = 1 - Math.exp(-dt * 16);

    // 펀치 때 몸 쓰기
    let twist = 0, dip = 0, lean = 0, side = 0;
    const p = f.punch;
    if (p) {
      const m = MOVES[p.id];
      const sgn = p.hand === 'R' ? 1 : -1;
      const wp = clamp01(p.t / p.w);
      const tp = clamp01((p.t - p.w) / p.tt);
      const rp = clamp01((p.t - p.w - p.tt) / Math.max(0.01, p.r));
      const en = smooth(wp) * (1 - tp);
      const de = tp * (1 - rp);
      if (p.id === 'jab') { twist = -sgn * 0.08 * en + sgn * 0.22 * de; lean = 0.08 * de; }
      else if (p.id === 'cross') { twist = -sgn * 0.42 * en + sgn * 0.62 * de; lean = -0.04 * en + 0.2 * de; dip = 0.02 * en; }
      else if (p.id === 'hook') { twist = -sgn * 0.68 * en + sgn * 0.58 * de; side = -sgn * 0.14 * en + sgn * 0.08 * de; dip = 0.05 * en; lean = 0.08 * de; }
      else if (p.id === 'upper') { twist = -sgn * 0.3 * en + sgn * 0.3 * de; dip = 0.13 * en - 0.05 * de; lean = 0.18 * en - 0.1 * de; side = -sgn * 0.13 * en; }
      else if (p.id === 'body') { twist = -sgn * 0.3 * en + sgn * 0.48 * de; dip = 0.1 * en + 0.1 * de; lean = 0.22 * en + 0.22 * de; }
      else if (p.id === 'headbutt') { lean = -0.22 * en + 0.62 * de; }
      else { twist = sgn * 0.2 * de; lean = 0.1 * de; }
      void m;
    }
    const hx = f.head.x, hy = f.head.y;
    const stunned = f.stun > 0 ? Math.min(1, f.stun * 2.2) : 0;
    const crouchBase = (ai.crouch || 0.05) + (f.guard ? 0.015 : 0);
    const breathe = Math.sin(t * 2.2) * 0.007 + Math.sin(t * 0.73) * 0.004;
    const bob = Math.sin(t * 4.1) * 0.012 * (o.idle ? 0.5 : 1);
    P.twist += (twist - P.twist) * Math.min(1, fr * 1.5);
    P.crouch += (crouchBase - hy * 0.72 + dip - P.crouch) * fr;
    P.lean += ((ai.lean || 0.1) + lean - hy * 0.9 - P.lean) * fr;
    P.side += (side - P.side) * fr;

    // 다운
    this.downT += ((o.down ? 1 : 0) - this.downT) * (1 - Math.exp(-dt * 5));
    const dn = this.downT;

    const s = this.snap;
    const ks = 110, cs = 11;
    s.vx += (-s.x * ks - s.vx * cs) * dt; s.x += s.vx * dt;
    s.vy += (-s.y * ks - s.vy * cs) * dt; s.y += s.vy * dt;
    s.vz += (-s.z * ks - s.vz * cs) * dt; s.z += s.vz * dt;

    const sway = stunned * Math.sin(t * 7) * 0.05;
    // 머리 좌우: 엉덩이 45% + 상체 기울임. 복서 기준 오른쪽(+)은 월드 -X
    const hipX = -hx * 0.45 + sway;
    const hipY = this.hipBase - P.crouch * (1 - dn) + bob * 0.4 + breathe * 0.5 - dn * (this.hipBase - 0.2);
    this.group.position.set(0, 0, 0);
    this.hips.position.set(hipX, hipY, o.z - dn * 0.12);
    this.hips.rotation.set(dn * -0.55 + P.lean * 0.2, P.twist * 0.35, 0);
    this.spine.rotation.set(P.lean * 0.8 - dn * 0.75 + s.x * 0.4 + breathe, P.twist * 0.68 + s.y * 0.35, hx * 0.92 + P.side + s.z * 0.5 + sway * 0.7);

    // 그룹 기준으로 어깨 계산
    this.group.updateMatrixWorld(true);
    const inv = this.group.matrixWorld.clone().invert();
    const T = this.tmp;
    const toGroup = (local, parent, out) => out.copy(local).applyMatrix4(parent.matrixWorld).applyMatrix4(inv);

    // 머리는 항상 상대를 본다
    const hw = this.head.getWorldPosition(this.headWorld);
    const target = o.target;
    const tl = this.neck.worldToLocal(target.clone());
    const yaw = Math.atan2(tl.x, tl.z);
    const pitch = -Math.atan2(tl.y - this.head.position.y, Math.hypot(tl.x, tl.z));
    this.neck.rotation.set(
      Math.max(-0.6, Math.min(0.6, pitch)) * (1 - dn * 0.8) + s.x * 1.5,
      Math.max(-1, Math.min(1, yaw)) * (1 - dn * 0.8) + s.y * 1.6,
      -hx * 0.4 + s.z * 1.4
    );
    // 눈동자 추적
    const hl = this.head.worldToLocal(target.clone());
    for (const e of this.headParts.eyes) {
      const dx = hl.x - e.position.x, dy = hl.y - e.position.y, dz = hl.z - e.position.z;
      e.rotation.y = Math.max(-0.4, Math.min(0.4, Math.atan2(dx, dz)));
      e.rotation.x = Math.max(-0.3, Math.min(0.3, -Math.atan2(dy, dz)));
    }

    // 손
    const lead = f.stance === 'orth' ? 'L' : 'R';
    for (const hand of ['L', 'R']) {
      const a = this.arms[hand];
      const sx = hand === 'L' ? 1 : -1;
      const isLead = hand === lead;
      const sh = toGroup(this.shoulderLocal[hand], this.spine, T.s);
      const root = o.z;
      const low = ai.lowGuard && !f.guard ? -0.22 : 0;
      const gt = T.t;
      // 기본 가드 자세
      if (f.guard) {
        gt.set(hipX * 0.5 + sx * 0.1 * k, hw.y - 0.27 * k, root + 0.2 * k + P.lean * 0.3);
      } else if (isLead) {
        gt.set(hipX * 0.6 + sx * 0.19 * k, sh.y - 0.16 * k + low + Math.sin(t * 3.1 + 1) * 0.012, root + (0.31 * k + P.lean * 0.3));
      } else {
        gt.set(hipX * 0.6 + sx * 0.17 * k, sh.y - 0.11 * k + low * 0.7 + Math.sin(t * 2.6) * 0.012, root + (0.2 * k + P.lean * 0.3));
      }
      if (stunned) gt.y -= 0.16 * stunned;

      const q = p && p.hand === hand ? p : null;
      const hp = this.handPos[hand];
      if (q) {
        const wp = clamp01(q.t / q.w);
        const tp = clamp01((q.t - q.w) / q.tt);
        const rp = clamp01((q.t - q.w - q.tt) / Math.max(0.01, q.r));
        const id = q.id;
        // 칠 곳
        const aim = T.c.copy(o.target);
        aim.z -= 0.14;
        if (id === 'body') aim.y -= 0.52;
        if (q.latched) {
          // 조준 고정 뒤에는 플레이어의 지금 머리가 아니라 고정된 자리로 간다
          aim.x = q.aimX;
        }
        // 팔 길이 이상으로 뻗지 못한다
        const reach = a.L1 + a.L2 + 0.17;
        const dx = aim.x - sh.x, dy = aim.y - sh.y, dz = aim.z - sh.z;
        const dl = Math.hypot(dx, dy, dz);
        const sc = dl > reach ? reach / dl : 1;
        const end = v3(sh.x + dx * sc, sh.y + dy * sc, sh.z + dz * sc);
        const wind = gt.clone();
        if (id === 'cross') { wind.z -= 0.14; wind.x += sx * 0.04; wind.y -= 0.02; }
        else if (id === 'hook') { wind.x += sx * 0.3; wind.z -= 0.1; wind.y -= 0.03; }
        else if (id === 'upper') { wind.y -= 0.3; wind.z -= 0.06; wind.x += sx * 0.05; }
        else if (id === 'body') { wind.y -= 0.18; wind.x += sx * 0.1; wind.z -= 0.04; }
        else if (id === 'jab') { wind.z -= 0.04; }
        const e = smooth(wp);
        const out = gt.clone().lerp(wind, e);
        if (tp > 0 && rp < 1) {
          const u = 1 - Math.pow(1 - tp, 2.4);
          const ctrl = wind.clone().lerp(end, 0.5);
          if (id === 'hook') { ctrl.x = sh.x + sx * 0.46; ctrl.y = end.y + 0.03; ctrl.z = sh.z + 0.36; }
          else if (id === 'upper') { ctrl.y = wind.y - 0.05; ctrl.z = sh.z + 0.3; }
          const a0 = wind.clone().lerp(ctrl, u), a1 = ctrl.clone().lerp(end, u);
          out.copy(a0.lerp(a1, u));
        }
        if (rp > 0) out.copy(end).lerp(gt, smooth(rp));
        if (!this.handInit) hp.copy(out);
        // 예비동작은 부드럽게, 휘두를 때는 그대로 따라간다
        hp.lerp(out, tp > 0 && rp <= 0 ? 1 : 1 - Math.exp(-dt * 34));
      } else {
        if (!this.handInit) hp.copy(gt);
        hp.lerp(gt, 1 - Math.exp(-dt * 15));
      }
      if (dn > 0.01) {
        const flop = v3(hipX + sx * 0.55 * k, 0.12 * k, o.z - 0.1 * k);
        hp.lerp(flop, dn);
      }

      // 팔 IK: 팔꿈치는 아래·바깥으로
      const pole = v3(sx * 0.65, -1, -0.28);
      const wristTarget = hp;
      solveIK(sh, wristTarget, a.L1, a.L2, pole, T.e, T.w);
      place(a.upper, sh, T.e, v3(0, 0, 1));
      place(a.fore, T.e, T.w, v3(0, 0, 1));
      // 글러브는 팔 방향 그대로가 아니라 앞쪽으로 꺾어 주먹이 상대를 향한다
      {
        const dirG = v3().subVectors(T.w, T.e).normalize();
        dirG.z += q ? 0.2 : 1.1; dirG.normalize();
        place(a.glove, T.w, T.w.clone().add(dirG), v3(0, 1, 0.3));
      }
    }
    this.handInit = true;

    // 다리 IK: 발은 바닥에 붙어 있고 멀어지면 한 발씩 옮긴다
    const leadFoot = f.stance === 'orth' ? 'L' : 'R';
    for (const leg of ['L', 'R']) {
      const l = this.legs[leg];
      const sx = leg === 'L' ? 1 : -1;
      const fwd = leg === leadFoot ? 0.21 : -0.23;
      const goal = v3(hipX * 0.45 + sx * (0.17 * k * (look.waist * 0.3 + 0.7)), 0, o.z + fwd * k);
      const foot = this.feet[leg];
      if (foot.distanceTo(goal) > 0.14 || this.needFeet) foot.lerp(goal, this.needFeet ? 1 : 1 - Math.exp(-dt * 14));
      const lift = foot.distanceTo(goal) > 0.06 ? 0.035 : 0;
      const hip = toGroup(this.hipLocal[leg], this.hips, T.hip);
      const ank = T.ankle.set(foot.x, 0.1 * k + lift, foot.z - 0.0);
      if (dn > 0.01) ank.lerp(v3(hipX + sx * 0.3 * k, 0.12, o.z + 0.55 * k), dn);
      solveIK(hip, ank, l.th, l.sh, v3(sx * 0.2, 0, 1), T.knee, T.w);
      place(l.thigh, hip, T.knee, v3(0, 0, 1));
      place(l.shin, T.knee, T.w, v3(0, 0, 1));
      l.boot.position.set(T.w.x, T.w.y - 0.1 * k, T.w.z);
      l.boot.rotation.set(0, sx * 0.3, 0);
    }
    this.needFeet = false;
    void hw;
  }

  snapFeet() { this.needFeet = true; this.handInit = false; }
}

/* ---------- 1인칭 내 팔 ---------- */
export class PlayerArms {
  constructor(def) {
    this.def = def;
    this.group = new THREE.Group();
    const k = 1;
    const look = def.look;
    this.arms = { L: buildArm({ ...look, armLen: 1.08 }, k, 'L'), R: buildArm({ ...look, armLen: 1.08 }, k, 'R') };
    for (const a of Object.values(this.arms)) {
      for (const m of [a.upper, a.fore, a.glove]) {
        this.group.add(m);
        m.traverse((o) => { o.castShadow = false; o.frustumCulled = false; });
      }
    }
    this.hand = { L: v3(-0.24, -0.3, -0.4), R: v3(0.24, -0.3, -0.4) };
    for (const a of Object.values(this.arms)) a.glove.scale.setScalar(0.82);
    this.t = 0;
    this.tmp = { s: v3(), e: v3(), w: v3() };
  }

  /** 카메라 좌표에서 움직인다. 오른쪽이 +X, 앞이 -Z */
  update(dt, f, camera, oppHead) {
    this.t += dt;
    const t = this.t;
    const lead = f.stance === 'orth' ? 'L' : 'R';
    const p = f.punch;
    const local = camera.worldToLocal(oppHead.clone());
    for (const hand of ['L', 'R']) {
      const sx = hand === 'L' ? -1 : 1;
      const a = this.arms[hand];
      const isLead = hand === lead;
      const shoulder = this.tmp.s.set(sx * 0.3, -0.42, 0.06);
      const breathe = Math.sin(t * 2.4 + sx) * 0.006 + Math.sin(t * 4.3 + sx * 2) * 0.004;
      const gt = v3();
      if (f.guard) gt.set(sx * 0.15, -0.3 + breathe, -0.27);
      else if (isLead) gt.set(sx * 0.255, -0.33 + breathe, -0.42);
      else gt.set(sx * 0.24, -0.31 + breathe, -0.33);
      if (f.stun > 0) gt.y -= Math.min(1, f.stun * 2.5) * 0.14;
      const hp = this.hand[hand];
      const q = p && p.hand === hand ? p : null;
      if (q) {
        const wp = clamp01(q.t / q.w);
        const tp = clamp01((q.t - q.w) / q.tt);
        const rp = clamp01((q.t - q.w - q.tt) / Math.max(0.01, q.r));
        const end = local.clone();
        if (q.id === 'body') end.y -= 0.5;
        if (q.id === 'upper') end.y -= 0.08;
        // 거리가 멀면 닿는 데까지만 뻗는다
        const reach = a.L1 + a.L2 + 0.14;
        const dx = end.x - shoulder.x, dy = end.y - shoulder.y, dz = end.z - shoulder.z;
        const dl = Math.hypot(dx, dy, dz);
        if (dl > reach) end.set(shoulder.x + (dx / dl) * reach, shoulder.y + (dy / dl) * reach, shoulder.z + (dz / dl) * reach);
        const wind = gt.clone();
        if (q.id === 'cross') { wind.z += 0.07; wind.y -= 0.02; }
        else if (q.id === 'hook') { wind.x += sx * 0.22; wind.z += 0.06; }
        else if (q.id === 'upper') { wind.y -= 0.2; wind.z += 0.02; }
        else if (q.id === 'body') { wind.y -= 0.14; wind.x += sx * 0.06; }
        const out = gt.clone().lerp(wind, smooth(wp));
        if (tp > 0) {
          const u = 1 - Math.pow(1 - tp, 2.2);
          const ctrl = wind.clone().lerp(end, 0.5);
          if (q.id === 'hook') { ctrl.x += sx * 0.34; ctrl.z += 0.02; }
          if (q.id === 'upper') { ctrl.y -= 0.1; }
          out.copy(wind.clone().lerp(ctrl, u).lerp(ctrl.clone().lerp(end, u), u));
        }
        if (rp > 0) out.copy(end).lerp(gt, smooth(rp));
        hp.lerp(out, tp > 0 && rp <= 0 ? 1 : 1 - Math.exp(-dt * 38));
      } else {
        hp.lerp(gt, 1 - Math.exp(-dt * 16));
      }
      const pole = v3(sx * 0.7, -1, 0.3);
      solveIK(shoulder, hp, a.L1, a.L2, pole, this.tmp.e, this.tmp.w);
      place(a.upper, shoulder, this.tmp.e, v3(0, 1, 0));
      place(a.fore, this.tmp.e, this.tmp.w, v3(0, 1, 0));
      const dir = v3().subVectors(this.tmp.w, this.tmp.e).normalize();
      dir.y += q ? 0 : 0.35; dir.z -= q ? 0 : 0.5; dir.normalize();
      place(a.glove, this.tmp.w, this.tmp.w.clone().add(dir), v3(0, 1, 0.1));
    }
  }
}
