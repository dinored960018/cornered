// 온라인 대전 확인: Chrome 탭 두 개로 방을 만들고 들어가서, 손님이 누른 키가 방장 경기에 들어가는지 본다.
// BASE=<주소> node scripts/online.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = process.env.BASE || 'http://localhost:7900/';
const PORT = 9399;
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'corn-net-'))}`, '--headless=new', '--no-first-run',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio', '--window-size=640,360',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 40; i++) { try { await fetch(`http://127.0.0.1:${PORT}/json/version`); break; } catch { await sleep(250); } }

async function tab(name) {
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
    if (r.result?.exceptionDetails) throw new Error(`${name}: ${expression}\n${r.result.exceptionDetails.exception?.description}`);
    return r.result?.result?.value;
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  const key = async (code, key, vk, ms = 60) => {
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code, key, windowsVirtualKeyCode: vk });
    await sleep(ms);
    await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key, windowsVirtualKeyCode: vk });
  };
  const hold = (code, key, vk, on) => send('Input.dispatchKeyEvent', { type: on ? 'rawKeyDown' : 'keyUp', code, key, windowsVirtualKeyCode: vk });
  return { name, send, ev, key, hold, errors };
}
const until = async (t, js, ms = 30000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = await t.ev(js).catch(() => null); if (v) return v; await sleep(300); }
  throw new Error(`${t.name}: 시간 초과 ${js}`);
};
let ok = true;
const check = (label, cond, extra = '') => { console.log(cond ? '  통과' : '  실패', label, extra); if (!cond) ok = false; };

try {
  const A = await tab('방장'), B = await tab('손님');
  await A.send('Page.navigate', { url: BASE });
  await until(A, '!!window.__c');
  await A.ev(`window.__c.setScheme('a')`);
  await A.ev(`document.querySelector('#btnOnline').click()`);
  const url = await until(A, `document.querySelector('#onUrl').value`);
  console.log('초대 링크', url);
  const local = url.replace(/^https?:\/\/[^/]+\/(cornered\/)?/, BASE);
  await B.send('Page.navigate', { url: local });
  await until(B, '!!window.__c');
  await B.ev(`window.__c.setScheme('b')`);
  await until(A, `window.__c.app.mode==='select'`);
  await until(B, `window.__c.app.mode==='select'`);
  console.log('둘 다 선택 화면');
  await A.ev(`[...document.querySelectorAll('#selList button')][0].click();document.querySelector('#selGo').click()`); // 인파이터
  await B.ev(`[...document.querySelectorAll('#selList button')][6].click();document.querySelector('#selGo').click()`); // 탱크
  // 인트로는 기다리지 않는다 (소프트웨어 렌더링이라 느리다)
  for (const t of [A, B]) { await until(t, `['intro','fight'].includes(window.__c.app.mode)`, 60000); await t.ev(`(()=>{const a=window.__c.app; if(a.intro) a.intro.t=a.intro.len; return 1})()`); }
  await until(A, `window.__c.app.mode==='fight'`, 60000);
  await until(B, `window.__c.app.mode==='fight'`, 60000);
  const who = await B.ev(`[window.__c.app.s.f[0].def.id, window.__c.app.s.f[1].def.id]`);
  check('손님 화면: 나는 탱크, 상대는 인파이터', who[0] === 'tank' && who[1] === 'infighter', who.join(' vs '));
  const hostWho = await A.ev(`[window.__c.app.s.f[0].def.id, window.__c.app.s.f[1].def.id, !!window.__c.app.s.f[1].ai]`);
  check('방장 화면: 나는 인파이터, 상대는 탱크(사람)', hostWho[0] === 'infighter' && hostWho[1] === 'tank' && !hostWho[2]);

  // 손님이 오른쪽으로 피한다 → 방장 경기의 1번 머리가 움직인다
  await B.hold('ArrowRight', 'ArrowRight', 39, true);
  let hx = 0;
  for (let i = 0; i < 20 && hx < 0.15; i++) { await sleep(400); hx = await A.ev(`window.__c.app.s.f[1].head.x`); }
  console.log('  손님 쪽 내 머리', await B.ev(`window.__c.app.s.f[0].head.x.toFixed(2)`), '방장 rIn.weave', await A.ev(`window.__c.app.net.rIn.weave`));
  await B.hold('ArrowRight', 'ArrowRight', 39, false);
  check('손님이 피하면 방장 쪽에서도 머리가 움직인다', hx > 0.15, hx.toFixed(2));

  // 손님 주먹 → 방장 경기에서 1번이 던진 수가 는다
  const before = await A.ev(`window.__c.app.s.f[1].thrown`);
  for (let i = 0; i < 4; i++) { await B.key('KeyZ', 'z', 90); await sleep(700); }
  const after = await A.ev(`window.__c.app.s.f[1].thrown`);
  check('손님이 Z를 누르면 방장 경기에서 주먹이 나간다', after > before, `${before} → ${after}`);

  // 방장 주먹 → 손님 화면 체력과 방장 경기 체력이 같다
  for (let i = 0; i < 6; i++) { await A.key('KeyK', 'k', 75); await sleep(600); }
  await sleep(800);
  const hpA = await A.ev(`[window.__c.app.s.f[0].hp, window.__c.app.s.f[1].hp].map(v=>+v.toFixed(1))`);
  const hpB = await B.ev(`[window.__c.app.s.f[1].hp, window.__c.app.s.f[0].hp].map(v=>+v.toFixed(1))`);
  check('양쪽 체력이 같게 보인다', Math.abs(hpA[0] - hpB[0]) < 3 && Math.abs(hpA[1] - hpB[1]) < 3, `방장 ${hpA} / 손님 ${hpB}`);
  const st = await A.ev(`(()=>{const s=window.__c.app.s;return [s.f[0].landed,s.f[0].thrown,s.f[1].landed,s.f[1].thrown]})()`);
  console.log('  방장 적중/시도', st[0], '/', st[1], ' 손님', st[2], '/', st[3]);
  const pos = [await A.ev(`[window.__c.app.s.pa,window.__c.app.s.pb].map(v=>+v.toFixed(2))`), await B.ev(`[window.__c.app.s.pa,window.__c.app.s.pb].map(v=>+v.toFixed(2))`)];
  check('손님 화면은 링을 돌려서 본다 (pa = -방장 pb)', Math.abs(pos[1][0] + pos[0][1]) < 0.3, JSON.stringify(pos));

  // 손님이 나가면 방장은 메뉴로 돌아간다
  await B.send('Page.navigate', { url: 'about:blank' });
  await until(A, `window.__c.app.mode==='online' && !window.__c.app.net`, 20000);
  check('상대가 나가면 연결 끊김 안내', true);
  for (const t of [A, B]) check(`${t.name} 콘솔 오류 없음`, t.errors.length === 0, t.errors.join('\n'));
} catch (e) {
  console.error(e);
  ok = false;
}
chrome.kill();
process.exit(ok ? 0 : 1);
