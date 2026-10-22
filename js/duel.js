// Balance check in the real battle engine: open index.html?duel=1&mute=1.
// Plays the well-known Clash Royale match-ups at equal level (who wins a fight, which spell kills what) and reports
// how many of them come out the way they do in Clash Royale. Results on screen and in window.DUEL.
(function () {
  if (!/[?&]duel=1(&|$)/.test(location.search)) return;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (f, ms) => { const t0 = Date.now(); while (!f() && Date.now() - t0 < ms) await wait(100); return f(); };
  const out = { rows: [], pass: 0, total: 0, errors: [], done: false };
  window.DUEL = out;
  window.addEventListener('error', (e) => out.errors.push(`${e.message} @${(e.filename || '').split('/').pop()}:${e.lineno}`));

  // match-ups on open ground, both sides at the same level. The expected winner is not written here: it is worked out
  // from Clash Royale's own numbers (tools/cr_reference.json, from the game's data tables) by a plain trade of blows,
  // then the same fight is played in this game's engine.
  const FIGHTS = [
    ['zero', 'phalangites'], ['zero', 'bigchick'], ['zero', 'harvester'], ['bigchick', 'nightchick'], ['phalangites', 'nightchick'],
    ['predator', 'phalangites'], ['leprechaun', 'brownie'], ['juggernaut', 'labiata'], ['centurion', 'thetis'], ['ramiel', 'gigantes'],
    ['nightchick', 'sylphid'], ['raven', 'banshee'], ['gnome', 'raven'], ['legion', 'nightchick'], ['doomeater', 'phalangites'],
    ['goltarion', 'juggernaut'], ['emperorchick', 'bigchick'], ['fallen', 'banshee'], ['impet', 'zero'], ['harvester', 'phalangites'],
    ['labiata', 'nightchick'], ['predator', 'zero'], ['undine', 'mercury'], ['executioner', 'brownie'],
  ];
  // [spell, target]: Clash Royale's numbers say whether the spell kills it (damage against hitpoints, same level)
  const SPELLS = [['emp', 'brownie'], ['emp', 'nightchick'], ['emp', 'sylphid'], ['volley', 'thetis'], ['volley', 'nightchick'], ['volley', 'fallen'],
    ['strike', 'fallen'], ['strike', 'gnome'], ['strike', 'centurion'], ['strike', 'hela'], ['missile', 'centurion'], ['thunder', 'hela'], ['thunder', 'undine']];

  // a trade of blows with Clash Royale's stats: every unit strikes the first enemy it can reach (a splash hits the whole
  // clump), the first blow lands after the card's load time, a charge doubles the first blow, ramping beams step up
  const GAP = 6; // tiles between the two sides at the start (the engine test uses the same)
  function crFight(R, a, b) {
    // a line across the field: blue starts at 0, red GAP tiles away (as the engine test places them); everyone walks at its
    // own speed until its target is within its range (edge to edge), a charge needs its run-up, then they trade blows
    const mk = (id, side, x0) => { const r = R.cards[id]; return Array.from({ length: r.count }, () => ({ side, r, hp: r.hp, x: x0, cd: r.load || r.rate / 2, ramp: 0, run: 0, charged: false, first: true })); };
    const us = mk(a, 'blue', 0).concat(mk(b, 'red', GAP));
    const can = (u, v) => u.r.targets !== 'buildings' && (!v.r.air || u.r.targets === 'all');
    const dt = 0.02;
    for (let t = 0; t < 60; t += dt) {
      for (const u of us) {
        if (u.hp <= 0) continue;
        const foes = us.filter((v) => v.side !== u.side && v.hp > 0 && can(u, v)).sort((p, q) => Math.abs(p.x - u.x) - Math.abs(q.x - u.x));
        if (!foes.length) continue;
        const v = foes[0], gap = Math.abs(v.x - u.x) - u.r.radius - v.r.radius;
        if (gap > u.r.range + 1e-6) { // walk up (a charge doubles the pace once the run-up is done)
          const sp = u.r.speed * (u.charged ? 2 : 1) * dt;
          u.x += Math.sign(v.x - u.x) * Math.min(sp, gap - u.r.range); u.run += sp; u.cd = Math.max(u.cd, u.r.load || 0);
          if (u.r.chargeRange && u.run >= u.r.chargeRange) u.charged = true;
          continue;
        }
        u.cd -= dt; u.ramp += dt;
        if (u.cd > 0) continue;
        let d = u.r.dmg * (u.charged ? 2 : 1);
        if (u.r.ramp) { const at = u.r.rampAt || [2, 4]; d *= u.r.ramp[u.ramp >= at[1] ? 2 : u.ramp >= at[0] ? 1 : 0]; }
        (u.r.splash >= 0.5 ? foes.filter((w) => Math.abs(w.x - v.x) <= u.r.splash) : [v]).forEach((w) => { w.hp -= d; });
        u.charged = false; u.run = 0; u.cd = u.r.rate;
      }
      const left = (s) => us.some((v) => v.side === s && v.hp > 0);
      if (!left('red') || !left('blue')) { const w = left('blue') ? 'blue' : left('red') ? 'red' : 'draw'; return { win: w, t, left: w === 'draw' ? 0 : us.filter((v) => v.side === w).reduce((n, v) => n + Math.max(0, v.hp) / v.r.hp, 0) / us.filter((v) => v.side === w).length }; }
      if (!us.some((u) => u.hp > 0 && us.some((v) => v.side !== u.side && v.hp > 0 && can(u, v)))) break; // nobody can reach anybody
    }
    const hpOf = (s) => us.filter((v) => v.side === s).reduce((n, v) => n + Math.max(0, v.hp) / v.r.hp, 0);
    return { win: hpOf('blue') > hpOf('red') ? 'blue' : hpOf('red') > hpOf('blue') ? 'red' : 'draw', t: 60 }; // (a stand-off: the side with more health left)
  }
  const crKills = (R, sp, id) => { const s = R.cards[sp], u = R.cards[id]; return s.dmg >= u.hp; };

  function panel() {
    let el = document.getElementById('duelPanel');
    if (!el) { el = document.createElement('pre'); el.id = 'duelPanel'; el.style.cssText = 'position:fixed;left:8px;top:8px;z-index:999;max-width:94vw;max-height:80vh;overflow:auto;background:rgba(0,0,0,.85);color:#9f9;font:11px monospace;padding:8px;pointer-events:none;white-space:pre-wrap'; document.body.appendChild(el); }
    el.textContent = `대결 점검 ${out.done ? '끝' : '진행 중'} · ${out.pass}/${out.total}\n` + out.rows.join('\n') + (out.errors.length ? '\n오류:\n' + out.errors.join('\n') : '');
  }
  const alive = (G, side, ids) => G.ents.filter((e) => e.kind === 'troop' && e.side === side && e.alive && (!ids || ids.includes(e)));
  function clear(G) { G.clock = 999; for (const e of G.ents) if ((e.kind === 'troop' || e.type === 'bld') && e.alive) GAME._damage(e, 1e9); GAME._run(3); } // (the clock is held: the checks outlast a match)

  async function run() {
    await until(() => window.GAME && window.UI && document.getElementById('btnBattle'), 30000);
    await wait(1500);
    const G = GAME.G;
    Object.assign(UI.save, { faction: 'orca', mode: 4, trophy: 0, diff: 1, tutorial: true, nick: UI.save.nick || '점검' });
    const ov = document.getElementById('nickOv'); if (ov) ov.hidden = true; // (a fresh browser asks for a nickname first)
    for (let k = 0; k < 6 && G.phase === 'title'; k++) { // (the title screen may still be settling: try again)
      Object.assign(UI.save, { mode: 4, nick: UI.save.nick || '점검' }); if (ov) ov.hidden = true;
      document.getElementById('btnBattle').click();
      await until(() => G.phase !== 'title', 5000);
    }
    if (!await until(() => G.phase === 'countdown' || G.phase === 'play', 45000)) { out.errors.push('전투를 불러오지 못했습니다'); return; }
    GAME._run(4);
    G.sides.red.ai.t = 1e9;
    for (const s of ['blue', 'red']) G.sides[s].towers.forEach((t) => { t.hp = t.max = 1e7; if (t.atk) t.atk.dmg = 0; }); // the towers watch: only the two cards fight
    const ids = new Set(FIGHTS.flatMap((f) => [f[0], f[1]]).concat(SPELLS.map((s) => s[1])));
    for (const id of ids) await SD.prepare(DATA.card[id].rig);
    const REF = await (await fetch('tools/cr_reference.json')).json();
    for (const [b, r] of FIGHTS) {
      const pred = crFight(REF, b, r), want = pred.win, why = `클래시 로얄 수치로는 ${want === 'blue' ? REF.cards[b].cr : want === 'red' ? REF.cards[r].cr : '무승부'} 승 (${REF.cards[b].cr} 대 ${REF.cards[r].cr})`;
      clear(G);
      const A = GAME._spawnCard('blue', b, 0, -9), B = GAME._spawnCard('red', r, 0, -9 + GAP);
      let t = 0;
      while (t < 40 && alive(G, 'blue', A).length && alive(G, 'red', B).length) { GAME._run(0.5); t += 0.5; }
      const a = alive(G, 'blue', A), d = alive(G, 'red', B);
      const win = a.length && !d.length ? 'blue' : d.length && !a.length ? 'red' : 'draw';
      const left = (u) => { const all = u === d || u === B ? B : A; return all.reduce((s, e) => s + (e.alive ? e.hp / e.max : 0), 0) / all.length; }; // (the whole squad, the fallen count as empty)
      const close = pred.left < 0.15, engLeft = left(win === 'red' ? d : a); // a fight Clash Royale's numbers call close either way
      const ok = win === want || (close && win !== 'draw' && engLeft < 0.3);
      out.total++; if (ok) out.pass++;
      out.rows.push(`${ok ? '통과' : '실패'}${close ? '(근소)' : ''}  ${DATA.card[b].name} 대 ${DATA.card[r].name}: ${win === 'blue' ? DATA.card[b].name : win === 'red' ? DATA.card[r].name : '무승부'} 승 (${t}초, 남은 체력 ${Math.round(left(win === 'red' ? d : a) * 100)}%) — ${why}`);
      panel(); await wait(0);
    }
    for (const [sp, r] of SPELLS) {
      const die = crKills(REF, sp, r), why = `클래시 로얄 수치: ${REF.cards[sp].cr} ${REF.cards[sp].dmg} 대 ${REF.cards[r].cr} 체력 ${REF.cards[r].hp} → ${die ? '처치' : '생존'}`;
      clear(G);
      const B = GAME._spawnCard('red', r, 0, 4);
      GAME._run(1.2);
      const S = G.sides.blue; S.hand[0] = sp; S.elixir = 10;
      GAME._playCard('blue', 0, B[0].x, B[0].z + 0.3);
      GAME._run(DATA.card[sp].dur ? DATA.card[sp].dur + 2 : 3);
      const n = alive(G, 'red', B).length, ok = die ? n === 0 : n === B.length;
      out.total++; if (ok) out.pass++;
      out.rows.push(`${ok ? '통과' : '실패'}  ${DATA.card[sp].name} → ${DATA.card[r].name}: ${B.length - n}/${B.length} 처치 — ${why}`);
      panel(); await wait(0);
    }
    // the rules the cards above rely on
    const rule = (ok, what) => { out.total++; if (ok) out.pass++; out.rows.push(`${ok ? '통과' : '실패'}  규칙: ${what}`); panel(); };
    const count = (id, side) => G.ents.filter((e) => e.kind === 'troop' && e.alive && e.side === side && e.card.id === id).length;
    for (const id of ['brownie', 'nightchick', 'leona', 'pupphead', 'intruder', 'predator']) await SD.prepare(DATA.card[id].rig);
    clear(G);
    { const p = GAME._spawnCard('blue', 'pupphead', 0, -7)[0], bats = GAME._spawnCard('red', 'sylphid', 0, -4); GAME._run(5); rule(!p.alive && bats.every((b) => !b.alive), '퍼프헤드는 한 번 방전해 박쥐 무리를 모두 잡고 사라집니다 (일렉트로 정령)'); }
    clear(G);
    { const pr = GAME._spawnCard('blue', 'predator', 0, -12)[0], kn = GAME._spawnCard('red', 'phalangites', 0, -2)[0], h0 = kn.hp; let on = false, first = 0; for (let i = 0; i < 40 && !first; i++) { GAME._run(0.25); on = on || pr.chargeOn; if (kn.hp < h0) first = h0 - kn.hp; } rule(on && first >= DATA.card.predator.dmg * 1.9, `프레데터는 달리다 돌진해 첫 일격이 2배입니다 (${Math.round(first)})`); }
    clear(G);
    { GAME._spawnCard('blue', 'leona', 0, -12); GAME._run(3); rule(count('brownie', 'blue') === 2, '레오나는 브라우니 2기를 불러냅니다 (마녀)'); }
    clear(G);
    { const S = G.sides.blue; S.hand[0] = 'outpost'; S.elixir = 10; GAME._playCard('blue', 0, -3, -8); S.hand[0] = 'hatchery'; S.elixir = 10; GAME._playCard('blue', 0, 3, -8); GAME._run(2);
      rule(count('brownie', 'blue') === 3 && count('nightchick', 'blue') === 1, `전진 기지는 브라우니 3기, 부화장은 나이트 칙 1기씩 내보냅니다 (${count('brownie', 'blue')}, ${count('nightchick', 'blue')})`);
      const b = G.ents.find((e) => e.type === 'bld' && e.alive && e.card.id === 'hatchery'), h0 = b.hp, R = G.sides.red; R.hand[0] = 'napalm'; R.elixir = 10; GAME._playCard('red', 0, b.x, b.z); GAME._run(4.5);
      const want = DATA.card.napalm.dmg * DATA.card.napalm.dur * DATA.card.napalm.bldK; rule(!b.alive || h0 - b.hp > want * 0.6, `화염 지대는 건물에 4.5배 피해를 줍니다 (지진)`); }
    clear(G);
    { const h = GAME._spawnCard('blue', 'intruder', 5.5, -6)[0]; GAME._spawnCard('red', 'phalangites', 5.5, -1); GAME._run(9); rule(h.alive && h.target && h.target.kind === 'tower' && h.z > 2, '인트루더는 유닛을 지나쳐 건물만 노립니다 (호그 라이더)'); }
    out.done = true; panel();
  }
  run().catch((e) => { out.errors.push(String(e && e.stack || e)); panel(); });
})();
