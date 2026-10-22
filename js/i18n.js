// Languages. Korean is the source: every player-facing string is written in Korean and doubles as the key into
// js/i18n_data.js (built by tools/build_i18n.py from tools/i18n/<lang>.json). Nothing in the game code calls this:
// the page's text is translated as it appears (a MutationObserver), so a Korean string set anywhere shows translated.
// A key with {0} {1} matches text built from a template (the filled-in parts are translated too when they are Korean);
// text no key matches has its known Korean pieces swapped one by one. Changing the language reloads the page.
(function () {
  const D = window.I18N_DATA || { langs: ['ko'], labels: ['한국어'], t: {} };
  const LANGS = D.langs, HANGUL = /[가-힣]/, KEY = 'lastroyal.lang';

  function detect() {
    if (/[?&](smoke|duel)=1/.test(location.search)) return 'ko'; // (the checks read the Korean text)
    try { const s = localStorage.getItem(KEY); if (s && LANGS.includes(s)) return s; } catch (e) { /* ignore */ }
    const n = (navigator.language || 'ko').toLowerCase();
    if (n.startsWith('ko')) return 'ko';
    if (n.startsWith('ja')) return 'ja';
    if (n.startsWith('zh')) return /tw|hk|mo|hant/.test(n) ? 'zh-Hant' : 'zh-Hans';
    if (n.startsWith('es')) return 'es';
    if (n.startsWith('pt')) return 'pt';
    if (n.startsWith('ru')) return 'ru';
    return 'en';
  }
  let lang = detect();
  if (!LANGS.includes(lang)) lang = 'ko';
  const col = LANGS.indexOf(lang) - 1;

  // exact keys, template keys (as patterns) and plain pieces (for the fallback), longest first
  const exact = new Map(), pats = [], pieces = [];
  if (col >= 0) {
    for (const [ko, row] of Object.entries(D.t)) {
      const v = row[col]; if (!v) continue;
      if (/\{\d\}/.test(ko)) {
        const names = [];
        const re = new RegExp('^' + ko.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\\?\{(\d)\\?\}/g, (m, i) => { names.push(+i); return '([\\s\\S]*?)'; }).replace(/[{}]/g, '\\$&') + '$');
        pats.push({ re, names, v, len: ko.replace(/\{\d\}/g, '').length });
      } else { exact.set(ko, v); if (ko.length >= 2) pieces.push([ko, v]); }
    }
    pats.sort((a, b) => b.len - a.len);
    pieces.sort((a, b) => b[0].length - a[0].length);
  }

  const memo = new Map();
  function tr(s, depth) {
    if (col < 0 || !s || !HANGUL.test(s)) return s;
    if (exact.has(s)) return exact.get(s);
    if (!depth && memo.has(s)) return memo.get(s);
    let out = null;
    for (const p of pats) {
      const m = p.re.exec(s); if (!m) continue;
      const vals = []; p.names.forEach((n, i) => { vals[n] = m[i + 1]; });
      out = p.v.replace(/\{(\d)\}/g, (x, i) => (vals[i] != null ? ((depth || 0) < 3 ? tr(vals[i], (depth || 0) + 1) : vals[i]) : ''));
      break;
    }
    if (out == null) { // pieces: the longest known Korean phrases inside the text
      out = s;
      for (const [k, v] of pieces) { if (!HANGUL.test(out)) break; if (out.includes(k)) out = out.split(k).join(v); }
    }
    if (!depth) { if (memo.size > 4000) memo.clear(); memo.set(s, out); }
    return out;
  }
  function t(ko) { const s = String(ko); const lead = s.match(/^\s*/)[0], tail = s.match(/\s*$/)[0], core = s.trim(); return core ? lead + tr(core) + tail : s; }

  // ── the page ──
  const done = new WeakMap(); // text node -> the translation last written into it
  const ATTRS = ['title', 'aria-label', 'placeholder'];
  function node(n) {
    const v = n.nodeValue;
    if (!v || done.get(n) === v || !HANGUL.test(v)) return;
    if (n.parentElement && n.parentElement.closest('[translate="no"]')) return; // (nicknames stay as written)
    const o = t(v); done.set(n, o); if (o !== v) n.nodeValue = o;
  }
  function attrs(el) {
    for (const a of ATTRS) { const v = el.getAttribute && el.getAttribute(a); if (v && HANGUL.test(v)) el.setAttribute(a, t(v)); }
  }
  function walk(root) {
    if (root.nodeType === 3) { node(root); return; }
    if (root.nodeType !== 1) return;
    if (root.tagName === 'SCRIPT' || root.tagName === 'STYLE') return;
    attrs(root);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = w.nextNode(); n; n = w.nextNode()) { if (n.nodeType === 3) node(n); else attrs(n); }
  }
  function start() {
    document.documentElement.lang = lang;
    if (col < 0) return;
    document.documentElement.classList.add('lang-' + lang);
    document.title = t(document.title);
    walk(document.body);
    new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === 'characterData') node(m.target);
        else if (m.type === 'attributes') attrs(m.target);
        else m.addedNodes.forEach(walk);
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);

  window.I18N = {
    get lang() { return lang; },
    langs: LANGS, labels: D.labels, t,
    set(code) { if (!LANGS.includes(code) || code === lang) return; try { localStorage.setItem(KEY, code); } catch (e) { /* ignore */ } location.reload(); },
  };
})();
