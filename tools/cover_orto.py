#!/usr/bin/env python3
"""Corrige la cobertura (ESA WorldCover, data/terrain/cover/c_i_j.bin.gz) dentro de las piezas con ortofoto del PNOA.
WorldCover (10 m, reducido a la rejilla de 1") marca como «arbolado» mesetas de roca con matorral disperso (p. ej. la Peña de San Miguel), y la web planta
ahí árboles grandes (js/vegetacion.js) y oscurece el suelo. Con la ortofoto de la pieza (~0,4 m/px) se mide en cada celda qué parte es arbolado
(píxeles verde oscuro) y qué parte roca o suelo claro:
  arbolado con mucha roca clara o casi sin copas en la foto → matorral (2) o, si casi todo es claro, roca desnuda (4). Nunca añade arbolado.
Solo toca las celdas cuyo centro cae dentro de alguna de las piezas indicadas; guarda una copia de cada cobertura original en tools/datos/cover_orig/
(la primera vez) y parte siempre de ella, así que se puede repetir. Sube `meta.vcover` para renovar la caché (js/terrain.js pide cover/…?v=).
Sin argumentos usa todas las piezas de cumbres de menos de 3.000 (data/menores.json); con ids, solo esas (y las demás vuelven al original: pasar siempre todas).
Uso: ~/venv-tresmiles/bin/python tools/cover_orto.py [id ...]   (DEPURA=1 guarda /tmp/cover_orto_<id>.png con la clasificación)"""
import gzip, json, math, os, shutil, sys
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
T = lambda *p: os.path.join(ROOT, 'data', 'terrain', *p)
ORIG = os.path.join(ROOT, 'tools', 'datos', 'cover_orig')
meta = json.load(open(T('meta.json'))); idx = json.load(open(T('cumbres', 'index.json')))
NR0 = meta.get('nrows0', meta['nrows']); CH = meta['chunk'] if 'chunk' in meta else 512
latC = meta['lat0'] - ((NR0 - 1) * meta['step']) / 2; mLat = 111132; mLon = 111320 * math.cos(math.radians(latC))
W = (meta['ncols'] - 1) * meta['step'] * mLon; Dd = (NR0 - 1) * meta['step'] * mLat
toXZ = lambda lon, lat: ((lon - meta['lon0']) * mLon - W / 2, (meta['lat0'] - lat) * mLat - Dd / 2)
os.makedirs(ORIG, exist_ok=True)
covers, cambios = {}, {}

def cover(i, j):
    k = (i, j)
    if k not in covers:
        f = T('cover', f'c_{i}_{j}.bin.gz'); o = os.path.join(ORIG, f'c_{i}_{j}.bin.gz')
        if not os.path.exists(o): shutil.copy(f, o)
        covers[k] = np.frombuffer(gzip.open(o).read(), np.uint8).reshape(CH, CH).copy()
    return covers[k]

menores = {p['id'] for p in json.load(open(os.path.join(ROOT, 'data', 'menores.json')))['picos']}
for pid in sys.argv[1:] or [k for k in idx if k in menores]:
    d = idx.get(pid)
    if not d or 'orto' not in d: print(pid, 'sin pieza u ortofoto'); continue
    x0, z0 = d['x0'], d['z0']; lado = (d['n'] - 1) * d['paso']
    im = np.asarray(Image.open(T('cumbres', d['orto'])).convert('RGB'), np.float32); N = im.shape[0]
    R, G, B = im[..., 0], im[..., 1], im[..., 2]; L = 0.3 * R + 0.59 * G + 0.11 * B
    arbol = (L < 65) & (G >= R * 0.95)                            # copa: verde muy oscuro (pino, encina, haya); la foto es de poco contraste
    claro = L > 110                                               # roca o suelo claro
    # celdas de la cobertura cuyo centro está en la pieza
    lon_a, lon_b = meta['lon0'] + (x0 + W / 2) / mLon, meta['lon0'] + (x0 + lado + W / 2) / mLon
    lat_a, lat_b = meta['lat0'] - (z0 + lado + Dd / 2) / mLat, meta['lat0'] - (z0 + Dd / 2) / mLat
    gi0, gi1 = int(math.ceil((lon_a - meta['lon0']) / meta['step'] - 0.5)), int((lon_b - meta['lon0']) / meta['step'] - 0.5)
    gj0, gj1 = int(math.ceil((meta['lat0'] - lat_b) / meta['step'] - 0.5)), int((meta['lat0'] - lat_a) / meta['step'] - 0.5)
    dep = np.zeros((gj1 - gj0 + 1, gi1 - gi0 + 1, 3), np.uint8); n = {}
    for gj in range(gj0, gj1 + 1):
        for gi in range(gi0, gi1 + 1):
            ci, cj = gi // CH, gj // CH; c = cover(ci, cj); cl = int(c[gj % CH, gi % CH])
            # la celda en píxeles de la ortofoto
            xa, za = toXZ(meta['lon0'] + gi * meta['step'], meta['lat0'] - gj * meta['step'])
            xb, zb = toXZ(meta['lon0'] + (gi + 1) * meta['step'], meta['lat0'] - (gj + 1) * meta['step'])
            pa, pb = int(max(0, (xa - x0) / lado * N)), int(min(N, (xb - x0) / lado * N))
            qa, qb = int(max(0, (za - z0) / lado * N)), int(min(N, (zb - z0) / lado * N))
            if pb - pa < 8 or qb - qa < 8: continue
            fa, fc = arbol[qa:qb, pa:pb].mean(), claro[qa:qb, pa:pb].mean()
            nuevo = cl
            # cerca del borde de la pieza el cambio se aplica a salto (más probable hacia dentro) para que no se vea un cuadrado de árboles cortado en seco
            borde = min(xa - x0, x0 + lado - xb, za - z0, z0 + lado - zb)
            if ((gi * 73856093) ^ (gj * 19349663)) % 1000 / 1000 >= min(1, max(0, borde / 350)): continue
            if cl == 1 and (fc > 0.45 or fa < 0.12): nuevo = 4 if fc > 0.65 else 2   # solo quita: sombras y matorral denso se confunden con bosque
            if nuevo != cl: c[gj % CH, gi % CH] = nuevo; cambios[(ci, cj)] = True; n[f'{cl}>{nuevo}'] = n.get(f'{cl}>{nuevo}', 0) + 1
            dep[gj - gj0, gi - gi0] = {1: (30, 90, 40), 2: (150, 150, 60), 3: (120, 200, 90), 4: (220, 210, 190)}.get(nuevo, (60, 60, 160))
    print(pid, 'cambios', n or 'ninguno', flush=True)
    if os.environ.get('DEPURA'): Image.fromarray(dep).resize((dep.shape[1] * 12, dep.shape[0] * 12), Image.NEAREST).save(f'/tmp/cover_orto_{pid}.png')

for (ci, cj) in cambios:
    gzip.open(T('cover', f'c_{ci}_{cj}.bin.gz'), 'wb', 9).write(covers[(ci, cj)].tobytes())
if cambios:
    meta['vcover'] = meta.get('vcover', 1) + 1; json.dump(meta, open(T('meta.json'), 'w'), indent=1)
    print('coberturas reescritas:', sorted(cambios), '· vcover', meta['vcover'])
