// 복서 7명. 수치(스탯) + 생김새(look) + 컴퓨터가 잡을 때의 성향(ai)
// speed: 작을수록 펀치 예비동작이 짧다. reach: 기본 리치에 더해지는 미터.

export const LEVELS = {
  easy: { name: '연습', telegraph: 2.5, react: 0.14, delay: 0.34, aggro: 0.8, dmg: 0.85, hp: 0.9 },
  normal: { name: '시합', telegraph: 1.8, react: 0.36, delay: 0.22, aggro: 1.15, dmg: 1.15, hp: 1.1 },
  hell: { name: '지옥', telegraph: 1.45, react: 0.5, delay: 0.17, aggro: 1.35, dmg: 1.3, hp: 1.2 },
};

export const BOXERS = [
  {
    id: 'infighter', name: '인파이터', nick: '불도저', h: 1.72,
    blurb: '품 안으로 파고들어 쉬지 않고 때린다. 리치는 짧고 한 방 한 방이 무겁다.',
    hp: 105, power: 1.1, speed: 0.92, reach: -0.06, weave: 1.1, foot: 1.12, regen: 1.1, armor: 1,
    stance: 'orth',
    special: { id: 'rush', name: '러시', cd: 18, desc: '3.5초 동안 펀치가 빨라지고 스태미나를 거의 안 쓴다' },
    bars: { 파워: 4, 속도: 4, 리치: 1, 맷집: 4, 회피: 3 },
    look: {
      skin: 0xb9805a, trunks: 0xb51d1d, trim: 0xf4efe6, glove: [0xc41e1e, 0xc41e1e], hair: 'buzz', hairColor: 0x15110e,
      shoulder: 1.1, chest: 1.1, waist: 1.02, arm: 1.16, armLen: 0.92, neck: 1.2, jaw: 1.08, brow: 1.1,
    },
    ai: {
      range: 0.9, aggro: 1.35, crouch: 0.13, lean: 0.24, defense: 0.8, feint: 0.08, gap: [0.45, 1.0],
      combos: [[['jab', 'lhook', 'rhook'], 3], [['lbody', 'rbody', 'lhook'], 3], [['rbody', 'lupper', 'rhook'], 2], [['jab', 'cross', 'lhook', 'rhook'], 2], [['lhook', 'rhook', 'lhook'], 2]],
    },
    taunts: ['어디 가', '도망갈 데 없어', '더 붙어 봐', '숨 차냐?'],
  },
  {
    id: 'outboxer', name: '아웃복서', nick: '줄자', h: 1.93,
    blurb: '긴 팔로 닿지 않는 곳에서 찌른다. 쫓아가면 없고, 멈추면 맞는다.',
    hp: 88, power: 0.88, speed: 0.85, reach: 0.26, weave: 1.16, foot: 1.36, regen: 1.15, armor: 1,
    stance: 'orth',
    special: { id: 'flicker', name: '플리커 잽', cd: 12, desc: '먼 거리에서 초고속 잽 3연타' },
    bars: { 파워: 2, 속도: 5, 리치: 5, 맷집: 2, 회피: 5 },
    look: {
      skin: 0x6e4630, trunks: 0x1b4fa8, trim: 0xf4efe6, glove: [0xe9e6de, 0xe9e6de], hair: 'slick', hairColor: 0x0d0b0a,
      shoulder: 0.94, chest: 0.86, waist: 0.84, arm: 0.84, armLen: 1.14, neck: 0.86, jaw: 0.94, brow: 0.9,
    },
    ai: {
      range: 1.42, aggro: 0.95, crouch: 0.03, lean: 0.05, defense: 1.3, feint: 0.16, gap: [0.5, 1.2], lowGuard: true,
      combos: [[['jab'], 4], [['jab', 'jab'], 4], [['jab', 'jab', 'cross'], 3], [['jab', 'cross'], 2]],
    },
    taunts: ['안 닿지?', '거기 서 있어', '느려', '한 대만 더'],
  },
  {
    id: 'lucky', name: '행운복서', nick: '로또', h: 1.76,
    blurb: '폼은 엉망인데 이상하게 터진다. 가끔 터무니없는 한 방이 들어오고, 죽어도 한 번은 안 죽는다.',
    hp: 95, power: 0.86, speed: 1.04, reach: 0, weave: 1, foot: 1, regen: 1, armor: 1, crit: 0.14, miracle: true,
    stance: 'orth',
    special: { id: 'gamble', name: '한 방 도박', cd: 14, desc: '다음 펀치 35%로 3.5배, 65%로 0.25배' },
    bars: { 파워: 2, 속도: 3, 리치: 3, 맷집: 3, 회피: 3, 운: 5 },
    look: {
      skin: 0xe2b48e, trunks: 0xd9a21b, trim: 0x1d7a3e, glove: [0x1d8a45, 0xd9a21b], hair: 'curly', hairColor: 0x7a3a15,
      shoulder: 0.98, chest: 0.94, waist: 1.02, arm: 0.94, armLen: 1, neck: 0.94, jaw: 0.96, brow: 0.86, belly: 0.012,
    },
    ai: {
      range: 1.08, aggro: 0.95, crouch: 0.06, lean: 0.1, defense: 0.75, feint: 0.05, gap: [0.45, 1.5], sway: 1,
      combos: [[['cross'], 3], [['rhook'], 3], [['lupper'], 2], [['jab', 'rhook'], 2], [['rupper', 'lhook'], 2], [['lhook', 'lhook', 'cross'], 1]],
    },
    taunts: ['어? 맞았네?', '오늘 왠지 될 것 같은데', '나도 몰라', '한 번만 더 찍어 볼까'],
  },
  {
    id: 'dirty', name: '더티복서', nick: '미친개', h: 1.82,
    blurb: '눈 찌르고, 박치기하고, 낮게 때린다. 경고 세 번이면 감점인데 신경도 안 쓴다.',
    hp: 100, power: 1, speed: 0.96, reach: 0, weave: 1, foot: 1.04, regen: 1, armor: 1,
    stance: 'orth',
    special: { id: 'dirty', name: '반칙', cd: 12, desc: '붙으면 박치기, 떨어지면 눈 찌르기. 맞은 쪽은 2초간 눈이 먼다' },
    bars: { 파워: 3, 속도: 3, 리치: 3, 맷집: 3, 회피: 3, 반칙: 5 },
    look: {
      skin: 0xc79a7c, trunks: 0x17151c, trim: 0x7e2bb5, glove: [0x25222c, 0x25222c], hair: 'bald', hairColor: 0x111111,
      shoulder: 1.02, chest: 1, waist: 0.96, arm: 1.02, armLen: 1, neck: 1.1, jaw: 1.06, brow: 1.16, scar: true, tattoo: true, stubble: true,
    },
    ai: {
      range: 1.02, aggro: 1.1, crouch: 0.08, lean: 0.16, defense: 1, feint: 0.28, gap: [0.45, 1.15], special: 0.6,
      combos: [[['jab', 'lbody'], 3], [['lbody', 'lhook'], 3], [['cross', 'rbody'], 2], [['jab', 'cross', 'lhook'], 2], [['rbody', 'rbody', 'rhook'], 2]],
    },
    taunts: ['심판 안 본다', '눈 괜찮아?', '울어 봐', '이게 복싱이야'],
  },
  {
    id: 'switch', name: '스위치복서', nick: '거울', h: 1.8,
    blurb: '경기 중에 왼손잡이와 오른손잡이를 오간다. 익숙해질 만하면 바뀌고, 바꾼 직후가 가장 세다.',
    hp: 95, power: 0.98, speed: 0.92, reach: 0.02, weave: 1.08, foot: 1.1, regen: 1, armor: 1,
    stance: 'orth',
    special: { id: 'switch', name: '스탠스 체인지', cd: 6, desc: '스탠스를 바꾸고 2.2초 동안 위력 1.5배' },
    bars: { 파워: 3, 속도: 4, 리치: 3, 맷집: 2, 회피: 4 },
    look: {
      skin: 0x9c6c4a, trunks: 0x0f8a86, trim: 0xe8641b, trunks2: 0xe8641b, glove: [0x0f9a95, 0xe8641b], hair: 'mohawk', hairColor: 0xe8641b,
      shoulder: 1, chest: 0.96, waist: 0.92, arm: 0.98, armLen: 1.02, neck: 0.98, jaw: 0.98, brow: 1,
    },
    ai: {
      range: 1.14, aggro: 1, crouch: 0.07, lean: 0.12, defense: 1.1, feint: 0.2, gap: [0.45, 1.15], special: 1,
      combos: [[['jab', 'cross'], 3], [['cross', 'lhook'], 3], [['jab', 'rupper'], 2], [['lbody', 'cross'], 2], [['jab', 'jab', 'rhook'], 2]],
    },
    taunts: ['이번엔 어느 손일까', '방금 건 연습', '봤어? 못 봤지', '바꿨다'],
  },
  {
    id: 'southpaw', name: '사우스포', nick: '왼손의 악마', h: 1.84,
    blurb: '왼손이 주먹이다. 평소 보던 방향의 반대에서 스트레이트가 날아온다.',
    hp: 100, power: 1.02, speed: 0.95, reach: 0.06, weave: 1, foot: 1.02, regen: 1, armor: 1,
    stance: 'south',
    special: { id: 'killer', name: '킬러 레프트', cd: 14, desc: '멀리서 꽂는 왼손 스트레이트. 위력 2.2배' },
    bars: { 파워: 4, 속도: 3, 리치: 4, 맷집: 3, 회피: 3 },
    look: {
      skin: 0xd9a884, trunks: 0x0e6b3a, trim: 0xf4efe6, glove: [0x16a34a, 0x0b0f0d], hair: 'band', hairColor: 0x1a1512,
      shoulder: 1, chest: 0.98, waist: 0.92, arm: 1, armLen: 1.06, neck: 1, jaw: 1, brow: 1.02,
    },
    ai: {
      range: 1.2, aggro: 1, crouch: 0.06, lean: 0.12, defense: 1, feint: 0.14, gap: [0.55, 1.25], special: 0.8,
      combos: [[['cross'], 4], [['jab', 'cross'], 4], [['jab', 'jab', 'cross'], 2], [['cross', 'lhook'], 2], [['rbody', 'cross'], 2]],
    },
    taunts: ['왼손 조심해', '오른손은 그냥 재는 거야', '방향이 다르지?', '또 왼손'],
  },
  {
    id: 'tank', name: '탱크복서', nick: '철벽', h: 2.06,
    blurb: '맞아도 멈추지 않고 걸어온다. 느리지만 잽 정도로는 꿈쩍도 안 하고, 코너에 몰리면 끝이다.',
    hp: 150, power: 1.2, speed: 1.3, reach: 0.04, weave: 0.72, foot: 0.82, regen: 0.8, armor: 0.88, noFlinch: true,
    stance: 'orth',
    special: { id: 'iron', name: '아이언 바디', cd: 18, desc: '4초 동안 경직 없이 걸어 들어가고 피해 40% 감소' },
    bars: { 파워: 5, 속도: 1, 리치: 3, 맷집: 5, 회피: 1 },
    look: {
      skin: 0x8f6448, trunks: 0x34363c, trim: 0xb8232a, glove: [0x3a3c44, 0x3a3c44], hair: 'bald', hairColor: 0x15120f,
      shoulder: 1.26, chest: 1.3, waist: 1.34, arm: 1.34, armLen: 0.98, neck: 1.42, jaw: 1.2, brow: 1.2, belly: 0.03, beard: true,
    },
    ai: {
      range: 1.0, aggro: 1.1, crouch: 0.02, lean: 0.14, defense: 0.42, feint: 0, gap: [0.75, 1.5], special: 0.7,
      combos: [[['rhook'], 3], [['jab', 'rhook'], 3], [['rupper'], 2], [['lbody', 'rhook'], 2], [['cross', 'lhook'], 2]],
    },
    taunts: ['...', '그게 다야?', '안 아파', '이리 와'],
  },
];

export const byId = (id) => BOXERS.find((b) => b.id === id);
