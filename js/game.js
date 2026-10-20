// Last Royal: arena rendering, battle simulation, champions, AI opponent and battle input.
// Field coordinates: x -9..9 (left..right), z -16..16 (player's back .. enemy's back). The screen is the
// x / y plane with y = z * TILT (+ height): characters stand upright on the tilted floor.
(function () {
  const { BAL, FACTIONS, ARENAS, LEVEL, card: CARD } = DATA;
  const TILT = 0.86;     // floor squash: one fixed board shape on every screen (phones and PC see the same arena; other aspects get side or top bands)
  const SD_K = 0.155;        // one scale for every bioroid rig (the original's relative sizes)
  const BODY = 9.5;          // nominal bioroid body height in rig units
  const AIR_LIFT = 1.15;     // flying troops hover this high above their shadow
  const TROOP_K = 2.4;       // troops stay small against the arena: a strategy game needs the whole field readable at a glance
  // Clash Royale-style size classes by weight: swarms and light units small, regular troops as they are, heavy armour
  // large. Bioroids are human-sized (capped at x1.2); the iron units' drawn heights already make their machines big,
  // so they only shrink their small ones (the softer square root). A card's own `size` overrides the class.
  const sizeK = (c) => {
    const m = c.mass || 4;
    let k = c.size || (c.count > 1 || m <= 3 ? 0.82 : m <= 7 ? 1 : m <= 12 ? 1.25 : 1.5);
    if (c.faction === 'orca') k = Math.min(k, 1.2);
    return c.h ? Math.sqrt(Math.min(k, 1)) : k; // (the iron giants are already drawn tall: only their small units shrink, the field stays readable)
  };
  const IRON_FXK = 0.2;      // baked effect scale for Iron Blood rigs (no rig scale of their own)
  const MOBILE = /[?&]mobile=1\b/.test(location.search) || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || // (?mobile=1: run the phone path on a PC, for tests)
    (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform));
  const FORM = { 1: [[0, 0]], 2: [[-0.5, 0], [0.5, 0]], 3: [[0, 0.5], [-0.55, -0.35], [0.55, -0.35]], 4: [[-0.5, 0.5], [0.5, 0.5], [-0.5, -0.5], [0.5, -0.5]],
    5: [[0, 0.65], [-0.62, 0.15], [0.62, 0.15], [-0.38, -0.55], [0.38, -0.55]], 6: [[-0.6, 0.5], [0, 0.65], [0.6, 0.5], [-0.6, -0.45], [0, -0.6], [0.6, -0.45]] };
  const TOWER_E = { king: 2.3, princess: 1.75, bld: 0.9 }; // tower top height (guard stands there)
  const L = FX.L;

  let renderer, composer, bloom, scene, camera, stageEl, labelsEl;
  let fieldMesh, fieldTex, zoneMesh, zoneCv, zoneTex;
  const view = { w: 1, h: 1 };
  const towerTex = {};
  const emblems = {}; // faction -> commander portrait image (king tower badge), loaded at boot

  const G = {
    phase: 'title', after: [], ents: [], projs: [], bfx: [], sfx: [], zones: [], decals: [], punch: 0, sides: null, time: 0, clock: 0, overtime: false, mult: 1,
    sel: -1, ghost: null, opts: null, nextId: 1, endT: 0, result: null, paused: false, riverT: 0, surge: 0, zoneKey: '', arena: 0,
    stats: null,
  };

  // battle log for the result screen: [clock text, line, side]
  function logEvent(text, side, kind) { if (!G.log) return; const t = Math.max(0, Math.ceil(G.clock)); G.log.push([(G.overtime ? '연장 ' : '') + Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'), text, side || '', kind || '']); if (G.log.length > 400) G.log.splice(0, G.log.length - 400); } // bounded (long overtime / soak runs)
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rnd = (a, b) => a + Math.random() * (b - a);
  // the few random draws that change a match (not its effects) come from a seeded generator: an online match runs the
  // same draws on both devices. The guest sees the field mirrored, so a drawn position offset is mirrored there too.
  let mp = null; // online match state (see "online match" below); null offline
  const mulberry = (seed) => () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  let srng = Math.random;
  const srnd = (a, b) => a + srng() * (b - a);
  const MIR = () => (mp && mp.guest ? -1 : 1);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const sy = (e) => e.z * TILT + (e.air ? AIR_LIFT : 0) + (e.elev || 0);
  const other = (s) => (s === 'blue' ? 'red' : 'blue');
  const SGN = { blue: -1, red: 1 }; // home half
  const teamHex = (side) => (side === 'blue' ? 0x4fc0ff : 0xff5466);

  // ── quality (auto-lowered when frames run long) ──────────
  const QUALITY = [
    { name: '높음', dpr: 2, bloom: 0.5, parts: 900 },
    { name: '보통', dpr: 2, bloom: 0.35, parts: 650 }, // (phones start here: 2x keeps the small units crisp)
    { name: '낮음', dpr: 1, bloom: 0, parts: 420 },
  ];
  const perf = { level: MOBILE ? 1 : 0, acc: 0, n: 0, slow: 0, fps: 60, work: 0 };

  // ── textures ──────────────────────────────────────────
  const FX_ = { x0: -10.5, x1: 10.5, z0: -17.5, z1: 31, P: 36 }; // z1 reaches past the far wall: the band above the arena is the bunker's back wall
  let fieldCv = null;
  function fieldCanvas(ar) {
    const { x0, x1, z0, z1, P } = FX_;
    const cv = fieldCv || (fieldCv = document.createElement('canvas')); // one canvas, redrawn per arena (setting the size clears it)
    cv.width = (x1 - x0) * P; cv.height = (z1 - z0) * P;
    const g = cv.getContext('2d');
    const X = (x) => (x - x0) * P, Y = (z) => (z1 - z) * P;
    const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16); const f = (v) => clamp(Math.round(v * k), 0, 255); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; };
    // surroundings: dark hull plating
    g.fillStyle = ar.rim; g.fillRect(0, 0, cv.width, cv.height);
    for (let z = Math.floor(z0); z < z1; z += 2) for (let x = Math.floor(x0); x < x1; x += 3) {
      g.fillStyle = shade(ar.rim, (Math.floor(x / 3) + z / 2) % 2 ? 1.25 : 1.1);
      g.fillRect(X(x) + 1, Y(z + 2) + 1, 3 * P - 2, 2 * P - 2);
      g.fillStyle = 'rgba(255,255,255,0.03)'; g.fillRect(X(x) + 4, Y(z + 2) + 4, 4, 4); g.fillRect(X(x + 3) - 8, Y(z + 2) + 4, 4, 4);
    }
    const fl = ar.floor && floorImg[ar.floor];
    if (fl) {
      // the arena's original floor material, mirror-tiled down the field (seamless), then shaded per half
      const fx0 = X(-9), fy0 = Y(16), tw = 18 * P, th = fl.height * tw / fl.width, H = 32 * P;
      // the playing deck is light steel plating with the arena's original tread art pressed into it: dark rigs read on a bright floor
      const [dHome, dFar] = ar.deck || ['#a9bccd', '#c9c0b4'];
      { const bgd = g.createLinearGradient(0, fy0, 0, fy0 + H); bgd.addColorStop(0, dFar); bgd.addColorStop(0.47, dFar); bgd.addColorStop(0.53, dHome); bgd.addColorStop(1, dHome); g.fillStyle = bgd; g.fillRect(fx0, fy0, tw, H); g.fillStyle = 'rgba(0,0,0,0.1)'; g.fillRect(fx0, fy0, tw, H);
        g.fillStyle = 'rgba(255,80,90,0.05)'; g.fillRect(fx0, fy0, tw, H / 2); g.fillStyle = 'rgba(70,150,255,0.05)'; g.fillRect(fx0, fy0 + H / 2, tw, H / 2); } // a faint team cast on each half
      g.save(); g.beginPath(); g.rect(fx0, fy0, tw, H); g.clip(); g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 0.9;
      for (let y = 0, i = 0; y < H; y += th, i++) { g.save(); if (i % 2) { g.translate(0, fy0 + y + th); g.scale(1, -1); g.drawImage(fl, fx0, 0, tw, th); } else g.drawImage(fl, fx0, fy0 + y, tw, th); g.restore(); }
      g.restore();
      // 3 x 2 deck plates: each a slightly different tone, a dark seam and a lit bevel
      for (let z = -16; z < 16; z += 2) for (let x = -9; x < 9; x += 3) {
        const px = X(x), py = Y(z + 2), w = 3 * P, h = 2 * P, k = ((x * 7 + z * 5 + 99) % 5) / 5;
        g.fillStyle = k < 0.4 ? `rgba(0,0,0,${0.03 + k * 0.08})` : `rgba(255,255,255,${(k - 0.4) * 0.12})`; g.fillRect(px, py, w, h);
        g.strokeStyle = 'rgba(20,26,32,0.38)'; g.lineWidth = 3; g.strokeRect(px + 1.5, py + 1.5, w - 3, h - 3);
        g.strokeStyle = 'rgba(255,255,255,0.2)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(px + 4, py + h - 4); g.lineTo(px + 4, py + 4); g.lineTo(px + w - 4, py + 4); g.stroke();
        g.fillStyle = 'rgba(20,26,32,0.45)'; for (const [bx, by] of [[8, 8], [w - 8, 8], [8, h - 8], [w - 8, h - 8]]) { g.beginPath(); g.arc(px + bx, py + by, 2.6, 0, Math.PI * 2); g.fill(); }
      }
      // an iron half is infested: the iron wall art creeps in from the side walls and its back edge, fading out before the lanes
      const ivy = PROPS.wall_iron, iron = G.ironHalves || { far: true, home: false };
      if (ivy && ivy.naturalWidth && (iron.far || iron.home)) {
        const oc = document.createElement('canvas'); oc.width = tw; oc.height = 16 * P;
        const og = oc.getContext('2d'), pat = og.createPattern(ivy, 'repeat');
        if (pat.setTransform) pat.setTransform(new DOMMatrix().scale(0.8));
        og.fillStyle = pat; og.fillRect(0, 0, oc.width, oc.height);
        og.globalCompositeOperation = 'destination-in';
        const mk = (x0, y0, x1, y1, a) => { const m = og.createLinearGradient(x0, y0, x1, y1); m.addColorStop(0, `rgba(0,0,0,${a})`); m.addColorStop(1, 'rgba(0,0,0,0)'); return m; };
        const mask = document.createElement('canvas'); mask.width = oc.width; mask.height = oc.height; const mg = mask.getContext('2d');
        mg.fillStyle = mk(0, 0, 0, 7 * P, 1); mg.fillRect(0, 0, oc.width, oc.height); // the back edge
        mg.fillStyle = mk(0, 0, 5 * P, 0, 1); mg.fillRect(0, 0, oc.width, oc.height); // the left wall
        mg.fillStyle = mk(oc.width, 0, oc.width - 5 * P, 0, 1); mg.fillRect(0, 0, oc.width, oc.height); // the right wall
        og.drawImage(mask, 0, 0);
        g.save(); g.globalAlpha = 0.95; g.globalCompositeOperation = 'multiply'; // pressed into the plating: the dark tendrils stain it, the light deck shows through
        if (iron.far) g.drawImage(oc, fx0, fy0);
        if (iron.home) { g.translate(0, fy0 + H); g.scale(1, -1); g.drawImage(oc, fx0, 0); } // mirrored: its back edge is the player's
        g.restore();
      }
      // original props along the walls, clear of the lanes and the tower pads (the deck reads as a place)
      const prop = (im, px, pz, w, flip) => { if (!im || !im.naturalWidth) return; const h = w * im.naturalHeight / im.naturalWidth * P, W = w * P; g.save(); g.translate(X(px), Y(pz)); if (flip) g.scale(-1, 1); g.globalAlpha = 0.95; g.filter = 'brightness(0.95)'; g.drawImage(im, -W / 2, -h, W, h); g.restore(); };
      for (const s of [-1, 1]) { // a cluster per corner: home side crates and sandbag lines, the far side iron wreckage
        prop(PROPS.crate, s * 7.9, -11.2, 2.3, s > 0);
        prop(PROPS.wreck, s * 7.4, 11.9, 3, s > 0);
      }
      // the sides are told apart by glowing team edge strips along the walls (the arena's own floor stays visible)
      for (const [z0, z1, col] of [[-16, -8, '58,168,255'], [8, 16, '255,74,90']]) {
        for (const ex of [fx0, fx0 + tw - 0.4 * P]) { const sg = g.createLinearGradient(0, Y(z1), 0, Y(z0)); sg.addColorStop(0, `rgba(${col},0.3)`); sg.addColorStop(0.5, `rgba(${col},0.95)`); sg.addColorStop(1, `rgba(${col},0.3)`); g.save(); g.shadowColor = `rgb(${col})`; g.shadowBlur = 14; g.fillStyle = sg; g.fillRect(ex, Y(z1), 0.4 * P, Y(z0) - Y(z1)); g.restore(); }
      }
      // deck decals: maintenance hatches and stencilled numbers
      g.save();
      for (const [hx, hz, n] of [[-6.5, -9, '01'], [6.5, -9, '02'], [-6.5, 9, '03'], [6.5, 9, '04'], [0, -4.2, 'A'], [0, 4.2, 'B']]) {
        const cx = X(hx), cy = Y(hz);
        g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(cx - 0.7 * P, cy - 0.45 * P, 1.4 * P, 0.9 * P);
        g.strokeStyle = 'rgba(255,255,255,0.1)'; g.lineWidth = 2; g.strokeRect(cx - 0.7 * P, cy - 0.45 * P, 1.4 * P, 0.9 * P);
        g.fillStyle = 'rgba(255,255,255,0.13)'; g.font = `bold ${Math.round(0.42 * P)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(n, cx, cy);
      }
      g.restore();
    }
    // floor tiles (procedural fallback until the floor art has loaded)
    if (!fl) for (let z = -16; z < 16; z++) for (let x = -9; x < 9; x++) {
      const home = z < 0, odd = (x + z + 100) % 2;
      g.fillStyle = (home ? ar.home : ar.away)[odd];
      g.fillRect(X(x), Y(z + 1), P, P);
      g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(X(x), Y(z + 1), P, 2); g.fillRect(X(x), Y(z + 1), 2, P);
      g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(X(x), Y(z) - 2, P, 2); g.fillRect(X(x + 1) - 2, Y(z + 1), 2, P);
      if ((x * 7 + z * 13 + 200) % 11 === 0) { g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(X(x) + 8, Y(z + 1) + 8, P - 16, 3); g.fillRect(X(x) + 8, Y(z + 1) + 14, P - 22, 3); }
    }
    // large deck plates (3x2 tiles) with bevelled seams and corner bolts
    if (!fl) for (let z = -16; z < 16; z += 2) for (let x = -9; x < 9; x += 3) {
      const px = X(x), py = Y(z + 2), w = 3 * P, h = 2 * P;
      g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 3; g.strokeRect(px + 1.5, py + 1.5, w - 3, h - 3);
      g.strokeStyle = 'rgba(255,255,255,0.06)'; g.lineWidth = 1; g.strokeRect(px + 4, py + 4, w - 8, h - 8);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      for (const [bx, by] of [[7, 7], [w - 7, 7], [7, h - 7], [w - 7, h - 7]]) { g.beginPath(); g.arc(px + bx, py + by, 2.2, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = 'rgba(255,255,255,0.08)';
      for (const [bx, by] of [[7, 7], [w - 7, 7], [7, h - 7], [w - 7, h - 7]]) { g.beginPath(); g.arc(px + bx - 0.6, py + by - 0.6, 1, 0, Math.PI * 2); g.fill(); }
    }
    // grime and wear
    for (let i = 0; i < (fl ? 250 : 900); i++) {
      const x = rnd(-9, 9), z = rnd(-16, 16);
      g.fillStyle = Math.random() < 0.7 ? `rgba(0,0,0,${rnd(0.05, 0.14)})` : `rgba(255,255,255,${rnd(0.02, 0.05)})`;
      g.fillRect(X(x), Y(z), rnd(1, 4), rnd(1, 3));
    }
    // lanes: worn, darker tracks toward the bridges (not light boxes)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const lx = X(sx * BAL.bridgeX), ly0 = Y(sz > 0 ? 14.5 : -1.4), lh = 13.1 * P, wg = g.createLinearGradient(lx - 1.2 * P, 0, lx + 1.2 * P, 0);
      wg.addColorStop(0, 'rgba(0,0,0,0)'); wg.addColorStop(0.5, 'rgba(0,0,0,0.24)'); wg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = wg; g.fillRect(lx - 1.2 * P, ly0, 2.4 * P, lh);
    }
    // chevrons along the lanes, pointing at the bridges
    g.strokeStyle = 'rgba(232,185,35,0.55)'; g.lineWidth = 5;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (let k = 3; k <= 7; k += 2) {
      const cx = X(sx * BAL.bridgeX), cy = Y(sz * k), d = sz > 0 ? 1 : -1; // tips toward the river
      g.beginPath(); g.moveTo(cx - 0.6 * P, cy - d * 0.35 * P); g.lineTo(cx, cy + d * 0.15 * P); g.lineTo(cx + 0.6 * P, cy - d * 0.35 * P); g.stroke();
    }
    // tower pads: team-coloured hex rings under each tower
    const team = (sz) => (sz < 0 ? '58,168,255' : '255,74,90');
    for (const sz of [-1, 1]) for (const [tx, tz, tr] of [[-BAL.tower.princess.x, BAL.tower.princess.z, 2.0], [BAL.tower.princess.x, BAL.tower.princess.z, 2.0], [0, BAL.tower.king.z, 2.5]]) {
      const cx = X(tx), cy = Y(sz * tz), R = tr * P;
      g.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); } g.closePath();
      g.fillStyle = `rgba(${team(sz)},0.07)`; g.fill();
      g.strokeStyle = `rgba(${team(sz)},0.35)`; g.lineWidth = 3; g.stroke();
    }
    // scuffs and boot-worn grime where the fights happen (around the centre marks and the bridge heads)
    for (const [gx, gz, gr] of [[0, 6.5, 2.6], [0, -6.5, 2.6], [-BAL.bridgeX, 3.2, 1.6], [BAL.bridgeX, 3.2, 1.6], [-BAL.bridgeX, -3.2, 1.6], [BAL.bridgeX, -3.2, 1.6]]) for (let i = 0; i < 5; i++) {
      const cx = X(gx + rnd(-gr, gr) * 0.7), cy = Y(gz + rnd(-gr, gr) * 0.5), rr = rnd(0.5, 1.1) * P, sg = g.createRadialGradient(cx, cy, 0, cx, cy, rr);
      sg.addColorStop(0, 'rgba(30,26,22,0.13)'); sg.addColorStop(1, 'rgba(30,26,22,0)'); g.fillStyle = sg; g.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);
    }
    // centre emblem
    g.save(); g.globalAlpha = 0.1; g.strokeStyle = '#fff'; g.lineWidth = 5; // quiet: the marks must not compete with the units
    for (const sz of [-1, 1]) { g.beginPath(); g.arc(X(0), Y(sz * 6.5), 2.2 * P, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(X(0), Y(sz * 6.5), 1.2 * P, 0, Math.PI * 2); g.stroke(); }
    g.restore();
    // raised bulkhead walls around the arena (dark steel with a lit top edge), casting a shadow onto the deck
    {
      const fx0 = X(-9), fy0 = Y(16), fw = 18 * P, fh = 32 * P, wt = 0.55 * P;
      g.save(); g.beginPath(); g.rect(fx0 - wt, fy0 - wt, fw + wt * 2, fh + wt * 2); g.rect(fx0, fy0, fw, fh); g.clip('evenodd');
      const bw = g.createLinearGradient(fx0 - wt, 0, fx0 + fw + wt, 0); bw.addColorStop(0, '#2b323a'); bw.addColorStop(0.5, '#3a434d'); bw.addColorStop(1, '#22282e');
      g.fillStyle = bw; g.fillRect(fx0 - wt, fy0 - wt, fw + wt * 2, fh + wt * 2);
      g.fillStyle = 'rgba(0,0,0,0.35)'; for (let z = -16; z < 16; z += 2) { g.fillRect(fx0 - wt, Y(z), wt, 2); g.fillRect(fx0 + fw, Y(z), wt, 2); } // panel seams
      g.restore();
      g.strokeStyle = 'rgba(200,215,230,0.55)'; g.lineWidth = 2; g.strokeRect(fx0 - wt + 1, fy0 - wt + 1, fw + wt * 2 - 2, fh + wt * 2 - 2); // lit top edge
      g.strokeStyle = '#0b0e12'; g.lineWidth = 3; g.strokeRect(fx0, fy0, fw, fh);
      for (const [x0, y0, x1, y1] of [[fx0, 0, fx0 + 0.6 * P, 0], [fx0 + fw, 0, fx0 + fw - 0.6 * P, 0]]) { const sg = g.createLinearGradient(x0, y0, x1, y1); sg.addColorStop(0, 'rgba(0,0,0,0.45)'); sg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = sg; g.fillRect(Math.min(x0, x1), fy0, 0.6 * P, fh); } // inner shadow
      const tsg = g.createLinearGradient(0, fy0, 0, fy0 + 0.8 * P); tsg.addColorStop(0, 'rgba(0,0,0,0.5)'); tsg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = tsg; g.fillRect(fx0, fy0, fw, 0.8 * P);
    }
    // energy chasm (the river)
    const ry0 = Y(BAL.river), ry1 = Y(-BAL.river);
    const gr = g.createLinearGradient(0, ry0, 0, ry1);
    gr.addColorStop(0, '#05090d'); gr.addColorStop(0.5, ar.river); gr.addColorStop(1, '#05090d');
    g.fillStyle = gr; g.fillRect(X(-9), ry0, 18 * P, ry1 - ry0);
    const gl = '#' + ar.glow.toString(16).padStart(6, '0');
    g.strokeStyle = gl; g.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      const yy = ry0 + (ry1 - ry0) * (0.15 + i * 0.14);
      for (let x = 0; x <= 18 * P; x += 12) g.lineTo(X(-9) + x, yy + Math.sin(x * 0.05 + i * 1.7) * 3);
      g.globalAlpha = 0.18 + (i % 3) * 0.12; g.stroke();
    }
    g.globalAlpha = 1;
    // glowing energy along both lips of the chasm
    g.save(); g.shadowColor = gl; g.shadowBlur = 18; g.strokeStyle = gl; g.lineWidth = 3; g.globalAlpha = 0.85;
    for (const yy of [ry0 + 6, ry1 - 6]) { g.beginPath(); g.moveTo(X(-9), yy); g.lineTo(X(9), yy); g.stroke(); }
    g.restore();
    for (const yy of [ry0, ry1]) { g.fillStyle = '#9aa7b3'; g.fillRect(X(-9), yy - 3, 18 * P, 6); g.fillStyle = '#5e6a75'; g.fillRect(X(-9), yy + (yy === ry0 ? 3 : -5), 18 * P, 2); }
    // bridges
    for (const s of [-1, 1]) {
      const bx = s * BAL.bridgeX, w = BAL.bridgeW;
      const bx0 = X(bx - w - 0.15), bx1 = X(bx + w + 0.15), by0 = Y(BAL.river + 0.8), by1 = Y(-BAL.river - 0.8);
      // a chunky steel span: drop shadow, a side face toward the camera, a plated deck and railings with posts
      g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(bx0 + 8, by0 + 12, bx1 - bx0, by1 - by0);
      // the span casts a soft shadow onto the water on both sides (the bridges sit above the chasm)
      for (const [ex, d] of [[bx0, -1], [bx1, 1]]) {
        const sg = g.createLinearGradient(ex, 0, ex + d * 0.75 * P, 0);
        sg.addColorStop(0, 'rgba(0,0,0,0.5)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = sg; g.fillRect(Math.min(ex, ex + d * 0.75 * P), ry0, 0.75 * P, ry1 - ry0);
      }
      g.fillStyle = '#2a3036'; g.fillRect(bx0, by1, bx1 - bx0, 0.32 * P); // side face
      g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(bx0, by1, bx1 - bx0, 3);
      const bg = g.createLinearGradient(bx0, 0, bx1, 0);
      bg.addColorStop(0, '#6a7682'); bg.addColorStop(0.5, '#a9b6c2'); bg.addColorStop(1, '#6a7682');
      g.fillStyle = bg; g.fillRect(bx0, by0, bx1 - bx0, by1 - by0);
      g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 2;
      for (let yy = by0 + 12; yy < by1; yy += 14) { g.beginPath(); g.moveTo(bx0 + 12, yy); g.lineTo(bx1 - 12, yy); g.stroke(); }
      for (const ey of [by0, by1 - 10]) for (let xx = bx0; xx < bx1; xx += 14) { g.fillStyle = ((xx - bx0) / 14) % 2 ? '#e8b923' : '#1b1b1b'; g.fillRect(xx, ey, Math.min(14, bx1 - xx), 10); } // hazard-striped ends
      for (const ex of [bx0 + 4, bx1 - 4]) {
        g.strokeStyle = '#1c2126'; g.lineWidth = 7; g.beginPath(); g.moveTo(ex, by0); g.lineTo(ex, by1); g.stroke();
        g.strokeStyle = '#b8c6d2'; g.lineWidth = 3; g.beginPath(); g.moveTo(ex, by0); g.lineTo(ex, by1); g.stroke(); // rail
        for (let yy = by0 + 4; yy < by1; yy += 18) { g.fillStyle = '#dfe8f0'; g.fillRect(ex - 3, yy, 6, 6); } // posts
      }
    }
    // deploy lines
    g.setLineDash([10, 8]); g.strokeStyle = 'rgba(120,200,255,0.45)'; g.lineWidth = 2; g.shadowColor = '#3aa8ff'; g.shadowBlur = 8;
    g.beginPath(); g.moveTo(X(-9), Y(-BAL.deployDepth)); g.lineTo(X(9), Y(-BAL.deployDepth)); g.stroke();
    g.strokeStyle = 'rgba(255,120,120,0.4)'; g.shadowColor = '#ff4a5a';
    g.beginPath(); g.moveTo(X(-9), Y(BAL.deployDepth)); g.lineTo(X(9), Y(BAL.deployDepth)); g.stroke();
    g.setLineDash([]); g.shadowBlur = 0;
    // depth pass (baked: no extra draw calls)
    // the chasm's light spills onto both banks
    for (const [yy, d] of [[ry0, -1], [ry1, 1]]) {
      const sp = g.createLinearGradient(0, yy, 0, yy + d * 2.2 * P);
      sp.addColorStop(0, `rgba(${ar.glow >> 16 & 255},${ar.glow >> 8 & 255},${ar.glow & 255},0.16)`); sp.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = sp; g.fillRect(X(-9), Math.min(yy, yy + d * 2.2 * P), 18 * P, 2.2 * P);
    }
    // the far wall of the chasm faces the camera: a lit face under the far lip, a cast shadow over the near lip
    { g.save(); g.beginPath(); g.rect(0, 0, cv.width, cv.height); for (const s of [-1, 1]) g.rect(X(s * BAL.bridgeX - BAL.bridgeW), 0, 2 * BAL.bridgeW * P, cv.height); g.clip('evenodd'); // (not over the bridges)
      const fw = g.createLinearGradient(0, ry0 + 3, 0, ry0 + 0.55 * P); fw.addColorStop(0, 'rgba(120,135,150,0.55)'); fw.addColorStop(1, 'rgba(10,14,18,0)'); g.fillStyle = fw; g.fillRect(X(-9), ry0 + 3, 18 * P, 0.55 * P);
      const cs = g.createLinearGradient(0, ry1 - 0.5 * P, 0, ry1 - 3); cs.addColorStop(0, 'rgba(0,0,0,0)'); cs.addColorStop(1, 'rgba(0,0,0,0.55)'); g.fillStyle = cs; g.fillRect(X(-9), ry1 - 0.5 * P, 18 * P, 0.5 * P - 3); g.restore(); }
    // ambient occlusion where the towers stand
    for (const sz of [-1, 1]) for (const [tx, tz, tr] of [[-BAL.tower.princess.x, BAL.tower.princess.z, 1.7], [BAL.tower.princess.x, BAL.tower.princess.z, 1.7], [0, BAL.tower.king.z, 2.2]]) {
      const cx = X(tx), cy = Y(sz * tz) + 0.25 * P, ao = g.createRadialGradient(cx, cy, tr * 0.35 * P, cx, cy, tr * P * 1.25);
      ao.addColorStop(0, 'rgba(0,0,0,0.6)'); ao.addColorStop(0.6, 'rgba(0,0,0,0.3)'); ao.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = ao; g.fillRect(cx - tr * 1.3 * P, cy - tr * 1.3 * P, tr * 2.6 * P, tr * 2.6 * P);
    }
    // faint glowing seams down each lane centre (cyan on our half, red on theirs) give the deck depth
    { g.save(); g.globalCompositeOperation = 'screen'; for (const s of [-1, 1]) for (const [z0, z1, c] of [[0.6, 15, '255,90,90'], [-15, -0.6, '60,220,255']]) { const lx = X(s * BAL.tower.princess.x), sg = g.createLinearGradient(0, Y(z1), 0, Y(z0)); sg.addColorStop(0, `rgba(${c},0)`); sg.addColorStop(0.5, `rgba(${c},0.22)`); sg.addColorStop(1, `rgba(${c},0)`); g.fillStyle = sg; g.fillRect(lx - 1.5, Math.min(Y(z0), Y(z1)), 3, Math.abs(Y(z1) - Y(z0))); } g.restore(); }
    // fine grime and wear speckle over the plates (10-15%): the deck stops reading as one flat grey
    { g.save(); let sd = 7; const R = () => ((sd = (sd * 16807) % 2147483647) / 2147483647); for (let i = 0; i < 900; i++) { const x = R() * cv.width, y = R() * cv.height, w = 2 + R() * 10, h = 1 + R() * 3; g.fillStyle = R() < 0.7 ? `rgba(0,0,0,${0.05 + R() * 0.08})` : `rgba(255,255,255,${0.03 + R() * 0.04})`; g.fillRect(x, y, w, h); } for (let i = 0; i < 26; i++) { const x = R() * cv.width, y = R() * cv.height, r = (0.6 + R() * 1.4) * P, sg = g.createRadialGradient(x, y, 0, x, y, r); sg.addColorStop(0, 'rgba(0,0,0,0.12)'); sg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = sg; g.fillRect(x - r, y - r, 2 * r, 2 * r); } g.restore(); }
    // one key light from the upper left across the whole deck
    { const kl = g.createLinearGradient(0, 0, cv.width, cv.height); kl.addColorStop(0, 'rgba(255,255,255,0.06)'); kl.addColorStop(0.55, 'rgba(0,0,0,0)'); kl.addColorStop(1, 'rgba(0,0,0,0.14)'); g.fillStyle = kl; g.fillRect(0, 0, cv.width, cv.height); }
    // the side walls: pipes and a cable tray run the length of the arena outside the bulkheads (the arena reads as a room)
    for (const s of [-1, 1]) {
      const bx = X(s * 9.55), dir = s;
      for (const [off, w, c0, c1] of [[0.25, 0.22, '#3b4652', '#141a20'], [0.55, 0.14, '#5a4a32', '#20180e'], [0.78, 0.1, '#2f5566', '#0e1d24']]) {
        const px = bx + dir * off * P, pg = g.createLinearGradient(px - w * P / 2, 0, px + w * P / 2, 0);
        pg.addColorStop(0, c1); pg.addColorStop(0.45, c0); pg.addColorStop(1, c1);
        g.fillStyle = pg; g.fillRect(px - w * P / 2, Y(FX_.z1), w * P, Y(FX_.z0) - Y(FX_.z1));
      }
      for (let z = -16; z <= 22; z += 3) { g.fillStyle = '#0b0e12'; g.fillRect(bx + dir * 0.12 * P - (dir > 0 ? 0 : 0.8 * P), Y(z) - 3, 0.8 * P, 6); } // pipe clamps
    }
    // the far bulkhead wall above the arena (fills the band behind the enemy towers)
    {
      const wy0 = Y(FX_.z1), wy1 = Y(16) - 0.55 * P, wx0 = X(-10.5), ww = 21 * P;
      const wg = g.createLinearGradient(0, wy0, 0, wy1); wg.addColorStop(0, '#0d1116'); wg.addColorStop(0.7, '#1f262e'); wg.addColorStop(1, '#2c343d');
      g.fillStyle = wg; g.fillRect(wx0, wy0, ww, wy1 - wy0);
      const wim = PROPS.wall_orca; if (wim && wim.naturalWidth) { g.save(); g.globalAlpha = 0.45; const pat = g.createPattern(wim, 'repeat'); if (pat.setTransform) pat.setTransform(new DOMMatrix().scale(0.45)); g.fillStyle = pat; g.fillRect(wx0, wy0, ww, wy1 - wy0); g.restore(); }
      g.fillStyle = 'rgba(0,0,0,0.45)'; for (let x = -10; x <= 10; x += 2.5) g.fillRect(X(x) - 2, wy0, 4, wy1 - wy0); // pillars
      const glc = `${ar.glow >> 16 & 255},${ar.glow >> 8 & 255},${ar.glow & 255}`;
      for (let x = -8.75; x <= 8.75; x += 2.5) { const lx = X(x), ly = wy1 - 0.9 * P, lg = g.createRadialGradient(lx, ly, 0, lx, ly, 0.9 * P); lg.addColorStop(0, `rgba(${glc},0.9)`); lg.addColorStop(1, `rgba(${glc},0)`); g.fillStyle = lg; g.fillRect(lx - P, ly - P, 2 * P, 2 * P); g.fillStyle = '#e8f4ff'; g.fillRect(lx - 5, ly - 2, 10, 4); }
      g.fillStyle = 'rgba(232,185,35,0.75)'; for (let x = 0; x < ww; x += 28) { g.beginPath(); g.moveTo(wx0 + x, wy1 - 10); g.lineTo(wx0 + x + 14, wy1 - 10); g.lineTo(wx0 + x + 6, wy1); g.lineTo(wx0 + x - 8, wy1); g.fill(); } // hazard skirt at its foot
      const fg = g.createLinearGradient(0, wy0, 0, wy0 + 1.5 * P); fg.addColorStop(0, 'rgba(0,0,0,0.85)'); fg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = fg; g.fillRect(wx0, wy0, ww, 1.5 * P);
    }
    // soft vignette
    const vg = g.createRadialGradient(cv.width / 2, cv.height / 2, cv.height * 0.3, cv.width / 2, cv.height / 2, cv.height * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.58)');
    g.fillStyle = vg; g.fillRect(0, 0, cv.width, cv.height);
    // a navy-steel cast over the whole deck (about 14% darker): light rigs (white hair, beige plating) no longer wash out on the plates
    g.save(); g.globalCompositeOperation = 'multiply'; g.fillStyle = '#b2bccd'; g.fillRect(0, 0, cv.width, cv.height); g.fillStyle = '#d4d8e2'; g.fillRect(0, 0, cv.width, Y(0)); g.restore();
    { g.save(); g.globalCompositeOperation = 'screen'; const lp = g.createRadialGradient(cv.width / 2, cv.height / 2, 0, cv.width / 2, cv.height / 2, cv.height * 0.42); lp.addColorStop(0, 'rgba(160,190,230,0.24)'); lp.addColorStop(1, 'rgba(150,180,220,0)'); g.fillStyle = lp; g.fillRect(0, 0, cv.width, cv.height); g.restore(); } // a soft pool of light over the middle of the deck // (the far half's warmer plates a step darker again: both halves read alike)
    // the far edges melt into the backdrop art
    g.save(); g.globalCompositeOperation = 'destination-out';
    for (const [y0, y1] of [[cv.height, cv.height - 1.6 * P]]) { const fg = g.createLinearGradient(0, y0, 0, y1); fg.addColorStop(0, 'rgba(0,0,0,1)'); fg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = fg; g.fillRect(0, Math.min(y0, y1), cv.width, 1.6 * P); }
    g.restore();
    return cv;
  }

  // hexagonal bunker drawn in screen space; returns { tex, w, h, cy } (plane size, centre height over the ground point)
  const PROPS = {}; // original battlefield props (BG_OBJ): sandbags, a supply container, iron wrecks
  function towerCanvas(type, side, dead, emblem, faction, stage) {
    const P = 64, r = BAL.tower[type].r + (type === 'bld' ? 0.35 : 0.6), E = dead ? 0.45 : TOWER_E[type]; // towers drawn with real mass
    const top = E + r * TILT + (type === 'king' && !dead ? 0.7 : 0.25), bot = -r * TILT - 0.25, half = r + 0.25;
    const cv = document.createElement('canvas');
    cv.width = Math.round(half * 2 * P); cv.height = Math.round((top - bot) * P);
    const g = cv.getContext('2d');
    const X = (x) => (x + half) * P, Y = (y) => (top - y) * P;
    const team = side === 'blue' ? ['#3aa8ff', '#9bd6ff', '#174a75'] : ['#ff4a5a', '#ffa3ab', '#741a24'];
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.beginPath(); g.ellipse(X(0.15), Y(-0.08), (r + 0.15) * P, (r + 0.15) * TILT * P, 0, 0, Math.PI * 2); g.fill();
    const V = [];
    for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; V.push([Math.cos(a) * r, Math.sin(a) * r * TILT]); }
    const wim = faction && PROPS['wall_' + faction];
    let wallPat = null;
    if (wim && wim.naturalWidth) { wallPat = g.createPattern(wim, 'repeat'); if (wallPat.setTransform) wallPat.setTransform(new DOMMatrix().scale(0.32)); }
    for (let i = 0; i < 6; i++) {
      const a = V[i], b = V[(i + 1) % 6];
      const mid = Math.PI / 6 + (i + 0.5) * Math.PI / 3;
      if (Math.sin(mid) > 0.01) continue;
      const shadeK = 0.55 + 0.35 * Math.cos(mid + 0.6);
      const c = Math.round(105 + 95 * shadeK); // light steel faces (dark walls read as holes on the bright deck)
      g.fillStyle = dead ? `rgb(${c * 0.45},${c * 0.45},${c * 0.47})` : `rgb(${c * 0.78},${c * 0.86},${c * 0.95})`;
      g.beginPath(); g.moveTo(X(a[0]), Y(a[1])); g.lineTo(X(b[0]), Y(b[1])); g.lineTo(X(b[0]), Y(b[1] + E)); g.lineTo(X(a[0]), Y(a[1] + E)); g.closePath(); g.fill();
      if (wallPat) { g.save(); g.clip(); g.globalAlpha = 0.5; g.fillStyle = wallPat; g.fill(); g.globalAlpha = 1; g.fillStyle = `rgba(0,0,0,${(0.45 - shadeK * 0.4).toFixed(2)})`; g.fill(); g.restore(); } // the faction's original wall art, lit per face
      if (!dead) {
        g.fillStyle = team[0]; g.globalAlpha = 0.85;
        g.beginPath(); g.moveTo(X(a[0]), Y(a[1] + E * 0.72)); g.lineTo(X(b[0]), Y(b[1] + E * 0.72)); g.lineTo(X(b[0]), Y(b[1] + E * 0.82)); g.lineTo(X(a[0]), Y(a[1] + E * 0.82)); g.fill();
        g.globalAlpha = 1;
        g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(X((a[0] + b[0]) / 2), Y((a[1] + b[1]) / 2 + 0.05)); g.lineTo(X((a[0] + b[0]) / 2), Y((a[1] + b[1]) / 2 + E * 0.65)); g.stroke();
        g.fillStyle = 'rgba(232,185,35,0.8)';
        g.beginPath(); g.moveTo(X(a[0]), Y(a[1])); g.lineTo(X(b[0]), Y(b[1])); g.lineTo(X(b[0]), Y(b[1] + 0.12)); g.lineTo(X(a[0]), Y(a[1] + 0.12)); g.fill();
      }
    }
    const tg = g.createLinearGradient(0, Y(E + r * TILT), 0, Y(E - r * TILT));
    tg.addColorStop(0, dead ? '#4a4d52' : '#c9d3dc'); tg.addColorStop(1, dead ? '#2c2e31' : '#8b98a5');
    g.fillStyle = tg;
    g.beginPath(); V.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y + E)) : g.moveTo(X(x), Y(y + E)))); g.closePath(); g.fill();
    if (wallPat) { g.save(); g.clip(); g.globalAlpha = dead ? 0.5 : 0.62; g.fillStyle = wallPat; g.fill(); g.restore(); } // roof plating
    if (!dead) { g.save(); g.clip(); g.globalCompositeOperation = 'overlay'; g.fillStyle = team[0]; g.globalAlpha = side === 'red' ? 0.3 : 0.55; g.fill(); g.restore(); } // the roof carries the team colour (red is stronger to the eye: less of it, so the bunker reads as steel, not a red box)
    if (!dead && type !== 'bld') { g.save(); g.strokeStyle = team[1]; g.lineWidth = 3; g.shadowColor = team[0]; g.shadowBlur = side === 'red' ? 7 : 14; g.stroke(); g.restore(); } // a lit team rim around the roof
    if (!dead && type !== 'bld' && faction === 'iron') for (const i of [0, 2, 4]) { const [vx, vy] = V[i], bx = X(vx * 0.92), by = Y(vy * 0.92 + E); const bg2 = g.createRadialGradient(bx, by, 0, bx, by, 16); bg2.addColorStop(0, 'rgba(255,90,90,1)'); bg2.addColorStop(1, 'rgba(255,40,40,0)'); g.fillStyle = bg2; g.fillRect(bx - 16, by - 16, 32, 32); g.fillStyle = '#ffd0d0'; g.beginPath(); g.arc(bx, by, 3.5, 0, Math.PI * 2); g.fill(); } // beacon lamps
    g.strokeStyle = dead ? '#1d1f22' : '#e9f0f6'; g.lineWidth = 3; g.stroke();
    if (dead) {
      g.strokeStyle = '#111'; g.lineWidth = 3;
      for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(X(0), Y(E)); g.lineTo(X(Math.cos(i * 1.3) * r * 0.9), Y(E + Math.sin(i * 1.3) * r * TILT * 0.9)); g.stroke(); }
      for (let i = 0; i < 9; i++) { g.fillStyle = i % 2 ? '#3a3d42' : '#55585e'; const x = (Math.random() - 0.5) * r * 1.6, y = (Math.random() - 0.5) * r * TILT; g.fillRect(X(x), Y(y + E + 0.1), 10 + Math.random() * 12, 8 + Math.random() * 8); }
    } else {
      g.strokeStyle = team[0]; g.lineWidth = 4; g.shadowColor = team[0]; g.shadowBlur = 12;
      g.beginPath(); g.ellipse(X(0), Y(E), r * 0.62 * P, r * 0.62 * TILT * P, 0, 0, Math.PI * 2); g.stroke();
      g.shadowBlur = 0;
      g.fillStyle = team[2]; g.globalAlpha = 0.55;
      g.beginPath(); g.ellipse(X(0), Y(E), r * 0.5 * P, r * 0.5 * TILT * P, 0, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
      if (false && type === 'king' && emblem && emblem.naturalWidth) { // (the commander badge cluttered the king's front with the sandbags; the HUD shows the commander)
        // the faction's commander on a badge set into the bunker's front corner
        const bx = X(0), by = Y(-r * TILT * 0.45 + E * 0.42), br = 0.66 * P;
        g.save();
        g.beginPath(); g.arc(bx, by, br, 0, Math.PI * 2); g.clip();
        g.drawImage(emblem, bx - br, by - br * 0.8, br * 2, br * 2);
        g.restore();
        g.strokeStyle = team[0]; g.lineWidth = 4; g.shadowColor = team[0]; g.shadowBlur = 10;
        g.beginPath(); g.arc(bx, by, br, 0, Math.PI * 2); g.stroke(); g.shadowBlur = 0;
      }
      if (type === 'king') {
        for (const sx of [-1, 1]) {
          const px = sx * r * 0.72, py = E + r * TILT * 0.35;
          g.fillStyle = '#6d7984'; g.fillRect(X(px) - 5, Y(py + 0.75), 10, 0.75 * P);
          g.fillStyle = team[0]; g.shadowColor = team[0]; g.shadowBlur = 14;
          g.beginPath(); g.arc(X(px), Y(py + 0.8), 7, 0, Math.PI * 2); g.fill(); g.shadowBlur = 0;
        }
      }
    }
    // battle damage: under half health the bunker darkens and cracks, under a quarter it is scorched and broken
    if (stage && !dead) {
      g.save(); g.globalCompositeOperation = 'source-atop';
      // (no darkening: the cracks and the fire show the damage, the tower keeps its colours)
      for (let i = 0; i < (stage === 2 ? 8 : 6); i++) {
        let x = X(rnd(-r * 0.7, r * 0.7)), y = Y(E + rnd(-r * TILT * 0.5, r * TILT * 0.5));
        const pts = [[x, y]];
        for (let k = 0; k < 4; k++) { x += rnd(-14, 14); y += rnd(8, 22); pts.push([x, y]); }
        const line = () => { g.beginPath(); pts.forEach(([px, py], j) => (j ? g.lineTo(px, py) : g.moveTo(px, py))); g.stroke(); };
        g.strokeStyle = stage === 2 ? 'rgba(255,140,50,0.9)' : 'rgba(255,230,190,0.85)'; g.lineWidth = stage === 2 ? 8 : 7; if (stage === 2) { g.shadowColor = '#ff7a20'; g.shadowBlur = 10; } line(); // a hot / lit edge
        g.shadowBlur = 0; g.strokeStyle = 'rgba(0,0,0,0.95)'; g.lineWidth = stage === 2 ? 4 : 3; line();
      }
      if (stage === 2) {
        for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(0,0,0,0.6)'; g.beginPath(); g.arc(X(rnd(-r, r)), Y(rnd(0, E)), rnd(5, 11), 0, Math.PI * 2); g.fill(); } // blown-out chunks
        g.globalCompositeOperation = 'destination-out'; g.beginPath(); const cx = X(r * 0.55), cy = Y(E + r * TILT * 0.4); g.moveTo(cx - 26, cy - 10); g.lineTo(cx + 30, cy - 24); g.lineTo(cx + 34, cy + 14); g.lineTo(cx + 8, cy + 26); g.lineTo(cx - 14, cy + 12); g.closePath(); g.fill(); // a corner of the roof is gone
        g.globalCompositeOperation = 'source-atop';
      }
      g.restore();
      // broken masonry spills onto the deck around the foot of the bunker
      for (let i = 0; i < stage * 6; i++) { const a = rnd(0.15, Math.PI - 0.15), rr = r * rnd(0.85, 1.15), bx = X(Math.cos(a) * rr), by = Y(-Math.sin(a) * rr * TILT), w = rnd(6, 13), h = rnd(4, 9); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(bx - w / 2 + 2, by - h / 2 + 3, w, h); g.fillStyle = i % 3 ? '#6b7178' : '#8a9097'; g.fillRect(bx - w / 2, by - h / 2, w, h); g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(bx - w / 2, by - h / 2, w, 2); }
    }
    // dress the bunker with the original props: iron wreckage; rubble on a ruin (orca bunkers stand clean, no cover in front)
    const prop = (im, cx, by, w) => { if (!im || !im.naturalWidth) return; const h = w * im.naturalHeight / im.naturalWidth; g.drawImage(im, X(cx) - w * P / 2, Y(by) - h * P, w * P, h * P); };
    if (dead) prop(PROPS.wreck2, 0.05, -r * TILT * 0.55, r * 1.75);
    else if (type !== 'bld' && faction !== 'orca') {
      prop(PROPS.wreck, -r * 0.68, -r * TILT * 0.62, r * 0.9);
      prop(PROPS.wreck2, r * 0.7, -r * TILT * 0.5, r * 0.8);
    }
    const tex = new THREE.CanvasTexture(cv);
    return { tex, w: half * 2, h: top - bot, cy: (top + bot) / 2 };
  }

  // a steel barricade: two armoured slabs on a sandbag footing, hazard-striped, team trim
  function wallCanvas(side) {
    const P = 64, w = 2.8, top = 1.5, bot = -0.55, half = w / 2;
    const cv = document.createElement('canvas'); cv.width = w * P; cv.height = (top - bot) * P;
    const g = cv.getContext('2d'), X = (x) => (x + half) * P, Y = (y) => (top - y) * P;
    const team = side === 'blue' ? '#3aa8ff' : '#ff4a5a';
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.ellipse(X(0.1), Y(-0.1), 1.35 * P, 0.42 * P, 0, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 7; i++) { g.fillStyle = i % 2 ? '#6b6250' : '#7b7160'; g.beginPath(); g.ellipse(X(-1.1 + i * 0.37), Y(0.08), 0.24 * P, 0.14 * P, 0, 0, Math.PI * 2); g.fill(); }
    for (const [x0, lean] of [[-1.15, -0.08], [0.05, 0.08]]) {
      const x1 = x0 + 1.1;
      const gr = g.createLinearGradient(X(x0), 0, X(x1), 0); gr.addColorStop(0, '#8b98a5'); gr.addColorStop(0.5, '#b9c4cf'); gr.addColorStop(1, '#6d7984');
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(X(x0), Y(0.15)); g.lineTo(X(x1), Y(0.15)); g.lineTo(X(x1 + lean), Y(1.3)); g.lineTo(X(x0 + lean), Y(1.3)); g.closePath(); g.fill();
      g.strokeStyle = '#2a3038'; g.lineWidth = 3; g.stroke();
      g.save(); g.clip();
      for (let k = -6; k < 12; k++) { g.fillStyle = k % 2 ? '#e8b923' : '#1b1b1b'; g.beginPath(); const sx = X(x0) + k * 12; g.moveTo(sx, Y(0.45)); g.lineTo(sx + 12, Y(0.45)); g.lineTo(sx + 24, Y(0.25)); g.lineTo(sx + 12, Y(0.25)); g.fill(); }
      g.restore();
      g.fillStyle = team; g.fillRect(X(x0 + lean) + 4, Y(1.25), (x1 - x0) * P - 8, 5);
      g.fillStyle = 'rgba(0,0,0,0.35)'; for (const by of [0.7, 1.05]) for (const bx of [0.18, 0.92]) { g.beginPath(); g.arc(X(x0 + bx + lean * by), Y(by), 3, 0, Math.PI * 2); g.fill(); }
    }
    return { tex: new THREE.CanvasTexture(cv), w, h: top - bot, cy: (top + bot) / 2 };
  }

  const quadGeo = new THREE.PlaneGeometry(1, 1);
  function quad(tex, color, opacity, add, order) {
    const m = new THREE.Mesh(quadGeo, new THREE.MeshBasicMaterial({
      map: tex || null, color: color == null ? 0xffffff : color, transparent: true, opacity: opacity == null ? 1 : opacity,
      depthTest: false, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending,
    }));
    m.renderOrder = order || 0;
    return m;
  }

  // ── rigs ──────────────────────────────────────────────
  const isIron = (rig) => rig.startsWith('e_');
  const placeholderTex = {};
  const TINTS = [[0.95, 0.95, 0.95], [0.55, 0.85, 1.3], [1.55, 1.5, 1.5], [1.1, 1.1, 0.6], [1.2, 0.8, 0.8], [1.2, 1.05, 0.8]];
  const animCache = {};
  function animInfo(rig, c, clipName = 'atk') {
    const key = rig + ':' + clipName;
    if (animCache[key]) return animCache[key];
    const clip = c.tpl.data.clips[clipName];
    const dur = clip ? clip.dur : 1;
    const ev = window.ANIM_EV && ANIM_EV[rig] && ANIM_EV[rig][clipName];
    let shots = [], fire = [];
    if (ev) ev.t.forEach((t, i) => { if (t < dur) { shots.push(t); fire.push(ev.f ? ev.f[i] : 1); } });
    if (!shots.length) { shots = [dur * 0.45]; fire = [1]; }
    if (shots.length > 6) {
      const n = shots.length, idx = [0, 1, 2, 3, 4, 5].map((i) => Math.round(i * (n - 1) / 5));
      shots = idx.map((i) => shots[i]); fire = idx.map((i) => fire[i]);
    }
    const w0 = Math.max(0, shots[0] - 0.35);
    let w1 = Math.min(dur, shots[shots.length - 1] + 0.3);
    if (w1 - w0 < 0.45) w1 = Math.min(dur, w0 + 0.45);
    return (animCache[key] = { dur, shots, fire, w0, w1, len: w1 - w0 });
  }

  function attachRig(e, rig, k, h, pooled) {
    const c = SD.ready(rig) ? (pooled ? SD.acquire(rig) : SD.create(rig)) : null;
    if (!c) {
      // the rig failed to load: the card portrait stands in (timer-driven attacks)
      e.bodyH = h || 1.5; e.fxk = 0.2; e.natural = 1; e.rig = null;
      const src = e.card && window.IMG && IMG[e.card.img];
      if (src && e.holder) {
        const tx = placeholderTex[src] || (placeholderTex[src] = new THREE.TextureLoader().load(src));
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, depthTest: false, transparent: true }));
        sp.scale.set(1.3, 1.3, 1); sp.position.y = 0.75; sp.renderOrder = L.UNIT;
        e.holder.add(sp);
        e.placeholder = sp;
      }
      e.anim = { dur: 1, shots: [0.45], fire: [1], w0: 0, w1: 1, len: 1 };
      e.speedK = 1; e.dmgK = 1;
      return;
    }
    const t = SD.template(rig);
    let s;
    if (isIron(rig)) {
      s = (h || 1.5) / t.height;
      c.root.position.set(-(t.box.min.x + t.box.max.x) / 2 * s, -t.box.min.y * s, 0);
      e.bodyH = h || 1.5;
      e.fxk = IRON_FXK * (h || 1.5) / 1.6;
    } else {
      s = SD_K * (k || 1);
      c.root.position.set(-c.W[9] * s, -c.W[10] * s, 0);
      e.bodyH = BODY * s;
      e.fxk = s;
    }
    c.root.scale.set(s, s, 1);
    c.setTint(0.95, 0.95, 0.95);
    c.deferPose = true; // the sim advances clip time; render() evaluates the pose once per frame
    e.holder.add(c.root);
    e.sd = c; e.pooled = !!pooled; e.rig = rig;
    e.natural = isIron(rig) ? -1 : 1; // which way the rig faces at scale +1
    e.anim = animInfo(rig, c);
    if (e.atk) {
      e.speedK = clamp(e.anim.len / e.atk.rate, 0.45, 3.2);
      e.dmgK = (e.anim.len / e.speedK) / e.atk.rate; // a clamped animation keeps the listed damage per second
    }
  }

  function setClip(e, name, speed) {
    const c = e.sd;
    if (!c) return;
    if (c.clipName !== name) { c.play(name, null, name !== 'die'); if (name === 'atk') { c.time = e.anim.w0; c.poseDirty = true; } }
    if (speed != null) c.speed = speed;
  }

  // attack loop: the clip's firing window repeats; every shot event crossed fires (the first one carries the damage)
  function attackTick(e, dt) {
    const c = e.sd, a = e.anim;
    const haste = e.hasteT > 0 ? e.hasteK || 1 : 1;
    if (e.dagger) { // a dagger tower: fast throws while it has daggers, slow ones when empty
      if (c) { const k = e.atkClip || 'atk'; if (c.clipName !== k) setClip(e, k); c.speed = e.ammo > 0 ? 1.8 : 1; c.update(dt); if (k === 'atk' && a && c.time >= a.w1) c.time = a.w0; }
      e.cd -= dt * haste * e.slowK;
      if (e.cd <= 0) { fire(e, true, (a && a.fire[0]) || 1); if (e.ammo > 0) { e.ammo--; e.cd = e.dagger.fast; } else e.cd = e.dagger.slow; }
      return;
    }
    if (!c) { e.cd -= dt * haste; if (e.cd <= 0) { e.cd = e.atk.rate; fire(e, true, 1); } return; }
    if (c.clipName !== 'atk') setClip(e, 'atk');
    c.speed = e.speedK * e.slowK * haste;
    const t0 = c.time;
    c.update(dt);
    let t1 = c.time;
    if (t1 < t0) t1 += a.dur; // looped by the rig itself
    for (let i = 0; i < a.shots.length; i++) if (a.shots[i] > t0 && a.shots[i] <= t1) fire(e, i === 0, a.fire[i]);
    if (t1 >= a.w1) {
      const nt = a.w0 + Math.min(a.len, t1 - a.w1);
      for (let i = 0; i < a.shots.length; i++) if (a.shots[i] > a.w0 && a.shots[i] <= nt) fire(e, i === 0, a.fire[i]);
      c.time = nt;
    }
  }

  // ── original effects (baked from the Unity prefabs, js/fxbake.js) ──
  const origCache = {};
  const FX_MOBILE_MAX = 1200000;
  const fxOk = (n) => !!n && (!MOBILE || !FX_META.size || (FX_META.size[n] || 0) <= FX_MOBILE_MAX);
  // characters without a projectile of their own (Iron Blood, towers) borrow an original one that fits the attack
  const BORROW = {
    bullet: 'FX_Leprechaun_bullet', snipe: 'hand_gun_shot', grenade: 'Gnome_bullet', missile: 'rpg_bullet_fx', fireball: 'Phoenix_skill1_bullet',
    holy: 'Azazel_skill1_bullet', frost: 'Undine_skill1_bullet', bomb: 'Sleipnir_bullet',
  };
  // rig (+ attack style) -> { bullet, hit, statics } from its attack clip's events, else a borrowed projectile
  function origFor(rig, fx) {
    const key = rig + '|' + (fx || '');
    if (key in origCache) return origCache[key];
    let o = null;
    const M = window.FX_META;
    if (M) {
      const pick = (kind) => Object.entries(M.uses).filter(([, us]) => us.some(([uid, c, fn]) => uid === rig && c === 'atk' && fn.startsWith(kind))).map(([n]) => n);
      const b = pick('EventThrowProjectile').find((n) => M.meta[n] && M.meta[n].type >= 0 && fxOk(n)) || null;
      const statics = pick('EventThrowEffect').filter(fxOk);
      if (b || statics.length) o = { bullet: b, hit: b && fxOk(M.meta[b].hit) ? M.meta[b].hit : '', statics };
      const bb = BORROW[fx];
      if ((!o || !o.bullet) && bb && M.meta[bb] && fxOk(bb)) {
        o = o || { statics: [] };
        o.bullet = bb; o.hit = fxOk(M.meta[bb].hit) ? M.meta[bb].hit : '';
      }
    }
    return (origCache[key] = o);
  }
  // attack styles without an original effect borrow a fitting baked hit
  const GENERIC_HIT = {
    bullet: 'skill_hit_simple', snipe: 'hnadgun_hit', grenade: 'simple_explosion', missile: 'simple_explosion',
    fireball: 'Phoenix_skill1_hit', holy: 'Azazel_skill1_Hit_m', claw: 'valkyrie_Hit_skill1', slash: 'KunoicheZero_skill1_bullet_hit',
    cannon: 'RPG_skill2_hit', bomb: 'Sleipnir_hit', frost: 'Undine_skill1_Hit', laser: 'Constantia_hit', lightning: '', wave: '', flame: '',
  };
  const SPELL_FX = { fireball: ['RPG_skill2_hit', 'simple_explosion'], zap: ['Raven_skill1_Hit'], freeze: ['Titania_skill1_Ground_ice', 'Titania_skill1_Ground_ice_smoke'] };
  const SKILL_FX = { nova: 'RPG_skill2_hit', barrage: 'simple_explosion', storm: 'Raven_skill1_Hit', laser: 'Constantia_hit', dash: 'valkyrie_Hit_skill2', summon: 'skill_hit_simple', shield: 'Thetis_Skill2_Chaff_Hit', haste: 'Kunoichi_skill2_after_Lighting' };
  // the champion's own skill effect from the original skill clip (an effect event, else its projectile's hit)
  // champions whose original skill impact was baked for this game (tools/fxbake): [effect, scale] — kept modest so the small units stay readable
  const OWN_SKILL = {
    empress: ['Empress_skill1_ice_Hit', 0.2], labiata: ['Labiata_buff_skill1_hit', 0.2], fafnir: ['vfx_fafnir_ns1_hit_last', 0.2],
    sleipnir: ['Sleipnir_skill1_last_hit', 0.22], tiamat: ['vfx_Tiamet_NS3_skill1_bullet_Hit', 0.24], titania: ['Titania_skill1_hit', 0.2],
    e_Nidhogg_N: ['nidhogg_skill1_hit', 0.2], e_Juggernaut_N: ['Juggernaut_skill2_last_hit', 0.16], e_Executioner_EW: ['Executioner_skill1_Hit', 0.14],
    e_EmperorChick_N: ['EmperorChick_skill2_hit', 0.2], e_Goltarion_N: ['Goltarion_N_Skill1_A', 0.22],
  };
  const skillFxK = (u) => (OWN_SKILL[u.card.rig] && OWN_SKILL[u.card.rig][0] === skillFxFor(u.card.rig) ? OWN_SKILL[u.card.rig][1] : u.fxk * 1.2);
  const skillFxCache = {};
  function skillFxFor(rig) {
    if (rig in skillFxCache) return skillFxCache[rig];
    if (OWN_SKILL[rig] && window.FX_META && FX_META.meta[OWN_SKILL[rig][0]] && fxOk(OWN_SKILL[rig][0])) return (skillFxCache[rig] = OWN_SKILL[rig][0]);
    const M = window.FX_META;
    let n = null;
    if (M) {
      const used = Object.entries(M.uses).filter(([, us]) => us.some(([uid, c]) => uid === rig && c === 'skill')).map(([k]) => k);
      n = used.find((k) => M.meta[k] && M.meta[k].type < 0 && fxOk(k)) || null;
      if (!n) { const b = used.find((k) => M.meta[k] && M.meta[k].type >= 0); if (b && fxOk(M.meta[b].hit) && M.meta[b].hit !== 'noHit_m') n = M.meta[b].hit; }
    }
    return (skillFxCache[rig] = n);
  }
  function fxNamesFor(c) {
    const out = new Set();
    if (c.type === 'spell') (SPELL_FX[c.spell] || []).forEach((n) => out.add(n));
    else if (c.type === 'building') {
      if (GENERIC_HIT[c.fx]) out.add(GENERIC_HIT[c.fx]);
      const o = c.fx && origFor(c.guard.rig, c.fx);
      if (o) [o.bullet, o.hit].forEach((n) => n && out.add(n));
      if (c.spawn) fxNamesFor(CARD[c.spawn.card]).forEach((n) => out.add(n));
    } else {
      const o = origFor(c.rig, c.fx);
      if (o) [o.bullet, o.hit, ...o.statics].forEach((n) => n && out.add(n));
      if (GENERIC_HIT[c.fx]) out.add(GENERIC_HIT[c.fx]); // contact / beam / chain hits always use it
      if (c.skill && SKILL_FX[c.skill.kind]) out.add(SKILL_FX[c.skill.kind]);
      if (c.skill && c.skill.freeze) out.add('Titania_skill1_Ground_ice');
      if (c.skill && skillFxFor(c.rig)) out.add(skillFxFor(c.rig));
      if (c.skill && c.skill.pillar) out.add('Azazel_skill1_Hit_m');
    }
    return [...out].filter(fxOk);
  }
  const FX_MAX = MOBILE ? 40 : 110;
  const fxRoom = () => G.bfx.length + G.sfx.length < FX_MAX;
  function spawnStatic(name, x, y, k, face = 1, order = L.FX) {
    if (!name || !FXB.ready(name) || !fxRoom()) return false;
    const inst = FXB.create(name);
    if (!inst) return false;
    inst.root.position.set(x, y, 0);
    inst.root.scale.set(k * face, k, 1);
    inst.setOrder(order);
    scene.add(inst.root);
    G.sfx.push(inst);
    return true;
  }
  // Projectile.cs trajectories (LINE / CURVE / HOWITZER / CANNON) as Bezier curves along the shot
  function origPath(b, f) {
    const sx = b.sx, sy0 = b.sy, ex = b.ex, ey = b.ey;
    const d = Math.hypot(ex - sx, ey - sy0);
    if (b.type <= 0) return [sx + (ex - sx) * f, sy0 + (ey - sy0) * f, ex - sx, ey - sy0];
    const fx = (ex - sx) / (d || 1), fy = (ey - sy0) / (d || 1);
    let nx = -fy, ny = fx;
    if (ny < 0 || (ny === 0 && nx * (ex - sx) < 0)) { nx = -nx; ny = -ny; }
    let a1, h1, a2, h2;
    if (b.type === 1) { a1 = a2 = 0.5; h1 = h2 = b.h; } else { const r = b.type === 2 ? 0.5 : 0.3; a1 = r * 0.7; h1 = h2 = r * 0.7; a2 = b.type === 2 ? a1 : 1 - a1; }
    const c1x = sx + (fx * a1 + nx * h1) * d, c1y = sy0 + (fy * a1 + ny * h1) * d;
    const c2x = sx + (fx * a2 + nx * h2) * d, c2y = sy0 + (fy * a2 + ny * h2) * d;
    const m = 1 - f;
    return [m * m * m * sx + 3 * m * m * f * c1x + 3 * m * f * f * c2x + f * f * f * ex,
      m * m * m * sy0 + 3 * m * m * f * c1y + 3 * m * f * f * c2y + f * f * f * ey,
      3 * m * m * (c1x - sx) + 6 * m * f * (c2x - c1x) + 3 * f * f * (ex - c2x),
      3 * m * m * (c1y - sy0) + 6 * m * f * (c2y - c1y) + 3 * f * f * (ey - c2y)];
  }

  // ── muzzles: where the original fires from (from 5_LAO_Defence) ──
  const _mv = new THREE.Vector3(), _mq = new THREE.Quaternion(), _ms = new THREE.Vector3();
  function fireAnchor(t, ch) {
    const N = t.data.nodes;
    const chainOk = (i, k) => { for (let j = k; j < ch.length && i >= 0; j++, i = N[i].p) if (N[i].n !== ch[j][0]) return false; return true; };
    for (let k = 0; k < ch.length; k++) {
      const cand = [];
      N.forEach((nd, i) => { if (nd.n === ch[k][0] && chainOk(i, k)) cand.push(i); });
      if (!cand.length) continue;
      const p = new THREE.Vector3();
      for (let j = 0; j < k; j++) {
        const [, Tt, Q, Sc] = ch[j];
        p.multiply(_ms.set(Sc[0], Sc[1], Sc[2])).applyQuaternion(_mq.set(Q[0], Q[1], Q[2], Q[3])).add(_mv.set(Tt[0], Tt[1], Tt[2]));
      }
      return { cand, p: [p.x, p.y, -p.z] };
    }
    return null;
  }
  function muzzleAt(u, ix, px, py, pz) {
    const W = u.sd.W, i = ix * 12;
    _mv.set(W[i] * px + W[i + 3] * py + W[i + 6] * pz + W[i + 9], W[i + 1] * px + W[i + 4] * py + W[i + 7] * pz + W[i + 10], W[i + 2] * px + W[i + 5] * py + W[i + 8] * pz + W[i + 11]);
    return u.sd.root.localToWorld(_mv);
  }
  const WEAPON = /gun|rifle|revolver|pistol|cannon|launcher|bazooka|weapon|barrel/i;
  function weaponTip(u, ix, p) {
    const sd = u.sd, t = sd.tpl, N = t.data.nodes, W = sd.W;
    const ws = t.weapons || (t.weapons = t.rends.map((r, k) => (r.kind === 0 && WEAPON.test(N[r.node].n) ? k : -1)).filter((k) => k >= 0));
    if (!ws.length) return null;
    const i0 = ix * 12;
    const ax = W[i0] * p[0] + W[i0 + 3] * p[1] + W[i0 + 9], ay = W[i0 + 1] * p[0] + W[i0 + 4] * p[1] + W[i0 + 10];
    let best = null, bd = Infinity;
    for (const k of ws) {
      const r = t.rends[k];
      if (!sd.EA[r.node] || !sd.rEn[k] || sd.rCol[k * 4 + 3] < 0.1) continue;
      const sp = t.sprites[sd.rKey[k]];
      if (!sp || !sp.gv) continue;
      const i = r.node * 12, gv = sp.gv;
      let tx = 0, ty = 0, mx = -Infinity;
      for (let j = 0; j < gv.length; j += 2) {
        const x = W[i] * gv[j] + W[i + 3] * gv[j + 1] + W[i + 9], y = W[i + 1] * gv[j] + W[i + 4] * gv[j + 1] + W[i + 10];
        if (x > mx) { mx = x; tx = x; ty = y; }
      }
      const d = (tx - ax) ** 2 + (ty - ay) ** 2;
      if (d < bd) { bd = d; best = [tx, ty]; }
    }
    if (!best) return null;
    _mv.set(best[0], best[1], 0);
    sd.root.localToWorld(_mv);
    return [_mv.x, _mv.y];
  }
  function frontOf(e) {
    const base = e.kind === 'tower' ? e.z * TILT + TOWER_E[e.type] * 0.92 : sy(e);
    return [e.x + e.face * e.bodyH * 0.22, base + e.bodyH * 0.55];
  }
  function muzzle(e, n) {
    const front = frontOf(e);
    const ev = window.ANIM_EV && e.rig && ANIM_EV[e.rig];
    const ch = n > 0 && ev && ev.fire && (ev.fire[n] || ev.fire[1]);
    if (!ch || !e.sd) return front;
    const t = e.sd.tpl, fp0 = t.fire || (t.fire = {});
    const key = ev.fire[n] ? n : 1;
    if (!(key in fp0)) fp0[key] = fireAnchor(t, ch);
    const fp = fp0[key];
    if (!fp) return front;
    e.sd.pose(); // bring the deferred pose up to this sim step before reading bone matrices
    const ea = e.sd.EA, ix = fp.cand.find((c) => !ea || ea[c]) ?? fp.cand[0];
    e.holder.updateMatrixWorld(true);
    if (t.data.nodes[ix].p < 0 || /^(size_root|model_|fx$)/i.test(t.data.nodes[ix].n)) {
      const tip = weaponTip(e, ix, fp.p);
      if (tip) return tip;
    }
    const bodyY = front[1] - e.bodyH * 0.55;
    const behind = (v) => (v.x - e.x) * e.face < -0.2 * e.bodyH || v.y < bodyY - 0.3;
    let v = muzzleAt(e, ix, fp.p[0], fp.p[1], fp.p[2]);
    if (behind(v)) v = muzzleAt(e, ix, -fp.p[0], fp.p[1], fp.p[2]);
    return behind(v) ? front : [v.x, v.y];
  }

  // ── entities ──────────────────────────────────────────
  function makeBar(w, color) {
    const bg = FX.sprite({ x: 0, y: -99, size: w + 0.1, aspect: 0.36 / (w + 0.1), color: 0x1a2129, tex: FX.tex.white, normal: true, order: L.BAR, alpha: 0.95 });
    const fill = FX.sprite({ x: 0, y: -99, size: w, aspect: 0.26 / w, color, tex: FX.tex.white, normal: true, order: L.BAR + 1, alpha: 1 });
    const ol = FX.sprite({ x: 0, y: -99, size: w + 0.18, aspect: 0.44 / (w + 0.18), color: 0x05070a, tex: FX.tex.white, normal: true, order: L.BAR - 1, alpha: 0.95 }); // a crisp dark frame, like the tower plates
    const lag = FX.sprite({ x: 0, y: -99, size: w, aspect: 0.26 / w, color: 0xfff4e0, tex: FX.tex.white, normal: true, order: L.BAR + 0.5, alpha: 0.9 }); // lost health drains away behind the fill
    bg.hidden = fill.hidden = ol.hidden = lag.hidden = true;
    return { bg, fill, ol, lag, w, lagF: 1 };
  }
  function setBar(b, f, x, y, color) {
    f = clamp(f, 0, 1);
    b.bg.hidden = b.fill.hidden = b.ol.hidden = false;
    b.bg.x = b.ol.x = x; b.bg.y = b.ol.y = y;
    const w = Math.max(0.01, b.w * f);
    b.fill.sz = w; b.fill.aspect = 0.26 / w;
    b.fill.x = x - b.w / 2 + w / 2; b.fill.y = y;
    b.lagF = f >= b.lagF ? f : b.lagF + (f - b.lagF) * 0.07; // eases down over ~0.4 s
    b.lag.hidden = b.lagF - f < 0.005;
    if (!b.lag.hidden) { const lw = b.w * b.lagF; b.lag.sz = lw; b.lag.aspect = 0.26 / lw; b.lag.x = x - b.w / 2 + lw / 2; b.lag.y = y; }
    if (color != null) b.fill.color = color;
  }
  function hideBar(b) { b.bg.hidden = b.fill.hidden = b.ol.hidden = b.lag.hidden = true; }

  function lvlOf(side, card) {
    const S = G.sides[side];
    return S.levels ? (S.levels[card.id] || LEVEL.min) : S.lvl || LEVEL.min;
  }

  function spawnTroop(side, card, x, z, delay, lvl) {
    const sy = G.sides && G.sides[side] && G.sides[side].syn, bond = sy && sy.tier && card.faction === sy.faction ? sy : null; // faction bond (deck synergy)
    const lv = lvl || lvlOf(side, card), m = LEVEL.mult(lv), hm = (G.mut && G.mut.hp || 1) * (bond ? bond.hp : 1);
    const atk = Object.assign({}, card, { dmg: card.dmg * m * (bond ? bond.dmg : 1) });
    const u = {
      id: G.nextId++, kind: 'troop', side, card, atk, lv, x, z, r: card.radius, mass: card.mass, hp: card.hp * m * hm, max: card.hp * m * hm,
      air: card.air, alive: true, deployT: card.deploy + (delay || 0), deploy0: card.deploy + (delay || 0), target: null, retarget: 0,
      face: side === 'blue' ? 1 : -1, slowT: 0, slowK: 1, stunT: 0, freezeT: 0, hitT: 0, elev: 3, cd: 0, state: 'deploy',
      skillCd: card.skill ? 3 : 0, shieldT: 0, hasteT: 0, dropT: 0.28 + (delay || 0),
    };
    u.holder = new THREE.Group();
    scene.add(u.holder);
    u.shadow = FX.sprite({ x, y: z * TILT, size: Math.max(1.3, u.r * 3.8), aspect: TILT * 0.75, color: 0x000000, alpha: 0.85, tex: FX.tex.dot, normal: true, order: L.GROUND }); // a firmer contact shadow anchors units in a crowd
    u.disc = FX.sprite({ x, y: z * TILT, size: clamp(u.r * 4.8, 1.7, 3), aspect: TILT, color: teamHex(side), alpha: side === 'red' ? 0.95 : 0.75, tex: FX.tex.ring, order: L.GROUND + 2 }); // a bold team ring under every troop
    u.glow = FX.sprite({ x, y: z * TILT, size: clamp(u.r * 5.2, 1.9, 3.2), aspect: TILT, color: teamHex(side), alpha: (side === 'red' ? 0.38 : 0.42) * (u.r > 0.6 ? 0.7 : 1), /* big mechs: a capped, fainter pool that never hides the bridge */ tex: FX.tex.glow, order: L.GROUND + 1 }); // a team-coloured pool under every unit (fainter red: enemy crowds no longer smear into one red mass)
    attachRig(u, card.rig, card.k * TROOP_K * sizeK(card), card.h && card.h * TROOP_K * sizeK(card), true);
    u.fxk *= 1.4 / TROOP_K; // the original effects keep their tuned size when the troops are drawn larger (no screen-filling blooms)
    if (isIron(card.rig)) u.tintMul = 1.4;
    if (u.sd) { if (side === 'blue') u.sd.setRim(0.04, 0.1, 0.2, 0.9); else u.sd.setRim(0.62, 0.08, 0.1, 0.7); } // team outlines: cyan-white reads on the blue deck, a moderate red on the far half
    if (u.sd) { u.sd.setOpacity(0.6); u.sd.play('idle'); u.sd.time = Math.random(); }
    u.bar = makeBar(clamp(u.r * 2.6, 1.3, 2), teamHex(side)); // slim bars: small units stay the focus
    G.ents.push(u);
    return u;
  }

  function makeTower(side, type, x, z) {
    const S = G.sides[side], sp = BAL.tower[type], fac = FACTIONS[S.faction], guard = type === 'princess' && x > 0 && fac.princessR ? fac.princessR : fac[type]; // (a faction can put a different guard on the right tower)
    const DG = guard.dagger ? BAL.tower.dagger : null;
    // towers grow with the side's card levels (the deck's average for the player, the opponent's level for the AI)
    const tl = S.levels ? Math.round(S.deck.reduce((s, id) => s + (S.levels[id] || LEVEL.min), 0) / S.deck.length) : S.lvl || LEVEL.min;
    const m = LEVEL.mult(tl), hp = Math.round(sp.hp * m * (G.mut && G.mut.hp || 1) * (DG ? DG.hp : 1)); // (the titans rule toughens towers as well)
    const t = {
      id: G.nextId++, kind: 'tower', type, side, x, z, r: sp.r, hp, max: hp, air: false, alive: true, active: type !== 'king', lv: tl,
      atk: { dmg: sp.dmg * m * (DG ? DG.dmg : 1), rate: DG ? DG.fast : sp.rate, range: sp.range, hits: 'all', splash: 0, fx: guard.fx, color: guard.color, sfx: guard.sfx },
      target: null, face: side === 'blue' ? 1 : -1, slowK: 1, slowT: 0, stunT: 0, freezeT: 0, hitT: 0, cd: 0, elev: TOWER_E[type],
    };
    const tkey = side + type + S.faction;
    const tc = towerTex[tkey] || (towerTex[tkey] = towerCanvas(type, side, false, emblems[S.faction], S.faction));
    t.stage = 0; t.texKey = tkey;
    t.pad = FX.sprite({ x, y: z * TILT, size: (sp.r + 0.6) * 3.4, aspect: TILT, color: teamHex(side), alpha: side === 'red' ? 0.24 : 0.3, tex: FX.tex.glow, order: L.GROUND + 3 }); // a slow team-coloured glow under a standing tower
    t.base = quad(tc.tex, 0xffffff, 1, false, 0);
    t.base.scale.set(tc.w, tc.h, 1);
    t.base.position.set(x, z * TILT + tc.cy, 0);
    scene.add(t.base);
    t.holder = new THREE.Group();
    scene.add(t.holder);
    // the team ring on the tower top breathes (brighter while the tower is firing)
    t.aura = FX.sprite({ x, y: z * TILT + TOWER_E[type], size: (sp.r + 0.35) * 1.5, aspect: TILT, color: teamHex(side), alpha: side === 'red' ? 0.14 : 0.25, tex: FX.tex.glow, order: 1150 });
    const gk = type === 'princess' ? (isIron(guard.rig) ? 1.2 : 1.95) : (isIron(guard.rig) ? 1.1 : 1.6); // the orca bioroids are drawn up to stand as tall as the iron emplacements opposite // the orca gunners stand as large as the iron emplacements
    attachRig(t, guard.rig, guard.k * gk, guard.h && guard.h * gk, false); // a defender you can actually see on its tower
    if (isIron(guard.rig)) t.tintMul = 1.35;
    if (guard.tint) t.tintMul = guard.tint;
    if (DG) { t.dagger = DG; t.ammo = DG.ammo; t.reloadT = 0; t.dmgK = 1; t.atkClip = guard.clip || 'atk'; } // throws on its own clock (attackTick), not on its clip

    t.label = document.createElement('div');
    t.label.className = 'tlabel ' + side + ' ' + type;
    t.label.style.transform = 'translate(-999px,-999px)'; // placed by render()
    t.label.innerHTML = `<i class="bar"><i></i></i><b>${hp}</b>${type === 'king' ? '<em class="crown"></em>' : ''}${DG ? '<i class="ammo"></i>' : ''}`;
    if (DG) t.ammoEl = t.label.querySelector('.ammo');
    labelsEl.appendChild(t.label);
    if (!t.active && t.sd) t.sd.setTint(0.6, 0.6, 0.65);
    G.ents.push(t);
    G.sides[side].towers.push(t);
    return t;
  }

  function disposeEnt(e) {
    if (e.sd) { if (e.pooled) SD.release(e.sd); else e.sd.dispose(); e.sd = null; }
    if (e.placeholder) { e.placeholder.material.dispose(); e.placeholder = null; } // the texture is cached per portrait
    scene.remove(e.holder);
    [e.shadow, e.disc, e.aura, e.glow, e.halo, e.fireGlow, e.ruinGlow, e.pad].forEach((p) => p && FX.kill(p));
    if (e.base) { scene.remove(e.base); e.base.material.dispose(); }
    if (e.deadTex) e.deadTex.dispose();
    if (e.bar) { FX.kill(e.bar.bg); FX.kill(e.bar.fill); FX.kill(e.bar.ol); FX.kill(e.bar.lag); }
    if (e.label) e.label.remove();
  }

  // ── rules ─────────────────────────────────────────────
  function inTower(side, x, z, pad) {
    const S = G.sides[side];
    return S.towers.some((t) => t.alive && Math.hypot(t.x - x, t.z - z) < t.r + pad) || S.blds.some((t) => t.alive && Math.hypot(t.x - x, t.z - z) < t.r + pad);
  }
  function onBridge(x, r) { return Math.abs(Math.abs(x) - BAL.bridgeX) <= BAL.bridgeW - r * 0.35; }
  function canDeploy(side, x, z) {
    if (Math.abs(x) > 8.6 || Math.abs(z) > 15.6) return false;
    const s = SGN[side], depth = z * -s; // > 0 = over the river
    if (inTower(side, x, z, 0.35) || inTower(other(side), x, z, 0.35)) return false;
    if (depth <= -BAL.deployDepth) return true;
    const lane = x < 0 ? -1 : 1;
    const foeP = G.sides[other(side)].towers.find((t) => t.type === 'princess' && Math.sign(t.x) === lane);
    return !!(foeP && !foeP.alive && depth <= BAL.pocketDepth && (Math.abs(z) > BAL.river + 0.3 || onBridge(x, 0.4)));
  }

  const canHit = (atk, t) => t.alive && (!t.air || atk.hits === 'all');

  function nearestTower(u) {
    let best = null, bd = Infinity;
    const S = G.sides[other(u.side)];
    for (let i = 0, n = S.towers.length + S.blds.length; i < n; i++) {
      const t = i < S.towers.length ? S.towers[i] : S.blds[i - S.towers.length];
      if (!t.alive) continue;
      const d = Math.hypot(t.x - u.x, t.z - u.z) + (t.type === 'princess' && Math.sign(t.x) !== Math.sign(u.x || 1) ? 6 : 0);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  function findTarget(u) {
    if (u.card.aim === 'buildings') return nearestTower(u);
    let best = null, bd = Infinity;
    for (const e of G.ents) {
      if (e.side === u.side || !e.alive || !canHit(u.atk, e)) continue;
      const d = dist(u, e) - e.r;
      if (d > u.card.sight) continue;
      if (d < bd) { bd = d; best = e; }
    }
    return best || nearestTower(u);
  }

  // route for ground troops: the chasm is crossed on the nearest bridge
  function waypoint(u, tx, tz) {
    const R = BAL.river, B = BAL.bridgeX;
    const s0 = u.z < 0 ? -1 : 1, s1 = tz < 0 ? -1 : 1;
    const bx = Math.abs(u.x - B) < Math.abs(u.x + B) ? B : -B;
    if (Math.abs(u.z) <= R + 0.2) return Math.abs(tz) > R + 0.5 ? [bx, s1 * (R + 0.9)] : null;
    if (s0 === s1) return null;
    if (Math.abs(u.x - bx) < BAL.bridgeW - u.r * 0.6 && Math.abs(u.z) < R + 1.4) return [clamp(u.x, bx - 0.4, bx + 0.4), s1 * (R + 0.9)];
    return [bx, s0 * (R + 0.6)];
  }

  function moveToward(u, tx, tz, dt) {
    let wx = tx, wz = tz;
    if (!u.air && !u.card.jump) { const w = waypoint(u, tx, tz); if (w) { wx = w[0]; wz = w[1]; } }
    const dx = wx - u.x, dz = wz - u.z, L2 = Math.hypot(dx, dz);
    const step = Math.min(L2, u.card.speed * (G.mut && G.mut.speed || 1) * u.slowK * (u.hasteT > 0 ? u.hasteK || 1 : 1) * dt);
    if (L2 > 1e-4) { u.x += dx / L2 * step; u.z += dz / L2 * step; }
    if (Math.abs(dx) > 0.15) u.face = dx > 0 ? 1 : -1;
  }

  // ── commander support (owner-approved): one call per match, charged over time and by the damage your towers take ──
  const SUPPORT_TIME = 75; // seconds of play to charge it without taking damage
  const SUPPORT = {
    orca: { name: '긴급 수리', desc: '모든 아군 타워 체력 15% 회복 · 에너지 +2' },
    lemonade: { name: '긴급 수리', desc: '모든 아군 타워 체력 15% 회복 · 에너지 +2' },
    iron: { name: '군단 호출', desc: '킹 타워 앞에 드론 편대 투입' },
  };
  const supOut = {}, skOut = {};
  const supportReady = (S) => !!(S && S.sup && !S.sup.used && S.sup.charge >= 1);
  function useSupport(side) {
    const S = G.sides && G.sides[side];
    if (G.phase !== 'play' || !supportReady(S)) return false;
    S.sup.used = true;
    const king = S.towers.find((t) => t.type === 'king'), fz = king ? king.z - SGN[side] * 2.6 : SGN[side] * 10;
    if (S.faction === 'iron') {
      // a target mark first, then each drone streaks down onto it with a dust puff
      for (let i = 0; i < 3; i++) {
        const dx = (i - 1) * 1.8, dl = 0.35 + i * 0.12;
        FX.groundRing(dx, fz * TILT, 0.2, 1.1, 0xff5a6a, 0.7, 0.4);
        spawnTroop(side, CARD.drone, dx, fz, dl);
        for (let k = 0; k < 4; k++) FX.later(dl - 0.12 + k * 0.03, () => FX.particle({ x: dx + rnd(-0.15, 0.15), y: fz * TILT + 6 - k * 1.2, vy: -16, life: 0.22, size: 0.34, size1: 0.1, color: 0xff8a90, tex: FX.tex.dot }));
        FX.later(dl + 0.28, () => { for (let k = 0; k < 6; k++) { const a = rnd(0, 6.28); FX.particle({ x: dx, y: fz * TILT, vx: Math.cos(a) * 1.6, vy: Math.sin(a) * 0.8, life: 0.5, size: 0.3, size1: 0.6, color: 0x8a7f74, alpha: 0.5, tex: FX.tex.dot }); } });
      }
      FX.groundRing(0, fz * TILT, 0.4, 3.4, 0xff5a6a, 0.6, 0.9);
      SFX.play('missile', 0.6);
    } else {
      for (const t of S.towers) if (t.alive) {
        t.hp = Math.min(t.max, t.hp + t.max * 0.15);
        FX.groundRing(t.x, t.z * TILT, 0.4, 3.2, 0x7dffb0, 0.7, 0.9);
        for (let i = 0; i < 14; i++) FX.particle({ x: t.x + rnd(-1.1, 1.1), y: t.z * TILT + rnd(0, 2.4), vy: rnd(1.2, 2.4), life: rnd(0.6, 1.1), size: 0.3, size1: 0, color: i % 3 ? 0x9fffc8 : 0xffffff, tex: FX.tex.dot });
        { const q = toScreen(t.x, t.z * TILT + TOWER_E[t.type] + 0.6); UI.healNum(q[0], q[1], '+' + Math.round(t.max * 0.15)); }
      }
      S.elixir = Math.min(BAL.elixirMax, S.elixir + 2);
      SFX.play('reinforce', 0.7);
    }
    UI.banner(`${side === 'blue' ? '' : '적 '}지휘관 지원 · ${SUPPORT[S.faction].name}`, side === 'blue' ? 'good' : 'bad');
    G.hitStop = Math.max(G.hitStop || 0, 0.06); FX.shake(0.08); // the call lands with a beat
    if (side !== 'blue') { SFX.play('warning', 0.5); say('ann:bossalert', 1, 3); } // the opponent's call is heard, not only read
    logEvent(`지휘관 지원: ${SUPPORT[S.faction].name}`, side, 'support');
    return true;
  }
  // the opponent calls its support when it matters: repairs once a tower is hurt, reinforcements a moment after they are ready
  function aiSupport(S) {
    if (S.faction !== 'iron') { if (S.towers.some((t) => t.alive && t.hp < t.max * 0.7)) useSupport(S.side); }
    else if ((S.sup.readyT = (S.sup.readyT || G.time)) && G.time - S.sup.readyT > 2.5) useSupport(S.side);
  }

  function damage(t, amt, src) {
    // once the match is decided, shots still in flight are only visuals
    if (!t.alive || amt <= 0 || G.phase !== 'play') return;
    if (t.shieldT > 0) amt *= t.card.skill.k;
    t.hp -= amt;
    t.hitT = 0.1;
    if (t.kind === 'tower' && t.type !== 'bld') { t.dmgAcc = (t.dmgAcc || 0) + Math.min(amt, t.hp + amt); const so = G.sides[t.side].sup; if (so && !so.used) so.charge = Math.min(1, so.charge + amt / 2500); } // floating numbers (render); a battered side charges its support faster
    else if (t.kind === 'troop' && amt >= 120 && G.time - (t.numT || -1) > 0.4) { t.numT = G.time; const q = toScreen(t.x + rnd(-0.2, 0.2), sy(t) + (t.bodyH || 1.5) + 0.2); UI.dmgNum(q[0], q[1], Math.round(amt), t.side); } // heavy blows on troops pop a number too
    if (G.stats && src && src.side) {
      const st = G.stats[src.side], d = Math.min(amt, t.hp + amt);
      st.dmg += d;
      if (src.card) st.by[src.card.id] = (st.by[src.card.id] || 0) + d;
    }
    if (t.kind === 'tower' && t.type === 'king' && !t.active) activateKing(t);
    if (t.hp <= 0) kill(t, src);
  }

  function activateKing(k) {
    if (k.active || !k.alive) return;
    k.active = true;
    if (k.sd) { k.sd.setTint(0.95, 0.95, 0.95); k.sd.play('skill', null, false); }
    FX.ring(k.x, k.z * TILT + 1, 0.5, 3.4, teamHex(k.side), 0.6);
    FX.groundRing(k.x, k.z * TILT, 0.5, 3.4, teamHex(k.side), 0.7);
    SFX.play('charge', 0.6);
    if (k.side === 'blue') UI.toast('킹 타워 가동!');
  }

  function kill(e, src) {
    e.alive = false;
    e.hp = 0;
    if (e.kind === 'troop') {
      e.dieT = 0;
      const clip = e.sd && e.sd.tpl.data.clips.die;
      e.dieDur = clamp(clip ? clip.dur : 1, 0.8, 1.8); // long death clips are cut (with a fade), short ones hold their end
      if (e.sd) { e.sd.setOpacity(1); e.sd.speed = 1; e.sd.play('die', () => { if (e.sd) e.sd.root.visible = false; }, false); }
      // a champion killed mid-cast gets its skill energy back
      if (e.casting > 0 && !e.skillFired && e.card.skill) G.sides[e.side].elixir = Math.min(BAL.elixirMax, G.sides[e.side].elixir + skillCost(e));
      e.casting = 0;
      hideBar(e.bar);
      { // a fall reads at a glance: a flash of the team colour and a puff of dust where it went down
        const fy = sy(e) + (e.bodyH || 1.4) * 0.45;
        FX.particle({ x: e.x, y: fy, life: 0.25, size: 0.4, size1: (e.bodyH || 1.4) * 1.3, color: teamHex(e.side), tex: FX.tex.glow, alpha: 0.7 });
        FX.groundRing(e.x, e.z * TILT, 0.2, Math.max(0.8, e.r * 2.6), teamHex(e.side), 0.35, 0.7);
        for (let k = 0; k < 6; k++) FX.particle({ x: e.x + rnd(-0.35, 0.35), y: e.z * TILT + rnd(0, 0.3), vx: rnd(-0.6, 0.6), vy: rnd(0.3, 0.9), life: rnd(0.5, 0.8), size: 0.35, size1: 1.1, color: 0x8a96a3, alpha: 0.45, normal: true, frames: FX.sheets.smoke, order: L.LOW });
      }
      if (!e.air) scorch(e.x, e.z * TILT, e.r * 1.1); // a mark stays where it fell
      const y = sy(e) + e.bodyH * 0.35;
      if (isIron(e.card.rig)) {
        if (!spawnStatic('simple_explosion', e.x, y, e.fxk * 0.45)) FX.explosion(e.x, y, 0.5, 0xff8a40);
        FX.sparks(e.x, y, 0xffa040, 6, 3, 0.12, 0.4);
        // a mech dies in two beats: a secondary pop a moment later, then a slow plume of black smoke and thrown plates
        const ex = e.x, ey = y, big = clamp(e.r * 1.4, 0.6, 1.4);
        if (e.r >= 0.6 && !e.air) FX.later(0.4, () => crater(ex, e.z * TILT, e.r * 2.6, Math.random() < 0.5 ? 'wreck' : 'wreck2'));
        FX.later(0.22, () => { FX.particle({ x: ex + rnd(-0.2, 0.2), y: ey + 0.2, life: 0.18, size: 0.3 * big, size1: 0.9 * big, color: 0xffd090, tex: FX.tex.glow, alpha: 0.9 }); FX.sparks(ex, ey + 0.2, 0xffc060, 5, 3.5, 0.1, 0.35); FX.shake(0.05); });
        for (let i = 0; i < 3; i++) FX.particle({ x: ex + rnd(-0.25, 0.25), y: ey + 0.1, vx: rnd(-0.2, 0.2), vy: rnd(0.5, 0.9), life: rnd(1.4, 2), size: 0.4 * big, size1: 1.6 * big, color: 0x2a2a2c, alpha: 0.55, normal: true, frames: FX.sheets.smoke, spin: rnd(-1, 1), fadeIn: 0.15, order: L.FX - 1 });
        for (let i = 0; i < 4; i++) { const a = rnd(0.35, Math.PI - 0.35), v = rnd(2.5, 4.5); FX.particle({ x: ex, y: ey, vx: Math.cos(a) * v, vy: Math.sin(a) * v, grav: 11, life: rnd(0.5, 0.75), size: 0.16, size1: 0.12, color: 0x5d646c, tex: FX.tex.dot, normal: true, spin: rnd(-6, 6) }); }
      } else {
        // a bioroid is pulled out in a column of light: a ring, rising motes in the team colour, a soft flash
        FX.particle({ x: e.x, y, life: 0.5, size: 0.6, size1: 1.6, color: teamHex(e.side), tex: FX.tex.glow, alpha: 0.6 });
        FX.groundRing(e.x, e.z * TILT, 0.2, 1.6, teamHex(e.side), 0.5, 0.9);
        for (let i = 0; i < 10; i++) FX.particle({ x: e.x + rnd(-0.4, 0.4), y: y + rnd(-0.3, 0.5), vy: rnd(1.2, 2.6), life: rnd(0.5, 0.9), size: rnd(0.12, 0.22), size1: 0, color: i % 2 ? 0xffffff : teamHex(e.side), tex: FX.tex.dot });
        FX.sparks(e.x, y, 0xffffff, 5, 2.2, 0.1, 0.4);
        FX.particle({ x: e.x, y: e.z * TILT + 1.2, vy: 1.5, life: 0.6, size: 0.5, size1: 0.2, aspect: 6, color: teamHex(e.side), tex: FX.tex.beam, alpha: 0.75 }); // the column of light lifting off
        FX.particle({ x: e.x, y: e.z * TILT + 1.2, vy: 1.5, life: 0.3, size: 0.25, size1: 0.1, aspect: 6, color: 0xffffff, tex: FX.tex.beam, alpha: 0.9 }); // a white core so it reads at the small unit scale
      }
      if (G.stats && src && src.side && G.stats[src.side]) G.stats[src.side].kills++;
      return;
    }
    if (e.type === 'bld') { removeBuilding(e); e.label.classList.add('dead'); if (e.sd) e.sd.play('die', () => { if (e.sd) e.sd.root.visible = false; }, false); return; }
    // tower falls
    const S = G.sides[e.side], foe = G.sides[other(e.side)];
    towerRubble(e, 0.12); // (the tower stands a beat inside the blast before the ruin shows: no empty frame)
    G.slowmo = 0.75; G.punch = 1; G.punchK = 1; G.punchAt = [e.x, e.z * TILT + 1]; // a beat of slow motion and a camera punch as the tower goes down
    FX.flash(0xffd0a0, 0.35);
    SFX.play('expB'); FX.later(0.25, () => SFX.play('quake', 0.6));
    UI.crownFly(e, other(e.side));
    logEvent((e.side === 'red' ? '적 ' : '아군 ') + (e.type === 'king' ? '킹 타워' : '프린세스 타워') + ' 파괴', other(e.side));
    if (e.type === 'king') {
      foe.crowns = 3;
      let k = 1;
      S.towers.forEach((t) => { if (t.alive && t !== e) { t.alive = false; t.hp = 0; towerRubble(t, 0.35 * k++); } });
      UI.crowns();
      endMatch(other(e.side), 'king');
      return;
    }
    foe.crowns++;
    UI.crowns();
    UI.banner(e.side === 'red' ? '적 타워 파괴!' : '아군 타워 파괴!', e.side === 'red' ? 'gold' : 'bad');
    if (e.side === 'red') FX.later(0.5, () => SFX.play('rankUp', 0.55)); // a taken tower is a win moment: a fanfare after the blast
    FX.later(0.7, () => say(e.side === 'red' ? 'ann:' + ['nice', 'great', 'aamazing'][Math.floor(Math.random() * 3)] : 'ann:danger', 1, 3));
    if (e.side === 'blue') aiEmote(1, 0.6); else aiEmote(2, 0.4);
    const king = S.towers.find((t) => t.type === 'king');
    if (king) activateKing(king);
    G.zoneKey = '';
    if (G.overtime) endMatch(other(e.side), 'overtime');
  }

  // a tower turns to rubble: texture swap, guard falls, explosions (delay: chained collapses)
  function towerRubble(e, delay) {
    e.alive = false; e.hp = 0;
    e.label.classList.add('dead');
    const go = () => {
      if (!e.base) return;
      const dk = e.side + e.type + 'dead';
      const tc = towerTex[dk] || (towerTex[dk] = towerCanvas(e.type, e.side, true)); // rubble art is shared too
      e.base.material.map = tc.tex; e.base.material.needsUpdate = true;
      e.base.scale.set(tc.w, tc.h, 1);
      e.base.position.set(e.x, e.z * TILT + tc.cy, 0);
      if (e.sd) { e.sd.speed = 1; e.sd.play('die', () => { if (e.sd) e.sd.root.visible = false; }, false); }
      FX.later(1.8, () => { if (e.sd) e.sd.root.visible = false; }); // long guard death clips are cut short
      const gy = e.z * TILT + 1;
      for (let i = 0; i < 4; i++) FX.later(i * 0.13, () => { const x = e.x + rnd(-1, 1), y = gy + rnd(-0.6, 0.8); if (!spawnStatic('simple_explosion', x, y, 0.28)) FX.explosion(x, y, 1.1, 0xff8a40, true); FX.explosion(x, y, 0.9, 0xffa040); });
      FX.groundRing(e.x, e.z * TILT, 0.5, 4.5, 0xffa040, 0.7);
      scorch(e.x, e.z * TILT, 2.6);
      e.ruinGlow = FX.sprite({ x: e.x, y: e.z * TILT + 0.3, size: e.r * 3.2, aspect: TILT, color: 0xff5020, alpha: 0.28, tex: FX.tex.glow, order: L.GROUND + 4 }); FX.later(6, () => { if (e.ruinGlow) { FX.kill(e.ruinGlow); e.ruinGlow = null; } }); // the ruin smoulders red for a while
      for (let i = 0; i < 24; i++) FX.later(0.6 + i * 0.22, () => { if (G.phase !== 'play') return; const x = e.x + rnd(-1, 1), y = e.z * TILT + rnd(0.2, 1.2); FX.particle({ x, y, vy: rnd(0.5, 1.1), life: rnd(0.6, 1), size: rnd(0.28, 0.42), size1: 0.04, color: Math.random() < 0.5 ? 0xff8a30 : 0xffc060, tex: FX.tex.glow, alpha: 0.9 }); if (i % 3 === 0) FX.particle({ x, y: y + 0.3, vx: rnd(-0.2, 0.2), vy: 0.5, life: 1.4, size: 0.4, size1: 1.2, color: 0x4a4e54, frames: FX.sheets.smoke, alpha: 0.35, normal: true, drag: 0.6 }); }); // embers and a smoke wisp keep the ruin alive for a few seconds
      crater(e.x, e.z * TILT, 4.2, isIron(e.rig || '') ? 'crack_red' : 'crack');
      // the bunker breaks apart: chunks thrown up that fall back, and a dust wave rolling out
      for (let i = 0; i < 16; i++) {
        const a = rnd(0.3, Math.PI - 0.3), v = rnd(3, 7);
        FX.particle({ x: e.x + rnd(-0.8, 0.8), y: gy + rnd(-0.3, 0.5), vx: Math.cos(a) * v * 0.7, vy: Math.sin(a) * v, grav: 14, life: rnd(0.7, 1.1), size: rnd(0.12, 0.3), size1: rnd(0.1, 0.25), color: i % 3 ? 0x6d7984 : 0x3a4048, tex: FX.tex.white, normal: true, spin: rnd(-8, 8), rot: rnd(0, 6), order: L.FX });
      }
      for (let i = 0; i < 10; i++) {
        const a = i / 10 * Math.PI * 2;
        FX.particle({ x: e.x, y: e.z * TILT, vx: Math.cos(a) * 3.2, vy: Math.sin(a) * 3.2 * TILT, drag: 2.2, life: 1.2, size: 0.8, size1: 2, color: 0x8a8f96, alpha: 0.45, normal: true, frames: FX.sheets.smoke, order: L.LOW });
      }
      FX.shake(0.5);
      if (delay > 0.2) SFX.play('expM', 0.6);
    };
    if (delay) FX.later(delay, go); else go();
  }
  // craters from the original ground-crack art (tower collapses, heavy shells); they fade after a while
  const decalTex = {};
  ['crack', 'crack_red'].forEach((k) => new THREE.TextureLoader().load(`assets/icon/${k}.png`, (tx) => { decalTex[k] = tx; }, undefined, () => {}));
  ['wreck', 'wreck2'].forEach((k) => new THREE.TextureLoader().load(`assets/prop/${k}.png`, (tx) => { decalTex[k] = tx; }, undefined, () => {})); // a big mech leaves its wreck for a while
  function crater(x, y, w, kind) {
    const tx = decalTex[kind || 'crack'];
    if (!tx || !tx.image) return;
    const m = decalPool.pop() || quad(tx, 0xffffff, 0.95, false, L.GROUND - 2); // meshes are reused
    m.material.map = tx; m.material.opacity = 0.95; m.material.needsUpdate = true;
    const ar = tx.image.height / tx.image.width;
    m.scale.set(w, w * ar * (kind === 'crack_red' ? TILT : 1), 1);
    m.position.set(x, y - (kind === 'crack_red' ? 0.2 * w * TILT : 0), 0); // that art sits in the top half of its canvas
    m.rotation.z = rnd(-0.25, 0.25);
    scene.add(m);
    G.decals.push({ m, t: 0, life: 10 });
    if (G.decals.length > 12) dropDecal(0);
  }
  const decalPool = [];
  function dropDecal(i) { const d = G.decals[i]; scene.remove(d.m); if (decalPool.length < 12) decalPool.push(d.m); else d.m.material.dispose(); G.decals.splice(i, 1); }
  function updateDecals(dt) {
    for (let i = G.decals.length - 1; i >= 0; i--) {
      const d = G.decals[i];
      d.t += dt;
      d.m.material.opacity = 0.95 * Math.min(1, (d.life - d.t) / 2);
      if (d.t >= d.life) dropDecal(i);
    }
  }
  // a dark burn mark that fades out slowly (the floor remembers the fight)
  function scorch(x, y, r) {
    FX.particle({ x, y, life: 9, size: r * 3, size1: r * 3.1, aspect: TILT, color: 0x000000, alpha: 0.6, tex: FX.tex.dot, normal: true, order: L.GROUND - 1 });
    FX.particle({ x, y, life: 1.1, size: r * 2.6, size1: r * 3.2, aspect: TILT, color: 0xff7a2a, alpha: 0.55, tex: FX.tex.ring, order: L.GROUND }); // an ember rim that cools off
    for (let k = 0; k < 4; k++) { const a = rnd(0, Math.PI * 2), d = r * rnd(0.6, 1.6); FX.particle({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * TILT, life: rnd(3.5, 5), size: rnd(0.09, 0.15), size1: 0.08, color: k % 2 ? 0x4a5058 : 0x8a9198, alpha: 0.9, tex: FX.tex.dot, normal: true, order: L.GROUND }); } // metal fragments lie on the deck a while
  }

  // ── attacks ───────────────────────────────────────────
  const aimH = (t) => (t.kind === 'tower' ? TOWER_E[t.type] * 0.7 : (t.air ? AIR_LIFT : 0) + (t.bodyH || 1) * 0.45);
  const aimY = (t) => t.z * TILT + aimH(t);

  function fire(e, real, fireN) {
    const t = e.target, a = e.atk;
    if (!t || (!t.alive && real)) return;
    if (Math.abs(t.x - e.x) > 0.05) e.face = t.x > e.x ? 1 : -1;
    e.holder.scale.x = e.face * e.natural;
    const [mx, my] = muzzle(e, fireN);
    let dmg = real ? a.dmg * (e.dmgK || 1) : 0;
    if (a.ramp) { // the longer it stays on one target, the harder it hits (x1 -> x3.5 -> x12 after 2 s and 4 s)
      if (e.rampTgt !== t) { e.rampTgt = t; e.rampT = 0; }
      e.rampSt = e.rampT >= 4 ? 2 : e.rampT >= 2 ? 1 : 0;
      if (real) { dmg *= RAMP[e.rampSt]; e.rampT += a.rate; }
    }
    const rk = a.ramp ? 1 + (e.rampSt || 0) * 0.8 : 1; // (its beam / cut grows with each stage)
    if (real && a.sfx) SFX.play(a.sfx, e.kind === 'tower' ? 0.3 : 0.5);
    if (real && a.healHit) { // every blow mends the friendly troops around it (itself included)
      const amt = a.healHit.amt * LEVEL.mult(e.lv);
      FX.groundRing(e.x, e.z * TILT, 0.3, a.healHit.r, 0x7dffb0, 0.45, 0.6);
      for (const o of G.ents) {
        if (o.side !== e.side || !o.alive || o.kind !== 'troop' || o.hp >= o.max || Math.hypot(o.x - e.x, o.z - e.z) > a.healHit.r) continue;
        o.hp = Math.min(o.max, o.hp + amt);
        FX.particle({ x: o.x, y: sy(o) + o.bodyH * 0.6, vy: 1.2, life: 0.6, size: 0.4, size1: 0.2, color: 0x7dffb0, tex: FX.tex.cross, alpha: 0.9 });
      }
    }
    const tx = t.x, ty = aimY(t);
    const ang = Math.atan2(ty - my, tx - mx);
    const ranged = a.fx !== 'claw' && a.fx !== 'slash' && a.fx !== 'cannon' && a.fx !== 'flame';
    if (fireN > 0 && ranged) FX.muzzleFlash(mx, my, ang, a.color, 0.65);
    // the original projectile / effect of this character
    const o = e.rig ? origFor(e.rig, a.fx) : null;
    if (real && o && o.statics.length && FXB.ready(o.statics[0])) spawnStatic(o.statics[0], tx, t.z * TILT + 0.2, e.fxk * 0.65, e.face); // (the original impact art is an opaque disc: kept small so the fight under it stays visible)
    if (o && o.bullet && FXB.ready(o.bullet) && fxRoom() && (a.fx !== 'lightning' && a.fx !== 'laser')) {
      const meta = FX_META.meta[o.bullet];
      const inst = FXB.create(o.bullet);
      inst.root.scale.set(e.fxk, e.fxk, 1);
      inst.setOrder(L.PROJ);
      scene.add(inst.root);
      G.bfx.push({ inst, src: e, atk: a, target: t, t: 0, T: Math.max(0.1, meta.T) * (a.fx === 'bomb' ? 2 : 1), type: meta.type, sx: mx, sy: my, ex: tx, ey: ty, tz: t.z, tx: t.x, dmg, hit: o.hit, hs: meta.hitScale || 1, k: e.fxk, h: rnd(0.1, 0.4) });
      return;
    }
    const P = (o2) => G.projs.push(Object.assign({ x: mx, y: my, src: e, side: e.side, atk: a, target: t, tx: t.x, tz: t.z, ty, dmg, t: 0, gen: GENERIC_HIT[a.fx], k: e.fxk || 0.2 }, o2));
    switch (a.fx) {
      case 'bullet': P({ speed: 24, kind: 'bullet' }); FX.beam(mx, my, tx, ty, 0.1, teamHex(e.side), 0.14); break; // a team-coloured tracer shows who is shooting whom
      case 'snipe': FX.beam(mx, my, tx, ty, 0.1, a.color, 0.2); if (real) { hit(e, a, t, t.x, t.z, dmg); hitFx(e, a, tx, ty); splashFx(t.x, t.z, a); } break;
      case 'grenade': P({ speed: 8.5, kind: 'grenade', arc: 1.8, point: true }); break;
      case 'missile': P({ speed: 10, kind: 'missile', arc: 1.2, point: true }); break;
      case 'fireball': P({ speed: 9, kind: 'fireball', arc: 0.6, point: true }); break;
      case 'holy': P({ speed: 10, kind: 'holy', point: true }); break;
      case 'frost': P({ speed: 10, kind: 'frost', point: true }); break;
      case 'wave': FX.wave(mx, my, tx, ty, a.color); P({ speed: 9, kind: 'wave', silent: true }); break;
      case 'bomb': P({ speed: 5, kind: 'bomb', point: true }); break;
      case 'lightning': {
        const list = [t];
        if (real && a.chain) {
          let cur = t;
          for (let i = 1; i < a.chain; i++) {
            let nb = null, nd = 3.2;
            for (const q of G.ents) if (q.side !== e.side && q.alive && canHit(a, q) && !list.includes(q)) { const d = dist(cur, q); if (d < nd) { nd = d; nb = q; } }
            if (!nb) break;
            list.push(nb); cur = nb;
          }
        }
        const pts = [{ x: mx, y: my }, ...list.map((q) => ({ x: q.x, y: aimY(q) }))];
        FX.lightning(pts, a.color, real ? 0.2 : 0.12, 0.2);
        if (real) list.forEach((q) => { hit(e, a, q, q.x, q.z, dmg); FX.hit(q.x, aimY(q), a.color, 0.7); }); // every link of the chain flashes on its target
        break;
      }
      case 'laser': {
        const dx = t.x - e.x, dz = t.z - e.z, Ld = Math.hypot(dx, dz) || 1;
        const reach = Math.max(Ld, (a.range || 5) + 0.6);
        const ex = e.x + dx / Ld * reach, ez = e.z + dz / Ld * reach;
        FX.beam(mx, my, ex, ez * TILT + aimH(t), (real ? 0.28 : 0.14) * rk, rk > 2 ? 0xfff0c0 : a.color, 0.3);
        if (a.pierce && real) FX.groundRing(t.x, t.z * TILT, 0.1, 0.6, a.color, 0.25, 0.6); // a piercing shot marks its line on the deck
        if (!real) break;
        hitFx(e, a, tx, ty);
        if (a.pierce) {
          for (const q of G.ents) {
            if (q.side === e.side || !canHit(a, q)) continue;
            const px = q.x - e.x, pz = q.z - e.z, along = (px * dx + pz * dz) / Ld;
            if (along < -0.3 || along > reach) continue;
            if (Math.abs(px * dz - pz * dx) / Ld <= a.pierce + q.r) hit(e, a, q, q.x, q.z, dmg);
          }
        } else hit(e, a, t, t.x, t.z, dmg);
        break;
      }
      case 'flame':
        FX.flame(mx, my, tx, ty, a.color);
        if (real) { hit(e, a, t, t.x, t.z, dmg); splashFx(t.x, t.z, a); }
        break;
      default: // slash / claw / cannon: contact hits
        if (a.fx === 'slash') FX.slash(tx, ty, a.color, (1.1 + (a.splash || 0) * 0.7) * rk); else FX.hit(tx, ty, a.color, (a.fx === 'cannon' ? 1.6 : 1) + (a.splash || 0) * 0.5); // a sweeping blow cuts a wider arc
        if (real) {
          if (a.fx === 'cannon' || a.splash) FX.shake(0.08);
          hitFx(e, a, tx, ty);
          if (t.kind === 'tower' || t.type === 'bld') { t.wobT = 0.14; G.hitStop = Math.max(G.hitStop || 0, 0.025); const ang = Math.atan2(sy(e) + 0.6 - ty, e.x - tx); for (let k = 0; k < 6; k++) { const aa = ang + rnd(-0.5, 0.5), v = rnd(4, 7); FX.particle({ x: tx, y: ty, vx: Math.cos(aa) * v, vy: Math.sin(aa) * v, drag: 5, grav: 6, life: rnd(0.16, 0.28), size: 0.12, size1: 0.04, color: k % 2 ? 0xffe0a0 : 0xffa040, tex: FX.tex.dot }); } } // a blow on a structure: a beat of hit-stop, sparks kicked back at the striker, the tower shudders
          hit(e, a, t, t.x, t.z, dmg);
          splashFx(t.x, t.z, a);
        }
    }
  }
  const EXPLOSIVE = { grenade: 1, missile: 1, cannon: 1, fireball: 1, bomb: 1 };
  const RAMP = [1, 3.5, 12];
  // an area attack shows the area it hit (projectiles draw theirs where they land)
  function splashFx(x, z, a) {
    if (!a.splash) return;
    FX.groundRing(x, z * TILT, 0.2, a.splash, a.color, 0.35, 0.85);
    FX.groundGlow(x, z * TILT, a.splash * 0.5, a.color, 0.3, 0.4);
  }
  function hitFx(e, a, x, y) {
    const n = GENERIC_HIT[a.fx];
    const big = clamp(a.dmg * (e.dmgK || 1) / 220, 0.7, 1.6); // heavier blows get bigger bursts
    const heavy = G.time - (e.hfxT || -1) > 0.16; // a fast shooter gets the full burst a few times a second, otherwise just the core (no permanent confetti cloud)
    if (!heavy) { FX.particle({ x, y, life: 0.1, size: 0.25, size1: 0.55, color: 0xfff4d0, tex: FX.tex.cross, rot: Math.random() * 3, alpha: 0.75 }); FX.sparks(x, y, a.color, 2, 3, 0.14, 0.22); return; } // between full bursts, sustained fire still flickers and sprays
    e.hfxT = G.time;
    FX.sparks(x, y, a.color, Math.round(5 + big * 4), 3.5 + big * 1.8, 0.2, 0.36); // a spray of sparks sells every blow
    FX.sparks(x, y, e.side === 'blue' ? 0x4fe3ff : 0xff7a3a, 3, 2.5, 0.12, 0.2); // (team-tinted sparks read on the light deck where white ones vanished)
    FX.particle({ x, y, life: 0.1, size: 0.18, size1: 0.38 * big, color: 0xfff4d0, tex: FX.tex.cross, rot: Math.random() * 3, alpha: 0.85 }); // a short star flash (small: faces stay visible)
    FX.particle({ x, y, life: 0.12, size: 0.25 * big, size1: 0.45 * big, color: a.color, tex: FX.tex.glow, alpha: 0.4 }); // a tinted pop behind the star
    FX.ring(x, y, 0.1, 0.75 * big, a.color, 0.2, 0.85);
    if (big >= 1.35) { FX.groundRing(x, y - 0.45, 0.2, 0.75 * big, a.color, 0.18, 0.6); FX.shake(0.04); } // the heaviest blows thump the deck
    // streaks carry on along the shot: the hit reads as coming from the shooter
    { const ang = Math.atan2(y - (sy(e) + (e.bodyH || 1.5) * 0.5), x - e.x); for (let s = 0; s < 3 + Math.round(big * 2); s++) { const aa = ang + rnd(-0.45, 0.45), v = rnd(4, 7.5); FX.particle({ x, y, vx: Math.cos(aa) * v, vy: Math.sin(aa) * v, drag: 6, life: rnd(0.14, 0.24), size: 0.3, size1: 0.08, aspect: 5, rot: aa - Math.PI / 2, color: s % 2 ? 0xffffff : 0xffe08a, tex: FX.tex.beam, alpha: 1 }); } }
    for (let k = 0; k < 2 + Math.round(big * 2); k++) { const aa = rnd(0.25, Math.PI - 0.25), v = rnd(2.2, 4.2); FX.particle({ x, y, vx: Math.cos(aa) * v, vy: Math.sin(aa) * v, grav: 12, drag: 1, life: rnd(0.35, 0.55), size: rnd(0.07, 0.11), size1: 0.05, color: k % 2 ? 0xdfe5ea : 0x5d646c, tex: FX.tex.dot, normal: true }); } // armour chips knocked off the target tumble to the deck
    if (EXPLOSIVE[a.fx]) { for (let k = 0; k < 6; k++) { const aa = rnd(0.3, Math.PI - 0.3), v = rnd(2.5, 5); FX.particle({ x, y, vx: Math.cos(aa) * v, vy: Math.sin(aa) * v, grav: 10, life: rnd(0.4, 0.65), size: 0.16, size1: 0.12, color: 0x4a3a2c, tex: FX.tex.dot, normal: true }); } scorch(x, y - 0.3, 0.5 * big); } // shells and grenades throw chunks and scar the deck; guns spark; blades cut
    if ((a.range || 0) <= 1.3 && Math.random() < 0.6) FX.slash(x + rnd(-0.15, 0.15), y + rnd(-0.1, 0.2), a.color, 0.7 + 0.4 * big); // close-quarters blows leave a cut streak
    if (n && spawnStatic(n, x, y, (e.fxk || 0.2) * 0.4 * big)) return; // the original hit effect, kept small so it does not smear over the target
    FX.hit(x, y, a.color, 0.6);
  }

  function hit(src, a, t, px, pz, dmg) {
    if (!dmg) return;
    if (a.splash) {
      if (G.time - (src.scT || -1) > 0.7) { src.scT = G.time; scorch(px, pz * TILT, a.splash * 0.45); } // blasts leave scorch marks that fade over a few seconds
      for (const o of enemiesNear(src.side, px, pz, a.splash)) { // only the other side's units and structures near the blast
        if (!canHit(a, o)) continue;
        if (Math.hypot(o.x - px, o.z - pz) <= a.splash + o.r * 0.5) applyHit(o, dmg, a, src);
      }
    } else applyHit(t, dmg, a, src);
  }
  function applyHit(o, dmg, a, src) {
    damage(o, dmg, src);
    if (!o.alive) return;
    if (o.kind === 'troop' && src && !o.air) { const dx = o.x - src.x, dz = o.z - src.z, L = Math.hypot(dx, dz) || 1, k = clamp(dmg / 600, 0.06, 0.22); o.kx = dx / L * k; o.kz = dz / L * k; } // a visual recoil (the simulated position is untouched)
    if (a.slow) { o.slowT = Math.max(o.slowT, a.slowDur || 2); o.slowAmt = a.slow; }
    if (a.stun) stun(o, a.stun);
    if (a.freeze) { o.freezeT = Math.max(o.freezeT, a.freeze); o.target = o.kind === 'troop' ? null : o.target; }
  }
  function stun(o, d) {
    o.stunT = Math.max(o.stunT, d);
    o.target = null;
    if (o.kind === 'troop') o.state = 'stun';
  }

  function updateProjs(dt) {
    // original (baked) projectiles: screen-space Bezier flight, homing on the target
    for (let i = G.bfx.length - 1; i >= 0; i--) {
      const b = G.bfx[i];
      b.t += dt;
      if (b.target.alive) { b.ex = b.target.x; b.ey = aimY(b.target); b.tx = b.target.x; b.tz = b.target.z; }
      const f = Math.min(1, b.t / b.T);
      const [x, y, dx, dy] = origPath(b, f);
      b.inst.root.position.set(x, y, 0);
      b.inst.root.rotation.z = Math.atan2(dy, dx);
      b.inst.update(dt);
      if ((b.trT = (b.trT || 0) - dt) <= 0) { b.trT = 0.025; FX.particle({ x, y, life: 0.26, size: 0.5, size1: 0.05, color: b.atk.color, tex: FX.tex.glow, alpha: 0.8 }); FX.particle({ x, y, life: 0.12, size: 0.2, size1: 0, color: 0xffffff, tex: FX.tex.glow, alpha: 0.9 }); } // a fading trail with a bright core
      if (f >= 1) {
        const big = b.dmg ? clamp(b.dmg / 220, 0.75, 1.5) : 0.7;
        if (!(b.hit && spawnStatic(b.hit, b.ex, b.ey, b.k * b.hs * big * 0.85))) FX.hit(b.ex, b.ey, b.atk.color, 1.05 * big);
        { const a0 = Math.atan2(dy, dx); for (let s = 0; s < 3 + big * 3; s++) { const a = a0 + rnd(-0.7, 0.7), v = rnd(3, 6); FX.particle({ x: b.ex, y: b.ey, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 5, life: rnd(0.15, 0.3), size: 0.12, size1: 0.02, color: b.atk.color, tex: FX.tex.dot }); } } // sparks carry on in the shot's direction
        if (b.atk.splash) { FX.groundRing(b.tx, b.tz * TILT, 0.2, b.atk.splash, b.atk.color, 0.35, 0.8); FX.groundGlow(b.tx, b.tz * TILT, b.atk.splash * 0.45, b.atk.color, 0.3, 0.35); } // the blast area lights up, not just its edge
        if (b.dmg) hit(b.src, b.atk, b.target, b.tx, b.tz, b.dmg);
        b.inst.dispose();
        G.bfx.splice(i, 1);
      }
    }
    for (let i = G.sfx.length - 1; i >= 0; i--) {
      G.sfx[i].update(dt);
      if (G.sfx[i].done) { G.sfx[i].dispose(); G.sfx.splice(i, 1); }
    }
    // particle projectiles
    for (let i = G.projs.length - 1; i >= 0; i--) {
      const p = G.projs[i];
      p.t += dt;
      if (!p.point && p.target.alive) { p.tx = p.target.x; p.tz = p.target.z; p.ty = aimY(p.target); }
      const gy = p.kind === 'bomb' || p.kind === 'spell' ? p.tz * TILT + 0.1 : p.ty;
      if (p.d0 == null) { p.d0 = Math.max(0.1, Math.hypot(p.tx - p.x, gy - p.y)); p.x0 = p.x; p.y0 = p.y; }
      const dx = p.tx - p.x, dy = gy - p.y, Ld = Math.hypot(dx, dy);
      const step = p.speed * dt;
      const done = Ld <= step;
      if (!done) { p.x += dx / Ld * step; p.y += dy / Ld * step; } else { p.x = p.tx; p.y = gy; }
      const prog = clamp(1 - Math.hypot(p.tx - p.x, gy - p.y) / p.d0, 0, 1);
      const yy = p.y + (p.arc ? Math.sin(prog * Math.PI) * p.arc : 0);
      const c = p.atk.color;
      switch (p.kind) {
        case 'bullet': FX.trail(p.x, yy, c, 0.5); FX.particle({ x: p.x, y: yy, life: 0.06, size: 0.4, size1: 0.18, color: 0xffffff, tex: FX.tex.glow, alpha: 1, order: L.PROJ }); break; // a bright head on a thicker trail
        case 'grenade': FX.particle({ x: p.x, y: yy, life: 0.1, size: 0.3, size1: 0.15, color: 0xffd080, tex: FX.tex.glow, order: L.PROJ }); break;
        case 'missile': FX.particle({ x: p.x, y: yy, life: 0.1, size: 0.35, size1: 0.1, color: c, tex: FX.tex.glow, order: L.PROJ }); FX.particle({ x: p.x, y: yy, life: 0.5, size: 0.2, size1: 0.6, color: 0x777777, alpha: 0.4, normal: true, frames: FX.sheets.smoke, order: L.LOW }); break;
        case 'fireball': FX.particle({ x: p.x, y: yy, life: 0.18, size: 0.8, size1: 0.3, color: c, frames: FX.sheets.fire, rot: Math.random() * 6, order: L.PROJ }); break;
        case 'holy': FX.particle({ x: p.x, y: yy, life: 0.12, size: 0.7, size1: 0.2, color: c, tex: FX.tex.glow, order: L.PROJ }); break;
        case 'frost': FX.particle({ x: p.x, y: yy, life: 0.2, size: 0.5, size1: 0.1, color: c, tex: FX.tex.snow, spin: 6, order: L.PROJ }); break;
        case 'bomb': FX.particle({ x: p.x, y: yy, life: 0.06, size: 0.4, size1: 0.3, color: 0x333333, tex: FX.tex.dot, normal: true, order: L.PROJ }); break;
        case 'spell': if (p.rocket) { FX.particle({ x: p.x, y: yy, life: 0.12, size: 0.6, size1: 0.2, color: 0xfff0a0, tex: FX.tex.glow, order: L.PROJ }); FX.particle({ x: p.x + rnd(-0.1, 0.1), y: yy, vy: rnd(-0.3, 0.3), life: 1.1, size: 0.4, size1: 1.3, color: 0xb0b4ba, alpha: 0.5, normal: true, frames: FX.sheets.smoke, order: L.LOW }); break; } FX.particle({ x: p.x, y: yy, life: 0.2, size: 1.5, size1: 0.5, color: c, frames: FX.sheets.fire, rot: Math.random() * 6, order: L.PROJ }); FX.particle({ x: p.x, y: yy, life: 0.7, size: 0.5, size1: 1.4, color: 0x666666, alpha: 0.35, normal: true, frames: FX.sheets.smoke, order: L.LOW }); break;
      }
      if (!done) continue;
      G.projs.splice(i, 1);
      if (p.kind === 'spell') { landSpell(p); continue; }
      const ground = p.tz * TILT;
      if (p.kind !== 'wave') {
        if (!(p.gen && spawnStatic(p.gen, p.tx, p.point ? ground + 0.3 : gy, p.k * (p.atk.splash ? 1 : 0.8)))) {
          if (p.atk.splash || p.point) FX.explosion(p.tx, ground + 0.3, Math.max(0.5, (p.atk.splash || 0.6) * 0.55), c);
          else FX.hit(p.tx, gy, c, 0.7);
        }
      }
      if (p.atk.splash) { FX.groundRing(p.tx, ground, 0.2, p.atk.splash, c, 0.35, 0.8); FX.groundGlow(p.tx, ground, p.atk.splash * 0.45, c, 0.3, 0.35); }
      if (p.dmg) hit(p.src, p.atk, p.target, p.tx, p.tz, p.dmg);
    }
  }

  // ── spells ────────────────────────────────────────────
  function castSpell(side, c, x, z) {
    const s = SGN[side];
    const lv = lvlOf(side, c), cc = Object.assign({}, c, { dmg: c.dmg * LEVEL.mult(lv) });
    if (c.spell === 'fireball') {
      const k = G.sides[side].towers.find((t) => t.type === 'king');
      FX.groundRing(x, z * TILT, c.radius, c.radius * 0.9, 0xff4040, 0.9, 0.7);
      G.projs.push({ kind: 'spell', x: k ? k.x : 0, y: s * 14 * TILT + 3, tx: x, tz: z, ty: z * TILT, speed: c.radius < 2 ? 22 : 16, arc: c.radius < 2 ? 1.6 : 3, point: true, atk: cc, side, card: cc, t: 0, dmg: cc.dmg, rocket: c.radius < 2 });
      SFX.play('missile', 0.6);
    } else if (c.spell === 'zap') {
      const y = z * TILT;
      for (let i = 0; i < 3; i++) FX.thunderBolt(x + rnd(-1, 1) * c.radius * 0.6, y + rnd(-0.5, 0.5), c.color);
      spawnStatic('Raven_skill1_Hit', x, y + 0.4, 0.45, 1, L.FX);
      FX.groundRing(x, y, 0.3, c.radius, c.color, 0.45);
      FX.groundGlow(x, y, c.radius, c.color, 2.5, 0.35); // the shocked floor glows a while
      FX.particle({ x, y, life: 1.6, size: c.radius * 2.1, size1: c.radius * 2.2, aspect: TILT, color: 0x1f6f9f, alpha: 0.4, tex: FX.tex.dot, normal: true, order: L.GROUND }); // and is stained blue (additive light alone vanishes on the bright deck)
      spellHit(side, cc, x, z);
      SFX.play('elec');
      FX.flash(0x9fe8ff, 0.25);
    } else if (c.spell === 'zone') {
      // a burning field (or a poison cloud): ticks every half second (see updateZones)
      const y = z * TILT;
      G.zones.push({ kind: c.gas ? 'gas' : 'fire', side, x, z, r: c.radius, dps: cc.dmg, t: c.dur, tick: 0, slow: c.slow, towerK: c.towerK, card: cc });
      if (c.gas) { FX.groundGlow(x, y, c.radius, c.color, c.dur, 0.5, 0.3); FX.particle({ x, y, life: c.dur, size: c.radius * 2.1, size1: c.radius * 2.2, aspect: TILT, color: 0x2f6a1f, alpha: 0.42, tex: FX.tex.dot, normal: true, order: L.GROUND, fadeIn: 0.3 }); FX.groundRing(x, y, 0.3, c.radius, c.color, 0.6); SFX.play('spray', 0.7); return; } // a green stain that holds as long as the gas
      FX.groundGlow(x, y, c.radius, c.color, c.dur, 0.45, 0.3);
      FX.groundRing(x, y, 0.3, c.radius, c.color, 0.5);
      scorch(x, y, c.radius * 0.8);
      SFX.play('expS', 0.6);
    } else if (c.spell === 'rage') {
      // overclock: every friendly troop and building inside moves and fires faster
      const y = z * TILT;
      FX.groundRing(x, y, 0.3, c.radius, c.color, 0.6);
      FX.groundGlow(x, y, c.radius, c.color, 1.2, 0.5);
      for (let i = 0; i < 16; i++) { const a = Math.random() * 6.28, r = Math.random() * c.radius; FX.particle({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r * TILT, vy: rnd(1, 2.5), life: 0.8, size: 0.25, size1: 0, color: c.color, tex: FX.tex.dot }); }
      for (const o of G.ents) {
        if (o.side !== side || !o.alive || o.kind === 'tower' && o.type !== 'bld') continue;
        if (Math.hypot(o.x - x, o.z - z) > c.radius + o.r * 0.5) continue;
        o.hasteT = Math.max(o.hasteT || 0, c.dur); o.hasteK = c.k; o.hasteColor = c.color;
      }
      SFX.play('reinforce', 0.7);
    } else if (c.spell === 'clone') {
      // every friendly troop inside gets a 1-HP holographic twin beside it (champions are not copied)
      const y = z * TILT;
      FX.groundRing(x, y, 0.3, c.radius, c.color, 0.6);
      FX.groundGlow(x, y, c.radius, c.color, 0.8, 0.5);
      for (let i = 0; i < 18; i++) { const a = Math.random() * 6.28, r = Math.random() * c.radius; FX.particle({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r * TILT, vy: rnd(1.2, 2.6), life: 0.7, size: 0.3, size1: 0, aspect: 3, color: c.color, tex: FX.tex.beam, alpha: 0.9 }); } // scan lines rising
      const src = G.ents.filter((o) => o.side === side && o.alive && o.kind === 'troop' && !o.clone && !o.card.skill && o.deployT <= 0 && Math.hypot(o.x - x, o.z - z) <= c.radius + o.r * 0.5);
      for (const o of src) {
        const cp = spawnTroop(side, o.card, clamp(o.x + 0.6 * (o.x > x ? 1 : o.x < x ? -1 : MIR()), -8.6, 8.6), o.z, 0, o.lv);
        cp.hp = cp.max = 1; cp.clone = true; cp.deployT = 0; cp.dropT = 0; cp.elev = 0; cp.tintRGB = [0.55, 0.95, 1.5];
        if (cp.sd) cp.sd.setOpacity(0.7); // a see-through hologram
        FX.particle({ x: cp.x, y: cp.z * TILT + 0.6, life: 0.4, size: 0.4, size1: 1.8, color: c.color, tex: FX.tex.glow, alpha: 0.8 });
      }
      SFX.play('reinforce', 0.7);
    } else if (c.spell === 'heal') {
      const y = z * TILT;
      FX.groundRing(x, y, 0.3, c.radius, c.color, 0.6);
      FX.groundGlow(x, y, c.radius, c.color, 0.9, 0.5);
      for (const o of G.ents) {
        if (o.side !== side || !o.alive || o.kind !== 'troop' || Math.hypot(o.x - x, o.z - z) > c.radius + o.r * 0.5) continue;
        o.hp = Math.min(o.max, o.hp + c.heal * LEVEL.mult(lv));
        for (let k = 0; k < 3; k++) FX.particle({ x: o.x + rnd(-0.3, 0.3), y: sy(o) + o.bodyH * 0.4, vy: rnd(1, 1.8), life: 0.8, size: 0.45, size1: 0.2, color: c.color, tex: FX.tex.cross, alpha: 0.95 }); // green crosses rise from every mended unit
      }
      SFX.play('reinforce', 0.6);
    } else if (c.spell === 'volley') {
      // three waves of fire rain on the area (sim-timed in updateZones, the same on both online devices)
      G.zones.push({ kind: 'volley', side, x, z, r: c.radius, t: 0.75, tick: 0, waves: c.waves, hitDmg: cc.dmg / c.waves, towerK: c.towerK, card: cc });
      FX.groundRing(x, z * TILT, 0.3, c.radius, c.color, 0.7, 0.8);
    } else if (c.spell === 'lightning') {
      // the toughest few targets inside are struck
      const y = z * TILT;
      FX.groundRing(x, y, 0.3, c.radius, c.color, 0.5);
      const tg = G.ents.filter((o) => o.side !== side && o.alive && Math.hypot(o.x - x, o.z - z) <= c.radius + o.r * 0.6).sort((a, b) => b.hp - a.hp || a.id - b.id).slice(0, c.n);
      for (const o of tg) {
        const oy = o.kind === 'troop' ? sy(o) + o.bodyH * 0.5 : o.z * TILT + (TOWER_E[o.type] || 1);
        FX.thunderBolt(o.x, oy, c.color); FX.thunderBolt(o.x + rnd(-0.2, 0.2), oy, 0xffffff);
        FX.groundRing(o.x, o.z * TILT, 0.2, 1.2, c.color, 0.35, 0.9); FX.hit(o.x, oy, c.color, 1.4);
        damage(o, cc.dmg * (o.kind === 'tower' && o.type !== 'bld' ? c.towerK : 1), { side, card: cc });
        if (o.alive && c.stun) stun(o, c.stun);
      }
      FX.flash(0xdfefff, 0.3); FX.shake(0.25);
      SFX.play('elec'); SFX.play('expM', 0.6);
    } else if (c.spell === 'pull') {
      G.zones.push({ kind: 'pull', side, x, z, r: c.radius, dps: cc.dmg, t: c.dur, tick: 0, towerK: c.towerK, card: cc });
      FX.groundRing(x, z * TILT, c.radius, 0.3, c.color, c.dur, 0.7); // the ring closes in
      FX.groundGlow(x, z * TILT, c.radius * 0.8, c.color, c.dur, 0.45);
      SFX.play('quake', 0.7);
    } else if (c.spell === 'freeze') {
      const y = z * TILT;
      spawnStatic('Titania_skill1_Ground_ice', x, y, 0.3, 1, L.FX);
      spawnStatic('Titania_skill1_Ground_ice_smoke', x, y, 0.3, 1, L.FX);
      FX.frost(x, y, c.radius, c.color);
      FX.groundGlow(x, y, c.radius * 0.9, 0x9fe8ff, c.freeze, 0.45, 0.2);
      FX.particle({ x, y, life: c.freeze, size: c.radius * 2.2, size1: c.radius * 2.3, aspect: TILT, color: 0x5fb8e8, alpha: 0.5, tex: FX.tex.dot, normal: true, order: L.GROUND, fadeIn: 0.2 }); // a frosted patch that reads on the bright deck for as long as the freeze holds
      FX.groundRing(x, y, 0.3, c.radius, c.color, 0.6);
      for (let i = 0; i < 20; i++) { const a = Math.random() * 6.28, r = Math.random() * c.radius; FX.particle({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r * TILT, vy: rnd(0.5, 1.4), life: rnd(0.6, 1.2), size: 0.3, size1: 0, color: 0xdff8ff, tex: FX.tex.snow, spin: rnd(-3, 3) }); }
      spellHit(side, cc, x, z);
      SFX.play('ice');
      FX.flash(0xcdf6ff, 0.3);
    }
  }
  function updateZones(dt) {
    for (let i = G.zones.length - 1; i >= 0; i--) {
      const zn = G.zones[i];
      zn.t -= dt; zn.tick -= dt;
      if (zn.kind === 'volley') { // waves of shots rain down
        if (zn.tick <= 0 && zn.waves > 0) {
          zn.tick = 0.25; zn.waves--;
          for (let k = 0; k < 22; k++) { const a = Math.random() * 6.28, r = zn.r * Math.sqrt(Math.random()), px = zn.x + Math.cos(a) * r, py = (zn.z + Math.sin(a) * r) * TILT; FX.particle({ x: px + 0.6, y: py + 3.2, vx: -2.4, vy: -13, life: 0.24, size: 0.55, size1: 0.3, aspect: 5, rot: 0.18, color: zn.card.color, tex: FX.tex.beam, alpha: 1 }); FX.later(0.22, () => FX.hit(px, py, zn.card.color, 0.35)); }
          FX.groundRing(zn.x, zn.z * TILT, 0.3, zn.r, zn.card.color, 0.3, 0.5);
          SFX.play('mg', 0.5);
          spellHit(zn.side, { radius: zn.r, dmg: zn.hitDmg, towerK: zn.towerK }, zn.x, zn.z, { side: zn.side, card: zn.card });
        }
        if (zn.waves <= 0) G.zones.splice(i, 1);
        continue;
      }
      if (zn.kind === 'pull') { // everything inside is dragged toward the centre (heavy machines less)
        const pk = zn.card.radius;
        for (const o of G.ents) {
          if (o.side === zn.side || !o.alive || o.kind !== 'troop') continue;
          const dx = zn.x - o.x, dz = zn.z - o.z, d = Math.hypot(dx, dz);
          if (d > pk + o.r * 0.5 || d < 0.3) continue;
          const v = 3.6 * dt * clamp(1.2 - (o.mass || 4) / 16, 0.25, 1);
          o.x += dx / d * Math.min(v, d - 0.3); o.z += dz / d * Math.min(v, d - 0.3);
        }
        for (let k = 0; k < 3; k++) { const a = Math.random() * 6.28, r = pk * rnd(0.3, 1); FX.particle({ x: zn.x + Math.cos(a) * r, y: (zn.z + Math.sin(a) * r) * TILT + 0.3, vx: -Math.cos(a) * r * 1.6 - Math.sin(a) * 3, vy: (-Math.sin(a) * r * 1.6 + Math.cos(a) * 3) * TILT, life: 0.4, size: 0.25, size1: 0.05, aspect: 2.5, color: zn.card.color, tex: FX.tex.beam, alpha: 0.9 }); } // a swirl spiralling in
        if (zn.tick <= 0 && zn.t > 0) { zn.tick = 0.35; spellHit(zn.side, { radius: pk, dmg: zn.dps * 0.35, towerK: zn.towerK }, zn.x, zn.z, { side: zn.side, card: zn.card }); }
        if (zn.t <= 0) G.zones.splice(i, 1);
        continue;
      }
      if (zn.kind === 'gas') { // green clouds rolling over the area, bubbles rising
        if (Math.random() < 0.55) { const a = Math.random() * 6.28, r = zn.r * Math.sqrt(Math.random()) * 0.9; FX.particle({ x: zn.x + Math.cos(a) * r, y: (zn.z + Math.sin(a) * r) * TILT + 0.2, vx: rnd(-0.3, 0.3), vy: rnd(0.2, 0.6), life: rnd(1.2, 1.8), size: 0.8, size1: 2, color: 0x6fd84a, alpha: 0.45, normal: true, frames: FX.sheets.smoke, spin: rnd(-1, 1), order: L.LOW }); }
        if (Math.random() < 0.4) { const a = Math.random() * 6.28, r = zn.r * Math.sqrt(Math.random()) * 0.8; FX.particle({ x: zn.x + Math.cos(a) * r, y: (zn.z + Math.sin(a) * r) * TILT, vy: rnd(0.6, 1.4), life: 0.7, size: 0.12, size1: 0.22, color: 0xb8ff7a, tex: FX.tex.ring, alpha: 0.9 }); }
        if (zn.tick <= 0 && zn.t > 0) { zn.tick = 0.5; spellHit(zn.side, { radius: zn.r, dmg: zn.dps * 0.5, towerK: zn.towerK, slow: zn.slow }, zn.x, zn.z, { side: zn.side, card: zn.card }); }
        if (zn.t <= 0) G.zones.splice(i, 1);
        continue;
      }
      // a wall of flame along the rim, embers rising inside
      if (Math.random() < 0.7) { const a = Math.random() * 6.28, r = zn.r * rnd(0.8, 1); FX.particle({ x: zn.x + Math.cos(a) * r, y: (zn.z + Math.sin(a) * r) * TILT, vy: rnd(0.8, 1.6), life: 0.55, size: 0.4, size1: 0.9, color: Math.random() < 0.5 ? 0xff6a2a : 0xffc040, frames: FX.sheets.fire, alpha: 0.85 }); }
      if (Math.random() < 0.6) { const a = Math.random() * 6.28, r = zn.r * Math.sqrt(Math.random()) * 0.8; FX.particle({ x: zn.x + Math.cos(a) * r, y: (zn.z + Math.sin(a) * r) * TILT, vx: rnd(-0.3, 0.3), vy: rnd(1, 2.4), life: rnd(0.6, 1.1), size: 0.1, size1: 0, color: 0xffb040, tex: FX.tex.dot }); }
      if (zn.tick <= 0 && zn.t > 0) { zn.tick = 0.5; spellHit(zn.side, { radius: zn.r, dmg: zn.dps * 0.5, towerK: zn.towerK, slow: zn.slow }, zn.x, zn.z, { side: zn.side, card: zn.card }); }
      if (zn.t <= 0) G.zones.splice(i, 1);
    }
  }
  function landSpell(p) {
    const c = p.card, y = p.tz * TILT;
    if (!spawnStatic('RPG_skill2_hit', p.tx, y + 0.3, 0.32)) FX.explosion(p.tx, y + 0.3, c.radius * 0.7, c.color, true);
    spawnStatic('simple_explosion', p.tx, y + 0.5, 0.3);
    FX.explosion(p.tx, y + 0.3, c.radius * 0.5, c.color, true);
    FX.groundRing(p.tx, y, 0.3, c.radius, c.color, 0.45);
    // the blast reads at a glance: a white-hot core, a shock ring racing past the radius, sparks and chunks thrown out
    FX.particle({ x: p.tx, y: y + 0.4, life: 0.1, size: c.radius * 0.3, size1: c.radius * 0.8, color: 0xfff4d0, tex: FX.tex.glow, alpha: 0.85 });
    FX.groundRing(p.tx, y, 0.2, c.radius * 1.25, 0xffffff, 0.3, 0.9);
    FX.groundGlow(p.tx, y, c.radius * 0.9, c.color, 0.6, 0.55);
    FX.sparks(p.tx, y + 0.3, 0xffd080, 18, 7, 0.25, 0.5);
    for (let k = 0; k < 10; k++) { const a = rnd(0.2, Math.PI - 0.2), v = rnd(3, 6.5); FX.particle({ x: p.tx, y: y + 0.3, vx: Math.cos(a) * v, vy: Math.sin(a) * v, grav: 11, life: rnd(0.45, 0.75), size: 0.18, size1: 0.12, color: 0x3a2e24, tex: FX.tex.dot, normal: true }); }
    FX.flash(c.color, 0.12);
    scorch(p.tx, y, c.radius * 0.6);
    crater(p.tx, y, c.radius * 1.3);
    FX.shake(0.35);
    SFX.play(c.sfx || 'expB');
    spellHit(p.side, c, p.tx, p.tz);
  }
  function spellHit(side, c, x, z, src) {
    src = src || { side, card: c.id ? c : null };
    for (const o of G.ents) {
      if (o.side === side || !o.alive) continue;
      const d = Math.hypot(o.x - x, o.z - z);
      if (d > c.radius + o.r * 0.6) continue;
      damage(o, c.dmg * (o.kind === 'tower' && o.type !== 'bld' ? (c.towerK || 0.35) : 1), src);
      if (!o.alive) continue;
      if (c.stun) stun(o, c.stun);
      if (c.freeze) { o.freezeT = Math.max(o.freezeT, c.freeze); if (o.kind === 'troop') o.target = null; }
      if (c.slow) { o.slowT = Math.max(o.slowT, 2.5); o.slowAmt = c.slow; }
      if (c.knock && o.kind === 'troop' && o.mass < 10 && d > 0.01) { o.x += (o.x - x) / d * c.knock; o.z += (o.z - z) / d * c.knock; }
    }
  }

  // ── champions ─────────────────────────────────────────
  function skillReady(u) {
    return u && u.alive && u.card.skill && u.deployT <= 0 && u.skillCd <= 0 && !u.casting && u.freezeT <= 0 && u.stunT <= 0;
  }
  const skillCost = (u) => Math.max(1, u.card.skill.cost + (G.mut && G.mut.skillCost || 0));
  const AIMABLE = { barrage: 1, laser: 1, dash: 1 };
  // the player's skill button: online it is an input like a card (checked here, run on both devices shortly)
  function useSkill(u, spot) {
    if (mp && u && u.side === 'blue') {
      if (!skillReady(u) || G.sides.blue.elixir < skillCost(u) - 1e-6 || G.phase !== 'play') return false;
      if (mp.mine.some((c) => c.k === 's' && c.u === u.id)) return true; // (already on its way)
      return mpLocal({ k: 's', u: u.id, sp: spot ? [spot.x, spot.z] : null });
    }
    return useSkillNow(u, spot);
  }
  function useSkillNow(u, spot) {
    const S = G.sides[u.side], sk = u.card.skill;
    if (!skillReady(u) || S.elixir < skillCost(u) - 1e-6 || G.phase !== 'play' || G.paused) return false;
    S.elixir -= skillCost(u);
    if (voiced(u.card) && say(unitLine(u.card, 'skill'), 0.95, u.side === 'blue' ? 3 : 2)) FX.groundRing(u.x, u.z * TILT, 0.3, 1.4, sk.color, 0.5, 0.7); // the champion calls its skill (a ring marks who speaks)
    u.skillCd = sk.cd * (G.mut && G.mut.skillCd || 1);
    u.casting = 0.9;
    u.skillFired = false;
    if (u.sd) {
      const a = animInfo(u.rig, u.sd, 'skill');
      u.sd.play('skill', null, false);
      u.sd.time = a.w0;
      u.sd.speed = u.castSpeed = clamp(a.len / 0.9, 0.8, 2.5);
    }
    UI.skillCut(u, toScreen(u.x, u.z * TILT)[1] / (view.h || 1)); // (the banner keeps clear of where the skill goes off)
    logEvent(`${u.card.name} · ${sk.name}`, u.side, 'skill');
    // where it will land (barrage aims now and keeps that spot); the enemy's gets a red warning ring
    const tg = u.target && u.target.alive ? u.target : null;
    const aim = sk.kind === 'laser' ? tg || nearestTower(u) : sk.kind === 'dash' ? dashTarget(u) : null;
    u.skillSpot = sk.kind === 'barrage' ? bestSpot(u, sk.reach, sk.radius * 1.5) : sk.kind === 'nova' ? [u.x, u.z]
      : sk.kind === 'laser' || sk.kind === 'dash' ? (aim ? [aim.x, aim.z] : [u.x, u.z - SGN[u.side] * (sk.reach || sk.dist)]) : null; // laser / dash: locked at cast time
    if (spot && AIMABLE[sk.kind]) u.skillSpot = aimedSpot(u, spot.x, spot.z); // the player dragged the skill onto the field
    telegraph(u, sk);
    FX.groundRing(u.x, u.z * TILT, 0.3, 2.2, sk.color, 0.5);
    FX.particle({ x: u.x, y: sy(u) + u.bodyH * 0.5, life: 0.5, size: 0.5, size1: 1.8, color: sk.color, tex: FX.tex.glow, alpha: 0.45 }); // (soft: under bloom a bigger one washed the champion out)
    SFX.play('charge', 0.7);
    G.stats[u.side].skills++;
    return true;
  }
  // every skill kind shows where it will strike before it lands (red for the enemy's, the skill colour for ours)
  function telegraph(u, sk) {
    const col = u.side === 'red' ? 0xff3040 : sk.color, sp = u.skillSpot, tg = u.target && u.target.alive ? u.target : null;
    const line = (x1, z1, n, r) => { for (let i = 1; i <= n; i++) { const f = i / n; FX.groundGlow(u.x + (x1 - u.x) * f, (u.z + (z1 - u.z) * f) * TILT, r, col, 0.9, 0.45, 0.25); } };
    switch (sk.kind) {
      case 'nova': FX.groundRing(u.x, u.z * TILT, sk.radius, sk.radius * 0.96, col, 0.9, 0.85); FX.groundGlow(u.x, u.z * TILT, sk.radius, col, 0.9, 0.25, 0.6); break;
      case 'barrage': if (sp) { FX.groundRing(sp[0], sp[1] * TILT, sk.radius * 1.6, sk.radius * 0.3, col, 0.9, 0.9); FX.groundGlow(sp[0], sp[1] * TILT, sk.radius * 1.5, col, 1, 0.35, 0.5); } break;
      case 'storm': FX.groundRing(u.x, u.z * TILT, sk.reach, sk.reach * 0.97, col, 0.9, 0.6); break;
      case 'laser': if (sp) { const dx = sp[0] - u.x, dz = sp[1] - u.z, L = Math.hypot(dx, dz) || 1; line(u.x + dx / L * sk.reach, u.z + dz / L * sk.reach, 9, sk.width * 1.4); } break;
      case 'dash': if (sp) { const [ex, ez] = dashPath(u, sp[0], sp[1]); line(ex, ez, 6, sk.radius * 0.9); } break;
      case 'summon': for (let i = 0; i < sk.n; i++) { const a = i / sk.n * Math.PI * 2; FX.groundRing(u.x + Math.cos(a) * 1.3, (u.z + Math.sin(a) * 1.3) * TILT, 0.7, 0.15, col, 0.8, 0.8); } break;
      default: FX.groundRing(u.x, u.z * TILT, 2.2, 0.4, col, 0.7, 0.8); // shield / haste: a pull-in on the champion
    }
  }
  // what a dash goes for: the current target unless it flies, else the nearest ground enemy in reach (or the nearest tower)
  function dashTarget(u) {
    const tg = u.target && u.target.alive ? u.target : null;
    if (tg && !tg.air) return tg;
    let best = null, bd = Infinity;
    for (const o of enemiesNear(u.side, u.x, u.z, u.card.skill.dist + 3)) if (!o.air) { const d = dist(u, o); if (d < bd) { bd = d; best = o; } }
    if (best) return best;
    const t = nearestTower(u);
    if (t && dashPath(u, t.x, t.z)[2] < 1.5) { // the straight line would skid on the bank: head for the near end of the lane's bridge if the dash really gets there
      const bx = (u.x < 0 ? -1 : 1) * BAL.bridgeX, bz = -Math.sign(t.z - u.z) * (BAL.river + 0.6), want = Math.min(u.card.skill.dist, Math.max(0, Math.hypot(bx - u.x, bz - u.z) - 1));
      if (want > 0.5 && dashPath(u, bx, bz)[2] >= want * 0.8) return { x: bx, z: bz, air: false };
    }
    return t;
  }
  // a dash from u toward (tx, tz): [end x, end z, fraction of the wanted travel]; a ground champion stops at the chasm edge off the bridges
  function dashPath(u, tx, tz) {
    const sk = u.card.skill, dx = tx - u.x, dz = tz - u.z, L = Math.hypot(dx, dz) || 1, want = Math.min(sk.dist, Math.max(0, L - 1));
    let x = u.x, z = u.z;
    const n = Math.max(1, Math.ceil(want / 0.2));
    for (let i = 1; i <= n; i++) {
      const nx = u.x + dx / L * want * i / n, nz = u.z + dz / L * want * i / n;
      if (!u.air && Math.abs(nz) < BAL.river + 0.2 && !onBridge(nx, u.r)) break; // the open chasm: stop on the bank
      x = nx; z = nz;
    }
    return [x, z, Math.hypot(x - u.x, z - u.z)];
  }
  // where a player-aimed skill goes: barrage within its reach; laser / dash keep the dragged direction
  function aimedSpot(u, x, z) {
    const sk = u.card.skill, dx = x - u.x, dz = z - u.z, d = Math.hypot(dx, dz);
    if (d < 0.3) return [u.x, u.z - SGN[u.side] * (sk.reach || sk.dist || 4)];
    if (sk.kind === 'barrage' && d > sk.reach) return [u.x + dx / d * sk.reach, u.z + dz / d * sk.reach];
    return [clamp(x, -8.8, 8.8), clamp(z, -15.8, 15.8)];
  }
  // the aim preview while a skill button is dragged (short-lived marks, redrawn as the pointer moves)
  // persistent marks moved in place (no particle churn): [0] the ring reticle, [1..7] the path / area glows
  const aimMarks = [];
  function aimHide() { aimMarks.forEach((p) => FX.kill(p)); aimMarks.length = 0; }
  function aimPreview(u, px, pz) {
    if (!u || !u.alive || G.phase !== 'play' || G.paused) { aimHide(); return; }
    const sk = u.card.skill, [x, z] = aimedSpot(u, px, pz);
    if (!aimMarks.length) {
      aimMarks.push(FX.sprite({ x, y: z * TILT, size: 1, aspect: TILT, color: sk.color, tex: FX.tex.ring, alpha: 0.9, order: L.GROUND + 60 }));
      for (let i = 1; i <= 7; i++) aimMarks.push(FX.sprite({ x, y: z * TILT, size: 1, aspect: TILT, color: sk.color, tex: FX.tex.glow, alpha: 0, order: L.GROUND + 55 }));
      aimMarks.push(FX.sprite({ x, y: z * TILT, size: 1, aspect: TILT, color: 0xffffff, tex: FX.tex.ring, alpha: 0, order: L.GROUND + 58 })); // [8]: where the finger is, when the dash stops short of it
    }
    const put = (p, mx, mz, r, a) => { p.x = mx; p.y = mz * TILT; p.sz = r * 2; p.alpha = a; p.aspect = TILT; p.rot = 0; };
    if (sk.kind === 'barrage') {
      put(aimMarks[0], x, z, sk.radius * 1.5, 0.9); put(aimMarks[1], x, z, sk.radius * 1.4, 0.3);
      for (let i = 2; i <= 8; i++) aimMarks[i].alpha = 0;
      aimMarks[0].color = sk.color;
      return;
    }
    const dx = x - u.x, dz = z - u.z, Ln = Math.hypot(dx, dz) || 1, reach = sk.kind === 'laser' ? sk.reach : dashPath(u, x, z)[2];
    // [1]: one soft lane stretched along the line (screen-space angle: the floor squash is already in the endpoints); [2..7]: pace marks
    const w = sk.width || sk.radius, ex = u.x + dx / Ln * reach, ez = u.z + dz / Ln * reach, sx = ex - u.x, sy2 = (ez - u.z) * TILT, len = Math.hypot(sx, sy2) || 0.01;
    const lane = aimMarks[1]; lane.x = (u.x + ex) / 2; lane.y = (u.z + ez) / 2 * TILT; lane.sz = len * 1.08; lane.aspect = Math.min(1, w * 1.6 * TILT / (len * 1.08)); lane.rot = Math.atan2(sy2, sx); lane.alpha = 0.45;
    for (let i = 2; i <= 7; i++) { const f = (i - 1) / 6; put(aimMarks[i], u.x + dx / Ln * reach * f, u.z + dz / Ln * reach * f, w * 0.35, 0.7); }
    put(aimMarks[0], u.x + dx / Ln * reach, u.z + dz / Ln * reach, (sk.width || sk.radius) * 1.1, 0.9); // where it ends
    put(aimMarks[8], x, z, 0.3, sk.kind === 'dash' && Ln - reach > 1.3 ? 0.4 : 0);
    // a dash cut short by the chasm ends in a red ring (cut short by its range: the skill colour)
    aimMarks[0].color = sk.kind === 'dash' && reach + 0.3 < Math.min(sk.dist, Math.max(0, Ln - 1)) ? 0xff5050 : sk.color;
  }
  // status tint toward its target: a hit flash snaps on, everything else eases (freeze / stun / shield read smoothly)
  function tintTo(e, tk, dt) {
    const m = e.tintMul || 1, q = e.tintRGB, T0 = TINTS[tk], T = m === 1 && !q ? T0 : [T0[0] * m * (q ? q[0] : 1), T0[1] * m * (q ? q[1] : 1), T0[2] * m * (q ? q[2] : 1)]; // (a clone is tinted holographic blue) // dark iron rigs are lifted a little so they read on the deck
    if (!e.tintC) { e.tintC = T.slice(); e.sd.setTint(T[0], T[1], T[2]); e.tintK = tk; return; } // first frame: written once (a pooled rig may carry an old tint)
    const c = e.tintC, k = tk === 2 ? 1 : Math.min(1, dt * 12);
    let ch = false;
    for (let i = 0; i < 3; i++) { if (c[i] === T[i]) continue; const v = Math.abs(T[i] - c[i]) < 0.01 ? T[i] : c[i] + (T[i] - c[i]) * k; c[i] = v; ch = true; }
    if (ch) e.sd.setTint(c[0], c[1], c[2]);
    e.tintK = tk;
  }
  // how many buff motes to emit this frame (no closure: the caller fills one reused options object)
  function sparkle(e, dt) { e.spkT = (e.spkT || 0) - dt; let n = 0; while (e.spkT <= 0 && n < 2) { n++; e.spkT += 0.055; } if (e.spkT < 0) e.spkT = 0; return n; }
  const SPK = { x: 0, y: 0, vy: 1, life: 0.45, size: 0.3, size1: 0, color: 0, tex: null };
  // a champion skill landing: a beat of hit-stop, a camera punch and a colour flash (lighter for the opponent's)
  function impact(u, x, z, color) {
    const k = u.side === 'blue' ? 1 : 0.5;
    G.hitStop = Math.max(G.hitStop || 0, 0.07 * k); // a near-freeze, then the world snaps back
    if ((G.punch || 0) < 0.3) { G.punch = 1; G.punchK = 0.45 * k; G.punchAt = [x, z * TILT + 0.5]; } // eases in and out; never steals a tower collapse
    FX.flash(color, 0.16 * k);
  }
  const STRUCTS = [];
  function enemiesNear(side, x, z, r, troopsOnly) {
    // from the per-side lists (rebuilt every step) instead of every entity
    const S = G.sides[other(side)], out = [];
    for (const o of (G.troops ? G.troops[other(side)] : [])) if (o.alive && Math.hypot(o.x - x, o.z - z) <= r + o.r) out.push(o);
    if (!troopsOnly) { for (const o of S.towers) if (o.alive && Math.hypot(o.x - x, o.z - z) <= r + o.r) out.push(o); for (const o of S.blds) if (o.alive && Math.hypot(o.x - x, o.z - z) <= r + o.r) out.push(o); }
    return out;
  }
  // the densest spot of enemies within reach (or the nearest enemy tower)
  function bestSpot(u, reach, radius) {
    const list = enemiesNear(u.side, u.x, u.z, reach, true);
    let best = null, bs = 0;
    for (const a of list) {
      let s = 0;
      for (const b of list) if (Math.hypot(a.x - b.x, a.z - b.z) <= radius) s += b.kind === 'tower' ? 2 : 1;
      if (s > bs) { bs = s; best = a; }
    }
    if (best) return [best.x, best.z];
    const t = nearestTower(u);
    if (t) { const d = dist(u, t), k = Math.min(1, reach / (d || 1)); return [u.x + (t.x - u.x) * k, u.z + (t.z - u.z) * k]; }
    return [u.x, u.z - SGN[u.side] * 4];
  }
  function skillEffect(u) {
    const sk = u.card.skill, side = u.side, m = LEVEL.mult(u.lv);
    const hitArea = (x, z, r, dmg, extra) => spellHit(side, Object.assign({ radius: r, dmg: dmg * m, towerK: 0.3 }, extra), x, z, u);
    const y0 = u.z * TILT;
    const own = skillFxFor(u.card.rig); // the original skill effect, on the skill's focus
    if (own && sk.kind !== 'dash' && sk.kind !== 'laser') { const t = u.target && u.target.alive ? u.target : null, sp = sk.kind === 'barrage' && u.skillSpot; spawnStatic(own, sp ? sp[0] : t ? t.x : u.x, (sp ? sp[1] : t ? t.z : u.z) * TILT + 0.4, skillFxK(u), u.face); }
    switch (sk.kind) {
      case 'nova': {
        if (sk.freeze || !own) spawnStatic(sk.freeze ? 'Titania_skill1_Ground_ice' : SKILL_FX.nova, u.x, y0 + (sk.freeze ? 0 : 0.5), sk.freeze ? 0.3 : 0.42); // (a champion's own skill art already marks the blast: stacked on it, the generic one whited out the units under the bloom)
        FX.groundRing(u.x, y0, 0.3, sk.radius, sk.color, 0.6);
        G.hitStop = Math.max(G.hitStop || 0, 0.05); // the signature blow lands with a beat
        FX.groundRing(u.x, y0, 0.2, sk.radius * 1.15, 0xfff0c0, 0.6, 0.75); // a shock ring racing out past the area, held long enough to read
        FX.groundRing(u.x, y0, sk.radius * 0.95, sk.radius, sk.color, 0.9, 0.55); // and the area itself, outlined for most of a second
        FX.sparks(u.x, y0 + 0.5, sk.color, 16, 6.5, 0.22, 0.45);
        FX.particle({ x: u.x, y: y0 + 0.5, life: 0.09, size: sk.radius * 0.2, size1: sk.radius * 0.5, color: 0xffb04a, tex: FX.tex.glow, alpha: 0.7 }); // an amber core, not a white disc
        for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2 + rnd(-0.2, 0.2), v = rnd(7, 10); FX.particle({ x: u.x, y: y0 + 0.4, vx: Math.cos(a) * v, vy: Math.sin(a) * v * TILT, drag: 7, life: 0.3, size: 0.5, size1: 0.12, aspect: 5, rot: Math.atan2(Math.sin(a) * TILT, Math.cos(a)) - Math.PI / 2, color: 0xffe08a, tex: FX.tex.beam, alpha: 1 }); } // radial streaks
        scorch(u.x, y0, sk.radius * 0.55);
        FX.groundGlow(u.x, y0, sk.radius, sk.color, 0.5, 0.3);
        if (sk.freeze) FX.frost(u.x, y0 + 0.4, sk.radius, sk.color); else FX.explosion(u.x, y0 + 0.4, sk.radius * 0.38, sk.color, false); // (a tighter blast: the bloom no longer whites out the units it hits)
        hitArea(u.x, u.z, sk.radius, sk.dmg, { stun: sk.stun, freeze: sk.freeze });
        impact(u, u.x, u.z, sk.color);
        SFX.play(sk.freeze ? 'ice' : 'expM');
        break;
      }
      case 'barrage': {
        const [cx, cz] = u.skillSpot || bestSpot(u, sk.reach, sk.radius * 1.5);
        for (let i = 0; i < sk.n; i++) {
          const x = cx + (i ? srnd(-1, 1) * sk.radius * MIR() : 0), z = cz + (i ? srnd(-0.75, 0.75) * sk.radius * MIR() : 0); // inside the telegraph ring
          FX.later(0.15 + i * 0.16, () => {
            if (G.phase !== 'play') return;
            const y = z * TILT;
            if (sk.pillar) { FX.pillar(x, y, 0.6, sk.color); spawnStatic('Azazel_skill1_Hit_m', x, y + 0.3, 0.2); }
            else FX.meteor(x, y, null, sk.color);
            FX.later(sk.pillar ? 0.05 : 0.55, () => { if (G.phase !== 'play') return; if (!sk.pillar) { const bk = rnd(0.85, 1.2); spawnStatic('simple_explosion', x, y + 0.3, 0.22 * bk); scorch(x, y, sk.radius * 0.5 * bk); if (!i) crater(x, y, sk.radius * 0.9); } hitArea(x, z, sk.radius, sk.dmg, { stun: sk.stun, slow: sk.slow }); if (!i) impact(u, x, z, sk.color); FX.shake(0.15); SFX.play('expS', 0.5); });
          });
        }
        break;
      }
      case 'storm': {
        const list = shuffle(enemiesNear(side, u.x, u.z, sk.reach, true)); // troops only: not a tower-melter
        for (let i = 0; i < sk.n; i++) {
          const o = list[i % Math.max(1, list.length)];
          const x = o ? o.x : u.x + srnd(-3, 3) * MIR(), z = o ? o.z : u.z - SGN[side] * srnd(1, 4);
          FX.later(i * 0.12 + rnd(0, 0.06), () => { if (G.phase !== 'play') return; FX.thunderBolt(x, z * TILT + 0.3, sk.color); spawnStatic(SKILL_FX.storm, x, z * TILT + 0.4, 0.3); hitArea(x, z, 1, sk.dmg, { stun: sk.stun }); if (!i) impact(u, x, z, sk.color); SFX.play('elec', 0.4); });
        }
        break;
      }
      case 'laser': {
        const sp = u.skillSpot || [u.x, u.z - SGN[side]];
        const dx = sp[0] - u.x, dz = sp[1] - u.z, Ld = Math.hypot(dx, dz) || 1;
        const ex = u.x + dx / Ld * sk.reach, ez = u.z + dz / Ld * sk.reach;
        const [mx, my] = muzzle(u, 1);
        FX.orbital(mx, my, ex, ez * TILT + 0.6, sk.color, 0.7);
        if (own) spawnStatic(own, ex, ez * TILT + 0.4, skillFxK(u), u.face);
        for (let f = 0.15; f <= 1; f += 0.15) scorch(u.x + (ex - u.x) * f, (u.z + (ez - u.z) * f) * TILT, 0.7);
        for (const o of enemiesNear(side, u.x, u.z, sk.reach + 0.5)) {
          const px = o.x - u.x, pz = o.z - u.z, along = (px * dx + pz * dz) / Ld;
          if (along < -0.3 || along > sk.reach) continue;
          if (Math.abs(px * dz - pz * dx) / Ld <= sk.width + o.r) damage(o, sk.dmg * m * (o.kind === 'tower' && o.type !== 'bld' ? 0.3 : 1), u);
        }
        impact(u, (u.x + ex) / 2, (u.z + ez) / 2, sk.color);
        SFX.play('laserBig');
        break;
      }
      case 'dash': {
        const sp = u.skillSpot || [u.x, u.z - SGN[side] * sk.dist];
        const dx = sp[0] - u.x, dz = sp[1] - u.z, Ld = Math.hypot(dx, dz) || 1;
        const x0 = u.x, z0 = u.z, [ex, ez, went] = dashPath(u, sp[0], sp[1]);
        const k = went / Ld; // the path actually travelled (the chasm may stop it short)
        u.x = ex; u.z = ez;
        if (went + 0.3 < Math.min(sk.dist, Math.max(0, Ld - 1))) { const dust = new THREE.Color(ARENAS[G.arena].glow).lerp(new THREE.Color(0xb0a898), 0.7).getHex(); FX.sparks(ex, ez * TILT + 0.2, dust, 12, 3, 0.16, 0.5); for (let i = 0; i < 4; i++) FX.particle({ x: ex + rnd(-0.4, 0.4), y: ez * TILT + 0.2, vx: rnd(-0.8, 0.8), vy: rnd(0.2, 0.7), life: rnd(0.5, 0.8), size: 0.4, size1: 1.1, color: 0x6a6258, frames: FX.sheets.smoke, alpha: 0.5, normal: true, drag: 1.5 }); FX.groundRing(ex, ez * TILT, 0.3, 1.4, dust, 0.35, 0.7); FX.shake(0.1); } // braked at the edge
        for (let i = 0; i <= 6; i++) { const f = i / 6; FX.particle({ x: x0 + dx * k * f, y: (z0 + dz * k * f) * TILT + u.bodyH * 0.4, life: 0.4, size: 1.2, size1: 0.2, color: sk.color, tex: FX.tex.glow, alpha: 0.7 }); }
        FX.slash(u.x, u.z * TILT + u.bodyH * 0.4, sk.color, 2.2);
        if (u.rig && SD.ready(u.rig)) for (let i = 1; i <= 3; i++) {
          const c = SD.acquire(u.rig), f = i / 4;
          if (!c) break;
          c.root.scale.copy(u.sd.root.scale); c.root.position.copy(u.sd.root.position);
          const hold = new THREE.Group(); hold.add(c.root);
          hold.position.set(x0 + dx * k * f, (z0 + dz * k * f) * TILT, 0); hold.scale.x = u.holder.scale.x;
          c.play('atk'); c.fadeD = 0; c.time = 0.2; c.apply(); c.render(); // exact attack pose, no crossfade
          c.setOpacity(0.25 + f * 0.25); c.setTint(((sk.color >> 16) & 255) / 255, ((sk.color >> 8) & 255) / 255, (sk.color & 255) / 255); c.setOrder(L.UNIT - (z0 + dz * k * f) * TILT * 10 + 5); // depth-sorted like the units (not drawn over those in front)
          scene.add(hold);
          const ai = { hold, c };
          G.after.push(ai);
          FX.later(0.15 + f * 0.25, () => { const j = G.after.indexOf(ai); if (j >= 0) { G.after.splice(j, 1); scene.remove(hold); SD.release(c); } });
        }
        spawnStatic(SKILL_FX.dash, u.x, u.z * TILT + 0.4, 0.4);
        if (own) spawnStatic(own, u.x, u.z * TILT + 0.4, u.fxk * 1.2, u.face);
        for (const o of enemiesNear(side, x0, z0, went + sk.radius + 1.5)) {
          if (o.air) continue;
          const px = o.x - x0, pz = o.z - z0, along = (px * dx + pz * dz) / Ld;
          if (along < -0.5 || along > Ld * k + 1) continue;
          if (Math.abs(px * dz - pz * dx) / Ld <= sk.radius + o.r) damage(o, sk.dmg * m * (o.kind === 'tower' && o.type !== 'bld' ? 0.3 : 1), u);
        }
        impact(u, u.x, u.z, sk.color);
        SFX.play('slash');
        break;
      }
      case 'summon': {
        const c = CARD[sk.card];
        for (let i = 0; i < sk.n; i++) {
          const a = i / sk.n * Math.PI * 2;
          const tr = spawnTroop(side, c, clamp(u.x + Math.cos(a) * 1.3, -8.6, 8.6), clamp(u.z + Math.sin(a) * 1.3, -15.6, 15.6), i * 0.06, u.lv);
          tr.deployT = tr.deploy0 = 0.4 + i * 0.06;
          tr.elev = 0; tr.dropT = 0;
          FX.later(tr.deployT * 0.6, () => { if (!tr.alive) return; FX.particle({ x: tr.x, y: tr.z * TILT + 0.4, life: 0.25, size: 0.4, size1: 1.6, color: sk.color, tex: FX.tex.glow, alpha: 0.8 }); FX.groundRing(tr.x, tr.z * TILT, 0.2, 1, sk.color, 0.3, 0.8); }); // each summon lands with a flash
        }
        FX.summonBurst(u.x, y0 + 0.3, 3, sk.color);
        SFX.play('genA', 0.5);
        break;
      }
      case 'shield': u.shieldT = sk.dur; FX.groundRing(u.x, y0, 0.5, 2, sk.color, 0.6); spawnStatic(SKILL_FX.shield, u.x, y0 + u.bodyH * 0.5, 0.35); SFX.play('reinforce'); break;
      case 'haste': u.hasteT = sk.dur; u.hasteK = sk.k; u.hasteColor = sk.color; FX.groundRing(u.x, y0, 0.5, 2, sk.color, 0.6); spawnStatic(SKILL_FX.haste, u.x, y0 + u.bodyH * 0.4, 0.35); SFX.play('reinforce'); break;
    }
  }

  function playCard(side, idx, x, z) {
    const S = G.sides[side];
    const id = S.hand[idx], c = CARD[id];
    if (!c || S.elixir < c.cost - 1e-6) return false;
    if (c.type === 'troop' && !canDeploy(side, x, z)) return false;
    if (c.type === 'building' && !canBuild(side, x, z, c)) return false;
    if (c.type === 'spell') { x = clamp(x, -9, 9); z = clamp(z, -16, 16); }
    S.elixir -= c.cost;
    // one hero (champion) at a time: while one is on the field, hero cards wait in the queue and the next other card comes
    const heroOut = c.skill || G.ents.some((e) => e.side === side && e.kind === 'troop' && e.alive && e.card.skill);
    let qi = heroOut ? S.queue.findIndex((q) => !CARD[q].skill) : 0;
    if (qi < 0) qi = 0;
    S.hand[idx] = S.queue.splice(qi, 1)[0];
    S.queue.push(id);
    G.stats[side].spent += c.cost;
    G.stats[side].cards++;
    if (side === 'blue' && c.type !== 'spell') { G.lastBlue = { lane: x < 0 ? -1 : 1, t: G.time, cost: c.cost }; }
    const out = [];
    if (c.type === 'troop') {
      const f = FORM[c.count] || FORM[1];
      f.forEach(([ox, oz], i) => {
        const s = SGN[side];
        const px = clamp(x + ox, -8.6, 8.6), pz = clamp(z - oz * s, -15.6, 15.6);
        out.push(spawnTroop(side, c, px, pz, i * 0.08));
      });
      FX.groundRing(x, z * TILT, 0.2, 1.6, FACTIONS[S.faction].hex, 0.5);
      SFX.play(c.rarity >= 3 ? 'genSS' : c.rarity >= 2 ? 'genS' : 'genB', 0.3);
      if (side === 'blue' && voiced(c) && (c.skill || Math.random() < 0.6)) FX.later(0.3, () => say(unitLine(c, 'deploy'), 0.85, c.skill ? 2.5 : 1)); // the unit answers the call (your champion wins a tie)
      else if (side === 'blue' && c.faction === 'iron' && !voiced(c)) SFX.play('elec', 0.35); // the silent machines power up audibly
      FX.later(0.25, () => FX.summonBurst(x, z * TILT + 0.3, c.rarity >= 3 ? 3 : c.rarity >= 1 ? 2 : 1, teamHex(side))); // every deploy lands with a team-coloured burst (bigger for rarer cards)
      FX.particle({ x, y: z * TILT, life: 1.4, size: 1.2, size1: 2.6, aspect: TILT, color: teamHex(side), tex: FX.tex.ring, alpha: 0.55, order: L.GROUND + 3 }); // a lingering drop circle
    } else if (c.type === 'building') {
      out.push(makeBuilding(side, c, x, z));
      SFX.play('reinforce', 0.5);
    } else castSpell(side, c, x, z);
    if (side === 'blue') { UI.hand(true); G.zoneKey = ''; }
    return out;
  }

  // ── buildings ─────────────────────────────────────────
  // only on your own half, clear of towers and other buildings
  function canBuild(side, x, z, c) {
    if (Math.abs(x) > 8.6 - c.r || Math.abs(z) > 15.6 - c.r) return false;
    if (z * -SGN[side] > -BAL.deployDepth - 0.4) return false;
    return !inTower(side, x, z, c.r + 0.25) && !inTower(other(side), x, z, c.r + 0.25);
  }
  function makeBuilding(side, c, x, z) {
    const S = G.sides[side], m = LEVEL.mult(lvlOf(side, c)), hm = G.mut && G.mut.hp || 1;
    const b = {
      id: G.nextId++, kind: 'tower', type: 'bld', card: c, side, x, z, r: c.r, hp: c.hp * m * hm, max: c.hp * m * hm, air: false, alive: true, active: true,
      atk: c.dmg ? { dmg: c.dmg * m, rate: c.rate, range: c.range, hits: c.hits, splash: 0, fx: c.fx, color: c.color, sfx: c.sfx } : null,
      target: null, face: side === 'blue' ? 1 : -1, slowK: 1, slowT: 0, stunT: 0, freezeT: 0, hitT: 0, cd: 0, elev: TOWER_E.bld,
      spawnT: c.spawn ? 1.2 : 0, lv: lvlOf(side, c),
    };
    const tk = side + (c.wall ? 'wall' : 'bld');
    const tc = towerTex[tk] || (towerTex[tk] = c.wall ? wallCanvas(side) : towerCanvas('bld', side, false, null, G.sides[side].faction));
    b.base = quad(tc.tex, 0xffffff, 1, false, 0);
    b.base.scale.set(tc.w, tc.h, 1);
    b.base.position.set(x, z * TILT + tc.cy, 0);
    scene.add(b.base);
    b.holder = new THREE.Group();
    scene.add(b.holder);
    b.aura = FX.sprite({ x, y: z * TILT + TOWER_E.bld, size: 1.6, aspect: TILT, color: teamHex(side), alpha: 0.25, tex: FX.tex.glow, order: 1150 });
    if (c.guard) attachRig(b, c.guard.rig, c.guard.k, c.guard.h, true);
    else { b.bodyH = 1; b.fxk = 0.2; b.natural = 1; b.rig = null; } // a bare wall
    b.label = document.createElement('div');
    b.label.className = 'tlabel ' + side + ' bld';
    b.label.style.transform = 'translate(-999px,-999px)';
    b.label.innerHTML = '<i class="bar"><i></i></i><b></b>';
    labelsEl.appendChild(b.label);
    FX.groundRing(x, z * TILT, 0.2, 1.8, teamHex(side), 0.5);
    FX.later(0.05, () => FX.explosion(x, z * TILT + 0.4, 0.5, 0xc0d0e0));
    G.ents.push(b);
    S.blds.push(b);
    return b;
  }
  // a building's own clock: it decays, fires (updateTower) and spawns
  function updateBuilding(b, dt) {
    if (!b.alive) {
      b.dieT = (b.dieT || 0) + dt;
      if (b.sd) b.sd.update(dt);
      b.base.material.opacity = Math.max(0, 1 - b.dieT / 0.9);
      b.base.position.y -= dt * 0.4;
      return b.dieT > 0.9;
    }
    b.hp -= b.max / b.card.life * dt;
    b.hasteT = Math.max(0, (b.hasteT || 0) - dt);
    if (b.hp <= 0) { kill(b); return false; } // the !alive branch fades it out next
    if (b.card.spawn && b.freezeT <= 0 && b.stunT <= 0) {
      b.spawnT -= dt * (b.hasteT > 0 ? b.hasteK || 1 : 1);
      if (b.spawnT <= 0) {
        b.spawnT = b.card.spawn.every;
        const tc = CARD[b.card.spawn.card], s = SGN[b.side];
        const tr = spawnTroop(b.side, tc, clamp(b.x + srnd(-0.4, 0.4) * MIR(), -8.6, 8.6), b.z - s * (b.r + 0.4), 0, b.lv);
        tr.deployT = tr.deploy0 = 0.3; tr.elev = 0; tr.dropT = 0;
        FX.groundRing(tr.x, tr.z * TILT, 0.2, 0.9, teamHex(b.side), 0.35);
        if (b.sd) b.sd.play('atk', () => {}, false); // onEnd: back to idle after one cycle
      }
    }
    updateTower(b, dt);
    return false;
  }
  function removeBuilding(b) {
    FX.explosion(b.x, b.z * TILT + 0.5, 0.9, 0xffa040);
    FX.sparks(b.x, b.z * TILT + 0.5, 0xc0c8d0, 10, 3, 0.15, 0.6);
    scorch(b.x, b.z * TILT, 1.3);
    for (let i = 0; i < (b.card.wall ? 14 : 8); i++) { // plates / sandbags thrown off
      const a = rnd(0.4, Math.PI - 0.4), v = rnd(2.5, 5.5);
      FX.particle({ x: b.x + rnd(-0.8, 0.8), y: b.z * TILT + rnd(0.2, 0.9), vx: Math.cos(a) * v * 0.7, vy: Math.sin(a) * v, grav: 13, life: rnd(0.6, 0.9), size: rnd(0.1, 0.24), size1: 0.12, color: b.card.wall ? (i % 2 ? 0x7b7160 : 0x8b98a5) : 0x6d7984, tex: FX.tex.white, normal: true, spin: rnd(-8, 8), order: L.FX });
    }
    SFX.play('expM', 0.5);
    const S = G.sides[b.side];
    S.blds = S.blds.filter((x) => x !== b);
  }

  // ── simulation ────────────────────────────────────────
  function updateTroop(u, dt) {
    if (!u.alive) {
      u.dieT += dt;
      const fade0 = u.dieDur - 0.4;
      // bioroids dissolve into rising motes of their team colour as they fade (machines just burn out)
      if (u.dieT > fade0 - 0.2 && u.sd && !isIron(u.card.rig) && Math.random() < 0.6) {
        FX.particle({ x: u.x + rnd(-0.4, 0.4), y: sy(u) + rnd(0, u.bodyH), vy: rnd(0.8, 1.8), life: 0.6, size: 0.18, size1: 0, color: teamHex(u.side), tex: FX.tex.dot });
      }
      if (u.sd) { u.sd.update(dt); if (u.dieT > fade0) u.sd.setOpacity(Math.max(0, 1 - (u.dieT - fade0) / 0.4)); }
      if (u.placeholder) { u.placeholder.material.opacity = Math.max(0, 1 - u.dieT / u.dieDur); u.placeholder.position.y = 0.75 - u.dieT * 0.4; }
      u.shadow.alpha = Math.max(0, 0.62 - u.dieT); u.disc.alpha = Math.max(0, u.disc.a0 - u.dieT * 2); if (u.halo) u.halo.alpha = Math.max(0, 0.2 - u.dieT);
      u.glow.alpha = Math.max(0, 0.16 - u.dieT * 0.3);
      return u.dieT > u.dieDur;
    }
    u.slowT = Math.max(0, u.slowT - dt);
    u.slowK = u.slowT > 0 ? 1 - (u.slowAmt || 0.35) : 1;
    u.shieldT = Math.max(0, u.shieldT - dt); u.hasteT = Math.max(0, u.hasteT - dt);
    if (u.skillCd > 0) u.skillCd -= dt;
    if (u.dropT > 0) { // falling in from the sky
      u.dropT -= dt;
      u.elev = Math.max(0, u.dropT / 0.28) ** 2 * 3;
      if (u.dropT <= 0) {
        u.elev = 0;
        FX.groundRing(u.x, u.z * TILT, 0.2, u.r * 2.4, 0xffffff, 0.3, 0.7);
        FX.groundRing(u.x, u.z * TILT, 0.3, u.r * 3.6, teamHex(u.side), 0.45, 0.8); // the team's flare on landing
        if (u.card.skill) { // a champion lands as an event: a wide ring in its skill colour and rising glints
          const sc = u.card.skill.color;
          FX.groundRing(u.x, u.z * TILT, 0.4, u.r * 5.4, sc, 0.6, 0.9);
          for (let i = 0; i < 10; i++) FX.particle({ x: u.x + rnd(-0.6, 0.6), y: u.z * TILT + rnd(0, 0.4), vy: rnd(1.8, 3.2), life: rnd(0.5, 0.8), size: 0.26, size1: 0, color: i % 2 ? sc : 0xffffff, tex: FX.tex.dot });
        }
        FX.particle({ x: u.x, y: u.z * TILT + u.bodyH * 0.4, life: 0.25, size: 0.6, size1: u.bodyH * 1.6, color: teamHex(u.side), tex: FX.tex.glow, alpha: 0.6 });
        for (let i = 0; i < 8; i++) FX.particle({ x: u.x + rnd(-0.4, 0.4), y: u.z * TILT, vx: rnd(-1, 1), vy: rnd(0.2, 0.6), life: 0.45, size: 0.3, size1: 0.8, color: 0x8a96a3, alpha: 0.35, normal: true, frames: FX.sheets.smoke, order: L.LOW });
        // on the bright deck additive light alone washes out: a dark contact mark and a kicked-up ring of grit sell the landing
        FX.particle({ x: u.x, y: u.z * TILT, life: 0.6, size: u.r * 2.6, size1: u.r * 3.2, aspect: TILT, color: 0x2a2620, alpha: 0.45, tex: FX.tex.dot, normal: true, order: L.GROUND });
        for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2, v = rnd(2.2, 3.2); FX.particle({ x: u.x, y: u.z * TILT, vx: Math.cos(a) * v, vy: Math.sin(a) * v * TILT + 0.4, drag: 5, life: rnd(0.3, 0.45), size: 0.12, size1: 0.04, color: 0x4a4038, alpha: 0.85, tex: FX.tex.dot, normal: true, order: L.LOW }); }
      }
    }
    if (u.deployT > 0) {
      u.deployT -= dt;
      if (u.sd) { u.sd.update(dt); if (u.deployT <= 0) u.sd.setOpacity(1); }
      return false;
    }
    if (u.freezeT > 0 || u.stunT > 0) {
      u.freezeT = Math.max(0, u.freezeT - dt); u.stunT = Math.max(0, u.stunT - dt);
      if (u.sd) { u.sd.speed = 0; u.sd.update(dt); }
      return false;
    }
    if (u.casting > 0) {
      u.casting -= dt;
      if (u.sd) { u.sd.speed = u.castSpeed || 1; u.sd.update(dt); } // (a stun froze the clip at speed 0)
      if (!u.skillFired) {
        // charge-up: motes converge on the champion and its core swells until release
        const sk = u.card.skill, f = clamp((0.9 - u.casting) / 0.4, 0, 1), cy = sy(u) + u.bodyH * 0.55;
        u.chargeAcc = (u.chargeAcc || 0) + dt * (14 + 30 * f);
        while (u.chargeAcc >= 1) {
          u.chargeAcc -= 1;
          const a = Math.random() * Math.PI * 2, r = 1.1 + Math.random() * 0.6;
          FX.particle({ x: u.x + Math.cos(a) * r, y: cy + Math.sin(a) * r * 0.8, vx: -Math.cos(a) * r / 0.28, vy: -Math.sin(a) * r * 0.8 / 0.28, life: 0.28, size: 0.12, size1: 0.3, color: sk.color, tex: FX.tex.dot, alpha: 0.9 });
        }
        if (Math.random() < dt * 20) FX.particle({ x: u.x, y: cy, life: 0.12, size: 0.25 + f * 0.6, size1: 0.2 + f * 0.7, color: sk.color, tex: FX.tex.glow, alpha: 0.22 + f * 0.25 }); // (kept below the bloom's white point: the champion stays visible while charging)
      }
      if (!u.skillFired && u.casting <= 0.5) { u.skillFired = true; skillEffect(u); }
      if (u.casting <= 0) { u.casting = 0; if (u.sd) u.sd.speed = 1; u.state = 'idle'; }
      return false;
    }
    if (u.hold) { setClip(u, 'idle', 1); if (u.sd) u.sd.update(dt); return false; } // a card preview's target stands and takes the hits
    // healers mend every friendly troop around them on a timer
    if (u.card.heal) {
      u.healT = (u.healT == null ? 1 : u.healT) - dt;
      if (u.healT <= 0) {
        const h = u.card.heal, amt = h.amount * LEVEL.mult(u.lv);
        u.healT = h.every;
        let n = 0;
        for (const o of (G.troops ? G.troops[u.side] : G.ents)) {
          if (o === u || o.side !== u.side || o.kind !== 'troop' || !o.alive || o.hp >= o.max || Math.hypot(o.x - u.x, o.z - u.z) > h.radius) continue;
          o.hp = Math.min(o.max, o.hp + amt); n++;
          FX.beam(u.x, sy(u) + u.bodyH * 0.6, o.x, sy(o) + o.bodyH * 0.5, 0.12, 0x7dffb0, 0.35); // a mending link
          for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2; FX.particle({ x: o.x + Math.cos(a) * 0.45, y: sy(o) + 0.2, vx: -Math.sin(a) * 0.9, vy: 1.4, drag: 0.5, life: 0.7, size: 0.14, size1: 0, color: 0xb0ffd0, tex: FX.tex.dot }); } // rising spiral
          FX.particle({ x: o.x, y: sy(o) + o.bodyH * 0.6, vy: 1.2, life: 0.7, size: 0.45, size1: 0.2, color: 0x7dffb0, tex: FX.tex.cross, alpha: 0.9 });
        }
        if (n) { FX.groundRing(u.x, u.z * TILT, 0.4, h.radius, 0x7dffb0, 0.6, 0.6); SFX.play('reinforce', 0.25); }
      }
    }
    u.retarget -= dt;
    const t = u.target;
    const attacking = u.state === 'attack' && t && t.alive;
    if (!t || !t.alive || (!attacking && u.retarget <= 0)) { u.target = findTarget(u); u.retarget = 0.3; }
    const tg = u.target;
    if (!tg) { setClip(u, 'idle', 1); if (u.sd) u.sd.update(dt); u.state = 'idle'; return false; }
    const d = dist(u, tg) - tg.r - u.r;
    const reach = u.card.range + (u.state === 'attack' ? 0.35 : 0) + (tg.kind === 'troop' && u.card.range < 1.5 ? 0.4 : 0); // melee squares off at arm's length instead of stacking onto its target
    if (d <= reach) {
      u.state = 'attack';
      if (Math.abs(tg.x - u.x) > 0.1) u.face = tg.x > u.x ? 1 : -1;
      attackTick(u, dt);
    } else {
      u.state = 'move';
      moveToward(u, tg.x, tg.z, dt);
      setClip(u, 'move', u.slowK * clamp(u.card.speed / 1.05, 0.8, 1.6) * (u.hasteT > 0 ? u.hasteK || 1 : 1) * (G.mut && G.mut.speed || 1));
      if (u.sd) u.sd.update(dt);
    }
    return false;
  }

  function updateTower(t, dt) {
    if (!t.alive) { if (t.sd) t.sd.update(dt); return; }
    if (t.freezeT > 0 || t.stunT > 0) {
      t.freezeT = Math.max(0, t.freezeT - dt); t.stunT = Math.max(0, t.stunT - dt);
      if (t.sd) { t.sd.speed = 0; t.sd.update(dt); }
      return;
    }
    if (!t.active || !t.atk) { if (t.sd) { if (t.sd.clipName !== 'atk') setClip(t, 'idle', t.active ? 1 : 0.5); t.sd.update(dt); } return; } // asleep king / spawner building
    const a = t.atk;
    const inRange = (e) => e && e.alive && e.side !== t.side && e.kind === 'troop' && dist(t, e) - e.r <= a.range;
    if (!inRange(t.target)) {
      t.target = null;
      let bd = Infinity;
      for (const e of (G.troops ? G.troops[other(t.side)] : G.ents)) if (inRange(e) && e.deployT <= 0) { const d = dist(t, e); if (d < bd) { bd = d; t.target = e; } }
    }
    if (t.dagger && !t.target && t.ammo < t.dagger.ammo && (t.reloadT += dt) >= t.dagger.reload) { t.reloadT = 0; t.ammo++; } // daggers come back one by one while it rests
    if (t.target) attackTick(t, dt);
    else if (t.sd) {
      if (t.sd.clipName === 'skill') t.sd.update(dt);
      else { setClip(t, 'idle', 1); t.sd.update(dt); }
    }
  }

  // collisions through a 2-tile grid (no pair is farther apart than 1.5 tiles when touching): O(n) instead of O(n²)
  const CELL = 2, grid = new Map(), cellKey = (cx, cz) => cx * 1000 + cz;
  const NEIGH = [[1, -1], [1, 0], [1, 1], [0, 1]], SIDES = ['blue', 'red'];
  function rebuildLists() {
    for (const c of grid.values()) c.list.length = 0; // cells are kept (the field has at most ~170): no garbage per step
    const T = G.troops || (G.troops = { blue: [], red: [] });
    T.blue.length = 0; T.red.length = 0;
    for (const e of G.ents) {
      if (e.kind !== 'troop' || !e.alive) continue;
      T[e.side].push(e);
      const cx = Math.floor(e.x / CELL), cz = Math.floor(e.z / CELL), k = cellKey(cx, cz);
      let c = grid.get(k);
      if (!c) grid.set(k, (c = { cx, cz, list: [] }));
      c.list.push(e);
    }
  }
  function pushApart(a, b) {
    const dx = a.x - b.x, dz = a.z - b.z;
    const min = b.kind === 'tower' ? a.r + b.r : (a.r + b.r) * 1.3; // troops keep a little more room: the larger sprites no longer pile into one blob
    if (dx > min || dx < -min || dz > min || dz < -min) return;
    const d = Math.hypot(dx, dz) || 0.001;
    if (d >= min) return;
    const over = min - d, nx = dx / d, nz = dz / d;
    if (b.kind === 'tower') { a.x += nx * over; a.z += nz * over; return; }
    const wa = b.mass / (a.mass + b.mass), wb = 1 - wa;
    a.x += nx * over * wa * 0.6; a.z += nz * over * wa * 0.6;
    b.x -= nx * over * wb * 0.6; b.z -= nz * over * wb * 0.6;
    // two walkers meeting head-on step around each other instead of pushing forever
    if (a.state === 'move' && b.state === 'move') {
      const lat = over * 0.35, px = Math.abs(nx) < 0.2 ? 1 : -nz, pz = Math.abs(nx) < 0.2 ? 0 : nx;
      a.x += px * lat; a.z += pz * lat; b.x -= px * lat; b.z -= pz * lat;
    }
  }
  function separate() {
    rebuildLists();
    const structs = STRUCTS; structs.length = 0; // reused every step (no garbage)
    for (const s of SIDES) { for (const t of G.sides[s].towers) if (t.alive) structs.push(t); for (const t of G.sides[s].blds) if (t.alive) structs.push(t); }
    for (const { cx, cz, list: cell } of grid.values()) {
      if (!cell.length) continue;
      for (let i = 0; i < cell.length; i++) {
        const a = cell[i];
        if (a.dropT > 0) continue;
        // same cell (each pair once) and the 4 forward neighbours (each neighbouring pair once)
        for (let j = i + 1; j < cell.length; j++) { const b = cell[j]; if (b.air === a.air && b.dropT <= 0) pushApart(a, b); }
        for (const [ox, oz] of NEIGH) {
          const nb = grid.get(cellKey(cx + ox, cz + oz));
          if (nb) for (const b of nb.list) if (b.air === a.air && b.dropT <= 0) pushApart(a, b);
        }
        if (!a.air) for (const t of structs) pushApart(a, t);
      }
    }
    // the chasm: ground troops only on the bridges (jumpers hop over it)
    for (const u of G.ents) {
      if (u.kind !== 'troop' || !u.alive) continue;
      u.x = clamp(u.x, -8.7, 8.7); u.z = clamp(u.z, -15.7, 15.7);
      if (u.air || u.dropT > 0) continue;
      if (u.card.jump) { const a = Math.abs(u.z); u.elev = a < BAL.river + 0.9 ? Math.sin((1 - a / (BAL.river + 0.9)) * Math.PI / 2) * 1.1 : 0; continue; }
      if (Math.abs(u.z) < BAL.river + 0.2 && !onBridge(u.x, u.r)) {
        if (u.prevZ != null) u.z = (u.prevZ < 0 ? -1 : 1) * (BAL.river + 0.2);
      }
      if (Math.abs(u.z) < BAL.river + 0.2) { const bx = u.x < 0 ? -BAL.bridgeX : BAL.bridgeX; u.x = clamp(u.x, bx - BAL.bridgeW + u.r * 0.35, bx + BAL.bridgeW - u.r * 0.35); }
      u.prevZ = u.z;
    }
  }

  function step(dt) {
    if (G.phase !== 'play') return;
    G.time += dt;
    G.clock -= dt;
    const rush = G.opts.mode === 1 || !!(G.mut && G.mut.rush);
    // announcer cues: thirty seconds left, your king in danger (once each per match)
    if (!G.overtime && G.clock <= 30 && !G.said30) { G.said30 = true; say('ann:timelimit', 1, 2); }
    if (!G.saidKing) { const kg = G.sides.blue.towers.find((t) => t.type === 'king'); if (kg && kg.alive && kg.hp < kg.max * 0.3) { G.saidKing = true; say('ann:becareful', 1, 3); } }
    const mult = G.overtime ? 3 : rush || G.clock <= BAL.doubleAt ? 2 : 1;
    if (mult !== G.mult) {
      G.mult = mult;
      UI.banner(mult === 2 ? '에너지 2배!' : '에너지 3배!', 'warn');
      energySurge();
      logEvent(mult === 2 ? '에너지 2배 돌입' : '에너지 3배 돌입');
      SFX.play('warning', 0.5);
      if (mult === 2) SFX.music('battle2');
    }
    for (const side of ['blue', 'red']) {
      const S = G.sides[side];
      const k = S.ai ? S.ai.diff.elixirK : 1;
      const before = S.elixir, gain = dt / BAL.elixirRate * mult * k * (G.mut && G.mut.elixir || 1);
      S.elixir = Math.min(BAL.elixirMax, S.elixir + gain);
      const spill = Math.max(0, before + gain - BAL.elixirMax);
      G.stats[side].wasted += spill; // only what spilled over the cap
      if (side === 'blue' && spill > 0 && (S.leakAcc = (S.leakAcc || 0) + spill) >= 1) { S.leakAcc -= 1; UI.elixirLeak && UI.elixirLeak(); } // each whole point lost: the bar flashes red
      if (before < BAL.elixirMax && S.elixir >= BAL.elixirMax) S.fullT = 0;
      if (S.elixir >= BAL.elixirMax) S.fullT = (S.fullT || 0) + dt;
      if (S.sup && !S.sup.used) S.sup.charge = Math.min(1, S.sup.charge + dt / SUPPORT_TIME); // the commander's support charges over the match
      if (S.ai && supportReady(S)) aiSupport(S);
    }
    if (G.sides.red.ai) aiUpdate(dt);
    for (let i = G.ents.length - 1; i >= 0; i--) {
      const e = G.ents[i];
      if (e.type === 'bld') { e.hitT = Math.max(0, e.hitT - dt); if (updateBuilding(e, dt)) { disposeEnt(e); G.ents.splice(i, 1); } continue; }
      if (e.kind === 'tower') { e.hitT = Math.max(0, e.hitT - dt); updateTower(e, dt); continue; }
      if (e.alive) e.hitT = Math.max(0, e.hitT - dt);
      if (updateTroop(e, dt)) { disposeEnt(e); G.ents.splice(i, 1); }
    }
    separate();
    updateProjs(dt);
    updateZones(dt);
    if (G.clock <= 0) {
      const b = G.sides.blue.crowns, r = G.sides.red.crowns;
      if (!G.overtime && b === r) {
        G.overtime = true; G.clock = BAL.overtime; G.mult = 3; // (no separate 'energy x3' banner over the overtime rule)
        UI.banner('연장전! 먼저 타워를 파괴하면 승리', 'warn');
        energySurge();
        { const gr = document.getElementById('grade'); if (gr) gr.classList.add('ot'); } // overtime: the screen edge glows red until the end
        logEvent('연장전 돌입');
        SFX.music('boss');
        SFX.play('warning');
      } else if (b !== r) endMatch(b > r ? 'blue' : 'red', 'crowns');
      else {
        const low = (s) => Math.min(...G.sides[s].towers.filter((t) => t.alive).map((t) => t.hp / t.max));
        const lb = low('blue'), lr = low('red');
        endMatch(Math.abs(lb - lr) < 1e-6 ? 'draw' : lb > lr ? 'blue' : 'red', 'hp');
      }
    }
  }


  // ── online match (lockstep) ───────────────────────────
  // Both devices run the same match; only inputs travel (cards, skills, support). Each player sees itself as blue at the
  // bottom, so the opponent's inputs arrive mirrored. An input runs MP_DELAY ticks after it was made, on both devices, and
  // a device only steps a tick once the other side has said it has nothing more for it. The host (the side that invited)
  // sends a correction of every unit's health and position twice a second and decides how the match ends.
  const MP_DELAY = 6, MP_DIGEST = 30, MP_STALL = 10000;
  function mpSetup(opts) {
    srng = Math.random; mp = null;
    if (!opts.online) return;
    const o = opts.online;
    mp = { guest: !!o.guest, send: o.send, close: o.close, tick: 0, upTo: -1, mine: [], out: [], theirs: new Map(), digests: new Map(), lastRecv: performance.now(), heard: false, endOK: false, done: false };
    srng = mulberry(o.seed >>> 0);
    G.nextId = 1; // ids are how the two devices name the same unit: both count from 1
  }
  const mpOther = (w) => (w === 'blue' ? 'red' : w === 'red' ? 'blue' : w);
  // a local input: scheduled, sent, run later on both devices
  function mpLocal(cmd) {
    if (!mp || G.phase !== 'play') return false;
    cmd.t = mp.tick + MP_DELAY;
    mp.mine.push(cmd); mp.out.push(cmd);
    return true;
  }
  function mpFlush() {
    if (!mp || mp.done) return;
    mp.send({ u: mp.tick + MP_DELAY - 1, c: mp.out });
    mp.out = [];
  }
  function mpMessage(m) {
    if (!mp) return;
    mp.lastRecv = performance.now(); mp.heard = true;
    if (m.c) for (const c of m.c) { if (!mp.theirs.has(c.t)) mp.theirs.set(c.t, []); mp.theirs.get(c.t).push(c); }
    if (m.u != null) mp.upTo = Math.max(mp.upTo, m.u);
    if (m.d != null && mp.guest) mp.digests.set(m.d, m);
    if (m.em != null && G.phase === 'play') UI.emote('red', m.em);
    if (m.end && mp.guest) { // the host's verdict (from its side: mirror it)
      mp.endOK = true;
      if (m.cr) { G.sides.blue.crowns = m.cr[1]; G.sides.red.crowns = m.cr[0]; UI.crowns(); }
      endMatch(mpOther(m.end), m.why || 'king');
    }
    if (m.bye) mpAbandon(); // the opponent surrendered or left
  }
  function mpAbandon() {
    if (!mp || G.phase !== 'play') return;
    mp.endOK = true;
    G.sides.blue.crowns = Math.max(G.sides.blue.crowns, 3); UI.crowns();
    endMatch('blue', 'surrender');
  }
  // run this tick's inputs, the host's first on both devices
  function mpRun(t) {
    const mine = mp.mine.filter((c) => c.t === t), theirs = mp.theirs.get(t) || [];
    if (mine.length) mp.mine = mp.mine.filter((c) => c.t !== t);
    mp.theirs.delete(t);
    const order = mp.guest ? [[theirs, 'red', -1], [mine, 'blue', 1]] : [[mine, 'blue', 1], [theirs, 'red', -1]];
    for (const [list, side, m] of order) for (const c of list) mpExec(c, side, m);
  }
  function mpExec(c, side, m) {
    const S = G.sides[side];
    if (c.k === 'c') { if (S.hand[c.i] === c.id) playCard(side, c.i, c.x * m, c.z * m); }
    else if (c.k === 's') { const u = G.ents.find((e) => e.id === c.u && e.side === side && e.alive); if (u) useSkillNow(u, c.sp ? { x: c.sp[0] * m, z: c.sp[1] * m } : undefined); }
    else if (c.k === 'p') useSupport(side);
  }
  // after a tick: the host sends its correction; the guest applies the one for this tick
  function mpAfter(t) {
    if (!mp.guest) {
      if (t % MP_DIGEST === 0) {
        const e = [];
        for (const x of G.ents) if (x.alive) e.push([x.id, Math.round(x.hp), Math.round(x.x * 100) / 100, Math.round(x.z * 100) / 100]);
        mp.send({ d: t, n: G.nextId, e, el: [G.sides.blue.elixir, G.sides.red.elixir] });
      }
      return;
    }
    for (const [dt, dg] of mp.digests) if (dt <= t) { mp.digests.delete(dt); mpCorrect(dg); }
  }
  function mpCorrect(dg) {
    const seen = new Set();
    for (const [id, hp, x, z] of dg.e) {
      seen.add(id);
      const e = G.ents.find((q) => q.id === id);
      if (!e || !e.alive) continue;
      if (e.kind === 'troop') { e.x = -x; e.z = -z; } // (the host's field, mirrored)
      if (hp < e.hp - 0.5) damage(e, e.hp - hp, null); else if (hp > e.hp + 0.5) e.hp = Math.min(e.max, hp);
    }
    for (const e of G.ents) if (e.alive && e.id < dg.n && !seen.has(e.id)) damage(e, e.hp + 1, null); // gone on the host: gone here
    G.sides.red.elixir = dg.el[0]; G.sides.blue.elixir = dg.el[1];
  }
  function mpClose() { if (!mp) return; mp.done = true; try { mp.close && mp.close(); } catch (e) { /* gone */ } mp = null; srng = Math.random; }

  function endMatch(winner, reason) {
    if (G.phase !== 'play') return;
    if (mp && mp.guest && !mp.endOK) return; // online: the host decides how the match ends
    if (mp && !mp.guest && !mp.endOK) mp.send({ end: winner, why: reason, cr: [G.sides.blue.crowns, G.sides.red.crowns] });
    if (mp) { mp.done = true; const m0 = mp; setTimeout(() => { if (mp === m0) mpClose(); else try { m0.close && m0.close(); } catch (e) { /* gone */ } }, 3000); } // (wall clock: the game's timers stop under the result screen)
    G.phase = 'ended';
    G.result = winner;
    if (winner !== 'draw') FX.later(0.3, () => say(winner === 'blue' ? (G.sides.blue.crowns >= 3 ? 'ann:perfect' : 'ann:clear') : 'ann:fail', 1, 5));
    for (const e of G.ents) { e.hitT = 0; e.shieldT = 0; e.hasteT = 0; } // nothing stays mid-flash in the final frame
    G.endT = 0;
    deselect();
    for (const e of G.ents) {
      if (!e.alive || !e.sd) continue;
      e.casting = 0;
      if (e.side === winner) { e.sd.speed = 1; e.sd.play(e.sd.has('win') ? 'win' : 'idle', null, true); }
      else { e.sd.speed = 1; e.sd.play('idle', null, true); } // the losers (towers too) stop fighting
    }
    if (winner === 'red') aiEmote(1, 0.9, true); // the victory taunt is allowed after the final whistle
    SFX.music(null);
    SFX.play(winner === 'blue' ? 'win' : winner === 'draw' ? 'clear' : 'fail');
    const cb = G.sides.blue.crowns, cr = G.sides.red.crowns, stats = G.stats, opts = G.opts;
    // every tower fall and phase change, plus the last six champion skills (in battle order)
    const skillIdx = G.log.map((e, i) => (e[3] === 'skill' ? i : -1)).filter((i) => i >= 0).slice(-6);
    stats.log = G.log.filter((e, i) => e[3] !== 'skill' || skillIdx.includes(i));
    G.resultShown = false;
    setTimeout(() => { if (G.opts === opts && G.phase === 'ended' && !G.resultShown) { G.resultShown = true; UI.result(winner, cb, cr, stats, reason); } }, 1800); // once, and only for this match
  }

  // ── AI ────────────────────────────────────────────────
  function aiEmote(i, chance, atEnd) {
    const S = G.sides && G.sides.red;
    if (!S || !S.ai || Math.random() > chance || (!atEnd && G.time - (S.ai.emoteT || -99) < 6)) return; // the end-of-match taunt always gets its turn
    S.ai.emoteT = G.time;
    FX.later(0.4 + Math.random() * 0.6, () => UI.emote('red', i, atEnd)); // on the game clock: a pause holds it back
  }
  // a playable random deck: a win condition, a spell, air defence and splash, then anything unlocked
  let hints = []; // what the opponent's deck was built to answer (shown on the VS screen)
  function buildDeck(faction, arena, style, forPlayer, vs) {
    if (!forPlayer) hints = [];
    const pool = DATA.byFaction(faction).filter((c) => forPlayer || c.arena <= arena); // the player's random deck may draw any card (all open); the opponent stays on its arena's cards
    const pick = (f) => { const l = pool.filter((c) => f(c) && !deck.includes(c.id) && !(c.skill && deck.some((d) => CARD[d].skill))); return l.length ? l[Math.floor(Math.random() * l.length)].id : null; }; // (one hero per deck)
    const deck = [];
    const add = (id) => { if (id && deck.length < 8) deck.push(id); };
    add(pick((c) => c.aim === 'buildings' || (c.type === 'troop' && c.hp >= 2500)));
    // counter-pick against the player's deck: air answers, a building puller, splash for swarms
    if (vs) {
      const V = vs.map((id) => CARD[id]).filter(Boolean);
      if (V.filter((c) => c.air).length >= 2) { hints.push('대공 화력을 보강했습니다'); add(pick((c) => c.type === 'troop' && c.hits === 'all' && (c.splash || c.chain))); add(pick((c) => c.type === 'troop' && c.hits === 'all' && c.range >= 4)); }
      if (V.some((c) => c.aim === 'buildings')) hints.push('건물 공격수를 막을 준비를 했습니다');
      if (V.some((c) => c.aim === 'buildings')) add(pick((c) => c.type === 'building' && (c.dmg || c.wall)) || pick((c) => c.type === 'troop' && c.dmg >= 500));
      if (V.filter((c) => c.count > 1).length >= 2) hints.push('무리 유닛 대응을 준비했습니다');
      if (V.filter((c) => c.count > 1).length >= 2) add(pick((c) => c.splash && c.type === 'troop') || pick((c) => c.spell === 'zone' || c.spell === 'zap'));
    }
    if (style && style.tanks) add(pick((c) => c.aim === 'buildings' || (c.type === 'troop' && c.hp >= 2000))); // a second win condition
    add(pick((c) => c.type === 'spell'));
    add(pick((c) => c.type === 'troop' && c.hits === 'all' && c.range >= 3));
    add(pick((c) => c.type === 'troop' && (c.splash || c.count > 1)));
    add(pick((c) => c.type === 'troop' && c.cost <= 3));
    if (Math.random() < 0.45) add(pick((c) => c.type === 'building'));
    // a champion (the opponent may field one from the next arena: a preview of what is coming)
    if (Math.random() < 0.7 && !deck.some((d) => CARD[d].skill)) {
      const ch = DATA.byFaction(faction).filter((c) => c.rarity === 3 && (forPlayer || c.arena <= arena + 1) && !deck.includes(c.id));
      if (ch.length) add(ch[Math.floor(Math.random() * ch.length)].id);
    }
    while (deck.length < 8) { const id = pick((c) => c.type === 'troop' || (c.type === 'spell' && deck.filter((d) => CARD[d].type === 'spell').length < 2)); if (!id) break; add(id); }
    return deck;
  }
  function aiPlayable(S) { return S.hand.map((id, i) => ({ id, i, c: CARD[id] })).filter((o) => o.c.cost <= S.elixir + 1e-6); }
  function aiPlace(S, idx, x, z) {
    for (let k = 0; k < 14; k++) {
      const px = clamp(x + (k % 2 ? 1 : -1) * Math.floor(k / 2) * 0.5, -8.5, 8.5), pz = clamp(z + Math.floor(k / 4) * 0.6, BAL.deployDepth + 0.1, 15.5);
      if (canDeploy('red', px, pz)) return playCard('red', idx, px, pz);
    }
    return false;
  }
  // how many enemies a line skill from u toward (x, z) would cross
  function lineCount(u, x, z, reach, w, list, ground) {
    const dx = x - u.x, dz = z - u.z, Ld = Math.hypot(dx, dz) || 1;
    let n = 0;
    for (const o of list) {
      if (ground && o.air) continue; // a dash cannot touch flyers
      const px = o.x - u.x, pz = o.z - u.z, al = (px * dx + pz * dz) / Ld;
      if (al > -0.3 && al <= reach && Math.abs(px * dz - pz * dx) / Ld <= w + o.r) n += o.kind === 'tower' ? 2 : 1;
    }
    return n;
  }
  // the densest line through any enemy in reach: [x, z, count] (one candidate list for the whole search)
  function bestLine(u, reach, w, ground) {
    const list = enemiesNear(u.side, u.x, u.z, reach);
    let best = null;
    for (const o of list) { if (ground && o.air) continue; const n = lineCount(u, o.x, o.z, ground ? dashPath(u, o.x, o.z)[2] + 1 : reach, w, list, ground); if (!best || n > best[2]) best = [o.x, o.z, n]; }
    return best;
  }
  // a tower or a heavy hitter has this unit in its sights (worth a shield before the damage lands)
  function underFire(u) {
    for (const t of G.sides[other(u.side)].towers) if (t.alive && t.target === u) return true;
    for (const o of (G.troops ? G.troops[other(u.side)] : [])) if (o.alive && o.target === u && o.atk && o.atk.dmg >= 300) return true;
    return false;
  }
  function aiSkills(S) {
    for (const u of G.ents) {
      if (u.side !== 'red' || u.kind !== 'troop' || !skillReady(u)) continue;
      const sk = u.card.skill;
      if (S.elixir < skillCost(u) + (S.ai.diff.reserve * 0.3)) continue;
      let near = enemiesNear('red', u.x, u.z, sk.kind === 'nova' ? sk.radius : sk.reach || 4, sk.kind === 'storm').length, spot = null;
      if (sk.kind === 'laser' || sk.kind === 'dash') { // count only what the line would cross; the cleverer commanders pick the densest line
        const reach = sk.kind === 'laser' ? sk.reach : sk.dist + 1, w = sk.kind === 'laser' ? sk.width : sk.radius;
        const tg = u.target && u.target.alive ? u.target : null;
        const clever = Math.random() < S.ai.diff.smart;
        const ground = sk.kind === 'dash';
        const best = clever ? bestLine(u, reach, w, ground) : tg && !(ground && tg.air) ? [tg.x, tg.z, lineCount(u, tg.x, tg.z, ground ? dashPath(u, tg.x, tg.z)[2] + 1 : reach, w, enemiesNear(u.side, u.x, u.z, reach), ground)] : null;
        near = best ? best[2] : 0;
        if (best) spot = { x: best[0], z: best[1] }; // aimed at what was counted (never a flyer for a dash)
      }
      const atTower = u.target && u.target.kind === 'tower' && u.state === 'attack';
      // combos: frozen or stunned enemies in reach are a free hit; on its own half a sharp commander saves area skills for a real crowd (defence)
      const sharp = Math.random() < S.ai.diff.smart;
      const combo = sharp && (sk.kind === 'nova' || sk.kind === 'barrage' || sk.kind === 'storm') && enemiesNear('red', u.x, u.z, sk.kind === 'nova' ? sk.radius : sk.reach || 4, true).some((o) => o.freezeT > 0 || o.stunT > 0);
      const need = sharp && (sk.kind === 'nova' || sk.kind === 'storm' || sk.kind === 'barrage') && u.z > 2 && !atTower ? 3 : 2;
      if (sk.kind === 'barrage') { const L0 = enemiesNear('red', u.x, u.z, sk.reach, true); near = 0; for (const a of L0) { let s = 0; for (const b of L0) if (Math.hypot(a.x - b.x, a.z - b.z) <= sk.radius * 1.5) s++; if (s > near) near = s; } } // the densest cluster a blast can catch
      if (combo || near >= need || atTower || (sk.kind === 'haste' && u.z < 6) || (sk.kind === 'shield' && (u.hp < u.max * 0.6 || underFire(u)))) { useSkill(u, spot); return true; }
    }
    return false;
  }
  function aiUpdate(dt) {
    const S = G.sides.red, ai = S.ai;
    ai.t -= dt;
    if (ai.t > 0) return;
    ai.t = ai.diff.think * (0.7 + Math.random() * 0.6);
    // each commander opens with its own attitude
    if (!ai.greeted && G.time > 2) { ai.greeted = true; aiEmote(ai.style.split ? 3 : ai.style.counter ? 0 : ai.style.tanks ? 1 : 2, 1); }
    if (aiSkills(S)) return;
    const foes = G.troops ? G.troops.blue.filter((e) => e.alive) : [], mine = G.troops ? G.troops.red.filter((e) => e.alive) : [];
    const hand = aiPlayable(S);
    if (!hand.length) return;
    const smart = Math.random() < ai.diff.smart;
    const blueT = G.sides.blue.towers.filter((t) => t.alive);
    // finish a weak tower with a spell
    for (const o of hand.slice().sort((a, b) => a.c.cost - b.c.cost)) { // the cheapest spell that finishes it
      if (o.c.type !== 'spell' || !o.c.dmg) continue;
      const t = blueT.find((tt) => tt.hp <= o.c.dmg * (o.c.spell === 'zone' ? o.c.dur || 1 : 1) * LEVEL.mult(S.lvl) * (o.c.towerK || 0.35)); // a zone burns dps x duration
      if (t && smart) { playCard('red', o.i, t.x, t.z); return; }
    }
    // defend: troops coming at the AI's towers
    const threats = foes.filter((f) => f.z > -2.5).sort((a, b) => b.z - a.z);
    if (threats.length) {
      const lead = threats[0];
      const group = threats.filter((t) => dist(t, lead) < 3.5);
      const value = group.reduce((s, t) => s + t.card.cost / t.card.count, 0);
      const myNear = mine.filter((m) => dist(m, lead) < 6 && m.deployT <= 0).reduce((s, m) => s + m.card.cost / m.card.count, 0);
      if (myNear >= value * 1.1 && lead.z < 8 && S.elixir < 9) return; // handled (a full bar still goes on the attack)
      const hasAir = group.some((t) => t.air);
      const hp = group.reduce((s, t) => s + t.hp, 0);
      if (group.length >= 3 && smart) {
        const cx = group.reduce((s, t) => s + t.x, 0) / group.length, cz = group.reduce((s, t) => s + t.z, 0) / group.length;
        const sp = hand.filter((o) => o.c.type === 'spell' && (o.c.freeze || o.c.spell === 'zone' || o.c.dmg * LEVEL.mult(S.lvl) >= hp / group.length * 0.5)).sort((a, b) => a.c.cost - b.c.cost)[0];
        if (sp && value >= sp.c.cost) { playCard('red', sp.i, cx, cz + 0.6); return; }
      }
      // a building-hunter is pulled into the middle by a defensive building
      if (lead.card.aim === 'buildings' && !lead.air) {
        const tb = hand.find((o) => o.c.type === 'building' && (o.c.dmg || o.c.wall));
        if (tb) { const bx = clamp(lead.x * 0.3, -2.5, 2.5); for (const bz of [7, 8, 6, 9]) if (canBuild('red', bx, bz, tb.c)) { playCard('red', tb.i, bx, bz); return; } }
      }
      if (lead.z < 4 && value < 4 && S.elixir < 7) return;
      const opts = hand.filter((o) => o.c.type === 'troop' && (!hasAir || o.c.hits === 'all') && o.c.aim !== 'buildings');
      if (opts.length) {
        const score = (c) => {
          let s = c.dmg * c.count / c.rate;
          if (group.length >= 3 && (c.splash || c.count > 1)) s *= 2;
          if (hp > 1800 && c.dmg >= 500) s *= 1.8;
          if (hasAir && c.hits === 'all') s *= 1.3;
          s /= Math.pow(c.cost, 0.6);
          return s * (smart ? 1 : 0.5 + Math.random());
        };
        opts.sort((a, b) => score(b.c) - score(a.c));
        const o = opts[0], c = o.c;
        let x, z;
        if (c.range >= 3) { x = clamp(lead.x * 0.6, -6, 6); z = clamp(Math.max(lead.z + 4, 10), 3, 14); }
        else if (lead.card.aim === 'buildings') { x = clamp(lead.x * 0.4, -3, 3); z = clamp(lead.z + 3, 3, 10); }
        else { x = clamp(lead.x, -8, 8); z = clamp(lead.z + 2.2, 2, 13); }
        if (aiPlace(S, o.i, x, z)) { if (value >= 6) aiEmote(3, 0.25); return; }
      }
      if (S.elixir < 9.5) return;
    }
    // attack
    const reserve = ai.diff.reserve;
    const laneHp = (lane) => { const t = blueT.find((tt) => tt.type === 'princess' && Math.sign(tt.x) === lane); return t ? t.hp : 0; };
    // a push in progress: its own tank, or surviving defenders walking over (counter-push)
    let push = ai.push && ai.push.u.alive && ai.push.u.z > -1 ? ai.push : null;
    if (!push) {
      const walker = mine.filter((m) => m.deployT <= 0 && m.state === 'move' && m.z > -1 && m.z < 7 && m.hp > 500).sort((a, b) => b.hp - a.hp)[0];
      if (walker && (smart || ai.style.counter)) push = { u: walker, lane: walker.x < 0 ? -1 : 1 };
    }
    if (push) {
      // freeze the tower (and its defenders) the push has reached
      const atT = mine.find((m) => m.state === 'attack' && m.target && m.target.kind === 'tower' && m.target.type !== 'bld');
      const fz = hand.find((o) => o.c.type === 'spell' && o.c.freeze);
      if (atT && fz && smart && S.elixir >= fz.c.cost) { playCard('red', fz.i, atT.target.x, atT.target.z + 1); return; }
      // overclock a push that has reached the towers
      const oc = hand.find((o) => o.c.spell === 'rage');
      const atk = mine.filter((m) => m.state === 'attack' && m.z < 2);
      if (oc && atk.length >= 2 && S.elixir >= oc.c.cost + 1) { playCard('red', oc.i, atk[0].x, atk[0].z); return; }
      // copy the push, or mend it once it has taken hits
      const cl = hand.find((o) => o.c.spell === 'clone'), hl = hand.find((o) => o.c.spell === 'heal');
      if (cl && atk.length >= 2 && S.elixir >= cl.c.cost + 1) { playCard('red', cl.i, atk[0].x, atk[0].z); return; }
      const hurt = atk.filter((m) => m.hp < m.max * 0.5);
      if (hl && hurt.length >= 2 && S.elixir >= hl.c.cost) { playCard('red', hl.i, hurt[0].x, hurt[0].z); return; }
      const sup = hand.filter((o) => o.c.type === 'troop' && o.c.aim !== 'buildings').sort((a, b) => b.c.range - a.c.range)[0];
      if (sup && S.elixir >= sup.c.cost + reserve * 0.5) { aiPlace(S, sup.i, push.u.x + rnd(-0.5, 0.5), Math.max(push.u.z + 2, 2)); return; }
    }
    const lb = G.lastBlue, punish = smart && lb && G.time - lb.t < 4 && lb.cost >= 4 && G.sides.blue.elixir < 3 && S.elixir >= 5;
    // a building sitting in a full hand is put to use instead of clogging it
    if (S.elixir >= 9.6) {
      const bo = hand.find((o) => o.c.type === 'building');
      if (bo) {
        const ln = Math.random() < 0.5 ? -1 : 1;
        const spots = bo.c.spawn ? [[ln * 3, 12], [ln * 3, 11]] : bo.c.wall ? [[ln * BAL.bridgeX, 3.4], [ln * 4, 4]] : [[ln * 2.5, 7], [ln * 2, 8]];
        for (const [bx, bz] of spots) if (canBuild('red', bx, bz, bo.c)) { playCard('red', bo.i, bx, bz); return; }
      }
    }
    // elixir counting: a player who just emptied the bar gets pressured early; one sitting on a full bar is not walked into
    const foeE = G.sides.blue.elixir, tempo = smart ? (foeE < 2.5 ? -2 : foeE > 8.5 && S.elixir < 9.5 ? 1.2 : 0) : 0;
    if (!punish && S.elixir < Math.min(BAL.elixirMax - 0.3, ai.diff.attackAt + ai.style.attack + reserve * 0.3 + tempo)) return;
    let lane = Math.random() < 0.5 ? -1 : 1;
    if (punish) { lane = -lb.lane; G.lastBlue = null; aiEmote(3, 0.3); } // the player is out of energy on the other side
    else if (ai.style.split) lane = ai.lane = -ai.lane; // splits pressure across both lanes
    else if (smart) { const l = laneHp(-1), r = laneHp(1); if (l && r) lane = l < r ? -1 : 1; else lane = l ? -1 : r ? 1 : lane; }
    // a spawner goes up behind the king tower to keep the pressure coming
    const sp2 = hand.find((o) => o.c.type === 'building' && o.c.spawn);
    if (sp2 && S.elixir >= sp2.c.cost + 1 && Math.random() < 0.6) { for (const bz of [12, 11, 13]) if (canBuild('red', lane * 3, bz, sp2.c)) { playCard('red', sp2.i, lane * 3, bz); return; } }
    // a fallen princess tower opens the pocket: drop attackers right in it
    if (!laneHp(lane) && Math.random() < 0.5) {
      const atk = hand.filter((o) => o.c.type === 'troop' && o.c.cost <= S.elixir).sort((a, b) => b.c.dmg * b.c.count - a.c.dmg * a.c.count)[0];
      if (atk && playCard('red', atk.i, lane * 4, -4.5)) return;
    }
    const tank = hand.filter((o) => o.c.type === 'troop' && (o.c.aim === 'buildings' || o.c.hp >= 2000)).sort((a, b) => b.c.hp - a.c.hp)[0];
    if (tank) {
      const z = tank.c.speed < 1 ? 13.5 : 2.4, x = tank.c.speed < 1 ? lane * 3 : lane * BAL.bridgeX;
      const out = aiPlace(S, tank.i, x, z);
      if (out && out.length) ai.push = { u: out[0], lane };
      return;
    }
    const pick = hand.filter((o) => o.c.type === 'troop').sort((a, b) => (smart ? b.c.hp * b.c.count - a.c.hp * a.c.count : Math.random() - 0.5))[0];
    if (pick) aiPlace(S, pick.i, lane * BAL.bridgeX, pick.c.range >= 4 ? 12 : 3);
  }

  // ── rendering ─────────────────────────────────────────
  function drawZone(card) {
    const key = card ? card.type + ':' + G.sides.blue.blds.length + G.sides.red.blds.length + ':' + G.sides.blue.towers.map((t) => +t.alive).join('') + G.sides.red.towers.map((t) => +t.alive).join('') : '';
    zoneMesh.visible = !!card && card.type !== 'spell';
    if (key === G.zoneKey || !zoneMesh.visible) { G.zoneKey = key; return; }
    G.zoneKey = key;
    const { x0, z1 } = FX_;
    const P = 8;
    const g = zoneCv.getContext('2d');
    g.clearRect(0, 0, zoneCv.width, zoneCv.height);
    g.fillStyle = 'rgba(255,40,60,0.26)';
    for (let z = -16; z < 16; z += 0.5) for (let x = -9; x < 9; x += 0.5) {
      if (!(card.type === 'building' ? canBuild('blue', x + 0.25, z + 0.25, card) : canDeploy('blue', x + 0.25, z + 0.25))) g.fillRect((x - x0) * P, (z1 - z - 0.5) * P, 0.5 * P, 0.5 * P);
    }
    zoneTex.needsUpdate = true;
  }

  const shownBars = [], deployBars = []; // troop health bars / deploy timers drawn this frame (reused arrays)
  function render(dt) {
    for (const e of G.ents) {
      const y = sy(e);
      if (e.kind === 'troop') {
        if (e.kx || e.kz) { const d = Math.max(0, 1 - dt * 14); e.kx *= d; e.kz *= d; if (Math.abs(e.kx) + Math.abs(e.kz) < 0.004) e.kx = e.kz = 0; }
        e.holder.position.set(e.x + (e.kx || 0), y + (e.kz || 0) * TILT, 0);
        e.holder.scale.x = e.face * e.natural;
        const order = L.UNIT - e.z * TILT * 10 + (e.air ? 400 : 0) + (e.dropT > 0 ? 500 : 0);
        if (e.sd) {
          e.sd.setOrder(order);
          if (e.alive) {
            // status tint, written to the materials only when it changes
            const tk = e.freezeT > 0 ? 1 : e.hitT > 0 ? 2 : e.stunT > 0 ? 3 : e.shieldT > 0 ? 4 : e.hasteT > 0 ? 5 : 0;
            tintTo(e, tk, dt);
          }
        }
        e.shadow.x = e.disc.x = e.glow.x = e.x; e.shadow.y = e.disc.y = e.glow.y = e.z * TILT;
        if (e.halo) { e.halo.x = e.x; e.halo.y = y + e.bodyH * 0.5; if (e.alive) e.halo.alpha = e.deployT > 0 ? 0.08 : 0.2; }
        const fall = e.dropT > 0 ? 1 - e.elev / 3 : 1;
        e.shadow.sz = Math.max(1.3, e.r * 3.8) * (0.5 + 0.5 * fall);
        if (e.alive) {
          const show = (e.deployT > 0 || e.hp < e.max) && !(G.opts && G.opts.preview); // (the card preview shows the fight, not health bars)
          if (show) {
            let by = y + e.bodyH * (e.air ? 0.9 : 1.05) + 0.15;
            { const ppu = view.w * camera.zoom / (camera.right - camera.left || 1); for (const t of G.sides.red.towers.concat(G.sides.blue.towers)) { if (!t.alive) continue; const py = (t.z - t.r * 0.85) * TILT + TOWER_E[t.type] * (t.side === 'blue' ? 0.42 : 0.72); if (Math.abs(e.x - t.x) * ppu < 52 && Math.abs(by - py) * ppu < 14) by = py + 15 / ppu; } } // a unit's bar never sits on a tower's plate: it steps up above it
            if (e.deployT > 0) setBar(e.bar, 1 - e.deployT / e.deploy0, e.x, by, 0xcfd6dd);
            else setBar(e.bar, e.hp / e.max, e.x, by, e.shieldT > 0 ? 0xffd040 : teamHex(e.side));
            e.bar.bg.alpha = e.deployT > 0 ? 0.45 : 0.95; // a deploy timer's backing is faint: no dark block over a fresh unit
            if (e.deployT > 0) { // a deploy timer stays a light sliver, and a swarm shows one timer, not one per member
              e.bar.ol.hidden = true;
              let near = false; for (let k = 0; k < deployBars.length; k++) { const o = deployBars[k]; if (Math.abs(o.bg.x - e.x) < 1.6 && Math.abs(o.bg.y - by) < 1.2) { near = true; break; } }
              if (near) hideBar(e.bar); else deployBars.push(e.bar);
            } else shownBars.push(e.bar);
          } else hideBar(e.bar);
          if (e.shieldT > 0 || e.hasteT > 0) for (let n = sparkle(e, dt); n > 0; n--) { SPK.x = e.x + rnd(-0.4, 0.4); SPK.y = y + rnd(0, e.bodyH); SPK.life = 0.45; SPK.size = 0.3; SPK.color = e.shieldT > 0 ? e.card.skill.color : e.hasteColor || 0xd65cff; SPK.tex = FX.tex.dot; FX.particle(SPK); }
          if (e.disc) { const dc = e.hasteT > 0 ? e.hasteColor || 0xd65cff : teamHex(e.side); if (e.disc.color !== dc) e.disc.color = dc; } // a boosted unit's ring takes the boost colour while it lasts
          // your champion's skill is ready: a pulsing ring at its feet points to the button
          if (e.side === 'blue' && e.card.skill && (e.readyT = (e.readyT || 0) - dt) <= 0 && skillReady(e) && G.sides.blue.elixir >= skillCost(e)) {
            e.readyT = 0.7;
            FX.groundRing(e.x, e.z * TILT, 0.3, 1.0, e.card.skill.color, 0.6, 0.55);
          }
          if (e.stunT > 0 && e.freezeT <= 0) { // stunned: two sparks circle over the head while it lasts
            for (let k = 0; k < 2; k++) { const a = amb.t * 9 + k * Math.PI; FX.particle({ x: e.x + Math.cos(a) * 0.32, y: y + e.bodyH + 0.22 + Math.sin(a) * 0.1, life: 0.09, size: 0.26, size1: 0.18, color: 0xffe060, tex: FX.tex.cross, alpha: 1, order: L.FX + 2 }); }
          }
          if (e.freezeT > 0 && Math.random() < 0.15) FX.particle({ x: e.x + rnd(-0.4, 0.4), y: y + rnd(0, e.bodyH), vy: -0.4, life: 0.5, size: 0.22, size1: 0, color: 0xdff8ff, tex: FX.tex.snow });
        }
      } else {
        e.wobT = Math.max(0, (e.wobT || 0) - dt);
        e.holder.position.set(e.x + (e.wobT > 0 ? Math.sin(e.wobT * 110) * 0.06 * e.wobT / 0.14 : 0), e.z * TILT + TOWER_E[e.type] * 0.92, 0);
        e.holder.scale.x = e.face * e.natural;
        e.base.renderOrder = L.UNIT - (e.z - e.r * 0.2) * TILT * 10;
        if (e.sd) {
          e.sd.setOrder(e.base.renderOrder + 0.5);
          if (e.alive && e.active) {
            const tk = e.freezeT > 0 ? 1 : e.hitT > 0 ? 2 : e.stunT > 0 ? 3 : e.hasteT > 0 ? 5 : 0;
            tintTo(e, tk, dt);
          }
          if (e.hasteT > 0) for (let n = sparkle(e, dt); n > 0; n--) { SPK.x = e.x + rnd(-0.5, 0.5); SPK.y = e.z * TILT + TOWER_E[e.type] + rnd(0, 1.2); SPK.life = 0.4; SPK.size = 0.2; SPK.color = e.hasteColor || 0xd65cff; SPK.tex = FX.tex.dot; FX.particle(SPK); }
        }
        const hb = e.hitT > 0 ? 1 + 0.25 * clamp(e.hitT / 0.1, 0, 1) : 1; // eases back from the hit flash, then exactly 1
        if (hb === 1 ? e.baseB !== 1 && e.baseB != null : Math.abs((e.baseB || 1) - hb) > 0.01) { e.baseB = hb; e.base.material.color.setScalar(hb); }
        // damage stages swap in a cracked (50%) and a scorched (25%) bunker
        if (e.alive && e.texKey && e.type !== 'bld') {
          const st = e.hp < e.max * 0.35 ? 2 : e.hp < e.max * 0.7 ? 1 : 0; // damage shows early and builds up
          if (e.stage !== st) { if (st === 2 && !e.fireGlow) e.fireGlow = FX.sprite({ x: e.x, y: e.z * TILT + 0.2, size: e.r * 3.4, aspect: TILT, color: 0xff6a20, alpha: 0.45, tex: FX.tex.glow, order: L.GROUND + 4 }); e.stage = st; e.tintMul0 = e.tintMul0 || e.tintMul || 1; e.tintMul = e.tintMul0; /* (the guard is not darkened either) */ /* the guard on a battered tower is scorched too */ /* a burning tower casts an orange glow on the deck */ const S = G.sides[e.side], k = e.texKey + ':' + st; const tc = towerTex[k] || (towerTex[k] = towerCanvas(e.type, e.side, false, emblems[S.faction], S.faction, st)); e.base.material.map = tc.tex; e.base.material.needsUpdate = true; if (st) { FX.sparks(e.x, e.z * TILT + TOWER_E[e.type], 0xffb060, 14, 4, 0.16, 0.6); FX.shake(0.12); SFX.play('expM', 0.5); } }
        }
        if (e.pad) { if (!e.alive) { FX.kill(e.pad); e.pad = null; } else e.pad.alpha = (0.24 + 0.1 * Math.sin(amb.t * 1.8 + e.x)) * (e.side === 'red' ? 0.55 : 1); } // (the red pool kept fainter: red reads stronger)
        if (e.fireGlow) { if (!e.alive) { FX.kill(e.fireGlow); e.fireGlow = null; } else e.fireGlow.alpha = 0.32 + 0.18 * Math.sin(amb.t * 11 + e.x) * Math.sin(amb.t * 7); }
        // a tower under half health smokes; a ruin keeps a slow plume for the rest of the match
        if (e.type !== 'bld' && (!e.alive || e.hp < e.max * 0.7) && (e.smkT = (e.smkT || 0) - dt) <= 0) {
          e.smkT = !e.alive ? 0.32 : e.hp < e.max * 0.35 ? 0.2 : 0.38;
          FX.particle({ x: e.x + rnd(-0.5, 0.5), y: e.z * TILT + (e.alive ? TOWER_E[e.type] : 0.5) + rnd(0, 0.4), vx: rnd(-0.15, 0.25), vy: rnd(0.6, 1.1), life: rnd(2.2, 3.2), size: 0.7, size1: 3.4, color: 0x6a6e74, alpha: 0.7, normal: true, frames: FX.sheets.smoke, spin: rnd(-1, 1), order: L.FX - 1 });
          if (e.alive && e.hp < e.max * 0.35) for (let fi = 0; fi < 3; fi++) { // tall flickering tongues of flame with a yellow core, rising well above the tower
            const fx0 = e.x + rnd(-0.75, 0.75), fy0 = e.z * TILT + TOWER_E[e.type] + rnd(-0.1, 0.4);
            FX.particle({ x: fx0, y: fy0, vx: rnd(-0.15, 0.15), vy: rnd(2.2, 3.4), life: rnd(0.5, 0.8), size: 0.9, size1: 0.35, aspect: 1.6, color: 0xff6a1a, alpha: 0.95, frames: FX.sheets.fire, spin: rnd(-1, 1), order: L.FX });
            FX.particle({ x: fx0, y: fy0 + 0.2, vy: rnd(1.6, 2.4), life: 0.32, size: 0.45, size1: 0.1, color: 0xffe27a, tex: FX.tex.glow, alpha: 0.9, order: L.FX + 1 });
          }
          if (e.alive && Math.random() < 0.25) FX.particle({ x: e.x + rnd(-0.4, 0.4), y: e.z * TILT + TOWER_E[e.type] + rnd(0, 0.3), vy: rnd(0.4, 0.9), life: 0.5, size: 0.3, size1: 0, color: 0xff9040, tex: FX.tex.dot }); // embers
        }
        e.dmgT = (e.dmgT || 0) - dt;
        if (e.dmgAcc >= 1 && e.dmgT <= 0 && (!e.alive || e.dmgAcc < 20)) { e.dmgAcc = 0; e.dmgT = 0.6; } // (no chip number on a fallen tower, nor a stray -1)
        if (e.dmgAcc >= 20 && e.dmgT <= 0) {
          e.dmgT = 0.6; // hits are summed into one number about twice a second
          const q = toScreen(e.x + rnd(-0.6, 0.6), e.z * TILT + TOWER_E[e.type] + 1.2);
          UI.dmgNum(q[0], q[1], Math.round(e.dmgAcc), e.side);
          e.dmgAcc = 0;
        }
        if (e.aura) e.aura.alpha = (!e.alive ? 0 : !e.active ? 0.06 : (e.target ? 0.26 : 0.14) + Math.sin(amb.t * 3 + e.x) * 0.05) * (e.side === 'red' ? 0.6 : 1); // a soft pool, not a slab
        // the player's plates sit on the front wall of each tower (as in Clash Royale); the opponent's float above
        const p = toScreen(e.x, (e.z - e.r * 0.85) * TILT + TOWER_E[e.type] * (e.side === 'blue' ? 0.42 : 0.72)); // both sides' plates sit on the tower's front wall (the opponent's no longer run under the top HUD, nor hang into its lane)
        const lt = `translate(${Math.round(p[0])}px,${Math.round(p[1])}px)`;
        if (e.labelT !== lt) { e.labelT = lt; e.label.style.transform = lt; } if (e.ammoEl) { const v = e.ammo / e.dagger.ammo; if (e.ammoV !== v) { e.ammoV = v; e.ammoEl.style.setProperty('--ammo', v); } } // the daggers left // written only when it moves (shake)
        if (e.alive) {
          const w = (e.hp / e.max * 100).toFixed(1) + '%';
          if (e.labelW !== w) { e.labelW = w; e.label.firstChild.firstChild.style.width = w; }
          const hv = Math.ceil(e.hp);
          if (e.hpShown !== hv) { if (e.hpShown > hv && G.time - (e.plateT || -1) > 0.25) { e.plateT = G.time; plateHit(e.label); } e.hpShown = hv; e.label.children[1].textContent = hv; const low = e.hp < e.max * 0.3; if (e.labelLow !== low) { e.labelLow = low; e.label.classList.toggle('low', low); } } // a plate under 30% pulses
        }
      }
    }
    // bunched troops: a bar that would sit on another one steps up a row, so each unit's health stays readable
    if (shownBars.length > 1) {
      shownBars.sort((a, b) => a.bg.y - b.bg.y);
      for (let i = 1; i < shownBars.length; i++) {
        const b = shownBars[i];
        for (let j = 0; j < i; j++) {
          const o = shownBars[j];
          if (Math.abs(o.bg.x - b.bg.x) < (o.w + b.w) * 0.5 && Math.abs(o.bg.y - b.bg.y) < 0.18) { const up = o.bg.y + 0.2 - b.bg.y; b.bg.y += up; b.fill.y += up; b.ol.y += up; b.lag.y += up; }
        }
      }
    }
    shownBars.length = 0; deployBars.length = 0;
    for (const e of G.ents) if (e.sd && e.sd.root.visible) e.sd.pose(); // one pose per drawn frame, however many sim steps ran
    updateAmbient(dt);
    updateDecals(dt);
    // camera punch (zoom in and settle)
    if (G.punch > 0) { G.punch = Math.max(0, G.punch - dt * 2.2); camera.zoom = 1 + 0.07 * (G.punchK || 1) * Math.sin(G.punch * Math.PI); camera.updateProjectionMatrix(); }
    // chasm glow drifting
    G.riverT += dt;
    if (G.riverT > 0.12) {
      G.riverT = 0;
      FX.particle({ x: rnd(-9, 9), y: rnd(-0.65, 0.65) * TILT, vx: 0.8, life: 1.6, size: 0.25, size1: 0.05, color: ARENAS[G.arena].glow, alpha: 0.7, tex: FX.tex.dot, order: 2 });
    }
    if (G.ghost) {
      drawZone(G.ghost.card); // cached: redrawn only when a tower or building changes
      const gh = G.ghost;
      gh.grp.visible = gh.on;
      if (gh.on) {
        const ok = gh.card.type === 'spell' || (gh.card.type === 'building' ? canBuild('blue', gh.x, gh.z, gh.card) : canDeploy('blue', gh.x, gh.z));
        gh.ring.position.set(gh.x, gh.z * TILT, 0);
        if (gh.range) gh.range.position.set(gh.x, gh.z * TILT, 0);
        gh.ring.material.color.setHex(ok ? 0xffffff : 0xff4050);
        gh.chars.forEach((c, i) => {
          const [ox, oz] = (FORM[gh.card.count] || FORM[1])[i];
          c.holder.position.set(gh.x + ox, (gh.z + oz) * TILT + (gh.card.air ? AIR_LIFT : 0), 0);
          if (c.sd) { if (c.okTint !== ok) { c.okTint = ok; c.sd.setTint(ok ? 1 : 1.4, ok ? 1 : 0.4, ok ? 1 : 0.4); } c.sd.update(dt); c.sd.pose(); } // tint only when it changes
        });
      }
    }
    FX.draw();
    const [sx, syy] = FX.shakeOffset();
    camera.position.x = sx; camera.position.y = syy;
    if (G.punch > 0 && G.punchAt) { const k = 0.18 * (G.punchK || 1) * Math.sin(G.punch * Math.PI); camera.position.x += G.punchAt[0] * k; camera.position.y += (G.punchAt[1] - (camera.top + camera.bottom) / 2) * k; } // lean toward the falling tower
    FX.setFlashPos(sx, (camera.top + camera.bottom) / 2);
    renderer.info.autoReset = false; renderer.info.reset(); // count the whole frame (scene + every post pass), not just the last pass
    if (composer && QUALITY[perf.level].bloom) composer.render(); else renderer.render(scene, camera);
    perf.calls = renderer.info.render.calls;
  }

  // world <-> stage pixels (camera shake offset and punch zoom included)
  function toScreen(wx, wy) {
    const z = camera.zoom, cx = (camera.left + camera.right) / 2 + camera.position.x, cy = (camera.top + camera.bottom) / 2 + camera.position.y;
    return [((wx - cx) * z / (camera.right - camera.left) + 0.5) * view.w, (0.5 - (wy - cy) * z / (camera.top - camera.bottom)) * view.h];
  }
  function toField(px, py) {
    const z = camera.zoom, cx = (camera.left + camera.right) / 2 + camera.position.x, cy = (camera.top + camera.bottom) / 2 + camera.position.y;
    const wx = cx + (px / view.w - 0.5) * (camera.right - camera.left) / z;
    const wy = cy - (py / view.h - 0.5) * (camera.top - camera.bottom) / z;
    return { x: wx, z: wy / TILT };
  }

  let lastSize = '';
  function resize(force) {
    const w = stageEl.clientWidth, h = stageEl.clientHeight;
    if (!w || !h) return;
    const hudH = Math.min(14, h * 0.02); // no top bar: only the corner overlays sit over the arena, so it uses the full height
    const key = w + 'x' + h + '@' + renderer.getPixelRatio() + ':' + Math.round(hudH);
    if (!force && key === lastSize) return;
    lastSize = key;
    view.w = w; view.h = h;
    renderer.setSize(w, h);
    if (composer) composer.setSize(w, h);
    const fw = 18.3, top = 16.2 * TILT + 3.4, bot = -16.4 * TILT - 0.9, fh = top - bot; // the whole arena in view
    const k = Math.min(w / fw, (h - hudH) / fh);
    const cw = w / k, ch = h / k, spare = 0; // the arena hugs the top of the screen; any spare height goes below it
    camera.left = -cw / 2; camera.right = cw / 2; camera.top = top + hudH / k + spare; camera.bottom = camera.top - ch;
    camera.updateProjectionMatrix();
    fitBack();
  }

  function setQuality(lv, quiet) {
    perf.level = clamp(lv, 0, QUALITY.length - 1);
    const q = QUALITY[perf.level];
    renderer.setPixelRatio(Math.min(q.dpr, window.devicePixelRatio || 1));
    if (composer) composer.setPixelRatio(renderer.getPixelRatio()); // the bloom chain renders at the screen's own density too (it kept the 1x it was made with: everything came out blurred on sharp screens)
    FX.setBudget(q.parts);
    if (bloom) bloom.strength = q.bloom || 0;
    resize(true);
    if (!quiet && G.phase !== 'play' && G.phase !== 'countdown') UI.toast(`그래픽 품질: ${q.name}`); // (the governor's own steps stay silent mid-fight)
  }
  // the screen's own refresh rate (rAF cadence with no game work): decides whether long frames mean "fill-bound" or "a 30 Hz screen".
  // Measured at boot and again whenever the page comes back (power-saving modes can change it); our own frames can only confirm 60 Hz.
  function probeHz() {
    perf.fast = false;
    let n = 0, t0 = 0;
    const tick = (t) => { if (document.hidden) return; if (!t0) t0 = t; if (++n < 31) requestAnimationFrame(tick); else perf.fast = (t - t0) / 30 < 20; };
    requestAnimationFrame(tick);
  }
  probeHz();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) probeHz(); });
  function perfTick(interval, work) {
    if (G.phase !== 'play' || G.paused) { perf.acc = perf.n = perf.work = 0; return; }
    perf.acc += interval; perf.work += work; perf.n++;
    if (perf.n < 120) return;
    const avg = perf.acc / perf.n, wk = perf.work / perf.n;
    perf.fps = Math.round(1000 / avg);
    perf.acc = perf.n = perf.work = 0;
    // our own frame work decides (a throttled / 30 Hz display alone is not a reason to drop quality)
    if (avg < 20) perf.fast = true; // this display can run near 60 Hz (a 30 Hz-capped screen never sets this)
    const slow = wk > 12 || (avg > 30 && wk > 7) || (perf.fast && avg > 30); // long frames on a 60 Hz screen with light JS = GPU/fill-bound: step down too
    perf.slow = slow ? perf.slow + 1 : 0;
    if (UI.save.autoQuality === false) return;
    if (perf.slow >= 2 && perf.level < QUALITY.length - 1) { perf.slow = 0; perf.good = 0; setQuality(perf.level + 1); return; }
    // plenty of headroom for a while: step back up (a busy moment should not cost the whole session)
    perf.good = !slow && wk < 5 && avg < 22 ? (perf.good || 0) + 1 : 0; // light JS but long frames = GPU/fill-bound: never step back up into that
    if (perf.good >= 6 && perf.level > (MOBILE ? 1 : 0)) { perf.good = 0; setQuality(perf.level - 1, true); }
  }

  // ── input ─────────────────────────────────────────────
  function select(i) {
    if (G.phase !== 'play' && G.phase !== 'countdown') return;
    if (G.sel === i) { deselect(); return; }
    deselect();
    const id = G.sides.blue.hand[i];
    const c = CARD[id];
    if (!c) return;
    G.sel = i;
    UI.hand();
    const gh = { card: c, on: false, x: 0, z: -8, grp: new THREE.Group(), chars: [] };
    const rad = c.type === 'spell' ? c.radius : c.type === 'building' ? c.r : Math.max(0.6, c.radius * 1.4);
    gh.ring = quad(c.type === 'spell' ? texRing() : texRing(), 0xffffff, 0.9, true, 6500);
    gh.ring.scale.set(rad * 2.2, rad * 2.2 * TILT, 1);
    gh.grp.add(gh.ring);
    if (c.type !== 'spell' && c.range >= 2) { // attack range preview
      const rr = c.range + (c.radius || c.r);
      gh.range = quad(FX.tex.ring, 0x9fd8ff, 0.35, true, 6490);
      gh.range.scale.set(rr * 2.35, rr * 2.35 * TILT, 1);
      gh.grp.add(gh.range);
    }
    if (c.type === 'troop' && SD.ready(c.rig)) {
      for (let k = 0; k < c.count; k++) {
        const o = { holder: new THREE.Group(), face: 1 };
        gh.grp.add(o.holder);
        attachRig(o, c.rig, c.k * TROOP_K * sizeK(c), c.h && c.h * TROOP_K * sizeK(c), true); // (the drop preview at the unit's size)
        if (o.sd) { o.sd.setOpacity(0.55); o.sd.setOrder(6400); o.holder.scale.x = o.natural; }
        gh.chars.push(o);
      }
    }
    scene.add(gh.grp);
    G.ghost = gh;
    drawZone(c);
  }
  let ringTex = null;
  function texRing() {
    if (ringTex) return ringTex;
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const g = cv.getContext('2d');
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 5; g.setLineDash([12, 8]); g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.stroke();
    return (ringTex = new THREE.CanvasTexture(cv));
  }
  function deselect() {
    if (G.ghost) {
      G.ghost.chars.forEach((o) => o.sd && SD.release(o.sd));
      G.ghost.ring.material.dispose();
      if (G.ghost.range) G.ghost.range.material.dispose();
      scene.remove(G.ghost.grp);
      G.ghost = null;
    }
    G.sel = -1;
    if (zoneMesh) drawZone(null);
    if (G.sides) UI.hand();
  }
  function ghostAt(px, py) {
    if (!G.ghost) return;
    const f = toField(px, py);
    G.ghost.x = clamp(Math.round(f.x * 2) / 2, -8.5, 8.5);
    G.ghost.z = clamp(Math.round(f.z * 2) / 2, -15.5, 15.5);
    G.ghost.on = true;
  }
  function dropAt(px, py) { // a drop that cannot be played (no energy, a closed spot) cancels the card at once
    if (G.sel < 0 || !G.ghost) return false;
    ghostAt(px, py);
    if (G.phase !== 'play') { UI.toast('전투 시작을 기다리세요'); deselect(); return false; }
    const S = G.sides.blue, c = CARD[S.hand[G.sel]];
    if (S.elixir < c.cost) { UI.toast('에너지가 부족합니다'); SFX.play('fail', 0.4); UI.elixirShake(); deselect(); return false; }
    if ((c.type === 'troop' && !canDeploy('blue', G.ghost.x, G.ghost.z)) || (c.type === 'building' && !canBuild('blue', G.ghost.x, G.ghost.z, c))) { UI.toast(c.type === 'building' ? '건물은 아군 진영의 빈 곳에만 지을 수 있습니다' : '여기에는 배치할 수 없습니다'); SFX.play('fail', 0.4); deselect(); return false; }
    if (mp) { const S = G.sides.blue, id = S.hand[G.sel]; if (CARD[id] && S.elixir >= CARD[id].cost - 1e-6) mpLocal({ k: 'c', i: G.sel, id, x: G.ghost.x, z: G.ghost.z }); } // online: runs on both devices shortly
    else playCard('blue', G.sel, G.ghost.x, G.ghost.z);
    deselect();
    return true;
  }

  function bindInput() {
    const cv = renderer.domElement;
    const pos = (ev) => { const r = cv.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; };
    const aiming = (ev) => UI.aimPid() != null && UI.aimPid() === ev.pointerId;
    cv.addEventListener('pointermove', (ev) => { if (aiming(ev)) return; if (G.sel >= 0 && (ev.pointerType === 'mouse' || ev.buttons)) ghostAt(...pos(ev)); });
    cv.addEventListener('pointerdown', (ev) => { if (aiming(ev)) return; if (G.sel >= 0) ghostAt(...pos(ev)); });
    cv.addEventListener('pointerup', (ev) => { if (aiming(ev)) return; if (G.sel >= 0 && !G.drag) dropAt(...pos(ev)); });
    cv.addEventListener('pointerleave', () => { if (G.ghost && !G.drag) G.ghost.on = false; });
    window.addEventListener('pointermove', (ev) => {
      if (!G.drag || ev.pointerId !== G.drag.pid) return; // only the finger that picked the card up
      const r = cv.getBoundingClientRect();
      const inside = ev.clientY < r.bottom - 4 && ev.clientY > r.top && ev.clientX > r.left && ev.clientX < r.right;
      if (Math.hypot(ev.clientX - G.drag.x0, ev.clientY - G.drag.y0) > 12) G.drag.moved = true;
      if (inside && G.drag.moved) ghostAt(ev.clientX - r.left, ev.clientY - r.top);
      else if (G.ghost) G.ghost.on = false;
      UI.dragCard(G.drag, ev.clientX, ev.clientY, inside && G.drag.moved);
    });
    const end = (ev) => {
      if (!G.drag || ev.pointerId !== G.drag.pid) return;
      const d = G.drag;
      G.drag = null;
      UI.dragCard(null);
      const r = cv.getBoundingClientRect();
      if (d.moved && ev.clientY < r.bottom - 4 && ev.clientY > r.top) dropAt(ev.clientX - r.left, ev.clientY - r.top);
      else if (d.moved || d.wasSel) deselect(); // dragged back to the hand, or tapped the selected card again
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', (ev) => { if (G.drag && ev.pointerId === G.drag.pid) { G.drag = null; UI.dragCard(null); deselect(); } });
    window.addEventListener('keydown', (ev) => {
      if (G.phase !== 'play' && G.phase !== 'countdown') return;
      if (G.paused && ev.key !== 'Escape') return;
      if (ev.repeat || ev.ctrlKey || ev.metaKey || ev.altKey) return; // a held key acts once; Ctrl/Alt/Meta combos stay browser shortcuts
      const di = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(ev.code); if (di >= 0) select(di);
      const si = ['KeyQ', 'KeyW', 'KeyE'].indexOf(ev.code); // Q / W / E by physical key: works under the Korean IME too
      if (si >= 0 && UI.aimPid() == null) { const b = document.querySelectorAll('#skillBar .skb')[si], u = b && G.ents.find((e) => e.id === +b.dataset.id && e.alive); if (u) UI.fireSkill(u); }
      if (ev.key === 'Escape') {
        const dlg = [...document.querySelectorAll('.ov:not([hidden])')].find((o) => o.id !== 'pauseOv' && o.id !== 'loading');
        if (dlg) { dlg.hidden = true; return; } // a dialog over the pause menu closes first
        if (G.sel >= 0) deselect(); else UI.pause(!G.paused);
      }
    });
  }
  function cardDown(i, ev) {
    if (G.phase !== 'play' && G.phase !== 'countdown') return;
    if (G.drag) return; // a second finger while one card is held
    const wasSel = G.sel === i;
    if (!wasSel) select(i);
    G.drag = { i, x0: ev.clientX, y0: ev.clientY, moved: false, wasSel, pid: ev.pointerId };
  }
  // the side's champions on the field (newest first)
  // the side's champions on the field, newest first (computed once per frame for the HUD)
  // one cache per side, invalidated by the step clock and by any new spawn (G.nextId) in between
  const champCache = { blue: { t: -1, n: -1, list: [] }, red: { t: -1, n: -1, list: [] } };
  function champions(side) {
    const c = champCache[side];
    if (c.t === G.time && c.n === G.nextId) return c.list;
    c.t = G.time; c.n = G.nextId;
    return (c.list = G.ents.filter((e) => e.side === side && e.kind === 'troop' && e.alive && e.card.skill).reverse());
  }

  // ── match setup ───────────────────────────────────────
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(srng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function makeSide(side, faction, deck, ai, levels, lvl) {
    const d = shuffle(deck.slice());
    return { side, faction, deck: d, hand: d.slice(0, 4), queue: d.slice(4), elixir: BAL.elixirStart, crowns: 0, towers: [], blds: [], ai, levels, lvl, syn: DATA.synergyOf(deck), sup: { charge: 0, used: false } };
  }

  function clearBattle() {
    deselect();
    G.ents.forEach(disposeEnt);
    G.bfx.forEach((b) => b.inst.dispose());
    G.sfx.forEach((s) => s.dispose());
    while (G.decals.length) dropDecal(0);
    if (camera) { camera.zoom = 1; camera.position.x = camera.position.y = 0; camera.updateProjectionMatrix(); }
    G.ents = []; G.projs = []; G.bfx = []; G.sfx = []; G.zones = []; G.punch = 0;
    aimHide();
    G.drag = null; G.errShown = false; G.slowmo = 0; G.hitStop = 0; G.surge = 0; G.said30 = G.saidKing = false; { const gr = document.getElementById('grade'); if (gr) gr.classList.remove('ot', 'danger'); } G.lastBlue = null; G.troops = { blue: [], red: [] };
    (G.after || []).forEach(({ hold, c }) => { scene.remove(hold); SD.release(c); }); G.after = [];
    FX.clear();
    FXB.trimPools(4);
    if (labelsEl) labelsEl.innerHTML = '';
  }

  const floorImg = {}; // floor art by url (null while loading)
  function setArena(a) {
    const fu = location.protocol !== 'file:' && ARENAS[a].floor; // (from file:// the image would taint the floor texture: keep the drawn floor there)
    if (fu && !(fu in floorImg)) { floorImg[fu] = null; const im = new Image(); im.onload = () => { floorImg[fu] = im; if (G.arenaDrawn === a) { G.arenaDrawn = -1; setArena(a); } }; im.src = fu; } // redrawn with the art once it arrives
    const ik = G.ironHalves ? (G.ironHalves.home ? 'h' : '') + (G.ironHalves.far ? 'f' : '') : 'f';
    if (G.arenaDrawn === a && G.ironDrawn === ik) return;
    G.arenaDrawn = a; G.ironDrawn = ik;
    const cv = fieldCanvas(ARENAS[a]);
    if (fieldTex && fieldTex.image === cv) fieldTex.needsUpdate = true; // the same canvas: re-upload, no new texture
    else { if (fieldTex) fieldTex.dispose(); fieldTex = new THREE.CanvasTexture(cv); fieldTex.anisotropy = 4; }
    fieldMesh.material.map = fieldTex;
    fieldMesh.material.needsUpdate = true;
    if (amb.river) { amb.river.material.color.setHex(ARENAS[a].glow); if (amb.river2) amb.river2.material.color.setHex(ARENAS[a].glow); amb.lamps.forEach((l) => { l.color = ARENAS[a].glow; }); }
    setBackdrop(a);
    const bf = document.getElementById('bgFill'); if (bf) bf.style.backgroundImage = `url(${ARENAS[a].bg})`;
    // per-arena colour grade: a tinted vignette over the 3D view (DOM, costs no GPU pass)
    const gr = document.getElementById('grade'), c = ARENAS[a].glow;
    if (gr) gr.style.setProperty('--gr', `${c >> 16 & 255},${c >> 8 & 255},${c & 255}`);
  }
  // the arena's original background art behind the floor (seen above and below the field), dimmed
  function setBackdrop(a) {
    if (amb.back) {
      const url = ARENAS[a].bg;
      const use = (tx) => {
        amb.back.material.map = tx; amb.back.material.needsUpdate = true; amb.back.visible = true; fitBack();
        for (const k in bgTex) if (bgTex[k] !== tx) { bgTex[k].dispose(); delete bgTex[k]; } // only the arena on show keeps its backdrop on the GPU
      };
      setBackdropTint(a);
      amb.back.visible = false;
      if (bgTex[url]) use(bgTex[url]);
      else if (url) new THREE.TextureLoader().load(url, (tx) => { if (G.arenaDrawn !== a) { tx.dispose(); return; } bgTex[url] = tx; use(tx); }, undefined, () => {}); // file://: stays dark; a late load for an arena already left is dropped
    }
  }
  const bgTex = {};
  function setBackdropTint(a) { const c = ARENAS[a].glow; if (amb.back2) amb.back2.material.color.setHex(c); if (amb.veil) amb.veil.material.color.setHex(c); }
  function fitBack() {
    const m = amb.back, tx = m && m.material.map;
    if (!tx || !tx.image) return;
    const cw = camera.right - camera.left, ch = camera.top - camera.bottom, ia = tx.image.width / tx.image.height;
    if (ia > cw / ch) m.scale.set(ch * ia, ch, 1); else m.scale.set(cw, cw / ia, 1);
    amb.backS = [m.scale.x, m.scale.y]; // base size: updateAmbient breathes around it
    m.position.set(0, (camera.top + camera.bottom) / 2, 0);
  }

  // ── living arena: scrolling energy in the chasm, light sweeps, rim lamps ──
  const amb = { river: null, sweep: null, lamps: [], t: 0, sweepT: 4, back: null };
  function buildAmbient() {
    amb.back = quad(null, 0x3a4149, 1, false, -20); // dimmed hard: the art frames the arena, it must not compete with it
    amb.back.material.transparent = false;
    amb.back.visible = false;
    scene.add(amb.back);
    // two layers of the original fog texture (tiling noise) drifting at different speeds: haze behind the deck and a faint veil over it
    amb.back2 = quad(null, 0xffffff, 0.14, true, -19);
    amb.back2.visible = false;
    scene.add(amb.back2);
    amb.veil = quad(null, 0xffffff, 0.035, true, L.GROUND + 40);
    amb.veil.visible = false;
    scene.add(amb.veil);
    new THREE.TextureLoader().load('assets/bg/haze.png', (tx) => {
      tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
      const tx2 = tx.clone(); tx2.needsUpdate = true;
      tx.repeat.set(1.6, 2.4); tx2.repeat.set(1.1, 1.7);
      amb.back2.material.map = tx; amb.back2.material.needsUpdate = true; amb.back2.visible = true;
      amb.veil.material.map = tx2; amb.veil.material.needsUpdate = true; amb.veil.visible = true;
      setBackdropTint(G.arenaDrawn || 0);
    }, undefined, () => {});
    // a horizontally tiling band of energy streaks, scrolled every frame
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
    const g = cv.getContext('2d');
    for (let i = 0; i < 26; i++) {
      const y = 6 + Math.random() * 52, x = Math.random() * 256, w = 20 + Math.random() * 70;
      const gr = g.createLinearGradient(x, 0, x + w, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, `rgba(255,255,255,${0.25 + Math.random() * 0.5})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(x, y, w, 1.5 + Math.random() * 2);
      if (x + w > 256) g.fillRect(x - 256, y, w, 2); // wrap
    }
    const tx = new THREE.CanvasTexture(cv);
    tx.wrapS = THREE.RepeatWrapping; tx.repeat.set(3, 1);
    amb.river = quad(tx, ARENAS[0].glow, 0.55, true, -9);
    amb.river.scale.set(18, BAL.river * 2 * TILT * 0.9, 1);
    scene.add(amb.river);
    // a second, slower current the other way: the chasm reads as flowing energy with depth
    const tx2 = tx.clone(); tx2.needsUpdate = true; tx2.repeat.set(1.6, 1);
    amb.river2 = quad(tx2, ARENAS[0].glow, 0.35, true, -9.5);
    amb.river2.scale.set(18, BAL.river * 2 * TILT * 0.75, 1);
    scene.add(amb.river2);
    // foam along both banks: broken bright streaks drifting opposite ways (the chasm edge reads as moving water/energy)
    { const fc = document.createElement('canvas'); fc.width = 256; fc.height = 8; const fg = fc.getContext('2d');
      for (let i = 0; i < 18; i++) { const x = Math.random() * 256, w = 6 + Math.random() * 26, gr = fg.createLinearGradient(x, 0, x + w, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); fg.fillStyle = gr; fg.fillRect(x, 2 + Math.random() * 3, w, 2); }
      const ft = new THREE.CanvasTexture(fc); ft.wrapS = THREE.RepeatWrapping; ft.repeat.set(3, 1);
      amb.foam = [-1, 1].map((sg) => { const q = quad(ft, 0xffffff, 0.4, true, -8.8); q.scale.set(18 * sg, 0.32, 1); /* one shared texture: the mirrored quad drifts the other way */ q.position.set(0, sg * (BAL.river * TILT - 0.3), 0); scene.add(q); return q; }); }
    // a soft diagonal light sweep that crosses the floor now and then
    const sc = document.createElement('canvas'); sc.width = 128; sc.height = 4;
    const sg = sc.getContext('2d'), sgr = sg.createLinearGradient(0, 0, 128, 0);
    sgr.addColorStop(0, 'rgba(255,255,255,0)'); sgr.addColorStop(0.5, 'rgba(255,255,255,1)'); sgr.addColorStop(1, 'rgba(255,255,255,0)');
    sg.fillStyle = sgr; sg.fillRect(0, 0, 128, 4);
    amb.sweep = quad(new THREE.CanvasTexture(sc), 0xbfdfff, 0, true, -8);
    amb.sweep.scale.set(4, 40, 1); amb.sweep.rotation.z = -0.5;
    scene.add(amb.sweep);
    // lamps on the arena rim
    for (const sx of [-1, 1]) for (let z = -14; z <= 14; z += 7) {
      const lp = FX.sprite({ x: sx * 9.45, y: z * TILT, size: 0.7, color: ARENAS[0].glow, alpha: 0.6, tex: FX.tex.glow, order: L.GROUND }); lp.fz = z; amb.lamps.push(lp);
    }
    setBackdrop(G.arenaDrawn || 0);
  }
  function updateAmbient(dt) {
    amb.t += dt;
    if (aimMarks.length) aimMarks[0].alpha = 0.65 + 0.3 * Math.sin(amb.t * 9); // the aim reticle pulses
    if (amb.river) { amb.river.material.map.offset.x -= dt * 0.12; amb.river.material.opacity = Math.min(1, 0.58 + Math.sin(amb.t * 2.1) * 0.12 + G.surge * 0.42); }
    if (G.surge > 0) G.surge = Math.max(0, G.surge - dt * 0.7);
    if (amb.foam) { const on = perf.level < 2; amb.foam[0].visible = amb.foam[1].visible = on; if (on) amb.foam[0].material.map.offset.x += dt * 0.06; } // (low quality: no foam, fewer full-width layers)
    if (amb.river2) { amb.river2.material.map.offset.x += dt * 0.05; amb.river2.material.opacity = 0.35 + Math.sin(amb.t * 1.3 + 1) * 0.1; }
    amb.lamps.forEach((l, i) => { l.alpha = 0.35 + 0.3 * Math.max(0, Math.sin(amb.t * 1.7 + i * 1.3)); });
    // the backdrop art drifts and breathes very slowly (a living scene behind the floor, no extra pass)
    if (amb.back && amb.back.visible && amb.backS) { const k = 1.04 + 0.02 * Math.sin(amb.t * 0.11); amb.back.scale.set(amb.backS[0] * k, amb.backS[1] * k, 1); amb.back.position.x = Math.sin(amb.t * 0.07) * 0.45;
    }
    // the haze drifts one way behind the deck and the veil the other way over it (true parallax: different layers, speeds and scales)
    if (amb.back2 && amb.back2.material.map) amb.back2.visible = amb.veil.visible = perf.level === 0; // two full-screen fog layers cost fill rate every frame: high quality only (phones start on medium)
    if (amb.back2 && amb.back2.visible) {
      const cw = camera.right - camera.left, ch = camera.top - camera.bottom, cy = (camera.top + camera.bottom) / 2;
      amb.back2.scale.set(cw * 1.1, ch * 1.1, 1); amb.back2.position.set(0, cy, 0);
      amb.back2.material.map.offset.set(amb.t * 0.006, amb.t * 0.0025); amb.back2.material.opacity = 0.09 + 0.03 * Math.sin(amb.t * 0.3);
      amb.veil.scale.set(cw * 1.05, ch * 1.05, 1); amb.veil.position.set(0, cy, 0);
      amb.veil.material.map.offset.set(-amb.t * 0.011, amb.t * 0.004); amb.veil.material.opacity = 0.035;
    }
    // drifting motes in the arena's light colour
    amb.moteT = (amb.moteT || 0) - dt;
    if (amb.moteT <= 0 && QUALITY[perf.level].bloom && (G.phase === 'play' || G.phase === 'countdown')) {
      amb.moteT = 0.18;
      FX.particle({ x: rnd(-9, 9), y: rnd(-16, 15) * TILT, vx: rnd(-0.15, 0.15), vy: rnd(0.15, 0.45), life: rnd(3, 5), size: rnd(0.16, 0.28), size1: 0.04, color: ARENAS[G.arenaDrawn || 0].glow, tex: FX.tex.glow, alpha: 0.7, fadeIn: 1, order: L.GROUND + 50 });
      if (Math.random() < 0.5) FX.particle({ x: rnd(-9, 9), y: rnd(-16, 15) * TILT, vx: rnd(0.2, 0.5), vy: rnd(-0.05, 0.1), life: rnd(2.5, 4), size: rnd(0.09, 0.14), size1: 0.06, color: 0x3a342e, tex: FX.tex.dot, alpha: 0.55, normal: true, fadeIn: 0.8, spin: rnd(-2, 2), order: L.GROUND + 49 }); // dust and ash drift across the bright deck (the light motes alone vanish on it)
    }
    amb.sweepT -= dt;
    if (amb.sweepT <= 0) { amb.sweepT = 9 + Math.random() * 6; amb.sweepX = -16; }
    if (amb.sweepX != null && amb.sweep) {
      amb.sweepX += dt * 9;
      amb.sweep.position.set(amb.sweepX, 0, 0);
      amb.sweep.material.opacity = 0.09 * Math.max(0, 1 - Math.abs(amb.sweepX) / 16);
      if (amb.sweepX > 16) { amb.sweepX = null; amb.sweep.material.opacity = 0; }
    }
  }

  // opts: { faction, deck, diff, mode, levels, arena, foe }
  async function start(opts) {
    previewStop();
    clearBattle();
    G.opts = opts;
    if (window.SFX && SFX.warm) {
      SFX.warm(['rankUp', 'charge', 'reinforce', 'missile', 'warning', 'expB', 'quake', 'energy']); // big-moment sounds ready before they first play
      SFX.warm(['3', '2', '1', 'gamestart', 'timelimit', 'becareful', 'nice', 'great', 'aamazing', 'danger', 'bossalert', 'clear', 'perfect', 'fail', 'notready', '10', '9', '8', '7', '6', '5', '4'].map((k) => 'ann:' + k));
      const vc = new Set(); for (const id of (opts.deck || []).concat(opts.foeDeck || [])) { const c = CARD[id]; if (c && voiced(c)) ['deploy', 'skill', 'win'].forEach((k) => vc.add('unit:' + id + '_' + k)); } // this match's voices
      if (SFX.phone && SFX.forget) SFX.forget('unit:', vc);
      SFX.warm([...vc]);
    }
    G.arena = opts.arena || 0;
    G.mut = opts.mode === 3 ? opts.mut || DATA.mutatorOf() : null;
    G.opDay = DATA.dayIndex(); // credited to the day the rule was drawn (a match may end past midnight)
    // practice: the opponent's faction comes with the deck the player picked for it; mirror: the same faction too
    const practice = opts.mode === 4 && Array.isArray(opts.foeDeck) && opts.foeDeck.length === 8 && opts.foeDeck.every((id) => CARD[id]);
    const foeF = (practice || opts.online) && FACTIONS[opts.foeFaction] ? opts.foeFaction : G.mut && G.mut.mirror ? opts.faction : opts.faction === 'orca' ? 'iron' : 'orca';
    G.ironHalves = { home: opts.faction === 'iron', far: foeF === 'iron' }; // the floor shows which half the iron side holds
    setArena(G.arena);
    const diff = BAL.diffs[opts.diff] || BAL.diffs[1];
    const style = DATA.STYLES[(opts.foe && opts.foe.style) || 'balanced'];
    const aiDeck0 = practice ? opts.foeDeck.slice() : buildDeck(foeF, G.arena, style, false, opts.mode === 2 ? null : opts.deck);
    const myDeck = opts.mode === 2 ? buildDeck(opts.faction, G.arena, null, true) : opts.deck; // random-deck mode (unlocked cards only)
    const aiDeck = G.mut && G.mut.mirror ? myDeck.slice() : aiDeck0; // mirror operation: the same eight cards
    G.hints = G.mut && G.mut.mirror ? ['당신과 똑같은 덱으로 맞섭니다'] : hints.slice();
    // the opponent is matched to the arena and to the player's deck level (difficulty shifts it by one)
    const myLvl = myDeck.reduce((s, id) => s + ((opts.levels || {})[id] || LEVEL.min), 0) / myDeck.length;
    // mostly the player's own deck level (a small arena floor): out-levelling must not become a wall either way
    const aiLvl = LEVEL.fixed || clamp(Math.round(myLvl * 0.8 + ARENAS[G.arena].lvl * 0.2 + diff.lvl), LEVEL.min, LEVEL.max); // (fixed: every card at one level for now)
    mpSetup(opts);
    // online: the opponent's own deck and levels, no AI; both devices shuffle the host's deck first (same draws)
    const redDeck = mp ? opts.foeDeck.slice() : aiDeck, redAi = mp ? null : { diff, style, t: 3 + Math.random() * 2, push: null, lane: Math.random() < 0.5 ? -1 : 1 };
    const mk = { blue: () => makeSide('blue', opts.faction, myDeck, null, opts.levels || {}, LEVEL.min), red: () => makeSide('red', mp ? opts.foeFaction : foeF, redDeck, redAi, mp ? opts.foeLevels || {} : null, aiLvl) };
    const first = mp && mp.guest ? 'red' : 'blue', second = first === 'blue' ? 'red' : 'blue';
    G.sides = {}; G.sides[first] = mk[first](); G.sides[second] = mk[second]();
    const st0 = () => ({ dmg: 0, kills: 0, spent: 0, wasted: 0, skills: 0, cards: 0, by: {} });
    G.stats = { blue: st0(), red: st0() };
    if (window.SFX && SFX.warm) SFX.warm(G.sides.red.deck.filter((id) => voiced(CARD[id]) && CARD[id].skill).map((id) => 'unit:' + id + '_skill')); // an orca opponent's champions call their skills too
    G.log = [];
    G.phase = 'loading';
    // every rig and baked effect this match can show
    const rigs = new Set(), fxs = new Set();
    for (const s of ['blue', 'red']) {
      const f = FACTIONS[G.sides[s].faction];
      rigs.add(f.king.rig); rigs.add(f.princess.rig); if (f.princessR) rigs.add(f.princessR.rig);
      if (G.sides[s].faction === 'iron') rigs.add(CARD.drone.rig); // the commander's support call drops drones
      G.sides[s].deck.forEach((id) => {
        const c = CARD[id];
        if (c.rig) rigs.add(c.rig);
        if (c.guard) rigs.add(c.guard.rig);
        if (c.spawn) rigs.add(CARD[c.spawn.card].rig);
        if (c.skill && c.skill.kind === 'summon') { rigs.add(CARD[c.skill.card].rig); fxNamesFor(CARD[c.skill.card]).forEach((n) => fxs.add(n)); }
        fxNamesFor(c).forEach((n) => fxs.add(n));
      });
      [f.king, f.princess].forEach((g) => { if (GENERIC_HIT[g.fx]) fxs.add(GENERIC_HIT[g.fx]); const o = origFor(g.rig, g.fx); if (o) [o.bullet, o.hit, ...o.statics].forEach((n) => n && fxs.add(n)); });
    }
    ['simple_explosion', 'skill_hit_simple'].forEach((n) => fxs.add(n));
    const list = [...rigs], fxl = [...fxs].filter(fxOk);
    // free what the previous matches loaded but this one does not use (GPU memory on phones)
    const towerRigs = new Set(Object.values(FACTIONS).flatMap((f) => [f.king.rig, f.princess.rig].concat(f.princessR ? [f.princessR.rig] : [])));
    const rigCap = MOBILE ? 14 : 40;
    if (SD.loaded().length + list.length > rigCap) SD.loaded().forEach((id) => { if (!rigs.has(id) && !towerRigs.has(id)) SD.evict(id); });
    if (MOBILE || FXB.loaded().length > 60) FXB.loaded().forEach((n) => { if (!fxs.has(n)) FXB.evict(n); });
    const total = list.length + fxl.length;
    let done = 0;
    UI.loading(0, opts);
    const live = () => G.phase === 'loading' && G.opts === opts;
    const tick = () => { if (live()) UI.loading(++done / total); };
    const within = (p, ms) => Promise.race([p.catch(() => null), new Promise((r) => setTimeout(() => r(null), ms))]);
    // effects load alongside the rigs; a missing effect only falls back to particles
    const fxP = Promise.all(fxl.map((n) => within(FXB.prepare(n), 20000).then(tick)));
    // rigs, four at a time (the battle cannot start without them): a stalled file times out and is retried once
    let qi = 0;
    await Promise.all([0, 1, 2, 3].map(async () => {
      while (qi < list.length) {
        const id = list[qi++];
        let t = await within(SD.prepare(id), 20000);
        if (!t && live()) t = await within(SD.prepare(id), 15000);
        if (t && renderer.initTexture) renderer.initTexture(t.atlas.tex);
        tick();
      }
    }));
    if (G.opts === opts) await Promise.race([fxP, new Promise((r) => setTimeout(r, 6000))]);
    if (G.opts !== opts) return; // left during loading
    for (const side of mp && mp.guest ? ['red', 'blue'] : ['blue', 'red']) { // (host's towers first on both devices: the same ids)
      const s = SGN[side], P = BAL.tower.princess, K = BAL.tower.king;
      makeTower(side, 'princess', -P.x, s * P.z);
      makeTower(side, 'princess', P.x, s * P.z);
      makeTower(side, 'king', 0, s * K.z);
    }
    G.time = 0; G.clock = G.mut && G.mut.time || BAL.matchTime; G.overtime = false; G.mult = opts.mode === 1 || G.mut && G.mut.rush ? 2 : 1; G.result = null; G.zoneKey = '';
    try { renderer.compile(scene, camera); } catch (e) { /* pre-warm only */ } // every material of the match compiled now, not on its first frame in the fight
    UI.loaded();
    UI.hand(); UI.crowns();
    G.phase = 'countdown';
    G.cdT = 3.2; G.cdN = null;
    SFX.music(opts.mode === 1 ? 'battle2' : G.arena > 0 && G.arena <= 4 ? 'arena' + G.arena : 'battle'); // each arena has its own battle theme
    resize(true);
  }

  // ── loop ──────────────────────────────────────────────
  let last = 0, acc = 0;
  const DT = 1 / 60;
  // ── card preview (the deck popup): a short staged fight with the real units, skills and effects ──
  // The card's own units (or its spell / building) against a few enemies that stand still and take the hits; the scene
  // repeats every few seconds. It is simulated and drawn by the battle engine with a small camera on the action, and
  // each frame is copied into the popup's canvas (the battle canvas itself stays hidden).
  let pv = null, pvAcc = 0;
  const PV_FOES = { iron: { ground: 'phalangites', air: 'drone', ally: 'nightchick' }, orca: { ground: 'gnome', air: 'harpy', ally: 'brownie' } };
  async function preview(id, cv) {
    const c = CARD[id];
    if (!booted || !c || !cv || ['loading', 'countdown'].includes(G.phase) || (G.phase === 'play' && !pv) || G.phase === 'ended') return false;
    previewStop();
    const fac = c.faction || 'orca', foe = fac === 'iron' ? 'orca' : 'iron', F = PV_FOES[foe];
    const air = c.type !== 'spell' && c.hits !== 'ground' && !c.heal; // a unit that can shoot up also gets a flying target
    const slots = [{ id: F.ground, x: -1.4, z: -2.4 }, { id: F.ground, x: 1.4, z: -2.2 }, { id: air ? F.air : F.ground, x: 0.1, z: -1.4 }];
    const me = { c, cv, ctx: cv.getContext('2d'), fac, foe, slots, ready: false, t: 0, len: c.skill ? 9 : 7, tower: c.aim === 'buildings',
      ally: ['rage', 'clone', 'heal'].includes(c.spell) ? PV_FOES[fac].ally : null };
    pv = me; pvAcc = 0;
    // what it needs: its rigs (units, summons, spawns), the targets, its effects
    const rigs = new Set(), fxs = new Set(['simple_explosion', 'skill_hit_simple']);
    const need = (k) => { const x = CARD[k]; if (!x) return; if (x.rig) rigs.add(x.rig); fxNamesFor(x).forEach((n) => fxs.add(n)); };
    need(id); slots.forEach((s) => need(s.id)); if (me.ally) need(me.ally);
    if (c.guard) rigs.add(c.guard.rig);
    if (c.spawn) need(c.spawn.card);
    if (c.skill && c.skill.kind === 'summon') need(c.skill.card);
    if (me.tower) rigs.add(FACTIONS[foe].princess.rig);
    // browsing many cards must not pile up GPU memory on a phone: what earlier previews loaded and this one does not use goes
    if (SD.loaded().length + rigs.size > (MOBILE ? 14 : 40)) SD.loaded().forEach((r) => { if (!rigs.has(r)) SD.evict(r); });
    if (MOBILE || FXB.loaded().length > 60) FXB.loaded().forEach((n) => { if (!fxs.has(n)) FXB.evict(n); });
    const within = (p, ms) => Promise.race([p.catch(() => null), new Promise((r) => setTimeout(() => r(null), ms))]);
    await Promise.all([...rigs].map((r) => within(SD.prepare(r), 15000).then((t) => { if (t && renderer.initTexture) renderer.initTexture(t.atlas.tex); })).concat([...fxs].filter(fxOk).map((n) => within(FXB.prepare(n), 15000))));
    if (pv !== me || ['loading', 'countdown'].includes(G.phase)) return false; // closed (or a battle began) while loading
    G.opts = { mode: 0, preview: true, faction: fac }; G.mut = null; G.arena = 0;
    G.ironHalves = { home: fac === 'iron', far: foe === 'iron' };
    setArena(0);
    G.phase = 'play'; G.paused = false;
    previewStage(me);
    me.ready = true;
    return true;
  }
  function previewStage(p) {
    clearBattle();
    G.nextId = 1; G.time = 0; G.clock = 999; G.mult = 1; G.overtime = false; G.result = null; G.log = null;
    const st0 = () => ({ dmg: 0, kills: 0, spent: 0, wasted: 0, skills: 0, cards: 0, by: {} });
    G.stats = { blue: st0(), red: st0() };
    G.sides = { blue: makeSide('blue', p.fac, [p.c.id], null, null, LEVEL.min), red: makeSide('red', p.foe, [p.slots[0].id], null, null, LEVEL.min) };
    p.t = 0; p.skilled = false; p.nextCast = 0.9;
    if (p.tower) { const t = makeTower('red', 'princess', 0, -1.4); t.atk.dmg = 0; t.label.hidden = true; }
    p.slots.forEach((s) => { s.u = previewFoe(s); s.wait = 0; });
    if (p.ally) [-0.8, 0.8].forEach((x) => { const u = spawnTroop('blue', CARD[p.ally], x, -5.0, 0, LEVEL.min); if (p.c.spell === 'heal') u.hp = u.max * 0.3; }); // (wounded, for the repair spell)
    if (p.c.type !== 'spell') { pvHand(); playCard('blue', 0, 0, p.c.type === 'building' ? -5.0 : -5.2); }
  }
  // a full hand of the one card (the battle HUD's hand stays valid), energy to play it
  function pvHand() { const S = G.sides.blue, id = pv.c.id; S.elixir = BAL.elixirMax; S.hand = [id, id, id, id]; S.queue = [id]; }
  function previewFoe(s) {
    const u = spawnTroop('red', CARD[s.id], s.x, s.z, 0, LEVEL.min);
    u.hold = true; u.atk = Object.assign({}, u.atk, { dmg: 0 }); u.face = -1;
    return u;
  }
  function previewStep(dt) {
    const p = pv;
    p.t += dt; G.time += dt;
    for (let i = G.ents.length - 1; i >= 0; i--) {
      const e = G.ents[i];
      if (e.type === 'bld') { e.hitT = Math.max(0, e.hitT - dt); if (updateBuilding(e, dt)) { disposeEnt(e); G.ents.splice(i, 1); } continue; }
      if (e.kind === 'tower') { e.hitT = Math.max(0, e.hitT - dt); if (e.sd) e.sd.update(dt); continue; } // (the target tower does not shoot)
      if (e.alive) e.hitT = Math.max(0, e.hitT - dt);
      if (updateTroop(e, dt)) { disposeEnt(e); G.ents.splice(i, 1); }
    }
    separate();
    updateProjs(dt);
    updateZones(dt);
    // a spell is cast on the group again and again; a champion uses its skill once per showing
    if (p.c.type === 'spell' && p.t >= p.nextCast) {
      p.nextCast += 3.2;
      pvHand();
      if (p.ally) playCard('blue', 0, 0, -4.9); else playCard('blue', 0, 0, -2.1);
    }
    if (p.c.skill && !p.skilled && p.t >= 3.4) {
      const h = G.ents.find((e) => e.kind === 'troop' && e.side === 'blue' && e.alive && e.card === p.c && e.deployT <= 0);
      if (h) { p.skilled = true; h.skillCd = 0; G.sides.blue.elixir = BAL.elixirMax; useSkillNow(h); }
    }
    // the targets come back a moment after they fall
    for (const s of p.slots) if (!s.u || !s.u.alive) { s.wait += dt; if (s.wait > 1.3) { s.u = previewFoe(s); s.wait = 0; } }
    if (p.t >= p.len) previewStage(p);
  }
  // the camera on the action: a 10-wide window over the attacker and its targets, in the canvas's shape
  function previewView(p) {
    const cw = p.cv.width, ch = p.cv.height;
    if (renderer.domElement.width !== cw || renderer.domElement.height !== ch || p.sized !== cw + 'x' + ch) {
      p.sized = cw + 'x' + ch;
      const pr = renderer.getPixelRatio();
      renderer.setSize(cw / pr, ch / pr, false);
      if (composer) composer.setSize(cw / pr, ch / pr);
      view.w = cw / pr; view.h = ch / pr;
      lastSize = ''; // the battle sizes itself again when it is shown
    }
    const w = 12, h = w * ch / cw, cy = p.c.type === 'spell' && !p.ally ? -1.6 : -5.4 + h / 2; // (a spell on its own: the target group in the middle) // the attacker's feet stay at the bottom; a taller canvas shows more above (big units, high swings)
    camera.left = -w / 2; camera.right = w / 2; camera.top = cy + h / 2; camera.bottom = cy - h / 2;
    camera.updateProjectionMatrix();
  }
  function previewFrame(dt) {
    const p = pv;
    try {
      if (p.ready) {
        pvAcc += dt;
        let n = 0;
        while (pvAcc >= DT && n < 4) { previewStep(DT); pvAcc -= DT; n++; }
        if (n === 4) pvAcc = 0;
      }
      FX.update(dt);
      if (p.ready && pv === p) {
        previewView(p);
        render(dt);
        p.ctx.drawImage(renderer.domElement, 0, 0, p.cv.width, p.cv.height);
      }
    } catch (err) { console.error('preview', err); previewStop(); }
  }
  function previewStop() {
    if (!pv) return;
    pv = null;
    if (G.opts && G.opts.preview) { clearBattle(); G.opts = null; G.phase = 'title'; lastSize = ''; }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const interval = last ? now - last : 16.7;
    let dt = Math.min(0.1, interval / 1000);
    last = now;
    frameBody(dt, interval);
  }
  // one frame of work (also driven directly by the smoke test, which may run with rAF throttled)
  // tower plate hit pulse: a Web Animation on the bar (no class toggle, no forced layout; same look as css plateHit)
  const PLATE_HIT = [{ transform: 'translateX(-50%) scale(1.12)', filter: 'brightness(2.2)' }, { transform: 'translateX(-50%) scale(1)', filter: 'none' }];
  function plateHit(el) {
    const bar = el._bar || (el._bar = el.querySelector('.bar'));
    if (bar && bar.animate) { bar.animate(PLATE_HIT, { duration: 220, easing: 'ease-out' }); return; }
    el.classList.remove('hit'); requestAnimationFrame(() => el.classList.add('hit'));
  }
  // voice lines (the original announcer and the characters' own lines): one at a time, see SFX.voice
  const say = (key, vol, prio) => window.SFX && SFX.voice && SFX.voice(key, vol, prio);
  const unitLine = (card, kind) => 'unit:' + card.id + '_' + kind;
  // who has lines: every orca card, and the iron machines that are AGS units in the source game (their own AGS voices)
  const IRON_VOICED = new Set(['gigantes', 'fortress', 'goltarion', 'rampart', 'fallen', 'pupphead']);
  const voiced = (c) => c.type === 'troop' && (c.faction === 'orca' || IRON_VOICED.has(c.id));
  // the energy rate steps up: the chasm flares and a wave of light rolls over both halves
  function energySurge() {
    G.surge = 1;
    const c = ARENAS[G.arena].glow;
    for (const sz of [-1, 1]) { FX.groundRing(0, sz * 7 * TILT, 0.5, 9, c, 0.9, 0.55); FX.later(0.15, () => FX.groundRing(0, sz * 7 * TILT, 0.3, 6, 0xffffff, 0.6, 0.35)); }
    FX.flash(c, 0.18);
  }
  // anything thrown outside the frame (a timer, a rejected promise) is reported the same way, once per match
  window.addEventListener('error', (ev) => { if (G.phase === 'play') frameErr(ev.error || ev.message, 'async'); });
  window.addEventListener('unhandledrejection', (ev) => { if (G.phase === 'play') frameErr(ev.reason, 'async'); });
  function frameErr(err, stage) {
    G.errStage = stage; // which part failed (shown if it keeps failing)
    if (!G.errShown) { G.errShown = true; console.error(stage, err); UI.toast('오류가 발생했지만 전투를 계속합니다'); }
    return true;
  }
  function frameBody(dt, interval) {
    if (!renderer || G.paused || G.lost) return;
    if (pv) { previewFrame(dt); return; } // (the deck popup's card preview)
    if (G.hitStop > 0) { G.hitStop -= dt; dt *= 0.06; } else if (G.slowmo > 0) { G.slowmo -= dt; dt *= 0.35; }
    const t0 = performance.now();
    let bad = false; // each stage is guarded on its own: a failing simulation must not also freeze the effects and the drawing
    try {
      if (G.phase === 'countdown') {
        if (mp && !mp.done) mpFlush(); // (a heartbeat while counting down: the other device knows this one is ready)
        G.cdT -= dt;
        const n = Math.ceil(G.cdT - 0.2);
        if (n !== G.cdN) { G.cdN = n; if (n > 0) { UI.countdown(n); SFX.play('click', 0.5); if (n <= 3) say('ann:' + n, 1, 4); FX.groundRing(0, 0, 0.5, 6 + (3 - n) * 1.5, 0xffffff, 0.5, 0.3); } else { UI.countdown(0); SFX.play('start', 0.6); say('ann:gamestart', 1, 4); G.phase = 'play'; } }
        for (const e of G.ents) if (e.sd) e.sd.update(dt);
      }
      if (G.phase === 'play') {
        acc += dt;
        let n = 0;
        while (acc >= DT && n < 6) {
          if (mp && !mp.done) {
            if (mp.upTo < mp.tick) { acc = Math.min(acc, DT); if (performance.now() - mp.lastRecv > (mp.heard ? MP_STALL : 30000)) mpAbandon(); break; } // waiting for the other device (longer before its first word: it may still be loading)
            mpRun(mp.tick);
          }
          step(DT);
          if (mp && !mp.done) { mpAfter(mp.tick); mp.tick++; }
          acc -= DT; n++;
        }
        if (mp && !mp.done) mpFlush();
        if (n === 6) acc = 0; // a long stall: drop the backlog instead of spiralling
      } else if (G.phase === 'ended') {
        G.endT += dt;
        if (G.endT > 2.6) return; // the result screen covers the field: keep the last frame, stop working
        for (let i = G.ents.length - 1; i >= 0; i--) {
          const e = G.ents[i];
          if (e.kind === 'troop' && !e.alive) { if (updateTroop(e, dt)) { disposeEnt(e); G.ents.splice(i, 1); } } // dying units keep fading
          else if (e.type === 'bld' && !e.alive) { if (updateBuilding(e, dt)) { disposeEnt(e); G.ents.splice(i, 1); } }
          else if (e.sd) e.sd.update(dt);
        }
        updateProjs(dt);
      }
    } catch (err) { bad = frameErr(err, 'sim'); }
    try { FX.update(dt); } catch (err) { bad = frameErr(err, 'fx'); }
    if (G.phase === 'play' || G.phase === 'countdown' || G.phase === 'ended') {
      try { render(dt); } catch (err) { bad = frameErr(err, 'render'); }
      try { UI.tick(G); } catch (err) { bad = frameErr(err, 'ui'); }
    }
    // one bad frame must not kill the match; one that fails every frame for a second is stuck: offer a reload
    G.errRun = bad ? (G.errRun || 0) + 1 : 0;
    if (G.errRun === 60) UI.fatal(`전투 화면을 갱신할 수 없습니다 (${G.errStage}). 다시 불러와 주세요.`, true);
    perfTick(interval, performance.now() - t0);
  }

  async function loadFxImages() {
    const keys = ['glow', 'cross', 'ring', 'spark', 'elec', 'smoke', 'firehit', 'aura', 'bolt'];
    const images = {};
    await Promise.all(keys.map((k) => new Promise((res) => {
      const im = new Image();
      im.onload = () => { images['fx_' + k] = im; res(); };
      im.onerror = () => { const c = document.createElement('canvas'); c.width = c.height = 4; images['fx_' + k] = c; res(); };
      im.src = (window.IMG && IMG['fx_' + k]) || '';
    })));
    return images;
  }

  let booted = false;
  async function boot() {
    stageEl = document.getElementById('stage');
    labelsEl = document.getElementById('labels');
    try {
      renderer = new THREE.WebGLRenderer({ antialias: !MOBILE, powerPreference: 'high-performance' });
    } catch (e) {
      UI.fatal('WebGL을 사용할 수 없습니다. 브라우저의 하드웨어 가속을 켜 주세요.');
      return;
    }
    renderer.setClearColor(0x0b0e12);
    SD.gpuSkin = renderer.capabilities.floatVertexTextures;
    SD.renderer = renderer;
    SD.crossfade = 0.12;
    SD.pinRoot = true;
    SD.pinRange = 0.35 / SD_K;
    SD.pinSkip = {};
    SD.mipmaps = renderer.capabilities.isWebGL2;
    SD.texScale = MOBILE ? 0.75 : 1; // sharper rigs (tools/build_hires.py): phones get the 75% atlases, desktops the full ones
    FXB.texScale = MOBILE ? 0.5 : 1;
    FXB.renderer = renderer;
    stageEl.prepend(renderer.domElement);
    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
    camera.position.z = 10;
    FX.init(scene, await loadFxImages());
    await Promise.all(Object.entries(FACTIONS).map(([k, f]) => new Promise((res) => {
      const im = new Image(); im.onload = im.onerror = () => res(); im.src = (window.IMG && IMG[f.banner]) || ''; emblems[k] = im;
    })));
    if (location.protocol !== 'file:') await Promise.all(['sandbag', 'sandbag2', 'crate', 'wreck', 'wreck2', 'wall_orca', 'wall_iron'].map((n) => new Promise((res) => { const im = new Image(); im.onload = im.onerror = () => res(); im.src = 'assets/prop/' + n + (n.startsWith('wall') ? '.jpg' : '.png'); PROPS[n] = im; }))); // (file://: they would taint the tower textures)
    FX.setGround(TILT);
    if (THREE.EffectComposer && THREE.UnrealBloomPass) {
      composer = new THREE.EffectComposer(renderer);
      composer.addPass(new THREE.RenderPass(scene, camera));
      bloom = new THREE.UnrealBloomPass(new THREE.Vector2(256, 256), 0.38, 0.35, 0.86); // gentler: hits glow without merging into blobs
      const bloomSize = bloom.setSize.bind(bloom);
      bloom.setSize = (w, h) => bloomSize(Math.max(2, Math.round(w * 0.5)), Math.max(2, Math.round(h * 0.5)));
      composer.addPass(bloom);
      // colour grade: richer saturation and contrast so units and effects stand off the floor (one cheap full-screen pass)
      if (THREE.ShaderPass) composer.addPass(new THREE.ShaderPass({
        uniforms: { tDiffuse: { value: null }, sat: { value: 1.2 }, con: { value: 1.1 }, warm: { value: new THREE.Vector3(1.03, 1.0, 0.96) } },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform sampler2D tDiffuse; uniform float sat; uniform float con; uniform vec3 warm; varying vec2 vUv;\n' +
          'void main() { vec4 c = texture2D(tDiffuse, vUv); float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));\n' +
          '  vec3 col = mix(vec3(l), c.rgb, sat); col = (col - 0.5) * con + 0.5; gl_FragColor = vec4(clamp(col * warm, 0.0, 1.0), c.a); }',
      }));
    }
    fieldMesh = quad(null, 0xffffff, 1, false, -10);
    fieldMesh.material.transparent = true; // its far edges fade into the backdrop
    fieldMesh.scale.set(FX_.x1 - FX_.x0, (FX_.z1 - FX_.z0) * TILT, 1);
    fieldMesh.position.set((FX_.x0 + FX_.x1) / 2, (FX_.z0 + FX_.z1) / 2 * TILT, 0); // (the canvas is no longer centred on the river)
    scene.add(fieldMesh);
    setArena(0);
    zoneCv = document.createElement('canvas');
    zoneCv.width = (FX_.x1 - FX_.x0) * 8; zoneCv.height = (FX_.z1 - FX_.z0) * 8;
    zoneTex = new THREE.CanvasTexture(zoneCv);
    zoneTex.magFilter = THREE.NearestFilter;
    zoneMesh = quad(zoneTex, 0xffffff, 1, false, 1);
    zoneMesh.scale.copy(fieldMesh.scale); zoneMesh.position.copy(fieldMesh.position);
    zoneMesh.visible = false;
    scene.add(zoneMesh);
    buildAmbient();
    setQuality(UI.save.quality != null ? UI.save.quality : perf.level, true);
    let rz = false;
    const resizeSoon = () => { if (rz) return; rz = true; requestAnimationFrame(() => { rz = false; resize(); }); };
    window.addEventListener('resize', resizeSoon);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', resizeSoon);
    renderer.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); G.lost = true; UI.toast('그래픽 장치를 다시 준비하는 중…'); clearTimeout(G.lostT); G.lostT = setTimeout(() => { if (G.lost) UI.fatal('그래픽 장치를 복구하지 못했습니다. 다시 불러오면 이어서 플레이할 수 있습니다.', true); }, 8000); }); // a context that never comes back (some phones) must not leave a frozen screen
    renderer.domElement.addEventListener('webglcontextrestored', () => { G.lost = false; clearTimeout(G.lostT); resize(true); UI.toast('그래픽 장치가 복구되었습니다'); });
    bindInput();
    SFX.preload();
    booted = true; // (a match can start from here on)
    requestAnimationFrame(frame);
  }

  function pause(on) {
    if (G.phase !== 'play' && G.phase !== 'countdown') return;
    if (G.opts && G.opts.preview) return; // (a card preview never pauses)
    if (mp) return; // an online match never stops (the menu still opens)
    G.paused = on;
    last = 0;
  }
  function surrender() {
    G.paused = false;
    if (mp) { mp.send({ bye: 1 }); mp.endOK = true; }
    if (G.phase === 'play' || G.phase === 'countdown') {
      G.phase = 'play';
      G.sides.red.crowns = 3;
      let k = 0;
      G.sides.blue.towers.forEach((t) => { if (t.alive) towerRubble(t, 0.3 * k++); });
      FX.flash(0xffd0a0, 0.3);
      SFX.play('expB');
      UI.crowns();
      endMatch('red', 'surrender');
    }
  }
  function leave() { mpClose(); G.opts = null; clearBattle(); G.phase = 'title'; G.paused = false; SFX.music('title'); }

  window.GAME = {
    preview, previewStop,
    get ready() { return booted; },
    G, boot, start, select, deselect, cardDown, pause, surrender, leave, resize, useSkill, champions, setQuality, buildDeck,
    get cameraZoom() { return camera ? camera.zoom : 1; },
    get cameraPos() { return camera ? [camera.position.x, camera.position.y] : [0, 0]; },
    get perf() { return perf; }, QUALITY, autoLevel: MOBILE ? 1 : 0,
    useSupport: () => (mp ? (supportReady(G.sides.blue) && !mp.mine.some((c) => c.k === 'p') ? mpLocal({ k: 'p' }) : false) : useSupport('blue')),
    // online match: messages from the other device, and the local emote going out
    mpMessage: (m) => mpMessage(m),
    mpEmote: (i) => { if (mp && !mp.done) mp.send({ em: i }); },
    get online() { return !!mp; },
    // per-frame readers fill one reused object per side / per call (no garbage at 60 fps); read the fields right away
    supportOf: (side) => { const S = G.sides && G.sides[side]; if (!S || !S.sup) return null; const o = supOut[side] || (supOut[side] = {}); o.ready = supportReady(S); o.faction = S.faction; o.charge = S.sup.charge; o.used = S.sup.used; o.name = SUPPORT[S.faction].name; o.desc = SUPPORT[S.faction].desc; return o; },
    _useSupport: (side) => useSupport(side), // (smoke test)
    _perfTick: (interval, work) => perfTick(interval, work),
    _frame: (ms) => frameBody(Math.min(0.1, ms / 1000), ms), // (smoke test: one real frame, error guard included) // (smoke test: drives the auto-quality governor with synthetic frame times)
    get qualityLevel() { return perf.level; },
    get info() { return renderer ? { geo: renderer.info.memory.geometries, tex: renderer.info.memory.textures, calls: perf.calls || 0, scene: scene.children.length, fx: FX.count() } : null; },
    skillState(u) { const o = skOut; o.ready = skillReady(u); o.cd = Math.max(0, u.skillCd); o.cdMax = u.card.skill.cd * (G.mut && G.mut.skillCd || 1); o.cost = skillCost(u); return o; },
    // test hooks: run the battle for `sec` seconds at once (background tabs throttle requestAnimationFrame)
    _playCard: playCard, _canDeploy: canDeploy,
    _fx: (n, x, y, k) => spawnStatic(n, x, y, k),
    _toScreen: (x, y) => toScreen(x, y),
    _damage: (t, amt) => damage(t, amt, null), // (tests)
    voiced: (c) => voiced(c),
    autoSpot(u) { const sk = u.card.skill, tg = u.target && u.target.alive ? u.target : null; const a = sk.kind === 'barrage' ? bestSpot(u, sk.reach, sk.radius * 1.5) : (sk.kind === 'laser' ? tg || nearestTower(u) : dashTarget(u)); return a ? (Array.isArray(a) ? { x: a[0], z: a[1] } : { x: a.x, z: a.z }) : null; },
    clientToField(cx, cy) { const r = stageEl.getBoundingClientRect(); if (cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) return null; return toField(cx - r.left, cy - r.top); },
    aimable: (u) => !!AIMABLE[u.card.skill.kind], aimPreview, aimHide, aiEmote: (i, chance) => aiEmote(i, chance),
    _tickFx(dt) { updateProjs(dt); FX.update(dt); render(0); },
    _run(sec) {
      if (G.phase === 'countdown') { G.phase = 'play'; UI.countdown(0); }
      for (let t = 0; t < sec && G.phase === 'play'; t += DT) { step(DT); FX.update(DT); }
      render(0); UI.tick(G);
    },
  };
})();
