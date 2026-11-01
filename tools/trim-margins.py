#!/usr/bin/env python3
"""Trim the white / transparent border off sticker images in a meme library.

The community packs were exported on a padded canvas (typically 512x512 with 10-60 px of white on
each side). Left alone, the padding shows up as a fat margin around every sticker in the picker and in
chat. This trims the border only: pure white (>= 247 on all channels) or fully transparent pixels are
treated as margin, and a few pixels are kept as breathing room.

    python tools/trim-margins.py --root ~/.dsh/meme-packs            # report only
    python tools/trim-margins.py --root ~/.dsh/meme-packs --apply    # rewrite in place

Always back the library up first; `--apply` prints every file it rewrites.
"""
import argparse
import os
import sys

from PIL import Image

EXTS = (".png", ".jpg", ".jpeg", ".webp")
WHITE = 247          # channel value above which a pixel counts as paper
KEEP = 2             # pixels of margin kept so the art does not touch the edge


def is_margin_pixel(px):
    # PIL pixel: (r,g,b) or (r,g,b,a)
    if len(px) == 4 and px[3] == 0:
        return True
    return px[0] >= WHITE and px[1] >= WHITE and px[2] >= WHITE


def content_box(im):
    """Return (left, top, right, bottom) of the non-margin area, or None if the image is all margin."""
    w, h = im.size
    px = im.load()
    step_x = max(1, w // 200)
    step_y = max(1, h // 200)

    def row_margin(y):
        return all(is_margin_pixel(px[x, y]) for x in range(0, w, step_x))

    def col_margin(x):
        return all(is_margin_pixel(px[x, y]) for y in range(0, h, step_y))

    top = 0
    while top < h and row_margin(top):
        top += 1
    if top >= h:
        return None
    bottom = h - 1
    while bottom > top and row_margin(bottom):
        bottom -= 1
    left = 0
    while left < w and col_margin(left):
        left += 1
    right = w - 1
    while right > left and col_margin(right):
        right -= 1
    return left, top, right, bottom


def trim(path, args):
    im = Image.open(path)
    if getattr(im, "is_animated", False):
        return None
    box = content_box(im)
    if box is None:
        return None
    w, h = im.size
    left, top, right, bottom = box
    # already trimmed (only the breathing room is left) → nothing to do
    if left <= KEEP + 1 and top <= KEEP + 1 and (w - 1 - right) <= KEEP + 1 and (h - 1 - bottom) <= KEEP + 1:
        return None
    left = max(0, left - KEEP)
    top = max(0, top - KEEP)
    right = min(w - 1, right + KEEP)
    bottom = min(h - 1, bottom + KEEP)
    if (left, top, right, bottom) == (0, 0, w - 1, h - 1):
        return None
    if right - left < 16 or bottom - top < 16:
        return None
    fmt = im.format
    if args.apply:
        cropped = im.crop((left, top, right + 1, bottom + 1))
        if fmt == "JPEG":
            cropped.save(path, fmt, quality=95, subsampling=0, optimize=True)
        elif fmt == "PNG":
            cropped.save(path, fmt, optimize=True)
        elif fmt == "WEBP":
            cropped.save(path, fmt, quality=92, method=4)
        else:
            cropped.save(path, fmt)
    return (w, h, right - left + 1, bottom - top + 1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=os.path.expanduser("~/.dsh/meme-packs"))
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    if not os.path.isdir(args.root):
        sys.exit("no such library: " + args.root)
    files = []
    for base, _dirs, names in os.walk(args.root):
        for n in names:
            if n.lower().endswith(EXTS):
                files.append(os.path.join(base, n))
    files.sort()

    trimmed = 0
    saved = 0
    for path in files:
        try:
            out = trim(path, args)
        except Exception as e:  # a broken file must not stop the run
            print("skip", os.path.relpath(path, args.root), type(e).__name__, e)
            continue
        if not out:
            continue
        trimmed += 1
        w, h, nw, nh = out
        saved += (w * h - nw * nh)
        if args.apply:
            print("trimmed", os.path.relpath(path, args.root), "%dx%d -> %dx%d" % (w, h, nw, nh))
    print("%s: %d of %d images %s" % (args.root, trimmed, len(files), "trimmed" if args.apply else "would be trimmed"))
    if trimmed and not args.apply:
        print("pixels saved: %d (%.1f%% of the library's image area is padding)" % (saved, 0))


if __name__ == "__main__":
    main()
