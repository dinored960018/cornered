// 사람 흉내 봇(반응 0.24~0.32초)과 컴퓨터를 붙여 승률을 본다. 사람이 해 본 결과를 대신하지는 않는다.
import { BOXERS } from '../js/roster.js';
import { createFight, stepFight, drainEvents } from '../js/fight.js';
import { newHumanBot, humanBotInput } from '../js/ai.js';
import { mulberry } from '../js/fight.js';

const DT = 1 / 120;
const N = Number(process.argv[2]) || 12;

function play(a, b, level, skill, seed) {
  const rng = mulberry(seed * 7 + 1);
  const bot = newHumanBot(skill, rng);
  const s = createFight({ player: a, opponent: b, level, seed });
  let i = 0;
  let maxCornerT = 0;
  while (s.phase !== 'over' && i++ < 120 * 300) {
    stepFight(s, DT, humanBotInput(bot, s, DT));
    drainEvents(s);
    if (s.pa > 2.75) maxCornerT += DT;
  }
  return { win: s.result.winner === 0, how: s.result.how, t: s.time, corner: maxCornerT, round: s.round };
}

for (const [level, skill] of [['easy', 0.35], ['normal', 0.5], ['normal', 0.75], ['hell', 0.75]]) {
  console.log(`\n== 난이도 ${level}, 봇 회피 성공률 ${skill} ==`);
  const rows = [];
  for (const b of BOXERS) {
    let w = 0, t = 0, c = 0;
    const how = {};
    for (let i = 0; i < N; i++) {
      const a = BOXERS[i % BOXERS.length];
      const r = play(a, b, level, skill, i * 13 + b.h * 100 | 0);
      if (r.win) w++;
      t += r.t; c += r.corner;
      how[r.how] = (how[r.how] || 0) + 1;
    }
    rows.push(`${b.name.padEnd(6, '　')} 사람승 ${String(Math.round(w / N * 100)).padStart(3)}%  평균 ${Math.round(t / N)}초  코너 ${Math.round(c / N)}초  ${JSON.stringify(how)}`);
  }
  console.log(rows.join('\n'));
}
