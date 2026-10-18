// Automated smoke test: open index.html?smoke=1 (add &mute=1 for silence).
// Plays full matches with a simple bot for both factions, every mode and every arena, uses champion skills, opens a
// crate, then restores the player's save. Results (and any error) are shown on screen and in window.SMOKE.
(function () {
  if (!/[?&]smoke=1(&|$)/.test(location.search)) return;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (f, ms) => { const t0 = Date.now(); while (!f() && Date.now() - t0 < ms) await wait(100); return f(); };
  const out = { runs: [], errors: [], done: false };
  window.SMOKE = out;
  window.addEventListener('error', (e) => out.errors.push(`${e.message} @${(e.filename || '').split('/').pop()}:${e.lineno}`));
  window.addEventListener('unhandledrejection', (e) => out.errors.push('promise: ' + (e.reason && e.reason.message || e.reason)));

  function panel() {
    let el = document.getElementById('smokePanel');
    if (!el) {
      el = document.createElement('pre');
      el.id = 'smokePanel';
      el.style.cssText = 'position:fixed;left:8px;top:8px;z-index:999;max-width:94vw;max-height:60vh;overflow:auto;background:rgba(0,0,0,.85);color:#9f9;font:11px monospace;padding:8px;border:1px solid #3a3;pointer-events:none;white-space:pre-wrap';
      document.body.appendChild(el);
    }
    el.textContent = `SMOKE ${out.done ? 'DONE' : 'running'} · ${out.runs.length} matches · errors ${out.errors.length}\n` +
      out.runs.map((r) => r.join(' | ')).join('\n') + (out.errors.length ? '\nERRORS:\n' + out.errors.join('\n') : '');
    el.style.color = out.errors.length ? '#f99' : '#9f9';
  }

  // the bot: defends what crosses, pushes at high energy, fires champion skills in fights
  function bot(G) {
    const S = G.sides.blue, D = DATA.card;
    const threats = G.ents.filter((e) => e.side === 'red' && e.alive && e.kind === 'troop' && e.z < 2).sort((a, b) => a.z - b.z);
    if (threats.length && S.elixir >= 4) {
      const t = threats[0];
      const sp = S.hand.findIndex((id) => D[id].type === 'spell' && D[id].cost <= S.elixir);
      if (sp >= 0 && threats.length >= 3) { GAME._playCard('blue', sp, t.x, t.z); return; }
      const i = S.hand.findIndex((id) => { const c = D[id]; return c.type === 'troop' && c.aim !== 'buildings' && (!t.air || c.hits === 'all') && c.cost <= S.elixir; });
      if (i >= 0) GAME._playCard('blue', i, Math.max(-8, Math.min(8, t.x)), Math.max(-14, Math.min(-2, t.z - 2.5)));
    } else if (S.elixir >= 7 && S.hand.some((id) => D[id].type === 'building' && D[id].cost <= S.elixir)) {
      GAME._playCard('blue', S.hand.findIndex((id) => D[id].type === 'building' && D[id].cost <= S.elixir), (Math.random() < 0.5 ? -1 : 1) * 2, -8);
    } else if (S.elixir >= 8) {
      const i = S.hand.findIndex((id) => D[id].type === 'troop' && D[id].cost <= S.elixir);
      if (i >= 0) GAME._playCard('blue', i, (Math.random() < 0.5 ? -1 : 1) * 5.5, -3);
    }
    // overclock our own push once it reaches a tower
    const oc = S.hand.findIndex((id) => D[id].spell === 'rage' && D[id].cost <= S.elixir);
    const atk = G.ents.find((e) => e.side === 'blue' && e.alive && e.kind === 'troop' && e.state === 'attack' && e.z > 2);
    if (oc >= 0 && atk) GAME._playCard('blue', oc, atk.x, atk.z);
    for (const u of GAME.champions('blue')) if (u.state === 'attack') GAME.useSkill(u);
  }

  async function match(faction, mode, trophy, diff) {
    const G = GAME.G;
    Object.assign(UI.save, { faction, mode, trophy, diff, tutorial: true });
    // practice: the opponent plays the player's other saved deck; nothing on the record may move
    const prac = BAL.modes[mode].key === 'practice', pf = faction === 'orca' ? 'iron' : 'orca';
    if (prac) UI.save.practiceFoe = pf;
    const RK = ['trophy', 'best', 'gold', 'wins', 'losses', 'draws', 'streak', 'chests', 'cards', 'missions'];
    const rec0 = prac && RK.map((k) => JSON.stringify(UI.save[k]));
    document.getElementById('result').className = 'screen';
    document.getElementById('btnBattle').click();
    if (!await until(() => G.phase === 'countdown', 45000)) { out.errors.push(`load timeout ${faction}/${mode}/${trophy}`); return; }
    if (prac && G.sides.red.deck.slice().sort().join() !== UI.save.decks[pf].slice().sort().join()) out.errors.push(`practice: the opponent is not playing the picked deck (${G.sides.red.deck.join()})`);
    const t0 = performance.now();
    let steps = 0;
    for (let s = 0; s < 640 && G.phase !== 'ended'; s++) {
      GAME._run(0.5); bot(G); steps++; if (s % 40 === 0) await wait(0);
      // once: the window is resized mid-match (rotation, split screen): the board must still map onto the stage
      if (s === 20 && !match.resized) {
        match.resized = true;
        window.dispatchEvent(new Event('resize')); await wait(400);
        const r = document.getElementById('stage').getBoundingClientRect();
        for (const t of G.sides.blue.towers.concat(G.sides.red.towers)) { const p = GAME._toScreen(t.x, t.z * 0.86); if (!(p[0] > 0 && p[0] < r.width && p[1] > 0 && p[1] < r.height)) out.errors.push(`check: after a resize a ${t.side} ${t.type} tower maps off the stage (${p.map(Math.round)})`); }
      }
    }
    const ms = (performance.now() - t0) / steps;
    await until(() => document.getElementById('result').classList.contains('on'), 5000);
    if (prac) { const moved = RK.filter((k, i) => JSON.stringify(UI.save[k]) !== rec0[i]); if (moved.length) out.errors.push('practice: the match changed ' + moved.join(', ')); }
    if (prac && !document.getElementById('resReward').hidden) out.errors.push('practice: the reward row is shown');
    const info = GAME.info;
    out.runs.push([faction, BAL.modes[mode].key, 'arena' + DATA.arenaOf(trophy), BAL.diffs[diff].key, G.result, `${G.sides.blue.crowns}-${G.sides.red.crowns}`,
      `skills ${G.stats.blue.skills}/${G.stats.red.skills}`, `${ms.toFixed(1)}ms/0.5s`, `geo ${info.geo} tex ${info.tex}`]);
    panel();
    document.getElementById('btnHome').click();
    await wait(200);
    // after leaving, nothing of the match may remain
    const left = GAME.info;
    if (G.ents.length || G.projs.length || G.zones.length || G.decals.length) out.errors.push(`leftovers after leave: ents ${G.ents.length} projs ${G.projs.length} zones ${G.zones.length} decals ${G.decals.length}`);
    if (window.GAME && GAME.G && Math.abs((GAME.cameraZoom || 1) - 1) > 1e-6) out.errors.push('camera zoom not reset');
    // (the effect system adds a batched mesh the first time each texture/blend pair is used: two matches warm those up before the baseline)
    base.n = (base.n || 0) + 1;
    if (base.n <= 2) base.scene = Math.max(base.scene || 0, left.scene); else if (left.scene > base.scene + 2) out.errors.push(`scene grew ${base.scene} -> ${left.scene}`);
    if (left.fx > 40) out.errors.push(`particles left ${left.fx}`);
  }
  const base = {};

  // focused checks of individual systems (run after the full matches)
  async function unitChecks() {
    const ok = (cond, msg) => { if (!cond) out.errors.push('check: ' + msg); };
    // 1. an old save (no 'seen' flag) still gets NEW badges for cards added by an update
    Object.assign(UI.save, { trophy: 900, seen: undefined, newCards: {} });
    delete UI.save.cards.nymph;
    UI._sync();
    ok(UI.save.newCards.nymph === 1, 'migrated save: NEW badge on a card added by an update');
    // 2. trophy road with every crate slot full stops before the crate (nothing converted away)
    Object.assign(UI.save, { trophy: 620, road: 0, chests: [{ k: 'normal', t0: null }, { k: 'normal', t0: null }, { k: 'normal', t0: null }, { k: 'normal', t0: null }] });
    const g0 = UI.save.gold;
    document.getElementById('btnDeckDone').click();
    document.getElementById('btnRoadClaim').click();
    ok(UI.save.road === 400 && UI.save.gold > g0, `road claim with full slots stops at 400 (got ${UI.save.road})`);
    const g1 = UI.save.gold; document.getElementById('btnRoadClaim').click(); // again: the first reward is the blocked crate
    ok(UI.save.road === 400 && UI.save.gold === g1, 'road claim blocked by a full slot changes nothing');
    document.getElementById('roadOv').hidden = true;
    UI.save.chests = [];
    // 3. in a battle: heal, every champion skill of both factions, the AI punish path, a 30-unit load
    Object.assign(UI.save, { faction: 'orca', mode: 0, trophy: 2600, diff: 2 });
    document.getElementById('btnBattle').click();
    const G = GAME.G;
    if (!await until(() => G.phase === 'countdown', 45000)) { out.errors.push('unit checks: load timeout'); return; }
    GAME._run(0.1);
    G.sides.red.ai.t = 1e9;
    const put = (side, id, x, z) => { const S = G.sides[side]; S.hand[0] = id; S.elixir = 10; return GAME._playCard(side, 0, x, z); };
    const champs = DATA.CARDS.filter((c) => c.skill);
    // the towers must outlast this test (fourteen champion skills would otherwise end the match early)
    for (const s of ['blue', 'red']) G.sides[s].towers.forEach((t) => { t.hp = t.max = 1e7; });
    for (const c of champs) await SD.prepare(c.rig);
    await SD.prepare('nymph');
    put('blue', 'nymph', 0, -10); put('blue', 'brownie', 0, -11);
    GAME._run(1.3);
    const hurt = G.ents.filter((e) => e.card && e.card.id === 'brownie' && e.side === 'blue' && e.alive);
    hurt.forEach((b) => { b.hp = 40; });
    GAME._run(3);
    ok(hurt.some((b) => b.alive && b.hp > 40), 'healer mends nearby troops');
    for (const c of champs) {
      const side = c.faction === 'orca' ? 'blue' : 'red';
      const u = put(side, c.id, side === 'blue' ? 3 : -3, side === 'blue' ? -4 : 4)[0];
      GAME._run(1.5);
      G.sides[side].elixir = 10;
      // isolate from the previous champions' stuns / freezes (and keep it alive for the check)
      Object.assign(u, { skillCd: 0, stunT: 0, freezeT: 0, casting: 0 });
      if (!u.alive) { out.errors.push('check: champion died before its skill test: ' + c.id); continue; }
      // aimable skills are fired the player's way (dragged onto a spot); the rest auto-aim
      if (GAME.aimable(u)) { const n0 = GAME.info.fx; for (let k = 0; k < 5; k++) GAME.aimPreview(u, u.x + k, u.z + 2); const n1 = GAME.info.fx; GAME.aimHide(); ok(n1 - n0 <= 9, `aim preview reuses its marks (${n0} -> ${n1})`); }
      const aimed = GAME.aimable(u) ? { x: u.x + 2, z: u.z + (side === 'blue' ? 3 : -3) } : undefined;
      ok(GAME.useSkill(u, aimed), `skill fires: ${c.id} (deploy ${u.deployT.toFixed(2)})`);
      if (aimed) ok(u.skillSpot && Math.hypot(u.skillSpot[0] - aimed.x, u.skillSpot[1] - aimed.z) < 0.01, 'aimed skill keeps the dragged spot: ' + c.id);
      GAME._run(1.2);
    }
    // a rig that failed to load: the card portrait stands in, the unit fights and dies, and nothing is left behind
    {
      const orig = SD.ready, rig = DATA.card.brownie.rig;
      SD.ready = (r) => (r === rig ? false : orig(r));
      try {
        const us = put('blue', 'brownie', -3, -6);
        ok(us.length > 0 && us.every((u) => u.placeholder && !u.sd), 'failed rig load: the portrait stands in');
        GAME._run(1.5);
        for (const u of us) GAME._damage(u, 1e6);
        GAME._run(3);
        ok(us.every((u) => !G.ents.includes(u) && !u.placeholder), 'failed rig load: the stand-in is cleaned up');
      } finally { SD.ready = orig; }
    }
    // an error thrown outside the frame (a stray promise) is caught by the game's own handler and named
    if (G.phase === 'play') {
      G.errShown = false; G.errStage = null;
      Promise.reject(new Error('smoke-async-probe'));
      await wait(60);
      for (let i = out.errors.length - 1; i >= 0; i--) if (/smoke-async-probe/.test(out.errors[i])) out.errors.splice(i, 1); // (our own listener saw it too)
      ok(G.errShown && G.errStage === 'async', 'a stray async error is reported by the game');
      G.errShown = false;
    }
    // a ground dash aimed straight across the chasm (off the bridges) stops on the bank
    {
      const ex = put('red', 'executioner', 0, 3.4)[0];
      GAME._run(1.3);
      Object.assign(ex, { skillCd: 0, stunT: 0, freezeT: 0, casting: 0, x: 0, z: 3.4 });
      G.sides.red.elixir = 10;
      GAME.useSkill(ex, { x: 0, z: -5 });
      GAME._run(1);
      const inChasm = Math.abs(ex.z) < BAL.river && Math.abs(Math.abs(ex.x) - BAL.bridgeX) > BAL.bridgeW;
      ok(!ex.alive || !inChasm, `dash across the chasm stops on the bank (at ${ex.x.toFixed(2)}, ${ex.z.toFixed(2)})`);
    }
    G.lastBlue = { lane: -1, t: G.time, cost: 5 };
    G.sides.blue.elixir = 1; G.sides.red.elixir = 7; G.sides.red.ai.t = 0;
    GAME._run(0.05);
    for (let i = 0; i < 30; i++) put(i % 2 ? 'blue' : 'red', i % 2 ? 'brownie' : 'nightchick', (i % 6) - 3, i % 2 ? -3 : 3);
    GAME._run(2);
    // performance with the field full: simulation alone, and whole frames (step + pose + draw); medians of a few runs
    const med = (a) => a.sort((x, y) => x - y)[a.length >> 1];
    const sims = [], frames = [];
    for (let k = 0; k < 3; k++) { const t0 = performance.now(); GAME._run(0.5); sims.push(performance.now() - t0); }
    for (let k = 0; k < 3; k++) { const t0 = performance.now(); for (let s = 0; s < 20; s++) GAME._run(1 / 60); frames.push((performance.now() - t0) / 20); }
    const ms = Math.min(...sims), fr = med(frames); // the fastest run: background load on the test machine only ever adds time
    ok(ms < 90, `crowded field: 0.5 s simulated in ${ms.toFixed(1)} ms (budget 90)`);
    ok(fr < 16, `crowded field: ${fr.toFixed(1)} ms per frame (budget 16)`);
    const calls = GAME.info ? GAME.info.calls : 0; // draw calls of the last crowded frame (batched effects and shared rig materials keep this low)
    ok(calls > 0 && calls <= 380, `crowded field: ${calls} draw calls (budget 380; ~3 per rig: every unit keeps its own tint/outline material)`);
    // the low tier (slow phones) on the same field: never more draws than the default tier
    { const lv0 = GAME.qualityLevel; GAME.setQuality(2, true); for (let s = 0; s < 3; s++) GAME._run(1 / 60); const c2 = GAME.info.calls; GAME.setQuality(lv0, true); ok(c2 > 0 && c2 <= calls, `crowded field at low quality: ${c2} draw calls (default tier ${calls})`); }
    // draws per troop rig (blend runs in draw order): most rigs are a single draw; the figure is logged so a regression shows up
    { let draws = 0, n = 0; for (const e of G.ents) if (e.kind === 'troop' && e.sd && (e.card.id === 'brownie' || e.card.id === 'nightchick')) { n++; /* the placed crowd only: the AI's own picks would make the figure random */ e.sd.root.traverse((o) => { if (o.isMesh) draws += Math.max(1, o.geometry.groups.length); }); }
      if (n) { out.runs.push(['draws per rig', (draws / n).toFixed(2), `${n} troops`]); ok(draws / n <= 3.2, `troop rigs average ${(draws / n).toFixed(2)} draws (budget 3.2)`); } }
    out.runs.push(['unit checks', `${champs.length} champion skills`, `sim ${ms.toFixed(1)}ms/0.5s`, `frame ${fr.toFixed(1)}ms`, `${calls} draws`, `${G.ents.length} entities`]);
    GAME.surrender();
    await until(() => document.getElementById('result').classList.contains('on'), 5000);
    document.getElementById('btnHome').click();
    await wait(200);
    const cp = GAME.cameraPos;
    ok(Math.abs(cp[0]) < 1e-6 && Math.abs(cp[1]) < 0.5 && GAME.cameraZoom === 1, 'camera reset after leaving');
    panel();
  }


  // the graphics device lost mid-match (phones do this under memory pressure): the match pauses, comes back and keeps drawing new units
  async function contextLossCheck() {
    const ok = (cond, msg) => { if (!cond) out.errors.push('check: ' + msg); };
    const G = GAME.G;
    Object.assign(UI.save, { faction: 'orca', mode: 0, trophy: 0, diff: 1, tutorial: true });
    document.getElementById('result').className = 'screen';
    document.getElementById('btnBattle').click();
    if (!await until(() => G.phase === 'countdown', 45000)) { out.errors.push('context-loss: load timeout'); return; }
    GAME._run(3.2);
    const cv = document.querySelector('#stage canvas'), gl = cv && (cv.getContext('webgl2') || cv.getContext('webgl')), ext = gl && gl.getExtension('WEBGL_lose_context');
    if (!ext) { out.runs.push(['context loss', 'not supported here']); } else {
      ext.loseContext();
      await until(() => G.lost, 2000);
      ok(G.lost, 'context loss is noticed');
      ext.restoreContext();
      await until(() => !G.lost, 3000);
      ok(!G.lost, 'context restore resumes drawing');
      const S = G.sides.blue, id = S.deck.find((c) => DATA.card[c].type === 'troop'); // a troop card (a spell would deploy nothing)
      S.hand[0] = id; S.elixir = 10; GAME._playCard('blue', 0, 0, -6);
      let threw = null; try { GAME._run(1); } catch (e) { threw = e; }
      ok(!threw, 'matches run on after a context restore' + (threw ? ': ' + threw.message : ''));
      ok(G.ents.some((e) => e.kind === 'troop' && e.side === 'blue' && e.alive), `a unit deploys after the restore (${id})`);
      // the restored frame actually has a picture (read straight after a render, before the buffer is cleared)
      GAME._run(1 / 60);
      const px = new Uint8Array(4 * 9), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight; let lit = 0;
      for (let i = 0; i < 9; i++) { gl.readPixels(Math.round(w * (0.25 + 0.25 * (i % 3))), Math.round(h * (0.25 + 0.25 * Math.floor(i / 3))), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px.subarray(i * 4, i * 4 + 4)); if (px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2] > 30) lit++; }
      ok(lit >= 6, `the restored frame is drawn (${lit}/9 sample points lit)`);
      out.runs.push(['context loss', 'lost → restored → deploy ok']);
    }
    // commander support: orca repairs towers and adds energy, iron drops drones; once per match, never before it is charged
    {
      const B = G.sides.blue, R = G.sides.red;
      ok(!GAME._useSupport('blue') || B.sup.charge >= 1, 'support cannot be called before it is charged');
      B.sup.charge = R.sup.charge = 1; B.sup.used = R.sup.used = false;
      const tw = B.towers.find((t) => t.alive); tw.hp = tw.max * 0.5; const e0 = B.elixir = 3;
      const before = G.ents.filter((e) => e.kind === 'troop' && e.side === 'red').length;
      const okB = GAME._useSupport('blue'), okR = GAME._useSupport('red');
      ok(okB && B.faction === 'orca' ? tw.hp > tw.max * 0.6 && B.elixir >= e0 + 1.9 : okB, `orca support repairs and adds energy (${Math.round(tw.hp)}/${tw.max})`);
      ok(okR && G.ents.filter((e) => e.kind === 'troop' && e.side === 'red').length >= before + 3, 'iron support drops drones');
      ok(!GAME._useSupport('blue'), 'support is once per match');
      out.runs.push(['commander support', `blue ${B.faction}`, `red ${R.faction}`]);
    }
    // the auto-quality governor: sustained heavy frames step quality down, a long calm stretch steps it back up
    if (GAME._perfTick && UI.save.autoQuality !== false) {
      const q0 = GAME.qualityLevel;
      if (q0 < 2) {
        for (let i = 0; i < 240; i++) GAME._perfTick(25, 16);
        ok(GAME.qualityLevel === q0 + 1, `slow frames lower the quality (${q0} → ${GAME.qualityLevel})`);
        for (let i = 0; i < 720; i++) GAME._perfTick(16.7, 3);
        ok(GAME.qualityLevel === q0, `calm frames restore the starting quality (${q0} → ${GAME.qualityLevel})`);
        // a GPU-bound phone: light JS work but ~30 fps frames must not climb back into the costly setting
        for (let i = 0; i < 240; i++) GAME._perfTick(25, 16);
        const q1 = GAME.qualityLevel;
        for (let i = 0; i < 720; i++) GAME._perfTick(34, 3);
        ok(GAME.qualityLevel >= q1, `long frames with light work do not raise quality (${q1} → ${GAME.qualityLevel})`);
        for (let i = 0; i < 720; i++) GAME._perfTick(16.7, 3);
        // and on a screen that has shown 60 Hz, ~30 fps with light JS (fill-bound) steps quality down
        const q2 = GAME.qualityLevel;
        if (q2 < 2) { for (let i = 0; i < 240; i++) GAME._perfTick(34, 3); ok(GAME.qualityLevel === q2 + 1, `fill-bound frames lower the quality (${q2} → ${GAME.qualityLevel})`); for (let i = 0; i < 720; i++) GAME._perfTick(16.7, 3); }
        out.runs.push(['auto quality', `${q0} → slow → ${GAME.qualityLevel}`]);
      }
    }
    // a frame that throws must not end the match: the loop reports once and keeps running
    {
      const tick0 = UI.tick, toast0 = UI.toast; let thrown = 0, notes = 0, raf = 0;
      UI.tick = (g) => { if (thrown < 3) { thrown++; throw new Error('smoke: injected frame error'); } return tick0(g); };
      UI.toast = (msg, ...r) => { if (/오류/.test(msg)) notes++; return toast0(msg, ...r); };
      const c0 = G.clock;
      for (let i = 0; i < 60; i++) { GAME._frame(16.7); raf++; } // real frames through the loop's own error guard
      UI.tick = tick0; UI.toast = toast0;
      if (raf && thrown) {
        ok(notes === 1, `a throwing frame is reported once (${notes} notices for ${thrown} errors)`);
        ok(G.phase === 'play' && G.clock < c0, `the match runs on after frame errors (clock ${c0.toFixed(1)} → ${G.clock.toFixed(1)})`);
      }
      out.runs.push(['frame errors', `${thrown} injected`, `${notes} notice`, `${raf} frames`]);
    }
    // leaving the app (tab hidden, phone locked) pauses the match; nothing moves until the player resumes
    {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); // shadows the real getter on Document.prototype
      document.dispatchEvent(new Event('visibilitychange'));
      delete document.hidden;
      ok(G.paused, 'a hidden tab pauses the match');
      const c0 = G.clock; await wait(400);
      ok(G.clock === c0, `the clock stands still while paused (${c0.toFixed(2)} → ${G.clock.toFixed(2)})`);
      UI.pause(false);
      ok(!G.paused, 'the match resumes');
    }
    GAME.surrender();
    await until(() => document.getElementById('result').classList.contains('on'), 5000);
    document.getElementById('btnHome').click();
    await wait(200);
  }

  // a damaged save (bad JSON, wrong types, unknown keys) must still boot to the title with sane values
  async function corruptSaveCheck(backup) {
    const ok = (cond, msg) => { if (!cond) out.errors.push('check: ' + msg); };
    const cases = ['{not json', JSON.stringify({ trophy: 'x', gold: -5, faction: 'zzz', cards: 5, decks: null, chests: [{ k: 'bogus' }, null], music: 'loud', quality: 9, newCards: { nope: 1 } })];
    for (const raw of cases) {
      try { localStorage.setItem('lastroyal.v2', raw); } catch (e) { return; }
      const fr = document.createElement('iframe'); fr.style.cssText = 'position:fixed;left:-9999px;width:375px;height:812px';
      let errs = 0; fr.src = 'index.html?mute=1&corrupt=' + Date.now();
      document.body.appendChild(fr);
      await until(() => fr.contentWindow && fr.contentWindow.addEventListener, 3000);
      try { fr.contentWindow.addEventListener('error', () => errs++); } catch (e) { /* cross-frame */ }
      const up = await until(() => { try { const d = fr.contentDocument; return d && d.getElementById('title') && d.getElementById('title').classList.contains('on') && fr.contentWindow.UI; } catch (e) { return false; } }, 15000);
      const s = up && fr.contentWindow.UI.save;
      ok(up, `a damaged save still boots to the title (${raw.slice(0, 12)}…)`);
      if (s) ok(s.trophy === 0 && s.gold >= 0 && s.faction === 'orca' && typeof s.cards === 'object' && s.chests.length === 0 && s.music === 1 && s.quality === null, 'a damaged save is repaired to sane values');
      ok(!errs, `no script errors while booting a damaged save (${errs})`);
      fr.remove();
    }
    try { localStorage.setItem('lastroyal.v2', backup); } catch (e) { /* ignore */ }
    out.runs.push(['damaged save', cases.length + ' cases boot']);
  }

  // every daily-operation rule, forced in turn: each must actually change the match the way its text says
  async function mutatorChecks() {
    const ok = (cond, msg) => { if (!cond) out.errors.push('check: ' + msg); };
    const real = DATA.mutatorOf, G = GAME.G;
    try {
      for (const M of DATA.MUTATORS) {
        DATA.mutatorOf = () => M;
        Object.assign(UI.save, { faction: 'iron', mode: 3, trophy: 1600, diff: 1, tutorial: true });
        document.getElementById('result').className = 'screen';
        document.getElementById('btnBattle').click();
        if (!await until(() => G.phase === 'countdown', 45000)) { out.errors.push('mutator load timeout ' + M.key); continue; }
        GAME._run(3.2);
        G.sides.red.ai.t = 1e9;
        ok(G.mut === M, `${M.key}: rule active`);
        ok(!document.getElementById('mutTag').hidden && document.getElementById('mutTag').textContent === M.name, `${M.key}: HUD chip`);
        ok(Array.isArray(G.hints), `${M.key}: VS hints`);
        if (M.mirror) ok(G.sides.red.faction === 'iron' && G.sides.red.deck.slice().sort().join() === G.sides.blue.deck.slice().sort().join(), 'mirror: same faction and deck');
        if (M.time) ok(G.clock <= M.time && G.clock > M.time - 5, `${M.key}: match time ${G.clock.toFixed(1)}`);
        if (M.rush) ok(G.mult === 2, `${M.key}: double energy from the start`);
        const S = G.sides.blue, ch = DATA.CARDS.find((c) => c.skill && c.faction === 'iron');
        S.hand[0] = ch.id; S.elixir = 10;
        const u = GAME._playCard('blue', 0, 0, -8)[0];
        const lvm = DATA.LEVEL.mult(u.lv), sy = S.syn, bond = sy && sy.tier && ch.faction === sy.faction ? sy : { hp: 1, dmg: 1 }; // (the deck's faction bond applies on top)
        ok(Math.abs(u.max - ch.hp * lvm * (M.hp || 1) * bond.hp) < 2, `${M.key}: champion HP ${u.max.toFixed(0)}`);
        ok(!ch.dmg || Math.abs(u.atk.dmg - ch.dmg * lvm * bond.dmg) < 2, `${M.key}: damage unchanged (${u.atk.dmg})`);
        ok(GAME.skillState(u).cost === Math.max(1, ch.skill.cost + (M.skillCost || 0)), `${M.key}: skill cost`);
        GAME.surrender();
        await until(() => document.getElementById('result').classList.contains('on'), 5000);
        document.getElementById('btnHome').click();
        await wait(200);
      }
      out.runs.push(['mutator checks', DATA.MUTATORS.map((m) => m.key).join(',')]);
    } finally { DATA.mutatorOf = real; }
    // every way a match can end renders its result screen: a draw on equal tower health, a win on crowns at time-out
    for (const [label, setup, cls, title] of [
      ['draw', () => { G.overtime = true; G.clock = 0.05; }, 'draw', '무승부'],
      ['crowns', () => { G.sides.blue.crowns = 1; G.clock = 0.05; }, 'win', '승리!'],
    ]) {
      Object.assign(UI.save, { faction: 'orca', mode: 0, trophy: 0, diff: 1 });
      document.getElementById('result').className = 'screen';
      document.getElementById('btnBattle').click();
      if (!await until(() => G.phase === 'countdown', 45000)) { out.errors.push('result-path load timeout ' + label); continue; }
      GAME._run(3.2);
      G.sides.red.ai.t = 1e9;
      setup();
      GAME._run(0.3);
      await until(() => document.getElementById('result').classList.contains('on'), 5000);
      const el = document.getElementById('result');
      ok(el.classList.contains(cls) && document.getElementById('resTitle').textContent === title && document.getElementById('resReason').textContent, `result screen for a ${label} ending (${el.className} / ${document.getElementById('resTitle').textContent})`);
      document.getElementById('btnHome').click();
      await wait(200);
    }
    out.runs.push(['result paths', 'draw, crowns']);
    // a real-time run (requestAnimationFrame, not the test stepper): the clock must move on its own
    Object.assign(UI.save, { faction: 'orca', mode: 0, trophy: 0, diff: 0 });
    document.getElementById('btnBattle').click();
    if (await until(() => G.phase === 'countdown' || G.phase === 'play', 45000)) {
      // progress = countdown spent + match time; judged against how many animation frames the browser actually gave
      // a normal match after the operations: no rule chip, no stale rule card (what is actually displayed)
      const shown = (id) => getComputedStyle(document.getElementById(id)).display !== 'none';
      ok(!shown('mutTag') && !shown('vsRule'), 'normal match shows no daily-operation chip or card');
      const prog = () => G.time + (3 - Math.max(0, G.cdT || 0));
      let raf = 0, live = true; const tick = () => { raf++; if (live) requestAnimationFrame(tick); }; requestAnimationFrame(tick);
      const p0 = prog();
      await wait(4500);
      live = false;
      const dp = prog() - p0;
      out.runs.push(['real-time run', G.phase, `+${dp.toFixed(2)}s game time`, `rAF ${raf}`]);
      if (raf >= 60) ok(dp > 1.5, `real-time loop advances the match (+${dp.toFixed(2)}s over ${raf} frames)`);
      GAME.surrender();
      await until(() => document.getElementById('result').classList.contains('on'), 5000);
      document.getElementById('btnHome').click();
      await wait(200);
    }
    panel();
  }
  const { BAL } = DATA;
  window.addEventListener('load', async () => {
    await until(() => window.GAME && GAME.G && document.getElementById('title').classList.contains('on'), 15000);
    await wait(1500);
    const backup = JSON.stringify(UI.save);
    panel();
    try {
      // every image file the game names, and the CSS backgrounds set from script, must actually load (a 404 is not a JS error)
      {
        const urls = new Set(Object.values(window.IMG || {}).filter((v) => typeof v === 'string' && !v.startsWith('data:')));
        const tb = document.querySelector('#title .tbg'), bg = tb ? getComputedStyle(tb).backgroundImage : '';
        for (const x of bg.matchAll(/url\("?([^")]+)"?\)/g)) if (!x[1].startsWith('data:')) urls.add(x[1]);
        DATA.CHESTS.forEach((c) => urls.add('assets/icon/crate_' + c.key + '.png'));
        const bad = [];
        await Promise.all([...urls].map((u) => fetch(u, { method: 'HEAD' }).then((r) => { if (!r.ok) bad.push(r.status + ' ' + u); }).catch(() => bad.push('fail ' + u))));
        if (bad.length) out.errors.push('missing images: ' + bad.slice(0, 5).join(', '));
        out.runs.push(['image files', urls.size + ' checked']);
      }
      // free deck building: every card is open at 0 trophies, and a deck may mix orca and iron cards
      {
        const keep = UI.save.decks.orca.slice(), t0 = UI.save.trophy, iron = DATA.CARDS.find((c) => c.faction === 'iron' && c.type === 'troop' && !keep.includes(c.id));
        UI.save.trophy = 0; UI.save.decks.orca = keep.slice(0, 7).concat(iron.id); UI._sync();
        if (UI.save.decks.orca[7] !== iron.id) out.errors.push('check: a mixed orca/iron deck is kept');
        if (DATA.CARDS.some((c) => !UI.save.cards[c.id])) out.errors.push('check: every card is open from the start');
        UI.save.decks.orca = keep; UI.save.trophy = t0; UI._sync();
        out.runs.push(['free decks', `${DATA.CARDS.length} cards open`, 'mixed deck kept']);
        // faction bond: 6+ of one faction = tier 2, 4-5 = tier 1, a 4/4 split = none
        const orcaIds = DATA.byFaction('orca').map((c) => c.id), ironIds = DATA.byFaction('iron').map((c) => c.id);
        const t2 = DATA.synergyOf(orcaIds.slice(0, 8)), t1 = DATA.synergyOf(orcaIds.slice(0, 5).concat(ironIds.slice(0, 3))), t0s = DATA.synergyOf(orcaIds.slice(0, 4).concat(ironIds.slice(0, 4)));
        if (!(t2.tier === 2 && t2.hp > 1 && t1.tier === 1 && t0s.tier === 0 && t0s.hp === 1)) out.errors.push(`check: faction bond tiers (${t2.tier}/${t1.tier}/${t0s.tier})`);
      }
      const arenas = DATA.ARENAS.map((a) => a.trophy);
      let k = 0;
      for (const faction of ['orca', 'iron']) {
        for (let mode = 0; mode < BAL.modes.length; mode++) await match(faction, mode, arenas[k++ % arenas.length], k % 3);
      }
      // soak: the match-to-match footprint (scene objects, GPU geometries and textures, live effects) must not keep growing
      // the same seeded matches twice: the first pass fills the rig and texture caches, the replay must add nothing
      const rand0 = Math.random, seeded = (seed) => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      const soakPass = async () => { Math.random = seeded(20261016); try { for (let i = 0; i < arenas.length; i++) await match(i % 2 ? 'orca' : 'iron', 0, arenas[i], 1); } finally { Math.random = rand0; } };
      await soakPass();
      const heap = () => (performance.memory ? performance.memory.usedJSHeapSize / 1048576 : 0); // MB (Chromium only)
      const s1 = GAME.info, l1 = SD.loads || 0, p1 = SD.pooled(), h1 = heap();
      await soakPass();
      const s2 = GAME.info, nr = ((SD.loads || 0) - l1) + Math.max(0, SD.pooled() - p1); // rigs (re)loaded after a cache eviction and idle instances newly pooled for reuse (both bounded by design) (matches still differ a little: real-time loading order)
      const h2 = heap();
      if (h1) { out.runs.push(['soak heap', `${h1.toFixed(0)}MB → ${h2.toFixed(0)}MB`]); if (h2 - h1 > 40 + nr * 1.5) out.errors.push(`check: JS heap grows across matches (${h1.toFixed(0)} → ${h2.toFixed(0)} MB)`); } // garbage collection timing makes this loose: only a real leak trips it
      if (s1 && s2) {
        out.runs.push(['soak', `scene ${s1.scene}→${s2.scene}`, `geo ${s1.geo}→${s2.geo}`, `tex ${s1.tex}→${s2.tex}`, `fx ${s1.fx}→${s2.fx}`, `${nr} rig loads / new pooled`]);
        if (s2.scene > s1.scene + 2) out.errors.push(`check: scene objects grow across matches (${s1.scene}→${s2.scene})`);
        if (s2.geo > s1.geo + 6 + nr * 4) out.errors.push(`check: geometries grow across matches beyond new rigs (${s1.geo}→${s2.geo}, +${nr} rigs)`);
        if (s2.tex > s1.tex + 6 + nr * 3) out.errors.push(`check: textures grow across matches beyond new rigs (${s1.tex}→${s2.tex}, +${nr} rigs)`);
      }
      await unitChecks();
      await mutatorChecks();
      await contextLossCheck();
      await corruptSaveCheck(backup);
      // every atlas sprite the stylesheet uses is defined (ui_assets.js was trimmed to what is referenced)
      {
        const used = new Set();
        for (const sh of document.styleSheets) { let rules = []; try { rules = sh.cssRules; } catch (e) { continue; } for (const r of rules) for (const m of (r.cssText || '').matchAll(/var\(--s-([a-z0-9_]+)\)/g)) used.add(m[1]); }
        const cs = getComputedStyle(document.documentElement), gone = [...used].filter((k) => !cs.getPropertyValue('--s-' + k).trim());
        if (!used.size || gone.length) out.errors.push('check: atlas sprites used by the css but missing: ' + (gone.join(', ') || 'none found at all'));
        // ...and their files are served, and the UI font is in
        for (const k of used) { const u = (cs.getPropertyValue('--s-' + k).match(/url\(["']?([^"')]+)/) || [])[1]; if (u) { const r = await fetch(u, { method: 'HEAD' }).catch(() => null); if (!r || !r.ok) out.errors.push('check: atlas file not served: ' + u); } }
        await document.fonts.ready;
        if (!document.fonts.check('700 16px Godo')) out.errors.push('check: the Godo UI font did not load');
      }
      // voice lines: every announcer line the game asks for and each orca card's deploy / skill / win line is on the server
      {
        const ann = ['battlestart', 'gamestart', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'timelimit', 'becareful', 'nice', 'great', 'aamazing', 'fail', 'perfect', 'notready'].concat(['danger', 'bossalert', 'clear', 'levelup', 'stageclear']).map((k) => `assets/voice/ann/${k}.mp3`);
        const units = DATA.CARDS.filter((c) => GAME.voiced(c)).flatMap((c) => ['deploy', 'skill', 'win'].map((k) => `assets/voice/unit/${c.id}_${k}.mp3`));
        const bgm = ['arena1', 'arena2', 'arena3', 'arena4'].map((k) => window.BGM[k]);
        const bad = [];
        const head = (u) => fetch(u, { method: 'HEAD' }).then((r) => r.ok, () => false);
        const all = ann.concat(units, bgm);
        for (let i = 0; i < all.length; i += 8) await Promise.all(all.slice(i, i + 8).map(async (u) => { if (!(await head(u)) && !(await head(u))) bad.push(u); })); // small batches, one retry: the dev server is single-threaded
        if (bad.length) out.errors.push('check: missing voice files: ' + bad.slice(0, 6).join(', ') + (bad.length > 6 ? ` (+${bad.length - 6})` : ''));
      }
      // a save that cannot be written (quota / private mode): one notice, the game keeps its progress in memory
      {
        const orig = Storage.prototype.setItem, tr0 = UI.save.trophy;
        Storage.prototype.setItem = function () { throw new DOMException('full', 'QuotaExceededError'); };
        try {
          document.querySelector('#diffSel [data-d="0"]').click(); document.querySelector('#diffSel [data-d="1"]').click();
          await wait(50);
          const t = document.getElementById('toast').textContent;
          if (!/저장/.test(t)) out.errors.push('check: a failed save write gives no notice (' + t + ')');
          if (UI.save.trophy !== tr0 || UI.save.diff !== 1) out.errors.push('check: a failed save write lost the in-memory progress');
        } finally { Storage.prototype.setItem = orig; }
      }
      // a crate: start unlocking, rush it with parts (double tap), open it
      UI.save.chests = [{ k: 'epic', t0: null }];
      UI.save.gold = Math.max(UI.save.gold, 999);
      document.getElementById('btnDeckDone').click();
      const tap = () => document.querySelector('#chestRow button.chest').click();
      tap(); await wait(100); // start the unlock
      tap(); await wait(100); tap(); await wait(100); // rush: arm, confirm
      if (!(UI.save.chests[0] && UI.save.chests[0].t0 && Date.now() - UI.save.chests[0].t0 >= 299000)) out.errors.push('crate rush did not finish the unlock');
      tap();
      await wait(300);
      out.runs.push(['crate opened', document.getElementById('chestList').childElementCount + ' rewards']);
      document.getElementById('btnChestClose').click();
    } catch (e) { out.errors.push('smoke: ' + (e.stack || e)); }
    // put the player's progress back exactly as it was
    try { localStorage.setItem('lastroyal.v2', backup); } catch (e) { /* ignore */ }
    Object.keys(UI.save).forEach((k2) => delete UI.save[k2]);
    Object.assign(UI.save, JSON.parse(backup));
    out.done = true;
    panel();
  });
})();
