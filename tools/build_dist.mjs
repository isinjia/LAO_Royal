// The deployed build in dist/ (the Racket Monster way). Cloudflare runs it on every push (wrangler.jsonc "build").
// - only the game's files (no tools/, docs/, .git)
// - our scripts go through terser: comments dropped, local names shortened (global names and property names kept)
// - every picture (and the fx .bin data) becomes a byte-masked <file>.pak; sw.js unmasks it in the browser.
//   Pictures written inside scripts (js/assets.js) become 'pk:' strings that js/pack.js turns back in memory
// - the file:// copies (base64 atlases in scripts) are left out: the deployed site is always http(s)
// The repository and local runs keep the readable originals.
//   node tools/build_dist.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist');

async function loadTerser() {
  try { return await import('terser'); } catch (e) { /* not installed yet */ }
  execSync('npm install --no-save --no-audit --no-fund terser@5.31.0', { cwd: ROOT, stdio: 'inherit' });
  return import(pathToFileURL(path.join(ROOT, 'node_modules', 'terser', 'main.js')).href);
}

const FILES = ['index.html', 'sw.js'];
const DIRS = ['js', 'css', 'assets'];
// generated data and the vendor libraries stay as they are
const SKIP_MINIFY = /^js\/(assets|ui_assets|anim_events|i18n_data)\.js$|^js\/(sd|fx|vendor)\//;
const OPTS = {
  ecma: 2020,
  compress: { passes: 2, keep_classnames: true, keep_fnames: true },
  mangle: { keep_classnames: true, keep_fnames: true }, // local names only: globals (GAME, UI, DATA ...) and properties stay
  format: { comments: false },
};

function copyTree(rel) {
  const src = path.join(ROOT, rel), dst = path.join(OUT, rel);
  if (fs.statSync(src).isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const f of fs.readdirSync(src)) copyTree(path.posix.join(rel, f));
  } else fs.copyFileSync(src, dst);
}
function walk(dir, fn) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p, fn); else fn(p, f);
  }
}

// ── the mask (the same as sw.js and js/pack.js; its own inverse) ──
const K = Array.from('LAO-orca-lastwar', (c) => c.charCodeAt(0));
function mask(buf) {
  const u8 = new Uint8Array(buf);
  for (let i = 0; i < u8.length; i++) u8[i] ^= K[i % K.length] ^ ((i * 131 + 7) & 255);
  return u8;
}
const DATA_URI = /data:(image\/[\w.+-]+);base64,([A-Za-z0-9+/=]+)/g;
const pk = (text) => text.replace(DATA_URI, (m, mime, b64) => 'pk:' + mime + ':' + Buffer.from(mask(Buffer.from(b64, 'base64'))).toString('base64'));
const PACK_EXT = /\.(webp|jpe?g|png|bin)$/i;

function packAssets() {
  const sd = path.join(OUT, 'js/sd'), fx = path.join(OUT, 'js/fx');
  let files = 0, dropped = 0;
  // file:// copies: the sd atlases as scripts (<id>.a35.js ...) and the self-contained fx scripts beside their .m.js
  for (const f of fs.readdirSync(sd)) if (/\.a\d+\.js$/.test(f)) { fs.rmSync(path.join(sd, f)); dropped++; }
  for (const f of fs.readdirSync(fx)) {
    const m = /^(.+)\.js$/.exec(f);
    if (m && !f.endsWith('.m.js') && fs.existsSync(path.join(fx, m[1] + '.m.js'))) { fs.rmSync(path.join(fx, f)); dropped++; }
  }
  for (const dir of [path.join(OUT, 'assets'), sd, fx]) walk(dir, (p, f) => {
    if (!PACK_EXT.test(f)) return;
    fs.writeFileSync(p + '.pak', mask(fs.readFileSync(p)));
    fs.rmSync(p);
    files++;
  });
  // the pictures inside js/assets.js (fx textures, banners)
  const a = path.join(OUT, 'js/assets.js');
  fs.writeFileSync(a, pk(fs.readFileSync(a, 'utf8')) + '\n;window.PACKED&&PACKED.globals();\n');
  console.log(`packed: ${files} files masked, ${dropped} file:// copies dropped, inline pictures masked`);
}

async function main() {
  const { minify } = await loadTerser();
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of FILES) copyTree(f);
  for (const d of DIRS) copyTree(d);
  for (const f of ['js/smoke.js', 'js/duel.js', 'js/mptest.js']) fs.rmSync(path.join(OUT, f), { force: true }); // (development checks)
  packAssets();

  let before = 0, after = 0, n = 0;
  const all = [];
  walk(path.join(OUT, 'js'), (p) => { if (p.endsWith('.js')) all.push(path.relative(OUT, p).split(path.sep).join('/')); });
  for (const rel of all.filter((f) => !SKIP_MINIFY.test(f))) {
    const file = path.join(OUT, rel), code = fs.readFileSync(file, 'utf8');
    const out = await minify(code, OPTS);
    if (out.code == null) throw new Error('terser failed on ' + rel);
    fs.writeFileSync(file, out.code);
    before += code.length; after += out.code.length; n++;
  }
  { const sw = path.join(OUT, 'sw.js'), out = await minify(fs.readFileSync(sw, 'utf8'), OPTS); fs.writeFileSync(sw, out.code); }
  // the page: comments out, the development scripts out, the unpacker first in <head>
  const htmlFile = path.join(OUT, 'index.html');
  let html = fs.readFileSync(htmlFile, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  html = html.replace(/\s*<script[^>]*src="js\/(smoke|duel|mptest)\.js[^"]*"><\/script>/g, '');
  const packer = await minify(fs.readFileSync(path.join(ROOT, 'js/pack.js'), 'utf8'), OPTS);
  html = html.replace('<head>', () => '<head>\n<script>window.PACK=1;' + packer.code + '</script>');
  fs.writeFileSync(htmlFile, html);
  fs.rmSync(path.join(OUT, 'js/pack.js'), { force: true }); // (inlined above)
  fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
  console.log(`dist: ${n} scripts minified (${Math.round(before / 1024)} KB -> ${Math.round(after / 1024)} KB)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
