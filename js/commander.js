// The commander (사령관), drawn in code as in 6_LAO_Laket_Monster/js/commander.js (the original meme look: a white body,
// a round head with "사" on the face). It stands on the commander faction's king tower and is its portrait.
// CMD.sprite(): a front-view canvas for a three.js sprite; IMG.cmd_face: the portrait (a data URL), made at load.
(function () {
  const COL = { body: '#f8f4f7', shade: '#ddd2e2', line: '#4a2a38', ink: '#3a1626' };
  function shape(g, fn, lw) {
    g.beginPath(); fn(g);
    g.fillStyle = COL.body; g.fill();
    g.lineWidth = lw; g.strokeStyle = COL.line; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke();
  }
  function head(g, cx, cy, r, lw, sweat) {
    shape(g, (c) => c.arc(cx, cy, r, 0, Math.PI * 2), lw);
    g.save(); g.beginPath(); g.arc(cx, cy, r - lw / 2, 0, Math.PI * 2); g.clip();
    g.fillStyle = COL.shade; g.beginPath(); g.arc(cx + r * 0.35, cy + r * 0.35, r, 0, Math.PI * 2); g.globalAlpha = 0.45; g.fill(); g.globalAlpha = 1;
    g.restore();
    // eyebrows in a frown, then "사"
    g.strokeStyle = COL.ink; g.lineWidth = Math.max(1.2, r * 0.12); g.lineCap = 'round';
    const ey = cy - r * 0.6, ew = r * 0.22;
    g.beginPath();
    g.moveTo(cx - ew * 1.6, ey - r * 0.08); g.lineTo(cx - ew * 0.45, ey + r * 0.06);
    g.moveTo(cx + ew * 1.6, ey - r * 0.08); g.lineTo(cx + ew * 0.45, ey + r * 0.06);
    g.stroke();
    g.fillStyle = COL.ink;
    g.font = `900 ${Math.round(r * 0.95)}px 'Black Han Sans','Noto Sans KR','Malgun Gothic',sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('사', cx, cy + r * 0.28);
    if (sweat) {
      g.fillStyle = '#9fd6ff'; g.strokeStyle = COL.line; g.lineWidth = 1;
      const sx = cx + r * 0.55, sy = cy + r * 0.45;
      g.beginPath(); g.moveTo(sx, sy - r * 0.2); g.quadraticCurveTo(sx + r * 0.12, sy, sx, sy + r * 0.08); g.quadraticCurveTo(sx - r * 0.12, sy, sx, sy - r * 0.2); g.fill(); g.stroke();
    }
  }
  // the whole figure, foot at (cx, foot), about 120 x 245 at s = 1
  function big(g, cx, foot, s, sweat) {
    g.save(); g.translate(cx, foot); g.scale(s, s);
    shape(g, (c) => { c.moveTo(-26, -70); c.quadraticCurveTo(-30, -30, -24, -4); c.lineTo(-6, -4); c.quadraticCurveTo(-4, -40, -2, -70); c.closePath(); }, 3);
    shape(g, (c) => { c.moveTo(26, -70); c.quadraticCurveTo(30, -30, 24, -4); c.lineTo(6, -4); c.quadraticCurveTo(4, -40, 2, -70); c.closePath(); }, 3);
    shape(g, (c) => { c.moveTo(-40, -150); c.quadraticCurveTo(-62, -110, -58, -70); c.quadraticCurveTo(-50, -64, -44, -72); c.quadraticCurveTo(-46, -110, -30, -140); c.closePath(); }, 3);
    shape(g, (c) => { c.moveTo(40, -150); c.quadraticCurveTo(62, -110, 58, -70); c.quadraticCurveTo(50, -64, 44, -72); c.quadraticCurveTo(46, -110, 30, -140); c.closePath(); }, 3);
    shape(g, (c) => { c.moveTo(-34, -160); c.quadraticCurveTo(0, -172, 34, -160); c.quadraticCurveTo(46, -110, 36, -64); c.quadraticCurveTo(0, -54, -36, -64); c.quadraticCurveTo(-46, -110, -34, -160); c.closePath(); }, 3.2);
    g.save(); g.globalAlpha = 0.45; g.fillStyle = COL.shade; g.beginPath(); g.moveTo(10, -165); g.quadraticCurveTo(44, -112, 34, -66); g.quadraticCurveTo(20, -60, 12, -62); g.quadraticCurveTo(22, -110, 10, -165); g.fill(); g.restore();
    head(g, 0, -204, 40, 3.2, sweat);
    g.restore();
  }
  function sprite() { // 160 x 280: the figure stands on the bottom edge
    const cv = document.createElement('canvas'); cv.width = 160; cv.height = 280;
    big(cv.getContext('2d'), 80, 276, 1.06, false);
    return cv;
  }
  function face() { // a square portrait (bust)
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
    const g = cv.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 0, 128); bg.addColorStop(0, '#ffb35a'); bg.addColorStop(1, '#c4561e');
    g.fillStyle = bg; g.fillRect(0, 0, 128, 128);
    big(g, 64, 250, 0.95, true);
    return cv.toDataURL('image/png');
  }
  window.CMD = { sprite, face };
  if (window.IMG) IMG.cmd_face = face();
})();
