// Card balance audit against Clash Royale (same level for cards and towers).
// node tools/balance_audit.js  — prints the per-card comparison, the role overlap check and two scores out of 100.
//
// The reference is tools/cr_reference.json, made by tools/cr_reference.py from Clash Royale's own data tables
// (RoyaleAPI cr-api-data, the live client's stats, 2023-10-18), every card at level 10 like the cards here.
// DEPART lists the deliberate departures from the reference and why (a mechanic the game lacks, or adds); a departure
// costs points like any other difference unless it is listed here with its reason, and even then it costs half.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { window: {}, Math, Object, Date };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'data.js'), 'utf8'), ctx);
const D = ctx.window.DATA, CARD = D.card;
const REF = JSON.parse(fs.readFileSync(path.join(__dirname, 'cr_reference.json'), 'utf8'));

// [fields the departure covers, why]
const DEPART = {
  phoenix: ['cost hp air type', '박격포를 움직이는 비행 포병으로: 사라지지 않는 대신 체력을 낮추고 비용 +1'],
  titania: ['cost hp splash slow', '되살아나는 알 대신 체력 +30%와 얼음 범위 둔화, 챔피언 스킬로 비용 +1'],
  leona: ['spawn', '해골 4기 대신 브라우니 2기 소환(유닛이 더 튼튼해 수를 줄임)'],
  azazel: ['air targets', '날개 달린 천사: 공중 유닛이라 공중의 적도 때림'],
  sleipnir: ['air targets', '쿼드라 브레스 엔진의 비행 수비기: 공중 유닛이라 공중의 적도 때림'],
  ramiel: ['air', '업화를 뿜는 지상 사수'],
  drone: ['air', '정찰 드론: 공중 유닛'],
  nidhogg: ['dps splash slow', '죽을 때 골렘 조각 대신 독 범위 둔화, 그만큼 피해 낮춤'],
  constantia: ['slow', '관통 화살 대신 맞힌 적 둔화(발목 잡기)'],
  fafnir: ['chain reflect', '자신을 때린 적에게 튀는 반사 전격 대신, 때릴 때마다 연쇄 번개'],
  empress: ['slow', '은신 대신 맞힌 적 얼음 둔화'],
  blackknight: ['ramp', '세 번째 일격이 강해지는 연타 대신 고른 연타'],
  harvester: ['stun', '죽을 때 분노 대신 일격 기절 0.3초'],
  hatchery: ['spawn', '해골 2기씩 3.5초 대신 나이트 칙 1기씩 6초(같은 30초 동안 비슷한 총 체력)'],
  tiamat: ['range', '건물에 붙어 때리는 거리(엔진의 근접 최소 거리)'],
  pupphead: ['rate', '한 번 방전하고 사라지므로 공격 주기는 의미 없음'],
  napalm: ['dps', ''],
};
const lnAbs = (r) => Math.abs(Math.log(r));
const targetsOf = (c) => (c.aim === 'buildings' ? 'buildings' : c.hits === 'ground' ? 'ground' : 'all');
const flagsOf = (c) => ['splash', 'stun', 'slow', 'chain', 'pierce', 'ramp', 'healHit', 'spawn', 'charge', 'kamikaze', 'jump']
  .filter((k) => c[k]).map((k) => (k === 'healHit' ? 'heal' : k));
const PACE = (c) => (c.faction === 'iron' && !c.ramp ? 1.4 : 1); // the iron cards swing slower and harder (data.js PACE)

// ── 1. balance against the reference ──
const rows = [];
let sum = 0, n = 0;
for (const c of D.CARDS) {
  const r = REF.cards[c.id];
  if (!r) { rows.push([c.name, '(클래시 로얄에 없음)', null, c.wall ? '유인·길막기용 벽: 비교 대상 없음' : '기준 없음']); continue; }
  const dep = DEPART[c.id] || [''], cover = new Set(dep[0].split(' ').filter(Boolean));
  let pen = 0; const notes = [];
  const cost = (k, p, msg) => { const w = cover.has(k) ? 0.5 : 1; pen += p * w; notes.push(msg + (cover.has(k) ? '*' : '')); };
  if (c.cost !== r.cost) cost('cost', 15 * Math.abs(c.cost - r.cost), `비용 ${c.cost}/${r.cost}`);
  if (c.type !== 'spell' && r.hp) { const k = c.hp / r.hp; if (lnAbs(k) > 0.03) cost('hp', 60 * lnAbs(k), `체력 ${c.hp}/${r.hp}`); }
  if (c.type !== 'spell' && r.dmg && c.dmg && !cover.has('rate')) {
    const dps = c.dmg / c.rate, rd = r.dmg / r.rate, k = dps / rd;
    if (lnAbs(k) > 0.03) cost('dps', 60 * lnAbs(k), `초당 피해 ${dps.toFixed(0)}/${rd.toFixed(0)}`);
    if (lnAbs(c.dmg / PACE(c) / r.dmg) > 0.05 && !cover.has('dps')) cost('hit', 10, `한 방 ${Math.round(c.dmg / PACE(c))}/${r.dmg}`);
  }
  if (c.type === 'troop' && r.type === 'building') { // a building brought to the field as a troop
    if (Math.abs(c.range - r.range) > 0.3) cost('range', 4, `사거리 ${c.range}/${r.range}`);
    if (c.hits !== r.targets && targetsOf(c) !== r.targets) cost('targets', 20, `대상 ${targetsOf(c)}/${r.targets}`);
    if (c.air) cost('air', 10, '공중');
  } else if (c.type === 'troop') {
    if (r.range >= 1.5 && Math.abs(c.range - r.range) > 0.3) cost('range', 4 * Math.min(3, Math.abs(c.range - r.range)), `사거리 ${c.range}/${r.range}`);
    if ((c.count || 1) !== r.count) cost('count', 10, `수 ${c.count || 1}/${r.count}`);
    if (targetsOf(c) !== r.targets) cost('targets', 20, `대상 ${targetsOf(c)}/${r.targets}`);
    if (!!c.air !== r.air) cost('air', 10, c.air ? '공중' : '지상');
    if (!!c.splash !== r.splash >= 0.5) cost('splash', 8, c.splash ? '범위 공격 추가' : '범위 공격 없음');
    if (!!c.spawn !== r.spawn) cost('spawn', 8, '소환');
    const have = flagsOf(c).filter((f) => !['splash', 'spawn'].includes(f)), want = r.flags || [];
    have.filter((f) => !want.includes(f)).forEach((f) => cost(f, 6, '+' + f));
    want.filter((f) => !have.includes(f)).forEach((f) => cost(f, 6, '-' + f));
  } else if (c.type === 'building') {
    if (r.life && Math.abs(c.life - r.life) > 1) cost('life', 3, `지속 ${c.life}/${r.life}`);
    if (r.targets !== 'none' && c.hits !== r.targets) cost('targets', 20, `대상 ${c.hits}/${r.targets}`);
    if (r.spawn && c.spawn && ((c.spawn.n || 1) !== r.spawn || c.spawn.every !== r.every)) cost('spawn', 8, `소환 ${c.spawn.n || 1}기/${c.spawn.every}초 대 ${r.spawn}기/${r.every}초`);
  } else if (c.type === 'spell') {
    if (r.dmg && c.dmg) { const k = c.dmg / r.dmg; if (lnAbs(k) > 0.03) cost('dmg', 60 * lnAbs(k), `피해 ${c.dmg}/${r.dmg}`); }
    if (r.towerPct && c.towerK) { const want = 1 + r.towerPct / 100; if (Math.abs(c.towerK - want) > 0.03) cost('tower', 5, `탑 피해 ${c.towerK}/${want.toFixed(2)}`); }
    if (r.buildingPct && Math.abs((c.bldK || 1) - (1 + r.buildingPct / 100)) > 0.05) cost('bld', 8, `건물 피해 ${c.bldK || 1}/${1 + r.buildingPct / 100}`);
    if (r.dur > 0.5 && c.dur && Math.abs(c.dur - r.dur) > 0.2) cost('dur', 5, `지속 ${c.dur}/${r.dur}`);
  }
  if (dep[1]) notes.push('의도: ' + dep[1]);
  const sc = Math.max(0, 100 - pen);
  sum += sc; n++;
  rows.push([c.name, r.cr, Math.round(sc), notes.join(', ')]);
}
// same level: towers against the cards, and the factions' pace
const knight = CARD.phalangites, T = D.BAL.tower, RT = REF.towers, RK = REF.cards.phalangites;
const tP = (T.princess.hp / knight.hp) / (RT.princess.hp / RK.hp), tK = (T.king.hp / knight.hp) / (RT.king.hp / RK.hp);
const tD = (T.princess.dmg / T.princess.rate) / (RT.princess.dmg / RT.princess.rate);
const ironK = (knight.dmg / knight.rate) / (RK.dmg / RK.rate);
const globalPen = 60 * (lnAbs(tP) + lnAbs(tK) + lnAbs(tD) + lnAbs(ironK));
// dominance: a troop no worse than another of the same cost and targets on every count, and clearly better on one
const troops = D.CARDS.filter((c) => c.type === 'troop');
const dom = [];
for (const a of troops) for (const b of troops) {
  if (a === b || a.cost !== b.cost || targetsOf(a) !== targetsOf(b) || !!a.air !== !!b.air || (a.count || 1) !== (b.count || 1)) continue;
  const fa = flagsOf(a), fb = flagsOf(b);
  if (fb.some((f) => !fa.includes(f)) || !!b.skill !== !!a.skill && b.skill) continue;
  const ah = a.hp, bh = b.hp, ad = a.dmg / a.rate, bd = b.dmg / b.rate;
  if (ah >= bh && ad >= bd && a.range >= b.range - 0.01 && (a.speed || 0) >= (b.speed || 0) && (ah > bh * 1.1 || ad > bd * 1.1)) dom.push(`${a.name} > ${b.name}`);
}
const balance = Math.max(0, sum / n - globalPen - 5 * dom.length);

// ── 2. role overlap ──
const refUse = {};
for (const c of D.CARDS) { const r = REF.cards[c.id]; if (r) (refUse[r.key] = refUse[r.key] || []).push(c.name); }
const dupRef = Object.entries(refUse).filter(([, v]) => v.length > 1);
const rangeClass = (r) => (r < 2 ? 0 : r < 4.6 ? 1 : r < 6.6 ? 2 : 3);
const sig = (c) => {
  if (c.type === 'spell') return `주문|${c.spell}|${c.cost}`;
  if (c.type === 'building') return `건물|${c.dmg ? c.hits : 'none'}|${c.spawn ? 'spawn' : ''}${c.wall ? 'wall' : ''}`;
  return [targetsOf(c), c.air ? '공중' : '지상', (c.count || 1) > 1 ? 'swarm' : 'single', rangeClass(c.range), flagsOf(c).sort().join('+'), c.skill ? 'skill' : ''].join('|');
};
const pairs = [];
for (let i = 0; i < D.CARDS.length; i++) for (let j = i + 1; j < D.CARDS.length; j++) {
  const a = D.CARDS[i], b = D.CARDS[j];
  if (sig(a) !== sig(b)) continue;
  if (a.type === 'spell') { if (a.radius === b.radius && a.dur === b.dur) pairs.push(`${a.name} = ${b.name}`); continue; }
  const near = (x, y) => Math.abs(Math.log((x || 1) / (y || 1))) < 0.25, costNear = Math.abs(a.cost - b.cost) <= 1;
  if (a.type === 'building') { if (costNear && near(a.hp, b.hp)) pairs.push(`${a.name} = ${b.name}`); continue; }
  if (costNear && near(a.hp * (a.count || 1), b.hp * (b.count || 1)) && near(a.dmg / a.rate, b.dmg / b.rate)) pairs.push(`${a.name} ≈ ${b.name}`);
}
const role = Math.max(0, 100 - 10 * dupRef.length - 8 * pairs.length);

// ── report ──
const pad = (s, w0) => { s = String(s); let w = 0; for (const ch of s) w += ch.charCodeAt(0) > 0x2e80 ? 2 : 1; return s + ' '.repeat(Math.max(1, w0 - w)); };
console.log(`기준: 클래시 로얄 게임 데이터(${REF.source}), 레벨 ${REF.level}`);
console.log('카드별 비교 (점수 / 기준 카드 / 게임값/기준값, *는 의도한 차이)');
rows.forEach((r) => console.log('  ' + pad(r[0], 16) + pad(r[2] == null ? '-' : r[2], 5) + pad(r[1], 20) + (r[3] || '')));
console.log(`\n같은 레벨 점검(1이면 같음): 공주 탑 체력 ${tP.toFixed(3)}, 킹 탑 체력 ${tK.toFixed(3)}, 탑 초당 피해 ${tD.toFixed(3)}, 철충 초당 피해 ${ironK.toFixed(3)}`);
console.log(`같은 비용에서 모든 면이 앞서는 카드: ${dom.length ? dom.join(', ') : '없음'}`);
console.log(`기준 카드가 겹치는 카드: ${dupRef.length ? dupRef.map(([k, v]) => k + ' ← ' + v.join('·')).join(' / ') : '없음'}`);
console.log(`역할이 겹치는 카드 쌍: ${pairs.length ? pairs.join(', ') : '없음'}`);
console.log(`\n밸런스 점수 ${balance.toFixed(1)} / 100`);
console.log(`역할 구분 점수 ${role.toFixed(1)} / 100`);
