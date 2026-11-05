// 컴퓨터 복서. 사람과 같은 입력 구조를 내놓는다.
// 기본 행동은 "계속 걸어 들어와서 코너로 민다". 가끔 멈춰 서서 노려보는 것도 압박의 일부다.

export function newAi(def, level) {
  return {
    next: 1.0 + Math.random() * 0.4,
    combo: [], comboGap: 0,
    defend: null, seen: null,
    stare: 0, stareCd: 8 + Math.random() * 6,
    swayT: Math.random() * 10,
    level,
    specialT: 8 + Math.random() * 8,
    weaveTimer: 0,
  };
}

function pickCombo(s, def) {
  const list = def.ai.combos;
  let total = 0;
  for (const c of list) total += c[1];
  let r = s.rng() * total;
  for (const c of list) { r -= c[1]; if (r <= 0) return c[0]; }
  return list[0][0];
}

function planDefense(s, me, foe) {
  const p = foe.punch;
  const kind = p.id === 'jab' || p.id === 'cross' || p.id === 'thumb' || p.id === 'headbutt' ? 'straight' : p.id;
  const side = s.rng() < 0.5 ? -1 : 1;
  const roll = s.rng();
  if (kind === 'straight') {
    if (roll < 0.55) return { weave: side, dur: 0.34 };
    return { guard: true, dur: 0.34 };
  }
  if (kind === 'hook') {
    if (roll < 0.45) return { duck: true, dur: 0.38 };
    return { guard: true, dur: 0.4 };
  }
  if (kind === 'upper') {
    if (roll < 0.6) return { weave: side, dur: 0.36 };
    return { guard: true, dur: 0.4 };
  }
  // 몸통
  return { guard: true, dur: 0.34 };
}

export function aiInput(s, me, foe, dt) {
  const a = me.ai;
  const def = me.def;
  const lv = a.level;
  const inp = { punch: null, upgrade: null, guard: false, weave: 0, duck: false, lean: 0, step: 0, walk: 0, special: false, mash: false };
  const d = s.pa - s.pb;
  const aggro = lv.aggro * def.ai.aggro;
  const hpFrac = foe.hp / foe.maxHp;
  const iAmHurt = me.hp / me.maxHp < 0.3;

  a.swayT += dt;
  if (def.ai.sway) inp.lean = Math.sin(a.swayT * 1.7) * 0.9;
  else inp.lean = Math.sin(a.swayT * 1.1) * 0.35;

  // 방어 판단: 상대 펀치가 시작되면 한 번만 굴린다
  const fp = foe.punch;
  if (fp && fp !== a.seen) {
    a.seen = fp;
    const chance = me.blind > 0 ? 0 : lv.react * def.ai.defense * (me.st < 15 ? 0.4 : 1);
    if (s.rng() < chance && !fp.feint) {
      a.defend = { ...planDefense(s, me, foe), wait: lv.delay * (0.7 + s.rng() * 0.6) };
      a.defend.dur += a.defend.wait;
    }
  }
  if (a.defend) {
    const df = a.defend;
    df.wait -= dt;
    df.dur -= dt;
    if (df.wait <= 0) {
      if (df.weave) inp.weave = df.weave;
      if (df.duck) inp.duck = true;
      if (df.guard) inp.guard = true;
    }
    if (df.dur <= 0) a.defend = null;
  }

  // 지치고 맞았으면 틀어막는다
  if (iAmHurt && !me.punch && s.rng() < 0.02) a.defend = { guard: true, wait: 0, dur: 0.6 };

  // 노려보기
  a.stareCd -= dt;
  if (a.stareCd <= 0 && a.stare <= 0 && !me.punch && !a.combo.length) {
    a.stare = 0.9 + s.rng() * 1.3;
    a.stareCd = 9 + s.rng() * 9;
    s.events.push({ type: 'stare', who: me.index });
  }
  a.stare = Math.max(0, a.stare - dt);

  // 거리
  const range = def.ai.range;
  if (d > range + 0.06) inp.walk = 1;
  else if (d < range - 0.14 && def.ai.range > 1.25) inp.walk = -1; // 아웃복서는 붙으면 뺀다
  else if (def.ai.range <= 1.1 || foe.hp / foe.maxHp < 0.5) inp.walk = 0.65; // 가까우면 그대로 밀고 들어온다
  if (a.stare > 0) inp.walk = Math.max(inp.walk, 0.45);
  if (def.ai.range > 1.25 && d < 1.05 && me.stepCd <= 0 && s.rng() < 0.05) inp.step = -1;
  if (me.buff.iron > 0 || me.buff.rush > 0) inp.walk = 1;
  // 코너에 몰리면 빠져나오려고 한다
  if (s.pb < -2.8 && me.index === 1 && !me.punch && s.rng() < 0.04) inp.step = 1;

  // 공격
  a.next -= dt * (a.stare > 0 ? 0 : 1);
  a.comboGap -= dt;
  const inRange = d < range + 0.28;
  if (a.combo.length) {
    if (!me.punch && a.comboGap <= 0 && me.stun <= 0) {
      const code = a.combo.shift();
      inp.punch = codeToPunch(me, code);
      a.comboGap = 0.04;
    }
  } else if (a.next <= 0 && inRange && me.st > 14 && me.stun <= 0 && !me.punch) {
    a.combo = pickCombo(s, def).slice();
    // 상대가 지쳤거나 코너면 콤보가 길어진다
    if (hpFrac < 0.4 && s.rng() < 0.4) a.combo = a.combo.concat(pickCombo(s, def));
    const [lo, hi] = def.ai.gap;
    const corner = s.pa > 2.75 ? 0.65 : 1;
    a.next = (lo + s.rng() * (hi - lo)) * corner / Math.max(0.3, aggro) + a.combo.length * 0.3;
    if (s.rng() < (def.ai.feint || 0)) {
      inp.punch = { ...codeToPunch(me, a.combo[0]), opt: { feint: true } };
      a.comboGap = 0.05;
      a.next = 0.25;
      a.combo = [];
    }
  }

  // 필살기
  a.specialT -= dt;
  if (a.specialT <= 0 && me.spCd <= 0 && !me.punch && me.stun <= 0 && inRange) {
    const want = def.ai.special ?? 0.5;
    a.specialT = 3 + s.rng() * 6;
    if (s.rng() < want * lv.aggro) inp.special = true;
  }

  return inp;
}

function codeToPunch(me, code) {
  const lead = me.stance === 'orth' ? 'L' : 'R';
  const rear = lead === 'L' ? 'R' : 'L';
  switch (code) {
    case 'jab': return { id: 'jab', hand: lead };
    case 'cross': return { id: 'cross', hand: rear };
    case 'lhook': return { id: 'hook', hand: lead };
    case 'rhook': return { id: 'hook', hand: rear };
    case 'lupper': return { id: 'upper', hand: lead };
    case 'rupper': return { id: 'upper', hand: rear };
    case 'lbody': return { id: 'body', hand: lead };
    case 'rbody': return { id: 'body', hand: rear };
    default: return { id: 'jab', hand: lead };
  }
}

/**
 * 밸런스 시험용 "사람 흉내" 봇. 반응 시간이 있고, 가끔 놓친다.
 * skill 0~1: 1에 가까울수록 잘 피한다.
 */
export function newHumanBot(skill, rng) {
  return { skill, rng, seen: null, plan: null, next: 0.5 };
}
export function humanBotInput(bot, s, dt) {
  const me = s.f[0], foe = s.f[1];
  const inp = { punch: null, upgrade: null, guard: false, weave: 0, duck: false, lean: 0, step: 0, walk: 0, special: false, mash: false };
  const d = s.pa - s.pb;
  if (s.phase === 'count') {
    bot.mashT = (bot.mashT || 0) - dt;
    if (bot.mashT <= 0) { inp.mash = true; bot.mashT = 0.11 + bot.rng() * 0.06; }
    return inp;
  }
  const fp = foe.punch;
  if (fp && fp !== bot.seen) {
    bot.seen = fp;
    if (bot.rng() < bot.skill && !fp.feint) {
      const hook = fp.id === 'hook';
      const body = fp.id === 'body';
      const side = bot.rng() < 0.5 ? -1 : 1;
      const useGuard = bot.rng() < 0.3 || body;
      bot.plan = { wait: 0.24 + bot.rng() * 0.08, dur: 0.75, weave: !useGuard && !hook ? side : 0, duck: !useGuard && hook, guard: useGuard };
    }
  }
  if (bot.plan) {
    const pl = bot.plan;
    pl.wait -= dt; pl.dur -= dt;
    if (pl.wait <= 0) {
      inp.weave = pl.weave; inp.duck = pl.duck; inp.guard = pl.guard;
    }
    if (pl.dur <= 0) bot.plan = null;
  }
  bot.next -= dt;
  if (bot.next <= 0 && !me.punch && me.st > 15) {
    bot.next = 0.35 + bot.rng() * 0.6;
    if (d > 1.3) inp.step = 1;
    else {
      const r = bot.rng();
      const hand = bot.rng() < 0.5 ? 'L' : 'R';
      inp.punch = { hand, mod: r < 0.55 ? null : r < 0.8 ? 'hook' : r < 0.92 ? 'upper' : 'body' };
    }
  }
  if (me.spCd <= 0 && bot.rng() < 0.01) inp.special = true;
  if (s.pa > 2.6 && bot.rng() < 0.02) inp.step = 1;
  return inp;
}
