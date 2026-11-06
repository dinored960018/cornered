// 상대 머리 떨림 측정: 가만히 서 있을 때 목 각도와 머리 위치가 프레임마다 얼마나 튀는지 (2차 차분 최대값)
// BASE=<주소> node scripts/jitter.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = process.env.BASE || 'http://localhost:7900/';
const PORT = 9411;
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'corn-jit-'))}`, '--headless=new', '--no-first-run',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio', '--window-size=480,270', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 40; i++) { try { await fetch(`http://127.0.0.1:${PORT}/json/version`); break; } catch { await sleep(250); } }
const info = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(info.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 0;
const wait = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;
await send('Runtime.enable');
await send('Page.navigate', { url: BASE });
for (let i = 0; i < 80; i++) { if (await ev(`!!window.__c`)) break; await sleep(250); }
for (const opp of ['infighter', 'tank', 'outboxer']) {
  await ev(`(()=>{const c=window.__c,a=c.app;a.run={kind:'single',player:'southpaw',order:['${opp}'],stage:0,level:'normal'};c.startFight();a.intro.t=a.intro.len;return 1})()`);
  await sleep(1500);
  const r = await ev(`(async()=>{const a=window.__c.app,s=a.s,o=s.f[1];o.ai.next=1e9;o.ai.specialT=1e9;o.ai.stareCd=1e9;o.queue.length=0;o.punch=null;
    for(let k=0;k<20;k++) await new Promise(q=>requestAnimationFrame(q));
    const r=a.rig, yaw=[], hx=[];
    for(let k=0;k<40;k++){await new Promise(q=>requestAnimationFrame(q)); yaw.push(r.neck.rotation.y); hx.push(r.headWorld.x);}
    const j=(v)=>{let m=0;for(let k=2;k<v.length;k++)m=Math.max(m,Math.abs(v[k]-2*v[k-1]+v[k-2]));return m};
    return [j(yaw), j(hx)];})()`);
  console.log(opp.padEnd(10), '목 각도', r[0].toFixed(4), ' 머리 x', r[1].toFixed(4));
}
chrome.kill();
process.exit(0);
