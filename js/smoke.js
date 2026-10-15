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
    document.getElementById('result').className = 'screen';
    document.getElementById('btnBattle').click();
    if (!await until(() => G.phase === 'countdown', 45000)) { out.errors.push(`load timeout ${faction}/${mode}/${trophy}`); return; }
    const t0 = performance.now();
    let steps = 0;
    for (let s = 0; s < 640 && G.phase !== 'ended'; s++) { GAME._run(0.5); bot(G); steps++; if (s % 40 === 0) await wait(0); }
    const ms = (performance.now() - t0) / steps;
    await until(() => document.getElementById('result').classList.contains('on'), 5000);
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
    if (base.scene == null) base.scene = left.scene; else if (left.scene > base.scene + 2) out.errors.push(`scene grew ${base.scene} -> ${left.scene}`);
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
      if (GAME.aimable(u)) { const n0 = GAME.info.fx; for (let k = 0; k < 5; k++) GAME.aimPreview(u, u.x + k, u.z + 2); const n1 = GAME.info.fx; GAME.aimHide(); ok(n1 - n0 <= 8, `aim preview reuses its marks (${n0} -> ${n1})`); }
      const aimed = GAME.aimable(u) ? { x: u.x + 2, z: u.z + (side === 'blue' ? 3 : -3) } : undefined;
      ok(GAME.useSkill(u, aimed), `skill fires: ${c.id} (deploy ${u.deployT.toFixed(2)})`);
      if (aimed) ok(u.skillSpot && Math.hypot(u.skillSpot[0] - aimed.x, u.skillSpot[1] - aimed.z) < 0.01, 'aimed skill keeps the dragged spot: ' + c.id);
      GAME._run(1.2);
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
    const ms = med(sims), fr = med(frames);
    ok(ms < 90, `crowded field: 0.5 s simulated in ${ms.toFixed(1)} ms (budget 90)`);
    ok(fr < 16, `crowded field: ${fr.toFixed(1)} ms per frame (budget 16)`);
    out.runs.push(['unit checks', `${champs.length} champion skills`, `sim ${ms.toFixed(1)}ms/0.5s`, `frame ${fr.toFixed(1)}ms`, `${G.ents.length} entities`]);
    GAME.surrender();
    await until(() => document.getElementById('result').classList.contains('on'), 5000);
    document.getElementById('btnHome').click();
    await wait(200);
    const cp = GAME.cameraPos;
    ok(Math.abs(cp[0]) < 1e-6 && Math.abs(cp[1]) < 0.5 && GAME.cameraZoom === 1, 'camera reset after leaving');
    panel();
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
        const lvm = DATA.LEVEL.mult(u.lv);
        ok(Math.abs(u.max - ch.hp * lvm * (M.hp || 1)) < 2, `${M.key}: champion HP ${u.max.toFixed(0)}`);
        ok(!ch.dmg || Math.abs(u.atk.dmg - ch.dmg * lvm) < 2, `${M.key}: damage unchanged (${u.atk.dmg})`);
        ok(GAME.skillState(u).cost === Math.max(1, ch.skill.cost + (M.skillCost || 0)), `${M.key}: skill cost`);
        GAME.surrender();
        await until(() => document.getElementById('result').classList.contains('on'), 5000);
        document.getElementById('btnHome').click();
        await wait(200);
      }
      out.runs.push(['mutator checks', DATA.MUTATORS.map((m) => m.key).join(',')]);
    } finally { DATA.mutatorOf = real; }
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
      const arenas = DATA.ARENAS.map((a) => a.trophy);
      let k = 0;
      for (const faction of ['orca', 'iron']) {
        for (let mode = 0; mode < BAL.modes.length; mode++) await match(faction, mode, arenas[k++ % arenas.length], k % 3);
      }
      for (const tr of arenas) await match(k++ % 2 ? 'orca' : 'iron', 0, tr, 1);
      await unitChecks();
      await mutatorChecks();
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
