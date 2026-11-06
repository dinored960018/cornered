// 경기 규칙. 3D와 무관해서 노드에서 그대로 테스트할 수 있다.
// 양쪽 선수 모두 같은 입력 구조로 움직이고, 피했는지는 맞는 순간의 실제 머리 위치로 판정한다.
// head.x: 자기 기준 오른쪽이 +, head.y: 숙이면 -
import { LEVELS } from './roster.js';
import { aiInput, newAi } from './ai.js';

export const LIM = 3.45;      // 대각선 위 이동 한계. 이 너머는 코너
export const CORNER = 2.75;   // 여기부터 코너에 몰린 것
export const MIN_DIST = 0.78;
export const ROUND_TIME = 60;
export const ROUNDS = 3;
export const REST = 7;
export const COUNT_STEP = 0.85;

export const MOVES = {
  jab: { kind: 'straight', w: 0.1, t: 0.09, r: 0.15, dmg: 5, st: 3.5, reach: 1.32, stun: 0.1, kb: 0.03, chip: 0.05 },
  cross: { kind: 'straight', w: 0.17, t: 0.11, r: 0.25, dmg: 11, st: 8, reach: 1.4, stun: 0.24, kb: 0.09, chip: 0.12 },
  hook: { kind: 'hook', w: 0.21, t: 0.13, r: 0.3, dmg: 15, st: 11, reach: 1.12, stun: 0.32, kb: 0.1, chip: 0.2 },
  upper: { kind: 'upper', w: 0.24, t: 0.12, r: 0.32, dmg: 17, st: 12, reach: 1.02, stun: 0.36, kb: 0.08, chip: 0.24 },
  body: { kind: 'body', w: 0.18, t: 0.12, r: 0.26, dmg: 6, stdmg: 14, st: 8, reach: 1.14, stun: 0.13, kb: 0.06, chip: 0.5 },
  thumb: { kind: 'straight', w: 0.12, t: 0.09, r: 0.3, dmg: 3, st: 4, reach: 1.3, stun: 0.3, kb: 0, chip: 0, foul: true, blind: 2 },
  headbutt: { kind: 'straight', w: 0.16, t: 0.08, r: 0.32, dmg: 12, st: 6, reach: 1.0, stun: 0.5, kb: 0.1, chip: 0.5, foul: true },
};

const LATCH = 0.15;     // 맞기 이만큼 전에 조준이 고정된다. 이 뒤에 움직이면 피한다
const WEAVE = 0.38;
const DMG_SCALE = 0.5;

export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mkFighter(def, index, levelId) {
  const lv = levelId ? LEVELS[levelId] : null;
  const maxHp = def.hp * (lv ? lv.hp : 1);
  return {
    def, index, level: lv, maxHp, hp: maxHp, st: 100,
    head: { x: 0, y: 0, vx: 0, vy: 0 },
    guard: false, guardT: 9, stun: 0, rock: 0,
    punch: null, buf: null, queue: [], stance: def.stance,
    weaveDir: 0, weaveHold: 0, walk: 0, dash: null, stepCd: 0,
    buff: { rush: 0, sw: 0, iron: 0, gamble: 0 }, spCd: 3, blind: 0, counterT: 0,
    miracle: !!def.miracle, knockdowns: 0, fouls: 0, score: 0, thrown: 0, landed: 0, dodged: 0, combo: 0,
    tele: lv ? lv.telegraph : 1, dmgMul: lv ? lv.dmg : 1,
    ai: lv ? newAi(def, lv) : null,
  };
}

export function createFight({ player, opponent, level = 'normal', seed = 1, playerLevel = null }) {
  const s = {
    phase: 'fight', round: 1, clock: ROUND_TIME, time: 0, rest: 0,
    pa: 0.85, pb: -0.85,
    f: [mkFighter(player, 0, playerLevel), mkFighter(opponent, 1, level)],
    events: [], rng: mulberry(seed), count: null, result: null,
  };
  return s;
}

export const dist = (s) => s.pa - s.pb;
export const emptyInput = () => ({ punch: null, upgrade: null, guard: false, weave: 0, duck: false, lean: 0, step: 0, walk: 0, special: false, mash: false });
const emit = (s, e) => { s.events.push(e); };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** 앞으로(+) 뒤로(-) 움직인다. 붙으면 상대를 밀어낸다. */
export function moveFighter(s, i, d) {
  if (i === 0) {
    s.pa = Math.min(LIM, s.pa - d);
    if (s.pa - s.pb < MIN_DIST) {
      s.pb = Math.max(-LIM, s.pa - MIN_DIST);
      s.pa = s.pb + MIN_DIST;
    }
  } else {
    s.pb = Math.max(-LIM, s.pb + d);
    if (s.pa - s.pb < MIN_DIST) {
      s.pa = Math.min(LIM, s.pb + MIN_DIST);
      s.pb = s.pa - MIN_DIST;
    }
  }
}

export const cornered = (s, i) => (i === 0 ? s.pa > CORNER : s.pb < -CORNER);

export function moveFor(f, code) {
  // 앞손·뒷손 표기를 스탠스에 맞는 실제 손으로 바꾼다
  const lead = f.stance === 'orth' ? 'L' : 'R';
  const rear = lead === 'L' ? 'R' : 'L';
  switch (code) {
    case 'jab': return ['jab', lead];
    case 'cross': return ['cross', rear];
    case 'lhook': return ['hook', lead];
    case 'rhook': return ['hook', rear];
    case 'lupper': return ['upper', lead];
    case 'rupper': return ['upper', rear];
    case 'lbody': return ['body', lead];
    case 'rbody': return ['body', rear];
    default: return ['jab', lead];
  }
}

function startPunch(s, f, id, hand, opt = {}) {
  const m = MOVES[id];
  const tired = f.st < 15;
  let w = m.w * f.def.speed * f.tele * (opt.fast || 1) * (opt.windup || 1);
  if (tired) w *= 1.3;
  if (f.buff.rush > 0) w *= 0.75;
  if (f.buff.sw > 0) w *= 0.8;
  const cost = m.st * (f.buff.rush > 0 ? 0.3 : 1);
  f.st = Math.max(0, f.st - cost);
  f.punch = {
    id, hand, t: 0, w, tt: m.t, r: m.r * (tired ? 1.3 : 1) * (opt.fast ? 0.7 : 1),
    done: false, latched: false, aimX: f.index === 0 ? 0 : 0, aimY: 0, feint: !!opt.feint,
    reach: opt.reach || 0, dmg: opt.dmg || 1, lunged: 0, landed: null,
  };
  f.thrown += 1;
  emit(s, { type: 'throw', who: f.index, id, hand, feint: !!opt.feint });
}

function canAct(f) {
  if (f.stun > 0) return false;
  const p = f.punch;
  if (!p) return true;
  return p.done && p.t > p.w + p.tt + p.r * 0.35;
}

function doSpecial(s, f, foe) {
  const sp = f.def.special;
  if (f.spCd > 0 || f.stun > 0) return;
  f.spCd = sp.cd;
  emit(s, { type: 'special', who: f.index, id: sp.id, name: sp.name });
  switch (sp.id) {
    case 'rush': f.buff.rush = 3.5; break;
    case 'flicker':
      f.queue.push({ id: 'jab', opt: { fast: 0.45, reach: 0.3 } }, { id: 'jab', opt: { fast: 0.45, reach: 0.3 } }, { id: 'jab', opt: { fast: 0.45, reach: 0.3, dmg: 1.3 } });
      break;
    case 'gamble': f.buff.gamble = 7; break;
    case 'dirty': {
      const hand = f.stance === 'orth' ? 'L' : 'R';
      f.punch = null;
      if (dist(s) < 1.0) startPunch(s, f, 'headbutt', hand);
      else startPunch(s, f, 'thumb', hand);
      break;
    }
    case 'switch':
      f.stance = f.stance === 'orth' ? 'south' : 'orth';
      f.buff.sw = 2.2;
      emit(s, { type: 'stance', who: f.index, stance: f.stance });
      break;
    case 'killer': {
      const [id, hand] = moveFor(f, 'cross');
      f.punch = null;
      startPunch(s, f, id, hand, { dmg: 2.2, reach: 0.2, windup: 1.25 });
      break;
    }
    case 'iron': f.buff.iron = 4; break;
    default:
  }
  void foe;
}

function evadeTest(m, def, p, hand) {
  // 반환: { evaded, near, into } — 맞는 쪽 기준 좌표로 계산한다
  const hx = def.head.x, hy = def.head.y;
  const origin = hand === 'R' ? -1 : 1; // 공격자 오른손은 맞는 쪽 왼쪽(-)에서 온다
  switch (m.kind) {
    case 'straight': {
      const dx = Math.abs(hx - p.aimX);
      const evaded = dx > 0.2 || hy < p.aimY - 0.27;
      return { evaded, near: evaded && dx < 0.36 };
    }
    case 'hook': {
      const away = hx * -origin;
      const ducked = hy < -0.16;
      const evaded = ducked || away > 0.27;
      return { evaded, near: evaded, into: !evaded && away < -0.18 };
    }
    case 'upper': {
      const dx = Math.abs(hx - p.aimX);
      const evaded = dx > 0.2;
      return { evaded, near: evaded && dx < 0.36, into: !evaded && hy < -0.12 };
    }
    default:
      return { evaded: false, near: false };
  }
}

function resolve(s, a, d, p) {
  const m = MOVES[p.id];
  const reach = m.reach + a.def.reach + p.reach;
  const range = dist(s);
  const aSide = a.index, dSide = d.index;
  if (range > reach) {
    p.landed = 'out';
    a.combo = 0;
    emit(s, { type: 'whiff', who: aSide, id: p.id, hand: p.hand, out: true });
    return;
  }
  const res = evadeTest(m, d, p, p.hand);
  if (res.evaded) {
    p.landed = 'slip';
    a.combo = 0;
    d.dodged += 1;
    d.counterT = 0.75;
    emit(s, { type: 'slip', who: dSide, by: aSide, id: p.id, hand: p.hand, near: res.near });
    return;
  }

  // 위력 계산
  let dmg = m.dmg * DMG_SCALE * a.def.power * a.dmgMul * p.dmg;
  let crit = false, gambleResult = null, counter = false;
  if (a.buff.rush > 0) dmg *= 1.1;
  if (a.buff.sw > 0) dmg *= 1.5;
  if (a.counterT > 0 && !m.foul) { dmg *= 1.6; counter = true; a.counterT = 0; }
  if (d.punch && !d.punch.done) { dmg *= 1.35; counter = true; }
  if (res.into) dmg *= 1.3;
  if (cornered(s, dSide)) dmg *= 1.2;
  if (a.def.crit && s.rng() < a.def.crit) { dmg *= 2; crit = true; }
  if (a.buff.gamble > 0) {
    a.buff.gamble = 0;
    if (s.rng() < 0.35) { dmg *= 3.5; gambleResult = 'win'; } else { dmg *= 0.25; gambleResult = 'lose'; }
  }
  if (d.buff.iron > 0) dmg *= 0.6;
  dmg *= d.def.armor;

  // 가드
  const guardBreak = d.guard && d.st <= 0;
  if (d.guard && !guardBreak && d.stun <= 0) {
    if (d.guardT < 0.13 && m.kind !== 'body') {
      p.landed = 'parry';
      a.stun = Math.max(a.stun, 0.34);
      d.counterT = 0.75;
      a.combo = 0;
      if (a.punch === p) p.r = 0.05;
      emit(s, { type: 'parry', who: dSide, by: aSide, id: p.id, hand: p.hand });
      return;
    }
    const chip = dmg * m.chip;
    d.hp = Math.max(1, d.hp - chip);
    d.st = Math.max(0, d.st - (dmg * 0.55 + 2));
    p.landed = 'block';
    a.combo = 0;
    moveFighter(s, aSide, -0);
    knock(s, dSide, m.kb * 0.5);
    emit(s, { type: 'block', who: dSide, by: aSide, id: p.id, hand: p.hand, dmg: chip });
    if (d.st <= 0) {
      d.stun = 0.7;
      d.guard = false;
      emit(s, { type: 'guardbreak', who: dSide });
    }
    return;
  }

  // 명중
  p.landed = 'hit';
  d.hp -= dmg;
  if (m.stdmg) d.st = Math.max(0, d.st - m.stdmg * a.def.power);
  a.landed += 1;
  a.combo += 1;
  a.score += dmg;
  d.rock += dmg;
  const light = p.id === 'jab' || p.id === 'body';
  const armored = d.buff.iron > 0 || (d.def.noFlinch && light);
  if (!armored) {
    d.stun = Math.max(d.stun, m.stun * clamp(dmg / (m.dmg * DMG_SCALE), 0.6, 1.8) * (d.ai ? 0.6 : 1));
    // 컴퓨터는 잽 정도로는 공격이 끊기지 않는다. 그래야 계속 밀고 들어온다
    if (d.punch && !d.punch.done && !(d.ai && light)) d.punch = null;
    knock(s, dSide, m.kb * (dmg / m.dmg));
  }
  if (m.blind) d.blind = m.blind;
  emit(s, {
    type: 'hit', who: dSide, by: aSide, id: p.id, hand: p.hand, dmg, counter, crit, gamble: gambleResult,
    combo: a.combo, big: dmg >= 9, kind: m.kind,
  });
  if (m.foul) {
    a.fouls += 1;
    const pen = a.fouls % 3 === 0;
    if (pen) a.score -= 30;
    emit(s, { type: 'foul', who: aSide, count: a.fouls, penalty: pen });
  }
  if (d.rock > 20 + d.maxHp * 0.05 && !d.buff.iron) {
    d.rock = 0;
    d.stun = Math.max(d.stun, d.ai ? 1.05 : 0.8);
    d.punch = null;
    d.queue.length = 0;
    emit(s, { type: 'rocked', who: dSide });
  }
  if (d.hp <= 0) {
    if (d.miracle) {
      d.miracle = false;
      d.hp = 1;
      emit(s, { type: 'miracle', who: dSide });
    } else {
      d.hp = 0;
      knockdown(s, dSide, aSide, p.id);
    }
  }
}

function knock(s, i, amt) {
  if (i === 0) s.pa = Math.min(LIM, s.pa + amt);
  else s.pb = Math.max(-LIM, s.pb - amt);
}

function knockdown(s, who, by) {
  const f = s.f[who];
  f.knockdowns += 1;
  f.punch = null; f.queue.length = 0; f.guard = false; f.stun = 0; f.rock = 0; f.buf = null;
  s.f[by].score += 40;
  s.f[by].punch = null; s.f[by].queue.length = 0;
  emit(s, { type: 'down', who, by, n: f.knockdowns });
  if (f.knockdowns >= 3) {
    finish(s, by, 'TKO');
    return;
  }
  s.phase = 'count';
  // 일어날 박자: 컴퓨터는 미리 정해 두고, 사람은 연타로 게이지를 채운다
  const lv = f.level;
  let riseAt = 99;
  if (lv) {
    const fail = s.rng() < (f.knockdowns === 2 ? 0.25 : 0.05) * (lv === LEVELS.hell ? 0.4 : 1);
    riseAt = fail ? 99 : 3.5 + s.rng() * 4.5 + f.knockdowns;
  }
  s.count = { who, t: 0, n: 0, fill: 0, need: 9 + f.knockdowns * 5, riseAt };
}

function finish(s, winner, how) {
  s.phase = 'over';
  s.result = { winner, how };
  emit(s, { type: 'over', winner, how });
}

export function updateHead(s, f, inp, dt) {
  const corner = cornered(s, f.index);
  const reachW = WEAVE * f.def.weave * (corner ? 0.82 : 1);
  const tx = inp.weave * reachW + clamp(inp.lean, -1, 1) * 0.13;
  const ty = inp.duck ? -0.3 : 0;
  let k = 300 * f.def.weave;
  if (f.st < 15) k *= 0.5;
  if (f.stun > 0) k *= 0.3;
  const c = 2 * Math.sqrt(k);
  const h = f.head;
  h.vx += ((tx - h.x) * k - h.vx * c) * dt;
  h.vy += ((ty - h.y) * k - h.vy * c) * dt;
  h.x += h.vx * dt;
  h.y += h.vy * dt;
}

function tickFighter(s, f, foe, inp, dt) {
  // 타이머
  for (const k of Object.keys(f.buff)) if (f.buff[k] > 0) f.buff[k] = Math.max(0, f.buff[k] - dt);
  f.stun = Math.max(0, f.stun - dt);
  f.spCd = Math.max(0, f.spCd - dt);
  f.blind = Math.max(0, f.blind - dt);
  f.counterT = Math.max(0, f.counterT - dt);
  f.stepCd = Math.max(0, f.stepCd - dt);
  f.rock = Math.max(0, f.rock - 6 * dt);

  // 스태미나
  let regen = 13 * f.def.regen;
  if (f.guard) regen *= 0.45;
  if (f.punch) regen *= 0.35;
  f.st = Math.min(100, f.st + regen * dt);

  // 가드
  // 주먹이 나가는 동안에는 막을 수 없다
  const wantGuard = inp.guard && f.stun <= 0 && f.st > 0 && !(f.punch && !f.punch.done);
  if (wantGuard && !f.guard) f.guardT = 0;
  f.guard = wantGuard;
  if (f.guard) f.guardT += dt; else f.guardT = 9;

  // 위빙은 누를 때 스태미나를 쓴다
  if (inp.weave !== 0 && inp.weave !== f.weaveDir && f.stun <= 0) f.st = Math.max(0, f.st - 3.5);
  f.weaveDir = f.stun > 0 ? 0 : inp.weave;
  updateHead(s, f, f.stun > 0 ? { weave: 0, lean: 0, duck: false } : inp, dt);

  // 이동
  if (f.stun <= 0) {
    if (inp.walk) moveFighter(s, f.index, inp.walk * 0.85 * f.def.foot * dt * (f.buff.iron > 0 ? 1.25 : 1));
    if (inp.step && f.stepCd <= 0 && f.st > 3 && !(inp.step < 0 && cornered(s, f.index))) {
      f.dash = { v: inp.step * 2.6 * f.def.foot, t: 0.17 };
      f.stepCd = 0.42;
      f.st = Math.max(0, f.st - 5);
      emit(s, { type: 'step', who: f.index, dir: inp.step });
    }
  }
  if (f.dash) {
    moveFighter(s, f.index, f.dash.v * dt);
    f.dash.t -= dt;
    if (f.dash.t <= 0) f.dash = null;
  }

  // 필살기
  if (inp.special) doSpecial(s, f, foe);

  // 펀치 입력 (바쁘면 잠깐 버퍼에 둔다)
  if (inp.punch) f.buf = { ...inp.punch, ttl: 0.18 };
  if (inp.upgrade && f.punch && !f.punch.done && f.punch.t < 0.08 && (f.punch.id === 'jab' || f.punch.id === 'cross')) {
    const nid = inp.upgrade;
    const m = MOVES[nid];
    f.punch.id = nid;
    f.punch.w = m.w * f.def.speed * f.tele * (f.buff.rush > 0 ? 0.75 : 1);
    f.punch.tt = m.t;
    f.punch.r = m.r;
    f.st = Math.max(0, f.st - 3);
    emit(s, { type: 'upgrade', who: f.index, id: nid });
  }
  if (f.buf) {
    f.buf.ttl -= dt;
    if (f.buf.ttl <= 0) f.buf = null;
  }
  if (canAct(f)) {
    if (f.queue.length) {
      const q = f.queue.shift();
      const [id, hand] = moveFor(f, q.id);
      f.punch = null;
      startPunch(s, f, id, hand, q.opt);
    } else if (f.buf) {
      const b = f.buf;
      f.buf = null;
      f.punch = null;
      let id;
      if (b.id) id = b.id;
      else if (b.mod) id = b.mod;
      else id = (f.stance === 'orth') === (b.hand === 'L') ? 'jab' : 'cross';
      startPunch(s, f, id, b.hand, b.opt || {});
    }
  }

  // 펀치 진행
  const p = f.punch;
  if (p) {
    p.t += dt;
    const m = MOVES[p.id];
    if (p.feint && p.t >= p.w * 0.62) {
      f.punch = null;
      f.st = Math.min(100, f.st + m.st * 0.7);
      return;
    }
    if (!p.latched && p.t >= p.w + p.tt - LATCH) {
      p.latched = true;
      p.aimX = foe.head.x;
      p.aimY = foe.head.y;
    }
    // 멀면 파고들며 때린다
    const reach = m.reach + f.def.reach + p.reach;
    if (!p.done && p.id !== 'jab' && dist(s) > reach - 0.1 && p.lunged < 0.36) {
      const adv = 1.7 * dt;
      p.lunged += adv;
      moveFighter(s, f.index, adv);
    }
    if (!p.done && p.t >= p.w + p.tt) {
      p.done = true;
      resolve(s, f, foe, p);
      if (s.phase !== 'fight') return;
    }
    if (f.punch && p.t >= p.w + p.tt + p.r) f.punch = null;
  }
}

function endRound(s) {
  const [a, b] = s.f;
  emit(s, { type: 'bell', end: true, round: s.round });
  if (s.round >= ROUNDS) {
    const winner = a.score === b.score ? (a.hp >= b.hp ? 0 : 1) : a.score > b.score ? 0 : 1;
    finish(s, winner, '판정');
    return;
  }
  s.phase = 'rest';
  s.rest = REST;
}

function nextRound(s) {
  s.round += 1;
  s.clock = ROUND_TIME;
  s.phase = 'fight';
  s.pa = 0.85;
  s.pb = -0.85;
  for (const f of s.f) {
    f.hp = Math.min(f.maxHp, f.hp + f.maxHp * 0.16);
    f.st = 100;
    f.stun = 0; f.rock = 0; f.punch = null; f.queue.length = 0; f.buf = null; f.counterT = 0; f.blind = 0;
    f.spCd = Math.min(f.spCd, 3);
  }
  emit(s, { type: 'bell', end: false, round: s.round });
}

function tickCount(s, inputs, dt) {
  const c = s.count;
  const f = s.f[c.who];
  const prev = c.n;
  c.t += dt;
  c.n = Math.min(10, Math.floor(c.t / COUNT_STEP) + 1);
  if (c.n !== prev) emit(s, { type: 'count', n: c.n, who: c.who });
  if (f.ai) {
    if (c.n >= c.riseAt) rise(s, c);
  } else {
    c.fill = Math.max(0, c.fill - 1.2 * dt);
    c.fill += Number(inputs[c.who].mash);
    if (c.fill >= c.need) { rise(s, c); return; }
  }
  if (s.phase === 'count' && c.t >= COUNT_STEP * 10) {
    finish(s, 1 - c.who, 'KO');
  }
}

function rise(s, c) {
  const f = s.f[c.who];
  f.hp = f.maxHp * Math.max(0.25, 0.68 - f.knockdowns * 0.14);
  f.st = Math.max(f.st, 65);
  f.stun = 0;
  s.phase = 'fight';
  if (dist(s) < 1.5) {
    // 일으켜 세운 뒤 다시 거리를 벌려 준다
    const gap = 1.5 - dist(s);
    if (c.who === 0) s.pb = Math.max(-LIM, s.pb - gap);
    else s.pa = Math.min(LIM, s.pa + gap);
    if (s.pa - s.pb < 1.2) { s.pa = Math.min(LIM, s.pb + 1.5); s.pb = s.pa - 1.5; }
  }
  s.count = null;
  emit(s, { type: 'rise', who: c.who });
}

/** dt초 진행. input0·input1은 사람 입력(온라인이면 둘 다 사람). ai가 있는 쪽은 ai가 움직인다. */
export function stepFight(s, dt, input0, input1) {
  s.time += dt;
  const blank = emptyInput();
  const i0 = s.f[0].ai ? aiInput(s, s.f[0], s.f[1], dt) : input0 || blank;
  if (s.phase === 'fight') {
    const i1 = s.f[1].ai ? aiInput(s, s.f[1], s.f[0], dt) : input1 || blank;
    s.clock -= dt;
    tickFighter(s, s.f[0], s.f[1], i0, dt);
    if (s.phase === 'fight') tickFighter(s, s.f[1], s.f[0], i1, dt);
    if (s.phase === 'fight' && s.clock <= 0) { s.clock = 0; endRound(s); }
  } else if (s.phase === 'count') {
    tickCount(s, [i0, s.f[1].ai ? blank : input1 || blank], dt);
  } else if (s.phase === 'rest') {
    s.rest -= dt;
    if (s.rest <= 0) nextRound(s);
  }
}

export function drainEvents(s) {
  const e = s.events;
  s.events = [];
  return e;
}
