// Deployed build only (tools/build_dist.mjs, registered by js/pack.js): the image files are uploaded as byte-masked
// <file>.pak, never as pictures. This worker answers the page's own image requests (an <img>, a CSS background, a
// three.js texture, an fx atlas or .bin) by fetching the .pak and unmasking it in memory. Opening an image address
// directly (a page navigation) is not answered, so it finds nothing. A deterrent against lifting the art, not a lock.
const K = Array.from('LAO-orca-lastwar', (c) => c.charCodeAt(0));
const PACKED = /\/(assets|js)\/.+\.(webp|png|jpe?g|bin)$/i;
const MIME = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', bin: 'application/octet-stream' };

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET' || r.mode === 'navigate') return;
  const u = new URL(r.url);
  if (u.origin !== self.location.origin || !PACKED.test(u.pathname)) return;
  e.respondWith((async () => {
    const p = await fetch(u.pathname + '.pak' + u.search);
    if (!p.ok) return new Response('', { status: p.status });
    const b = new Uint8Array(await p.arrayBuffer());
    for (let i = 0; i < b.length; i++) b[i] ^= K[i % K.length] ^ ((i * 131 + 7) & 255); // (the same mask as the build: its own inverse)
    const ext = u.pathname.slice(u.pathname.lastIndexOf('.') + 1).toLowerCase();
    return new Response(b, { headers: { 'Content-Type': MIME[ext] || 'application/octet-stream' } });
  })());
});
