#!/usr/bin/env python3
"""Miniaturas redondas (96 px, WebP) de la foto de cada cumbre para el marcador del mapa: img/mini/<id>.webp.
Tresmiles: img/peaks/<foto>.jpg; menores: la ruta de data/menores.json. Uso: python3 tools/build_minis.py"""
import json, os
from PIL import Image
R = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
D = lambda *p: os.path.join(R, *p)
os.makedirs(D('img', 'mini'), exist_ok=True)
P = json.load(open(D('data', 'peaks.json'))); M = json.load(open(D('data', 'menores.json')))
n = 0
def mini(src, dest):
    im = Image.open(src).convert('RGB'); w, h = im.size; s = min(w, h)
    im = im.crop(((w - s) // 2, (h - s) // 3 if h > w else (h - s) // 2, (w - s) // 2 + s, ((h - s) // 3 if h > w else (h - s) // 2) + s)).resize((96, 96), Image.LANCZOS)
    im.save(dest, 'WEBP', quality=55, method=6)
for p in P['picos']:
    if p.get('foto') and os.path.exists(D('img', 'peaks', p['foto'] + '.jpg')): mini(D('img', 'peaks', p['foto'] + '.jpg'), D('img', 'mini', p['id'] + '.webp')); n += 1
for p in M['picos']:
    f = M['fotos'].get(p.get('foto'))
    if f and os.path.exists(D(f['ruta'])): mini(D(f['ruta']), D('img', 'mini', p['id'] + '.webp')); n += 1
print(n, 'miniaturas;', sum(os.path.getsize(D('img', 'mini', f)) for f in os.listdir(D('img', 'mini'))) // 1024, 'KB')
