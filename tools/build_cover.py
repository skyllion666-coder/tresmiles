#!/usr/bin/env python3
"""Cobertura del suelo por bloque a partir de ESA WorldCover 2021 (10 m, CC BY 4.0, © ESA WorldCover / Copernicus Sentinel).

Lee por HTTP solo la ventana del Pirineo aragonés (teselas N42W003 y N42E000), la remuestrea a la rejilla de alturas
(celda ~23×31 m, vecino más cercano) y escribe data/terrain/cover/c_<i>_<j>.bin.gz: 512×512 bytes por bloque, uno por celda
(el relieve de cada bloque tiene 513 muestras; se guardan las 512 primeras).
Clases: 0 sin dato · 1 arbolado · 2 matorral · 3 pradera/humedal · 4 roca o suelo desnudo · 5 nieve y hielo · 6 agua · 7 cultivo o construido · 8 musgo y líquenes
"""
import json, os, gzip
import numpy as np, rasterio
from rasterio.windows import from_bounds
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'terrain')
m = json.load(open(os.path.join(ROOT, 'meta.json')))
lon0, lat0, st, C, R, CH = m['lon0'], m['lat0'], m['step'], m['ncols'], m['nrows'], m['chunk']
lons = lon0 + np.arange(C) * st; lats = lat0 - np.arange(R) * st
MAP = np.zeros(256, 'u1'); 
for k, v in {10: 1, 20: 2, 30: 3, 90: 3, 60: 4, 70: 5, 80: 6, 40: 7, 50: 7, 100: 8}.items(): MAP[k] = v
out = np.zeros((R, C), 'u1')
base = 'https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_%s_Map.tif'
for tile, (a, b) in {'N42W003': (-3, 0), 'N42E000': (0, 3)}.items():
    sel = (lons >= a) & (lons < b)
    if not sel.any(): continue
    with rasterio.open(base % tile) as d:
        l0, l1 = lons[sel].min() - 1e-4, lons[sel].max() + 1e-4
        w = from_bounds(l0, lats.min() - 1e-4, l1, lats.max() + 1e-4, d.transform)
        arr = d.read(1, window=w, boundless=False); tr = d.window_transform(w)
        print(tile, arr.shape)
        cols = np.clip(((lons[sel] - tr.c) / tr.a).astype(int), 0, arr.shape[1] - 1)
        rows = np.clip(((lats - tr.f) / tr.e).astype(int), 0, arr.shape[0] - 1)
        out[:, sel] = MAP[arr[np.ix_(rows, cols)]]
os.makedirs(os.path.join(ROOT, 'cover'), exist_ok=True)
tot = 0
for j in range(m['ncj']):
    for i in range(m['nci']):
        blk = np.zeros((CH, CH), 'u1'); sub = out[j * CH:(j + 1) * CH, i * CH:(i + 1) * CH]; blk[:sub.shape[0], :sub.shape[1]] = sub
        p = os.path.join(ROOT, 'cover', f'c_{i}_{j}.bin.gz'); open(p, 'wb').write(gzip.compress(blk.tobytes(), 9)); tot += os.path.getsize(p)
print('clases %:', {c: round(float((out == c).mean()) * 100, 1) for c in range(9)}, 'total KB', tot // 1024)
