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

  // voice lines: 'ann:<line>' (the original minigame announcer) and 'unit:<card>_<deploy|skill|win>' (the character's own line)
  const ANN_MP3 = new Set(['bossalert', 'clear', 'danger', 'levelup', 'stageclear']);
  function urlOf(key) {
    if (window.SND[key]) return window.SND[key];
    const i = key.indexOf(':');
    if (i < 0) return null;
    const kind = key.slice(0, i), name = key.slice(i + 1);
    return kind === 'ann' ? `assets/voice/ann/${name}.${ANN_MP3.has(name) ? 'mp3' : 'wav'}` : kind === 'unit' ? `assets/voice/unit/${name}.mp3` : null;
  }
  const missing = new Set(); // lines with no file (a card without a voice): asked once, then skipped
  function load(key) {
    const url = urlOf(key);
    if (buffers[key] || loading[key] || !url || missing.has(key)) return;
    const c = ensureCtx();
    if (!c) return;
    loading[key] = fetch(url).then((r) => { if (!r.ok) throw new Error(r.status); return r; }).then((r) => r.arrayBuffer())
      .then((ab) => new Promise((res, rej) => c.decodeAudioData(ab, res, rej)))
      .then((buf) => { buffers[key] = buf; })
      .catch(() => { missing.add(key); /* leave it silent */ });
  }

  // one voice at a time: a line plays over the effects; a more important one cuts a lesser one, an equal one waits its turn
  let vSrc = null, vEnd = 0, vPrio = 0;
  function voice(key, vol = 1, prio = 1) {
    if (muted || !web) return false;
    const c = ensureCtx(), buf = buffers[key];
    if (!buf) { load(key); return false; }
    if (c.state !== 'running') return false;
    const now = performance.now();
    if (now < vEnd && prio <= vPrio) return false;
    if (vSrc && now < vEnd) { try { vSrc.stop(); } catch (e) { /* ended */ } }
    const src = c.createBufferSource(), g = c.createGain();
    g.gain.value = Math.min(1, VOL.sfx * 2.1 * vol);
    src.buffer = buf; src.connect(g).connect(sfxGain); src.start();
    vSrc = src; vEnd = now + buf.duration * 1000; vPrio = prio;
    return true;
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
  const PHONE = /[?&]mobile=1\b/.test(location.search) || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  function preload() {
    if (web) ['ann:levelup', 'ann:stageclear', 'ann:battlestart', 'ann:3', 'ann:2', 'ann:1', 'ann:gamestart'].forEach(load); // menu and opening lines (the rest warm at battle start)
    if (web) (PHONE ? FREQUENT.slice(0, 17) : FREQUENT).forEach(load); // phones warm only the combat sounds (decoded audio is ~10x the mp3: ~18 MB for all of them)
    else FREQUENT.slice(0, 11).forEach(get);
  }

  // the sounds a battle's big moments need, decoded before the first one (play() on a cold sound only starts loading it)
  function warm(keys) { if (web) keys.forEach(load); else keys.filter((k) => window.SND[k]).forEach(get); }

  // hold / resume the current track (pause menu)
  function pauseMusic(p) { held = !!p; if (!bgm) return; if (p) bgm.pause(); else if (!document.hidden) bgm.play().catch(() => {}); }

  window.SFX = { warm, voice, hasVoice: (k) => !!buffers[k], play, music, pauseMusic, setMuted, setVolume, getVolume, preload, get muted() { return muted; }, get userMuted() { return userMuted; } };
})();
