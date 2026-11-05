import test from 'node:test';
import assert from 'node:assert/strict';
import { BOXERS, byId } from '../js/roster.js';
import { createFight, stepFight, emptyInput, drainEvents, MOVES, ROUNDS, cornered, LIM } from '../js/fight.js';
import { newHumanBot, humanBotInput, aiInput } from '../js/ai.js';
import { mulberry } from '../js/fight.js';

const DT = 1 / 120;

// 컴퓨터가 멋대로 움직이지 않게 하고, 한 동작만 시험한다
function scene(defender = {}, moveId = 'cross', hand = 'R', playerId = 'southpaw', oppId = 'infighter') {
  const s = createFight({ player: byId(playerId), opponent: byId(oppId), level: 'normal', seed: 3 });
  s.f[1].ai.next = 999; s.f[1].ai.specialT = 999; s.f[1].ai.stareCd = 999;
  s.f[1].ai.seen = null;
  s.pa = 0.5; s.pb = -0.5;
  const events = [];
  const inp = { ...emptyInput(), ...defender };
  // 상대 펀치를 직접 시작시키기 위해 AI 콤보 큐를 쓴다
  s.f[1].queue.push({ id: codeFor(moveId, hand, s.f[1]), opt: {} });
  for (let i = 0; i < 180; i++) {
    stepFight(s, DT, inp);
    events.push(...drainEvents(s));
  }
  return { s, events };
}
function codeFor(moveId, hand, f) {
  const leadIsHand = (f.stance === 'orth') === (hand === 'L');
  if (moveId === 'jab') return 'jab';
  if (moveId === 'cross') return 'cross';
  return (leadIsHand ? 'l' : 'r') + moveId;
}
const first = (ev, type) => ev.find((e) => e.type === type);

test('복서 7명이 다 있다', () => {
  const need = ['인파이터', '아웃복서', '행운복서', '더티복서', '스위치복서', '사우스포', '탱크복서'];
  assert.deepEqual(BOXERS.map((b) => b.name), need);
  assert.equal(new Set(BOXERS.map((b) => b.special.id)).size, 7);
});

test('가만히 있으면 스트레이트를 맞는다', () => {
  const { events } = scene();
  assert.ok(first(events, 'hit'));
});

test('조준이 고정된 뒤 Q/E로 움직이면 스트레이트를 피한다', () => {
  const s = createFight({ player: byId('southpaw'), opponent: byId('infighter'), level: 'normal', seed: 3 });
  s.f[1].ai.next = 999; s.f[1].ai.specialT = 999; s.f[1].ai.stareCd = 999; s.f[1].ai.level = { ...s.f[1].ai.level };
  s.pa = 0.5; s.pb = -0.5;
  s.f[1].queue.push({ id: 'cross', opt: {} });
  const ev = [];
  for (let i = 0; i < 180; i++) {
    const p = s.f[1].punch;
    const go = p && p.latched;
    stepFight(s, DT, { ...emptyInput(), weave: go || s.f[0].weaveDir ? -1 : 0 });
    ev.push(...drainEvents(s));
  }
  assert.ok(first(ev, 'slip'), '슬립 이벤트가 나와야 함');
  assert.equal(first(ev, 'hit'), undefined);
  assert.equal(s.f[0].hp, s.f[0].maxHp);
});

test('위빙을 미리 해 두면 조준이 따라와서 맞는다', () => {
  // 먼저 왼쪽으로 빠져 있으면, 조준이 그 위치에 고정되므로 그대로 맞는다
  const s = createFight({ player: byId('southpaw'), opponent: byId('infighter'), level: 'normal', seed: 3 });
  s.f[1].ai.next = 999; s.f[1].ai.specialT = 999; s.f[1].ai.stareCd = 999;
  s.pa = 0.5; s.pb = -0.5;
  const inp = { ...emptyInput(), weave: -1 };
  for (let i = 0; i < 60; i++) stepFight(s, DT, inp);
  drainEvents(s);
  s.f[1].queue.push({ id: 'cross', opt: {} });
  const ev = [];
  for (let i = 0; i < 120; i++) { stepFight(s, DT, inp); ev.push(...drainEvents(s)); }
  assert.ok(first(ev, 'hit'), '일찍 움직이면 못 피해야 타이밍 게임이 된다');
});

test('숙이면 훅을 피하고, 어퍼는 숙이면 더 세게 맞는다', () => {
  assert.ok(first(scene({ duck: true }, 'hook', 'R').events, 'slip'));
  const plain = first(scene({}, 'upper', 'R').events, 'hit');
  const duck = first(scene({ duck: true }, 'upper', 'R').events, 'hit');
  assert.ok(duck.dmg > plain.dmg);
});

test('훅은 오는 쪽으로 파고들면 더 세고, 반대로 빠지면 피한다', () => {
  // 상대 오른손 훅은 내 왼쪽(-)에서 온다
  const into = scene({ weave: -1 }, 'hook', 'R');
  const away = scene({ weave: 1 }, 'hook', 'R');
  const plain = first(scene({}, 'hook', 'R').events, 'hit');
  assert.ok(first(into.events, 'hit').dmg > plain.dmg);
  assert.ok(first(away.events, 'slip'));
});

test('가드는 피해를 크게 줄이고 스태미나를 깎는다', () => {
  const held = createFight({ player: byId('southpaw'), opponent: byId('infighter'), level: 'normal', seed: 3 });
  held.f[1].ai.next = 999; held.f[1].ai.specialT = 999; held.f[1].ai.stareCd = 999;
  held.pa = 0.5; held.pb = -0.5;
  const inp = { ...emptyInput(), guard: true };
  for (let i = 0; i < 60; i++) stepFight(held, DT, inp);
  drainEvents(held);
  held.f[1].queue.push({ id: 'cross', opt: {} });
  const ev = [];
  for (let i = 0; i < 120; i++) { stepFight(held, DT, inp); ev.push(...drainEvents(held)); }
  const b = first(ev, 'block');
  assert.ok(b);
  assert.ok(held.f[0].maxHp - held.f[0].hp < 3);
  assert.ok(held.f[0].st < 100);
});

test('맞기 직전 가드는 패리가 된다', () => {
  const s = createFight({ player: byId('southpaw'), opponent: byId('infighter'), level: 'normal', seed: 3 });
  s.f[1].ai.next = 999; s.f[1].ai.specialT = 999; s.f[1].ai.stareCd = 999;
  s.pa = 0.5; s.pb = -0.5;
  s.f[1].queue.push({ id: 'cross', opt: {} });
  const ev = [];
  for (let i = 0; i < 180; i++) {
    const p = s.f[1].punch;
    const near = p && !p.done && p.w + p.tt - p.t < 0.06;
    stepFight(s, DT, { ...emptyInput(), guard: near || (s.f[0].guard && i < 170) });
    ev.push(...drainEvents(s));
  }
  assert.ok(first(ev, 'parry'));
  assert.equal(first(ev, 'hit'), undefined);
});

test('몸통은 위빙으로 못 피하고 스태미나를 뺏는다', () => {
  const { events } = scene({ weave: 1 }, 'body', 'R');
  const hit = first(events, 'hit');
  assert.ok(hit);
  assert.equal(hit.kind, 'body');
  assert.ok(MOVES.body.stdmg > 0);
});

test('스페이스 조합 키는 뒤늦게 눌러도 잽이 훅으로 바뀐다', () => {
  const s = createFight({ player: byId('southpaw'), opponent: byId('infighter'), level: 'normal', seed: 3 });
  s.f[1].ai.next = 999; s.f[1].ai.specialT = 999; s.f[1].ai.stareCd = 999;
  stepFight(s, DT, { ...emptyInput(), punch: { hand: 'R', mod: null } });
  assert.equal(s.f[0].punch.id, 'jab');
  stepFight(s, DT, { ...emptyInput() });
  stepFight(s, DT, { ...emptyInput(), upgrade: 'hook' });
  assert.equal(s.f[0].punch.id, 'hook');
});

test('스탠스: 오른손잡이는 왼손이 잽, 사우스포는 왼손이 스트레이트', () => {
  const a = createFight({ player: byId('infighter'), opponent: byId('tank'), level: 'easy' });
  stepFight(a, DT, { ...emptyInput(), punch: { hand: 'L', mod: null } });
  assert.equal(a.f[0].punch.id, 'jab');
  const b = createFight({ player: byId('southpaw'), opponent: byId('tank'), level: 'easy' });
  stepFight(b, DT, { ...emptyInput(), punch: { hand: 'L', mod: null } });
  assert.equal(b.f[0].punch.id, 'cross');
});

test('각 복서의 필살기가 실제로 발동한다', () => {
  for (const b of BOXERS) {
    const s = createFight({ player: b, opponent: byId('tank'), level: 'easy', seed: 5 });
    s.f[1].ai.next = 999; s.f[1].ai.specialT = 999;
    s.f[0].spCd = 0;
    s.pa = 0.45; s.pb = -0.45;
    stepFight(s, DT, { ...emptyInput(), special: true });
    const ev = drainEvents(s);
    assert.ok(first(ev, 'special'), b.name);
    assert.ok(s.f[0].spCd > 0, b.name);
  }
});

test('스위치복서는 스탠스가 뒤집히고, 더티복서는 경고를 받고 상대 눈을 멀게 한다', () => {
  const s = createFight({ player: byId('switch'), opponent: byId('tank'), level: 'easy' });
  s.f[0].spCd = 0;
  stepFight(s, DT, { ...emptyInput(), special: true });
  assert.equal(s.f[0].stance, 'south');

  const d = createFight({ player: byId('dirty'), opponent: byId('tank'), level: 'easy', seed: 2 });
  d.f[1].ai.next = 999; d.f[1].ai.specialT = 999; d.f[1].ai.seen = {}; d.f[1].ai.stareCd = 999;
  d.f[1].ai.level = { ...d.f[1].ai.level, react: 0 };
  d.f[0].spCd = 0;
  d.pa = 0.6; d.pb = -0.6;
  const ev = [];
  stepFight(d, DT, { ...emptyInput(), special: true });
  for (let i = 0; i < 80; i++) { stepFight(d, DT, emptyInput()); ev.push(...drainEvents(d)); }
  assert.ok(first(ev, 'foul'));
  assert.ok(d.f[1].blind > 0);
});

test('행운복서는 죽을 공격을 한 번 버틴다', () => {
  const s = createFight({ player: byId('lucky'), opponent: byId('tank'), level: 'normal', seed: 3 });
  s.f[1].ai.next = 999; s.f[1].ai.specialT = 999; s.f[1].ai.stareCd = 999;
  s.pa = 0.5; s.pb = -0.5;
  s.f[0].hp = 1;
  s.f[1].queue.push({ id: 'cross', opt: {} });
  const ev = [];
  for (let i = 0; i < 100; i++) { stepFight(s, DT, emptyInput()); ev.push(...drainEvents(s)); }
  assert.ok(first(ev, 'miracle'));
  assert.equal(s.phase, 'fight');
});

test('상대는 가만히 있는 사람을 코너로 몰아넣는다', () => {
  const s = createFight({ player: byId('southpaw'), opponent: byId('tank'), level: 'normal', seed: 3 });
  for (let i = 0; i < 120 * 30 && s.phase === 'fight'; i++) {
    stepFight(s, DT, { ...emptyInput(), guard: i % 240 < 200 });
    if (cornered(s, 0)) break;
    drainEvents(s);
  }
  assert.ok(s.pa > 2.75 && s.pa <= LIM, `코너까지 밀려야 함, pa=${s.pa}`);
});

test('다운되면 카운트가 돌고, 연타로 일어나며, 못 일어나면 KO', () => {
  const s = createFight({ player: byId('southpaw'), opponent: byId('tank'), level: 'normal', seed: 3 });
  s.f[1].ai.next = 999; s.f[1].ai.specialT = 999; s.f[1].ai.stareCd = 999;
  s.pa = 0.5; s.pb = -0.5;
  s.f[0].hp = 1;
  s.f[1].queue.push({ id: 'cross', opt: {} });
  for (let i = 0; i < 100 && s.phase === 'fight'; i++) stepFight(s, DT, emptyInput());
  assert.equal(s.phase, 'count');
  let t = 0;
  while (s.phase === 'count' && t < 400) { stepFight(s, DT, { ...emptyInput(), mash: t % 12 === 0 }); t++; }
  assert.equal(s.phase, 'fight');
  assert.ok(s.f[0].hp > 0);
  s.f[0].hp = 1;
  s.f[1].punch = null;
  s.pa = 0.5; s.pb = -0.5;
  s.f[1].queue.push({ id: 'cross', opt: {} });
  for (let i = 0; i < 100 && s.phase === 'fight'; i++) stepFight(s, DT, emptyInput());
  while (s.phase === 'count') stepFight(s, DT, emptyInput());
  assert.equal(s.phase, 'over');
  assert.equal(s.result.how, 'KO');
  assert.equal(s.result.winner, 1);
});

test('3라운드가 끝나면 판정이 난다', () => {
  const s = createFight({ player: byId('southpaw'), opponent: byId('tank'), level: 'easy', seed: 3 });
  s.f[1].ai.next = 1e9; s.f[1].ai.specialT = 1e9; s.f[1].ai.stareCd = 1e9;
  s.f[0].score = 5;
  let guard = 0;
  while (s.phase !== 'over' && guard++ < 120 * 300) stepFight(s, DT, emptyInput());
  assert.equal(s.round, ROUNDS);
  assert.equal(s.result.how, '판정');
  assert.equal(s.result.winner, 0);
});

test('사람 흉내 봇과 모든 복서가 끝까지 오류 없이 싸운다', () => {
  for (const a of BOXERS) for (const b of BOXERS) {
    const rng = mulberry(a.h * 100 + b.h * 7);
    const bot = newHumanBot(0.5, rng);
    const s = createFight({ player: a, opponent: b, level: 'normal', seed: Math.floor(b.h * 100) });
    let i = 0;
    while (s.phase !== 'over' && i++ < 120 * 260) { stepFight(s, DT, humanBotInput(bot, s, DT)); drainEvents(s); }
    assert.equal(s.phase, 'over', `${a.name} vs ${b.name}`);
    for (const f of s.f) {
      assert.ok(Number.isFinite(f.hp) && Number.isFinite(f.st) && Number.isFinite(f.head.x), `${a.name} vs ${b.name} 수치`);
    }
  }
});

void aiInput; void MOVES;
