// Last Royal: arena rendering, battle simulation, champions, AI opponent and battle input.
// Field coordinates: x -9..9 (left..right), z -16..16 (player's back .. enemy's back). The screen is the
// x / y plane with y = z * TILT (+ height): characters stand upright on the tilted floor.
(function () {
  const { BAL, FACTIONS, ARENAS, LEVEL, card: CARD } = DATA;
  const TILT = 0.47;        // floor squash: a flatter view lets the 18 x 32 arena fill the whole column width
  const SD_K = 0.155;        // one scale for every bioroid rig (the original's relative sizes)
  const BODY = 9.5;          // nominal bioroid body height in rig units
  const AIR_LIFT = 1.15;     // flying troops hover this high above their shadow
  const TROOP_K = 3.2;       // troops are drawn larger than the tower guards (readable on phones)
  const IRON_FXK = 0.2;      // baked effect scale for Iron Blood rigs (no rig scale of their own)
  const MOBILE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform));
  const FORM = { 1: [[0, 0]], 2: [[-0.5, 0], [0.5, 0]], 3: [[0, 0.5], [-0.55, -0.35], [0.55, -0.35]], 4: [[-0.5, 0.5], [0.5, 0.5], [-0.5, -0.5], [0.5, -0.5]] };
  const TOWER_E = { king: 2.3, princess: 1.75, bld: 0.9 }; // tower top height (guard stands there)
  const L = FX.L;

  let renderer, composer, bloom, scene, camera, stageEl, labelsEl;
  let fieldMesh, fieldTex, zoneMesh, zoneCv, zoneTex;
  const view = { w: 1, h: 1 };
  const towerTex = {};
  const emblems = {}; // faction -> commander portrait image (king tower badge), loaded at boot

  const G = {
    phase: 'title', after: [], ents: [], projs: [], bfx: [], sfx: [], zones: [], decals: [], punch: 0, sides: null, time: 0, clock: 0, overtime: false, mult: 1,
    sel: -1, ghost: null, opts: null, nextId: 1, endT: 0, result: null, paused: false, riverT: 0, zoneKey: '', arena: 0,
    stats: null,
  };

  // battle log for the result screen: [clock text, line, side]
  function logEvent(text, side, kind) { if (!G.log) return; const t = Math.max(0, Math.ceil(G.clock)); G.log.push([(G.overtime ? '연장 ' : '') + Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'), text, side || '', kind || '']); }
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const sy = (e) => e.z * TILT + (e.air ? AIR_LIFT : 0) + (e.elev || 0);
  const other = (s) => (s === 'blue' ? 'red' : 'blue');
  const SGN = { blue: -1, red: 1 }; // home half
  const teamHex = (side) => (side === 'blue' ? 0x4fc0ff : 0xff5466);

  // ── quality (auto-lowered when frames run long) ──────────
  const QUALITY = [
    { name: '높음', dpr: 2, bloom: 0.5, parts: 900 },
    { name: '보통', dpr: 1.5, bloom: 0.35, parts: 650 },
    { name: '낮음', dpr: 1, bloom: 0, parts: 420 },
  ];
  const perf = { level: MOBILE ? 1 : 0, acc: 0, n: 0, slow: 0, fps: 60, work: 0 };

  // ── textures ──────────────────────────────────────────
  const FX_ = { x0: -10.5, x1: 10.5, z0: -17.5, z1: 31, P: 36 }; // z1 reaches past the far wall: the band above the arena is the bunker's back wall
  function fieldCanvas(ar) {
    const { x0, x1, z0, z1, P } = FX_;
    const cv = document.createElement('canvas');
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
      g.save(); g.beginPath(); g.rect(fx0, fy0, tw, H); g.clip();
      for (let y = 0, i = 0; y < H; y += th, i++) { g.save(); if (i % 2) { g.translate(0, fy0 + y + th); g.scale(1, -1); g.drawImage(fl, fx0, 0, tw, th); } else g.drawImage(fl, fx0, fy0 + y, tw, th); g.restore(); }
      g.restore();
      g.fillStyle = 'rgba(0,0,0,' + (ar.floorDim || 0.18) + ')'; g.fillRect(fx0, fy0, tw, H);
      // strong side identity: cool blue-grey steel at home, rusted red plating across the chasm
      g.save(); g.globalCompositeOperation = 'color';
      g.fillStyle = 'rgba(70,120,175,0.2)'; g.fillRect(fx0, Y(0), tw, 16 * P);
      g.fillStyle = 'rgba(165,70,55,0.09)'; g.fillRect(fx0, fy0, tw, 16 * P);
      g.save(); g.globalCompositeOperation = 'saturation'; g.fillStyle = 'rgba(128,128,128,0.35)'; g.fillRect(fx0, fy0, tw, 16 * P); g.restore(); // the far plates lose some colour so red units stand out on them
      g.fillStyle = 'rgba(30,26,26,0.14)'; g.fillRect(fx0, fy0, tw, 16 * P);
      g.restore();
      g.fillStyle = 'rgba(120,170,230,0.07)'; g.fillRect(fx0, Y(0), tw, 16 * P);
      g.fillStyle = 'rgba(255,170,140,0.12)'; g.fillRect(fx0, fy0, tw, 16 * P); // the far half a touch lighter: dark iron units stand out
      // original props along the walls, clear of the lanes and the tower pads (the deck reads as a place)
      const prop = (im, px, pz, w, flip) => { if (!im || !im.naturalWidth) return; const h = w * im.naturalHeight / im.naturalWidth * P, W = w * P; g.save(); g.translate(X(px), Y(pz)); if (flip) g.scale(-1, 1); g.globalAlpha = 0.95; g.filter = 'brightness(0.72) saturate(0.8)'; g.drawImage(im, -W / 2, -h, W, h); g.restore(); };
      for (const s of [-1, 1]) { // a cluster per corner: home side crates and sandbag lines, the far side iron wreckage
        prop(PROPS.sandbag2, s * 7.3, -12.4, 3.2, s > 0); prop(PROPS.crate, s * 7.9, -11.2, 2.3, s > 0);
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
      wg.addColorStop(0, 'rgba(0,0,0,0)'); wg.addColorStop(0.5, 'rgba(0,0,0,0.16)'); wg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = wg; g.fillRect(lx - 1.2 * P, ly0, 2.4 * P, lh);
    }
    // chevrons along the lanes, pointing at the bridges
    g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 4;
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
    // centre emblem
    g.save(); g.globalAlpha = 0.16; g.strokeStyle = '#fff'; g.lineWidth = 6;
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
      ao.addColorStop(0, 'rgba(0,0,0,0.42)'); ao.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = ao; g.fillRect(cx - tr * 1.3 * P, cy - tr * 1.3 * P, tr * 2.6 * P, tr * 2.6 * P);
    }
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
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)');
    g.fillStyle = vg; g.fillRect(0, 0, cv.width, cv.height);
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
      const c = Math.round(70 + 90 * shadeK);
      g.fillStyle = dead ? `rgb(${c * 0.45},${c * 0.45},${c * 0.47})` : `rgb(${c * 0.78},${c * 0.86},${c * 0.95})`;
      g.beginPath(); g.moveTo(X(a[0]), Y(a[1])); g.lineTo(X(b[0]), Y(b[1])); g.lineTo(X(b[0]), Y(b[1] + E)); g.lineTo(X(a[0]), Y(a[1] + E)); g.closePath(); g.fill();
      if (wallPat) { g.save(); g.clip(); g.globalAlpha = 0.9; g.fillStyle = wallPat; g.fill(); g.globalAlpha = 1; g.fillStyle = `rgba(0,0,0,${(0.75 - shadeK * 0.6).toFixed(2)})`; g.fill(); g.restore(); } // the faction's original wall art, lit per face
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
    if (!dead) { g.save(); g.clip(); g.globalCompositeOperation = 'overlay'; g.fillStyle = team[0]; g.globalAlpha = 0.55; g.fill(); g.restore(); } // the roof carries the team colour
    if (!dead && type !== 'bld') { g.save(); g.strokeStyle = team[1]; g.lineWidth = 3; g.shadowColor = team[0]; g.shadowBlur = 14; g.stroke(); g.restore(); } // a lit team rim around the roof
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
      g.fillStyle = stage === 2 ? 'rgba(20,10,5,0.45)' : 'rgba(10,10,12,0.32)'; g.fillRect(0, 0, cv.width, cv.height);
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
    }
    // dress the bunker with the original props: orca sandbag lines and supply containers, iron wreckage; rubble on a ruin
    const prop = (im, cx, by, w) => { if (!im || !im.naturalWidth) return; const h = w * im.naturalHeight / im.naturalWidth; g.drawImage(im, X(cx) - w * P / 2, Y(by) - h * P, w * P, h * P); };
    if (dead) prop(PROPS.wreck2, 0.05, -r * TILT * 0.55, r * 1.75);
    else if (type !== 'bld' && faction === 'orca') {
      if (type === 'king') for (const sx of [-1, 1]) prop(PROPS.crate, sx * r * 0.66, -r * TILT * 0.2, r * 0.72);
      prop(PROPS.sandbag2, 0, -r * TILT - 0.14, r * 2.05);
    } else if (type !== 'bld') {
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
  const TINTS = [[0.95, 0.95, 0.95], [0.55, 0.85, 1.3], [2.1, 2.0, 2.0], [1.1, 1.1, 0.6], [1.2, 0.8, 0.8], [1.2, 1.05, 0.8]];
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
  const skillFxCache = {};
  function skillFxFor(rig) {
    if (rig in skillFxCache) return skillFxCache[rig];
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
    const bg = FX.sprite({ x: 0, y: -99, size: w + 0.12, aspect: 0.46 / (w + 0.12), color: 0x06080c, tex: FX.tex.white, normal: true, order: L.BAR, alpha: 0.7 });
    const fill = FX.sprite({ x: 0, y: -99, size: w, aspect: 0.36 / w, color, tex: FX.tex.white, normal: true, order: L.BAR + 1, alpha: 1 });
    bg.hidden = fill.hidden = true;
    return { bg, fill, w };
  }
  function setBar(b, f, x, y, color) {
    f = clamp(f, 0, 1);
    b.bg.hidden = b.fill.hidden = false;
    b.bg.x = x; b.bg.y = y;
    const w = Math.max(0.01, b.w * f);
    b.fill.sz = w; b.fill.aspect = 0.36 / w;
    b.fill.x = x - b.w / 2 + w / 2; b.fill.y = y;
    if (color != null) b.fill.color = color;
  }
  function hideBar(b) { b.bg.hidden = b.fill.hidden = true; }

  function lvlOf(side, card) {
    const S = G.sides[side];
    return S.levels ? (S.levels[card.id] || 1) : S.lvl || 1;
  }

  function spawnTroop(side, card, x, z, delay, lvl) {
    const lv = lvl || lvlOf(side, card), m = LEVEL.mult(lv), hm = G.mut && G.mut.hp || 1;
    const atk = Object.assign({}, card, { dmg: card.dmg * m });
    const u = {
      id: G.nextId++, kind: 'troop', side, card, atk, lv, x, z, r: card.radius, mass: card.mass, hp: card.hp * m * hm, max: card.hp * m * hm,
      air: card.air, alive: true, deployT: card.deploy + (delay || 0), deploy0: card.deploy + (delay || 0), target: null, retarget: 0,
      face: side === 'blue' ? 1 : -1, slowT: 0, slowK: 1, stunT: 0, freezeT: 0, hitT: 0, elev: 3, cd: 0, state: 'deploy',
      skillCd: card.skill ? 3 : 0, shieldT: 0, hasteT: 0, dropT: 0.28 + (delay || 0),
    };
    u.holder = new THREE.Group();
    scene.add(u.holder);
    u.shadow = FX.sprite({ x, y: z * TILT, size: Math.max(1.3, u.r * 3.6), aspect: TILT * 0.75, color: 0x000000, alpha: 0.7, tex: FX.tex.dot, normal: true, order: L.GROUND }); // a firmer contact shadow anchors units in a crowd
    u.disc = FX.sprite({ x, y: z * TILT, size: Math.max(2.1, u.r * 5.6), aspect: TILT, color: teamHex(side), alpha: 1, tex: FX.tex.ring, order: L.GROUND + 2 }); // a bold team ring under every troop
    u.glow = FX.sprite({ x, y: z * TILT, size: Math.max(2.3, u.r * 6), aspect: TILT, color: teamHex(side), alpha: 0.7, tex: FX.tex.glow, order: L.GROUND + 1 }); // a team-coloured pool under every unit: friend / foe at a glance
    attachRig(u, card.rig, card.k * TROOP_K, card.h && card.h * TROOP_K, true);
    u.fxk *= 1.8 / TROOP_K;
    if (isIron(card.rig)) u.tintMul = 1.2;
    if (u.sd) { if (side === 'blue') u.sd.setRim(0.6, 1, 1, 0.8); else u.sd.setRim(1, 0.3, 0.3, 0.7); } // the enemy rim: a clear red edge at moderate strength // outlines tuned per side: cyan-white reads on the blue deck, warm red on the far half // a team-coloured outline: whose unit it is, at a glance // the original effects keep their tuned size when the troops are drawn larger (no screen-filling blooms)
    if (u.sd) { u.sd.setOpacity(0.6); u.sd.play('idle'); u.sd.time = Math.random(); }
    u.bar = makeBar(clamp(u.r * 3.6, 2.0, 2.8), teamHex(side));
    G.ents.push(u);
    return u;
  }

  function makeTower(side, type, x, z) {
    const S = G.sides[side], sp = BAL.tower[type], fac = FACTIONS[S.faction], guard = fac[type];
    // towers grow with the side's card levels (the deck's average for the player, the opponent's level for the AI)
    const tl = S.levels ? Math.round(S.deck.reduce((s, id) => s + (S.levels[id] || 1), 0) / S.deck.length) : S.lvl || 1;
    const m = LEVEL.mult(tl), hp = Math.round(sp.hp * m);
    const t = {
      id: G.nextId++, kind: 'tower', type, side, x, z, r: sp.r, hp, max: hp, air: false, alive: true, active: type !== 'king', lv: tl,
      atk: { dmg: sp.dmg * m, rate: sp.rate, range: sp.range, hits: 'all', splash: 0, fx: guard.fx, color: guard.color, sfx: guard.sfx },
      target: null, face: side === 'blue' ? 1 : -1, slowK: 1, slowT: 0, stunT: 0, freezeT: 0, hitT: 0, cd: 0, elev: TOWER_E[type],
    };
    const tkey = side + type + S.faction;
    const tc = towerTex[tkey] || (towerTex[tkey] = towerCanvas(type, side, false, emblems[S.faction], S.faction));
    t.stage = 0; t.texKey = tkey;
    t.base = quad(tc.tex, 0xffffff, 1, false, 0);
    t.base.scale.set(tc.w, tc.h, 1);
    t.base.position.set(x, z * TILT + tc.cy, 0);
    scene.add(t.base);
    t.holder = new THREE.Group();
    scene.add(t.holder);
    // the team ring on the tower top breathes (brighter while the tower is firing)
    t.aura = FX.sprite({ x, y: z * TILT + TOWER_E[type], size: (sp.r + 0.35) * 1.5, aspect: TILT, color: teamHex(side), alpha: 0.25, tex: FX.tex.glow, order: 1150 });
    const gk = type === 'princess' ? (isIron(guard.rig) ? 1.7 : 2.05) : 1.45; // the orca gunners stand as large as the iron emplacements
    attachRig(t, guard.rig, guard.k * gk, guard.h && guard.h * gk, false); // a defender you can actually see on its tower
    if (isIron(guard.rig)) t.tintMul = 1.35;

    t.label = document.createElement('div');
    t.label.className = 'tlabel ' + side + ' ' + type;
    t.label.style.transform = 'translate(-999px,-999px)'; // placed by render()
    t.label.innerHTML = `<i class="bar"><i></i></i><b>${hp}</b>${type === 'king' ? '<em class="crown"></em>' : ''}`;
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
    [e.shadow, e.disc, e.aura, e.glow, e.halo, e.fireGlow].forEach((p) => p && FX.kill(p));
    if (e.base) { scene.remove(e.base); e.base.material.dispose(); }
    if (e.deadTex) e.deadTex.dispose();
    if (e.bar) { FX.kill(e.bar.bg); FX.kill(e.bar.fill); }
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

  function damage(t, amt, src) {
    // once the match is decided, shots still in flight are only visuals
    if (!t.alive || amt <= 0 || G.phase !== 'play') return;
    if (t.shieldT > 0) amt *= t.card.skill.k;
    t.hp -= amt;
    t.hitT = 0.1;
    if (t.kind === 'tower' && t.type !== 'bld') t.dmgAcc = (t.dmgAcc || 0) + Math.min(amt, t.hp + amt); // shown as floating numbers (render)
    else if (t.kind === 'troop' && amt >= 100 && G.time - (t.numT || -1) > 0.3) { t.numT = G.time; const q = toScreen(t.x + rnd(-0.2, 0.2), sy(t) + (t.bodyH || 1.5) + 0.2); UI.dmgNum(q[0], q[1], Math.round(amt), t.side); } // heavy blows on troops pop a number too
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
      if (!e.air) scorch(e.x, e.z * TILT, e.r * 1.1); // a mark stays where it fell
      const y = sy(e) + e.bodyH * 0.35;
      if (isIron(e.card.rig)) {
        if (!spawnStatic('simple_explosion', e.x, y, e.fxk * 0.45)) FX.explosion(e.x, y, 0.5, 0xff8a40);
        FX.sparks(e.x, y, 0xffa040, 6, 3, 0.12, 0.4);
      } else {
        // a bioroid is pulled out in a column of light: a ring, rising motes in the team colour, a soft flash
        FX.particle({ x: e.x, y, life: 0.5, size: 0.6, size1: 1.6, color: teamHex(e.side), tex: FX.tex.glow, alpha: 0.6 });
        FX.groundRing(e.x, e.z * TILT, 0.2, 1.6, teamHex(e.side), 0.5, 0.9);
        for (let i = 0; i < 10; i++) FX.particle({ x: e.x + rnd(-0.4, 0.4), y: y + rnd(-0.3, 0.5), vy: rnd(1.2, 2.6), life: rnd(0.5, 0.9), size: rnd(0.12, 0.22), size1: 0, color: i % 2 ? 0xffffff : teamHex(e.side), tex: FX.tex.dot });
        FX.sparks(e.x, y, 0xffffff, 5, 2.2, 0.1, 0.4);
      }
      if (G.stats && src && src.side && G.stats[src.side]) G.stats[src.side].kills++;
      return;
    }
    if (e.type === 'bld') { removeBuilding(e); e.label.classList.add('dead'); if (e.sd) e.sd.play('die', () => { if (e.sd) e.sd.root.visible = false; }, false); return; }
    // tower falls
    const S = G.sides[e.side], foe = G.sides[other(e.side)];
    towerRubble(e, 0);
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
    UI.banner(e.side === 'red' ? '적 타워 파괴!' : '아군 타워 파괴!', e.side === 'red' ? 'good' : 'bad');
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
      if (delay) SFX.play('expM', 0.6);
    };
    if (delay) FX.later(delay, go); else go();
  }
  // craters from the original ground-crack art (tower collapses, heavy shells); they fade after a while
  const decalTex = {};
  ['crack', 'crack_red'].forEach((k) => new THREE.TextureLoader().load(`assets/icon/${k}.png`, (tx) => { decalTex[k] = tx; }, undefined, () => {}));
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
    const dmg = real ? a.dmg * (e.dmgK || 1) : 0;
    if (real && a.sfx) SFX.play(a.sfx, e.kind === 'tower' ? 0.3 : 0.5);
    const tx = t.x, ty = aimY(t);
    const ang = Math.atan2(ty - my, tx - mx);
    const ranged = a.fx !== 'claw' && a.fx !== 'slash' && a.fx !== 'cannon' && a.fx !== 'flame';
    if (fireN > 0 && ranged) FX.muzzleFlash(mx, my, ang, a.color, 0.8);
    // the original projectile / effect of this character
    const o = e.rig ? origFor(e.rig, a.fx) : null;
    if (real && o && o.statics.length && FXB.ready(o.statics[0])) spawnStatic(o.statics[0], tx, t.z * TILT + 0.2, e.fxk, e.face);
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
      case 'bullet': P({ speed: 24, kind: 'bullet' }); FX.beam(mx, my, tx, ty, 0.07, teamHex(e.side), 0.11); break; // a team-coloured tracer shows who is shooting whom
      case 'snipe': FX.beam(mx, my, tx, ty, 0.1, a.color, 0.2); if (real) { hit(e, a, t, t.x, t.z, dmg); hitFx(e, a, tx, ty); } break;
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
        if (real) list.forEach((q) => hit(e, a, q, q.x, q.z, dmg));
        break;
      }
      case 'laser': {
        const dx = t.x - e.x, dz = t.z - e.z, Ld = Math.hypot(dx, dz) || 1;
        const reach = Math.max(Ld, (a.range || 5) + 0.6);
        const ex = e.x + dx / Ld * reach, ez = e.z + dz / Ld * reach;
        FX.beam(mx, my, ex, ez * TILT + aimH(t), real ? 0.28 : 0.14, a.color, 0.3);
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
        if (real) hit(e, a, t, t.x, t.z, dmg);
        break;
      default: // slash / claw / cannon: contact hits
        if (a.fx === 'slash') FX.slash(tx, ty, a.color, 1.1); else FX.hit(tx, ty, a.color, a.fx === 'cannon' ? 1.6 : 1);
        if (real) {
          if (a.fx === 'cannon') FX.shake(0.1);
          hitFx(e, a, tx, ty);
          hit(e, a, t, t.x, t.z, dmg);
        }
    }
  }
  const EXPLOSIVE = { grenade: 1, missile: 1, cannon: 1, fireball: 1, bomb: 1 };
  function hitFx(e, a, x, y) {
    const n = GENERIC_HIT[a.fx];
    const big = clamp(a.dmg * (e.dmgK || 1) / 220, 0.7, 1.6); // heavier blows get bigger bursts
    const heavy = G.time - (e.hfxT || -1) > 0.16; // a fast shooter gets the full burst a few times a second, otherwise just the core (no permanent confetti cloud)
    if (!heavy) { FX.particle({ x, y, life: 0.07, size: 0.15, size1: 0.35, color: 0xfff4d0, tex: FX.tex.cross, rot: Math.random() * 3, alpha: 0.5 }); return; }
    e.hfxT = G.time;
    FX.sparks(x, y, a.color, Math.round(5 + big * 4), 3.5 + big * 1.8, 0.2, 0.36); // a spray of sparks sells every blow
    FX.sparks(x, y, 0xffffff, 3, 2.5, 0.12, 0.2);
    FX.particle({ x, y, life: 0.08, size: 0.2, size1: 0.5 * big, color: 0xfff4d0, tex: FX.tex.cross, rot: Math.random() * 3, alpha: 0.6 }); // a short star flash
    FX.ring(x, y, 0.1, 0.6 * big, a.color, 0.18, 0.7);
    // streaks carry on along the shot: the hit reads as coming from the shooter
    { const ang = Math.atan2(y - (sy(e) + (e.bodyH || 1.5) * 0.5), x - e.x); for (let s = 0; s < 3 + Math.round(big * 2); s++) { const aa = ang + rnd(-0.45, 0.45), v = rnd(4, 7.5); FX.particle({ x, y, vx: Math.cos(aa) * v, vy: Math.sin(aa) * v, drag: 6, life: rnd(0.14, 0.24), size: 0.3, size1: 0.08, aspect: 5, rot: aa - Math.PI / 2, color: s % 2 ? 0xffffff : 0xffe08a, tex: FX.tex.beam, alpha: 1 }); } }
    if (EXPLOSIVE[a.fx]) { for (let k = 0; k < 6; k++) { const aa = rnd(0.3, Math.PI - 0.3), v = rnd(2.5, 5); FX.particle({ x, y, vx: Math.cos(aa) * v, vy: Math.sin(aa) * v, grav: 10, life: rnd(0.4, 0.65), size: 0.16, size1: 0.12, color: 0x4a3a2c, tex: FX.tex.dot, normal: true }); } scorch(x, y - 0.3, 0.5 * big); } // shells and grenades throw chunks and scar the deck; guns spark; blades cut
    if ((a.range || 0) <= 1.3 && Math.random() < 0.6) FX.slash(x + rnd(-0.15, 0.15), y + rnd(-0.1, 0.2), a.color, 0.7 + 0.4 * big); // close-quarters blows leave a cut streak
    if (n && spawnStatic(n, x, y, (e.fxk || 0.2) * 0.55 * big)) return; // the original hit effect, kept small so it does not smear over the target
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
        if (b.atk.splash) FX.groundRing(b.tx, b.tz * TILT, 0.2, b.atk.splash, b.atk.color, 0.35, 0.8);
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
      if (p.atk.splash) FX.groundRing(p.tx, ground, 0.2, p.atk.splash, c, 0.35, 0.8);
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
      spellHit(side, cc, x, z);
      SFX.play('elec');
      FX.flash(0x9fe8ff, 0.25);
    } else if (c.spell === 'zone') {
      // a burning field: ticks every half second (see updateZones)
      const y = z * TILT;
      G.zones.push({ side, x, z, r: c.radius, dps: cc.dmg, t: c.dur, tick: 0, slow: c.slow, towerK: c.towerK, card: cc });
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
    } else if (c.spell === 'freeze') {
      const y = z * TILT;
      spawnStatic('Titania_skill1_Ground_ice', x, y, 0.3, 1, L.FX);
      spawnStatic('Titania_skill1_Ground_ice_smoke', x, y, 0.3, 1, L.FX);
      FX.frost(x, y, c.radius, c.color);
      FX.groundGlow(x, y, c.radius * 0.9, 0x9fe8ff, c.freeze, 0.45, 0.2);
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
  function useSkill(u, spot) {
    const S = G.sides[u.side], sk = u.card.skill;
    if (!skillReady(u) || S.elixir < skillCost(u) - 1e-6 || G.phase !== 'play' || G.paused) return false;
    S.elixir -= skillCost(u);
    u.skillCd = sk.cd * (G.mut && G.mut.skillCd || 1);
    u.casting = 0.9;
    u.skillFired = false;
    if (u.sd) {
      const a = animInfo(u.rig, u.sd, 'skill');
      u.sd.play('skill', null, false);
      u.sd.time = a.w0;
      u.sd.speed = u.castSpeed = clamp(a.len / 0.9, 0.8, 2.5);
    }
    UI.skillCut(u);
    logEvent(`${u.card.name} · ${sk.name}`, u.side, 'skill');
    // where it will land (barrage aims now and keeps that spot); the enemy's gets a red warning ring
    const tg = u.target && u.target.alive ? u.target : null;
    const aim = sk.kind === 'laser' ? tg || nearestTower(u) : sk.kind === 'dash' ? dashTarget(u) : null;
    u.skillSpot = sk.kind === 'barrage' ? bestSpot(u, sk.reach, sk.radius * 1.5) : sk.kind === 'nova' ? [u.x, u.z]
      : sk.kind === 'laser' || sk.kind === 'dash' ? (aim ? [aim.x, aim.z] : [u.x, u.z - SGN[u.side] * (sk.reach || sk.dist)]) : null; // laser / dash: locked at cast time
    if (spot && AIMABLE[sk.kind]) u.skillSpot = aimedSpot(u, spot.x, spot.z); // the player dragged the skill onto the field
    telegraph(u, sk);
    FX.groundRing(u.x, u.z * TILT, 0.3, 2.2, sk.color, 0.5);
    FX.particle({ x: u.x, y: sy(u) + u.bodyH * 0.5, life: 0.5, size: 0.5, size1: 3, color: sk.color, tex: FX.tex.glow, alpha: 0.8 });
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
    const m = e.tintMul || 1, T0 = TINTS[tk], T = m === 1 ? T0 : [T0[0] * m, T0[1] * m, T0[2] * m]; // dark iron rigs are lifted a little so they read on the deck
    if (!e.tintC) { e.tintC = T.slice(); e.sd.setTint(T[0], T[1], T[2]); e.tintK = tk; return; } // first frame: written once (a pooled rig may carry an old tint)
    const c = e.tintC, k = tk === 2 ? 1 : Math.min(1, dt * 12);
    let ch = false;
    for (let i = 0; i < 3; i++) { if (c[i] === T[i]) continue; const v = Math.abs(T[i] - c[i]) < 0.01 ? T[i] : c[i] + (T[i] - c[i]) * k; c[i] = v; ch = true; }
    if (ch) e.sd.setTint(c[0], c[1], c[2]);
    e.tintK = tk;
  }
  function sparkle(e, dt, emit) { e.spkT = (e.spkT || 0) - dt; let n = 0; while (e.spkT <= 0 && n++ < 2) { emit(); e.spkT += 0.055; } if (e.spkT < 0) e.spkT = 0; }
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
    if (own && sk.kind !== 'dash' && sk.kind !== 'laser') { const t = u.target && u.target.alive ? u.target : null, sp = sk.kind === 'barrage' && u.skillSpot; spawnStatic(own, sp ? sp[0] : t ? t.x : u.x, (sp ? sp[1] : t ? t.z : u.z) * TILT + 0.4, u.fxk * 1.2, u.face); }
    switch (sk.kind) {
      case 'nova': {
        spawnStatic(sk.freeze ? 'Titania_skill1_Ground_ice' : SKILL_FX.nova, u.x, y0 + (sk.freeze ? 0 : 0.5), sk.freeze ? 0.3 : 0.5);
        FX.groundRing(u.x, y0, 0.3, sk.radius, sk.color, 0.6);
        FX.groundGlow(u.x, y0, sk.radius, sk.color, 0.5, 0.6);
        if (sk.freeze) FX.frost(u.x, y0 + 0.4, sk.radius, sk.color); else FX.explosion(u.x, y0 + 0.4, sk.radius * 0.5, sk.color, true);
        hitArea(u.x, u.z, sk.radius, sk.dmg, { stun: sk.stun, freeze: sk.freeze });
        impact(u, u.x, u.z, sk.color);
        SFX.play(sk.freeze ? 'ice' : 'expM');
        break;
      }
      case 'barrage': {
        const [cx, cz] = u.skillSpot || bestSpot(u, sk.reach, sk.radius * 1.5);
        for (let i = 0; i < sk.n; i++) {
          const x = cx + (i ? rnd(-1, 1) * sk.radius : 0), z = cz + (i ? rnd(-0.75, 0.75) * sk.radius : 0); // inside the telegraph ring
          FX.later(0.15 + i * 0.16, () => {
            if (G.phase !== 'play') return;
            const y = z * TILT;
            if (sk.pillar) { FX.pillar(x, y, 0.6, sk.color); spawnStatic('Azazel_skill1_Hit_m', x, y + 0.3, 0.2); }
            else FX.meteor(x, y, null, sk.color);
            FX.later(sk.pillar ? 0.05 : 0.55, () => { if (G.phase !== 'play') return; if (!sk.pillar) { const bk = rnd(0.85, 1.2); spawnStatic('simple_explosion', x, y + 0.3, 0.22 * bk); scorch(x, y, sk.radius * 0.5 * bk); } hitArea(x, z, sk.radius, sk.dmg, { stun: sk.stun, slow: sk.slow }); if (!i) impact(u, x, z, sk.color); FX.shake(0.15); SFX.play('expS', 0.5); });
          });
        }
        break;
      }
      case 'storm': {
        const list = shuffle(enemiesNear(side, u.x, u.z, sk.reach, true)); // troops only: not a tower-melter
        for (let i = 0; i < sk.n; i++) {
          const o = list[i % Math.max(1, list.length)];
          const x = o ? o.x : u.x + rnd(-3, 3), z = o ? o.z : u.z - SGN[side] * rnd(1, 4);
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
        if (own) spawnStatic(own, ex, ez * TILT + 0.4, u.fxk * 1.2, u.face);
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
    S.hand[idx] = S.queue.shift();
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
        const tr = spawnTroop(b.side, tc, clamp(b.x + rnd(-0.4, 0.4), -8.6, 8.6), b.z - s * (b.r + 0.4), 0, b.lv);
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
      u.shadow.alpha = Math.max(0, 0.62 - u.dieT); u.disc.alpha = Math.max(0, 0.95 - u.dieT * 2); if (u.halo) u.halo.alpha = Math.max(0, 0.2 - u.dieT);
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
        FX.particle({ x: u.x, y: u.z * TILT + u.bodyH * 0.4, life: 0.25, size: 0.6, size1: u.bodyH * 1.6, color: teamHex(u.side), tex: FX.tex.glow, alpha: 0.6 });
        for (let i = 0; i < 8; i++) FX.particle({ x: u.x + rnd(-0.4, 0.4), y: u.z * TILT, vx: rnd(-1, 1), vy: rnd(0.2, 0.6), life: 0.45, size: 0.3, size1: 0.8, color: 0x8a96a3, alpha: 0.35, normal: true, frames: FX.sheets.smoke, order: L.LOW });
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
        if (Math.random() < dt * 20) FX.particle({ x: u.x, y: cy, life: 0.12, size: 0.3 + f * 0.9, size1: 0.2 + f * 1.1, color: sk.color, tex: FX.tex.glow, alpha: 0.35 + f * 0.4 });
      }
      if (!u.skillFired && u.casting <= 0.5) { u.skillFired = true; skillEffect(u); }
      if (u.casting <= 0) { u.casting = 0; if (u.sd) u.sd.speed = 1; u.state = 'idle'; }
      return false;
    }
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
    const mult = G.overtime ? 3 : rush || G.clock <= BAL.doubleAt ? 2 : 1;
    if (mult !== G.mult) {
      G.mult = mult;
      UI.banner(mult === 2 ? '에너지 2배!' : '에너지 3배!', 'warn');
      logEvent(mult === 2 ? '에너지 2배 돌입' : '에너지 3배 돌입');
      SFX.play('warning', 0.5);
      if (mult === 2) SFX.music('battle2');
    }
    for (const side of ['blue', 'red']) {
      const S = G.sides[side];
      const k = S.ai ? S.ai.diff.elixirK : 1;
      const before = S.elixir, gain = dt / BAL.elixirRate * mult * k * (G.mut && G.mut.elixir || 1);
      S.elixir = Math.min(BAL.elixirMax, S.elixir + gain);
      G.stats[side].wasted += Math.max(0, before + gain - BAL.elixirMax); // only what spilled over the cap
      if (before < BAL.elixirMax && S.elixir >= BAL.elixirMax) S.fullT = 0;
      if (S.elixir >= BAL.elixirMax) S.fullT = (S.fullT || 0) + dt;
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

  function endMatch(winner, reason) {
    if (G.phase !== 'play') return;
    G.phase = 'ended';
    G.result = winner;
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
    setTimeout(() => { if (G.opts === opts) UI.result(winner, cb, cr, stats, reason); }, 1800);
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
    const pool = DATA.byFaction(faction).filter((c) => c.arena <= arena);
    const pick = (f) => { const l = pool.filter((c) => f(c) && !deck.includes(c.id)); return l.length ? l[Math.floor(Math.random() * l.length)].id : null; };
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
    if (Math.random() < 0.7) {
      const ch = DATA.byFaction(faction).filter((c) => c.rarity === 3 && c.arena <= arena + (forPlayer ? 0 : 1) && !deck.includes(c.id));
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
        e.shadow.sz = Math.max(1.3, e.r * 3.6) * (0.5 + 0.5 * fall);
        if (e.alive) {
          const show = e.deployT > 0 || e.hp < e.max;
          if (show) {
            const by = y + e.bodyH * (e.air ? 0.9 : 1.05) + 0.15;
            if (e.deployT > 0) setBar(e.bar, 1 - e.deployT / e.deploy0, e.x, by, 0xcfd6dd);
            else setBar(e.bar, e.hp / e.max, e.x, by, e.shieldT > 0 ? 0xffd040 : teamHex(e.side));
          } else hideBar(e.bar);
          if (e.shieldT > 0 || e.hasteT > 0) sparkle(e, dt, () => FX.particle({ x: e.x + rnd(-0.4, 0.4), y: y + rnd(0, e.bodyH), vy: 1, life: 0.4, size: 0.2, size1: 0, color: e.shieldT > 0 ? e.card.skill.color : e.hasteColor || 0xd65cff, tex: FX.tex.dot }));
          // your champion's skill is ready: a pulsing ring at its feet points to the button
          if (e.side === 'blue' && e.card.skill && (e.readyT = (e.readyT || 0) - dt) <= 0 && skillReady(e) && G.sides.blue.elixir >= skillCost(e)) {
            e.readyT = 0.7;
            FX.groundRing(e.x, e.z * TILT, 0.3, 1.3, e.card.skill.color, 0.6, 0.8);
          }
          if (e.freezeT > 0 && Math.random() < 0.15) FX.particle({ x: e.x + rnd(-0.4, 0.4), y: y + rnd(0, e.bodyH), vy: -0.4, life: 0.5, size: 0.22, size1: 0, color: 0xdff8ff, tex: FX.tex.snow });
        }
      } else {
        e.holder.position.set(e.x, e.z * TILT + TOWER_E[e.type] * 0.92, 0);
        e.holder.scale.x = e.face * e.natural;
        e.base.renderOrder = L.UNIT - (e.z - e.r * 0.2) * TILT * 10;
        if (e.sd) {
          e.sd.setOrder(e.base.renderOrder + 0.5);
          if (e.alive && e.active) {
            const tk = e.freezeT > 0 ? 1 : e.hitT > 0 ? 2 : e.stunT > 0 ? 3 : e.hasteT > 0 ? 5 : 0;
            tintTo(e, tk, dt);
          }
          if (e.hasteT > 0) sparkle(e, dt, () => FX.particle({ x: e.x + rnd(-0.5, 0.5), y: e.z * TILT + TOWER_E[e.type] + rnd(0, 1.2), vy: 1, life: 0.4, size: 0.2, size1: 0, color: e.hasteColor || 0xd65cff, tex: FX.tex.dot }));
        }
        const hb = e.hitT > 0 ? 1 + 0.25 * clamp(e.hitT / 0.1, 0, 1) : 1; // eases back from the hit flash, then exactly 1
        if (hb === 1 ? e.baseB !== 1 && e.baseB != null : Math.abs((e.baseB || 1) - hb) > 0.01) { e.baseB = hb; e.base.material.color.setScalar(hb); }
        // damage stages swap in a cracked (50%) and a scorched (25%) bunker
        if (e.alive && e.texKey && e.type !== 'bld') {
          const st = e.hp < e.max * 0.35 ? 2 : e.hp < e.max * 0.7 ? 1 : 0; // damage shows early and builds up
          if (e.stage !== st) { if (st === 2 && !e.fireGlow) e.fireGlow = FX.sprite({ x: e.x, y: e.z * TILT + 0.2, size: e.r * 3.4, aspect: TILT, color: 0xff6a20, alpha: 0.45, tex: FX.tex.glow, order: L.GROUND + 4 }); e.stage = st; /* a burning tower casts an orange glow on the deck */ const S = G.sides[e.side], k = e.texKey + ':' + st; const tc = towerTex[k] || (towerTex[k] = towerCanvas(e.type, e.side, false, emblems[S.faction], S.faction, st)); e.base.material.map = tc.tex; e.base.material.needsUpdate = true; if (st) { FX.sparks(e.x, e.z * TILT + TOWER_E[e.type], 0xffb060, 14, 4, 0.16, 0.6); FX.shake(0.12); } }
        }
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
        if (e.dmgAcc >= 1 && e.dmgT <= 0) {
          e.dmgT = 0.6; // hits are summed into one number about twice a second
          const q = toScreen(e.x + rnd(-0.6, 0.6), e.z * TILT + TOWER_E[e.type] + 1.2);
          UI.dmgNum(q[0], q[1], Math.round(e.dmgAcc), e.side);
          e.dmgAcc = 0;
        }
        if (e.aura) e.aura.alpha = !e.alive ? 0 : !e.active ? 0.06 : (e.target ? 0.26 : 0.14) + Math.sin(amb.t * 3 + e.x) * 0.05; // a soft pool, not a slab
        const p = e.side === 'blue' ? toScreen(e.x, (e.z - e.r) * TILT - 0.55) : toScreen(e.x, e.z * TILT + TOWER_E[e.type] + e.bodyH + (e.type === 'king' ? 0.45 : 0.35));
        const lt = `translate(${Math.round(p[0])}px,${Math.round(p[1])}px)`;
        if (e.labelT !== lt) { e.labelT = lt; e.label.style.transform = lt; } // written only when it moves (shake)
        if (e.alive) {
          const w = (e.hp / e.max * 100).toFixed(1) + '%';
          if (e.labelW !== w) { e.labelW = w; e.label.firstChild.firstChild.style.width = w; }
          const hv = Math.ceil(e.hp);
          if (e.hpShown !== hv) { if (e.hpShown > hv && G.time - (e.plateT || -1) > 0.25) { e.plateT = G.time; e.label.classList.remove('hit'); void e.label.offsetWidth; e.label.classList.add('hit'); } e.hpShown = hv; e.label.children[1].textContent = hv; const low = e.hp < e.max * 0.3; if (e.labelLow !== low) { e.labelLow = low; e.label.classList.toggle('low', low); } } // a plate under 30% pulses
        }
      }
    }
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
    if (composer && QUALITY[perf.level].bloom) composer.render(); else renderer.render(scene, camera);
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
    const key = w + 'x' + h + '@' + renderer.getPixelRatio();
    if (!force && key === lastSize) return;
    lastSize = key;
    view.w = w; view.h = h;
    renderer.setSize(w, h);
    if (composer) composer.setSize(w, h);
    const fw = 18.3, top = 16.2 * TILT + 5.6, bot = -16.4 * TILT - 1.0, fh = top - bot;
    const k = Math.min(w / fw, h / fh);
    const cw = w / k, ch = h / k, cy = (top + bot) / 2;
    camera.left = -cw / 2; camera.right = cw / 2; camera.top = cy + ch / 2; camera.bottom = cy - ch / 2;
    camera.updateProjectionMatrix();
    fitBack();
  }

  function setQuality(lv, quiet) {
    perf.level = clamp(lv, 0, QUALITY.length - 1);
    const q = QUALITY[perf.level];
    renderer.setPixelRatio(Math.min(q.dpr, window.devicePixelRatio || 1));
    FX.setBudget(q.parts);
    if (bloom) bloom.strength = q.bloom || 0;
    resize(true);
    if (!quiet) UI.toast(`그래픽 품질: ${q.name}`);
  }
  function perfTick(interval, work) {
    if (G.phase !== 'play' || G.paused) { perf.acc = perf.n = perf.work = 0; return; }
    perf.acc += interval; perf.work += work; perf.n++;
    if (perf.n < 120) return;
    const avg = perf.acc / perf.n, wk = perf.work / perf.n;
    perf.fps = Math.round(1000 / avg);
    perf.acc = perf.n = perf.work = 0;
    // our own frame work decides (a throttled / 30 Hz display alone is not a reason to drop quality)
    const slow = wk > 12 || (avg > 30 && wk > 7);
    perf.slow = slow ? perf.slow + 1 : 0;
    if (UI.save.autoQuality === false) return;
    if (perf.slow >= 2 && perf.level < QUALITY.length - 1) { perf.slow = 0; perf.good = 0; setQuality(perf.level + 1); return; }
    // plenty of headroom for a while: step back up (a busy moment should not cost the whole session)
    perf.good = !slow && wk < 5 ? (perf.good || 0) + 1 : 0;
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
        attachRig(o, c.rig, c.k * TROOP_K, c.h && c.h * TROOP_K, true);
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
  function dropAt(px, py) {
    if (G.sel < 0 || !G.ghost) return false;
    ghostAt(px, py);
    if (G.phase !== 'play') { UI.toast('전투 시작을 기다리세요'); return false; }
    const S = G.sides.blue, c = CARD[S.hand[G.sel]];
    if (S.elixir < c.cost) { UI.toast('에너지가 부족합니다'); SFX.play('fail', 0.4); UI.elixirShake(); return false; }
    if ((c.type === 'troop' && !canDeploy('blue', G.ghost.x, G.ghost.z)) || (c.type === 'building' && !canBuild('blue', G.ghost.x, G.ghost.z, c))) { UI.toast(c.type === 'building' ? '건물은 아군 진영의 빈 곳에만 지을 수 있습니다' : '여기에는 배치할 수 없습니다'); SFX.play('fail', 0.4); return false; }
    playCard('blue', G.sel, G.ghost.x, G.ghost.z);
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
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function makeSide(side, faction, deck, ai, levels, lvl) {
    const d = shuffle(deck.slice());
    return { side, faction, deck: d, hand: d.slice(0, 4), queue: d.slice(4), elixir: BAL.elixirStart, crowns: 0, towers: [], blds: [], ai, levels, lvl };
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
    G.drag = null; G.errShown = false; G.slowmo = 0; G.hitStop = 0; G.lastBlue = null; G.troops = { blue: [], red: [] };
    (G.after || []).forEach(({ hold, c }) => { scene.remove(hold); SD.release(c); }); G.after = [];
    FX.clear();
    FXB.trimPools(4);
    if (labelsEl) labelsEl.innerHTML = '';
  }

  const floorImg = {}; // floor art by url (null while loading)
  function setArena(a) {
    const fu = location.protocol !== 'file:' && ARENAS[a].floor; // (from file:// the image would taint the floor texture: keep the drawn floor there)
    if (fu && !(fu in floorImg)) { floorImg[fu] = null; const im = new Image(); im.onload = () => { floorImg[fu] = im; if (G.arenaDrawn === a) { G.arenaDrawn = -1; setArena(a); } }; im.src = fu; } // redrawn with the art once it arrives
    if (G.arenaDrawn === a) return;
    G.arenaDrawn = a;
    if (fieldTex) fieldTex.dispose();
    fieldTex = new THREE.CanvasTexture(fieldCanvas(ARENAS[a]));
    fieldTex.anisotropy = 4;
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
      const use = (tx) => { amb.back.material.map = tx; amb.back.material.needsUpdate = true; amb.back.visible = true; fitBack(); };
      setBackdropTint(a);
      amb.back.visible = false;
      if (bgTex[url]) use(bgTex[url]);
      else if (url) new THREE.TextureLoader().load(url, (tx) => { bgTex[url] = tx; if (G.arenaDrawn === a) use(tx); }, undefined, () => {}); // file://: stays dark
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
      amb.lamps.push(FX.sprite({ x: sx * 9.45, y: z * TILT, size: 0.7, color: ARENAS[0].glow, alpha: 0.6, tex: FX.tex.glow, order: L.GROUND }));
    }
    setBackdrop(G.arenaDrawn || 0);
  }
  function updateAmbient(dt) {
    amb.t += dt;
    if (aimMarks.length) aimMarks[0].alpha = 0.65 + 0.3 * Math.sin(amb.t * 9); // the aim reticle pulses
    if (amb.river) { amb.river.material.map.offset.x -= dt * 0.12; amb.river.material.opacity = 0.58 + Math.sin(amb.t * 2.1) * 0.12; }
    if (amb.river2) { amb.river2.material.map.offset.x += dt * 0.05; amb.river2.material.opacity = 0.35 + Math.sin(amb.t * 1.3 + 1) * 0.1; }
    amb.lamps.forEach((l, i) => { l.alpha = 0.35 + 0.3 * Math.max(0, Math.sin(amb.t * 1.7 + i * 1.3)); });
    // the backdrop art drifts and breathes very slowly (a living scene behind the floor, no extra pass)
    if (amb.back && amb.back.visible && amb.backS) { const k = 1.04 + 0.02 * Math.sin(amb.t * 0.11); amb.back.scale.set(amb.backS[0] * k, amb.backS[1] * k, 1); amb.back.position.x = Math.sin(amb.t * 0.07) * 0.45;
    }
    // the haze drifts one way behind the deck and the veil the other way over it (true parallax: different layers, speeds and scales)
    if (amb.back2 && amb.back2.material.map) amb.back2.visible = amb.veil.visible = !!QUALITY[perf.level].bloom; // both fog layers are off on low quality (fill rate)
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
      FX.particle({ x: rnd(-9, 9), y: rnd(-12, 11), vx: rnd(-0.15, 0.15), vy: rnd(0.15, 0.45), life: rnd(3, 5), size: rnd(0.06, 0.14), size1: 0.02, color: ARENAS[G.arenaDrawn || 0].glow, tex: FX.tex.glow, alpha: 0.5, fadeIn: 1, order: L.GROUND + 50 });
    }
    amb.sweepT -= dt;
    if (amb.sweepT <= 0) { amb.sweepT = 9 + Math.random() * 6; amb.sweepX = -16; }
    if (amb.sweepX != null && amb.sweep) {
      amb.sweepX += dt * 9;
      amb.sweep.position.set(amb.sweepX, 0, 0);
      amb.sweep.material.opacity = 0.05 * Math.max(0, 1 - Math.abs(amb.sweepX) / 16);
      if (amb.sweepX > 16) { amb.sweepX = null; amb.sweep.material.opacity = 0; }
    }
  }

  // opts: { faction, deck, diff, mode, levels, arena, foe }
  async function start(opts) {
    clearBattle();
    G.opts = opts;
    G.arena = opts.arena || 0;
    setArena(G.arena);
    G.mut = opts.mode === 3 ? DATA.mutatorOf() : null;
    G.opDay = DATA.dayIndex(); // credited to the day the rule was drawn (a match may end past midnight)
    const foeF = G.mut && G.mut.mirror ? opts.faction : opts.faction === 'orca' ? 'iron' : 'orca'; // mirror: the same faction too
    const diff = BAL.diffs[opts.diff] || BAL.diffs[1];
    const style = DATA.STYLES[(opts.foe && opts.foe.style) || 'balanced'];
    const aiDeck0 = buildDeck(foeF, G.arena, style, false, opts.mode === 2 ? null : opts.deck);
    const myDeck = opts.mode === 2 ? buildDeck(opts.faction, G.arena, null, true) : opts.deck; // random-deck mode (unlocked cards only)
    const aiDeck = G.mut && G.mut.mirror ? myDeck.slice() : aiDeck0; // mirror operation: the same eight cards
    G.hints = G.mut && G.mut.mirror ? ['당신과 똑같은 덱으로 맞섭니다'] : hints.slice();
    // the opponent is matched to the arena and to the player's deck level (difficulty shifts it by one)
    const myLvl = myDeck.reduce((s, id) => s + ((opts.levels || {})[id] || 1), 0) / myDeck.length;
    // mostly the player's own deck level (a small arena floor): out-levelling must not become a wall either way
    const aiLvl = clamp(Math.round(myLvl * 0.8 + ARENAS[G.arena].lvl * 0.2 + diff.lvl), 1, LEVEL.max);
    G.sides = {
      blue: makeSide('blue', opts.faction, myDeck, null, opts.levels || {}, 1),
      red: makeSide('red', foeF, aiDeck, { diff, style, t: 3 + Math.random() * 2, push: null, lane: Math.random() < 0.5 ? -1 : 1 }, null, aiLvl),
    };
    const st0 = () => ({ dmg: 0, kills: 0, spent: 0, wasted: 0, skills: 0, cards: 0, by: {} });
    G.stats = { blue: st0(), red: st0() };
    G.log = [];
    G.phase = 'loading';
    // every rig and baked effect this match can show
    const rigs = new Set(), fxs = new Set();
    for (const s of ['blue', 'red']) {
      const f = FACTIONS[G.sides[s].faction];
      rigs.add(f.king.rig); rigs.add(f.princess.rig);
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
    const towerRigs = new Set(Object.values(FACTIONS).flatMap((f) => [f.king.rig, f.princess.rig]));
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
    for (const side of ['blue', 'red']) {
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
    SFX.music(opts.mode === 1 ? 'battle2' : 'battle');
    resize(true);
  }

  // ── loop ──────────────────────────────────────────────
  let last = 0, acc = 0;
  const DT = 1 / 60;
  function frame(now) {
    requestAnimationFrame(frame);
    const interval = last ? now - last : 16.7;
    let dt = Math.min(0.1, interval / 1000);
    last = now;
    if (!renderer || G.paused || G.lost) return;
    if (G.hitStop > 0) { G.hitStop -= dt; dt *= 0.06; } else if (G.slowmo > 0) { G.slowmo -= dt; dt *= 0.35; }
    const t0 = performance.now();
    try {
      if (G.phase === 'countdown') {
        G.cdT -= dt;
        const n = Math.ceil(G.cdT - 0.2);
        if (n !== G.cdN) { G.cdN = n; if (n > 0) { UI.countdown(n); SFX.play('click', 0.5); } else { UI.countdown(0); SFX.play('start', 0.6); G.phase = 'play'; } }
        for (const e of G.ents) if (e.sd) e.sd.update(dt);
      }
      if (G.phase === 'play') {
        acc += dt;
        let n = 0;
        while (acc >= DT && n < 6) { step(DT); acc -= DT; n++; }
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
      FX.update(dt);
      if (G.phase === 'play' || G.phase === 'countdown' || G.phase === 'ended') {
        render(dt);
        UI.tick(G);
      }
    } catch (err) {
      // one bad frame must not kill the match: report once, keep going
      if (!G.errShown) { G.errShown = true; console.error(err); UI.toast('오류가 발생했지만 전투를 계속합니다'); }
    }
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
    SD.texScale = MOBILE ? 0.35 : 0.5;
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
    renderer.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); G.lost = true; UI.toast('그래픽 장치를 다시 준비하는 중…'); });
    renderer.domElement.addEventListener('webglcontextrestored', () => { G.lost = false; resize(true); UI.toast('그래픽 장치가 복구되었습니다'); });
    bindInput();
    SFX.preload();
    requestAnimationFrame(frame);
  }

  function pause(on) {
    if (G.phase !== 'play' && G.phase !== 'countdown') return;
    G.paused = on;
    last = 0;
  }
  function surrender() {
    G.paused = false;
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
  function leave() { G.opts = null; clearBattle(); G.phase = 'title'; G.paused = false; SFX.music('title'); }

  window.GAME = {
    G, boot, start, select, deselect, cardDown, pause, surrender, leave, resize, useSkill, champions, setQuality, buildDeck,
    get cameraZoom() { return camera ? camera.zoom : 1; },
    get cameraPos() { return camera ? [camera.position.x, camera.position.y] : [0, 0]; },
    get perf() { return perf; }, QUALITY, autoLevel: MOBILE ? 1 : 0,
    get info() { return renderer ? { geo: renderer.info.memory.geometries, tex: renderer.info.memory.textures, calls: renderer.info.render.calls, scene: scene.children.length, fx: FX.count() } : null; },
    skillState(u) { return { ready: skillReady(u), cd: Math.max(0, u.skillCd), cdMax: u.card.skill.cd * (G.mut && G.mut.skillCd || 1), cost: skillCost(u) }; },
    // test hooks: run the battle for `sec` seconds at once (background tabs throttle requestAnimationFrame)
    _playCard: playCard, _canDeploy: canDeploy,
    _fx: (n, x, y, k) => spawnStatic(n, x, y, k),
    _toScreen: (x, y) => toScreen(x, y),
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
