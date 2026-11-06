// 온라인 대전 연결. 서버 없이 초대 링크로 두 브라우저를 잇는다 (신호만 PeerJS 공용 서버를 쓴다).
const PREFIX = 'cornered-boxing-';
const SILENCE_MS = 8000;
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

let lib = null;
function loadPeer() {
  if (!lib) {
    lib = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = new URL('../vendor/peerjs.min.js', import.meta.url).href;
      s.onload = () => resolve(window.peerjs?.Peer ?? window.Peer);
      s.onerror = () => reject(new Error('연결 라이브러리를 불러오지 못했어요'));
      document.head.append(s);
    });
  }
  return lib;
}
const randomCode = () => Array.from({ length: 5 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');

class Link {
  constructor() { this.onmessage = null; this.onclose = null; this.conn = null; this.peer = null; this.alive = false; }
  attach(conn) {
    this.conn = conn;
    this.alive = true;
    let last = Date.now();
    conn.on('data', (d) => { last = Date.now(); if (d?.t !== 'ping') this.onmessage?.(d); });
    conn.on('close', () => this.drop());
    conn.on('error', () => this.drop());
    this.ping = setInterval(() => {
      if (conn.open) conn.send({ t: 'ping' });
      if (Date.now() - last > SILENCE_MS) this.drop();
    }, 1000);
  }
  send(m) { if (this.conn?.open) this.conn.send(m); }
  drop() {
    if (!this.alive) return;
    this.alive = false;
    clearInterval(this.ping);
    this.onclose?.();
  }
  close() {
    this.onclose = null;
    this.alive = false;
    clearInterval(this.ping);
    this.peer?.destroy();
  }
}

export class HostLink extends Link {
  // 방을 만들고 초대 코드를 돌려준다. 상대가 들어오면 onjoin 호출
  async open(onjoin) {
    const Peer = await loadPeer();
    for (let i = 0; i < 5; i++) {
      const code = randomCode();
      try {
        await new Promise((resolve, reject) => {
          const p = new Peer(PREFIX + code);
          const timer = setTimeout(() => { p.destroy(); reject(new Error('timeout')); }, 10000);
          p.on('open', () => { clearTimeout(timer); this.peer = p; resolve(); });
          p.on('error', (e) => { clearTimeout(timer); p.destroy(); reject(e); });
        });
        this.code = code;
        this.peer.on('connection', (conn) => {
          if (this.conn?.open) { conn.on('open', () => conn.close()); return; }
          conn.on('open', () => { this.attach(conn); onjoin(); });
        });
        this.peer.on('disconnected', () => { if (!this.peer.destroyed) this.peer.reconnect(); });
        return code;
      } catch (e) {
        if (e?.type !== 'unavailable-id') throw e;
      }
    }
    throw new Error('방을 만들지 못했어요');
  }
}

export class GuestLink extends Link {
  async join(code) {
    const Peer = await loadPeer();
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 20000);
      const p = new Peer();
      this.peer = p;
      p.on('error', (e) => { clearTimeout(timer); reject(e); this.drop(); });
      p.on('open', () => {
        const conn = p.connect(PREFIX + code, { reliable: true, serialization: 'json' });
        conn.on('open', () => { clearTimeout(timer); this.attach(conn); resolve(); });
      });
    });
  }
}
