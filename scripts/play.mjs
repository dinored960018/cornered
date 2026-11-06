// 실제 Chrome에서 메뉴를 눌러 경기를 시작하고, 진짜 키 입력으로 한 판 돌린다.
// BASE=<주소> SECONDS_PLAY=40 node scripts/play.mjs [출력 폴더]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const OUT = process.argv[2] || '.shots';
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE || 'http://localhost:7900/';
const SECONDS = Number(process.env.SECONDS_PLAY) || 40;
const PORT = 9377, W = 1280, H = 720;
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'corn-play-'))}`, '--headless=new', '--no-first-run',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio', `--window-size=${W},${H}`, 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 40; i++) { try { await fetch(`http://127.0.0.1:${PORT}/json/version`); break; } catch { await sleep(250); } }
const info = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(info.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 0;
const wait = new Map(), errors = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(`${m.params.entry.text} ${m.params.entry.url || ''}`);
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(`${expression}\n${r.result.exceptionDetails.exception?.description}`);
  return r.result?.result?.value;
};
const shot = async (n) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, `${n}.png`), Buffer.from(r.result.data, 'base64')); console.log('  저장', n); };
const down = (code, k, vk) => send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code, key: k, windowsVirtualKeyCode: vk });
const up = (code, k, vk) => send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: k, windowsVirtualKeyCode: vk });
const key = async (code, k, vk, hold = 40) => { await down(code, k, vk); await sleep(hold); await up(code, k, vk); };

await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Emulation.setFocusEmulationEnabled', { enabled: true });
await send('Page.navigate', { url: BASE });
for (let i = 0; i < 80; i++) { if (await ev(`!!window.__c`).catch(() => false)) break; await sleep(250); }

let fail = 0;
const seen = {};
try {
  await ev(`document.querySelector('#btnGauntlet').click()`);
  await sleep(600);
  await ev(`[...document.querySelectorAll('#selList button')][3].click()`);
  await sleep(300);
  await ev(`window.__c.setScheme('a')`);
  await ev(`document.querySelector('#selGo').click()`);
  console.log('경기 인트로', await ev(`window.__c.app.mode`));
  await sleep(1800);
  await shot('play-intro');
  await key('Space', ' ', 32);
  for (let i = 0; i < 60; i++) { if (await ev(`window.__c.app.mode`) === 'fight') break; await sleep(250); }
  console.log('모드', await ev(`window.__c.app.mode`));
  const P = [['KeyH', 'h', 72], ['KeyJ', 'j', 74]];
  const W2 = [['KeyA', 'a', 65], ['KeyD', 'd', 68]];
  const HK = [['KeyK', 'k', 75], ['KeyL', 'l', 76]];
  const SS = ['KeyS', 's', 83];
  const t0 = Date.now();
  let i = 0, shots = 0;
  while (Date.now() - t0 < SECONDS * 1000) {
    i++;
    const st = await ev(`(()=>{const s=window.__c.app.s; if(!s) return null; return {phase:s.phase,round:s.round,clock:Math.round(s.clock),pa:+s.pa.toFixed(2),pb:+s.pb.toFixed(2),hp:s.f.map(f=>Math.round(f.hp)),st:s.f.map(f=>Math.round(f.st)),land:s.f.map(f=>f.landed),thrown:s.f.map(f=>f.thrown),dodged:s.f.map(f=>f.dodged),kd:s.f.map(f=>f.knockdowns),mode:window.__c.app.mode}})()`);
    if (!st) break;
    if (i % 20 === 1) console.log(JSON.stringify(st));
    seen[st.phase] = 1;
    if (st.mode === 'over') break;
    if (st.phase === 'count') { await key(...P[i % 2], 15); continue; }
    const r = i % 7;
    if (r === 0 || r === 3) await key(...P[i % 2], 30);
    else if (r === 1) await key(...HK[i % 2], 30);
    else if (r === 2) { await down(...SS); await key(...P[i % 2], 30); await up(...SS); }
    else if (r === 4) await key(...W2[i % 2], 220);
    else if (r === 5) await key('Space', ' ', 32, 300);
    else await key('KeyE', 'e', 69, 30);
    await sleep(70);
    if (shots < 6 && Date.now() - t0 > (shots + 1) * 5500) await shot(`play-${++shots}`);
  }
  const final = await ev(`(()=>{const s=window.__c.app.s; return {phase:s.phase,round:s.round,hp:s.f.map(f=>Math.round(f.hp)),land:s.f.map(f=>f.landed),thrown:s.f.map(f=>f.thrown),dodged:s.f.map(f=>f.dodged),kd:s.f.map(f=>f.knockdowns),result:s.result,mode:window.__c.app.mode}})()`);
  console.log('최종', JSON.stringify(final));
  if (final.land[0] < 1) { console.log('내 펀치가 한 번도 안 맞음'); fail = 1; }
  if (final.thrown[1] < 1) { console.log('상대가 공격을 안 함'); fail = 1; }
  await shot('play-end');
  // 다운 → 카운트 → A D 연타로 일어나기
  await ev(`(()=>{const a=window.__c.app,s=a.s,o=s.f[1];s.f[0].hp=1;s.f[0].miracle=false;s.f[0].guard=false;o.punch=null;s.pa=.5;s.pb=-.45;o.queue.length=0;o.stun=0;o.tele=.4;o.queue.push({id:'cross',opt:{}});return 1})()`);
  for (let k = 0; k < 120; k++) { if (await ev(`window.__c.app.s.phase`) === 'count') break; await sleep(150); }
  const ph = await ev(`window.__c.app.s.phase`);
  console.log('다운 뒤 단계', ph);
  if (ph !== 'count') { console.log('다운이 안 일어남'); fail = 1; } else {
    let n = 0;
    while (n++ < 200 && await ev(`window.__c.app.s.phase`) === 'count') { await key(...P[n % 2], 12); await sleep(20); }
    const after = await ev(`(()=>{const s=window.__c.app.s;return {phase:s.phase,hp:Math.round(s.f[0].hp),n}})()`.replace(',n}', '}'));
    console.log('연타', n, '회 뒤', JSON.stringify(after));
    if (after.phase !== 'fight') { console.log('일어나지 못함'); fail = 1; }
  }
  // 키 배치별로 실제 키가 맞는 동작을 내는지
  const probe = async (scheme, press, holdKey, want) => {
    await ev(`(()=>{const c=window.__c,s=c.app.s;c.setScheme('${scheme}');s.phase='fight';const m=s.f[0],o=s.f[1];m.punch=null;m.stun=0;m.st=100;m.buf=null;o.ai.next=1e9;o.queue.length=0;o.punch=null;return 1})()`);
    if (holdKey) await down(...holdKey);
    await sleep(120);
    await key(...press, 40);
    let got = null;
    for (let k = 0; k < 30 && !got; k++) { got = await ev(`window.__c.app.s.f[0].punch?.id || null`); if (!got) await sleep(60); }
    if (holdKey) await up(...holdKey);
    const ok = got === want;
    console.log(`  배치 ${scheme}: ${press[1]}${holdKey ? '+' + holdKey[1] : ''} → ${got} ${ok ? '확인' : `(기대 ${want})`}`);
    if (!ok) fail = 1;
    for (let k = 0; k < 40; k++) { if (!(await ev(`!!window.__c.app.s.f[0].punch`))) break; await sleep(80); }
  };
  console.log('키 배치 확인');
  await probe('a', ['KeyK', 'k', 75], null, 'hook');
  await probe('a', ['KeyJ', 'j', 74], ['KeyS', 's', 83], 'upper');
  await probe('a', ['KeyH', 'h', 72], ['Space', ' ', 32], 'body');
  await probe('b', ['KeyQ', 'q', 81], null, 'jab');
  await probe('b', ['KeyR', 'r', 82], null, 'hook');
  await probe('b', ['KeyW', 'w', 87], ['ArrowDown', 'ArrowDown', 40], 'upper');
  await probe('b', ['KeyF', 'f', 70], null, 'body');
  await ev(`window.__c.setScheme('a')`);
} catch (e) {
  console.error(e);
  fail = 1;
}
console.log('거친 단계', Object.keys(seen).join(','));
console.log(errors.length ? `오류:\n${errors.join('\n')}` : '콘솔 오류 없음');
if (errors.length) fail = 1;
chrome.kill();
process.exit(fail);
