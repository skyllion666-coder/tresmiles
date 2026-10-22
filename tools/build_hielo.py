#!/usr/bin/env python3
"""Tramos con hielo o nieve de cada ruta (para que los montañeros se pongan los crampones).
Se mira el color del satélite (data/terrain/hi, ≈10 m/píxel) bajo cada punto del track: muy claro y poco saturado (nieve o hielo; el granito es más cálido) y a más de 2.500 m.
Se guarda en data/rutas/<id>.json la lista «hielo»: [[d0, d1], ...] en metros desde el inicio. Uso: python3 tools/build_hielo.py [id ...]"""
import json, sys, os
from PIL import Image
R = os.path.join(os.path.dirname(__file__), '..', 'data')
M = json.load(open(f'{R}/terrain/meta.json')); CH = M['chunk']; ST = M['step']; PX = 3   # píxeles de satélite por celda del relieve
cache = {}
def tile(i, j):
    if (i, j) not in cache: cache[(i, j)] = Image.open(f'{R}/terrain/hi/c_{i}_{j}.jpg').convert('RGB')
    return cache[(i, j)]
def color(lon, lat, r=2):   # media de un cuadrito de (2r+1)² píxeles
    cx = (lon - M['lon0']) / ST; cy = (M['lat0'] - lat) / ST
    i, j = int(cx // CH), int(cy // CH)
    if not (0 <= i < M['nci'] and 0 <= j < M['ncj']): return None
    im = tile(i, j); px = int((cx - i * CH) * PX); py = int((cy - j * CH) * PX); s = [0, 0, 0]; n = 0
    for dx in range(-r, r + 1):
        for dy in range(-r, r + 1):
            x, y = min(max(px + dx, 0), im.width - 1), min(max(py + dy, 0), im.height - 1); p = im.getpixel((x, y)); n += 1
            for k in range(3): s[k] += p[k]
    return [v / n for v in s]
def hielo(c, ele):
    if c is None or ele < 2500: return False
    r, g, b = c; return (r + g + b) / 3 > 200 and (max(c) - min(c)) / max(c) < 0.15   # muy claro y poco saturado (el granito al sol es más cálido)
def tramos(ruta):
    P = ruta['puntos']; f = [hielo(color(p[0], p[1]), p[2]) for p in P]
    for _ in range(2): f = [sum(f[max(0, i - 2):i + 3]) >= 3 for i in range(len(f))]   # mayoría en una ventana de 5 puntos
    out = []; cur = None
    for i, p in enumerate(P):
        if f[i]:
            if cur is None: cur = [p[3], p[3]]
            else: cur[1] = p[3]
        elif cur is not None:
            out.append(cur)
            cur = None
    if cur: out.append(cur)
    m = []   # junta tramos separados por menos de 120 m y quita los de menos de 60 m
    for t in out:
        if m and t[0] - m[-1][1] < 120: m[-1][1] = t[1]
        else: m.append(t)
    return [t for t in m if t[1] - t[0] >= 60]
if __name__ == '__main__':
    ids = sys.argv[1:] or sorted(f[:-5] for f in os.listdir(f'{R}/rutas') if f.endswith('.json'))
    for id in ids:
        fn = f'{R}/rutas/{id}.json'; r = json.load(open(fn)); t = tramos(r)
        if t: r['hielo'] = [[round(a), round(b)] for a, b in t]
        else: r.pop('hielo', None)
        json.dump(r, open(fn, 'w'), ensure_ascii=False, separators=(',', ':'))   # mismo formato compacto que el resto de rutas
        print(id, round(r['distancia']), 'm', [[round(a), round(b)] for a, b in t])
