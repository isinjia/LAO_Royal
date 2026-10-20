"""Sharper character atlases: js/sd/<rig>.a100.webp (desktop) and .a75.webp (phones).

The shipped atlases (.a50 / .a35) were built by E:/LAO_MINI_GAME/5_LAO_Defence/tools/build_sd.py at 50% / 35% of
its packed layout (whose textures were already halved), which reads blurry on phone screens. This script re-runs that
build's packing for each rig (nothing is written in 5_LAO_Defence) and saves the same layout at 100% and 75%: the
rects are normalised, so the rig data (js/sd/<rig>.js) stays as it is and only the image file changes.

    python tools/build_hires.py            # every rig in js/sd
    python tools/build_hires.py labiata    # some rigs
"""
import importlib.util, io, json, os, re, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SD = os.path.join(HERE, '..', 'js', 'sd')
SRC = r'E:\LAO_MINI_GAME\5_LAO_Defence\tools'
sys.path.insert(0, SRC)
spec = importlib.util.spec_from_file_location('build_sd', os.path.join(SRC, 'build_sd.py'))
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)
from PIL import Image

b.LAB = tempfile.mkdtemp()  # (its FBX manifest bookkeeping goes to a scratch folder)
SCALES = (('a100', 1.0, 88), ('a75', 0.75, 88))


class Packed(Exception):
    pass


def layout(paths, hires):
    """The packing of build_sd.packed_atlas, at its full layout scale (1.0)."""
    imgs = [b.tex_image(p, hires) for p in paths] + [Image.new('RGBA', (8, 8), (255, 255, 255, 255))]
    gap = 6
    order = sorted(range(len(imgs)), key=lambda i: -imgs[i].height)
    def shelf(W):
        pos, x, y, row = {}, 0, 0, 0
        for i in order:
            im = imgs[i]
            if x + im.width > W:
                x, y, row = 0, y + row + gap, 0
            pos[i] = (x, y)
            x += im.width + gap
            row = max(row, im.height)
        return pos, y + row
    W = max([im.width for im in imgs] + ([2048] if len(imgs) > 1 else [0]))
    pos, H = shelf(W)
    while H * b.ATLAS_SCALE > 4096 and W * 2 * b.ATLAS_SCALE <= 4096:
        W *= 2
        pos, H = shelf(W)
    atlas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    rects = []
    for i, im in enumerate(imgs):
        atlas.paste(im, pos[i])
        rects.append([round(pos[i][0] / W, 6), round((H - pos[i][1] - im.height) / H, 6), round(im.width / W, 6), round(im.height / H, 6)])
    return atlas, rects


def capture(paths, hires=False):
    raise Packed((paths, hires))


b.packed_atlas = capture


def rig_rects(uid):
    src = open(os.path.join(SD, uid + '.js'), encoding='utf-8').read()
    m = re.search(r'"atlas":(\{"rects":.*?\]\]),', src)
    return json.loads(m.group(1) + '}')['rects']


def main(ids):
    for uid in ids:
        try:
            b.build(uid)
            print(uid, 'no atlas?'); continue
        except Packed as p:
            paths, hires = p.args[0]
        atlas, rects = layout(paths, hires)
        old = rig_rects(uid)
        if len(old) != len(rects) or any(abs(a - c) > 1e-5 for r, s in zip(old, rects) for a, c in zip(r, s)):
            print('%-18s layout differs from the shipped rig: skipped' % uid); continue
        for tag, sc, q in SCALES:
            im = atlas if sc == 1 else atlas.resize((max(4, round(atlas.width * sc)), max(4, round(atlas.height * sc))), Image.LANCZOS)
            if max(im.size) > 4096: # (one GPU texture)
                k = 4096 / max(im.size); im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
            im.save(os.path.join(SD, '%s.%s.webp' % (uid, tag)), 'WEBP', quality=q, method=6)
        print('%-18s %dx%d  a100 %dKB' % (uid, atlas.width, atlas.height, os.path.getsize(os.path.join(SD, uid + '.a100.webp')) // 1024))


if __name__ == '__main__':
    ids = sys.argv[1:] or sorted(f[:-9] for f in os.listdir(SD) if f.endswith('.a50.webp'))
    main(ids)
