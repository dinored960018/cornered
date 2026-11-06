// 실제 Chrome(소프트웨어 WebGL)으로 장면을 꾸며 스크린샷을 찍는다.
// BASE=<주소> ONLY=이름,이름 W=1280 H=720 node scripts/shots.mjs [출력 폴더]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const OUT = process.argv[2] || '.shots';
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE || 'http://localhost:7900/';
const W = Number(process.env.W) || 1280, H = Number(process.env.H) || 720;
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const PORT = 9366;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cornered-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--headless=new', '--no-first-run',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio',
  `--window-size=${W},${H}`, 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 40; i++) { try { await fetch(`http://127.0.0.1:${PORT}/json/version`); break; } catch { await sleep(250); } }
const errors = [];
const info = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(info.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 0;
const wait = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value || a.description).join(' '));
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(`${m.params.entry.text} ${m.params.entry.url || ''}`);
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(`${expression}\n${r.result.exceptionDetails.exception?.description}`);
  return r.result?.result?.value;
};
const shot = async (n) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, `${n}.png`), Buffer.from(r.result.data, 'base64'));
  console.log('  저장', n);
};
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: BASE });
for (let i = 0; i < 60; i++) { if (await ev(`!!window.__c`).catch(() => false)) break; await sleep(250); }
console.log('로드됨', errors.length ? errors : '오류 없음');

const on = (n) => !ONLY || ONLY.includes(n);
// 모델 생성 후 몇 프레임 돌릴 시간
const settle = (ms = 1500) => sleep(ms);
// 장면 준비: 인트로를 건너뛰고 시합 중 상태로 만든다
const stage = (p, o, extra = '') => ev(`(()=>{
  const c=window.__c, a=c.app;
  a.run={kind:'single',player:'${p}',order:['${o}'],stage:0,level:'normal'};
  c.startFight();
  a.intro.t=a.intro.len;
  const s=a.s;
  a.keysT=0; document.getElementById('keys').classList.add('gone');
  const f=s.f[1]; f.ai.next=1e6; f.ai.specialT=1e6; f.ai.stareCd=1e6;
  ${extra}
  return true;
})()`);
const after = (js) => ev(`(()=>{const c=window.__c,a=c.app,s=a.s,me=s.f[0],op=s.f[1];${js};return true})()`);

try {
  if (on('home')) { await ev(`window.__c.app.menuRig=window.__c.BOXERS[6];window.__c.app.rig.group.visible=false;window.__c.app.rig=window.__c.getRig('tank');window.__c.app.rig.group.visible=true;1`); await settle(1800); await shot('home'); }
  if (on('how')) {
    await ev(`document.querySelector('#btnHow').click()`);
    await settle(600);
    await shot('how-a');
    await ev(`document.querySelector('#howSchemes [data-id=b]').click()`);
    await settle(300);
    await shot('how-b');
    await ev(`document.querySelector('#howSchemes [data-id=a]').click();document.querySelector('#howBack').click()`);
  }
  if (on('legend')) {
    await stage('southpaw', 'tank', `a.keysT=99;document.getElementById('keys').classList.remove('gone');`);
    await settle(1500);
    await shot('legend');
  }
  if (on('select')) {
    await ev(`document.querySelector('#btnGauntlet').click()`);
    await settle();
    await shot('select');
    await ev(`document.querySelector('#selBack').click()`);
  }
  if (on('roster')) {
    for (const [i, b] of ['infighter', 'outboxer', 'lucky', 'dirty', 'switch', 'southpaw', 'tank'].entries()) {
      await stage(i === 0 ? 'southpaw' : 'infighter', b);
      await settle(1300);
      await after(`s.pa=.6;s.pb=-.45;a.fx.flash=0;document.getElementById('announce').classList.remove('show')`);
      await settle(1000);
      await shot(`vs-${b}`);
    }
  }
  if (on('windup')) {
    await stage('southpaw', 'tank');
    await settle(1200);
    await after(`s.pa=.6;s.pb=-.45; document.getElementById('announce').classList.remove('show'); op.tele=40; op.queue.push({id:'rhook',opt:{}})`);
    await settle(1600);
    await shot('windup-hook');
  }
  if (on('cornered')) {
    await stage('infighter', 'infighter');
    await settle(1200);
    await after(`s.pa=3.4;s.pb=2.45;me.hp=me.maxHp*.2; a.rig.setDamage(.3);document.getElementById('announce').classList.remove('show')`);
    await settle(1800);
    await shot('cornered-lowhp');
  }
  if (on('punch')) {
    await stage('dirty', 'outboxer');
    await settle(1200);
    await after(`s.pa=.5;s.pb=-.45;me.tele=30;document.getElementById('announce').classList.remove('show')`);
    await settle(500);
    await after(`me.tele=25;me.punch=null;me.queue.push({id:'cross',opt:{}});`);
    await settle(1300);
    await shot('player-windup');
  }
  if (on('guard')) {
    await stage('tank', 'southpaw');
    await settle(1100);
    await after(`s.pa=.55;s.pb=-.4;c.keys.add('KeyW');document.getElementById('announce').classList.remove('show')`);
    await settle(900);
    await shot('guard');
    await after(`c.keys.delete('KeyW')`);
  }
  if (on('down')) {
    await stage('southpaw', 'dirty');
    await settle(1100);
    await after(`s.pa=.5;s.pb=-.45;me.hp=.5;op.ai.next=0;op.tele=1;document.getElementById('announce').classList.remove('show')`);
    await settle(3800);
    await shot('down-count');
  }
  if (on('result')) {
    await stage('southpaw', 'dirty');
    await settle(800);
    await after(`s.phase='over';s.result={winner:0,how:'KO'};s.round=2;a.rig.setDamage(1)`);
    await after(`setTimeout(()=>{},0);c.app.mode='over'`);
    await ev(`(()=>{const a=window.__c.app;a.s.events.push({type:'over',winner:0,how:'KO'});a.mode='fight';return 1})()`);
    await settle(3400);
    await shot('result');
  }
} catch (e) {
  console.error(e);
  errors.push(String(e));
}
console.log(errors.length ? `오류:\n${errors.join('\n')}` : '오류 없음');
chrome.kill();
process.exit(errors.length ? 1 : 0);
