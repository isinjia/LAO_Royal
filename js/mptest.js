// Online sync test: open index.html?mptest=1&host=1&mute=1 and index.html?mptest=1&mute=1 in two tabs of one browser.
// The two tabs meet over a BroadcastChannel (no relays), start an online match and each plays cards on its own; the
// guest measures how far it had drifted from the host before every correction. Results in window.MPT and on screen.
(function () {
  if (!/[?&]mptest=1(&|$)/.test(location.search)) return;
  const host = /[?&]host=1(&|$)/.test(location.search);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = { host, started: false, done: false, plays: 0, drift: null, errors: [], result: null, freeze: false }; // freeze: this tab stops as if it were switched off (for the disconnect check)
  window.MPT = out;
  window.addEventListener('error', (e) => out.errors.push(`${e.message} @${(e.filename || '').split('/').pop()}:${e.lineno}`));
  // the meeting: the host announces, the guest answers; then every message goes over the same channel
  const bc = new BroadcastChannel('lastroyal-mptest');
  window.NET = {
    cancel() {},
    find(profile) {
      return new Promise((resolve) => {
        let fn = null; const early = [];
        const link = (foe, seed) => resolve({ guest: !host, seed, foe, send: (m) => bc.postMessage({ k: 'g', from: host, m }), listen: (f) => { fn = f; while (early.length) f(early.shift()); }, close() {} });
        bc.onmessage = (ev) => {
          const d = ev.data;
          if (d.k === 'g' && d.from !== host) { if (fn) fn(d.m); else early.push(d.m); }
          if (!host && d.k === 'hello') { bc.postMessage({ k: 'ok', p: profile }); link(d.p, d.seed); }
          if (host && d.k === 'ok') { clearInterval(t); link(d.p, 12345); }
        };
        const t = host ? setInterval(() => bc.postMessage({ k: 'hello', p: profile, seed: 12345 }), 300) : null;
      });
    },
  };
  function panel() {
    let el = document.getElementById('mptPanel');
    if (!el) { el = document.createElement('pre'); el.id = 'mptPanel'; el.style.cssText = 'position:fixed;left:8px;top:8px;z-index:999;background:rgba(0,0,0,.85);color:#9f9;font:11px monospace;padding:8px;pointer-events:none;white-space:pre-wrap'; document.body.appendChild(el); }
    el.textContent = `온라인 동기화 점검 (${host ? '호스트' : '게스트'}) · 입력 ${out.plays} · ${JSON.stringify(out.drift)}${out.errors.length ? '\n' + out.errors.join('\n') : ''}`;
  }
  // a hidden page gets no animation frames: a message pump keeps the match going (one 1/60 s frame per turn of the event loop)
  let rafT = 0; const raf = () => { rafT = performance.now(); requestAnimationFrame(raf); }; requestAnimationFrame(raf); // (frames stop when the page is out of sight, whatever document.hidden says)
  { const ch = new MessageChannel(); ch.port1.onmessage = () => { if (!out.freeze && performance.now() - rafT > 200 && window.GAME && GAME._frame && GAME.G && GAME.G.phase !== 'title') GAME._frame(1 / 60); ch.port2.postMessage(0); }; ch.port2.postMessage(0); }
  async function run() {
    for (let i = 0; i < 300 && !(window.GAME && GAME.ready && window.UI); i++) await wait(100);
    await wait(800);
    const nq = /[?&]nick=([^&]+)/.exec(location.search);
    Object.assign(UI.save, { mode: 0, tutorial: true, nick: nq ? decodeURIComponent(nq[1]) : UI.save.nick || '점검' }); // (nick=: each tab its own name)
    const ov = document.getElementById('nickOv'); if (ov) ov.hidden = true;
    const G = GAME.G;
    for (let k = 0; k < 8 && G.phase === 'title'; k++) { document.getElementById('btnBattle').click(); await wait(3000); }
    for (let i = 0; i < 600 && G.phase !== 'play'; i++) await wait(100);
    out.started = G.phase === 'play';
    const secs = +(/[?&]secs=(\d+)/.exec(location.search) || [0, 90])[1];
    let next = 0;
    while (G.phase === 'play' && G.time < secs) {
      if (G.time < next) { await new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); }); continue; } // (not a timer: a hidden page's timers are slowed to once a second)
      next = G.time + 0.4;
      const S = G.sides.blue;
      for (let i = 0; i < 4; i++) {
        const c = DATA.card[S.hand[i]];
        if (!c || c.cost > S.elixir || Math.random() < 0.3) continue;
        const x = c.type === 'spell' ? (Math.random() - 0.5) * 10 : [-5.5, 0, 5.5, -2, 2, -4, 4][Math.floor(Math.random() * 7)], z = c.type === 'spell' ? (Math.random() < 0.7 ? 2 + Math.random() * 10 : -2 - Math.random() * 8) : c.type === 'building' ? -6 - Math.random() * 3 : -3 - Math.random() * 8;
        if (GAME._mpPlay(i, x, z)) { out.plays++; break; }
      }
      for (const u of GAME.champions('blue')) if (u.state === 'attack' && Math.random() < 0.3) GAME.useSkill(u);
      if (Math.random() < 0.05) GAME.useSupport(Math.random() < 0.5 ? 0 : 2);
      out.drift = G.mpDrift ? Object.assign({}, G.mpDrift, { pos: +G.mpDrift.pos.toFixed(3), hp: +G.mpDrift.hp.toFixed(1) }) : null;
      panel();
    }
    out.result = G.phase; out.done = true; panel();
  }
  run().catch((e) => { out.errors.push(String(e && e.stack || e)); panel(); });
})();
