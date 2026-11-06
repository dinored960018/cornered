// 타격 이펙트 확인: 경기 중에 타격 이벤트를 직접 넣고 그 순간을 찍는다.
// BASE=<주소> node scripts/fxshot.mjs [출력 폴더]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const OUT = process.argv[2] || '.shots';
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE || 'http://localhost:7900/';
const PORT = 9422;
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'corn-fx-'))}`, '--headless=new', '--no-first-run',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio', '--window-size=1280,720', 'about:blank',
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
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(`${expression}\n${r.result.exceptionDetails.exception?.description}`);
  return r.result?.result?.value;
};
const shot = async (n) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, `${n}.png`), Buffer.from(r.result.data, 'base64')); console.log('  저장', n); };
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: BASE });
for (let i = 0; i < 80; i++) { if (await ev(`!!window.__c`).catch(() => false)) break; await sleep(250); }
const stage = (p, o) => ev(`(()=>{const c=window.__c,a=c.app;a.run={kind:'single',player:'${p}',order:['${o}'],stage:0,level:'normal'};c.startFight();a.intro.t=a.intro.len;return 1})()`);
const freeze = `const s=window.__c.app.s,o=s.f[1];o.ai.next=1e9;o.ai.specialT=1e9;o.ai.stareCd=1e9;o.queue.length=0;o.punch=null;document.getElementById('announce').classList.remove('show');document.getElementById('keys').classList.add('gone');`;
// 이벤트를 넣은 뒤 프레임 하나만 돌고 바로 찍는다
const fire = (e) => ev(`(async()=>{${freeze} window.__c.handleEvent(${JSON.stringify(e)}); window.__c.impacts.list.forEach(x=>x.life*=12); await new Promise(r=>requestAnimationFrame(r)); return 1})()`);
try {
  await stage('southpaw', 'infighter');
  await sleep(2500);
  await ev(`(()=>{${freeze};return 1})()`);
  await sleep(800);
  await fire({ type: 'hit', who: 1, by: 0, id: 'cross', hand: 'R', dmg: 12, kind: 'straight', combo: 1, big: true });
  await shot('fx-opp-cross');
  await sleep(1500);
  await fire({ type: 'hit', who: 1, by: 0, id: 'hook', hand: 'L', dmg: 16, kind: 'hook', counter: true, combo: 2, big: true });
  await shot('fx-opp-counter-hook');
  await sleep(1500);
  await fire({ type: 'hit', who: 0, by: 1, id: 'hook', hand: 'R', dmg: 14, kind: 'hook', combo: 1, big: true });
  await shot('fx-me-hit');
  await sleep(1500);
  await fire({ type: 'block', who: 1, by: 0, id: 'cross', hand: 'R', dmg: 1 });
  await shot('fx-block');
  // 상대 다운
  await ev(`(()=>{const a=window.__c.app,s=a.s;s.f[1].hp=0;s.phase='count';s.count={who:1,t:0,n:1,fill:0,need:9,riseAt:99};window.__c.handleEvent({type:'down',who:1,by:0,n:1});return 1})()`);
  await sleep(3000);
  await shot('fx-opp-down');
  // 상대 주먹이 내 얼굴 앞에서 멈추는지
  await ev(`(()=>{const a=window.__c.app,s=a.s;s.phase='fight';s.count=null;const o=s.f[1];o.hp=o.maxHp;o.stun=0;s.pa=.5;s.pb=-.45;o.tele=30;o.queue.push({id:'cross',opt:{}});o.ai.next=1e9;return 1})()`);
  for (let i=0;i<80;i++){ const p=await ev(`(()=>{const p=window.__c.app.s.f[1].punch;return p?+(p.t/(p.w+p.tt)).toFixed(2):0})()`); if(p>0.97) break; await sleep(100);} 
  await shot('fx-opp-punch-arrive');
} catch (e) { console.error(e); errors.push(String(e)); }
console.log(errors.length ? `오류:\n${errors.join('\n')}` : '오류 없음');
chrome.kill();
process.exit(errors.length ? 1 : 0);
