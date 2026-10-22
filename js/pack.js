// Deployed build only: tools/build_dist.mjs puts this at the top of the page (window.PACK set). The repository and local
// runs never load it, so every file there stays readable.
// - starts the service worker (sw.js) that unmasks the .pak image files; the very first visit reloads once it controls
//   the page, so every picture goes through it
// - pictures written inside scripts as 'pk:<mime>:<masked base64>' (the inline textures in js/assets.js) turn back into
//   blob: URLs in memory (PACKED.globals, called right after that script)
(function () {
  const K = Array.from('LAO-orca-lastwar', (c) => c.charCodeAt(0));
  function unmask(u8) {
    for (let i = 0; i < u8.length; i++) u8[i] ^= K[i % K.length] ^ ((i * 131 + 7) & 255);
    return u8;
  }
  function fromB64(s) {
    const bin = atob(s), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }
  const PK = /^pk:([\w.+/-]+):([A-Za-z0-9+/=]+)$/;
  const fromPk = (s) => { const m = PK.exec(s); return m ? URL.createObjectURL(new Blob([unmask(fromB64(m[2]))], { type: m[1] })) : s; };
  function globals() {
    const I = window.IMG;
    if (I) for (const k in I) if (typeof I[k] === 'string' && I[k].startsWith('pk:')) I[k] = fromPk(I[k]);
  }
  window.PACKED = { globals };
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  const sw = navigator.serviceWorker;
  sw.register('sw.js').catch(() => {});
  if (!sw.controller) { // (the first visit, or a hard reload that skips the worker): load again once it controls the page
    let n = 0; try { n = +sessionStorage.getItem('lw.swr') || 0; sessionStorage.setItem('lw.swr', n + 1); } catch (e) { /* ignore */ }
    if (n < 3) { document.documentElement.style.visibility = 'hidden'; sw.ready.then(() => location.reload()); }
  } else { try { sessionStorage.removeItem('lw.swr'); } catch (e) { /* ignore */ } }
})();
