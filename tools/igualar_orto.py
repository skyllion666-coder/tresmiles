#!/usr/bin/env python3
"""Calcula cómo llevar el color de la ortofoto de una pieza de cumbre al del satélite que la rodea (transferencia de media y desviación por canal, en lineal)
y lo guarda en data/terrain/cumbres/index.json (`og`: [media orto, ganancia, media satélite], cada uno RGB). El shader (js/terrain.js, uOA/uOB/uOC) lo aplica.
Uso: python3 tools/igualar_orto.py perdido aneto"""
import json, math, os, sys
import numpy as np
from PIL import Image
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'); D = lambda *p: os.path.join(ROOT, *p)
m = json.load(open(D('data', 'terrain', 'meta.json'))); idx_path = D('data', 'terrain', 'cumbres', 'index.json'); idx = json.load(open(idx_path))
m['nrows'] = m.get('nrows0', m['nrows'])   # el origen del mundo es la rejilla original: el mapa crece hacia el sur (ver js/geo.js y tools/build_terrain_sur.py)
latC = m['lat0'] - ((m['nrows'] - 1) * m['step']) / 2; mLat = 111132; mLon = 111320 * math.cos(math.radians(latC))
W = (m['ncols'] - 1) * m['step'] * mLon; Dd = (m['nrows'] - 1) * m['step'] * mLat
col = lambda x: (x + W / 2) / mLon / m['step']; row = lambda z: (z + Dd / 2) / mLat / m['step']   # columna y fila de celda (1 celda = 1 paso)
lin = lambda a: np.where(a <= .04045, a / 12.92, ((a + .055) / 1.055) ** 2.4)
for pid in sys.argv[1:]:
    d = idx[pid]; x0, z0 = d['x0'], d['z0']; x1 = x0 + (d['n'] - 1) * d['paso']; z1 = z0 + (d['n'] - 1) * d['paso']
    c0, c1, r0, r1 = col(x0), col(x1), row(z0), row(z1)
    ci, rj = int((c0 + c1) / 2 // m['chunk']), int((r0 + r1) / 2 // m['chunk'])   # bloque que contiene el centro
    sat = Image.open(D('data', 'terrain', 'hi', f'c_{ci}_{rj}.jpg')).convert('RGB'); S = sat.size[0] / m['chunk']
    a0, a1 = max(c0, ci * m['chunk']), min(c1, (ci + 1) * m['chunk']); b0, b1 = max(r0, rj * m['chunk']), min(r1, (rj + 1) * m['chunk'])   # parte común (en celdas)
    box = tuple(int(round(v * S)) for v in ((a0 - ci * m['chunk']), (b0 - rj * m['chunk']), (a1 - ci * m['chunk']), (b1 - rj * m['chunk'])))
    sat = sat.crop(box); orto = Image.open(D('data', 'terrain', 'cumbres', d['orto'])).convert('RGB'); O = orto.size[0]
    ob = tuple(int(round(v * O)) for v in ((a0 - c0) / (c1 - c0), (b0 - r0) / (r1 - r0), (a1 - c0) / (c1 - c0), (b1 - r0) / (r1 - r0)))
    orto = orto.crop(ob).resize(sat.size, Image.LANCZOS)
    A = lin(np.asarray(sat, float).reshape(-1, 3) / 255); B = lin(np.asarray(orto, float).reshape(-1, 3) / 255)
    mS, sS, mO, sO = A.mean(0), A.std(0), B.mean(0), B.std(0)
    k = np.clip(sS / sO, .8, 1.12)   # sin pasarse con el contraste (la ortofoto ya trae mucho detalle)
    mT = mO + np.clip(mS - mO, -.10, .10)   # y con el desplazamiento de brillo acotado: si no, zonas oscuras se aclaran hasta parecer nieve y se aplanan
    d['og'] = [[round(float(v), 4) for v in mO], [round(float(v), 4) for v in k], [round(float(v), 4) for v in mT]]
    print(pid, 'bloque', ci, rj, 'sat media', mS.round(3), 'orto media', mO.round(3), 'ganancia', k.round(2))
json.dump(idx, open(idx_path, 'w'), separators=(',', ':'))
