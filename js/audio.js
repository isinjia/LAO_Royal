// Sound manager. Web Audio (decoded buffers: low latency, overlapping plays, cheap on phones) when the page is
// served over http(s); HTMLAudio pools as the fallback for file:// where fetch is unavailable.
(function () {
  const pools = {};
  let held = false; // the pause menu holds the music: taps / tab switches must not restart it
  const last = {};
  const VOL = { sfx: 0.45, bgm: 0.35 };
  // ?mute=1 (testing): silent for this page only; the saved sound option is left alone
  const FORCE_MUTE = /[?&]mute=1(&|$)/.test(location.search);
  let muted = FORCE_MUTE, userMuted = false;
  let bgm = null;
  let bgmKey = null;

  // Per-key throttle so rapid-fire units don't turn into noise.
  const GAP = { mg: 90, rifle: 80, gun: 80, spray: 160, slash: 70, swing: 90, laser: 90, coin: 50 };
  const VOLS = { spray: 0.25, mg: 0.3, quake: 0.6, genB: 0.6, genA: 0.6, warning: 0.6, click: 0.4 };
  const MAX_VOICES = 12; // simultaneous effects (mobile mixers choke beyond this)

  const AC = window.AudioContext || window.webkitAudioContext;
  const web = !!AC && location.protocol !== 'file:';
  let ctx = null, sfxGain = null, bgmGain = null;
  const buffers = {}, loading = {};
  let voices = 0;

  function ensureCtx() {
    if (!web || ctx) return ctx;
    ctx = new AC();
    sfxGain = ctx.createGain();
    sfxGain.gain.value = muted ? 0 : 1;
    sfxGain.connect(ctx.destination);
    bgmGain = ctx.createGain(); // iOS ignores HTMLMediaElement.volume: music volume goes through a gain node
    bgmGain.gain.value = muted ? 0 : VOL.bgm;
    bgmGain.connect(ctx.destination);
    return ctx;
  }
  // browsers (iOS in particular) only start audio inside a user gesture
  function unlock() {
    const c = ensureCtx();
    if (c && c.state !== 'running' && !document.hidden) c.resume(); // 'suspended' or iOS 'interrupted' (call, Siri)
    if (bgm && bgm.paused && !document.hidden && !held) bgm.play().catch(() => {});
  }
  ['pointerdown', 'touchend', 'keydown'].forEach((ev) => window.addEventListener(ev, unlock, { passive: true }));

  function load(key) {
    if (buffers[key] || loading[key] || !window.SND[key]) return;
    const c = ensureCtx();
    if (!c) return;
    loading[key] = fetch(window.SND[key]).then((r) => r.arrayBuffer())
      .then((ab) => new Promise((res, rej) => c.decodeAudioData(ab, res, rej)))
      .then((buf) => { buffers[key] = buf; })
      .catch(() => { /* leave it silent */ });
  }

  function get(key) {
    let p = pools[key];
    if (!p) {
      p = pools[key] = { list: [], i: 0 };
      for (let n = 0; n < 4; n++) {
        const a = new Audio(window.SND[key]);
        a.preload = 'auto';
        p.list.push(a);
      }
    }
    return p;
  }

  function play(key, vol = 1) {
    if (muted || !window.SND[key]) return;
    const now = performance.now();
    if (now - (last[key] || 0) < (GAP[key] || 45)) return;
    last[key] = now;
    const v = Math.min(1, VOL.sfx * vol * (VOLS[key] || 1));
    if (web) {
      const c = ensureCtx();
      const buf = buffers[key];
      if (!buf) { load(key); return; }
      if (c.state !== 'running' || voices >= MAX_VOICES) return;
      const src = c.createBufferSource();
      const g = c.createGain();
      g.gain.value = v;
      src.buffer = buf;
      src.connect(g).connect(sfxGain);
      voices++;
      src.onended = () => { voices--; };
      src.start();
      return;
    }
    const p = get(key);
    const a = p.list[p.i++ % p.list.length];
    try {
      a.currentTime = 0;
      a.volume = v;
      a.play().catch(() => {});
    } catch (e) { /* ignore */ }
  }

  let bgmEl = null; // reused: a new element / MediaElementSource per track would leak decoders and graph nodes
  function music(key) {
    if (bgmKey === key) return;
    bgmKey = key;
    if (!bgmEl) {
      bgmEl = new Audio();
      bgmEl.loop = true;
      bgmEl.preload = 'auto';
      const c = ensureCtx();
      if (c) {
        try { c.createMediaElementSource(bgmEl).connect(bgmGain); bgmEl.volume = 1; } catch (e) { bgmEl.volume = VOL.bgm; }
      } else bgmEl.volume = VOL.bgm;
    }
    bgmEl.pause();
    if (!key) { bgm = null; bgmEl.removeAttribute('src'); bgmEl.load(); return; }
    bgm = bgmEl;
    bgm.src = window.BGM[key];
    bgm.muted = muted;
    if (!document.hidden) bgm.play().catch(() => {});
  }

  function setMuted(m) {
    userMuted = m;
    m = m || FORCE_MUTE;
    muted = m;
    if (bgm) bgm.muted = m;
    if (sfxGain) sfxGain.gain.value = m ? 0 : 1;
    if (bgmGain) bgmGain.gain.value = m ? 0 : VOL.bgm;
  }

  // settings screen: 0..1 multipliers for music and effects
  const BASE = { sfx: VOL.sfx, bgm: VOL.bgm };
  function setVolume(kind, v) {
    VOL[kind] = BASE[kind] * Math.max(0, Math.min(1, v));
    if (kind === 'bgm') { if (bgmGain) bgmGain.gain.value = muted ? 0 : VOL.bgm; else if (bgm) bgm.volume = VOL.bgm; }
  }
  function getVolume(kind) { return VOL[kind] / BASE[kind]; }

  // background tab / locked phone: silence everything, resume when back
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (bgm) bgm.pause();
      if (ctx && ctx.state === 'running') ctx.suspend();
    } else {
      if (ctx && ctx.state !== 'running') ctx.resume();
      if (bgm && !held) bgm.play().catch(() => {});
    }
  });

  // Warm up the frequent sounds; the rest decode on first use (decoded PCM is ~10x the mp3 size).
  // Last Royal plays nearly every effect in a match (end jingles, tower collapses, champion skills): warm them all
  const FREQUENT = ['rifle', 'gun', 'mg', 'cannon', 'missile', 'laser', 'elec', 'expS', 'expM', 'coin', 'genB', 'genA', 'slash', 'click', 'start', 'fail', 'warning',
    'win', 'clear', 'expB', 'quake', 'charge', 'genS', 'genSS', 'handgun', 'laserBig', 'energy', 'ice', 'spray', 'swing', 'reinforce', 'rankUp', 'rankUpSS', 'pickSS', 'purchase', 'beam', 'expSF'];
  function preload() {
    if (web) FREQUENT.forEach(load);
    else FREQUENT.slice(0, 11).forEach(get);
  }

  // hold / resume the current track (pause menu)
  function pauseMusic(p) { held = !!p; if (!bgm) return; if (p) bgm.pause(); else if (!document.hidden) bgm.play().catch(() => {}); }

  window.SFX = { play, music, pauseMusic, setMuted, setVolume, getVolume, preload, get muted() { return muted; }, get userMuted() { return userMuted; } };
})();
