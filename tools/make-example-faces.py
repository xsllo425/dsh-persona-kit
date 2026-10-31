"""Draws the 12 original example stickers (plain emoji-style faces, no third-party art). Run: python tools/make-example-faces.py"""
import math, os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), '..', 'examples', 'meme-packs', 'example-faces', 'memes')
S = 256
FACES = [  # (tag, file, skin, mouth, eyes, extras)
    ('happy', 'happy-grin', '#ffd54f', 'grin', 'open', ''),
    ('happy', 'happy-smile', '#ffe082', 'smile', 'open', 'blush'),
    ('shy', 'shy-blush', '#ffccbc', 'smile', 'closed', 'blush'),
    ('shy', 'shy-heart', '#f8bbd0', 'smile', 'heart', 'blush'),
    ('sad', 'sad-tear', '#b3e5fc', 'frown', 'open', 'tear'),
    ('sad', 'sad-down', '#cfd8dc', 'frown', 'open', ''),
    ('angry', 'angry-red', '#ef9a9a', 'frown', 'angry', ''),
    ('angry', 'angry-puff', '#ffab91', 'flat', 'angry', ''),
    ('confused', 'confused-q', '#d1c4e9', 'wavy', 'open', 'question'),
    ('confused', 'confused-sweat', '#c5cae9', 'flat', 'open', 'sweat'),
    ('daily', 'daily-calm', '#c8e6c9', 'smile', 'open', ''),
    ('daily', 'daily-sleepy', '#dcedc8', 'flat', 'closed', 'zzz'),
]

def face(skin, mouth, eyes, extra):
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse((12, 12, S - 12, S - 12), fill=skin, outline='#37474f', width=6)
    cy = 104
    for sx in (-1, 1):
        cx = S // 2 + sx * 46
        if eyes == 'open':
            d.ellipse((cx - 11, cy - 14, cx + 11, cy + 14), fill='#263238')
        elif eyes == 'closed':
            d.arc((cx - 16, cy - 8, cx + 16, cy + 14), 200, 340, fill='#263238', width=6)
        elif eyes == 'heart':
            d.polygon([(cx, cy + 14), (cx - 16, cy - 2), (cx - 8, cy - 14), (cx, cy - 6), (cx + 8, cy - 14), (cx + 16, cy - 2)], fill='#e91e63')
        elif eyes == 'angry':
            d.ellipse((cx - 10, cy - 8, cx + 10, cy + 14), fill='#263238')
            d.line((cx + sx * 18, cy - 26, cx - sx * 16, cy - 12), fill='#263238', width=8)
    my = 168
    if mouth == 'grin':
        d.pieslice((88, my - 30, 168, my + 36), 0, 180, fill='#263238')
    elif mouth == 'smile':
        d.arc((88, my - 30, 168, my + 22), 20, 160, fill='#263238', width=7)
    elif mouth == 'frown':
        d.arc((88, my, 168, my + 52), 200, 340, fill='#263238', width=7)
    elif mouth == 'flat':
        d.line((98, my + 8, 158, my + 8), fill='#263238', width=7)
    elif mouth == 'wavy':
        pts = [(94 + i * 4, my + 8 + 7 * math.sin(i / 2.2)) for i in range(0, 17)]
        d.line(pts, fill='#263238', width=6)
    if extra == 'blush':
        for sx in (-1, 1):
            d.ellipse((S // 2 + sx * 70 - 18, 140, S // 2 + sx * 70 + 18, 162), fill=(244, 143, 177, 150))
    elif extra == 'tear':
        d.ellipse((60, 124, 78, 160), fill='#4fc3f7')
    elif extra == 'question':
        d.text((196, 30), '?', fill='#5e35b1', font_size=72)
    elif extra == 'sweat':
        d.ellipse((196, 52, 214, 88), fill='#4fc3f7')
    elif extra == 'zzz':
        d.text((176, 24), 'z z', fill='#558b2f', font_size=42)
    return im

for tag, name, skin, mouth, eyes, extra in FACES:
    folder = os.path.join(OUT, tag)
    os.makedirs(folder, exist_ok=True)
    face(skin, mouth, eyes, extra).save(os.path.join(folder, name + '.png'))
print('faces:', len(FACES))
