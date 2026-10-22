// Last Royal: title, deck builder, progression, battle HUD and result screens (DOM).
(function () {
  const { RARITY, FACTIONS, ARENAS, LEVEL, BAL, card: CARD, arenaOf } = DATA;
  const $ = (id) => document.getElementById(id);
  const KEY = 'lastroyal.v2';

  // ── save ──────────────────────────────────────────────
  const save = (() => {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(KEY) || localStorage.getItem('lastroyal.v1') || '{}') || {}; } catch (e) { s = {}; }
    const d = { trophy: 0, best: 0, gold: 100, wins: 0, losses: 0, draws: 0, faction: 'orca', diff: 1, mode: 0, decks: {}, cards: {},
      music: 1, sfx: 1, quality: null, autoQuality: true, muted: false, tutorial: false, streak: 0 };
    s = Object.assign(d, typeof s === 'object' ? s : {});
    if (s.tuna == null) s.tuna = DATA.SHOP.tunaStart; // (tuna: the second currency, for master cards)
    s.master = [0, 1, 2, 3].map((r) => Math.max(0, Math.floor(+(Array.isArray(s.master) ? s.master[r] : 0) || 0)));
    ['trophy', 'best', 'gold', 'tuna', 'wins', 'losses', 'draws', 'streak', 'opDay', 'opStreak'].forEach((k) => { s[k] = Math.max(0, Math.floor(+s[k] || 0)); });
    if (!FACTIONS[s.faction]) s.faction = 'orca';
    if (!(s.diff >= 0 && s.diff <= 2)) s.diff = 1;
    if (!(s.mode >= 0 && s.mode < BAL.modes.length) || (s.mode >= 1 && s.mode <= 3)) s.mode = 0; // (only 일반전 and 연습전 are left)
    s.nick = typeof s.nick === 'string' ? s.nick.trim().slice(0, 10) : '';
    if (s.practiceFoe === 'iron') s.practiceFoe = 'orca'; // (decks are shared now)
    if (!['ai', 'orca'].includes(s.practiceFoe)) s.practiceFoe = 'ai';
    const unit = (v, d) => (Number.isFinite(+v) ? Math.min(1, Math.max(0, +v)) : d);
    s.music = unit(s.music, 1); s.sfx = unit(s.sfx, 1); s.voice = unit(s.voice, 1);
    s.quality = s.quality === null || s.quality === undefined || !(+s.quality >= 0 && +s.quality <= 2) ? null : Math.round(+s.quality);
    s.autoQuality = s.autoQuality !== false;
    // crates: known kinds only, at most four, unlock start times that make sense
    s.chests = Array.isArray(s.chests) ? s.chests.filter((c) => c && DATA.CHESTS.some((d) => d.key === c.k)).slice(0, 4) : [];
    s.chests.forEach((c) => { if (!Number.isFinite(c.t0) || c.t0 > Date.now() + 60000) c.t0 = c.t0 == null ? null : Date.now(); });
    if (typeof s.cards !== 'object' || !s.cards) s.cards = {};
    // the iron copies of the spells (i_<id>) were merged into one set: their copies join the spell, decks use the spell
    for (const k of Object.keys(s.cards)) { const m = /^i_(.+)$/.exec(k); if (!m || CARD[k] || !CARD[m[1]]) continue; const o = s.cards[k]; if (o) { const t = s.cards[m[1]] || (s.cards[m[1]] = { lv: o.lv, n: 0 }); t.n = (t.n | 0) + (o.n | 0); t.lv = Math.max(t.lv | 0, o.lv | 0); } delete s.cards[k]; }
    for (const k of Object.keys(s.cards)) if (!CARD[k]) delete s.cards[k]; // (a card taken out of the game)
    const fixDeck = (d) => { if (!Array.isArray(d)) return d; const out = []; d.forEach((id) => { const m = /^i_(.+)$/.exec(id), j = m && !CARD[id] && CARD[m[1]] ? m[1] : id; if (CARD[j] && !out.includes(j)) out.push(j); }); /* a card taken out of the game leaves the deck: an owned card fills its place */ if (d.length === 8) for (const k of Object.keys(s.cards)) { if (out.length >= 8) break; if (CARD[k] && !CARD[k].skill && !out.includes(k)) out.push(k); } return out; };
    if (s.decks && typeof s.decks === 'object') for (const f of Object.keys(s.decks)) s.decks[f] = fixDeck(s.decks[f]);
    if (s.deckSlots && typeof s.deckSlots === 'object') for (const f of Object.keys(s.deckSlots)) if (Array.isArray(s.deckSlots[f])) s.deckSlots[f] = s.deckSlots[f].map(fixDeck);
    s.road = Number.isFinite(+s.road) ? Math.max(0, +s.road) : 0;
    if (typeof s.newCards !== 'object' || !s.newCards) s.newCards = {};
    Object.keys(s.newCards).forEach((id) => { if (!CARD[id]) delete s.newCards[id]; });
    if (typeof s.decks !== 'object' || !s.decks) s.decks = {};
    return s;
  })();
  const APP_VERSION = 'V0.68'; // shown on the title and in the settings
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { if (!persist.warned) { persist.warned = true; setTimeout(() => toast('기기 저장 공간을 쓸 수 없어 진행이 저장되지 않습니다'), 0); } } } // private mode / quota: say so once
  const arena = () => arenaOf(save.trophy);
  // a new commander starts with 12 cards (a sound deck of 8 among them); each win opens one more
  const START_CARDS = ['brownie', 'leprechaun', 'impet', 'raven', 'harpy', 'zero', 'empress', 'strike', 'gnome', 'valkyrie', 'nightchick', 'legion'];
  const unlocked = (c) => !!save.cards[c.id] || (save.startCards !== true && START_CARDS.includes(c.id));
  // every unlocked card is owned (level 1 at least); fix decks that hold locked / foreign cards
  function syncCollection() {
    // a save that already owns cards (older versions had no 'seen' flag) gets NEW badges for what this sync adds
    const news = save.seen || Object.keys(save.cards).length > 0;
    // levels moved to 10–12 (V0.39): every card of an older save starts again at level 10, its copies kept
    if (save.lvBase !== LEVEL.min) { Object.values(save.cards).forEach((o) => { if (o) o.lv = LEVEL.min; }); save.lvBase = LEVEL.min; }
    DATA.CARDS.forEach((c) => {
      const o = save.cards[c.id];
      if (unlocked(c) && !o) { save.cards[c.id] = { lv: LEVEL.min, n: 0 }; if (news) (save.newCards || (save.newCards = {}))[c.id] = 1; }
      if (o) { o.lv = Math.min(LEVEL.max, Math.max(LEVEL.min, o.lv | 0)); o.n = Math.max(0, o.n | 0); }
    });
    save.seen = true; // after the first sync, every unlock is news
    save.startCards = true; // (the starting 12 were given: later cards come from wins)
    const valid = (dk) => Array.isArray(dk) && dk.length <= 8 && new Set(dk).size === dk.length && dk.every((id) => CARD[id] && save.cards[id]); // (fewer than 8 while it is being built) // orca and iron cards may be mixed in one deck
    if (typeof save.deckSlots !== 'object' || !save.deckSlots) save.deckSlots = {};
    if (typeof save.deckSlot !== 'object' || !save.deckSlot) save.deckSlot = {};
    for (const f of Object.keys(FACTIONS)) {
      if (!valid(save.decks[f])) save.decks[f] = FACTIONS[f].deck.slice();
      // five saved decks: the active slot is the very array in save.decks (edits land in both)
      const old = Array.isArray(save.deckSlots[f]) ? save.deckSlots[f] : [];
      const sl = [0, 1, 2, 3, 4].map((i) => (valid(old[i]) ? old[i] : FACTIONS[f].deck.slice()));
      const i = save.deckSlot[f] >= 0 && save.deckSlot[f] < 5 ? save.deckSlot[f] | 0 : 0;
      sl[i] = save.decks[f];
      sl.forEach(oneHero); // (a deck holds one hero: older decks drop the extra ones)
      save.deckSlots[f] = sl; save.deckSlot[f] = i;
    }
    // one set of decks for the commander, whichever faction it plays: both factions point at the same decks
    // (the first time, the faction in use keeps its decks for both)
    const f0 = save.deckShared ? 'orca' : save.faction;
    for (const f1 of Object.keys(FACTIONS)) if (f1 !== f0) { save.deckSlots[f1] = save.deckSlots[f0]; save.deckSlot[f1] = save.deckSlot[f0]; save.decks[f1] = save.decks[f0]; }
    save.deckShared = true;
    persist();
  }
  // a deck holds one hero (champion): the first one stays, any other is taken out
  function oneHero(dk) { let seen = false; for (let i = 0; i < dk.length; i++) { const c = CARD[dk[i]]; if (!c || !c.skill) continue; if (seen) { dk.splice(i, 1); i--; } else seen = true; } }
  const levelOf = (id) => LEVEL.fixed || (save.cards[id] ? save.cards[id].lv : LEVEL.min);

  // ── missions ──────────────────────────────────────────
  const MDEF = Object.fromEntries(DATA.MISSIONS.map((m) => [m.k, m]));
  function ensureMissions() {
    if (!Array.isArray(save.missions)) save.missions = [];
    save.missions = save.missions.filter((m) => m && MDEF[m.k]);
    while (save.missions.length < 3) {
      const free = DATA.MISSIONS.filter((m) => !save.missions.some((x) => x.k === m.k) && m.k !== save.lastMission);
      const m = free[Math.floor(Math.random() * free.length)];
      if (!m) break;
      save.missions.push({ k: m.k, prog: 0 });
    }
  }
  function progressMissions(win, b, stats, opts) {
    ensureMissions();
    const add = { win: win ? 1 : 0, crowns: b, three: win && b === 3 ? 1 : 0, skills: stats.skills, cards: stats.cards, kills: stats.kills, dmg: Math.round(stats.dmg),
      rush: opts.mode === 1 ? 1 : 0, iron: win && opts.faction === 'iron' ? 1 : 0, orca: win && opts.faction === 'orca' ? 1 : 0 };
    let done = 0;
    save.missions.forEach((m) => {
      const goal = MDEF[m.k].goal, before = m.prog;
      m.prog = Math.min(goal, m.prog + (add[m.k] || 0));
      if (before < goal && m.prog >= goal) done++;
    });
    return done;
  }
  const claimable = () => (save.missions || []).filter((m) => m.prog >= MDEF[m.k].goal).length;
  function renderMissions() {
    ensureMissions();
    $('missionList').innerHTML = save.missions.map((m, i) => {
      const d = MDEF[m.k], ok = m.prog >= d.goal;
      return `<div class="ms${ok ? ' ok' : ''}"><div class="mt"><b>${esc(d.name)}</b><small>${m.prog.toLocaleString()} / ${d.goal.toLocaleString()}</small><div class="mbar"><i style="width:${Math.min(100, m.prog / d.goal * 100)}%"></i></div></div>
        <button class="btn ${ok ? 'y' : 'd'} sm" data-i="${i}" ${ok ? '' : 'disabled'}><i class="gold-i"></i>${d.gold}</button></div>`;
    }).join('');
  }
  const upCost = (c, lv) => ({
    n: Math.max(1, Math.ceil(LEVEL.copies[lv] * [1, 0.5, 0.25, 0.1][c.rarity])),
    gold: Math.round(LEVEL.gold[lv] * (1 + c.rarity * 0.5)),
  });

  // ── card art ──────────────────────────────────────────
  const artCache = {};
  // original skill icons for the spell cards (art falls back to drawn symbols until they load)
  const spellIcons = {};
  ['strike', 'emp', 'freeze', 'napalm', 'missile', 'overclock', 'turret', 'outpost', 'barricade'].forEach((k) => {
    const im = new Image();
    im.onload = () => { DATA.CARDS.forEach((c) => { if (c.icon === k) delete artCache[c.id]; }); if ($('title').classList.contains('on')) renderTitle(); };
    im.src = `assets/icon/${k}.png`;
    spellIcons[k] = im;
  });
  function spellArt(c) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const g = cv.getContext('2d');
    const col = '#' + c.color.toString(16).padStart(6, '0');
    const bg = g.createRadialGradient(64, 64, 4, 64, 64, 80);
    bg.addColorStop(0, col); bg.addColorStop(0.45, 'rgba(30,40,60,0.9)'); bg.addColorStop(1, '#0c1018');
    g.fillStyle = bg; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineWidth = 6; g.lineJoin = 'round'; g.lineCap = 'round';
    g.shadowColor = col; g.shadowBlur = 16;
    const icon = spellIcons[c.icon];
    if (icon && icon.complete && icon.naturalWidth) {
      // the original skill icon, tinted with the spell colour (it keeps its own shading)
      const t = document.createElement('canvas'); t.width = t.height = 112;
      const tg = t.getContext('2d');
      tg.drawImage(icon, 0, 0, 112, 112);
      tg.globalCompositeOperation = 'color'; tg.fillStyle = col; tg.fillRect(0, 0, 112, 112);
      tg.globalCompositeOperation = 'destination-in'; tg.drawImage(icon, 0, 0, 112, 112);
      g.drawImage(t, 8, 8);
      try { return cv.toDataURL(); } catch (e) { spellIcons[c.icon] = null; return spellArt(c); } // file://: a tainted canvas, draw the symbol instead
    }
    if (c.spell === 'fireball') {
      g.beginPath(); g.arc(64, 70, 22, 0, Math.PI * 2); g.fill();
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; g.beginPath(); g.moveTo(64 + Math.cos(a) * 30, 70 + Math.sin(a) * 30); g.lineTo(64 + Math.cos(a) * 44, 70 + Math.sin(a) * 44); g.stroke(); }
      g.fillStyle = col; g.beginPath(); g.moveTo(64, 10); g.lineTo(74, 40); g.lineTo(54, 40); g.closePath(); g.fill();
    } else if (c.spell === 'zap') {
      g.beginPath(); g.moveTo(74, 14); g.lineTo(44, 68); g.lineTo(66, 68); g.lineTo(52, 114); g.lineTo(88, 54); g.lineTo(66, 54); g.closePath(); g.fill();
    } else if (c.icon === 'poison') { // a gas drop with bubbles
      g.beginPath(); g.moveTo(64, 14); g.bezierCurveTo(96, 54, 98, 78, 64, 108); g.bezierCurveTo(30, 78, 32, 54, 64, 14); g.fill();
      g.fillStyle = col; g.shadowBlur = 0;
      for (const [bx, by, br] of [[56, 74, 9], [74, 62, 6], [70, 88, 5]]) { g.beginPath(); g.arc(bx, by, br, 0, Math.PI * 2); g.fill(); }
    } else if (c.icon === 'clone') { // a figure and its hologram twin
      const man = (ox, a) => { g.globalAlpha = a; g.beginPath(); g.arc(ox, 40, 14, 0, Math.PI * 2); g.fill(); g.beginPath(); g.moveTo(ox - 22, 108); g.quadraticCurveTo(ox - 22, 60, ox, 60); g.quadraticCurveTo(ox + 22, 60, ox + 22, 108); g.fill(); };
      man(48, 1); g.fillStyle = col; man(82, 0.75); g.globalAlpha = 1;
    } else if (c.icon === 'volley') { // shots raining down
      for (let i = 0; i < 6; i++) { const bx = 26 + i * 15, by = 18 + (i % 2) * 18; g.beginPath(); g.moveTo(bx + 8, by); g.lineTo(bx, by + 46); g.stroke(); g.beginPath(); g.moveTo(bx - 6, by + 38); g.lineTo(bx, by + 52); g.lineTo(bx + 7, by + 40); g.fill(); }
      g.fillRect(18, 104, 92, 6);
    } else if (c.icon === 'thunder') { // a cloud and a bolt
      g.beginPath(); g.arc(46, 38, 16, Math.PI * 0.5, Math.PI * 1.5); g.arc(64, 28, 20, Math.PI, 0); g.arc(84, 40, 14, Math.PI * 1.5, Math.PI * 0.5); g.closePath(); g.fill();
      g.fillStyle = col; g.beginPath(); g.moveTo(70, 56); g.lineTo(50, 88); g.lineTo(64, 88); g.lineTo(54, 118); g.lineTo(82, 78); g.lineTo(68, 78); g.closePath(); g.fill();
    } else if (c.icon === 'repair') { // a cross
      g.fillRect(52, 22, 24, 84); g.fillRect(22, 52, 84, 24);
    } else if (c.icon === 'gravity') { // a spiral pulling in
      g.beginPath(); for (let a = 0; a < Math.PI * 6; a += 0.1) { const r = 4 + a * 2.4; const px = 64 + Math.cos(a) * r, py = 64 + Math.sin(a) * r; if (a === 0) g.moveTo(px, py); else g.lineTo(px, py); } g.stroke();
    } else {
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3;
        g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.cos(a) * 46, 64 + Math.sin(a) * 46); g.stroke();
        for (const t of [0.55, 0.8]) { const bx = 64 + Math.cos(a) * 46 * t, by = 64 + Math.sin(a) * 46 * t; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + Math.cos(a + s * 0.8) * 12, by + Math.sin(a + s * 0.8) * 12); g.stroke(); } }
      }
    }
    return cv.toDataURL();
  }
  function art(c) {
    if (artCache[c.id]) return artCache[c.id];
    return (artCache[c.id] = c.type !== 'troop' ? spellArt(c) : (window.IMG && IMG[c.img]) || '');
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

  // opts: { lv, cls, locked, progress }
  // what the card does in the fight, on every card: melee, ranged, siege (goes for buildings), tower (a building) or spell
  const KIND = {
    melee: { name: '근접', svg: '<path d="M20 3h-5L6.5 11.5 5 10l-1.5 1.5 3 3L3 18l3 3 3.5-3.5 3 3L14 19l-1.5-1.5L21 9V3z"/>' },
    ranged: { name: '원거리', svg: '<path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 17.9V17h-2v2.9A8 8 0 014.1 13H7v-2H4.1A8 8 0 0111 4.1V7h2V4.1a8 8 0 016.9 6.9H17v2h2.9a8 8 0 01-6.9 6.9zM12 10.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3z"/>' },
    siege: { name: '공성', svg: '<path d="M4 4h7v4h3V4h6v8h-3v8H7v-8H4V4zm6 10v6h4v-6h-4z"/><path d="M1 14l5-2v4z"/>' },
    tower: { name: '타워', svg: '<path d="M5 2h3v2h2V2h4v2h2V2h3v6l-2 2v10h3v2H3v-2h3V10L4 8V2h1zm5 12v6h4v-6a2 2 0 00-4 0z"/>' },
    spell: { name: '주문', svg: '<path d="M12 1l2.6 6.9L22 9l-5.5 4.8L18.2 21 12 17.3 5.8 21l1.7-7.2L2 9l7.4-1.1z"/>' },
  };
  // troops also say whether they fly (right side of the card)
  const AIR_SVG = '<path d="M2 13c4-1 7-4 9-9 .5 4-1 7-3 9 3 0 6-1 8-3-.5 3-3 6-7 7 3 1 6 0 9-2-2 4-7 6-12 5-2 0-3-1-4-3z"/>';
  const GND_SVG = '<path d="M7 4h5l1 6 5 2c1.5.6 2 1.5 2 3v2H4v-3l2-1zM2 19h20v2H2z"/>';
  const moveIc = (c, full) => (c.type !== 'troop' ? '' : `<i class="moveic ${c.air ? 'm-air' : 'm-gnd'}${full ? ' full' : ''}" title="${c.air ? '공중' : '지상'}"><svg viewBox="0 0 24 24">${c.air ? AIR_SVG : GND_SVG}</svg><b>${c.air ? '공중' : '지상'}</b></i>`);
  const kindOf = (c) => (c.type === 'spell' ? 'spell' : c.type === 'building' ? 'tower' : c.aim === 'buildings' ? 'siege' : c.range <= 1.4 ? 'melee' : 'ranged');
  const kindIc = (c, full) => { const k = kindOf(c), K = KIND[k]; return `<i class="kindic k-${k}${full ? ' full' : ''}" title="${K.name}"><svg viewBox="0 0 24 24">${K.svg}</svg><b>${K.name}</b></i>`; };

  function cardEl(c, cls, opt) {
    opt = opt || {};
    const el = document.createElement('div');
    el.className = 'card r' + c.rarity + (cls ? ' ' + cls : '') + (c.type !== 'troop' ? ' spell' : '') + (c.type === 'building' ? ' bld' : '') + (c.skill ? ' champ' : '') + (opt.locked ? ' locked' : '');
    let h = `<div class="art" style="background-image:url(${art(c)})"></div><span class="cost">${c.cost}</span><span class="nm">${esc(c.name)}</span>`;
    if (c.count > 1) h += `<span class="cnt">x${c.count}</span>`;
    if (opt.lv) h += `<span class="lv">Lv.${opt.lv}</span>`;
    if (opt.progress != null) h += `<span class="prog${opt.progress >= 1 ? ' full' : ''}"><i style="width:${Math.min(100, opt.progress * 100)}%"></i></span>`;
    if (opt.rank) h += kindIc(c) + moveIc(c); // (the card's kind matters more than its grade; troops: flying or not)
    if (opt.isNew) h += '<span class="newb">NEW</span>';
    if (opt.locked) h += `<span class="lock"><i></i>${esc(ARENAS[c.arena].name)}</span>`;
    el.innerHTML = h;
    if (!opt.tile) return el;
    // deck / collection tile (Clash Royale card list): the level band on the card, the copies bar under it
    el.title = c.name;
    el.insertAdjacentHTML('beforeend', `<span class="lvband">레벨 ${opt.lv || LEVEL.min}</span>`);
    const o = save.cards[c.id], t = document.createElement('div');
    t.className = 'tile';
    t.appendChild(el);
    if (o && o.lv >= LEVEL.max) t.insertAdjacentHTML('beforeend', '<div class="cbar max"><b>최대 레벨</b></div>');
    else if (o) {
      const k = upCost(c, o.lv).n, full = o.n >= k;
      t.insertAdjacentHTML('beforeend', `<div class="cbar${full ? ' full' : ''}"><span class="fill" style="width:${Math.min(100, o.n / k * 100)}%"></span><svg class="arw" viewBox="0 0 20 22"><path d="M10 1.5 L18.5 11 H13.5 V20.5 H6.5 V11 H1.5 Z"/></svg><b>${o.n}/${k}</b></div>`);
    }
    return t;
  }

  // ── screens ───────────────────────────────────────────
  function show(id) {
    ['title', 'deck', 'shop', 'missions', 'road', 'battle'].forEach((s) => $(s).classList.toggle('on', s === id));
    if (id !== 'battle') { const tb = document.querySelector('.tabbar'); $(id).appendChild(tb); tb.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === (['deck', 'shop', 'missions', 'road'].includes(id) ? id : 'battle'))); }
    if (id === 'battle') requestAnimationFrame(() => GAME.resize(true));
  }

  function renderTitle() {
    syncCollection();
    const a = arena(), A = ARENAS[a], nx = ARENAS[a + 1];
    $('trophy').textContent = save.trophy;
    $('gold').textContent = save.gold;
    $('record').textContent = `${save.wins}승 ${save.losses}패`;
    $('arenaName').textContent = `ARENA ${a + 1}`; // (the emblem below names it)
    document.querySelector('.arena-box').style.backgroundImage = `linear-gradient(180deg, rgba(10,14,20,.15) 40%, rgba(10,14,20,.88)), url(${A.bg})`;
    const f0 = A.trophy, f1 = nx ? nx.trophy : A.trophy + 1;
    $('arenaBar').style.width = (nx ? Math.min(100, (save.trophy - f0) / (f1 - f0) * 100) : 100) + '%';
    $('arenaEmb').innerHTML = `<b>${a + 1}</b><span>${esc(A.name)}</span>`; // the arena's emblem in the middle of its picture
    $('arenaNext').innerHTML = nx ? `<span>${save.trophy} / ${nx.trophy}</span><span>다음: ${esc(nx.name)}</span>` : '<span>최고 아레나 도달!</span>';
    // the deck this commander takes into battle, as a strip on the arena picture
    $('arenaDeck').innerHTML = save.decks[save.faction].map((id) => CARD[id] ? `<i class="r${CARD[id].rarity}" style="background-image:url(${art(CARD[id])})"><b>${CARD[id].cost}</b></i>` : '').join('');
    const nextCards = []; // (every card is already open: nothing to preview)
    $('arenaUnlock').innerHTML = nextCards.map((c) => `<i style="background-image:url(${art(c)})" title="${esc(c.name)}"></i>`).join('');
    document.querySelectorAll('#diffSel button').forEach((b) => b.classList.toggle('on', +b.dataset.d === save.diff));
    document.querySelectorAll('#modeSel button').forEach((b) => b.classList.toggle('on', +b.dataset.m === save.mode));

    const row = $('deckPreview');
    row.innerHTML = '';
    save.decks[save.faction].forEach((id) => row.appendChild(cardEl(CARD[id], 'mini', { lv: levelOf(id) })));
    $('avgCost').innerHTML = '<b>덱 편성</b>'; // the deck button: its name and lead card (no average energy: the owner's call)
    { const lead = CARD[save.decks[save.faction][0]]; $('deckIcon').style.backgroundImage = lead ? `url(${art(lead)})` : ''; }
    $('modeLabel').innerHTML = save.mode === 4 ? `${BAL.modes[save.mode].name}<br>${BAL.diffs[save.diff].name}` : BAL.modes[save.mode].name; // (일반전 has no difficulty)
    $('diffSel').hidden = $('diffLbl').hidden = save.mode !== 4;
    $('pfoeBox').innerHTML = (save.mode === 4 ? `<div class="seg pfoe" id="pfoeSel">${Object.entries(PFOE).map(([k, n]) => `<button data-p="${k}" class="${save.practiceFoe === k ? 'on' : ''}">${n}</button>`).join('')}</div>` : '');
    const up = DATA.CARDS.some((c) => canUpgrade(c));
    $('btnDeck').classList.toggle('dot', up || !!(save.newCards && Object.keys(save.newCards).some((id) => CARD[id])));
    renderChests();
    // trophy road: rewards reached but not claimed yet
    const road = DATA.ROAD.filter((r) => r.trophy <= save.trophy && r.trophy > (save.road || 0));
    $('roadBtn').hidden = !road.length;
    $('roadBtn').textContent = `★ 트로피 로드 보상 ${road.length}개 받기`;
    const nextR = DATA.ROAD.find((r) => r.trophy > save.trophy);
    $('roadNext').textContent = nextR ? `다음 보상 ${nextR.trophy}: ${nextR.chest ? CH[nextR.chest].name : '부품 ' + nextR.gold}` : '';
    if (save.pendingReveal != null) setTimeout(() => { if ($('title').classList.contains('on')) revealArena(); }, 300);
    $('firstWin').textContent = ''; // (the first-win line was taken off the battle tab; the bonus itself still pays)
    ensureMissions();
    const cl = claimable();
    $('mBadge').textContent = cl;
    $('mBadge').hidden = !cl;
  }
  const avg = (d) => (d.length ? d.reduce((s, id) => s + CARD[id].cost, 0) / d.length : 0).toFixed(1);
  // the shop: balances, crates (parts), master cards (tuna) with how many of each grade are held
  function renderShop() {
    $('shopGold').textContent = save.gold; $('shopTuna').textContent = save.tuna;
    $('shopCrates').innerHTML = DATA.SHOP.crates.map((it, i) => { const ch = DATA.CHESTS.find((x) => x.key === it.key); return `<button class="shopit" data-buy="crate:${i}"><i class="chest-i ${it.key}"></i><b>${esc(ch.name)}</b><small>카드 ${ch.cards}장</small><em><i class="gold-i"></i>${it.price}</em></button>`; }).join('');
    $('shopMasters').innerHTML = DATA.SHOP.masters.map((it, i) => `<button class="shopit master r${it.r}" data-buy="master:${i}"><span class="mcard ${it.r >= 2 ? 'sp' : ''}"><b>${RARITY[it.r].name}</b></span><b>${RARITY[it.r].name} 대체코어 x${it.n}</b><small>보유 ${save.master[it.r]}</small><em><i class="tuna-i"></i>${it.price}</em></button>`).join('');
  }
  // a substitute core: pick one of the owned cards of its grade; the copies land on it and the tuna is paid
  function openCorePick(i) {
    const it = DATA.SHOP.masters[i], ov = $('coreOv');
    $('coreTitle').textContent = `${RARITY[it.r].name} 대체코어 x${it.n}`;
    $('coreSub').innerHTML = `적용할 캐릭터를 고르세요 · <i class="tuna-i"></i>${it.price}`;
    const list = $('coreList'); list.innerHTML = '';
    const cards = DATA.CARDS.filter((c) => c.rarity === it.r && save.cards[c.id]).sort((a, b) => copiesLeft(b) - copiesLeft(a) || a.cost - b.cost);
    cards.forEach((c) => {
      const left = copiesLeft(c), add = Math.min(it.n, left), w = document.createElement('button');
      w.className = 'corec' + (add ? '' : ' full');
      w.appendChild(cardEl(c, 'mini', { lv: levelOf(c.id) }));
      w.insertAdjacentHTML('beforeend', `<b>${esc(c.name)}</b><em>${add ? '카드 +' + add : '최대'}</em>`);
      w.onclick = () => {
        if (!add) { toast('더 모을 카드가 없는 캐릭터입니다'); SFX.play('fail', 0.4); return; }
        if (save.tuna < it.price) { toast('참치가 부족합니다'); SFX.play('fail', 0.4); return; }
        save.tuna -= it.price; save.cards[c.id].n += add; persist(); SFX.play('pickSS', 0.6);
        toast(`${c.name} 카드 +${add} · 참치 -${it.price}`); ov.hidden = true; renderShop();
      };
      list.appendChild(w);
    });
    if (!cards.length) list.innerHTML = '<p class="hint">이 등급의 캐릭터가 없습니다</p>';
    ov.hidden = false;
  }
  function copiesLeft(c) {
    const o = save.cards[c.id]; if (!o) return 0;
    let need = 0; for (let l = o.lv; l < LEVEL.max; l++) need += upCost(c, l).n;
    return Math.max(0, need - o.n);
  }
  function canUpgrade(c) {
    const o = save.cards[c.id];
    if (LEVEL.fixed || !o || o.lv >= LEVEL.max) return false; // (levels are fixed for now)
    const k = upCost(c, o.lv);
    return o.n >= k.n && save.gold >= k.gold;
  }

  // deck builder
  // slotSel: the deck place picked (the codex opens under the deck to fill it), -1 = the codex opened just to browse; deckSel: the card the popup shows
  let deckSel = null, slotSel = null, cardOpen = false, pvId = null; // cardOpen: the card popup is up; pvId: the card its preview shows
  // the popup's preview: the card fighting in a small scene (the poster is the card art until the first frame)
  function cardPreview(c) {
    if (!c) { if (pvId) { pvId = null; GAME.previewStop(); } return; }
    if (pvId === c.id) return;
    pvId = c.id;
    const box = $('cardPvBox'), cv = $('cardPv'), k = Math.min(2, window.devicePixelRatio || 1);
    box.classList.remove('live');
    box.style.backgroundImage = `url(${art(c)})`;
    cv.width = Math.round((box.clientWidth || 320) * k); cv.height = Math.round(cv.width * 4 / 5);
    cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
    const id = c.id;
    Promise.resolve(GAME.ready ? GAME.preview(id, cv) : false).then((ok) => { if (ok && pvId === id) box.classList.add('live'); }).catch(() => {});
  }
  // collection order (saved): the commander's faction first / energy / grade / level / name
  const CSORT = { faction: '진영', cost: '에너지', rarity: '등급', level: '레벨' };
  // tapping the active order again flips it (ascending / descending); ties fall back to energy, then the name
  const collOrder = (k, f, desc) => (a, b) => (desc ? -1 : 1) * (k === 'cost' ? a.cost - b.cost : k === 'rarity' ? a.rarity - b.rarity : k === 'level' ? levelOf(a.id) - levelOf(b.id) : ((a.faction !== f) - (b.faction !== f)) || a.arena - b.arena) || a.cost - b.cost || a.name.localeCompare(b.name, 'ko');
  // faction bond chip: what the deck's faction mix gives (4 / 6 cards of one faction)
  function synChip(deck) {
    const s = DATA.synergyOf(deck);
    if (!s.tier) return `<span class="syn off" title="한 진영 카드 4장 이상이면 결속 보너스">결속 없음 (${s.count}/4)</span>`;
    return `<span class="syn ${s.faction}" title="${esc(s.desc)}">${esc(s.name)}</span>`;
  }
  // every faction bond, the one this deck has lit (and how many cards each side has)
  function renderSyn() {
    const deck = save.decks[save.faction], cur = DATA.synergyOf(deck), n = { orca: 0, iron: 0 };
    deck.forEach((id) => { if (CARD[id] && n[CARD[id].faction] != null) n[CARD[id].faction]++; });
    const need = [0, 4, 6];
    $('synList').innerHTML = ['orca', 'iron'].map((f) => `<div class="syngrp f-${f}"><h5>${FACTIONS[f].name} <small>덱에 ${n[f]}장</small></h5>`
      + DATA.SYNERGY[f].map((s, t) => (s ? `<div class="synrow${cur.tier === t && cur.faction === f ? ' on' : ''}"><b>${esc(s.name)}</b><em>${need[t]}장 이상</em><span>${esc(s.desc)}</span></div>` : '')).join('') + '</div>').join('');
  }
  function renderDeck() {
    const f = save.faction, deck = save.decks[f];
    $('deckTitle').textContent = `덱 편성 · ${FACTIONS[f].name}`;
    $('deckAvg').innerHTML = `<i class="gold-i"></i>${save.gold}`;
    $('facPf').style.backgroundImage = `url(${IMG[FACTIONS[f].banner]})`; $('facName').textContent = FACTIONS[f].name; $('btnFaction').className = 'facrow f-' + f;
    if (slotSel != null && slotSel > deck.length) slotSel = null;
    const picking = true; // (the codex is always shown under the deck)
    $('deckHint').textContent = deck.length < 8 ? `${8 - deck.length}장을 더 넣으세요` : ''; // (only an unfinished deck says anything)
    // what the deck is made of (kinds and flyers), shown while the codex is closed
    const comp = {}; deck.forEach((id) => { const k = kindOf(CARD[id]); comp[k] = (comp[k] || 0) + 1; });
    const airN = deck.filter((id) => CARD[id].air).length, anti = deck.filter((id) => CARD[id].type !== 'spell' && CARD[id].hits !== 'ground' && (CARD[id].dmg || 0) > 0).length;
    $('deckTabs').innerHTML = save.deckSlots[f].map((d, i) => `<button data-i="${i}" class="${i === save.deckSlot[f] ? 'on' : ''}">덱 ${i + 1}</button>`).join('');
    const slots = $('deckSlots');
    slots.innerHTML = '';
    deck.forEach((id, i) => {
      const el = cardEl(CARD[id], slotSel === i ? 'sel' : '', { lv: levelOf(id), rank: true, tile: true });
      el.onclick = () => { // a tap opens its details at once (and keeps it picked: a codex card then goes into its place)
        slotSel = i; deckSel = id; cardOpen = true;
        SFX.play('click'); renderDeck();
      };
      slots.appendChild(el);
    });
    for (let i = deck.length; i < 8; i++) { // empty places of an unfinished deck
      const el = document.createElement('div'); el.className = 'tile'; el.innerHTML = `<div class="card emptyslot${slotSel === i ? ' sel' : ''}"><span>빈 칸</span></div>`;
      el.onclick = () => { slotSel = slotSel === i ? null : i; cardOpen = false; SFX.play('click'); renderDeck(); };
      slots.appendChild(el);
    }
    if (!CSORT[save.collSort]) save.collSort = 'faction';
    $('collSort').innerHTML = Object.entries(CSORT).map(([k, n]) => `<button data-s="${k}" class="${save.collSort === k ? 'on' : ''}">${n}${save.collSort === k ? (save.collDesc ? ' ▼' : ' ▲') : ''}</button>`).join('');
    const col = $('collection');
    col.innerHTML = '';
    const list = !picking ? [] : DATA.CARDS.filter((c) => !deck.includes(c.id)).sort(collOrder(save.collSort, f, !!save.collDesc)); // (cards in the deck above are not repeated here)
    list.forEach((c) => {
      const o = save.cards[c.id];
      const locked = !unlocked(c) || !o;
      const el = cardEl(c, (cardOpen && deckSel === c.id ? 'sel' : '') + (canUpgrade(c) ? ' upg' : ''), { lv: o && o.lv, locked, isNew: !locked && save.newCards && save.newCards[c.id], rank: true, tile: true });
      el.onclick = () => { deckSel = c.id; cardOpen = true; if (save.newCards && save.newCards[c.id]) { delete save.newCards[c.id]; persist(); } renderDeck(); };
      col.appendChild(el);
    });
    const info = $('cardInfo');
    const c = cardOpen && deckSel && CARD[deckSel];
    $('cardOv').hidden = !c;
    cardPreview(c || null);
    if (!c) return; // (the details live in a popup: only while a card is tapped)
    const o = save.cards[c.id], lv = o ? o.lv : LEVEL.min, m = LEVEL.mult(lv);
    const st = [];
    if (c.type === 'troop') {
      st.push(['체력', Math.round(c.hp * m) + (c.count > 1 ? ` ×${c.count}` : '')], ['공격력', Math.round(c.dmg * m)], ['공격 속도', c.rate + '초'], ['사거리', c.range <= 1.2 ? '근접' : c.range],
        ['이동', c.speed >= 2 ? '매우 빠름' : c.speed >= 1.5 ? '빠름' : c.speed >= 1 ? '보통' : '느림'],
        ['대상', c.aim === 'buildings' ? '건물' : c.hits === 'ground' ? '지상' : '공중·지상']);
      if (c.air) st.push(['유형', '비행']);
      if (c.heal) st.push(['치료', `${Math.round(c.heal.amount * m)} / ${c.heal.every}초`], ['치료 반경', c.heal.radius]);
      if (c.healHit) st.push(['공격 시 회복', Math.round(c.healHit.amt * m)], ['회복 반경', c.healHit.r]);
      if (c.chain) st.push(['연쇄', c.chain + '타겟']);
      if (c.slow) st.push(['둔화', Math.round(c.slow * 100) + '%']);
      if (c.splash) st.push(['범위', c.splash]);
    } else if (c.type === 'building') {
      st.push(['체력', Math.round(c.hp * m)], ['유지', c.life + '초']);
      if (c.dmg) st.push(['공격력', Math.round(c.dmg * m)], ['공격 속도', c.rate + '초'], ['사거리', c.range], ['대상', '공중·지상']);
      if (c.spawn) st.push(['출격', `${CARD[c.spawn.card].name} / ${c.spawn.every}초`]);
    } else if (c.spell === 'rage') {
      st.push(['반경', c.radius], ['지속', c.dur + '초'], ['가속', '+' + Math.round((c.k - 1) * 100) + '%']);
    } else if (c.spell === 'clone') {
      st.push(['반경', c.radius], ['복제체 체력', 1]);
    } else if (c.spell === 'heal') {
      st.push(['반경', c.radius], ['회복', Math.round(c.heal * m)]);
    } else if (c.spell === 'lightning') {
      st.push(['피해', Math.round(c.dmg * m)], ['반경', c.radius], ['대상', c.n + '개'], ['탑 피해', Math.round(c.dmg * m * c.towerK)], ['기절', c.stun + '초']);
    } else if (c.spell === 'volley') {
      st.push(['피해', Math.round(c.dmg * m)], ['반경', c.radius], ['탄막', c.waves + '회'], ['탑 피해', Math.round(c.dmg * m * c.towerK)]);
    } else if (c.spell === 'pull') {
      st.push(['피해', Math.round(c.dmg * m * c.dur) + ' (총)'], ['반경', c.radius], ['지속', c.dur + '초']);
    } else {
      st.push(['피해', Math.round(c.dmg * m) + (c.dur ? '/초' : '')], ['반경', c.radius], ['탑 피해', Math.round(c.dmg * m * c.towerK)]);
      if (c.dur) st.push(['지속', c.dur + '초']);
      if (c.stun) st.push(['기절', c.stun + '초']);
      if (c.freeze) st.push(['빙결', c.freeze + '초']);
    }
    const inDeck = deck.includes(c.id);
    let act = '';
    if (!o || !unlocked(c)) act = '<span class="hint">아직 없는 카드 · 승리하면 새 카드가 1장씩 열립니다</span>';
    else {
      if (LEVEL.fixed) act += `<span class="hint">${LEVEL.fixed}레벨 고정 중</span>`;
      else if (lv < LEVEL.max) {
        const k = upCost(c, lv);
        act += `<button class="btn ${canUpgrade(c) ? 'g' : 'd'} sm" id="btnUp" ${canUpgrade(c) ? '' : 'disabled'}>강화 Lv.${lv + 1} · 카드 ${o.n}/${k.n} · <i class="gold-i"></i>${k.gold}</button>`;
      } else act += '<span class="hint">최대 레벨</span>';
      const left = copiesLeft(c), ms = save.master[c.rarity] || 0;
      if (ms > 0 && left > 0) act += ` <button class="btn g sm" id="btnMaster">${RARITY[c.rarity].name} 대체코어 사용 +${Math.min(ms, left)} <small>(보유 ${ms})</small></button>`;
      act += inDeck ? ' <button class="btn d sm out" id="btnOut">덱에서 빼기</button>' : ` <button class="btn y sm" id="btnUse">${slotSel != null && slotSel >= 0 && slotSel < deck.length ? '이 카드로 교체' : '덱에 넣기'}</button>`;
    }
    const skill = c.skill ? `<div class="heronote">영웅: 덱에 1장만, 전장에는 1기만 나옵니다 (나와 있는 동안 카드가 손에 들어오지 않음)</div><div class="skillinfo"><b>영웅 스킬 · ${esc(c.skill.name)}</b> <span class="cost-s">${c.skill.cost}</span><br>${esc(c.skill.desc)} (재사용 ${c.skill.cd}초${c.skill.dmg ? ' · 피해 ' + Math.round(c.skill.dmg * m) : ''}${c.skill.radius ? ' · 반경 ' + c.skill.radius : ''}${c.skill.reach ? ' · 사거리 ' + c.skill.reach : ''})</div>` : '';
    info.innerHTML = `<div class="ci-body"><div class="ci-tags">${kindIc(c, true)}${moveIc(c, true)}</div><h4>${esc(c.name)} <small>Lv.${lv}</small></h4><p>${esc(c.desc)}</p>${skill}
      <dl>${st.map(([k2, v]) => `<div><dt>${k2}</dt><dd>${v}</dd></div>`).join('')}</dl></div>`;
    $('cardAct').innerHTML = act;
    const b = $('btnUse');
    if (b) b.onclick = () => { // into the picked place (or the first free one); the codex closes
      if (c.skill && deck.some((d, k) => CARD[d].skill && k !== slotSel)) { toast('영웅은 덱에 1장만 넣을 수 있습니다'); SFX.play('fail', 0.4); return; } // (unless it replaces the hero)
      if (slotSel != null && slotSel >= 0 && slotSel < deck.length) deck[slotSel] = c.id; else if (deck.length < 8) deck.push(c.id); else { toast('덱에서 바꿀 카드를 먼저 고르세요'); SFX.play('fail', 0.4); return; } // (browsing: a full deck needs a place picked)
      persist(); slotSel = null; cardOpen = false; deckSel = null; SFX.play('click'); renderDeck();
    };
    const mb = $('btnMaster');
    if (mb) mb.onclick = () => { const add = Math.min(save.master[c.rarity], copiesLeft(c)); if (add <= 0) return; save.master[c.rarity] -= add; o.n += add; persist(); SFX.play('pickSS', 0.6); toast(`${c.name} 카드 +${add}`); renderDeck(); };
    const out = $('btnOut');
    if (out) out.onclick = () => { deck.splice(deck.indexOf(c.id), 1); persist(); cardOpen = false; deckSel = null; slotSel = null; SFX.play('click'); renderDeck(); };
    const u = $('btnUp');
    if (u) u.onclick = () => {
      const k = upCost(c, o.lv);
      if (o.n < k.n || save.gold < k.gold) return;
      o.n -= k.n; save.gold -= k.gold; o.lv++;
      persist();
      SFX.play('rankUp', 0.7); SFX.voice('ann:levelup', 1, 3);
      renderDeck();
      const head = info.querySelector('.ci-head .card');
      if (head) head.classList.add('levelup');
    };
  }

  // ── battle HUD ────────────────────────────────────────
  let handKey = '', prevHand = [];
  function hand(played) {
    { const S = GAME.G.sides && GAME.G.sides.blue; if (S) for (const id of S.hand.concat(S.queue || [])) if (CARD[id] && CARD[id].skill) cutArt(id); } // the heroes' cut-in art loads well before their first skill
    const G = GAME.G, S = G.sides && G.sides.blue;
    if (!S) return;
    const h = $('hand');
    // selection only toggles a class: rebuilding would detach the card under the finger mid-gesture (iOS drops the pointer)
    // the next card: while a hero is on the field, hero cards wait (as the draw does, see playCard)
    const heroOut = G.ents.some((e) => e.side === 'blue' && e.kind === 'troop' && e.alive && e.card.skill);
    const nextId = (heroOut && S.queue.find((q) => !CARD[q].skill)) || S.queue[0];
    const key = S.hand.join() + '|' + nextId;
    if (key !== handKey) {
      handKey = key;
      h.innerHTML = '';
      S.hand.forEach((id, i) => {
        const el = cardEl(CARD[id], played && prevHand[i] && prevHand[i] !== id ? 'enter' : '', { lv: levelOf(id), rank: true }); // (kind and flying badges in the fight too)
        el.dataset.i = i;
        el.addEventListener('pointerdown', (ev) => { ev.preventDefault(); GAME.cardDown(i, ev); SFX.play('click', 0.3); });
        el.insertAdjacentHTML('beforeend', `<kbd>${i + 1}</kbd>`);
        h.appendChild(el);
        if (el.classList.contains('enter')) setTimeout(() => el.classList.remove('enter'), 450); // the draw animation can never leave a card stuck small by NEXT (paused or throttled animations)
      });
      prevHand = S.hand.slice();
      const n = $('nextCard');
      n.innerHTML = '';
      if (nextId) n.appendChild(cardEl(CARD[nextId], 'mini'));
      tickCards(true);
    }
    for (const el of h.children) el.classList.toggle('sel', +el.dataset.i === G.sel);
    costPrev();
    const tip = $('cardTip'), sc = G.sel >= 0 && CARD[S.hand[G.sel]];
    tip.hidden = !sc;
    if (sc) tip.innerHTML = `${kindIc(sc, true)}${moveIc(sc, true)}<b>${esc(sc.name)}</b> ${esc(sc.desc)}${sc.skill ? `<br><em>스킬 · ${esc(sc.skill.name)}: ${esc(sc.skill.desc)}</em>` : ''}`;
  }
  let lastEl = -1;
  // the selected card's cost marked on the energy bar (red when it cannot be paid yet)
  function costPrev() {
    const G = GAME.G, S = G.sides && G.sides.blue, el = $('costPrev');
    const c = S && G.sel >= 0 && CARD[S.hand[G.sel]];
    if (!c) { el.hidden = true; return; }
    const e = S.elixir, M = BAL.elixirMax;
    el.hidden = false;
    el.classList.toggle('lack', e < c.cost);
    el.style.left = (Math.max(0, e - c.cost) / M * 100) + '%';
    el.style.width = (c.cost / M * 100) + '%';
  }
  function tickCards(force) {
    const S = GAME.G.sides.blue;
    const e = S.elixir;
    if (!force && Math.abs(e - lastEl) < 0.1 && Math.floor(e) === Math.floor(lastEl) && !(e >= BAL.elixirMax && lastEl < BAL.elixirMax)) return; // 1% steps of the bar (and always when a whole point is reached: a card becomes playable right then)
    if (Math.floor(e) > Math.floor(lastEl) && lastEl >= 0) { const d = $('elixir').querySelector('.drop'); d.classList.remove('pulse'); void d.offsetWidth; d.classList.add('pulse'); }
    lastEl = e;
    $('elixirFill').style.width = (e / BAL.elixirMax * 100) + '%';
    $('elixirNum').textContent = Math.floor(e);
    costPrev();
    $('elixir').classList.toggle('full', e >= BAL.elixirMax - 1e-3);
    $('elixir').classList.toggle('near', e >= BAL.elixirMax - 1.2 && e < BAL.elixirMax - 1e-3); // about to leak: spend soon
    for (const el of $('hand').children) {
      const c = CARD[S.hand[+el.dataset.i]];
      const lack = c.cost - e;
      const fill = lack > 0 ? Math.min(95, Math.round(Math.max(0, 1 - lack / c.cost) * 20) * 5) : 100; // 5% steps: few style writes (a card still short never shows full)
      const poor = lack > 0;
      if (el._fill === fill && el._poor === poor) continue; // (the affordable state is part of the key: it must flip even if the fill step did not change)
      el._fill = fill; el._poor = poor;
      if (lack <= 0 && el.classList.contains('poor')) { el.classList.remove('afford'); requestAnimationFrame(() => el.classList.add('afford')); SFX.play('click', 0.12); } // just became affordable: a small pop
      el.classList.toggle('poor', lack > 0);
      el.style.setProperty('--fill', fill + '%');
    }
  }
  let lastClock = '';
  // commander support button: a charging ring, then a pulsing call button; gone once used
  let supKey = '';
  function tickSupport() {
    const sp = GAME.supportOf('blue'), b = $('supBtn');
    if (!sp) { b.hidden = true; return; }
    const key = (sp.used ? 'u' : sp.ready ? 'r' : Math.floor(sp.charge * 50)) + sp.faction;
    if (key === supKey) return;
    const step = sp.ready ? 2 : sp.charge >= 0.8 ? 1 : sp.charge >= 0.5 ? 0 : -1; // a bump at 50% and 80% so the charge is felt
    if (step >= 0 && step < 2 && b._step !== step && b._step != null && !b.hidden) { b.classList.remove('bump'); requestAnimationFrame(() => b.classList.add('bump')); }
    b._step = step;
    if (step === 2) b.classList.remove('bump'); // (the ready pulse takes over)
    if (sp.ready && !b.classList.contains('ready') && !b.hidden) { SFX.play('charge', 0.7); b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); } // the moment it charges: a cue and a bump
    supKey = key;
    b.hidden = sp.used;
    b.classList.toggle('ready', sp.ready);
    b.classList.toggle('iron', sp.faction === 'iron');
    { const ic = b.querySelector('.sicon'), u = sp.icon && IMG[sp.icon]; if (ic && ic._u !== u) { ic._u = u; ic.style.backgroundImage = u ? `url(${u})` : ''; } } // the faction's support, as a character portrait
    b.style.setProperty('--p', Math.round(sp.charge * 100) + '%');
    b.querySelector('small').textContent = sp.ready ? sp.name : ''; // charging: the ring says it (players don't reason in percent)
    b.title = `${sp.name}: ${sp.desc}`;
  }
  function elixirLeak() { const el = $('elixir'); el.classList.remove('leak'); requestAnimationFrame(() => el.classList.add('leak')); }
  function tick(G) {
    if (!G.sides) return;
    tickCards();
    tickSupport();
    // your king under 30%: the screen edge pulses red (shows existing state only)
    const kg = G.phase === 'play' && G.sides.blue.towers.find((t) => t.type === 'king'), dz = !!(kg && kg.alive && kg.hp < kg.max * 0.3);
    const gd = $('grade'); if (gd.classList.contains('danger') !== dz) gd.classList.toggle('danger', dz);
    const t = Math.max(0, Math.ceil(G.clock));
    const s = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    if (s !== lastClock) {
      lastClock = s;
      $('timerVal').textContent = s;
      $('timerLabel').textContent = G.overtime ? '연장전' : '남은 시간';
      $('timer').classList.toggle('hot', G.overtime || G.clock <= BAL.doubleAt);
      $('timer').classList.toggle('last', G.clock <= 10);
      $('multTag').textContent = G.mult > 1 ? `에너지 x${G.mult}` : '';
      $('elixir').classList.toggle('x2', G.mult > 1);
      if (G.phase === 'play' && G.clock <= 10 && G.clock > 0 && t !== tick.lastBeep) { tick.lastBeep = t; if (!SFX.voice('ann:' + t, 0.9, 4)) SFX.play('click', 0.35); } // the announcer counts the last ten seconds
    }
    // champion skill buttons
    // buttons are patched in place in deployment order: a new champion takes a free slot and the others never move (Q / W / E stay put)
    const live = G.phase === 'play' ? GAME.champions('blue') : [];
    const bar = $('skillBar');
    for (let i = bar.children.length - 1; i >= 0; i--) { // (no array or closure per frame)
      const b = bar.children[i], id = +b.dataset.id;
      let on = false;
      for (let j = 0; j < live.length; j++) if (live[j].id === id) { on = true; break; }
      if (on) continue;
      if (aim && aim.u.id === id) { clearInterval(aim.timer); GAME.aimHide(); aim = null; bar.classList.remove('cancel'); } // its champion fell mid-aim
      b.remove();
    }
    for (let k = live.length - 1; k >= 0 && bar.children.length < 3; k--) { // oldest first
      const u = live[k];
      if (bar.querySelector(`[data-id="${u.id}"]`)) continue;
      const b = document.createElement('button');
      b.className = 'skb';
      b.dataset.id = u.id;
      b._u = u;
      cutArt(u.card.id); // (the cut-in art is ready before the first skill)
      b.innerHTML = `<span class="pf" style="background-image:url(${art(u.card)})"></span><span class="cd"></span><i class="cdn"></i><b>${esc(u.card.skill.name)}</b><span class="cost-s">${GAME.skillState(u).cost}</span>${HOVER ? '<i class="hk"></i>' : ''}`;
      if (GAME.aimable(u)) b.title = '탭: 자동 조준 · 전장으로 끌기: 직접 조준';
      b.addEventListener('pointerdown', (ev) => { ev.preventDefault(); ev.stopPropagation(); if (GAME.aimable(u) && GAME.skillState(u).ready && !aim) { startAim(u, b, ev); return; } fireSkill(u); });
      const st0 = GAME.skillState(u); b._ready = st0.ready && G.sides.blue.elixir >= st0.cost; // no "ready" chime just for appearing
      b.classList.toggle('ready', b._ready);
      bar.appendChild(b);
    }
    const e = G.sides.blue.elixir;
    for (let i = 0; i < bar.children.length; i++) {
      const b = bar.children[i], u = b._u; // paired by the button's own champion, never by index
      if (HOVER) { const hk = b.querySelector('.hk'); if (hk && hk.textContent !== 'QWE'[i]) hk.textContent = 'QWE'[i]; }
      const st = GAME.skillState(u);
      const deg = Math.round(st.cd / st.cdMax * 72) * 5, ready = st.ready && e >= st.cost;
      if (b._deg !== deg) { b._deg = deg; b.style.setProperty('--cd', deg + 'deg'); }
      { const sec = st.cd > 0 ? String(Math.ceil(st.cd)) : ''; if (b._sec !== sec) { b._sec = sec; b.querySelector('.cdn').textContent = sec; } } // the seconds left, on the portrait
      if (b._ready !== ready) { b._ready = ready; b.classList.toggle('ready', ready); if (ready) SFX.play('charge', 0.25); }
      const why = !u.alive ? '' : u.stunT > 0 || u.freezeT > 0 ? 'stun' : u.casting > 0 ? 'cast' : u.deployT > 0 ? 'deploy' : st.cd <= 0 && e < st.cost ? 'poor' : ''; // why it is not ready, shown on the button itself
      if (b._why !== why) { b._why = why; b.dataset.why = why; }
    }
  }
  function crowns() {
    const G = GAME.G;
    for (const [side, el] of [['red', 'crRed'], ['blue', 'crBlue']]) {
      const n = G.sides[side].crowns;
      $(el).innerHTML = [0, 1, 2].map((i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('');
    }
  }
  function crownFly(tower, toSide) {
    const r = $('stage').getBoundingClientRect(), dead = tower.label.classList.contains('dead');
    if (dead) tower.label.classList.remove('dead'); // (a hidden plate has no box: the crown would start in the screen's corner)
    const lab = tower.label.getBoundingClientRect();
    if (dead) tower.label.classList.add('dead');
    if (!lab.width) return;
    const target = $(toSide === 'blue' ? 'crBlue' : 'crRed').getBoundingClientRect();
    const el = document.createElement('i');
    el.className = 'flycrown ' + toSide;
    el.style.left = (lab.left - r.left) + 'px'; el.style.top = (lab.top - r.top) + 'px';
    $('stage').appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.style.transform = target.width ? `translate(${target.left - lab.left + 20}px,${target.top - lab.top}px) scale(.6)` : 'translate(0,-70px) scale(1.5)'; // no crown counter on screen: the crown just rises from the fallen tower
      el.style.opacity = '0.2';
    }));
    setTimeout(() => el.remove(), 1300);
  }
  let toastT = 0;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(() => el.classList.remove('on'), 1400);
  }
  function banner(msg, kind, n) {
    const el = $('banner');
    if (document.querySelector('.skcut:not(.mini)') && (n || 0) < 8) { setTimeout(() => banner(msg, kind, (n || 0) + 1), 250); return; } // one full-width band at a time: it waits for the hero ribbon
    el.className = 'banner ' + (kind || '');
    el.textContent = msg;
    void el.offsetWidth;
    el.classList.add('on');
  }
  function countdown(n) {
    const el = $('countdown');
    el.textContent = n > 0 ? n : '';
    el.className = 'on' + (n > 0 ? '' : ' go');
    void el.offsetWidth;
    el.classList.add('pop');
    if (n <= 0) setTimeout(() => { el.className = ''; }, 1000);
  }
  // battle overlays end with their own CSS animation (which a pause freezes: #stage.paused); a slow fallback covers a tab that never animates
  function pausedRemove(el) {
    el.addEventListener('animationend', (ev) => { if (ev.target === el) el.remove(); });
    const check = () => { if (!el.isConnected) return; if (GAME.G.paused) setTimeout(check, 1000); else el.remove(); };
    setTimeout(check, 6000);
  }
  const HOVER = window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches; // a mouse: show the Q / W / E keys
  const FULL_ART = new Set(['empress', 'sleipnir', 'labiata', 'titania', 'tiamat', 'constantia', 'fafnir', 'ramiel', 'goltarion', 'nidhogg']);
  const PANEL_ART = new Set(['blackknight', 'juggernaut', 'executioner', 'emperorchick']); // original boss panels (no full-body art)
  const CUT_IMG = {};
  function cutArt(id) { const src = FULL_ART.has(id) ? `assets/full/${id}.png` : PANEL_ART.has(id) ? `assets/full/${id}_panel.png` : null; if (src && !CUT_IMG[id]) { const im = CUT_IMG[id] = new Image(); im.src = src; } return CUT_IMG[id]; }
  function skillCut(u, sy, waited) {
    if (u.side === 'blue' && !waited) { const im = cutArt(u.card.id); if (im && !(im.complete && im.naturalWidth)) { if (!u._cutWait) { u._cutWait = 1; const go = () => { u._cutWait = 0; if (u.alive) skillCut(u, sy, true); }; Promise.race([im.decode().catch(() => {}), new Promise((r) => setTimeout(r, 150))]).then(go); } return; } } // the ribbon waits a moment for its art (never a half-built band)
    const el = document.createElement('div');
    // one cut-in per side at a time; the opponent's is a compact banner that keeps the field readable
    document.querySelectorAll('.skcut.' + u.side).forEach((x) => x.remove());
    el.className = 'skcut ' + u.side + (u.side === 'red' ? ' mini' : '');
    if (u.side === 'blue') el.style.top = (sy != null && sy < 0.5 ? 64 : 40) + '%'; // away from the blast and clear of both tower rows
    if (u.side === 'red') document.querySelectorAll('.bubble.red').forEach((x) => x.classList.add('low'));
    // champions with original full-body art step into the cut-in; the rest keep the portrait chip
    const face = u.side === 'red' && FULL_ART.has(u.card.id) ? `<span class="pf face" style="background-image:url(assets/full/${u.card.id}.png)"></span>` : u.side === 'red' && PANEL_ART.has(u.card.id) ? `<span class="pf face panel-face" style="background-image:url(assets/full/${u.card.id}_panel.png)"></span>` : '';
    el.innerHTML = face ? face + `<span class="ct"><b>${esc(u.card.skill.name)}</b><small>${esc(u.card.name)}</small></span>` : (u.side === 'blue' && PANEL_ART.has(u.card.id) ? `<img class="panel" alt="" src="assets/full/${u.card.id}_panel.png">` : u.side === 'blue' && FULL_ART.has(u.card.id) && (!CUT_IMG[u.card.id] || CUT_IMG[u.card.id].naturalWidth) ? `<img class="full" alt="" src="assets/full/${u.card.id}.png">` : `<span class="pf" style="background-image:url(${art(u.card)})"></span>`) + `<span class="ct"><b>${esc(u.card.skill.name)}</b><small>${esc(u.card.name)}</small></span>`;
    $('stage').appendChild(el);
    pausedRemove(el);
  }
  // a big two-line shout in the middle of the field (Heaven and Hell)
  function shout(en, kr, big) {
    document.querySelectorAll('.shout').forEach((x) => x.remove());
    const el = document.createElement('div'); el.className = 'shout' + (big ? ' big' : '');
    el.innerHTML = `<b>${esc(en)}</b><small>${esc(kr)}</small>`;
    $('stage').appendChild(el); pausedRemove(el);
  }
  function emote(side, i, atEnd) {
    const G = GAME.G;
    if (!G.sides || G.paused || (G.phase !== 'play' && !(atEnd && G.phase === 'ended'))) return; // only in play (the victory taunt excepted), never over the pause menu
    const em = DATA.EMOTES[i];
    if (!em) return;
    const old = document.querySelector('.bubble.' + side);
    if (old) old.remove();
    const el = document.createElement('div');
    el.className = 'bubble ' + side + (side === 'red' && document.querySelector('.skcut.red') ? ' low' : '');
    el.innerHTML = `<span class="pf emo" style="background-image:url(assets/emoji/${em[0]}.webp)"></span><b>${esc(em[1])}</b>`;
    $('stage').appendChild(el);
    // the bubble comes out of that side's king tower (above ours, below theirs)
    const king = G.sides[side].towers.find((t) => t.type === 'king' && t.label);
    if (king) {
      const st = $('stage').getBoundingClientRect(), r = (king.label.querySelector('.bar') || king.label).getBoundingClientRect(); // (the label itself is a 0-size anchor: measure its plate)
      if (r.width) {
        el.classList.add('at');
        const cx = r.left + r.width / 2 - st.left, w = el.offsetWidth;
        el.style.left = Math.max(6, Math.min(st.width - w - 6, cx - w / 2)) + 'px';
        el.style.right = 'auto'; el.style.bottom = 'auto';
        el.style.top = (side === 'blue' ? r.top - st.top - el.offsetHeight - 70 : r.bottom - st.top + 10) + 'px';
        el.style.setProperty('--tail', (cx - parseFloat(el.style.left)) + 'px');
      }
    }
    SFX.play('click', 0.4);
    pausedRemove(el);
  }
  function dragCard(d, x, y, over) {
    const el = $('dragCard');
    if (!d) { el.hidden = true; el.innerHTML = ''; return; }
    if (!el.firstChild) el.appendChild(cardEl(CARD[GAME.G.sides.blue.hand[d.i]]));
    el.hidden = !d.moved || over;
    el.classList.toggle('cancel', d.moved && !over && y > $('stage').getBoundingClientRect().bottom - 6); // back over the hand: let go to cancel
    el.style.transform = `translate(${x}px,${y}px)`;
  }
  // floating damage on towers (DOM: crisp text; at most a few alive)
  const dmgRecent = []; // numbers still popping: a hit landing close to one merges into it (one counting number, not a stack)
  function dmgNum(x, y, n, side) {
    const box = $('labels'), now = performance.now();
    for (const r of dmgRecent) if (r.side === side && now - r.t < 450 && Math.abs(r.x - x) < 72 && Math.abs(r.y - y) < 64 && r.el.isConnected) { r.n += n; r.el.textContent = '-' + r.n; r.el.classList.toggle('big', r.n >= 300); const an = r.el.getAnimations ? r.el.getAnimations()[0] : null; if (an) an.currentTime = 0; else { r.el.style.animation = 'none'; void r.el.offsetWidth; r.el.style.animation = ''; } r.t = now; return; }
    if (dmgLive >= 24) return;
    const el = dmgPool.pop() || document.createElement('span'); // nodes are reused (no DOM churn in big fights)
    el.className = 'dmgn ' + side + (n >= 300 ? ' big' : '');
    el.textContent = '-' + n;
    el.style.left = (x + (Math.random() - 0.5) * 26) + 'px'; el.style.top = Math.max(60, y - (dmgLive % 3) * 12) + 'px'; el.style.left = Math.min(Math.max(parseFloat(el.style.left), 24), (box.clientWidth || 375) - 24) + 'px'; // spread so quick hits never stack on one spot
    box.appendChild(el);
    dmgLive++;
    const rec = { el, x, y, n, side, t: now }; dmgRecent.push(rec); if (dmgRecent.length > 12) dmgRecent.shift();
    const done = () => { if (now === rec.t || performance.now() - rec.t >= 880) { el.remove(); dmgLive--; const i = dmgRecent.indexOf(rec); if (i >= 0) dmgRecent.splice(i, 1); if (dmgPool.length < 24) dmgPool.push(el); } else setTimeout(done, 880 - (performance.now() - rec.t)); };
    setTimeout(done, 900);
  }
  const dmgPool = [];
  // a heal number (commander repair): green, rising, never merged with damage numbers
  function healNum(x, y, txt) {
    const el = document.createElement('span');
    el.className = 'dmgn heal';
    el.textContent = txt;
    el.style.left = x + 'px'; el.style.top = y + 'px';
    $('labels').appendChild(el);
    setTimeout(() => el.remove(), 1300);
  }
  // champion skills: tap = auto aim; barrage / laser / dash can also be dragged onto the field to aim them
  let aim = null;
  function fireSkill(u, spot) {
    if (GAME.useSkill(u, spot)) return;
    const G = GAME.G;
    if (G.phase !== 'play' || G.paused) return; // the match ended or paused under the finger: nothing to say
    SFX.play('fail', 0.3);
    if (u.alive && u.skillCd > 0) SFX.voice('ann:notready', 0.8, 1);
    toast(!u.alive ? '챔피언이 쓰러졌습니다' : u.stunT > 0 || u.freezeT > 0 ? '기절·빙결 중에는 스킬을 쓸 수 없습니다' : u.casting > 0 ? '스킬 시전 중입니다' : u.deployT > 0 ? '배치가 끝나면 쓸 수 있습니다'
      : u.skillCd > 0 ? '스킬 재사용 대기 중' : '에너지가 부족합니다');
  }
  // where the aim would land: null when the pointer is off the field or back over the skill bar (= cancel)
  function aimSpot(ev) {
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    if (el && el.closest('#skillBar, #hand, #hud')) return null;
    return GAME.clientToField(ev.clientX, ev.clientY);
  }
  function startAim(u, b, ev) {
    try { b.setPointerCapture(ev.pointerId); } catch (e) { /* synthetic events */ } // the field never sees this pointer (no card drop / ghost drag)
    aim = { u, pid: ev.pointerId, x0: ev.clientX, y0: ev.clientY, f: null, dragged: false };
    // the preview is redrawn while the finger rests, not only when it moves
    // until the finger moves, show where a tap would land (auto aim); the preview follows the champion while held
    aim.timer = setInterval(() => { if (!aim) return; const p = aim.f || (!aim.dragged && GAME.autoSpot(aim.u)); if (p) GAME.aimPreview(aim.u, p.x, p.z); }, 100);
    const p0 = GAME.autoSpot(u); if (p0) GAME.aimPreview(u, p0.x, p0.z);
  }
  window.addEventListener('pointermove', (ev) => {
    if (!aim || ev.pointerId !== aim.pid) return;
    aim.dragged = aim.dragged || Math.hypot(ev.clientX - aim.x0, ev.clientY - aim.y0) > 18;
    if (!aim.dragged) return;
    const f = aimSpot(ev), moved = !aim.f || !f || Math.hypot(f.x - aim.f.x, f.z - aim.f.z) > 0.25;
    aim.f = f;
    $('skillBar').classList.toggle('cancel', !f);
    if (f && moved) GAME.aimPreview(aim.u, f.x, f.z); else if (!f) GAME.aimHide();
  });
  const endAim = (ev, cancel) => {
    if (!aim || ev.pointerId !== aim.pid) return; // another finger: not this aim
    const a = aim; aim = null;
    clearInterval(a.timer); GAME.aimHide();
    $('skillBar').classList.remove('cancel');
    if (cancel) return;
    const f = a.dragged ? aimSpot(ev) : null;
    if (a.dragged && !f) { toast('조준을 취소했습니다'); return; } // dropped back off the field
    fireSkill(a.u, f);
  };
  window.addEventListener('pointerup', (ev) => endAim(ev));
  window.addEventListener('pointercancel', (ev) => endAim(ev, true));
  let dmgLive = 0;
  function elixirShake() { const el = $('elixir'); el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }

  // VS loading screen (the commander is picked when the battle starts: opts.foe)
  let foe = null;
  // mirror operation: the opponent fights with the player's own faction (and one of its commanders)
  const foeFaction = (o) => ((o.mode === 4 || o.online) && o.foeFaction ? o.foeFaction : o.mode === 3 && (o.mut || DATA.mutatorOf()).mirror ? o.faction : o.foeFaction || (o.faction === 'orca' ? 'iron' : 'orca'));
  // the AI opponent's faction: one of the three at random, now and then the commander himself
  const CMD_CHANCE = 0.15;
  const randomFoe = () => (Math.random() < CMD_CHANCE ? 'cmd' : ['orca', 'iron', 'lemonade'][Math.floor(Math.random() * 3)]);
  // practice: the opponent plays one of the player's own decks (its faction is the deck's majority) or an AI deck
  const PFOE = { ai: 'AI 덱', orca: '내 덱' }; // (one set of decks: 'orca' is the key of the shared deck)
  function practiceOpts() {
    if (save.mode !== 4) return {};
    const k = save.practiceFoe, d = k !== 'ai' && save.decks[k];
    if (!d || d.length !== 8) return {}; // (an unfinished deck: the AI deck instead)
    const n = { orca: 0, iron: 0 }; d.forEach((id) => { if (CARD[id] && n[CARD[id].faction] != null) n[CARD[id].faction]++; });
    return { foeDeck: d.slice(), foeFaction: n.orca === n.iron ? k : n.orca > n.iron ? 'orca' : 'iron' };
  }
  function loading(f, opts) {
    const el = $('loading');
    if (opts) $('btnPause').hidden = !!opts.online; // the pause button is for AI matches only
    if (el.hidden && opts) {
      SFX.voice('ann:battlestart', 1, 3); // "잠시 후 전투가 시작됩니다"
      const ff = foeFaction(opts);
      foe = opts.foe || DATA.COMMANDERS[ff][0];
      const st = DATA.STYLES[foe.style] || DATA.STYLES.balanced;
      const myDeck = (GAME.G.sides && GAME.G.sides.blue.deck) || opts.deck;
      if (GAME.G.sides) for (const s of ['blue', 'red']) for (const id of GAME.G.sides[s].deck) if (FULL_ART.has(id)) new Image().src = `assets/full/${id}.png`; else if (PANEL_ART.has(id)) new Image().src = `assets/full/${id}_panel.png`; // cut-in art ready before the first skill
      const vd = $('vsDeck'); vd.innerHTML = ''; myDeck.forEach((id) => vd.appendChild(cardEl(CARD[id], 'mini', { lv: levelOf(id) })));
      $('vsMe').style.backgroundImage = `url(${IMG[FACTIONS[opts.faction].banner]})`;
      $('vsFoe').style.backgroundImage = `url(${IMG[foe.img]})`;
      $('vsMeName').textContent = save.nick || '사령관';
      $('vsMeSub').textContent = `${FACTIONS[opts.faction].name} · 트로피 ${save.trophy}`;
      $('vsFoeName').textContent = foe.name;
      const rl = GAME.G.sides && GAME.G.sides.red.lvl;
      $('vsFoeSub').innerHTML = (rl ? `<b class="style">Lv.${rl}</b> · ` : '') + `${FACTIONS[ff].name} · <b class="style">${st.name}</b> · ${BAL.diffs[opts.diff].name} · ${opts.mode === 3 ? (opts.mut || DATA.mutatorOf()).name : BAL.modes[opts.mode].name}`;
      $('vsArena').textContent = ARENAS[opts.arena].name;
      $('vsHint').hidden = true; // (no hint about the opponent's deck on the matching screen)
      const mr = opts.mode === 3 ? opts.mut || DATA.mutatorOf() : null; // today's rule, explained before the fight
      $('vsRule').hidden = !mr; if (mr) $('vsRule').innerHTML = `<b>오늘의 작전 · ${esc(mr.name)}</b>${esc(mr.desc)}`;
      el.style.backgroundImage = `radial-gradient(ellipse at center, rgba(12,18,28,.55), rgba(5,7,10,.95) 75%), url(${ARENAS[opts.arena].bg})`;
      $('foeName').textContent = foe.name;
      $('foeName').className = 'fname f-' + ff;
      $('foeAv').style.backgroundImage = `url(${IMG[foe.img]})`;
      $('foeLv').textContent = st.name;
      const mu = opts.mode === 3 ? opts.mut || DATA.mutatorOf() : null; // today's operation rule stays visible during the battle
      $('mutTag').hidden = !mu; $('mutTag').textContent = mu ? mu.name : ''; $('mutTag').title = mu ? mu.desc : '';
    }
    el.hidden = false;
    $('loadBar').style.width = (f * 100).toFixed(0) + '%';
  }
  function loaded() { $('loading').hidden = true; }
  function pause(on) {
    if (on && aim) { clearInterval(aim.timer); GAME.aimHide(); aim = null; $('skillBar').classList.remove('cancel'); } // pausing drops a skill aim
    if (on && GAME.G.phase !== 'play' && GAME.G.phase !== 'countdown') return;
    if (on && GAME.G.opts && GAME.G.opts.preview) return; // (the deck popup's card preview is not a battle: nothing to pause)
    if (on && GAME.G.opts && GAME.G.opts.online) return; // (a match against a person never pauses)
    GAME.pause(on);
    $('stage').classList.toggle('paused', !!on && GAME.G.paused);
    SFX.pauseMusic(on);
    $('pauseOv').hidden = !on;
    $('btnSurrender').textContent = '항복';
    $('btnSurrender').classList.remove('warn');
  }

  // card copies of unlocked cards of the played faction (rarer cards come in smaller stacks)
  function rollCards(n, bonus, ss) {
    const a = arena();
    const pool = DATA.CARDS.filter((c) => save.cards[c.id] && copiesLeft(c) > 0); // owned cards that can still use copies (a card with all it needs for the max level drops no more)
    const picks = new Map();
    for (let i = 0; i < n && pool.length; i++) {
      const r = Math.random();
      let rar = r < 0.04 ? 3 : r < 0.16 ? 2 : r < 0.45 ? 1 : 0;
      if (ss && i === 0) rar = 3;
      let cand = pool.filter((c) => c.rarity === rar);
      if (!cand.length) cand = pool.filter((c) => c.rarity === Math.min(rar, 2));
      if (!cand.length) cand = pool;
      const c = cand[Math.floor(Math.random() * cand.length)];
      const cnt = Math.ceil([3 + Math.random() * 5, 2 + Math.random() * 2, 1 + (Math.random() < 0.3 ? 1 : 0), 1][c.rarity] * (1 + Math.floor(a / 2)) * (bonus || 1));
      picks.set(c, (picks.get(c) || 0) + cnt);
    }
    const out = [...picks.entries()];
    out.forEach(([c, k]) => { save.cards[c.id].n += k; });
    return out;
  }
  // battle rewards: parts, a supply crate on a win (or loose cards when every crate slot is full)
  function rollRewards(win, crownsN) {
    const a = arena();
    const gold = win ? 20 + a * 8 + crownsN * 5 : 6 + crownsN * 3;
    let chest = null, picks = [];
    if (win) {
      if (!Array.isArray(save.chests)) save.chests = [];
      if (false) { // (no crate slots any more: a win pays its cards at once)
        const tot = DATA.CHESTS.reduce((s, c) => s + c.weight, 0);
        let r = Math.random() * tot;
        chest = DATA.CHESTS.find((c) => (r -= c.weight) < 0) || DATA.CHESTS[0];
        save.chests.push({ k: chest.key, t0: null });
      } else picks = rollCards(3);
    } else if (crownsN > 0) picks = rollCards(1);
    // a win opens one card the commander does not have yet
    let fresh = null;
    if (win) { const locked = DATA.CARDS.filter((c) => !save.cards[c.id]); if (locked.length) { fresh = locked[Math.floor(Math.random() * locked.length)]; save.cards[fresh.id] = { lv: LEVEL.min, n: 0 }; (save.newCards || (save.newCards = {}))[fresh.id] = 1; } }
    return { gold, picks, chest, fresh };
  }

  // ── supply crates ─────────────────────────────────────
  // the original supply-box icons from the item atlas: wooden (normal), blue case (rare), golden chest (epic)
  DATA.CHESTS.forEach((c) => document.documentElement.style.setProperty('--crate-' + c.key, `url(${new URL(`assets/icon/crate_${c.key}.png`, location.href).href})`));
  const CH = Object.fromEntries(DATA.CHESTS.map((c) => [c.key, c]));
  // remaining unlock seconds (null: not started); a clock moved backwards never stretches it past the full time
  const chestLeft = (c) => (c.t0 ? Math.min(CH[c.k].time, Math.max(0, CH[c.k].time - (Date.now() - c.t0) / 1000)) : null);
  const fmtT = (s) => (s >= 60 ? `${Math.floor(s / 60)}분 ${Math.ceil(s % 60)}초` : `${Math.ceil(s)}초`);
  const rushCost = (left) => Math.max(5, Math.ceil(left / 6)); // parts to finish an unlock now
  let chestKey = '';
  function renderChests() {
    if ($('chestRow').hidden) return; // (the crate row was taken out of the battle tab)
    if (!Array.isArray(save.chests)) save.chests = [];
    const row = $('chestRow');
    // the slots are rebuilt only when their set changes; the timers update text and classes in place
    const key = save.chests.map((c) => c.k).join() + '|' + save.chests.length;
    const slots = 4;
    if (key !== chestKey || row.childElementCount !== slots) {
      chestKey = key;
      row.innerHTML = (slots === 1 ? [0] : [0, 1, 2, 3]).map((i) => {
        const c = save.chests[i];
        if (!c) return slots === 1 ? '<div class="chest empty all"><small>승리하면 보급 상자를 받습니다</small></div>' : '<div class="chest empty"><small>빈 칸</small></div>';
        return `<button class="chest ${c.k}" data-i="${i}"><i class="box"></i><b>${esc(CH[c.k].name)}</b><small></small></button>`;
      }).join('');
    }
    const unlocking = save.chests.some((c) => c.t0 && chestLeft(c) > 0);
    save.chests.forEach((c, i) => {
      const b = row.children[i], left = chestLeft(c);
      const st = left === null ? (unlocking ? '대기 중' : '해제') : left > 0 ? `${fmtT(left)} · ⚙${rushCost(left)}` : '열기!';
      const sm = b.querySelector('small');
      if (sm.textContent !== st) sm.textContent = st;
      b.classList.toggle('ready', left === 0);
      b.classList.toggle('busy', left > 0);
    });
  }
  // reaching a new arena: its art and the cards it opens, shown once on the title
  function revealArena() {
    const a = save.pendingReveal;
    if (a == null || !$('chestOv').hidden) return;
    save.pendingReveal = null;
    persist();
    const A = ARENAS[a];
    $('chestName').textContent = `ARENA ${a + 1} · ${A.name}`;
    $('chestBox').className = 'bigbox arena';
    $('chestBox').style.backgroundImage = `url(${A.bg})`;
    const cards = []; // (every card is open from the start: a new arena is a new battlefield, not new cards)
    const list = $('chestList');
    list.innerHTML = `<div class="rw"><b>새 전장 도착</b></div>` + cards.map((c) => `<div class="rw"><span class="pf r${c.rarity}" style="background-image:url(${art(c)})"></span><b>${esc(c.name)}</b><em>NEW</em></div>`).join('');
    list.querySelectorAll('.rw').forEach((x, k) => { x.style.animationDelay = (0.5 + k * 0.18) + 's'; });
    $('chestOv').hidden = false;
    SFX.play('rankUpSS', 0.6);
  }
  function openChest(i) {
    $('chestBox').style.backgroundImage = '';
    const c = save.chests[i], d = CH[c.k];
    save.chests.splice(i, 1);
    const gold = Math.round(d.gold[0] + Math.random() * (d.gold[1] - d.gold[0])) * (1 + arena() * 0.25) | 0;
    save.gold += gold;
    const picks = rollCards(d.cards, 1.4, d.ss);
    persist();
    SFX.play('pickSS', 0.7);
    const ov = $('chestOv');
    $('chestName').textContent = d.name;
    $('chestBox').className = 'bigbox ' + c.k;
    const list = $('chestList');
    list.innerHTML = `<div class="rw gold-rw"><i class="gold-i big"></i><b>+${gold}</b></div>` + picks.map(([cd, n]) => `<div class="rw"><span class="pf r${cd.rarity}" style="background-image:url(${art(cd)})"></span><b>${esc(cd.name)}</b><em>x${n}</em></div>`).join('');
    list.querySelectorAll('.rw').forEach((x, k) => { x.style.animationDelay = (0.7 + k * 0.22) + 's'; setTimeout(() => SFX.play(k ? 'genB' : 'coin', 0.4), 700 + k * 220); });
    ov.hidden = false;
    renderTitle();
  }
  // original cut-scene art behind the result, varied per match
  const WIN_ART = { orca: ['win_orca', 'win_orca2', 'win_orca3', 'win_orca4'], iron: ['win_iron', 'win_iron2', 'win_iron3'] };
  function result(winner, b, r, stats, reason) {
    const win = winner === 'blue', draw = winner === 'draw';
    const G = GAME.G, d = BAL.diffs[G.opts.diff];
    const a0 = arena();
    const floor = ARENAS[a0].trophy;
    const practice = G.opts.mode === 4; // practice: no trophies, rewards, record, missions or bonuses
    const rw = practice ? { gold: 0, picks: [], chest: null } : rollRewards(win, b); // rolled at the arena the match was played in (before trophies move)
    let delta = practice || draw ? 0 : win ? Math.round((26 + b * 3) * d.trophy) : -Math.round(18 + a0 * 3);
    if (!practice && !win && save.trophy + delta < floor) delta = floor - save.trophy; // never drop out of a reached arena
    save.trophy += delta;
    if (!practice) save.best = Math.max(save.best, save.trophy);
    if (practice) { /* not on the record */ } else if (win) { save.wins++; save.streak++; } else if (draw) save.draws++; else { save.losses++; save.streak = 0; }
    save.gold += rw.gold;
    if (win && !practice) { rw.tuna = DATA.SHOP.tunaWin + (save.firstWin === 'd' + DATA.dayIndex() ? 0 : DATA.SHOP.tunaFirstWin); save.tuna += rw.tuna; } // (the first win of the day gives more)
    const a1 = arena();
    syncCollection();
    const el = $('result');
    el.className = 'screen on ' + (win ? 'win' : draw ? 'draw' : 'lose');
    $('resTitle').textContent = win ? '승리!' : draw ? '무승부' : '패배';
    const REASON = { king: '킹 타워 파괴', crowns: '크라운 수', overtime: '연장전 타워 파괴', hp: '타워 체력 판정 (가장 약한 타워 비교)', surrender: '항복' };
    $('resReason').textContent = (practice ? '연습전 · ' : '') + (REASON[reason] || '');
    // the winning side's original cut-scene art behind the result
    const wf0 = (win || draw ? G.sides.blue : G.sides.red).faction, wf = WIN_ART[wf0] ? wf0 : wf0 === 'iron' ? 'iron' : 'orca'; // (Lemonade / the commander borrow the orca art)
    el.style.backgroundImage = `linear-gradient(rgba(4,6,10,.5), rgba(4,6,10,.88)), url(assets/bg/${WIN_ART[wf][Math.floor(Math.random() * WIN_ART[wf].length)]}.jpg)`;
    $('resHero').style.backgroundImage = `url(${IMG[FACTIONS[(win || draw ? G.sides.blue : G.sides.red).faction].banner]})`;
    $('resCrowns').innerHTML = `<div class="rc blue"><small>${FACTIONS[G.sides.blue.faction].name}</small><span>${[0, 1, 2].map((i) => `<i class="${i < b ? 'on' : ''}"></i>`).join('')}</span></div>
      <div class="rc red"><small>${esc(foe ? foe.name : FACTIONS[G.sides.red.faction].name)}</small><span>${[0, 1, 2].map((i) => `<i class="${i < r ? 'on' : ''}"></i>`).join('')}</span></div>`;
    $('resTrophy').innerHTML = `<i class="tro"></i><span class="trn">${save.trophy - delta}</span> <em class="${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '+' : ''}${delta}</em>`;
    { // the trophy count runs up (or down) to the new total after the crowns have popped in
      const el = $('resTrophy').querySelector('.trn'), a = save.trophy - delta, b = save.trophy, t0 = performance.now() + 700;
      const run = (now) => { if (!el.isConnected) return; const f = Math.max(0, Math.min(1, (now - t0) / 700)); el.textContent = Math.round(a + (b - a) * f); if (f < 1) requestAnimationFrame(run); else { el.classList.add('done'); el.textContent = b; } };
      requestAnimationFrame(run); setTimeout(() => { if (el.isConnected) el.textContent = b; }, 1800); // (and lands there even without animation frames)
    }
    if (practice) $('resTrophy').innerHTML = '<span class="prac">연습전 · 트로피와 보상 변동 없음</span>';
    const s = stats.blue;
    $('resStats').innerHTML = `<div><b>${Math.round(s.dmg).toLocaleString()}</b><small>입힌 피해</small></div><div><b>${s.kills}</b><small>처치</small></div><div><b>${s.spent}</b><small>사용 에너지</small></div><div><b>${s.wasted.toFixed(1)}</b><small>낭비 에너지</small></div>`;
    $('resStats').hidden = !s.cards && !s.dmg; // a match won before a single card was played has no stats to show
    // how the battle went: tower falls, champion skills, energy phases
    const lg = stats.log || [];
    $('resLog').hidden = true; $('btnResLog').hidden = !lg.length; $('btnResLog').textContent = '전투 기록 보기'; // (the log waits behind a button: the rewards get the room)
    $('resLog').innerHTML = lg.map(([t, line, sd]) => `<div class="${sd}"><em>${t}</em>${esc(line)}</div>`).join('');
    const mvp = Object.entries(s.by || {}).sort((x, y) => y[1] - x[1])[0];
    { const mo = win && mvp && CARD[mvp[0]]; if (mo && GAME.voiced && GAME.voiced(mo)) setTimeout(() => SFX.voice('unit:' + mo.id + '_win', 0.95, 4), 1600); } // the battle's MVP has the last word
    $('resMvp').hidden = !mvp;
    if (mvp && CARD[mvp[0]]) $('resMvp').innerHTML = `<span class="pf" style="background-image:url(${art(CARD[mvp[0]])})"></span><div><small>MVP</small><b>${esc(CARD[mvp[0]].name)}</b><em>피해 ${Math.round(mvp[1]).toLocaleString()}</em></div>`;
    // damage by card: who carried the battle (top five, against the MVP's bar)
    const top = Object.entries(s.by || {}).filter(([id]) => CARD[id]).sort((x, y) => y[1] - x[1]).slice(0, 5);
    $('resChart').hidden = top.length < 2;
    $('resChart').innerHTML = top.map(([id, v]) => `<div class="bar"><span>${esc(CARD[id].name)}</span><i style="--w:${(v / top[0][1] * 100).toFixed(0)}%"></i><b>${Math.round(v).toLocaleString()}</b></div>`).join('');
    const rwEl = $('resReward');
    rwEl.innerHTML = `<div class="rw gold-rw"><i class="gold-i big"></i><b>+${rw.gold}</b></div>` + (rw.tuna ? `<div class="rw gold-rw"><i class="tuna-i big"></i><b>+${rw.tuna}</b></div>` : '') + (rw.chest ? `<div class="rw"><span class="chest-i ${rw.chest.key}"></span><b>${esc(rw.chest.name)}</b></div>` : '') + (rw.fresh ? `<div class="rw fresh"><span class="pf r${rw.fresh.rarity}" style="background-image:url(${art(rw.fresh)})"></span><b>NEW</b></div>` : '') + rw.picks.map(([c, n]) => `<div class="rw"><span class="pf r${c.rarity}" style="background-image:url(${art(c)})"></span><b>x${n}</b></div>`).join('');
    rwEl.querySelectorAll('.rw').forEach((x, i) => { x.style.animationDelay = (0.5 + i * 0.25) + 's'; });
    rwEl.hidden = rwEl.previousElementSibling.hidden = practice;
    const mDone = practice ? 0 : progressMissions(win, b, s, G.opts);
    const notes = [];
    if (a1 > a0) save.pendingReveal = a1;
    if (a1 > a0) { notes.push(`<b>새 아레나 해금!</b> ${esc(ARENAS[a1].name)} — 새 카드가 열렸습니다`); setTimeout(() => { SFX.play('rankUpSS', 0.6); SFX.voice('ann:stageclear', 1, 5); }, 900); }
    if (mDone) notes.push(`<b>임무 완료 ${mDone}개!</b> 메인 화면에서 보상을 받으세요`);
    if (win && !practice && save.streak >= 3) notes.push(`<b>${save.streak}연승 중!</b>`);
    // the day's first win pays a bonus (parts and a handful of cards)
    const today = 'd' + (G.opDay != null ? G.opDay : DATA.dayIndex()); // the same (KST) day as the daily operation
    if (win && !practice && save.firstWin !== today) {
      save.firstWin = today;
      const bg = 80 + arena() * 30;
      save.gold += bg;
      const bp = rollCards(3, 1.5);
      notes.push(`<b>오늘의 첫 승리 보너스!</b> 부품 +${bg} · ${bp.map(([c, n]) => `${esc(c.name)} x${n}`).join(', ')}`);
      setTimeout(() => SFX.play('pickSS', 0.6), 1200);
    }
    // the daily operation: its first clear of the day pays a crate, and clearing on consecutive days grows the parts bonus
    const day = G.opDay != null ? G.opDay : DATA.dayIndex();
    if (win && G.opts.mode === 3 && save.opDay !== day) {
      save.opStreak = save.opDay === day - 1 ? save.opStreak + 1 : 1;
      save.opDay = day;
      const og = 100 + 40 * Math.min(save.opStreak, 5);
      save.gold += og;
      const crate = null; // (no crate slots any more)
      notes.push(`<b>오늘의 작전 완수! (${save.opStreak}일 연속)</b> 부품 +${og}`);
    }
    $('resArena').hidden = !notes.length;
    $('resArena').innerHTML = notes.join('<br>');
    if (win) { setTimeout(() => SFX.play('rankUp', 0.45), 350); setTimeout(() => SFX.play('coin', 0.6), 700); } // the MISSION COMPLETE sweep, then the rewards
    persist();
  }

  function fatal(msg, reload) {
    const el = $('fatal'); el.hidden = false; el.querySelector('p').textContent = msg;
    if (reload && !el.querySelector('button')) { const b = document.createElement('button'); b.className = 'btn y'; b.textContent = '다시 불러오기'; b.onclick = () => location.reload(); el.querySelector('.dlg').appendChild(b); }
  }

  // settings
  function openSettings() {
    $('setMusic').value = save.music;
    $('setSfx').value = save.sfx;
    $('setVoice').value = save.voice;
    $('setQuality').value = save.autoQuality ? 'auto' : String(save.quality == null ? GAME.perf.level : save.quality);
    $('setInfo').textContent = `현재 품질: ${GAME.QUALITY[GAME.perf.level].name} · 최근 FPS ${GAME.perf.fps || '-'} · 버전 ${APP_VERSION}`;
    $('settingsOv').hidden = false;
  }
  function applyAudio() { SFX.setVolume('bgm', save.music); SFX.setVolume('sfx', save.sfx); SFX.setVolume('voice', save.voice); SFX.setMuted(save.music === 0 && save.sfx === 0 && save.voice === 0); }

  // tutorial
  const TUT = [
    ['c_BR_Brownie_N', '카드 배치', '아래 카드를 전장으로 드래그하거나, 카드를 누른 뒤 아군 진영을 누르면 유닛이 출격합니다. 카드마다 에너지가 필요합니다.'],
    ['c_BR_Leprechaun_N', '에너지', '에너지는 2.8초마다 1씩 차고 최대 10까지 모입니다. 가득 찬 채로 두면 낭비! 남은 1분은 2배로 찹니다.'],
    ['c_PECS_Empress_N', '타워 공략', '적 프린세스 타워를 부수면 크라운 1개. 킹 타워를 부수면 즉시 승리합니다. 건물만 노리는 유닛으로 압박하세요.'],
    ['c_BR_Leprechaun_N', '건물과 주문', '건물은 아군 진영에만 지을 수 있고 시간이 지나면 무너집니다. 포탑·방벽은 건물만 노리는 적을 끌어당기고, 기지는 유닛을 계속 보냅니다. 주문은 전장 어디에나 쓸 수 있습니다.'],
    ['c_3P_Labiata_N', '챔피언 스킬', 'SS 등급 챔피언이 전장에 있으면 오른쪽 아래에 스킬 버튼이 나타납니다. 에너지를 써서 강력한 스킬을 발동하세요! 포격·레이저·돌진 스킬은 버튼을 전장으로 끌어 직접 조준할 수 있습니다.'],
  ];
  let tutI = 0;
  function showTut(i) {
    tutI = i;
    const [img, h, p] = TUT[i];
    $('tutPf').style.backgroundImage = `url(${IMG[img]})`;
    $('tutH').textContent = h; $('tutP').textContent = p;
    $('tutDots').innerHTML = TUT.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('');
    $('tutNext').textContent = i === TUT.length - 1 ? '전투 시작!' : '다음';
    $('tutOv').hidden = false;
  }

  // ── wiring ────────────────────────────────────────────
  function beginBattleScreen() {
    $('result').className = 'screen';
    show('battle');
    handKey = ''; lastEl = -1; lastClock = ''; prevHand = [];
    $('skillBar').innerHTML = '';
    $('emotePanel').hidden = true;
    document.querySelectorAll('.bubble,.skcut,.flycrown').forEach((x) => x.remove());
  }
  // a found opponent: the same match on both devices (the host's arena and seed), each side seeing itself at the bottom
  function startOnline(m) {
    beginBattleScreen();
    const levels = {}; save.decks[save.faction].forEach((id) => { levels[id] = levelOf(id); });
    const f = m.foe, cs = DATA.COMMANDERS[f.faction] || DATA.COMMANDERS.iron;
    const foeC = Object.assign({}, cs[0], { name: '온라인 사령관', style: 'balanced' });
    m.listen((msg) => GAME.mpMessage(msg));
    GAME.start({ faction: save.faction, deck: save.decks[save.faction], diff: 1, mode: 0, mut: null, levels, arena: m.guest ? (f.arena | 0) : arena(),
      foe: foeC, foeDeck: f.deck, foeFaction: f.faction, foeLevels: f.levels || {},
      online: { guest: m.guest, seed: m.seed, send: m.send, close: m.close } });
  }
  // 일반전: look for a human opponent first (online, no server of ours); nobody within 15 s -> the AI as before
  let searching = false;
  async function startBattle(noOnline) {
    if (save.decks[save.faction].length !== 8) { toast('덱은 8장이어야 합니다'); return; }
    if (!save.tutorial) { showTut(0); return; }
    if (searching) return;
    if (!GAME.ready) { toast('전장을 준비하는 중입니다. 잠시 후 다시 눌러 주세요'); return; } // (a tap before the engine has finished loading)
    SFX.play('click');
    if (save.mode === 0 && noOnline !== true && window.NET && navigator.onLine !== false && !/[?&](smoke|offline)=1/.test(location.search)) {
      searching = true;
      const levels = {}; save.decks[save.faction].forEach((id) => { levels[id] = levelOf(id); });
      const profile = { faction: save.faction, deck: save.decks[save.faction].slice(), levels, trophy: save.trophy, arena: arena() };
      $('searchOv').hidden = false; $('searchMsg').textContent = '온라인 대전 상대를 찾고 있습니다';
      const WAIT = 10000 + Math.random() * 10000; // nobody in 10-20 s: the AI takes the seat (no countdown shown)
      $('searchSec').textContent = '';
      const m = await NET.find(profile, WAIT);
      searching = false;
      const how = $('searchOv').dataset.how || ''; $('searchOv').dataset.how = ''; $('searchOv').hidden = true;
      if (m) { startOnline(m); return; }
      if (how === 'cancel') return;
    }
    beginBattleScreen();
    const levels = {};
    save.decks[save.faction].forEach((id) => { levels[id] = levelOf(id); });
    DATA.CARDS.forEach((c) => { if (!(c.id in levels) && save.cards[c.id]) levels[c.id] = save.cards[c.id].lv; });
    const mut = save.mode === 3 ? DATA.mutatorOf() : null; // drawn once: the commander, the VS screen and the battle all use the same rule (no midnight race)
    const po = practiceOpts();
    if (!po.foeFaction) po.foeFaction = randomFoe();
    const ff = foeFaction(Object.assign({ faction: save.faction, mode: save.mode, mut }, po)), cs = DATA.COMMANDERS[ff] || DATA.COMMANDERS.orca;
    GAME.start(Object.assign({ faction: save.faction, deck: save.decks[save.faction], diff: save.mode === 4 ? save.diff : 1, mode: save.mode, mut, levels, arena: arena(), foe: cs[Math.floor(Math.random() * cs.length)] }, po));
  }
  // nickname: asked once on the very first start (then the tutorial), changed from the chip on the battle tab
  // names kept for the team (개발자 / DEV / 운영자 / GM ...): nobody can newly pick one; whoever already has one keeps it
  const RESERVED_NICK = /개발자|개발|운영자|운영|관리자|dev|gm|admin|staff|moderator/i;
  function renderNick() { $('nickName').textContent = save.nick || '닉네임 설정'; $('btnNick').classList.toggle('unset', !save.nick); }
  function askNick(first) {
    $('nickInput').value = save.nick || ''; $('nickOv').hidden = false; $('nickOv').dataset.first = first ? '1' : '';
    setTimeout(() => $('nickInput').focus(), 50);
  }
  function nickOk() {
    const v = $('nickInput').value.trim().replace(/\s+/g, ' ');
    if (v.length < 2) { toast('닉네임은 2~10자로 정하세요'); SFX.play('fail', 0.4); return; }
    if (v !== save.nick && RESERVED_NICK.test(v.replace(/\s+/g, ''))) { toast('사용할 수 없는 닉네임입니다'); SFX.play('fail', 0.4); return; } // (a name already set this way is kept)
    save.nick = v.slice(0, 10); persist(); renderNick(); $('nickOv').hidden = true; SFX.play('click');
    if ($('nickOv').dataset.first && !save.tutorial) showTut(0); // first start: the tutorial right after
  }
  function init() {
    $('appVer').textContent = APP_VERSION;
    syncCollection();
    applyAudio();
    if (window.IMG && IMG.bg_title) document.documentElement.style.setProperty('--bgtitle', `url(${new URL(IMG.bg_title, location.href).href})`); // absolute: the stylesheet would resolve a relative one under css/
    $('diffSel').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; save.diff = +b.dataset.d; persist(); SFX.play('click'); renderTitle(); });
    $('pfoeBox').addEventListener('click', (e) => { const b = e.target.closest('[data-p]'); if (!b) return; save.practiceFoe = b.dataset.p; persist(); SFX.play('click'); renderTitle(); });
    $('modeSel').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; save.mode = +b.dataset.m; persist(); SFX.play('click'); renderTitle(); toast(save.mode === 3 ? `오늘의 작전: ${DATA.mutatorOf().name} — ${DATA.mutatorOf().desc}` : BAL.modes[save.mode].desc); });
    $('btnBattle').onclick = startBattle;
    $('btnDeck').onclick = () => { SFX.play('click'); deckSel = null; slotSel = null; cardOpen = false; renderDeck(); show('deck'); };
    // closing a deck card's details also drops the pick (the codex closes); a codex card's keeps it
    const closeCard = () => { cardOpen = false; renderDeck(); };
    $('btnCardClose').onclick = closeCard;
    $('btnCardX').onclick = closeCard;
    $('btnResLog').onclick = () => { const l = $('resLog'); l.hidden = !l.hidden; $('btnResLog').textContent = l.hidden ? '전투 기록 보기' : '전투 기록 닫기'; SFX.play('click'); };
    // the bond chip in the deck header opens the list of faction bonds
    // a tap on the empty part of the deck screen drops the pick
    $('deck').addEventListener('click', (e) => { if (slotSel == null || e.target.closest('.tile, .card, button, .csort, .lbl')) return; slotSel = null; renderDeck(); });
    // the faction card under the deck opens the faction picker
    $('btnFaction').onclick = () => { SFX.play('click'); document.querySelectorAll('#factionSel button').forEach((b) => b.classList.toggle('on', b.dataset.f === save.faction)); $('factionOv').hidden = false; };
    $('btnFactionClose').onclick = () => { $('factionOv').hidden = true; };
    $('factionSel').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; save.faction = b.dataset.f; deckSel = null; slotSel = null; cardOpen = false; persist(); SFX.play('click'); $('factionOv').hidden = true; renderTitle(); if ($('deck').classList.contains('on')) renderDeck(); });
    document.querySelectorAll('#factionSel button').forEach((b) => { b.querySelector('.fp').style.backgroundImage = `url(${IMG[FACTIONS[b.dataset.f].banner]})`; });
    $('shop').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-buy]'); if (!b) return;
      const [kind, i] = b.dataset.buy.split(':');
      if (kind === 'crate') {
        const it = DATA.SHOP.crates[+i];
        if (save.gold < it.price) { toast('부품이 부족합니다'); SFX.play('fail', 0.4); return; }
        save.gold -= it.price; save.chests.push({ k: it.key, t0: null }); SFX.play('purchase', 0.6); openChest(save.chests.length - 1);
      } else {
        const it = DATA.SHOP.masters[+i];
        if (save.tuna < it.price) { toast('참치가 부족합니다'); SFX.play('fail', 0.4); return; }
        SFX.play('click'); openCorePick(+i); return; // (a core goes onto a card picked from the list: the tuna is paid then)
      }
      renderShop();
    });
    $('coreOv').addEventListener('click', (e) => { if (e.target.id === 'coreOv' || e.target.id === 'btnCoreClose') $('coreOv').hidden = true; });
    $('collSort').addEventListener('click', (e) => { const b = e.target.closest('[data-s]'); if (!b) return; if (save.collSort === b.dataset.s) save.collDesc = !save.collDesc; else { save.collSort = b.dataset.s; save.collDesc = false; } persist(); SFX.play('click'); renderDeck(); });
    $('cardOv').addEventListener('click', (e) => { if (e.target.id === 'cardOv') closeCard(); }); // a tap outside the popup closes it
    $('deckTabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]'); if (!b) return;
      const f = save.faction, i = +b.dataset.i;
      for (const k of ['orca', 'iron']) { save.deckSlot[k] = i; save.decks[k] = save.deckSlots[k][i]; } persist(); // (the decks are shared by both factions)
      deckSel = null; slotSel = null; cardOpen = false; SFX.play('click'); renderDeck();
    });
    $('btnSettings').onclick = () => { SFX.play('click'); openSettings(); };
    $('btnNick').onclick = () => { SFX.play('click'); askNick(false); };
    $('btnNickOk').onclick = nickOk;
    $('nickInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') nickOk(); });
    renderNick();
    if (!save.nick && !/[?&]smoke=1/.test(location.search)) setTimeout(() => askNick(true), 400); // the very first start
    $('chestRow').addEventListener('click', (e) => {
      const b = e.target.closest('button.chest'); if (!b) return;
      const i = +b.dataset.i, c = save.chests[i]; if (!c) return;
      const left = chestLeft(c);
      if (left === 0) { openChest(i); return; }
      if (left > 0) {
        // second tap within 3 s spends parts to finish now
        const cost = rushCost(left);
        if (b.dataset.rush && Date.now() - +b.dataset.rush < 3000) {
          if (save.gold < cost) { toast('부품이 부족합니다'); SFX.play('fail', 0.4); return; }
          save.gold -= cost; c.t0 = Date.now() - CH[c.k].time * 1000; persist(); SFX.play('purchase', 0.6); renderTitle(); return;
        }
        b.dataset.rush = Date.now();
        toast(`해제까지 ${fmtT(left)} — 한 번 더 누르면 부품 ${cost}개로 즉시 해제`);
        return;
      }
      if (save.chests.some((x) => x.t0 && chestLeft(x) > 0)) { toast('다른 상자를 해제하는 중입니다'); return; }
      c.t0 = Date.now(); persist(); SFX.play('reinforce', 0.6); renderChests();
    });
    $('btnChestClose').onclick = () => { $('chestOv').hidden = true; renderTitle(); };
    setInterval(() => { if ($('title').classList.contains('on')) renderChests(); }, 1000);
    // the trophy road screen: claimed / ready / locked milestones around the current count
    const renderRoad = () => {
      const near = DATA.ROAD.filter((r) => r.trophy >= Math.min(save.road || 0, save.trophy) - 200).slice(0, 12);
      $('roadList').innerHTML = near.map((r) => {
        const st = r.trophy <= (save.road || 0) ? 'got' : r.trophy <= save.trophy ? 'ready' : 'lock';
        const what = r.chest ? `<i class="chest-i ${r.chest}"></i>${esc(CH[r.chest].name)}` : `<i class="gold-i"></i>부품 ${r.gold}`;
        return `<div class="rd ${st}"><b>${r.trophy}</b><span>${what}</span><em>${st === 'got' ? '✓ 받음' : st === 'ready' ? '받기 가능' : '잠김'}</em></div>`;
      }).join('');
      const ready = DATA.ROAD.some((r) => r.trophy <= save.trophy && r.trophy > (save.road || 0));
      $('btnRoadClaim').disabled = !ready;
      const cur = $('roadList').querySelector('.ready, .lock');
      if (cur) cur.scrollIntoView({ block: 'center' });
    };
    const openRoad = () => { SFX.play('click'); show('road'); renderRoad(); }; // shown first: scrollIntoView needs layout
    $('arenaName').onclick = $('roadNext').onclick = openRoad;
    $('roadBtn').onclick = openRoad;
    $('btnRoadClaim').onclick = () => {
      const road = DATA.ROAD.filter((r) => r.trophy <= save.trophy && r.trophy > (save.road || 0));
      let gold = 0, crates = 0;
      let full = false;
      for (const r of road) {
        if (r.chest) { save.chests.push({ k: r.chest, t0: null }); crates++; } // (opened right away below: there are no crate slots)
        else gold += r.gold;
        save.road = r.trophy;
      }
      if (!gold && !crates) { renderRoad(); return; }
      save.gold += gold;
      persist();
      SFX.play('pickSS', 0.6);
      toast(`트로피 로드 보상: ${gold ? '부품 +' + gold : ''}${gold && crates ? ' · ' : ''}${crates ? '상자 ' + crates + '개' : ''}`);
      renderRoad();
      if (crates) openChest(save.chests.length - 1); // the road's crate opens on the spot
    };
    $('btnMissions').onclick = () => { SFX.play('click'); cardOpen = false; $('cardOv').hidden = true; cardPreview(null); renderMissions(); show('missions'); };
    $('btnSearchCancel').onclick = () => { $('searchOv').dataset.how = 'cancel'; NET.cancel(); };

    $('btnMode').onclick = () => { SFX.play('click'); $('modeOv').hidden = false; };
    $('btnModeClose').onclick = () => { SFX.play('click'); $('modeOv').hidden = true; renderTitle(); };
    // the bottom tab bar (Clash Royale style): cards, battle (this screen), missions, trophy road
    document.querySelector('.tabbar').addEventListener('click', (e) => { // (the bar moves between home and deck: one listener)
      const b = e.target.closest('[data-tab]'); if (!b) return;
      const t = b.dataset.tab;
      if (t === 'shop') { if (!$('shop').classList.contains('on')) SFX.play('click'); cardOpen = false; $('cardOv').hidden = true; cardPreview(null); renderShop(); show('shop'); }
      else if (t === 'deck') { if (!$('deck').classList.contains('on')) $('btnDeck').click(); }
      else if (t === 'battle') { if (!$('title').classList.contains('on')) SFX.play('click'); cardOpen = false; slotSel = null; $('cardOv').hidden = true; cardPreview(null); renderTitle(); show('title'); }
      else if (t === 'road') { cardOpen = false; $('cardOv').hidden = true; cardPreview(null); openRoad(); }
      // (missions: its own handler above; battle: this screen)
    });
    $('missionList').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      const m = save.missions[+b.dataset.i];
      if (!m || m.prog < MDEF[m.k].goal) return;
      save.gold += MDEF[m.k].gold;
      save.lastMission = m.k;
      save.missions.splice(+b.dataset.i, 1);
      ensureMissions();
      persist();
      SFX.play('coin', 0.8);
      renderMissions();
      toast(`부품 +${MDEF[m.k].gold}`);
    });
    $('btnHelp').onclick = () => { SFX.play('click'); showTut(0); };
    $('btnSetClose').onclick = () => { $('settingsOv').hidden = true; };
    $('setMusic').oninput = (e) => { save.music = +e.target.value; applyAudio(); persist(); };
    $('setSfx').oninput = (e) => { save.sfx = +e.target.value; applyAudio(); persist(); SFX.play('click'); };
    $('setVoice').oninput = (e) => { save.voice = +e.target.value; applyAudio(); persist(); };
    $('setVoice').onchange = () => SFX.voice('ann:great', 1, 5); // a sample line at the new level
    $('setQuality').onchange = (e) => {
      const v = e.target.value;
      save.autoQuality = v === 'auto';
      save.quality = v === 'auto' ? null : +v;
      GAME.setQuality(v === 'auto' ? GAME.autoLevel : +v);
      persist();
    };
    $('btnReset').onclick = () => {
      if (!confirm('모든 진행(트로피·카드·골드)을 초기화할까요?')) return;
      try { localStorage.removeItem(KEY); localStorage.removeItem('lastroyal.v1'); } catch (e) { /* ignore */ }
      location.reload();
    };
    $('tutNext').onclick = () => {
      SFX.play('click');
      if (tutI < TUT.length - 1) { showTut(tutI + 1); return; }
      $('tutOv').hidden = true;
      if (!save.tutorial) { save.tutorial = true; persist(); startBattle(); }
    };
    $('tutSkip').onclick = () => { $('tutOv').hidden = true; if (!save.tutorial) { save.tutorial = true; persist(); startBattle(); } };
    $('btnPause').onclick = () => pause(true);
    // the support button: a tap calls it (a summon lands in the middle); a summon can also be dragged a little left or right to pick its lane
    { const sb = $('supBtn'); let sd = null;
      const fire = (x) => { if (GAME.useSupport(x)) { SFX.play('click', 0.5); supKey = ''; } };
      sb.addEventListener('pointerdown', (e) => { const sp = GAME.supportOf('blue'); if (!sp || !sp.ready) return; e.preventDefault(); sd = { id: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false, summon: sp.summon, x: 0 }; });
      window.addEventListener('pointermove', (e) => { if (!sd || e.pointerId !== sd.id || !sd.summon) return; if (Math.hypot(e.clientX - sd.x0, e.clientY - sd.y0) > 12) sd.moved = true; if (sd.moved) { const x = GAME.supportAim(e.clientX, e.clientY); sd.x = x == null ? null : x; } });
      window.addEventListener('pointerup', (e) => { if (!sd || e.pointerId !== sd.id) return; const d = sd; sd = null; if (!d.moved) fire(0); else if (d.x != null) fire(d.x); });
      window.addEventListener('pointercancel', () => { sd = null; });
    }
    $('btnResume').onclick = () => pause(false);
    $('btnPauseSet').onclick = () => openSettings();
    $('btnSurrender').onclick = () => {
      const b = $('btnSurrender');
      if (!b.classList.contains('warn')) { b.classList.add('warn'); b.textContent = '정말 항복?'; return; } // second tap confirms
      $('pauseOv').hidden = true; SFX.pauseMusic(false); GAME.surrender();
    };
    $('btnLoadCancel').onclick = () => { GAME.leave(); $('loading').hidden = true; renderTitle(); show('title'); };
    $('btnAgain').onclick = startBattle;
    $('btnHome').onclick = () => { $('result').className = 'screen'; GAME.leave(); renderTitle(); show('title'); };
    $('btnEmote').onclick = (e) => { e.stopPropagation(); const p = $('emotePanel'); p.hidden = !p.hidden; };
    const ep = $('emotePanel');
    ep.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      emote('blue', +b.dataset.i); ep.hidden = true; GAME.mpEmote(+b.dataset.i);
      GAME.aiEmote(Math.floor(Math.random() * DATA.EMOTES.length), 0.35); // the opponent answers on the game clock and its own chatter cooldown
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) pause(true); });
    window.addEventListener('pointerdown', function unlock() { SFX.music(GAME.G.phase === 'title' ? 'title' : null); window.removeEventListener('pointerdown', unlock); }, { once: true });
    renderTitle();
    show('title');
    GAME.boot();
    const bootEl = $('boot');
    if (bootEl) { bootEl.classList.add('out'); setTimeout(() => bootEl.remove(), 500); }
  }

  // emote panel content depends on the battle's faction (filled when the button is first touched)
  document.addEventListener('pointerdown', (e) => {
    if (e.target.id === 'btnEmote' || e.target.closest && e.target.closest('#btnEmote')) {
      const G = GAME.G; if (!G.sides) return;
      $('emotePanel').innerHTML = DATA.EMOTES.map(([img, t], i) => `<button data-i="${i}"><span class="pf emo" style="background-image:url(assets/emoji/${img}.webp)"></span>${esc(t)}</button>`).join('');
    } else if (!e.target.closest || !e.target.closest('#emotePanel')) { const p = $('emotePanel'); if (p) p.hidden = true; }
  }, true);

  window.UI = { _sync: () => syncCollection(), init, dmgNum, healNum, elixirLeak, cardEl, hand, tick, crowns, crownFly, toast, banner, countdown, dragCard, loading, loaded, pause, result, save, skillCut, shout, emote, elixirShake, fatal, fireSkill, aimPid: () => (aim ? aim.pid : null) };
  window.addEventListener('DOMContentLoaded', init);
})();
