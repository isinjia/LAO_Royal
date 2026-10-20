// three.js effect system: pooled additive particles, ribbons (lightning/laser),
// timed composite effects (meteor, pillars), screen shake and flashes.
// (from 5_LAO_Defence; Last Royal adds ground ellipses for the tilted arena and batched HP bars)
(function () {
  // render layers: ground marks under the troops (1000 + depth), effects / bars / flash above them
  const L = { GROUND: 800, UNIT: 1000, LOW: 5990, PROJ: 5995, FX: 6000, BAR: 7000, TOP: 9500 };
  let scene, tex = {}, sheets = {};
  const parts = [];   // live particles (drawn by instanced batches, see drawParticles)
  const MAX_PARTS = 900;
  const ribbons = []; // live ribbon meshes
  const timers = [];  // scheduled callbacks {t, fn}
  const tickers = []; // per-frame callbacks returning false when done
  let flashMesh;
  const state = { shake: 0 };

  function canvasTex(c) {
    const t = new THREE.CanvasTexture(c);
    t.minFilter = THREE.LinearFilter;
    return t;
  }

  function splitSheet(img, cols, rows) {
    const out = [];
    const w = img.width / cols, h = img.height / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, c * w, r * h, w, h, 0, 0, w, h);
        out.push(canvasTex(cv));
      }
    }
    return out;
  }

  function softTex(kind) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const g = cv.getContext('2d');
    if (kind === 'beam') {
      const gr = g.createLinearGradient(0, 0, 0, 64);
      gr.addColorStop(0, 'rgba(255,255,255,0)');
      gr.addColorStop(0.35, 'rgba(255,255,255,0.55)');
      gr.addColorStop(0.5, 'rgba(255,255,255,1)');
      gr.addColorStop(0.65, 'rgba(255,255,255,0.55)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    } else if (kind === 'dot') {
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.25, 'rgba(255,255,255,0.8)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    } else if (kind === 'slash') {
      // crescent arc
      g.translate(32, 40);
      const gr = g.createLinearGradient(-32, 0, 32, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0)');
      gr.addColorStop(0.5, 'rgba(255,255,255,1)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.strokeStyle = gr; g.lineCap = 'round';
      for (let i = 0; i < 6; i++) {
        g.globalAlpha = 1 - i * 0.15; g.lineWidth = 6 - i;
        g.beginPath(); g.arc(0, 18 + i * 1.5, 34, Math.PI * 1.18, Math.PI * 1.82); g.stroke();
      }
    } else if (kind === 'snow') {
      g.translate(32, 32); g.strokeStyle = '#fff'; g.lineWidth = 4; g.lineCap = 'round';
      for (let i = 0; i < 6; i++) {
        g.rotate(Math.PI / 3); g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 26);
        g.moveTo(0, 14); g.lineTo(7, 20); g.moveTo(0, 14); g.lineTo(-7, 20); g.stroke();
      }
    }
    return canvasTex(cv);
  }

  // all particle textures and sheet frames share one atlas so particles batch into a few draw calls
  const CELL = 128;
  let atlasTex = null;
  const rectOf = new Map(); // texture -> [u0, v0, su, sv]
  function buildAtlas(list) {
    const cols = 8, rows = Math.ceil(list.length / cols);
    const cv = document.createElement('canvas');
    cv.width = cols * CELL; cv.height = rows * CELL;
    const g = cv.getContext('2d');
    list.forEach((t, i) => {
      const x = (i % cols) * CELL, y = Math.floor(i / cols) * CELL;
      g.drawImage(t.image, x + 1, y + 1, CELL - 2, CELL - 2);
      rectOf.set(t, [(x + 1) / cv.width, 1 - (y + CELL - 1) / cv.height, (CELL - 2) / cv.width, (CELL - 2) / cv.height]);
    });
    atlasTex = new THREE.CanvasTexture(cv);
    atlasTex.minFilter = THREE.LinearFilter;
  }

  // one instanced quad batch per (blending, render order)
  const batches = new Map();
  const PVS = [
    'attribute vec2 iPos; attribute vec2 iScale; attribute float iRot; attribute vec4 iColor; attribute vec4 iUV;',
    'varying vec2 vUv; varying vec4 vColor;',
    'void main() {',
    '  vec2 p = position.xy * iScale; float c = cos(iRot), s = sin(iRot);',
    '  p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);',
    '  vUv = iUV.xy + uv * iUV.zw; vColor = iColor;',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(p + iPos, 0.0, 1.0);',
    '}',
  ].join('\n');
  const PFS = [
    'uniform sampler2D map; varying vec2 vUv; varying vec4 vColor;',
    'void main() { vec4 t = texture2D(map, vUv); gl_FragColor = vec4(t.rgb * vColor.rgb, t.a * vColor.a); }',
  ].join('\n');
  function batch(normal, order) {
    const key = (normal ? 'n' : 'a') + order;
    let b = batches.get(key);
    if (b) return b;
    const quad = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute('position', quad.attributes.position);
    g.setAttribute('uv', quad.attributes.uv);
    const mk = (n) => new THREE.InstancedBufferAttribute(new Float32Array(MAX_PARTS * n), n).setUsage(THREE.DynamicDrawUsage);
    const at = { iPos: mk(2), iScale: mk(2), iRot: mk(1), iColor: mk(4), iUV: mk(4) };
    Object.entries(at).forEach(([k, a]) => g.setAttribute(k, a));
    g.instanceCount = 0;
    const m = new THREE.ShaderMaterial({
      uniforms: { map: { value: atlasTex } }, vertexShader: PVS, fragmentShader: PFS,
      transparent: true, depthTest: false, depthWrite: false, blending: normal ? THREE.NormalBlending : THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false;
    mesh.renderOrder = order;
    scene.add(mesh);
    b = { mesh, g, at, n: 0 };
    batches.set(key, b);
    return b;
  }

  // write every live particle into its batch (called once per frame from update)
  const tmpCol = new THREE.Color();
  function drawParticles() {
    for (const b of batches.values()) b.n = 0;
    for (const p of parts) {
      if (p.hidden || p.dead) continue;
      const b = p.b;
      if (b.n >= MAX_PARTS) continue; // a full batch drops the rest this frame (only reachable in lab stress runs)
      const i = b.n++;
      const at = b.at;
      at.iPos.array[i * 2] = p.x; at.iPos.array[i * 2 + 1] = p.y;
      at.iScale.array[i * 2] = p.sz; at.iScale.array[i * 2 + 1] = p.sz * p.aspect;
      at.iRot.array[i] = p.rot;
      tmpCol.setHex(p.color);
      at.iColor.array[i * 4] = tmpCol.r; at.iColor.array[i * 4 + 1] = tmpCol.g; at.iColor.array[i * 4 + 2] = tmpCol.b; at.iColor.array[i * 4 + 3] = p.alpha;
      at.iUV.array.set(p.uv, i * 4);
    }
    for (const b of batches.values()) {
      b.g.instanceCount = b.n;
      if (b.n) for (const a of Object.values(b.at)) { a.updateRange.offset = 0; a.updateRange.count = b.n * a.itemSize; a.needsUpdate = true; }
    }
  }

  function init(sc, images) {
    scene = sc;
    const t = (img) => { const x = new THREE.Texture(img); x.needsUpdate = true; x.minFilter = THREE.LinearFilter; return x; };
    ['glow', 'cross', 'ring', 'spark', 'elec'].forEach((k) => { tex[k] = t(images['fx_' + k]); });
    sheets.smoke = splitSheet(images.fx_smoke, 2, 2);
    sheets.fire = splitSheet(images.fx_firehit, 2, 2);
    sheets.aura = splitSheet(images.fx_aura, 2, 2);
    sheets.bolt = splitSheet(images.fx_bolt, 2, 2);
    tex.beam = softTex('beam');
    tex.dot = softTex('dot');
    tex.slash = softTex('slash');
    tex.snow = softTex('snow');
    const wc = document.createElement('canvas'); wc.width = wc.height = 8;
    wc.getContext('2d').fillStyle = '#fff'; wc.getContext('2d').fillRect(0, 0, 8, 8);
    tex.white = canvasTex(wc); // solid quads (HP bars) in the particle batches

    buildAtlas([...['glow', 'cross', 'ring', 'spark', 'elec', 'beam', 'dot', 'slash', 'snow', 'white'].map((k) => tex[k]),
      ...sheets.smoke, ...sheets.fire, ...sheets.aura, ...sheets.bolt]);

    flashMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false })
    );
    flashMesh.renderOrder = L.TOP;
    flashMesh.visible = false;
    scene.add(flashMesh);
  }

  // Spawn one particle. o: {x,y,vx,vy,life,size,size1,color,alpha,tex,frames,rot,spin,drag,grav,normal,order}
  function particle(o) {
    if (o.life !== Infinity && parts.length - keeps - deadN >= budget()) {
      // budget reached: retire the oldest effect particle (never the persistent quads); compacted in update()
      while (rc < parts.length && (parts[rc].keep || parts[rc].dead)) rc++;
      if (rc < parts.length) { const q = parts[rc]; q.dead = q.noPool = true; deadN++; } // its owner may still hold it
    }
    const t0 = o.frames ? o.frames[0] : (o.tex || tex.glow);
    const a0 = o.alpha != null ? o.alpha : 1;
    const p = freeP.pop() || {};
    p.x = o.x; p.y = o.y; p.vx = o.vx || 0; p.vy = o.vy || 0; p.t = 0; p.life = o.life || 0.5;
    p.size = o.size; p.size1 = o.size1 != null ? o.size1 : o.size; p.sz = o.size; p.aspect = o.aspect || 1;
    p.a0 = a0; p.alpha = a0; p.rot = o.rot || 0; p.spin = o.spin || 0; p.drag = o.drag || 0; p.grav = o.grav || 0;
    p.frames = o.frames; p.fadeIn = o.fadeIn || 0; p.color = o.color != null ? o.color : 0xffffff;
    p.uv = rectOf.get(t0) || rectOf.get(tex.glow); p.b = batch(!!o.normal, o.order || L.FX);
    p.keep = false; p.dead = false; p.noPool = false; p.hidden = false;
    parts.push(p);
    return p;
  }

  // persistent particle (no lifetime) moved by its owner, e.g. projectiles; remove with kill()
  let keeps = 0;
  function sprite(o) { const p = particle({ ...o, life: Infinity }); p.keep = true; keeps++; return p; }
  // removed lazily (compacted in update); killed sprites are never pooled: their owner may still hold them
  function kill(p) { if (!p || p.dead) return; p.dead = p.noPool = true; deadN++; if (p.keep) keeps--; }
  let deadN = 0, rc = 0;
  const freeP = []; // expired effect particles for reuse
  function setTex(p, t) { p.uv = rectOf.get(t) || p.uv; }

  // fewer live particles on phones (fill rate)
  let budgetN = MAX_PARTS;
  function budget() { return budgetN; }
  function setBudget(n) { budgetN = Math.max(60, Math.min(MAX_PARTS, n)); }

  function release() { /* particles live in arrays only */ }

  const rnd = (a, b) => a + Math.random() * (b - a);

  // ── ribbons ──────────────────────────────────────────────
  // edge vertices of a ribbon of width w along pts (written in place when a beam narrows)
  function ribbonPos(pos, pts, w) {
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const ww = pts[i].w != null ? pts[i].w : 1;
      const nx = -dy / len * w / 2 * ww, ny = dx / len * w / 2 * ww;
      const o = i * 6;
      pos[o] = pts[i].x + nx; pos[o + 1] = pts[i].y + ny; pos[o + 2] = 0;
      pos[o + 3] = pts[i].x - nx; pos[o + 4] = pts[i].y - ny; pos[o + 5] = 0;
    }
  }
  function ribbonGeo(pts, w) {
    const n = pts.length;
    const pos = new Float32Array(n * 2 * 3);
    const uv = new Float32Array(n * 2 * 2);
    const idx = [];
    ribbonPos(pos, pts, w);
    for (let i = 0; i < n; i++) {
      uv.set([i / (n - 1), 0, i / (n - 1), 1], i * 4);
      if (i < n - 1) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }

  // ribbons are pooled by point count (lasers and lightning fire constantly: no geometry / material per shot)
  const ribbonPool = {};
  function freeRibbon(mesh) {
    scene.remove(mesh);
    const p = ribbonPool[mesh.userData.n] || (ribbonPool[mesh.userData.n] = []);
    if (p.length < 16) p.push(mesh); else { mesh.geometry.dispose(); mesh.material.dispose(); }
  }
  function ribbon(pts, w, color, life, opts = {}) {
    const n = pts.length;
    let mesh = ribbonPool[n] && ribbonPool[n].pop();
    if (mesh) {
      const at = mesh.geometry.attributes.position;
      ribbonPos(at.array, pts, w);
      at.needsUpdate = true;
      mesh.material.color.setHex(color);
      mesh.material.opacity = opts.alpha || 1;
    } else {
      const mat = new THREE.MeshBasicMaterial({
        map: tex.beam, color, transparent: true, opacity: opts.alpha || 1,
        blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
      });
      mesh = new THREE.Mesh(ribbonGeo(pts, w), mat);
      mesh.frustumCulled = false; // positions are rewritten on reuse
      mesh.userData.n = n;
    }
    const mat = mesh.material;
    mesh.renderOrder = opts.order || L.FX + 1;
    scene.add(mesh);
    ribbons.push({ mesh, t: 0, life, a0: mat.opacity, grow: opts.grow || 0, pts, w, shrink: opts.shrink });
    return mesh;
  }

  function jagged(x0, y0, x1, y1, amp = 0.25, step = 0.32) {
    const d = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(2, Math.ceil(d / step));
    const nx = -(y1 - y0) / (d || 1), ny = (x1 - x0) / (d || 1);
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      const o = (i === 0 || i === n) ? 0 : rnd(-amp, amp);
      pts.push({ x: x0 + (x1 - x0) * f + nx * o, y: y0 + (y1 - y0) * f + ny * o });
    }
    return pts;
  }

  // ── public effect helpers ───────────────────────────────
  function sparks(x, y, color, n = 8, speed = 3, size = 0.18, life = 0.45) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * rnd(0.3, 1);
      particle({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * rnd(0.6, 1.2), size, size1: 0, color, tex: tex.dot, drag: 3 });
    }
  }

  function hit(x, y, color, scale = 1) {
    particle({ x, y, life: 0.16, size: 0.35 * scale, size1: 0.6 * scale, color, tex: tex.glow, alpha: 0.5 }); // a small tinted core (the star and sparks carry the hit)
    particle({ x, y, life: 0.2, size: 0.5 * scale, size1: 0.2, color: 0xffffff, tex: tex.cross, rot: Math.random() * 3 });
    sparks(x, y, color, 4, 2.5 * scale, 0.12 * scale, 0.3);
  }

  function explosion(x, y, r, color, big = false) {
    // three beats: a white-hot flash, an orange fireball, then dark smoke and flying debris
    particle({ x, y, life: 0.07, size: r * 0.45, size1: r * 0.85, color: 0xfff6d8, tex: tex.glow, alpha: 0.6 }); // (a short, contained flash: under bloom a bigger one whited out the units in it)
    particle({ x, y, life: 0.45, size: r * 0.9, size1: r * 1.6, color: 0xff9a40, frames: sheets.fire, alpha: 0.85, spin: rnd(-1, 1) });
    particle({ x, y, life: 0.35, size: r * 0.5, size1: r * 2.6, color, tex: tex.ring, alpha: 0.9 });
    const n = big ? 6 : 3;
    for (let i = 0; i < n; i++) {
      particle({ x: x + rnd(-r, r) * 0.4, y: y + rnd(-r, r) * 0.4, vx: rnd(-0.6, 0.6), vy: rnd(0.3, 1.0), life: rnd(0.7, 1.2), size: r * 0.8, size1: r * 2, color: 0x2c2a2a, frames: sheets.smoke, alpha: 0.6, normal: true, order: L.FX - 1, spin: rnd(-1, 1), fadeIn: 0.12 });
    }
    for (let i = 0; i < (big ? 10 : 6); i++) { const a = rnd(0.2, Math.PI - 0.2), v = rnd(3, 6) * Math.max(0.6, r); particle({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, grav: 9, life: rnd(0.5, 0.8), size: 0.14, size1: 0.1, color: 0x3a3028, tex: tex.dot, normal: true, spin: rnd(-6, 6) }); } // debris
    sparks(x, y, color, big ? 18 : 8, 4 * r, 0.16, 0.55);
    if (big) shake(0.18);
  }

  function ring(x, y, r0, r1, color, life = 0.4, alpha = 1, aspect = 1, order) {
    return particle({ x, y, life, size: r0 * 2, size1: r1 * 2, color, tex: tex.ring, alpha, aspect, order });
  }
  // flat marks on the tilted floor (aspect = the arena tilt)
  function groundRing(x, y, r0, r1, color, life = 0.4, alpha = 1) { return ring(x, y, r0, r1, color, life, alpha, groundK, L.GROUND); }
  function groundGlow(x, y, r, color, life = 0.5, alpha = 0.6, fadeIn = 0) {
    return particle({ x, y, life, size: r * 2.4, size1: r * 2.6, color, tex: tex.glow, alpha, aspect: groundK, order: L.GROUND, fadeIn });
  }
  let groundK = 0.74;
  function setGround(k) { groundK = k; }

  function lightning(points, color, width = 0.22, life = 0.18) {
    // points: [{x,y},...] chain path
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      const p = jagged(a.x, a.y, b.x, b.y, 0.22, 0.25);
      ribbon(p, width * 2.2, color, life, { alpha: 0.7 });
      ribbon(p, width * 0.7, 0xffffff, life * 0.8);
      particle({ x: b.x, y: b.y, life: 0.25, size: 0.9, size1: 1.2, color, tex: tex.elec, rot: Math.random() * 6 });
      particle({ x: b.x, y: b.y, life: 0.2, size: 0.6, size1: 0.1, color: 0xffffff, tex: tex.glow });
    }
  }

  function beam(x0, y0, x1, y1, width, color, life = 0.25) {
    const pts = [{ x: x0, y: y0 }, { x: x1, y: y1 }];
    ribbon(pts, width * 2.4, color, life, { alpha: 0.75, shrink: true });
    ribbon(pts, width * 0.8, 0xffffff, life, { shrink: true });
    particle({ x: x0, y: y0, life: life, size: width * 3, size1: width * 1.5, color, tex: tex.glow });
    // sparkle along the beam
    const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d * 2);
    for (let i = 0; i < n; i++) {
      const f = Math.random();
      particle({ x: x0 + (x1 - x0) * f, y: y0 + (y1 - y0) * f, vx: rnd(-1, 1), vy: rnd(-1, 1), life: rnd(0.2, 0.5), size: 0.16, size1: 0, color, tex: tex.dot });
    }
  }

  function slash(x, y, color, size = 1.2) {
    const rot = Math.random() * Math.PI * 2;
    particle({ x, y, life: 0.2, size, size1: size * 1.5, color, tex: tex.slash, rot, alpha: 1 });
    particle({ x, y, life: 0.16, size: size * 0.8, size1: size * 1.3, color: 0xffffff, tex: tex.slash, rot: rot + 0.3, alpha: 0.8 });
    sparks(x, y, color, 5, 3, 0.12, 0.3);
  }

  function flame(x0, y0, x1, y1, color) {
    for (let i = 0; i < 6; i++) {
      const f = rnd(0.1, 1);
      particle({
        x: x0, y: y0, vx: (x1 - x0) / 0.3 * f + rnd(-0.6, 0.6), vy: (y1 - y0) / 0.3 * f + rnd(-0.6, 0.6),
        life: 0.3, size: 0.2, size1: 0.75, color: i % 2 ? color : 0xffd060, frames: sheets.fire, alpha: 0.85, drag: 1.5, spin: rnd(-4, 4),
      });
    }
  }

  function wave(x0, y0, x1, y1, color) {
    for (let i = 0; i < 3; i++) {
      const f = 0.33 * i;
      setTimeout0(i * 0.05, () => {
        const a = Math.atan2(y1 - y0, x1 - x0);
        particle({ x: x0, y: y0, vx: Math.cos(a) * 9, vy: Math.sin(a) * 9, life: Math.hypot(x1 - x0, y1 - y0) / 9, size: 0.3 + f, size1: 0.6, color, tex: tex.ring, alpha: 0.8 });
      });
    }
  }

  function frost(x, y, r, color) {
    ring(x, y, 0.2, r, color, 0.45, 0.9);
    particle({ x, y, life: 0.4, size: r * 1.5, size1: r * 2.2, color, tex: tex.glow, alpha: 0.5 });
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * Math.PI * 2, v = rnd(0.5, 2.2);
      particle({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(0.4, 0.8), size: 0.28, size1: 0.05, color: 0xdff9ff, tex: tex.snow, spin: rnd(-4, 4), drag: 2 });
    }
  }

  function holy(x, y, r, color) {
    particle({ x, y, life: 0.5, size: r * 0.5, size1: r * 2.6, color, tex: tex.glow, alpha: 1 });
    particle({ x, y, life: 0.5, size: r * 0.3, size1: r * 2.3, color: 0xffffff, tex: tex.ring, alpha: 1 });
    particle({ x, y, life: 0.4, size: r * 1.6, size1: r * 0.5, color: 0xffffff, tex: tex.cross, alpha: 1, spin: 3 });
    particle({ x, y: y + 0.8, life: 0.4, size: 0.5, size1: 0.2, color, tex: tex.beam, aspect: 7, alpha: 0.9 });
    sparks(x, y, color, 10, 3.5, 0.14, 0.6);
  }

  function trail(x, y, color, size = 0.2) {
    particle({ x, y, life: 0.22, size, size1: 0, color, tex: tex.dot, alpha: 0.8 });
  }

  function muzzle(x, y, color) {
    particle({ x, y, life: 0.1, size: 0.35, size1: 0.5, color, tex: tex.glow, alpha: 0.8 });
  }

  // gun flash at a muzzle, pointing along the shot: hot core, coloured bloom, a flash streak and a few sparks
  function muzzleFlash(x, y, ang, color = 0xffd27a, k = 1) {
    const cx = Math.cos(ang), cy = Math.sin(ang);
    // a three-pronged cone along the barrel (a long centre tongue, two short side tongues) over a small white-hot core
    particle({ x, y, life: 0.06, size: 0.16 * k, size1: 0.26 * k, color: 0xffffff, tex: tex.glow, alpha: 1 });
    particle({ x: x + cx * 0.06 * k, y: y + cy * 0.06 * k, life: 0.08, size: 0.28 * k, size1: 0.4 * k, color, tex: tex.glow, alpha: 0.45 });
    for (const [da, len, w] of [[0, 0.3, 0.13], [0.6, 0.15, 0.09], [-0.6, 0.15, 0.09]]) {
      const a = ang + da;
      particle({ x: x + Math.cos(a) * len * k, y: y + Math.sin(a) * len * k, life: 0.065, size: w * k, size1: w * 0.6 * k, color: da ? color : 0xfff2c0, tex: tex.beam, aspect: len / w * 2.2, rot: a - Math.PI / 2, alpha: 1 });
    }
    // a wisp of gun smoke drifts off the barrel after the flash
    particle({ x: x + cx * 0.15 * k, y: y + cy * 0.15 * k, vx: cx * 0.5, vy: cy * 0.5 + 0.35, drag: 2, life: 0.45, size: 0.15 * k, size1: 0.5 * k, color: 0x9aa0a6, tex: tex.dot, alpha: 0.35, normal: true, fadeIn: 0.05 });
    for (let i = 0; i < 3; i++) {
      const a = ang + rnd(-0.45, 0.45), v = rnd(2.5, 5);
      particle({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 6, life: rnd(0.08, 0.16), size: 0.07 * k, size1: 0.02, color: 0xffe9a0, tex: tex.dot });
    }
  }

  function summonBurst(x, y, tier, color) {
    const k = [0.6, 0.9, 1.3, 1.9, 2.6][tier];
    ring(x, y, 0.1, 1.0 * k, color, 0.5);
    particle({ x, y, life: 0.6, size: 0.5, size1: 1.6 * k, color, tex: tex.glow, alpha: 0.9 });
    particle({ x, y: y + 2, life: 0.55, size: 0.8 * k, size1: 0.2, color, tex: tex.beam, aspect: 8, alpha: 0.9 });
    sparks(x, y, color, 6 + tier * 8, 2 + tier, 0.14, 0.7);
    if (tier >= 3) {
      for (let i = 0; i < 3; i++) setTimeout0(i * 0.12, () => ring(x, y, 0.2, 2.2 * k, color, 0.6, 0.8));
      particle({ x, y, life: 0.9, size: 1, size1: 4 * k, color: 0xffffff, tex: tex.cross, spin: 2, alpha: 0.9 });
      flash(color, tier >= 4 ? 0.45 : 0.25);
      shake(tier >= 4 ? 0.25 : 0.12);
    }
  }

  function mergeFx(x, y, color) {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      particle({ x: x + Math.cos(a) * 1.4, y: y + Math.sin(a) * 1.4, vx: -Math.cos(a) * 4, vy: -Math.sin(a) * 4, life: 0.35, size: 0.2, size1: 0.05, color, tex: tex.dot });
    }
    setTimeout0(0.3, () => particle({ x, y, life: 0.4, size: 0.3, size1: 2.2, color: 0xffffff, tex: tex.glow, alpha: 0.9 }));
  }

  function deathFx(x, y, boss) {
    particle({ x, y, life: 0.5, size: boss ? 2 : 0.6, size1: boss ? 5 : 1.4, color: 0xff3355, tex: tex.glow, alpha: 0.7 });
    particle({ x, y, life: 0.6, size: boss ? 2.5 : 0.7, size1: boss ? 4 : 1.2, color: 0x444a55, frames: sheets.smoke, alpha: 0.5, normal: true, order: L.FX - 1 });
    sparks(x, y, 0xff5a5a, boss ? 40 : 6, boss ? 7 : 2.5, boss ? 0.25 : 0.12, boss ? 1.2 : 0.4);
    if (boss) {
      for (let i = 0; i < 6; i++) setTimeout0(i * 0.12, () => explosion(x + rnd(-1, 1), y + rnd(-1, 1), 1.2, 0xff7a3a, true));
      flash(0xffffff, 0.5);
    }
  }

  function goldPop(x, y) {
    particle({ x, y, vy: 1.4, life: 0.5, size: 0.22, size1: 0.1, color: 0xffd34d, tex: tex.dot, alpha: 0.9 });
  }

  // ── ultimates ──────────────────────────────────────────
  function meteor(x, y, onImpact, color = 0xff6a2a) {
    const sx = x - 4, sy = y + 7, dur = 0.55;
    let t = 0;
    const head = particle({ x: sx, y: sy, life: dur + 0.05, size: 1.4, size1: 1.0, color, tex: tex.glow });
    tickers.push((dt) => {
      t += dt;
      const f = Math.min(1, t / dur);
      const cx = sx + (x - sx) * f, cy = sy + (y - sy) * f;
      if (head) { head.x = cx; head.y = cy; }
      particle({ x: cx + rnd(-0.15, 0.15), y: cy + rnd(-0.15, 0.15), life: 0.45, size: 0.9, size1: 0.1, color: Math.random() < 0.5 ? color : 0xffd060, frames: sheets.fire, spin: rnd(-3, 3) });
      if (f >= 1) {
        explosion(x, y, 1.6, color, true);
        ring(x, y, 0.3, 4, 0xffb070, 0.6);
        onImpact && onImpact();
        return false;
      }
      return true;
    });
    // target marker
    ring(x, y, 2, 1.2, 0xff4040, dur, 0.7);
  }

  function pillar(x, y, dur, color) {
    const col = particle({ x, y: y + 3, life: dur, size: 1.4, size1: 1.0, color, tex: tex.beam, aspect: 6, alpha: 0.9, fadeIn: 0.15 });
    particle({ x, y, life: dur, size: 2.6, size1: 3.2, color, tex: tex.ring, alpha: 0.8, spin: 1.5 });
    particle({ x, y, life: dur, size: 3, size1: 3, color, tex: tex.glow, alpha: 0.5, fadeIn: 0.1 });
    let t = 0;
    tickers.push((dt) => {
      t += dt;
      if (Math.random() < 0.7) particle({ x: x + rnd(-1, 1), y: y + rnd(-0.6, 0.4), vy: rnd(2, 4), life: 0.6, size: 0.18, size1: 0, color: 0xffffff, tex: tex.dot });
      return t < dur;
    });
    return col;
  }

  function orbital(x0, y0, x1, y1, color, dur = 0.9) {
    const pts = [{ x: x0, y: y0 }, { x: x1, y: y1 }];
    ribbon(pts, 3.2, color, dur, { alpha: 0.6, shrink: true });
    ribbon(pts, 1.4, 0xffffff, dur, { shrink: true });
    const d = Math.hypot(x1 - x0, y1 - y0);
    for (let i = 0; i < 40; i++) {
      const f = Math.random();
      particle({ x: x0 + (x1 - x0) * f, y: y0 + (y1 - y0) * f, vx: rnd(-3, 3), vy: rnd(-3, 3), life: rnd(0.4, 0.9), size: 0.3, size1: 0, color, tex: tex.dot });
    }
    for (let i = 0; i < Math.ceil(d / 2); i++) {
      const f = i / Math.ceil(d / 2);
      setTimeout0(f * 0.25, () => explosion(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, 0.9, color));
    }
    flash(color, 0.35);
    shake(0.3);
  }

  function thunderBolt(x, y, color) {
    const pts = jagged(x + rnd(-1, 1), y + 9, x, y, 0.5, 0.6);
    ribbon(pts, 0.9, color, 0.3, { alpha: 0.8 });
    ribbon(pts, 0.28, 0xffffff, 0.25);
    const f = sheets.bolt;
    particle({ x, y, life: 0.3, size: 1.6, size1: 2.2, color, frames: f, rot: Math.random() * 6 });
    particle({ x, y, life: 0.35, size: 0.5, size1: 2.4, color, tex: tex.ring });
    particle({ x, y, life: 0.25, size: 1.8, size1: 0.4, color: 0xffffff, tex: tex.glow });
    sparks(x, y, color, 10, 4, 0.13, 0.4);
    shake(0.08);
  }

  function freezeAll(cx, cy, color) {
    flash(0x9feaff, 0.5);
    for (let i = 0; i < 3; i++) setTimeout0(i * 0.15, () => ring(cx, cy, 0.5, 16, color, 0.9, 0.9));
    for (let i = 0; i < 90; i++) {
      particle({ x: rnd(-8, 8), y: rnd(-5, 6), vx: rnd(-0.5, 0.5), vy: rnd(-1.5, -0.4), life: rnd(1, 2), size: rnd(0.15, 0.4), size1: 0.05, color: 0xe8fbff, tex: tex.snow, spin: rnd(-2, 2) });
    }
    shake(0.2);
  }

  // ── screen ─────────────────────────────────────────────
  function shake(a) { state.shake = Math.min(0.6, Math.max(state.shake, a)); }
  function flash(color, a) {
    flashMesh.material.color.setHex(color);
    flashMesh.material.opacity = Math.max(flashMesh.material.opacity, a);
    flashMesh.visible = true;
  }

  function setTimeout0(delay, fn) { timers.push({ t: delay, fn }); }

  function update(dt) {
    for (let i = timers.length - 1; i >= 0; i--) {
      timers[i].t -= dt;
      if (timers[i].t <= 0) { const f = timers[i].fn; timers[i] = timers[timers.length - 1]; timers.pop(); try { f(); } catch (e) { console.error(e); } } // swap-remove (bursts queue dozens); one failing callback never stops the others
    }
    for (let i = tickers.length - 1; i >= 0; i--) if (!tickers[i](dt)) tickers.splice(i, 1);

    let w = 0;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p.dead) { if (!p.noPool && freeP.length < 600) freeP.push(p); continue; }
      p.t += dt;
      const f = p.t / p.life;
      if (f >= 1) { p.dead = true; if (freeP.length < 600) freeP.push(p); continue; }
      parts[w++] = p;
      if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; }
      p.vy -= p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.keep) continue;
      p.sz = p.size + (p.size1 - p.size) * f;
      const fin = p.fadeIn ? Math.min(1, p.t / p.fadeIn) : 1;
      p.alpha = p.a0 * fin * (1 - f * f);
      p.rot += p.spin * dt;
      if (p.frames) p.uv = rectOf.get(p.frames[Math.min(p.frames.length - 1, Math.floor(f * p.frames.length))]);
    }
    parts.length = w; deadN = 0; rc = 0;

    for (let i = ribbons.length - 1; i >= 0; i--) {
      const r = ribbons[i];
      r.t += dt;
      const f = r.t / r.life;
      if (f >= 1) {
        freeRibbon(r.mesh);
        ribbons.splice(i, 1); continue;
      }
      r.mesh.material.opacity = r.a0 * (1 - f);
      if (r.shrink) {
        // narrow the beam as it fades
        const at = r.mesh.geometry.attributes.position;
        ribbonPos(at.array, r.pts, r.w * (1 - f * 0.85));
        at.needsUpdate = true;
      }
    }

    if (flashMesh.visible) {
      flashMesh.material.opacity -= dt * 1.6;
      if (flashMesh.material.opacity <= 0) { flashMesh.material.opacity = 0; flashMesh.visible = false; }
    }
    state.shake = Math.max(0, state.shake - dt * 1.2);
  }

  function clear() {
    // effect particles only: persistent quads belong to their owners (who kill them)
    let w = 0;
    for (const p of parts) { if (p.keep && !p.dead) parts[w++] = p; else p.dead = p.noPool = true; }
    parts.length = w; deadN = 0; rc = 0;
    for (const r of ribbons) freeRibbon(r.mesh);
    ribbons.length = 0; timers.length = 0; tickers.length = 0;
    state.shake = 0;
    if (flashMesh) { flashMesh.material.opacity = 0; flashMesh.visible = false; }
  }

  // camera offset for the current shake strength
  function shakeOffset() { const a = state.shake * 0.9; return a > 0.002 ? [rnd(-a, a), rnd(-a, a)] : [0, 0]; }
  function setFlashPos(x, y) { flashMesh.position.set(x, y, 0); }
  function count() { return parts.length; }

  window.FX = {
    L, tex, sheets, init, update, clear, particle, sprite, kill, setTex, setBudget, budget, draw: drawParticles, sparks, hit, explosion, ring, lightning, beam, slash, flame, wave, frost, holy,
    trail, muzzle, muzzleFlash, summonBurst, mergeFx, deathFx, goldPop, meteor, pillar, orbital, thunderBolt, freezeAll,
    shake, flash, later: setTimeout0, state, rnd, groundRing, groundGlow, setGround, shakeOffset, setFlashPos, count, jagged, ribbon,
  };
})();
