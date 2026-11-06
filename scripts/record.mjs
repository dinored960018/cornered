// 실제 Chrome에서 키를 눌러 한 판 하면서 화면을 녹화한다. 프레임 PNG와 webm 영상, 한눈에 보는 컨택트 시트를 만든다.
// BASE=<주소> SECONDS_PLAY=80 node scripts/record.mjs [출력 폴더]
// 그래픽 카드가 없는 PC에서는 게임이 프레임당 0.05초씩 흐르므로, 20fps로 이어 붙이면 실제 속도에 가깝다.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const OUT = path.resolve(process.argv[2] || '.rec');
const FR = path.join(OUT, 'frames');
fs.rmSync(FR, { recursive: true, force: true });
fs.mkdirSync(FR, { recursive: true });
const BASE = process.env.BASE || 'http://localhost:7900/';
const SECONDS = Number(process.env.SECONDS_PLAY) || 80;
const PORT = 9388, W = 1280, H = 720;
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'corn-rec-'))}`, '--headless=new', '--no-first-run',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio', `--window-size=${W},${H}`,
  '--allow-file-access-from-files', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 40; i++) { try { await fetch(`http://127.0.0.1:${PORT}/json/version`); break; } catch { await sleep(250); } }
const info = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(info.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 0, frameN = 0, recording = false;
const wait = new Map(), errors = [];
const send = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); }
  if (m.method === 'Page.screencastFrame') {
    if (recording) fs.writeFileSync(path.join(FR, `${String(frameN++).padStart(5, '0')}.jpg`), Buffer.from(m.params.data, 'base64'));
    ws.send(JSON.stringify({ id: ++id, method: 'Page.screencastFrameAck', params: { sessionId: m.params.sessionId } }));
  }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(`${m.params.entry.text} ${m.params.entry.url || ''}`);
};
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(`${expression}\n${r.result.exceptionDetails.exception?.description}`);
  return r.result?.result?.value;
};
const K = {
  H: ['KeyH', 'h', 72], J: ['KeyJ', 'j', 74], K: ['KeyK', 'k', 75], L: ['KeyL', 'l', 76],
  A: ['KeyA', 'a', 65], D: ['KeyD', 'd', 68], S: ['KeyS', 's', 83], W: ['KeyW', 'w', 87], E: ['KeyE', 'e', 69],
  Sp: ['Space', ' ', 32], Sh: ['ShiftLeft', 'Shift', 16],
};
const down = (k) => send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code: k[0], key: k[1], windowsVirtualKeyCode: k[2] });
const up = (k) => send('Input.dispatchKeyEvent', { type: 'keyUp', code: k[0], key: k[1], windowsVirtualKeyCode: k[2] });
const tap = async (k, ms = 40) => { await down(k); await sleep(ms); await up(k); };

await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Emulation.setFocusEmulationEnabled', { enabled: true });
await send('Page.navigate', { url: BASE });
for (let i = 0; i < 80; i++) { if (await ev(`!!window.__c`).catch(() => false)) break; await sleep(250); }
await send('Page.startScreencast', { format: 'jpeg', quality: 72, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
recording = true;

// 메뉴 → 단판 승부 → 사우스포 vs 인파이터
await sleep(1500);
await ev(`window.__c.setScheme('${process.env.SCHEME || 'a'}')`);
await ev(`document.querySelector('#btnSingle').click()`);
await sleep(900);
await ev(`[...document.querySelectorAll('#selList button')][5].click()`);
await sleep(700);
await ev(`document.querySelector('#selGo').click()`);
await sleep(700);
await ev(`[...document.querySelectorAll('#selList button')][0].click()`);
await sleep(700);
await ev(`document.querySelector('#selGo').click()`);
for (let i = 0; i < 100; i++) { if (await ev(`window.__c.app.mode`) === 'fight') break; await sleep(200); }

// 사람처럼: 상대 펀치가 고정되면 피하고, 틈이 나면 때린다
const t0 = Date.now();
let staged = 0, i = 0;
while (Date.now() - t0 < SECONDS * 1000) {
  i++;
  const st = await ev(`(()=>{const s=window.__c.app.s; if(!s) return null; const o=s.f[1].punch, m=s.f[0]; return {phase:s.phase, mode:window.__c.app.mode, op:o?{id:o.id,hand:o.hand,latched:o.latched,done:o.done}:null, me:!!m.punch, hp:m.hp/m.maxHp, d:s.pa-s.pb}})()`);
  if (!st || st.mode === 'over') break;
  const el = (Date.now() - t0) / 1000;
  // 화면 연출을 보려고 중간에 상황을 만든다: 코너에 몰림 → 다운
  if (staged === 0 && el > SECONDS * 0.4) { staged = 1; await ev(`(()=>{const s=window.__c.app.s;s.pa=3.3;s.pb=2.4;s.f[0].hp=s.f[0].maxHp*.3;return 1})()`); }
  if (staged === 1 && el > SECONDS * 0.7) { staged = 2; await ev(`(()=>{const s=window.__c.app.s;s.f[0].hp=1;s.f[0].miracle=false;return 1})()`); }
  if (st.phase === 'count') { await tap(i % 2 ? K.H : K.J, 15); continue; }
  if (st.op && !st.op.done && st.op.latched) {
    if (st.op.id === 'hook') { await down(K.S); await sleep(260); await up(K.S); }
    else if (st.op.id === 'body') { await down(K.Sp); await sleep(260); await up(K.Sp); }
    else { const k = Math.random() < 0.5 ? K.A : K.D; await down(k); await sleep(260); await up(k); }
    continue;
  }
  if (!st.me) {
    const r = Math.random();
    if (st.d > 1.35) await tap(K.W);
    else if (r < 0.45) await tap(Math.random() < 0.5 ? K.H : K.J);
    else if (r < 0.7) await tap(Math.random() < 0.5 ? K.K : K.L);
    else if (r < 0.82) { await down(K.S); await tap(K.J); await up(K.S); }
    else if (r < 0.88) await tap(K.E);
    else await sleep(120);
  }
  await sleep(40);
}
await sleep(2500);
recording = false;
await send('Page.stopScreencast');
console.log('프레임', frameN);

// webm으로 이어 붙이기 (브라우저 MediaRecorder)
const files = fs.readdirSync(FR).filter((f) => f.endsWith('.jpg')).sort();
const page = path.join(OUT, 'mux.html');
fs.writeFileSync(page, `<!doctype html><canvas id=c width=${W} height=${H}></canvas><script>
window.mux = async (list, fps) => {
  const c = document.getElementById('c'), x = c.getContext('2d');
  const stream = c.captureStream(0);
  const rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 6e6 });
  const chunks = [];
  rec.ondataavailable = (e) => chunks.push(e.data);
  rec.start();
  const track = stream.getVideoTracks()[0];
  for (const f of list) {
    const img = new Image();
    img.src = 'frames/' + f;
    await img.decode();
    x.drawImage(img, 0, 0, ${W}, ${H});
    track.requestFrame();
    await new Promise((r) => setTimeout(r, 1000 / fps));
  }
  rec.stop();
  await new Promise((r) => (rec.onstop = r));
  const buf = await new Blob(chunks).arrayBuffer();
  let s = '';
  const u = new Uint8Array(buf);
  for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode(...u.subarray(i, i + 32768));
  return btoa(s);
};
</script>`);
await send('Page.navigate', { url: 'file:///' + page.replace(/\\/g, '/') });
await sleep(800);
const b64 = await ev(`window.mux(${JSON.stringify(files)}, 20)`);
fs.writeFileSync(path.join(OUT, 'gameplay.webm'), Buffer.from(b64, 'base64'));
console.log('영상', path.join(OUT, 'gameplay.webm'), Math.round(Buffer.from(b64, 'base64').length / 1024), 'KB');

// 컨택트 시트: 고르게 24장
const pick = [];
for (let k = 0; k < 24; k++) pick.push(files[Math.floor((k / 24) * files.length)]);
fs.writeFileSync(path.join(OUT, 'sheet.html'), `<!doctype html><body style="margin:0;background:#000;display:grid;grid-template-columns:repeat(4,1fr);gap:2px">${pick.map((f, k) => `<div style="position:relative"><img src="frames/${f}" style="width:100%;display:block"><b style="position:absolute;left:4px;top:2px;color:#ff0;font:700 14px sans-serif">${k}</b></div>`).join('')}</body>`);
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1360, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'file:///' + path.join(OUT, 'sheet.html').replace(/\\/g, '/') });
await sleep(1500);
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(path.join(OUT, 'sheet.png'), Buffer.from(shot.result.data, 'base64'));
console.log(errors.length ? `오류:\n${errors.join('\n')}` : '콘솔 오류 없음');
chrome.kill();
process.exit(0);
