// 화면 전환, 입력, 카메라, 그리고 압박 연출 전부.
import * as THREE from 'three';
import { BOXERS, LEVELS, byId } from './roster.js';
import { createFight, stepFight, drainEvents, emptyInput, cornered, updateHead, ROUNDS, COUNT_STEP, CORNER, LIM } from './fight.js';
import { HostLink, GuestLink } from './net.js';
import { Rig, PlayerArms } from './rig.js';
import { buildWorld, updateWorld, Particles, Impacts, Post } from './world.js';
import { Sound } from './audio.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const damp = (cur, to, k, dt) => cur + (to - cur) * (1 - Math.exp(-k * dt));
const EYE = 1.56;   // 복서 자세로 숙인 눈높이. 상대는 언제나 나보다 위에 있다
const SIM = 1 / 120;
const perf = { t: 0, n: 0, level: 0 };

if (matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches) $('mobile').hidden = false;

/* ---------- 렌더러 ---------- */
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: $('view'), antialias: false, powerPreference: 'high-performance' });
} catch (e) {
  $('fatal').hidden = false;
  throw e;
}
const pixelRatio = () => (perf?.level ? (perf.level === 1 ? Math.min(1, window.devicePixelRatio || 1) : 0.72) : Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setPixelRatio(pixelRatio());
renderer.setSize(innerWidth, innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NoToneMapping;
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.03, 90);
scene.add(camera);
const world = buildWorld(scene);
const parts = new Particles(scene);
const impacts = new Impacts(scene);
const post = new Post(renderer);
const snd = new Sound();

addEventListener('resize', () => {
  renderer.setPixelRatio(pixelRatio());
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  post.resize();
});

/* ---------- 복서 모델 (만든 건 재사용) ---------- */
const rigs = new Map();
function getRig(id) {
  if (!rigs.has(id)) {
    const r = new Rig(byId(id));
    r.group.visible = false;
    scene.add(r.group);
    rigs.set(id, r);
  }
  return rigs.get(id);
}
const armsCache = new Map();
function getArms(id) {
  if (!armsCache.has(id)) {
    const a = new PlayerArms(byId(id));
    a.group.visible = false;
    camera.add(a.group);
    armsCache.set(id, a);
  }
  return armsCache.get(id);
}
const hideAll = () => {
  for (const r of rigs.values()) r.group.visible = false;
  for (const a of armsCache.values()) a.group.visible = false;
};
const dummy = (def) => ({ def, head: { x: 0, y: 0 }, guard: false, punch: null, stun: 0, stance: def.stance, hp: def.hp, maxHp: def.hp, st: 100 });

/* ---------- 앱 상태 ---------- */
const app = {
  mode: 'home',          // home | how | select | intro | fight | over
  run: null,             // { kind:'gauntlet'|'single', player, order, stage, level }
  s: null, rig: null, arms: null,
  paused: false, time: 0, acc: 0,
  slow: 0, hitstop: 0,
  fx: { flash: 0, aberr: 0, radial: 0, red: 0, stunBlur: 0, shake: 0, crowd: 0.3, ring: 0, muffle: 0, downY: 0, zoom: 0 },
  camRot: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, px: 0, py: 0, pz: 0, vpx: 0, vpy: 0, vpz: 0 },
  intro: null,
  heartT: 0, breathT: 0, breathIn: false, stareT: 0, tauntT: 0, lastHp: [1, 1], keysT: 0,
  sel: { step: 'player', index: 0, player: null, opp: null, level: 'normal', kind: 'gauntlet', spin: 0, shown: null },
  lean: 0, leanMouse: 0, mouseX: 0, mouseY: 0, mashLast: null, weaveAt: -9,
  net: null,             // 온라인이면 { role:'host'|'guest', link, ... }
};

/* ---------- 입력 ---------- */
const keys = new Set();
let frameInput = emptyInput();
const consume = () => { const i = frameInput; frameInput = emptyInput(); return i; };
const PREVENT = new Set(['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab']);

// 키 배치 두 가지. 키는 다섯 개만: 피하기, 숙이기, 가드, 주먹 두 개, 필살기.
// 앞뒤 이동은 자동이고, 훅·어퍼는 상황에 따라 저절로 나간다 (피하면서 치면 훅, 숙인 채 치면 어퍼).
// Ctrl은 Ctrl+W로 창이 닫혀서 쓰지 않는다.
export const SCHEMES = {
  a: {
    name: 'A', desc: 'WASD + J K L',
    left: ['KeyA'], right: ['KeyD'], duck: ['KeyS'], guard: ['KeyW'], special: ['KeyL'],
    punch: { KeyJ: 'L', KeyK: 'R' },
    legend: [[['A', 'D'], '피하기'], [['S'], '숙이기'], [['W'], '가드'], [['J', 'K'], '왼손 · 오른손'], [['L'], '필살기']],
  },
  b: {
    name: 'B', desc: '방향키 + Z X C',
    left: ['ArrowLeft'], right: ['ArrowRight'], duck: ['ArrowDown'], guard: ['ArrowUp'], special: ['KeyC'],
    punch: { KeyZ: 'L', KeyX: 'R' },
    legend: [[['←', '→'], '피하기'], [['↓'], '숙이기'], [['↑'], '가드'], [['Z', 'X'], '왼손 · 오른손'], [['C'], '필살기']],
  },
};
let scheme = 'a';
try { if (SCHEMES[localStorage.getItem('cornered.keys')]) scheme = localStorage.getItem('cornered.keys'); } catch { /* 저장 못 해도 A로 한다 */ }
const SC = () => SCHEMES[scheme];
const keyLabel = (code) => code.replace(/^Key/, '').replace(/^Arrow/, '').replace('Left', '←').replace('Right', '→');
const held = (codes) => codes.some((c) => keys.has(c));
const has = (codes, code) => codes.includes(code);

function legendHtml(sc, compact) {
  return sc.legend.map(([ks, label]) => {
    const k = ks.map((x) => (x === '+' ? '+' : `<kbd>${x}</kbd>`)).join('');
    return compact ? `<span>${k} ${label}</span>` : `<li>${k} ${label}</li>`;
  }).join('');
}
function applyScheme() {
  const sc = SC();
  $('keys').innerHTML = legendHtml(sc, true);
  $('howKeys').innerHTML = legendHtml(sc, false);
  $('btnKeys').innerHTML = `키 배치 ${sc.name}<small>${sc.desc}</small>`;
  document.querySelectorAll('#howSchemes button').forEach((b) => b.classList.toggle('on', b.dataset.id === scheme));
}
function setScheme(id) {
  scheme = id;
  try { localStorage.setItem('cornered.keys', id); } catch { /* 무시 */ }
  applyScheme();
}

function punchPress(hand) {
  if (app.s?.phase === 'count') {
    // 프레임이 느려도 연타를 잃지 않게 횟수로 센다
    if (app.mashLast !== hand) { frameInput.mash = Number(frameInput.mash) + 1; app.mashLast = hand; }
    return;
  }
  // 숙인 채 치면 어퍼, 피하는 중이거나 막 피했으면 훅
  let m = null;
  if (held(SC().duck)) m = 'upper';
  else if (app.time - app.weaveAt < 0.4) m = 'hook';
  frameInput.punch = { hand, mod: m };
}

addEventListener('keydown', (e) => {
  if (PREVENT.has(e.code)) e.preventDefault();
  if (e.repeat) return;
  snd.init();
  keys.add(e.code);
  if (e.code === 'KeyM') $('mute').click();
  if (app.mode === 'select') { selectKey(e); return; }
  if (app.mode === 'intro' && !app.net && (e.code === 'Space' || e.code === 'Enter')) { app.intro.t = Math.max(app.intro.t, app.intro.len - 0.6); return; }
  if (app.mode !== 'fight') return;
  if (e.code === 'Escape' || e.code === 'KeyP') { setPause(!app.paused); return; }
  if (app.paused) return;
  const sc = SC();
  const p = sc.punch[e.code];
  if (p) punchPress(p);
  else if (has(sc.special, e.code)) frameInput.special = true;
  else if (has(sc.left, e.code) || has(sc.right, e.code)) app.weaveAt = app.time;
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => {
  keys.clear();
  if (app.mode === 'fight' && !app.paused && !app.net) setPause(true);
});
addEventListener('mousemove', (e) => {
  app.mouseX = (e.clientX / innerWidth) * 2 - 1;
  app.mouseY = (e.clientY / innerHeight) * 2 - 1;
  if (document.pointerLockElement && app.mode === 'fight') {
    app.leanMouse = clamp(app.leanMouse + e.movementX * 0.0035, -1, 1);
  }
});
addEventListener('mousedown', () => snd.init());
$('view').addEventListener('click', () => { if (app.mode === 'fight' && !app.paused) lockMouse(); });
function lockMouse() {
  try {
    const p = $('view').requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  } catch { /* 안 돼도 키보드로 할 수 있다 */ }
}
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && app.mode === 'fight' && !app.paused && app.wasLocked) setPause(true);
  app.wasLocked = !!document.pointerLockElement;
});

/* ---------- 메뉴 ---------- */
const show = (id) => {
  for (const s of ['home', 'how', 'select', 'hud', 'pause', 'result', 'online']) $(s).hidden = s !== id;
  $('mute').hidden = id === 'hud';
};
function toHome() {
  netLeave();
  document.exitPointerLock?.();
  app.mode = 'home';
  app.s = null;
  app.paused = false;
  show('home');
  hideAll();
  const pick = BOXERS[Math.floor(Math.random() * BOXERS.length)];
  app.rig = getRig(pick.id);
  app.rig.group.visible = true;
  app.rig.snapFeet();
  app.menuRig = pick;
  Object.assign(post.u.tunnel, { value: 0.5 });
  post.u.red.value = 0; post.u.fade.value = 0; post.u.blind.value = 0; post.u.desat.value = 0.12; post.u.radial.value = 0; post.u.flash.value = 0; post.u.aberr.value = 0; post.u.sway.value = 0; post.u.pulse.value = 0;
}

$('btnGauntlet').onclick = () => openSelect('gauntlet');
$('btnSingle').onclick = () => openSelect('single');
$('btnOnline').onclick = () => hostRoom();
$('onBack').onclick = () => toHome();
$('onCopy').onclick = async () => {
  try { await navigator.clipboard.writeText($('onUrl').value); } catch { $('onUrl').select(); document.execCommand?.('copy'); }
  $('onCopy').textContent = '복사했어요';
  setTimeout(() => { $('onCopy').textContent = '링크 복사'; }, 1600);
};
$('btnHow').onclick = () => { app.mode = 'how'; show('how'); };
$('btnKeys').onclick = () => { setScheme(scheme === 'a' ? 'b' : 'a'); $('btnKeys').blur(); };
document.querySelectorAll('#howSchemes button').forEach((b) => { b.onclick = () => setScheme(b.dataset.id); });
applyScheme();
$('howBack').onclick = () => toHome();
$('mute').onclick = () => {
  snd.init();
  snd.setMuted(!snd.muted);
  $('mute').textContent = snd.muted ? '소리 끔' : '소리 켬';
  $('mute').blur();
};

function openSelect(kind) {
  app.mode = 'select';
  const sel = app.sel;
  sel.kind = kind;
  sel.step = 'player';
  sel.player = null;
  sel.index = 0;
  sel.spin = 0;
  if (kind === 'online' && app.net) app.net.myPick = null;
  $('selGo').disabled = false;
  show('select');
  buildSelectList();
  applySelect();
}
function buildSelectList() {
  const ol = $('selList');
  ol.innerHTML = '';
  BOXERS.forEach((b, i) => {
    const li = document.createElement('li');
    const bt = document.createElement('button');
    bt.textContent = b.name;
    bt.onclick = () => { app.sel.index = i; applySelect(); };
    li.append(bt);
    ol.append(li);
  });
  const lv = $('selLevels');
  lv.innerHTML = '';
  for (const [id, l] of Object.entries(LEVELS)) {
    const bt = document.createElement('button');
    bt.textContent = l.name;
    bt.dataset.id = id;
    bt.onclick = () => { app.sel.level = id; applySelect(); };
    lv.append(bt);
  }
}
function applySelect() {
  const sel = app.sel;
  const b = BOXERS[sel.index];
  const items = $('selList').querySelectorAll('button');
  items.forEach((bt, i) => {
    bt.classList.toggle('on', i === sel.index);
    bt.disabled = sel.step === 'opp' && BOXERS[i].id === sel.player;
  });
  $('selTitle').textContent = sel.kind === 'online' ? (app.net?.myPick ? '상대가 고르는 중…' : '내 복서 · 온라인') : sel.step === 'player' ? '내 복서' : '상대';
  $('selNick').textContent = `"${b.nick}"`;
  $('selName').textContent = b.name;
  $('selBlurb').textContent = b.blurb;
  $('selSpName').textContent = `${keyLabel(SC().special[0])} · ${b.special.name}`;
  $('selSpDesc').textContent = b.special.desc;
  const bars = $('selBars');
  bars.innerHTML = '';
  for (const [k, v] of Object.entries(b.bars)) {
    const dt = document.createElement('dt');
    dt.textContent = k;
    const dd = document.createElement('dd');
    for (let i = 0; i < 5; i++) {
      const n = document.createElement('i');
      if (i < v) n.className = 'on';
      dd.append(n);
    }
    bars.append(dt, dd);
  }
  $('selLevels').hidden = sel.step !== 'opp' && !(sel.kind === 'gauntlet');
  if (sel.kind !== 'single') $('selLevels').hidden = true;
  $('selLevels').querySelectorAll('button').forEach((bt) => bt.classList.toggle('on', bt.dataset.id === sel.level));
  $('selGo').textContent = sel.step === 'player' ? '이 복서로' : '시작';
  if (sel.shown !== b.id) {
    hideAll();
    const r = getRig(b.id);
    r.group.visible = true;
    r.snapFeet();
    app.rig = r;
    app.menuRig = b;
    sel.shown = b.id;
  }
}
function selectKey(e) {
  const sel = app.sel;
  const step = (d) => {
    let i = sel.index;
    do { i = (i + d + BOXERS.length) % BOXERS.length; } while (sel.step === 'opp' && BOXERS[i].id === sel.player);
    sel.index = i;
    applySelect();
  };
  if (e.code === 'ArrowUp' || e.code === 'KeyW') step(-1);
  if (e.code === 'ArrowDown' || e.code === 'KeyS') step(1);
  if (e.code === 'Enter' || e.code === 'Space') $('selGo').click();
  if (e.code === 'Escape') $('selBack').click();
}
$('selBack').onclick = () => {
  const sel = app.sel;
  if (sel.step === 'opp') { sel.step = 'player'; sel.index = BOXERS.findIndex((b) => b.id === sel.player); applySelect(); return; }
  toHome();
};
$('selGo').onclick = () => {
  const sel = app.sel;
  const b = BOXERS[sel.index];
  if (sel.kind === 'online') { if (app.net && !app.net.myPick) netPick(b.id); return; }
  if (sel.step === 'player') {
    sel.player = b.id;
    if (sel.kind === 'gauntlet') {
      // 뒤로 갈수록 무서운 순서. 탱크가 끝판
      const order = ['lucky', 'outboxer', 'southpaw', 'switch', 'dirty', 'infighter', 'tank'].filter((id) => id !== b.id);
      const last = order[order.length - 1] === 'tank' ? order : order;
      app.run = { kind: 'gauntlet', player: b.id, order: last, stage: 0 };
      startFight();
      return;
    }
    sel.step = 'opp';
    sel.index = (sel.index + 1) % BOXERS.length;
    applySelect();
    return;
  }
  app.run = { kind: 'single', player: sel.player, order: [b.id], stage: 0, level: sel.level };
  startFight();
};


/* ---------- 온라인 대전 ----------
 * 방장 브라우저가 경기를 돌리고(방장 = 0번, 손님 = 1번), 손님은 입력과 자기 머리 위치를 보낸다.
 * 방장은 초당 30번 경기 상태와 이벤트를 보낸다. 손님 화면은 링을 180도 돌려 자기가 0번인 것처럼 본다.
 * 피하기는 손님 쪽 머리 위치를 그대로 믿는다. 그래야 지연이 있어도 피한 게 피한 걸로 된다.
 */
const ONCE_KEYS = ['punch', 'upgrade', 'special', 'step'];
const netFresh = () => ({ myPick: null, peerPick: null, rIn: emptyInput(), rOnce: {}, rHead: null, sendT: 0, evq: [], head: { x: 0, y: 0, vx: 0, vy: 0 }, hacc: 0, inT: 0 });
const inviteUrl = (code) => `${location.origin}${location.pathname}?r=${code}`;

function showOnline(msg, url) {
  app.mode = 'online';
  show('online');
  $('onMsg').textContent = msg;
  $('onLinkRow').hidden = !url;
  $('onUrl').value = url || '';
}
function netLeave() {
  if (!app.net) return;
  app.net.link.close();
  app.net = null;
}
function onNetDrop() {
  app.net = null;
  toHome();
  showOnline('상대와 연결이 끊겼어요.', '');
}
async function hostRoom() {
  netLeave();
  const link = new HostLink();
  app.net = { role: 'host', link, ...netFresh() };
  link.onmessage = onNet;
  link.onclose = onNetDrop;
  showOnline('방을 만드는 중…', '');
  try {
    const code = await link.open(() => { link.send({ t: 'hi' }); openSelect('online'); });
    if (app.net?.link !== link) return;
    showOnline('이 링크를 친구에게 보내세요. 친구가 들어오면 바로 복서를 고릅니다.', inviteUrl(code));
  } catch (e) {
    if (app.net?.link === link) { netLeave(); showOnline(`방을 만들지 못했어요. (${e?.type || e?.message || e}) 잠시 뒤 다시 해 주세요.`, ''); }
  }
}
async function joinRoom(code) {
  netLeave();
  const link = new GuestLink();
  app.net = { role: 'guest', link, ...netFresh() };
  link.onmessage = onNet;
  link.onclose = onNetDrop;
  showOnline(`방 ${code}에 들어가는 중…`, '');
  try {
    await link.join(code);
    if (app.net?.link !== link) return;
    openSelect('online');
  } catch {
    if (app.net?.link === link) { netLeave(); showOnline('방을 찾지 못했어요. 링크가 맞는지, 친구가 아직 방에 있는지 확인해 주세요.', ''); }
  }
}
function netPick(id) {
  const N = app.net;
  N.myPick = id;
  N.link.send({ t: 'pick', id });
  $('selTitle').textContent = '상대가 고르는 중…';
  $('selGo').disabled = true;
  netMaybeStart();
}
function netMaybeStart() {
  const N = app.net;
  if (N.role !== 'host' || !N.myPick || !N.peerPick) return;
  N.link.send({ t: 'start', host: N.myPick, guest: N.peerPick });
  netStart(N.myPick, N.peerPick);
}
function netStart(me, op) {
  const N = app.net;
  Object.assign(N, netFresh(), { myPick: null, peerPick: null });
  $('selGo').disabled = false;
  app.run = { kind: 'online', player: me, order: [op], stage: 0 };
  startFight();
}
function onNet(m) {
  const N = app.net;
  if (!N) return;
  switch (m.t) {
    case 'pick': N.peerPick = m.id; netMaybeStart(); break;
    case 'start': if (N.role === 'guest') netStart(m.guest, m.host); break;
    case 'i': {
      // 손님 입력: 누르고 있는 건 최신 값으로, 한 번 누른 건 다음 틱까지 모아 둔다
      N.rIn = { ...emptyInput(), ...m.c };
      for (const k of ONCE_KEYS) if (m.o[k]) N.rOnce[k] = m.o[k];
      if (m.o.mash) N.rOnce.mash = (N.rOnce.mash || 0) + m.o.mash;
      N.rHead = m.h;
      break;
    }
    case 's': if (N.role === 'guest' && app.s) applySnap(m.s, m.ev); break;
    case 'bye': onNetDrop(); break;
    default:
  }
}
function packFight(s) {
  return {
    phase: s.phase, round: s.round, clock: s.clock, rest: s.rest, pa: s.pa, pb: s.pb, count: s.count, result: s.result,
    f: s.f.map(({ def, level, ai, ...o }) => o),
  };
}
const swapWho = (e) => {
  const o = { ...e };
  for (const k of ['who', 'by', 'winner']) if (typeof o[k] === 'number') o[k] = 1 - o[k];
  return o;
};
function applySnap(p, ev) {
  const s = app.s, N = app.net;
  const [host, guest] = p.f;
  Object.assign(s.f[0], guest, { index: 0, head: N.head });
  Object.assign(s.f[1], host, { index: 1 });
  s.phase = p.phase; s.round = p.round; s.clock = p.clock; s.rest = p.rest;
  if (app.mode !== 'intro') { s.pa = -p.pb; s.pb = -p.pa; }
  s.count = p.count ? { ...p.count, who: 1 - p.count.who } : null;
  s.result = p.result ? { ...p.result, winner: 1 - p.result.winner } : null;
  if (app.mode === 'fight' || app.mode === 'over') for (const e of ev) handleEvent(swapWho(e));
}
function netFrame(realDt, base, inp) {
  const N = app.net, s = app.s;
  if (N.role === 'host') {
    app.acc += realDt;
    let once = true, g = 0;
    while (app.acc >= SIM && g++ < 20) {
      app.acc -= SIM;
      const blank = { punch: null, upgrade: null, special: false, step: 0, mash: false };
      const i1 = once ? { ...N.rIn, ...N.rOnce } : { ...N.rIn, ...blank };
      if (once) N.rOnce = {};
      stepFight(s, SIM, once ? base : { ...base, ...blank }, i1);
      if (N.rHead) { s.f[1].head.x = N.rHead.x; s.f[1].head.y = N.rHead.y; }
      once = false;
    }
    if (once) restoreInput(inp);
    const ev = drainEvents(s);
    for (const e of ev) handleEvent(e);
    N.evq.push(...ev);
    N.sendT -= realDt;
    if (N.sendT <= 0 || ev.length) {
      N.sendT = 1 / 30;
      N.link.send({ t: 's', s: packFight(s), ev: N.evq });
      N.evq = [];
    }
    return;
  }
  // 손님: 내 머리는 바로 움직이고(지연 없이), 입력은 방장에게 보낸다
  const me = s.f[0];
  N.hacc += realDt;
  while (N.hacc >= SIM) {
    N.hacc -= SIM;
    const f = { def: me.def, st: me.st, stun: me.stun, index: 0, head: N.head };
    updateHead(s, f, me.stun > 0 || s.phase !== 'fight' ? { weave: 0, lean: 0, duck: false } : base, SIM);
  }
  me.head = N.head;
  const o = {};
  for (const k of ONCE_KEYS) if (inp[k]) o[k] = inp[k];
  if (inp.mash) o.mash = Number(inp.mash);
  N.inT -= realDt;
  if (Object.keys(o).length || N.inT <= 0) {
    N.inT = 1 / 60;
    N.link.send({ t: 'i', c: { guard: base.guard, duck: base.duck, weave: base.weave, lean: base.lean, walk: base.walk }, o, h: { x: N.head.x, y: N.head.y } });
  }
}

/* ---------- 경기 시작 ---------- */
function levelFor(run) {
  if (run.kind === 'online') return null;
  if (run.kind === 'single') return run.level;
  return run.stage < 2 ? 'easy' : run.stage < 5 ? 'normal' : 'hell';
}
function startFight() {
  const run = app.run;
  const pl = byId(run.player);
  const op = byId(run.order[run.stage]);
  const s = createFight({ player: pl, opponent: op, level: levelFor(run), seed: (Math.random() * 1e9) | 0 });
  const lvName = run.kind === 'online' ? '온라인' : LEVELS[levelFor(run)].name;
  app.s = s;
  hideAll();
  app.rig = getRig(op.id);
  app.rig.group.visible = true;
  app.rig.setDamage(0);
  app.rig.faceDmg = -1;
  app.rig.setDamage(0);
  app.arms = getArms(pl.id);
  app.arms.group.visible = true;
  app.mode = 'intro';
  app.paused = false;
  app.intro = { t: 0, len: 4.4, op };
  s.pb = -3.2;
  app.rig.snapFeet();
  Object.assign(app.fx, { flash: 0, aberr: 0, radial: 0, red: 0, stunBlur: 0, shake: 0, crowd: 0.12, ring: 0, muffle: 0, downY: 0, zoom: 0 });
  app.lastHp = [1, 1];
  app.leanMouse = 0;
  show('hud');
  $('hudP').textContent = pl.name;
  $('hudO').textContent = `${op.name} · ${lvName}`;
  $('keys').classList.remove('gone');
  app.keysT = 24;
  $('countBox').hidden = true;
  snd.init();
  snd.setCrowd(0.12);
  $('vsP').textContent = pl.name; $('vsPn').textContent = `"${pl.nick}"`;
  $('vsO').textContent = op.name; $('vsOn').textContent = `"${op.nick}"`;
  $('vsNote').textContent = run.kind === 'online' ? '온라인 대전' : `${lvName} · ${run.kind === 'gauntlet' ? `도장 깨기 ${run.stage + 1} / ${run.order.length}` : '단판 승부'} · Space 건너뛰기`;
  $('vs').hidden = false;
  setTaunt('', 0);
}
function beginRoundOne() {
  const s = app.s;
  app.mode = 'fight';
  s.pa = 0.5;
  s.pb = -0.6;
  snd.bell(1);
  snd.setCrowd(0.45);
  snd.roar(1);
  $('vs').hidden = true;
  announce('FIGHT', '', 0.9);
  lockMouse();
}
function setPause(p) {
  app.paused = p;
  $('pause').hidden = !p;
  $('hud').hidden = false;
  if (p) document.exitPointerLock?.();
  else lockMouse();
}
$('pauseResume').onclick = () => setPause(false);
$('pauseQuit').onclick = () => toHome();

/* ---------- 작은 연출들 ---------- */
let annTimer = 0;
function announce(big, small = '', sec = 1.2) {
  const a = $('announce');
  a.innerHTML = '';
  a.append(document.createTextNode(big));
  if (small) { const sm = document.createElement('small'); sm.textContent = small; a.append(sm); }
  a.style.animationDuration = `${sec}s`;
  a.classList.remove('show');
  void a.offsetWidth;
  a.classList.add('show');
  clearTimeout(annTimer);
}
function popup(t, color) {
  const a = $('popup');
  a.textContent = t;
  a.classList.toggle('bad', !!color && color !== '#9d9b96');
  a.classList.remove('show');
  void a.offsetWidth;
  a.classList.add('show');
}
function setTaunt(t, sec = 2.2) {
  const a = $('taunt');
  if (t) { a.textContent = `“${t}”`; a.classList.add('show'); app.tauntT = sec; }
  else { a.classList.remove('show'); app.tauntT = 0; }
}
const randOf = (arr) => arr[Math.floor(Math.random() * arr.length)];

const camKick = (x, y, z, pz = 0, px = 0, py = 0) => {
  const r = app.camRot;
  r.vx += x; r.vy += y; r.vz += z;
  r.vpz += pz; r.vpx += px; r.vpy += py;
};
const v = (x, y, z) => new THREE.Vector3(x, y, z);

/* ---------- 경기 이벤트를 연출로 ---------- */
function handleEvent(e) {
  const s = app.s, fx = app.fx;
  const rig = app.rig, arms = app.arms;
  const opp = s.f[1];
  switch (e.type) {
    case 'throw':
      if (e.who === 1) {
        // 상대 어깨가 움직이는 순간 숨소리가 먼저 들린다
        if (e.id !== 'jab') {
          snd.grunt(e.hand === 'R' ? -0.3 : 0.3, opp.def.h > 2 ? 0.72 : 1);
          if (e.id === 'hook' || e.id === 'upper') fx.zoom = Math.max(fx.zoom, 0.9);
        }
      } else {
        snd.whoosh(e.hand === 'R' ? 0.25 : -0.25, 0.14);
      }
      break;
    case 'hit':
      if (e.who === 0) onPlayerHit(e); else onOppHit(e);
      break;
    case 'block':
      snd.block(e.hand === 'R' ? (e.who === 0 ? -0.5 : 0.5) : (e.who === 0 ? 0.5 : -0.5));
      if (e.who === 0) {
        camKick(1.6, 0, (e.hand === 'R' ? 1 : -1) * 0.9, 0.9);
        fx.flash = Math.max(fx.flash, 0.05);
        fx.shake = Math.max(fx.shake, 0.35);
      } else {
        rig.hit(-1.6, (e.hand === 'R' ? 1 : -1) * 1.2, 0);
        const g = headOf(); g.y -= 0.22;
        impacts.spawn(g.lerp(camera.getWorldPosition(new THREE.Vector3()), 0.2), { kind: 'ring', size: 0.08, life: 0.16, grow: 2.6, color: 0x9fc6ff, alpha: 0.6 });
        app.hitstop = Math.max(app.hitstop, 0.02);
        arms.squash(e.hand, 0.4);
      }
      break;
    case 'parry':
      snd.parry();
      if (e.who === 0) {
        { const g = headOf(); g.y -= 0.1; impacts.spawn(g.lerp(camera.getWorldPosition(new THREE.Vector3()), 0.55), { kind: 'star', size: 0.16, life: 0.16, grow: 1.6, color: 0xffcf4a }); }
        popup('패리');
        app.slow = Math.max(app.slow, 0.22);
        fx.flash = Math.max(fx.flash, 0.1);
      }
      break;
    case 'slip':
      if (e.who === 0) {
        const pan = e.hand === 'R' ? -0.75 : 0.75;
        snd.whoosh(pan, e.near ? 0.85 : 0.5);
        if (e.near) {
          app.slow = Math.max(app.slow, 0.2);
          fx.radial = Math.max(fx.radial, 0.3);
          popup('회피');
        }
      } else {
        snd.whoosh(0, 0.3);
        if (Math.random() < 0.35) setTaunt(randOf(opp.def.taunts), 1.6);
      }
      break;
    case 'whiff':
      snd.whoosh(e.hand === 'R' ? 0.3 : -0.3, 0.3);
      break;
    case 'rocked':
      if (e.who === 0) {
        fx.ring = 1;
        fx.muffle = 1;
        fx.stunBlur = 1;
        camKick(2, 3 * (Math.random() < 0.5 ? -1 : 1), 3.4 * (Math.random() < 0.5 ? -1 : 1));
        snd.roar(1);
        popup('그로기', '#ff5a3c');
      } else {
        popup('그로기');
        rig.hit(-3, 2, 2);
        snd.roar(0.8);
      }
      break;
    case 'guardbreak':
      if (e.who === 0) { popup('가드 붕괴', '#ff5a3c'); fx.stunBlur = 0.7; }
      break;
    case 'special':
      if (e.who === 1) {
        popup(e.name, '#ff5a3c');
        snd.grunt(0, 0.8);
        fx.zoom = 1;
      } else popup(e.name);
      break;
    case 'stance':
      if (e.who === 1) setTaunt(randOf(opp.def.taunts), 1.4);
      break;
    case 'step':
      snd.step();
      break;
    case 'foul':
      if (e.penalty) popup(`반칙 ${e.count}회: 감점`, '#ff5a3c');
      else popup(`반칙 경고 ${e.count}`, '#ff5a3c');
      break;
    case 'miracle':
      announce('기적', e.who === 0 ? '오늘은 운이 좋다' : '저게 왜 안 쓰러져', 1.2);
      snd.roar(1);
      break;
    case 'stare':
      app.stareT = 1.4;
      if (Math.random() < 0.7) setTaunt(randOf(opp.def.taunts), 1.7);
      snd.heart(0.5);
      break;
    case 'down':
      snd.thud();
      snd.roar(1.6);
      fx.flash = 0.7;
      app.slow = 0.75;
      if (e.who === 0) { fx.ring = 1; fx.muffle = 1; setTaunt(randOf(opp.def.taunts), 2.6); }
      announce('DOWN', '', 1);
      fx.zoom = 1.4;
      if (e.who === 1) { const g = headOf(); impacts.spawn(g, { kind: 'ring', size: 0.3, life: 0.5, grow: 5, color: 0xffffff, alpha: 0.7 }); }
      app.mashLast = null;
      break;
    case 'rise':
      snd.roar(0.8);
      snd.bell(1);
      $('countBox').hidden = true;
      app.fx.downY = e.who === 0 ? 1 : 0;
      break;
    case 'count':
      snd.count();
      fx.flash = Math.max(fx.flash, e.who === 0 ? 0.08 : 0);
      break;
    case 'bell':
      snd.bell(e.end ? 3 : 1);
      if (e.end) { announce(`ROUND ${e.round} 끝`, '', 1.5); app.fx.zoom = 0; }
      else { announce(`ROUND ${e.round}`, '', 1.2); snd.roar(0.8); }
      break;
    case 'over':
      setTimeout(() => showResult(), e.how === '판정' ? 1500 : 2600);
      // 끝내는 한 방은 길게 느리게 보여 준다
      if (e.how !== '판정') { app.slow = Math.max(app.slow, 1.3); fx.zoom = 1.6; fx.flash = Math.max(fx.flash, 0.5); }
      if (e.winner === 0) { snd.roar(1.8); }
      announce(e.how === '판정' ? '판정' : e.how, '', 1.8);
      break;
    default:
  }
}

const headOf = () => app.rig.headWorld.clone();

function onPlayerHit(e) {
  const fx = app.fx;
  const power = clamp(e.dmg / 13, 0.2, 1.4);
  const fromLeft = e.hand === 'R'; // 상대 오른손은 내 왼쪽에서 온다
  const pan = fromLeft ? -0.5 : 0.5;
  snd.takeHit(power, pan);
  fx.flash = Math.max(fx.flash, 0.16 + power * 0.32);
  fx.aberr = Math.max(fx.aberr, 0.4 + power * 0.9);
  fx.radial = Math.max(fx.radial, 0.3 + power * 0.6);
  fx.red = Math.min(1, fx.red + power * 0.35);
  fx.shake = Math.max(fx.shake, 0.4 + power);
  fx.muffle = Math.max(fx.muffle, power * 0.62);
  fx.ring = Math.max(fx.ring, power > 0.75 ? power * 0.7 : 0);
  const side = fromLeft ? 1 : -1;
  switch (e.kind) {
    case 'hook': camKick(1, -6.4 * side * power * -1, 4.4 * side * power, 0.5, 2.1 * side * power); break;
    case 'upper': camKick(9 * power, 0, 1.2 * side * power, 1.4, 0, 1.6 * power); break;
    case 'body': camKick(-4.8 * power, 0, 0.9 * side, 0.4, 0, -1 * power); snd.breath(1, false); break;
    default: camKick(4.8 * power, 1.1 * side * power, 1.2 * side * power, 2.1 * power); break;
  }
  // 얼굴 쪽으로 튀는 내 땀과 피, 그리고 주먹이 들어온 쪽에서 번쩍
  const camP = camera.getWorldPosition(new THREE.Vector3());
  const from = e.kind === 'hook' ? (fromLeft ? -0.2 : 0.2) : (fromLeft ? -0.06 : 0.06);
  impacts.spawn(camera.localToWorld(new THREE.Vector3(from, e.kind === 'body' ? -0.24 : e.kind === 'upper' ? -0.1 : 0, -0.32)), { kind: 'star', size: 0.12 + power * 0.14, life: 0.08 + power * 0.04, grow: 1.2, color: 0xfff0dd });
  app.hitstop = Math.max(app.hitstop, 0.025 + power * 0.04);
  const front = new THREE.Vector3(0, 0.1, -1);
  parts.burst(camP.clone().add(new THREE.Vector3(0, 0.02, -0.42)), front, 8 + power * 14, power > 0.7 ? 'blood' : 'sweat');
  if (e.counter && power > 0.6) popup('카운터 맞음', '#ff5a3c');
  app.lastHp[0] = app.s.f[0].hp / app.s.f[0].maxHp;
  // 맞을 때마다 관중이 달아오른다
  fx.crowd = Math.min(1, fx.crowd + power * 0.14);
  if (e.big) snd.roar(0.55);
  if (e.big && Math.random() < 0.3) setTaunt(randOf(app.s.f[1].def.taunts), 1.5);
}

function onOppHit(e) {
  const fx = app.fx;
  const power = clamp(e.dmg / 13, 0.2, 1.8);
  const rig = app.rig;
  snd.landHit(Math.min(1, power), e.counter);
  const arms = app.arms;
  fx.shake = Math.max(fx.shake, 0.12 + power * 0.28);
  fx.flash = Math.max(fx.flash, power > 1.2 ? 0.16 : 0.015);
  const sgn = e.hand === 'R' ? 1 : -1;
  switch (e.kind) {
    case 'hook': rig.hit(-1.4 * power, sgn * 9 * power, sgn * 3 * power); break;
    case 'upper': rig.hit(-12 * power, sgn * 0.8, sgn * 1.2 * power); break;
    case 'body': rig.hit(7 * power, 0, sgn * power); break;
    default: rig.hit(-7 * power, sgn * 1.8 * power, sgn * 1.2 * power); break;
  }
  const head = headOf();
  const dir = new THREE.Vector3(sgn * 0.45, 0.4, -0.75).normalize();
  if (e.kind === 'body') head.y -= 0.5;
  // 섬광은 얼굴 앞쪽(나와 가까운 쪽)에, 훅은 옆에서 들어간 자리에
  const camP = camera.getWorldPosition(new THREE.Vector3());
  const spot = head.clone().lerp(camP, 0.12);
  if (e.kind === 'hook') spot.x += sgn * 0.07;
  if (e.kind === 'upper') spot.y -= 0.08;
  impacts.hit(spot, power * (e.counter ? 1.3 : 1), { color: e.counter ? 0xffd68a : 0xffffff });
  parts.burst(head, dir, 10 + power * 22, power > 1.05 && e.kind !== 'body' ? 'blood' : 'sweat');
  // 모든 타격에 아주 짧게 멈춘다. 세게 맞힐수록 길게. 이게 손맛의 대부분이다
  app.hitstop = Math.max(app.hitstop, 0.03 + power * 0.045 + (e.counter ? 0.03 : 0));
  arms.squash(e.hand, power);
  camKick(-0.6 * power, sgn * 0.9 * power, 0, -0.6 * power);
  if (e.gamble === 'win') { announce('대박', '', 0.9); snd.roar(1.2); }
  else if (e.gamble === 'lose') popup('꽝', '#9d9b96');
  else if (e.crit) popup('럭키 펀치');
  else if (e.counter) popup(e.combo > 1 ? `카운터 ${e.combo}연타` : '카운터');
  else if (e.combo >= 3) popup(`${e.combo}연타`);
  fx.crowd = Math.min(1, fx.crowd + power * 0.1);
  if (power > 0.9) snd.roar(0.45);
  rig.setDamage(1 - app.s.f[1].hp / app.s.f[1].maxHp);
}

function showResult() {
  const s = app.s;
  if (!s || !s.result) return;
  document.exitPointerLock?.();
  app.mode = 'over';
  const win = s.result.winner === 0;
  show('result');
  const run = app.run;
  const t = $('resTitle');
  t.textContent = win ? '승리' : '패배';
  t.className = win ? 'win' : 'lose';
  const op = s.f[1].def, pl = s.f[0].def;
  let howText = `${s.result.how} · ${s.round}라운드`;
  const n = $('resNext');
  if (run.kind === 'gauntlet') {
    const total = run.order.length;
    howText += ` · 도장 깨기 ${run.stage + (win ? 1 : 0)} / ${total}`;
    if (win && run.stage + 1 >= total) {
      t.textContent = '제패';
      n.textContent = '처음부터';
      n.onclick = () => { run.stage = 0; startFight(); };
    } else if (win) {
      const next = byId(run.order[run.stage + 1]);
      n.textContent = `다음: ${next.name}`;
      n.onclick = () => { run.stage += 1; startFight(); };
    } else {
      n.textContent = '다시 도전';
      n.onclick = () => startFight();
    }
  } else if (run.kind === 'online') {
    n.textContent = '한 판 더 (복서 다시 고르기)';
    n.onclick = () => { if (app.net) openSelect('online'); else toHome(); };
  } else {
    n.textContent = '다시 하기';
    n.onclick = () => startFight();
  }
  $('resHow').textContent = howText;
  const tb = $('resStats');
  tb.innerHTML = '';
  const row = (k, a, b) => {
    const tr = document.createElement('tr');
    for (const [tag, val] of [['td', a], ['th', k], ['td', b]]) {
      const c = document.createElement(tag);
      c.textContent = val;
      tr.append(c);
    }
    tb.append(tr);
  };
  const [a, b] = s.f;
  row('', pl.name, op.name);
  row('적중 / 시도', `${a.landed}/${a.thrown}`, `${b.landed}/${b.thrown}`);
  row('회피', a.dodged, b.dodged);
  row('다운', a.knockdowns, b.knockdowns);
  row('반칙', a.fouls, b.fouls);
}
$('resMenu').onclick = () => toHome();

/* ---------- HUD ---------- */
function updateHud(dt) {
  const s = app.s;
  if (!s) return;
  const [a, b] = s.f;
  const hpA = a.hp / a.maxHp, hpB = b.hp / b.maxHp;
  $('hpP').style.transform = `scaleX(${hpA})`;
  $('hpPw').style.transform = `scaleX(${hpA})`;
  $('hpO').style.transform = `scaleX(${hpB})`;
  $('hpOw').style.transform = `scaleX(${hpB})`;
  $('stP').style.transform = `scaleX(${a.st / 100})`;
  $('stO').style.transform = `scaleX(${b.st / 100})`;
  $('hpP').parentElement.classList.toggle('low', hpA < 0.28);
  $('stP').parentElement.classList.toggle('low', a.st < 15);
  const clock = Math.ceil(s.clock);
  $('hudClock').textContent = s.phase === 'rest' ? Math.ceil(s.rest) : clock;
  $('hudRound').textContent = s.phase === 'rest' ? 'REST' : `ROUND ${s.round} / ${ROUNDS}`;
  document.querySelector('.clock').classList.toggle('hot', s.phase === 'fight' && clock <= 10);
  const sp = $('spP');
  const spKey = keyLabel(SC().special[0]);
  sp.textContent = a.spCd > 0 ? `${spKey} ${a.def.special.name} ${Math.ceil(a.spCd)}` : `${spKey} ${a.def.special.name}`;
  sp.classList.toggle('ready', a.spCd <= 0);
  $('corner').classList.toggle('show', s.phase === 'fight' && cornered(s, 0));
  if (app.tauntT > 0) {
    app.tauntT -= dt;
    if (app.tauntT <= 0) $('taunt').classList.remove('show');
  }
  if (app.keysT > 0) {
    app.keysT -= dt;
    if (app.keysT <= 0) $('keys').classList.add('gone');
  }
  // 다운 카운트
  const box = $('countBox');
  if (s.phase === 'count' && s.count) {
    box.hidden = false;
    const c = s.count;
    $('countNum').textContent = c.n || 1;
    if (c.who === 0) {
      const pk = Object.keys(SC().punch).slice(0, 2).map(keyLabel).join(' ');
      $('countMsg').textContent = `${pk} 번갈아 연타!`;
      $('countGauge').hidden = false;
      $('countFill').style.transform = `scaleX(${clamp(c.fill / c.need, 0, 1)})`;
    } else {
      $('countMsg').textContent = `${s.f[1].def.name} 다운`;
      $('countGauge').hidden = true;
    }
  } else box.hidden = true;
}

/* ---------- 프레임 ---------- */
let last = performance.now();
const camBase = new THREE.Vector3();
const lookAt = new THREE.Vector3();
const targetHead = new THREE.Vector3();

function menuFrame(dt) {
  const r = app.rig;
  if (!r || !app.menuRig) return;
  const def = app.menuRig;
  const sel = app.mode === 'select';
  // 메뉴에서도 눈은 마우스(= 나)를 따라온다
  const z = -0.15;
  const camZ = sel ? 3.05 : 1.34 + (def.h - 1.8) * 0.5;
  const camY = sel ? 1.22 + (def.h - 1.8) * 0.45 : def.h * 0.86;
  const cx = sel ? -0.1 : -0.56 + app.mouseX * 0.04;
  camera.position.set(cx, camY - app.mouseY * 0.03, camZ);
  lookAt.set(sel ? cx : -0.56 + app.mouseX * 0.04, sel ? 1.08 + (def.h - 1.8) * 0.45 : def.h * 0.92, z);
  camera.up.set(0, 1, 0);
  camera.fov = sel ? 36 : 44;
  camera.updateProjectionMatrix();
  camera.lookAt(lookAt);
  const offX = sel ? 0 : 0.03;
  const trg = new THREE.Vector3(camera.position.x + offX + app.mouseX * 0.9, camera.position.y - app.mouseY * 0.7, camera.position.z);
  r.group.position.x = 0;
  r.update(dt, dummy(def), { z, target: trg, down: false, idle: true });
  if (sel) {
    app.sel.spin = Math.sin(app.time * 0.55) * 0.34;
    r.group.rotation.y = app.sel.spin;
  } else r.group.rotation.y = 0;
  post.u.tunnel.value = sel ? 0.34 : 0.56;
  post.u.desat.value = 0.12;
  updateWorld(world, dt, 0.08, z, 1.4);
}

function fightFrame(realDt) {
  fightSim(realDt);
  fightView(realDt);
}
function fightSim(realDt) {
  const s = app.s;
  // 슬로와 정지
  let dt = realDt;
  if (app.hitstop > 0) { app.hitstop -= realDt; dt = 0; }
  else if (app.slow > 0) { app.slow -= realDt; dt = realDt * 0.28; }

  // 입력 → 시뮬
  if (app.mode === 'fight') {
    const inp = app.paused ? (consume(), emptyInput()) : consume();
    const live = !app.paused;
    const weave = live ? (held(SC().right) ? 1 : 0) - (held(SC().left) ? 1 : 0) : 0;
    if (weave) app.weaveAt = app.time;
    const guard = live && held(SC().guard);
    // 앞으로는 저절로 걸어 들어간다. 코너에 몰렸으면 밀고 나온다
    const gap = s.pa - s.pb;
    const walk = s.phase !== 'fight' || guard ? 0 : cornered(s, 0) ? 0.7 : gap > 1.0 ? 0.6 : 0;
    const base = { ...inp, guard, duck: live && held(SC().duck), weave, lean: clamp(app.lean + app.leanMouse, -1, 1), walk };
    if (app.net) netFrame(realDt, base, inp);
    else localSim(s, dt, base, inp);
  }
}
function localSim(s, dt, base, inp) {
  {
    app.acc += dt;
    let once = true;
    let guardN = 0;
    while (app.acc >= SIM && guardN++ < 20) {
      app.acc -= SIM;
      stepFight(s, SIM, once ? base : { ...base, punch: null, upgrade: null, special: false, step: 0, mash: false });
      once = false;
    }
    for (const e of drainEvents(s)) handleEvent(e);
    // 아무 틱도 안 돌았으면 입력을 되돌린다
    if (once) restoreInput(inp);
  }
}
// 아무 틱도 안 돌았으면 이번 프레임의 한 번짜리 입력을 다음 프레임으로 넘긴다
function restoreInput(inp) {
  frameInput = { ...inp, ...frameInput, punch: frameInput.punch || inp.punch, upgrade: frameInput.upgrade || inp.upgrade, special: frameInput.special || inp.special, step: frameInput.step || inp.step, mash: Number(frameInput.mash) + Number(inp.mash) };
}

function fightView(realDt) {
  const s = app.s, fx = app.fx, rig = app.rig, arms = app.arms;
  const me = s.f[0], opp = s.f[1];
  const dt = app.hitstop > 0 ? 0 : app.slow > 0 ? realDt * 0.28 : realDt;

  // 내 주먹이 뻗는 순간: 시선이 살짝 앞으로 들어가고 어깨 쪽으로 돈다
  const mp = me.punch;
  // 온라인 손님은 스냅숏마다 펀치 객체가 바뀌므로 던진 횟수로 같은 펀치인지 본다
  if (mp && app.struck !== me.thrown && mp.t >= mp.w) {
    app.struck = me.thrown;
    const sg = mp.hand === 'R' ? 1 : -1;
    const pw = { jab: 0.45, cross: 1, hook: 1.25, upper: 1, body: 0.8 }[mp.id] || 0.6;
    camKick(mp.id === 'upper' ? 1.2 : mp.id === 'body' ? -1.2 : 0.2, sg * 1.5 * pw, -sg * 1.2 * pw, -2.4 * pw);
    snd.whoosh(sg * 0.25, 0.1 + pw * 0.1);
  }
  // 마우스로 기울인 머리는 서서히 가운데로 돌아온다
  app.lean = damp(app.lean, 0, 14, realDt);
  app.leanMouse = damp(app.leanMouse, 0, 1.6, realDt);

  // 인트로: 상대가 천천히 걸어와 코앞에 선다
  if (app.mode === 'intro') {
    const I = app.intro;
    I.t += realDt;
    const u = clamp(I.t / (I.len - 0.8), 0, 1);
    s.pa = 0.5;
    s.pb = -3.2 + (1 - Math.pow(1 - u, 1.8)) * 3.05;
    if (I.t >= I.len) beginRoundOne();
  }

  // 피로와 체력
  const hp = me.hp / me.maxHp;
  const tired = 1 - me.st / 100;
  const corner = clamp((s.pa - CORNER * 0.7) / (LIM - CORNER * 0.7), 0, 1);
  const dist = s.pa - s.pb;

  // 땀·피 잔상 등 감쇠
  fx.flash = damp(fx.flash, 0, 13, realDt);
  fx.aberr = damp(fx.aberr, 0, 5, realDt);
  fx.radial = damp(fx.radial, 0, 9, realDt);
  fx.red = damp(fx.red, (1 - hp) * 0.55, 1.1, realDt);
  fx.stunBlur = damp(fx.stunBlur, me.stun > 0 ? 0.65 : 0, 3, realDt);
  fx.shake = damp(fx.shake, 0, 7, realDt);
  fx.ring = damp(fx.ring, 0, 0.9, realDt);
  fx.muffle = damp(fx.muffle, 0, 2.2, realDt);
  fx.zoom = damp(fx.zoom, 0, 3.6, realDt);
  const cornerHeat = corner * 0.55 + (1 - hp) * 0.35;
  fx.crowd = damp(fx.crowd, 0.28 + cornerHeat, 0.5, realDt);

  // 카메라 스프링
  const R = app.camRot;
  const kk = 90, cc = 13;
  for (const [a, b] of [['x', 'vx'], ['y', 'vy'], ['z', 'vz'], ['px', 'vpx'], ['py', 'vpy'], ['pz', 'vpz']]) {
    R[b] += (-R[a] * kk - R[b] * cc) * realDt;
    R[a] += R[b] * realDt;
  }

  // 머리 위치 → 카메라
  const downNow = s.phase === 'count' && s.count?.who === 0 || (s.phase === 'over' && me.knockdowns > 0 && s.result?.winner === 1 && s.result?.how !== '판정');
  fx.downY = damp(fx.downY, downNow ? 1 : 0, downNow ? 3.4 : 2.2, realDt);
  const D = fx.downY;
  const t = app.time;
  const breatheY = Math.sin(t * (2.2 + tired * 2.6)) * (0.006 + tired * 0.016);
  const bobX = Math.sin(t * 1.6) * 0.006 + Math.sin(t * 0.7) * 0.004;
  const shake = fx.shake;
  const nx = (Math.sin(t * 61) + Math.sin(t * 37)) * 0.5, ny = (Math.sin(t * 53 + 1) + Math.sin(t * 29 + 2)) * 0.5;

  const head = me.head;
  camBase.set(
    head.x + bobX + R.px * 0.018 + nx * shake * 0.012,
    (EYE + head.y * 1.05 + breatheY + R.py * 0.012 + ny * shake * 0.01) * (1 - D) + D * 0.3,
    s.pa + 0.04 + R.pz * 0.02 - head.y * 0.05
  );
  camera.position.copy(camBase);

  // 상대 쪽을 본다. 위를 올려다본다. 맞으면 시선이 튄다
  const opH = opp.def.h;
  targetHead.copy(rig.headWorld);
  // 다운되면 바닥에서 나를 내려다보는 상대를 올려다본다
  lookAt.set(
    rig.headWorld.x * 0.55 * (1 - D) + rig.headWorld.x * D,
    (opH * 0.8 + (head.y * 0.4)) * (1 - D) + D * (rig.headWorld.y + 0.25),
    s.pb * (1 - D) + rig.headWorld.z * D
  );
  // 위빙해도 시선은 상대에게 붙어 있어야 한다
  camera.up.set(0, 1, 0);
  camera.lookAt(lookAt);
  const roll = -head.x * 0.26 - bobX * 2 + (me.stun > 0 ? Math.sin(t * 5) * 0.03 : 0);
  camera.rotateZ(roll + R.z * 0.028);
  camera.rotateX(R.x * 0.022 + ny * shake * 0.008);
  camera.rotateY(R.y * 0.024 + nx * shake * 0.008);
  if (D > 0.01) camera.rotateZ(D * 0.22);

  const closeness = clamp((1.45 - dist) / 0.67, 0, 1);
  let fov = 61 - closeness * 7 - fx.zoom * 6 - corner * 3; // 붙을수록 좁혀서 상대가 화면을 채운다
  if (app.mode === 'intro') fov = 50 + app.intro.t * 2.8;
  if (app.stareT > 0) { app.stareT -= realDt; fov -= 5 * clamp(app.stareT, 0, 1); }
  camera.fov = damp(camera.fov, fov, 9, realDt);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);

  // 복서·팔 갱신
  const animDt = dt;
  const camW = camera.getWorldPosition(new THREE.Vector3());
  // 조준 고정 뒤에는 주먹이 고정된 자리로 간다 (복서 기준 aimX는 내 x와 같은 축)
  const down = s.phase === 'count' && s.count?.who === 1 || (s.phase === 'over' && s.result?.winner === 0 && s.result?.how !== '판정');
  // 내가 다운되면 상대는 한 걸음 다가와 위에서 내려다본다
  const standOver = D > 0.05 ? Math.max(s.pb, s.pa - 1.05) * D + s.pb * (1 - D) : s.pb;
  rig.update(animDt, opp, { z: standOver, target: camW, down, idle: false });
  arms.update(animDt, me, camera, rig.headWorld);
  parts.update(realDt);
  impacts.update(realDt);
  updateWorld(world, realDt, fx.crowd, s.pb, s.pa);

  // 소리
  snd.setCrowd(fx.crowd);
  snd.setRing(fx.ring);
  snd.setMuffle(fx.muffle * 0.92);
  snd.setDrone(corner * 0.7 + (hp < 0.3 ? 0.4 : 0));
  // 심장: 체력이 낮거나 코너면 빨라지고 커진다
  const danger = clamp((0.72 - hp) / 0.72 + corner * 0.4, 0, 1);
  app.heartT -= realDt;
  let pulse = 0;
  if (s.phase !== 'over' && app.mode !== 'over') {
    const bpm = 58 + danger * 110;
    const period = 60 / bpm;
    if (app.heartT <= 0) {
      app.heartT = period;
      if (danger > 0.12 || app.mode === 'intro') snd.heart(danger);
    }
    // 심장이 갑자기 빨라지면 남은 시간이 한 박보다 길어져 값이 터진다. 한 박 안으로 묶는다
    app.heartT = Math.min(app.heartT, period);
    const ph = clamp(1 - app.heartT / period, 0, 1);
    pulse = Math.exp(-ph * 9) + Math.exp(-Math.max(0, ph - 0.28) * 10) * 0.65 * (ph > 0.28 ? 1 : 0);
    pulse *= danger;
  }
  // 내 숨소리
  app.breathT -= realDt;
  if (app.breathT <= 0 && tired > 0.3 && app.mode === 'fight') {
    app.breathIn = !app.breathIn;
    app.breathT = (app.breathIn ? 0.42 : 0.5) - tired * 0.12;
    snd.breath(tired, app.breathIn);
  }

  // 화면 처리
  const U = post.u;
  U.flash.value = fx.flash;
  U.aberr.value = fx.aberr + (1 - hp) * 0.18 + fx.stunBlur * 0.7;
  U.radial.value = fx.radial + fx.stunBlur * 0.25;
  U.tunnel.value = clamp(0.2 + (1 - hp) * 0.5 + corner * 0.38 + closeness * 0.08, 0, 0.82); // 아무리 몰려도 상대는 보여야 한다
  U.desat.value = clamp(0.08 + (1 - hp) * 0.42 + corner * 0.12, 0, 0.6);
  U.red.value = clamp(fx.red + corner * 0.1, 0, 1);
  U.blind.value = me.blind > 0 ? clamp(me.blind / 1.2, 0, 1) : damp(U.blind.value, 0, 8, realDt);
  U.pulse.value = pulse;
  U.sway.value = fx.stunBlur * 1.4 + tired * tired * 0.5;
  U.fade.value = app.mode === 'intro' ? clamp(1 - app.intro.t * 1.6, 0, 1) : s.phase === 'rest' ? 0.55 : D * 0.18;
  U.grain.value = 0.45 + (1 - hp) * 0.7;

  updateHud(realDt);
}

// 느린 컴퓨터에서는 해상도부터, 그다음 그림자를 줄인다
function watchPerf(rawDt) {
  perf.t += rawDt;
  perf.n += 1;
  if (perf.t < 2.5) return;
  const fps = perf.n / perf.t;
  perf.t = 0;
  perf.n = 0;
  if (fps >= 42 || perf.level >= 2 || document.hidden) return;
  perf.level += 1;
  renderer.setPixelRatio(pixelRatio());
  if (perf.level === 2) world.key.castShadow = false;
  renderer.setSize(innerWidth, innerHeight, false);
  post.resize();
}

function frame(now) {
  requestAnimationFrame(frame);
  const rawDt = (now - last) / 1000;
  watchPerf(Math.min(1, rawDt));
  const realDt = Math.min(0.05, rawDt);
  last = now;
  if (app.paused && !app.net) {
    post.render(scene, camera, app.time);
    return;
  }
  app.time += realDt;
  if (app.mode === 'intro' || app.mode === 'fight' || app.mode === 'over') {
    if (app.s) fightFrame(app.mode === 'over' ? realDt * 0.5 : realDt);
  } else {
    menuFrame(realDt);
  }
  post.render(scene, camera, app.time);
}

// 폰트와 첫 프레임 준비
toHome();
// 초대 링크로 들어왔으면 바로 방에 들어간다
const roomCode = new URLSearchParams(location.search).get('r');
if (roomCode) { history.replaceState(null, '', location.pathname); joinRoom(roomCode.toUpperCase()); }
requestAnimationFrame(frame);

// 자동 테스트와 연출 확인용
window.__c = { app, keys, perf, setScheme, startFight, BOXERS, getRig, snd, post, camera, COUNT_STEP, impacts, handleEvent: (e) => handleEvent(e) };
