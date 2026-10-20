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
    ['trophy', 'best', 'gold', 'wins', 'losses', 'draws', 'streak', 'opDay', 'opStreak'].forEach((k) => { s[k] = Math.max(0, Math.floor(+s[k] || 0)); });
    if (!FACTIONS[s.faction]) s.faction = 'orca';
    if (!(s.diff >= 0 && s.diff <= 2)) s.diff = 1;
    if (!(s.mode >= 0 && s.mode < BAL.modes.length)) s.mode = 0;
    if (!['ai', 'orca', 'iron'].includes(s.practiceFoe)) s.practiceFoe = 'ai';
    const unit = (v, d) => (Number.isFinite(+v) ? Math.min(1, Math.max(0, +v)) : d);
    s.music = unit(s.music, 1); s.sfx = unit(s.sfx, 1); s.voice = unit(s.voice, 1);
    s.quality = s.quality === null || s.quality === undefined || !(+s.quality >= 0 && +s.quality <= 2) ? null : Math.round(+s.quality);
    s.autoQuality = s.autoQuality !== false;
    // crates: known kinds only, at most four, unlock start times that make sense
    s.chests = Array.isArray(s.chests) ? s.chests.filter((c) => c && DATA.CHESTS.some((d) => d.key === c.k)).slice(0, 4) : [];
    s.chests.forEach((c) => { if (!Number.isFinite(c.t0) || c.t0 > Date.now() + 60000) c.t0 = c.t0 == null ? null : Date.now(); });
    if (typeof s.cards !== 'object' || !s.cards) s.cards = {};
    s.road = Number.isFinite(+s.road) ? Math.max(0, +s.road) : 0;
    if (typeof s.newCards !== 'object' || !s.newCards) s.newCards = {};
    Object.keys(s.newCards).forEach((id) => { if (!CARD[id]) delete s.newCards[id]; });
    if (typeof s.decks !== 'object' || !s.decks) s.decks = {};
    return s;
  })();
  const APP_VERSION = 'V0.33'; // shown on the title and in the settings
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { if (!persist.warned) { persist.warned = true; setTimeout(() => toast('기기 저장 공간을 쓸 수 없어 진행이 저장되지 않습니다'), 0); } } } // private mode / quota: say so once
  const arena = () => arenaOf(save.trophy);
  const unlocked = () => true; // free deck building: every card is open from the start (arenas still set the scene and the opponent's level)
  // every unlocked card is owned (level 1 at least); fix decks that hold locked / foreign cards
  function syncCollection() {
    // a save that already owns cards (older versions had no 'seen' flag) gets NEW badges for what this sync adds
    const news = save.seen || Object.keys(save.cards).length > 0;
    DATA.CARDS.forEach((c) => {
      const o = save.cards[c.id];
      if (unlocked(c) && !o) { save.cards[c.id] = { lv: 1, n: 0 }; if (news) (save.newCards || (save.newCards = {}))[c.id] = 1; }
      if (o) { o.lv = Math.min(LEVEL.max, Math.max(1, o.lv | 0)); o.n = Math.max(0, o.n | 0); }
    });
    save.seen = true; // after the first sync, every unlock is news
    const valid = (dk) => Array.isArray(dk) && dk.length <= 8 && new Set(dk).size === dk.length && dk.every((id) => CARD[id] && save.cards[id]); // (fewer than 8 while it is being built) // orca and iron cards may be mixed in one deck
    if (typeof save.deckSlots !== 'object' || !save.deckSlots) save.deckSlots = {};
    if (typeof save.deckSlot !== 'object' || !save.deckSlot) save.deckSlot = {};
    for (const f of ['orca', 'iron']) {
      if (!valid(save.decks[f])) save.decks[f] = FACTIONS[f].deck.slice();
      // five saved decks: the active slot is the very array in save.decks (edits land in both)
      const old = Array.isArray(save.deckSlots[f]) ? save.deckSlots[f] : [];
      const sl = [0, 1, 2, 3, 4].map((i) => (valid(old[i]) ? old[i] : FACTIONS[f].deck.slice()));
      const i = save.deckSlot[f] >= 0 && save.deckSlot[f] < 5 ? save.deckSlot[f] | 0 : 0;
      sl[i] = save.decks[f];
      save.deckSlots[f] = sl; save.deckSlot[f] = i;
    }
    persist();
  }
  const levelOf = (id) => (save.cards[id] ? save.cards[id].lv : 1);

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
  // the original game's rank badge (B / A / S / SS) in the card's role shape: attacker, defender or support
  const roleOf = (c) => (c.type !== 'troop' ? 'sup' : c.aim === 'buildings' || (c.hp * (c.count || 1) >= 1500 && c.range <= 2.5) ? 'def' : 'atk');
  const rankIc = (c) => `<i class="rkic${c.rarity === 3 ? ' ss' : ''}" title="${RARITY[c.rarity].name}" style="background-image:url(assets/icon/rank/${RARITY[c.rarity].name}_${roleOf(c)}.webp)"></i>`;
  const ROLE_NAME = { atk: '공격형', def: '방어형', sup: '지원형' };
  function cardEl(c, cls, opt) {
    opt = opt || {};
    const el = document.createElement('div');
    el.className = 'card r' + c.rarity + (cls ? ' ' + cls : '') + (c.type !== 'troop' ? ' spell' : '') + (c.type === 'building' ? ' bld' : '') + (c.skill ? ' champ' : '') + (opt.locked ? ' locked' : '');
    let h = `<div class="art" style="background-image:url(${art(c)})"></div><span class="cost">${c.cost}</span><span class="nm">${esc(c.name)}</span>`;
    if (c.count > 1) h += `<span class="cnt">x${c.count}</span>`;
    if (opt.lv) h += `<span class="lv">Lv.${opt.lv}</span>`;
    if (opt.progress != null) h += `<span class="prog${opt.progress >= 1 ? ' full' : ''}"><i style="width:${Math.min(100, opt.progress * 100)}%"></i></span>`;
    if (opt.rank) h += rankIc(c);
    if (opt.isNew) h += '<span class="newb">NEW</span>';
    if (opt.locked) h += `<span class="lock"><i></i>${esc(ARENAS[c.arena].name)}</span>`;
    el.innerHTML = h;
    if (!opt.tile) return el;
    // deck / collection tile (Clash Royale card list): the level band on the card, the copies bar under it
    el.title = c.name;
    el.insertAdjacentHTML('beforeend', `<span class="lvband">레벨 ${opt.lv || 1}</span>`);
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
    ['title', 'deck', 'battle'].forEach((s) => $(s).classList.toggle('on', s === id));
    if (id !== 'battle') { const tb = document.querySelector('.tabbar'); $(id).appendChild(tb); tb.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === (id === 'deck' ? 'deck' : 'battle'))); }
    if (id === 'battle') requestAnimationFrame(() => GAME.resize(true));
  }

  function renderTitle() {
    syncCollection();
    const a = arena(), A = ARENAS[a], nx = ARENAS[a + 1];
    $('trophy').textContent = save.trophy;
    $('gold').textContent = save.gold;
    $('record').textContent = `${save.wins}승 ${save.losses}패`;
    $('arenaName').textContent = `ARENA ${a + 1} · ${A.name}`;
    document.querySelector('.arena-box').style.backgroundImage = `linear-gradient(180deg, rgba(10,14,20,.15) 40%, rgba(10,14,20,.88)), url(${A.bg})`;
    const f0 = A.trophy, f1 = nx ? nx.trophy : A.trophy + 1;
    $('arenaBar').style.width = (nx ? Math.min(100, (save.trophy - f0) / (f1 - f0) * 100) : 100) + '%';
    $('arenaNext').textContent = nx ? `다음: ${nx.name} (${nx.trophy})` : '최고 아레나 도달!';
    const nextCards = []; // (every card is already open: nothing to preview)
    $('arenaUnlock').innerHTML = nextCards.map((c) => `<i style="background-image:url(${art(c)})" title="${esc(c.name)}"></i>`).join('');
    document.querySelectorAll('#diffSel button').forEach((b) => b.classList.toggle('on', +b.dataset.d === save.diff));
    document.querySelectorAll('#modeSel button').forEach((b) => b.classList.toggle('on', +b.dataset.m === save.mode));

    const row = $('deckPreview');
    row.innerHTML = '';
    save.decks[save.faction].forEach((id) => row.appendChild(cardEl(CARD[id], 'mini', { lv: levelOf(id) })));
    $('avgCost').innerHTML = '<b>덱 편성</b>평균 ' + avg(save.decks[save.faction]); // the deck button: its name, lead card and average cost
    { const lead = CARD[save.decks[save.faction][0]]; $('deckIcon').style.backgroundImage = lead ? `url(${art(lead)})` : ''; }
    $('modeLabel').innerHTML = `${BAL.modes[save.mode].name}<br>${BAL.diffs[save.diff].name}`;
    $('deckPreview').insertAdjacentHTML('beforeend', `<div class="syn-row">${synChip(save.decks[save.faction])}</div>`);
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
    $('firstWin').textContent = save.firstWin === 'd' + DATA.dayIndex() ? '' : '★ 오늘의 첫 승리 보너스가 기다리고 있습니다';
    ensureMissions();
    const cl = claimable();
    $('mBadge').textContent = cl;
    $('mBadge').hidden = !cl;
  }
  const avg = (d) => (d.length ? d.reduce((s, id) => s + CARD[id].cost, 0) / d.length : 0).toFixed(1);
  function canUpgrade(c) {
    const o = save.cards[c.id];
    if (!o || o.lv >= LEVEL.max) return false;
    const k = upCost(c, o.lv);
    return o.n >= k.n && save.gold >= k.gold;
  }

  // deck builder
  let deckSel = null, swapMode = false, cardOpen = false; // cardOpen: the card popup is up
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
  function renderDeck() {
    const f = save.faction, deck = save.decks[f];
    $('deckTitle').textContent = `덱 편성 · ${FACTIONS[f].name}`;
    $('deckAvg').innerHTML = `<i class="gold-i"></i>${save.gold} · ${synChip(deck)}`;
    $('deckAvg2').innerHTML = `<i class="drop-i"></i><b>${avg(deck)}</b>`; // (Clash Royale: the average under the deck)
    $('deckHint').textContent = swapMode ? '덱에서 바꿀 카드를 누르세요' : deck.length < 8 ? `${8 - deck.length}장을 더 넣으세요` : '';
    $('deckTabs').innerHTML = save.deckSlots[f].map((d, i) => `<button data-i="${i}" class="${i === save.deckSlot[f] ? 'on' : ''}">덱 ${i + 1}</button>`).join('');
    const slots = $('deckSlots');
    slots.innerHTML = '';
    deck.forEach((id, i) => {
      const el = cardEl(CARD[id], (deckSel === id ? 'sel' : '') + (swapMode ? ' swap' : ''), { lv: levelOf(id), rank: true, tile: true });
      el.onclick = () => {
        if (swapMode && deckSel && !deck.includes(deckSel)) { deck[i] = deckSel; swapMode = false; persist(); SFX.play('click'); }
        else { deckSel = id; swapMode = false; cardOpen = true; }
        renderDeck();
      };
      slots.appendChild(el);
    });
    for (let i = deck.length; i < 8; i++) { // empty places of an unfinished deck
      const el = document.createElement('div'); el.className = 'tile'; el.innerHTML = '<div class="card emptyslot"><span>빈 칸</span></div>';
      slots.appendChild(el);
    }
    if (!CSORT[save.collSort]) save.collSort = 'faction';
    $('collSort').innerHTML = Object.entries(CSORT).map(([k, n]) => `<button data-s="${k}" class="${save.collSort === k ? 'on' : ''}">${n}${save.collSort === k ? (save.collDesc ? ' ▼' : ' ▲') : ''}</button>`).join('');
    const col = $('collection');
    col.innerHTML = '';
    const list = DATA.CARDS.filter((c) => !deck.includes(c.id)).sort(collOrder(save.collSort, f, !!save.collDesc)); // (cards in the deck above are not repeated here)
    list.forEach((c) => {
      const o = save.cards[c.id];
      const locked = !unlocked(c) || !o;
      const el = cardEl(c, (deck.includes(c.id) ? 'used' : '') + (deckSel === c.id ? ' sel' : '') + (canUpgrade(c) ? ' upg' : ''), { lv: o && o.lv, locked, isNew: !locked && save.newCards && save.newCards[c.id], rank: true, tile: true });
      el.onclick = () => { deckSel = c.id; swapMode = false; cardOpen = true; if (save.newCards && save.newCards[c.id]) { delete save.newCards[c.id]; persist(); } renderDeck(); };
      col.appendChild(el);
    });
    const info = $('cardInfo');
    const c = cardOpen && deckSel && CARD[deckSel];
    $('cardOv').hidden = !c;
    if (!c) return; // (the details live in a popup: only while a card is tapped)
    const o = save.cards[c.id], lv = o ? o.lv : 1, m = LEVEL.mult(lv);
    const st = [];
    if (c.type === 'troop') {
      st.push(['체력', Math.round(c.hp * m) + (c.count > 1 ? ` ×${c.count}` : '')], ['공격력', Math.round(c.dmg * m)], ['공격 속도', c.rate + '초'], ['사거리', c.range <= 1.2 ? '근접' : c.range],
        ['이동', c.speed >= 2 ? '매우 빠름' : c.speed >= 1.5 ? '빠름' : c.speed >= 1 ? '보통' : '느림'],
        ['대상', c.aim === 'buildings' ? '건물' : c.hits === 'ground' ? '지상' : '공중·지상']);
      if (c.air) st.push(['유형', '비행']);
      if (c.heal) st.push(['치료', `${Math.round(c.heal.amount * m)} / ${c.heal.every}초`], ['치료 반경', c.heal.radius]);
      if (c.chain) st.push(['연쇄', c.chain + '타겟']);
      if (c.slow) st.push(['둔화', Math.round(c.slow * 100) + '%']);
      if (c.splash) st.push(['범위', c.splash]);
    } else if (c.type === 'building') {
      st.push(['체력', Math.round(c.hp * m)], ['유지', c.life + '초']);
      if (c.dmg) st.push(['공격력', Math.round(c.dmg * m)], ['공격 속도', c.rate + '초'], ['사거리', c.range], ['대상', '공중·지상']);
      if (c.spawn) st.push(['출격', `${CARD[c.spawn.card].name} / ${c.spawn.every}초`]);
    } else if (c.spell === 'rage') {
      st.push(['반경', c.radius], ['지속', c.dur + '초'], ['가속', '+' + Math.round((c.k - 1) * 100) + '%']);
    } else {
      st.push(['피해', Math.round(c.dmg * m) + (c.dur ? '/초' : '')], ['반경', c.radius], ['탑 피해', Math.round(c.dmg * m * c.towerK)]);
      if (c.dur) st.push(['지속', c.dur + '초']);
      if (c.stun) st.push(['기절', c.stun + '초']);
      if (c.freeze) st.push(['빙결', c.freeze + '초']);
    }
    const inDeck = deck.includes(c.id);
    let act = '';
    if (!o || !unlocked(c)) act = `<span class="hint">${esc(ARENAS[c.arena].name)} (트로피 ${ARENAS[c.arena].trophy})에서 해금</span>`;
    else {
      if (lv < LEVEL.max) {
        const k = upCost(c, lv);
        act += `<button class="btn ${canUpgrade(c) ? 'g' : 'd'} sm" id="btnUp" ${canUpgrade(c) ? '' : 'disabled'}>강화 Lv.${lv + 1} · 카드 ${o.n}/${k.n} · <i class="gold-i"></i>${k.gold}</button>`;
      } else act += '<span class="hint">최대 레벨</span>';
      act += inDeck ? ' <button class="btn d sm" id="btnOut">덱에서 빼기</button>' : ' <button class="btn y sm" id="btnUse">덱에 넣기</button>';
    }
    const skill = c.skill ? `<div class="skillinfo"><b>챔피언 스킬 · ${esc(c.skill.name)}</b> <span class="cost-s">${c.skill.cost}</span><br>${esc(c.skill.desc)} (재사용 ${c.skill.cd}초${c.skill.dmg ? ' · 피해 ' + Math.round(c.skill.dmg * m) : ''}${c.skill.radius ? ' · 반경 ' + c.skill.radius : ''}${c.skill.reach ? ' · 사거리 ' + c.skill.reach : ''})</div>` : '';
    info.innerHTML = `<div class="ci-head"></div><div class="ci-body"><h4>${rankIc(c)}${esc(c.name)} <small>Lv.${lv}</small></h4><p>${esc(c.desc)}</p>${skill}
      <dl>${st.map(([k2, v]) => `<div><dt>${k2}</dt><dd>${v}</dd></div>`).join('')}</dl></div>`;
    $('cardAct').innerHTML = act;
    info.querySelector('.ci-head').appendChild(cardEl(c, '', { lv: o && o.lv, locked: !o || !unlocked(c), rank: true }));
    const b = $('btnUse');
    if (b) b.onclick = () => { // a free place takes it at once; a full deck: a deck slot is tapped next
      if (deck.length < 8) { deck.push(c.id); persist(); } else swapMode = true;
      cardOpen = false; SFX.play('click'); renderDeck();
    };
    const out = $('btnOut');
    if (out) out.onclick = () => { deck.splice(deck.indexOf(c.id), 1); persist(); cardOpen = false; deckSel = null; SFX.play('click'); renderDeck(); };
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
    const G = GAME.G, S = G.sides && G.sides.blue;
    if (!S) return;
    const h = $('hand');
    // selection only toggles a class: rebuilding would detach the card under the finger mid-gesture (iOS drops the pointer)
    const key = S.hand.join() + '|' + S.queue[0];
    if (key !== handKey) {
      handKey = key;
      h.innerHTML = '';
      S.hand.forEach((id, i) => {
        const el = cardEl(CARD[id], played && prevHand[i] && prevHand[i] !== id ? 'enter' : '', { lv: levelOf(id) });
        el.dataset.i = i;
        el.addEventListener('pointerdown', (ev) => { ev.preventDefault(); GAME.cardDown(i, ev); SFX.play('click', 0.3); });
        el.insertAdjacentHTML('beforeend', `<kbd>${i + 1}</kbd>`);
        h.appendChild(el);
        if (el.classList.contains('enter')) setTimeout(() => el.classList.remove('enter'), 450); // the draw animation can never leave a card stuck small by NEXT (paused or throttled animations)
      });
      prevHand = S.hand.slice();
      const n = $('nextCard');
      n.innerHTML = '';
      if (S.queue[0]) n.appendChild(cardEl(CARD[S.queue[0]], 'mini'));
      tickCards(true);
    }
    for (const el of h.children) el.classList.toggle('sel', +el.dataset.i === G.sel);
    costPrev();
    const tip = $('cardTip'), sc = G.sel >= 0 && CARD[S.hand[G.sel]];
    tip.hidden = !sc;
    if (sc) tip.innerHTML = `${rankIc(sc)}<b>${esc(sc.name)}</b><span class="role">${ROLE_NAME[roleOf(sc)]}</span> ${esc(sc.desc)}${sc.skill ? `<br><em>스킬 · ${esc(sc.skill.name)}: ${esc(sc.skill.desc)}</em>` : ''}`;
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
      b.innerHTML = `<span class="pf" style="background-image:url(${art(u.card)})"></span><span class="cd"></span><b>${esc(u.card.skill.name)}</b><span class="cost-s">${GAME.skillState(u).cost}</span>${HOVER ? '<i class="hk"></i>' : ''}`;
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
    const r = $('stage').getBoundingClientRect(), lab = tower.label.getBoundingClientRect();
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
  function banner(msg, kind) {
    const el = $('banner');
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
  function skillCut(u) {
    const el = document.createElement('div');
    // one cut-in per side at a time; the opponent's is a compact banner that keeps the field readable
    document.querySelectorAll('.skcut.' + u.side).forEach((x) => x.remove());
    el.className = 'skcut ' + u.side + (u.side === 'red' ? ' mini' : '');
    if (u.side === 'red') document.querySelectorAll('.bubble.red').forEach((x) => x.classList.add('low'));
    // champions with original full-body art step into the cut-in; the rest keep the portrait chip
    const face = u.side === 'red' && FULL_ART.has(u.card.id) ? `<span class="pf face" style="background-image:url(assets/full/${u.card.id}.png)"></span>` : u.side === 'red' && PANEL_ART.has(u.card.id) ? `<span class="pf face panel-face" style="background-image:url(assets/full/${u.card.id}_panel.png)"></span>` : '';
    el.innerHTML = face ? face + `<b>${esc(u.card.skill.name)}</b><small>${esc(u.card.name)}</small>` : (u.side === 'blue' && PANEL_ART.has(u.card.id) ? `<img class="panel" alt="" src="assets/full/${u.card.id}_panel.png">` : u.side === 'blue' && FULL_ART.has(u.card.id) ? `<img class="full" alt="" src="assets/full/${u.card.id}.png">` : `<span class="pf" style="background-image:url(${art(u.card)})"></span>`) + `<b>${esc(u.card.skill.name)}</b><small>${esc(u.card.name)}</small>`;
    $('stage').appendChild(el);
    pausedRemove(el);
  }
  function emote(side, i, atEnd) {
    const G = GAME.G;
    if (!G.sides || G.paused || (G.phase !== 'play' && !(atEnd && G.phase === 'ended'))) return; // only in play (the victory taunt excepted), never over the pause menu
    const f = FACTIONS[G.sides[side].faction], em = f.emotes[i];
    if (!em) return;
    const old = document.querySelector('.bubble.' + side);
    if (old) old.remove();
    const el = document.createElement('div');
    el.className = 'bubble ' + side + (side === 'red' && document.querySelector('.skcut.red') ? ' low' : '');
    el.innerHTML = `<span class="pf" style="background-image:url(${IMG[em[0]]})"></span><b>${esc(em[1])}</b>`;
    $('stage').appendChild(el);
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
    for (const r of dmgRecent) if (r.side === side && now - r.t < 450 && Math.abs(r.x - x) < 48 && Math.abs(r.y - y) < 48 && r.el.isConnected) { r.n += n; r.el.textContent = '-' + r.n; r.el.classList.toggle('big', r.n >= 300); const an = r.el.getAnimations ? r.el.getAnimations()[0] : null; if (an) an.currentTime = 0; else { r.el.style.animation = 'none'; void r.el.offsetWidth; r.el.style.animation = ''; } r.t = now; return; }
    if (dmgLive >= 24) return;
    const el = dmgPool.pop() || document.createElement('span'); // nodes are reused (no DOM churn in big fights)
    el.className = 'dmgn ' + side + (n >= 300 ? ' big' : '');
    el.textContent = '-' + n;
    el.style.left = (x + (Math.random() - 0.5) * 26) + 'px'; el.style.top = (y - (dmgLive % 3) * 12) + 'px'; // spread so quick hits never stack on one spot
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
  const foeFaction = (o) => ((o.mode === 4 || o.online) && o.foeFaction ? o.foeFaction : o.mode === 3 && (o.mut || DATA.mutatorOf()).mirror ? o.faction : o.faction === 'orca' ? 'iron' : 'orca');
  // practice: the opponent plays one of the player's own decks (its faction is the deck's majority) or an AI deck
  const PFOE = { ai: 'AI 덱', orca: '내 오르카 덱', iron: '내 철충 덱' };
  function practiceOpts() {
    if (save.mode !== 4) return {};
    const k = save.practiceFoe, d = k !== 'ai' && save.decks[k];
    if (!d || d.length !== 8) return {}; // (an unfinished deck: the AI deck instead)
    const n = { orca: 0, iron: 0 }; d.forEach((id) => { if (CARD[id] && n[CARD[id].faction] != null) n[CARD[id].faction]++; });
    return { foeDeck: d.slice(), foeFaction: n.orca === n.iron ? k : n.orca > n.iron ? 'orca' : 'iron' };
  }
  function loading(f, opts) {
    const el = $('loading');
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
      $('vsMeName').textContent = '사령관';
      $('vsMeSub').textContent = `${FACTIONS[opts.faction].name} · 트로피 ${save.trophy}`;
      $('vsFoeName').textContent = foe.name;
      const rl = GAME.G.sides && GAME.G.sides.red.lvl;
      $('vsFoeSub').innerHTML = (rl ? `<b class="style">Lv.${rl}</b> · ` : '') + `${FACTIONS[ff].name} · <b class="style">${st.name}</b> · ${BAL.diffs[opts.diff].name} · ${opts.mode === 3 ? (opts.mut || DATA.mutatorOf()).name : BAL.modes[opts.mode].name}`;
      $('vsArena').textContent = ARENAS[opts.arena].name;
      const hs = GAME.G.hints || []; $('vsHint').textContent = hs.length ? '정보: 상대가 ' + hs[0] : ''; $('vsHint').hidden = !hs.length;
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
    const pool = DATA.CARDS.filter((c) => save.cards[c.id]); // any card can be in a deck, so any card can drop
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
      if (save.chests.length < 4) {
        const tot = DATA.CHESTS.reduce((s, c) => s + c.weight, 0);
        let r = Math.random() * tot;
        chest = DATA.CHESTS.find((c) => (r -= c.weight) < 0) || DATA.CHESTS[0];
        save.chests.push({ k: chest.key, t0: null });
      } else picks = rollCards(3);
    } else if (crownsN > 0) picks = rollCards(1);
    return { gold, picks, chest };
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
    if (!Array.isArray(save.chests)) save.chests = [];
    const row = $('chestRow');
    // the slots are rebuilt only when their set changes; the timers update text and classes in place
    const key = save.chests.map((c) => c.k).join() + '|' + save.chests.length;
    const slots = save.chests.length ? 4 : 1; // no crates at all: one slim full-width hint instead of four empty boxes
    if (key !== chestKey || row.childElementCount !== slots) {
      chestKey = key;
      row.innerHTML = (slots === 1 ? [0] : [0, 1, 2, 3]).map((i) => {
        const c = save.chests[i];
        if (!c) return slots === 1 ? '<div class="chest empty all"><small>승리하면 보급 상자를 받습니다</small></div>' : '<div class="chest empty"><small>빈 슬롯</small></div>';
        return `<button class="chest ${c.k}" data-i="${i}"><i class="box"></i><b>${esc(CH[c.k].name)}</b><small></small></button>`;
      }).join('');
    }
    const unlocking = save.chests.some((c) => c.t0 && chestLeft(c) > 0);
    save.chests.forEach((c, i) => {
      const b = row.children[i], left = chestLeft(c);
      const st = left === null ? (unlocking ? '대기' : '탭하여 해제') : left > 0 ? `${fmtT(left)} · ⚙${rushCost(left)}` : '열기!';
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
    const a1 = arena();
    syncCollection();
    const el = $('result');
    el.className = 'screen on ' + (win ? 'win' : draw ? 'draw' : 'lose');
    $('resTitle').textContent = win ? '승리!' : draw ? '무승부' : '패배';
    const REASON = { king: '킹 타워 파괴', crowns: '크라운 수', overtime: '연장전 타워 파괴', hp: '타워 체력 판정 (가장 약한 타워 비교)', surrender: '항복' };
    $('resReason').textContent = (practice ? '연습전 · ' : '') + (REASON[reason] || '');
    // the winning side's original cut-scene art behind the result
    const wf = (win || draw ? G.sides.blue : G.sides.red).faction;
    el.style.backgroundImage = `linear-gradient(rgba(4,6,10,.5), rgba(4,6,10,.88)), url(assets/bg/${WIN_ART[wf][Math.floor(Math.random() * WIN_ART[wf].length)]}.jpg)`;
    $('resHero').style.backgroundImage = `url(${IMG[FACTIONS[(win || draw ? G.sides.blue : G.sides.red).faction].banner]})`;
    $('resCrowns').innerHTML = `<div class="rc blue"><small>${FACTIONS[G.sides.blue.faction].name}</small><span>${[0, 1, 2].map((i) => `<i class="${i < b ? 'on' : ''}"></i>`).join('')}</span></div>
      <div class="rc red"><small>${esc(foe ? foe.name : FACTIONS[G.sides.red.faction].name)}</small><span>${[0, 1, 2].map((i) => `<i class="${i < r ? 'on' : ''}"></i>`).join('')}</span></div>`;
    $('resTrophy').innerHTML = `<i class="tro"></i>${save.trophy} <em class="${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '+' : ''}${delta}</em>`;
    if (practice) $('resTrophy').innerHTML = '<span class="prac">연습전 · 트로피와 보상 변동 없음</span>';
    const s = stats.blue;
    $('resStats').innerHTML = `<div><b>${Math.round(s.dmg).toLocaleString()}</b><small>입힌 피해</small></div><div><b>${s.kills}</b><small>처치</small></div><div><b>${s.spent}</b><small>사용 에너지</small></div><div><b>${s.wasted.toFixed(1)}</b><small>낭비 에너지</small></div>`;
    $('resStats').hidden = !s.cards && !s.dmg; // a match won before a single card was played has no stats to show
    // how the battle went: tower falls, champion skills, energy phases
    const lg = stats.log || [];
    $('resLog').hidden = !lg.length;
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
    rwEl.innerHTML = `<div class="rw gold-rw"><i class="gold-i big"></i><b>+${rw.gold}</b></div>` + (rw.chest ? `<div class="rw"><span class="chest-i ${rw.chest.key}"></span><b>${esc(rw.chest.name)}</b></div>` : '') + rw.picks.map(([c, n]) => `<div class="rw"><span class="pf r${c.rarity}" style="background-image:url(${art(c)})"></span><b>x${n}</b></div>`).join('');
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
      const crate = save.chests.length < 4 ? (save.opStreak >= 3 ? 'epic' : 'rare') : null;
      if (crate) save.chests.push({ k: crate, t0: null });
      notes.push(`<b>오늘의 작전 완수! (${save.opStreak}일 연속)</b> 부품 +${og}${crate ? ' · ' + esc(CH[crate].name) : ' · 상자 슬롯이 가득 차 상자는 받지 못했습니다'}`);
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
      const t0 = Date.now(), WAIT = 15000;
      const sec = setInterval(() => { $('searchSec').textContent = Math.max(0, Math.ceil((WAIT - (Date.now() - t0)) / 1000)) + '초 후 AI 대전'; }, 250);
      const m = await NET.find(profile, WAIT);
      clearInterval(sec); searching = false;
      const how = $('searchOv').dataset.how || ''; $('searchOv').dataset.how = ''; $('searchOv').hidden = true;
      if (m) { startOnline(m); return; }
      if (how === 'cancel') return;
      toast(how === 'ai' ? 'AI와 대전합니다' : '상대를 찾지 못해 AI와 대전합니다');
    }
    beginBattleScreen();
    const levels = {};
    save.decks[save.faction].forEach((id) => { levels[id] = levelOf(id); });
    DATA.CARDS.forEach((c) => { if (!(c.id in levels) && save.cards[c.id]) levels[c.id] = save.cards[c.id].lv; });
    const mut = save.mode === 3 ? DATA.mutatorOf() : null; // drawn once: the commander, the VS screen and the battle all use the same rule (no midnight race)
    const po = practiceOpts();
    const ff = foeFaction(Object.assign({ faction: save.faction, mode: save.mode, mut }, po)), cs = DATA.COMMANDERS[ff];
    GAME.start(Object.assign({ faction: save.faction, deck: save.decks[save.faction], diff: save.diff, mode: save.mode, mut, levels, arena: arena(), foe: cs[Math.floor(Math.random() * cs.length)] }, po));
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
    $('btnDeck').onclick = () => { SFX.play('click'); deckSel = null; swapMode = false; cardOpen = false; renderDeck(); show('deck'); };
    $('btnCardClose').onclick = () => { cardOpen = false; renderDeck(); };
    $('btnShopClose').onclick = () => { SFX.play('click'); $('shopOv').hidden = true; };
    $('collSort').addEventListener('click', (e) => { const b = e.target.closest('[data-s]'); if (!b) return; if (save.collSort === b.dataset.s) save.collDesc = !save.collDesc; else { save.collSort = b.dataset.s; save.collDesc = false; } persist(); SFX.play('click'); renderDeck(); });
    $('cardOv').addEventListener('click', (e) => { if (e.target.id === 'cardOv') { cardOpen = false; renderDeck(); } }); // a tap outside the popup closes it
    $('deckTabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]'); if (!b) return;
      const f = save.faction, i = +b.dataset.i;
      save.deckSlot[f] = i; save.decks[f] = save.deckSlots[f][i]; persist();
      deckSel = null; swapMode = false; cardOpen = false; SFX.play('click'); renderDeck();
    });
    $('btnSettings').onclick = () => { SFX.play('click'); openSettings(); };
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
    $('arenaName').onclick = $('roadNext').onclick = () => { SFX.play('click'); $('roadOv').hidden = false; renderRoad(); }; // shown first: scrollIntoView needs layout
    $('btnRoadClose').onclick = () => { $('roadOv').hidden = true; renderTitle(); };
    $('roadBtn').onclick = () => { SFX.play('click'); $('roadOv').hidden = false; renderRoad(); };
    $('btnRoadClaim').onclick = () => {
      const road = DATA.ROAD.filter((r) => r.trophy <= save.trophy && r.trophy > (save.road || 0));
      let gold = 0, crates = 0;
      let full = false;
      for (const r of road) {
        if (r.chest) { if (save.chests.length >= 4) { full = true; break; } save.chests.push({ k: r.chest, t0: null }); crates++; } // a crate waits for a free slot
        else gold += r.gold;
        save.road = r.trophy;
      }
      if (!gold && !crates) { toast('상자 슬롯이 가득 찼습니다 — 상자를 열고 다시 받으세요'); SFX.play('fail', 0.4); renderRoad(); return; }
      if (full) setTimeout(() => toast('상자 슬롯이 가득 찼습니다 — 상자를 열고 다시 받으세요'), 1500);
      save.gold += gold;
      persist();
      SFX.play('pickSS', 0.6);
      toast(`트로피 로드 보상: ${gold ? '부품 +' + gold : ''}${gold && crates ? ' · ' : ''}${crates ? '상자 ' + crates + '개' : ''}`);
      renderRoad();
    };
    $('btnMissions').onclick = () => { SFX.play('click'); renderMissions(); $('missionOv').hidden = false; };
    $('btnSearchCancel').onclick = () => { $('searchOv').dataset.how = 'cancel'; NET.cancel(); };
    $('btnSearchAi').onclick = () => { $('searchOv').dataset.how = 'ai'; NET.cancel(); };
    $('btnMode').onclick = () => { SFX.play('click'); $('modeOv').hidden = false; };
    $('btnModeClose').onclick = () => { SFX.play('click'); $('modeOv').hidden = true; renderTitle(); };
    // the bottom tab bar (Clash Royale style): cards, battle (this screen), missions, trophy road
    document.querySelector('.tabbar').addEventListener('click', (e) => { // (the bar moves between home and deck: one listener)
      const b = e.target.closest('[data-tab]'); if (!b) return;
      const t = b.dataset.tab;
      if (t === 'shop') { SFX.play('click'); $('shopOv').hidden = false; } // (not built yet)
      else if (t === 'deck') { if (!$('deck').classList.contains('on')) $('btnDeck').click(); }
      else if (t === 'battle') { if (!$('title').classList.contains('on')) SFX.play('click'); cardOpen = false; $('cardOv').hidden = true; renderTitle(); show('title'); }
      else if (t === 'road') { SFX.play('click'); $('roadOv').hidden = false; renderRoad(); }
      // (missions: its own handler above; battle: this screen)
    });
    $('btnMClose').onclick = () => { $('missionOv').hidden = true; renderTitle(); };
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
    $('supBtn').onclick = () => { if (GAME.useSupport()) { SFX.play('click', 0.5); supKey = ''; } };
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
      GAME.aiEmote(Math.floor(Math.random() * 4), 0.35); // the opponent answers on the game clock and its own chatter cooldown
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
      $('emotePanel').innerHTML = FACTIONS[G.sides.blue.faction].emotes.map(([img, t], i) => `<button data-i="${i}"><span class="pf" style="background-image:url(${IMG[img]})"></span>${esc(t)}</button>`).join('');
    } else if (!e.target.closest || !e.target.closest('#emotePanel')) { const p = $('emotePanel'); if (p) p.hidden = true; }
  }, true);

  window.UI = { _sync: () => syncCollection(), init, dmgNum, healNum, elixirLeak, cardEl, hand, tick, crowns, crownFly, toast, banner, countdown, dragCard, loading, loaded, pause, result, save, skillCut, emote, elixirShake, fatal, fireSkill, aimPid: () => (aim ? aim.pid : null) };
  window.addEventListener('DOMContentLoaded', init);
})();
